import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import {
  SupplierPayablesRepository,
  type SupplierPayablesRepositoryVisibility
} from './supplier-payables.repository.js';
import {
  createSupplierPayablesError,
  type AllocateSupplierPaymentBody,
  type CreateSupplierInvoiceBody,
  type CreateSupplierPaymentBody,
  type ListSupplierInvoicesQuery,
  type ListSupplierPaymentsQuery,
  type SupplierAgingQuery,
  type SupplierInvoiceLineInput,
  type SupplierPayablesPermissionCode
} from './supplier-payables.schema.js';

const ACTIVE = 'ACTIVE';
const CLOSED = 'CLOSED';
const DRAFT = 'DRAFT';
const POSTED = 'POSTED';
const PO_ISSUED = 'ISSUED';
const GOODS_RECEIPT_RECEIVED = 'RECEIVED';
const ZERO_MONEY = '0.00';
const SUPPLIER_PAYABLE_ACCOUNT_CODE = 'SUPPLIER-PAYABLE';
const INPUT_TAX_ACCOUNT_CODE = 'INPUT-TAX';
const INVENTORY_ASSET_ACCOUNT_CODE = 'INVENTORY-ASSET';
const PROJECT_EXPENSE_ACCOUNT_CODE = 'PROJECT-EXPENSE';
const SUPPLIER_PAYMENT_SEQUENCE_KEY = 'supplier-payment';
const SUPPLIER_PAYMENT_SOURCE_TYPE = 'supplier_payment';
const DAY_IN_MS = 86_400_000;
const MAX_MONEY_MINOR_UNITS = 999_999_999_999_999_999n;

type DecimalLike = string | Readonly<{ toString(): string }>;
type SupplierInvoiceLineRow = Readonly<{
  id: string;
  supplierInvoiceId: string;
  stageId: string | null;
  description: string;
  amount: DecimalLike;
  expenseOrInventoryAccountId: string | null;
}>;
type SupplierInvoiceRow = Readonly<{
  id: string;
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate: Date | null;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  status: string;
  subtotal: DecimalLike;
  taxAmount: DecimalLike;
  totalAmount: DecimalLike;
  lines: readonly SupplierInvoiceLineRow[];
}>;
type SupplierPaymentRow = Readonly<{
  id: string;
  vendorId: string;
  projectId: string | null;
  paymentNo: string;
  paymentDate: Date;
  amount: DecimalLike;
  cashBankAccountId: string;
  reference: string | null;
  status: string;
}>;
type SupplierPaymentAllocationRow = Readonly<{
  id: string;
  supplierPaymentId: string;
  supplierInvoiceId: string;
  amount: DecimalLike;
  allocatedAt: Date;
}>;
type SupplierAgingSourceRow = Readonly<{
  id: string;
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate: Date | null;
  totalAmount: DecimalLike;
  allocations: readonly Readonly<{ amount: DecimalLike; allocatedAt: Date }>[];
}>;
type InvoiceDependencyInput = Readonly<{
  vendorId: string;
  projectId: string;
  purchaseOrderId: string | null;
  goodsReceiptId: string | null;
  lines: readonly Readonly<{
    stageId?: string | null | undefined;
    expenseOrInventoryAccountId?: string | null | undefined;
  }>[];
}>;
type ValidatedInvoiceDependencies = Readonly<{
  directCostCategory: 'subcontract' | 'other';
  lineAccounts: ReadonlyMap<string, Readonly<{ id: string; accountType: string; status: string }>>;
}>;

/** Parse one validated API date-only value for database persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Normalize one lifecycle token before a business comparison. */
function hasStatus(value: string, expected: string): boolean {
  return value.trim().toUpperCase() === expected;
}

/** Convert exact two-decimal money text to integer minor units without floating-point arithmetic. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const text = value.toString();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minorUnits = (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -minorUnits : minorUnits;
}

/** Serialize integer minor units to the exact two-decimal storage/API form. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const unsigned = negative ? -value : value;
  const serialized = `${unsigned / 100n}.${(unsigned % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${serialized}` : serialized;
}

/** Serialize one stored money value with exactly two decimal places. */
function moneyString(value: DecimalLike): string {
  return minorUnitsToMoney(moneyToMinorUnits(value));
}

/** Reject calculated Supplier Invoice totals that exceed the database DECIMAL(18,2) range. */
function assertMoneyRange(value: bigint): void {
  if (value < 0n || value > MAX_MONEY_MINOR_UNITS) {
    throw new ValidationError({ message: 'Calculated Supplier Invoice amount is outside the supported range.' });
  }
}

/** Calculate trusted Supplier Invoice subtotal and total from validated lines and tax. */
function calculateInvoiceTotals(lines: readonly SupplierInvoiceLineInput[], taxAmount: string) {
  const subtotalMinorUnits = lines.reduce((total, line) => total + moneyToMinorUnits(line.amount), 0n);
  const taxMinorUnits = moneyToMinorUnits(taxAmount);
  const totalMinorUnits = subtotalMinorUnits + taxMinorUnits;
  assertMoneyRange(subtotalMinorUnits);
  assertMoneyRange(taxMinorUnits);
  assertMoneyRange(totalMinorUnits);
  return {
    subtotal: minorUnitsToMoney(subtotalMinorUnits),
    taxAmount: minorUnitsToMoney(taxMinorUnits),
    totalAmount: minorUnitsToMoney(totalMinorUnits)
  };
}

/** Build one deterministic bounded page window from validated query input. */
function pageWindow(query: Readonly<{ page?: number | undefined; pageSize?: number | undefined }>) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 50;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Serialize one Supplier Invoice and its lines without exposing Company authority. */
function supplierInvoiceResponse(row: SupplierInvoiceRow) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    projectId: row.projectId,
    invoiceNo: row.invoiceNo,
    invoiceDate: dateOnly(row.invoiceDate),
    dueDate: row.dueDate ? dateOnly(row.dueDate) : null,
    purchaseOrderId: row.purchaseOrderId,
    goodsReceiptId: row.goodsReceiptId,
    status: row.status,
    subtotal: moneyString(row.subtotal),
    taxAmount: moneyString(row.taxAmount),
    totalAmount: moneyString(row.totalAmount),
    lines: row.lines.map((line) => ({
      id: line.id,
      supplierInvoiceId: line.supplierInvoiceId,
      stageId: line.stageId,
      description: line.description,
      amount: moneyString(line.amount),
      expenseOrInventoryAccountId: line.expenseOrInventoryAccountId
    }))
  };
}

/** Serialize one Supplier Payment without exposing Company authority or derived allocation balances. */
function supplierPaymentResponse(row: SupplierPaymentRow) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    projectId: row.projectId,
    paymentNo: row.paymentNo,
    paymentDate: dateOnly(row.paymentDate),
    amount: moneyString(row.amount),
    cashBankAccountId: row.cashBankAccountId,
    reference: row.reference,
    status: row.status
  };
}

/** Serialize one immutable Supplier Payment allocation row. */
function supplierPaymentAllocationResponse(row: SupplierPaymentAllocationRow) {
  return {
    id: row.id,
    supplierPaymentId: row.supplierPaymentId,
    supplierInvoiceId: row.supplierInvoiceId,
    amount: moneyString(row.amount),
    allocatedAt: row.allocatedAt.toISOString()
  };
}

/** Convert a validated date-only value to the inclusive UTC end of that business date. */
function endOfInputDate(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

/** Calculate deterministic non-negative days past due using due date, or invoice date when no due date exists. */
function supplierInvoiceAgeDays(asOfDate: Date, invoiceDate: Date, dueDate: Date | null): number {
  const basis = dueDate ?? invoiceDate;
  return Math.max(0, Math.floor((asOfDate.getTime() - basis.getTime()) / DAY_IN_MS));
}

/** Return the stable Finance source key for one posted Supplier Payment. */
function supplierPaymentFinanceSourceKey(paymentId: string): string {
  return `supplier_payment:${paymentId}`;
}

/** Return the stable Finance source key for one posted Supplier Invoice. */
function supplierInvoiceFinanceSourceKey(invoiceId: string): string {
  return `supplier_invoice:${invoiceId}`;
}

/** Return the stable Project Cost source key for one direct Supplier Invoice line. */
function supplierInvoiceCostSourceKey(invoiceId: string, lineId: string): string {
  return `supplier_invoice:${invoiceId}:line:${lineId}`;
}

/** Recognize a Prisma-style unique constraint failure without leaking database details. */
function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 'P2002';
}

/** Final Module 17 Supplier Invoice, Payment, allocation and aging business logic. */
export class SupplierPayablesService {
  /** Bind Supplier Payables behavior to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Return whether the actor has one persisted Company-level Supplier Payables permission. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: SupplierPayablesPermissionCode, asOf: Date): Promise<boolean> {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Resolve Projects visible for one Supplier Payables permission. */
  private async resolveVisibility(repository: AdministrationRepository, permission: SupplierPayablesPermissionCode, asOf: Date): Promise<SupplierPayablesRepositoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    const candidates = security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null;
    if (await this.hasCompanyPermission(repository, permission, asOf)) return { allowedProjectIds: candidates };
    const projectIds = await repository.listProjectIdsWithPermission(permission, candidates, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (projectIds.length === 0) throw new AuthorizationError();
    return { allowedProjectIds: projectIds };
  }

  /** Require one Supplier Payables permission for a Project inside authenticated scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: SupplierPayablesPermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    if (await this.hasCompanyPermission(repository, permission, asOf)) return;
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ACTIVE],
      roleStatuses: [ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** Validate Vendor, Project, Procurement, Stage and line-account ownership for one Supplier Invoice. */
  private async validateInvoiceDependencies(
    repository: SupplierPayablesRepository,
    visibility: SupplierPayablesRepositoryVisibility,
    input: InvoiceDependencyInput,
    requireLineAccounts: boolean
  ): Promise<ValidatedInvoiceDependencies> {
    const vendor = await repository.findVendorById(input.vendorId);
    if (!vendor || !hasStatus(vendor.status, ACTIVE)) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');

    const project = await repository.findProjectById(input.projectId, visibility);
    if (!project || hasStatus(project.status, CLOSED)) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
    if (vendor.currency && vendor.currency !== project.currency) {
      throw new ValidationError({ message: 'Supplier Invoice Vendor currency must match the Project currency.' });
    }

    let purchaseOrder = null;
    if (input.purchaseOrderId) {
      purchaseOrder = await repository.findPurchaseOrderById(input.purchaseOrderId, input.projectId, input.vendorId, visibility);
      if (!purchaseOrder || !hasStatus(purchaseOrder.status, PO_ISSUED) || purchaseOrder.currency !== project.currency) {
        throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
      }
    }

    if (input.goodsReceiptId) {
      const goodsReceipt = await repository.findGoodsReceiptById(input.goodsReceiptId, input.projectId, input.vendorId, visibility);
      if (!goodsReceipt || !hasStatus(goodsReceipt.status, GOODS_RECEIPT_RECEIVED)) {
        throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
      }
      if (purchaseOrder && goodsReceipt.purchaseOrderId !== purchaseOrder.id) {
        throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
      }
    }

    const stageIds = [...new Set(input.lines.map((line) => line.stageId).filter((value): value is string => Boolean(value)))];
    for (const stageId of stageIds) {
      const stage = await repository.findStageById(input.projectId, stageId, visibility);
      if (!stage) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
    }

    const accountIds = [...new Set(input.lines.map((line) => line.expenseOrInventoryAccountId).filter((value): value is string => Boolean(value)))];
    const lineAccounts = new Map<string, Readonly<{ id: string; accountType: string; status: string }>>();
    for (const accountId of accountIds) {
      const account = await repository.findGlAccountById(accountId);
      if (!account || !hasStatus(account.status, ACTIVE) || !['EXPENSE', 'ASSET'].includes(account.accountType.toUpperCase())) {
        throw new ValidationError({ message: 'Supplier Invoice line account must be an active same-Company expense or inventory/asset account.' });
      }
      lineAccounts.set(account.id, account);
    }
    if (requireLineAccounts && input.lines.some((line) => !line.expenseOrInventoryAccountId)) {
      throw new ValidationError({ message: 'Every Supplier Invoice line requires an expense or inventory account before posting.' });
    }

    const subcontractor = await repository.findActiveSubcontractorByVendorId(input.vendorId);
    return { directCostCategory: subcontractor ? 'subcontract' : 'other', lineAccounts };
  }

  /** Read one Vendor payable summary from posted invoices and posted-payment allocations the actor may see. */
  async getVendorPayableSummary(vendorId: string) {
    const now = new Date();
    const visibility = await this.resolveVisibility(
      new AdministrationRepository(this.db),
      'supplier_payables.read',
      now
    );
    const summary = await new SupplierPayablesRepository(this.db).getVendorPayableSummary(vendorId, visibility);
    const postedInvoiceMinorUnits = moneyToMinorUnits(summary.postedInvoiceTotal ?? ZERO_MONEY);
    const allocatedPaymentMinorUnits = moneyToMinorUnits(summary.allocatedPaymentTotal ?? ZERO_MONEY);
    const outstandingMinorUnits = postedInvoiceMinorUnits > allocatedPaymentMinorUnits
      ? postedInvoiceMinorUnits - allocatedPaymentMinorUnits
      : 0n;

    return {
      postedInvoiceCount: summary.postedInvoiceCount,
      postedInvoiceTotal: minorUnitsToMoney(postedInvoiceMinorUnits),
      allocatedPaymentTotal: minorUnitsToMoney(allocatedPaymentMinorUnits),
      outstandingAmount: minorUnitsToMoney(outstandingMinorUnits)
    };
  }

  /** Read one bounded permission-scoped Supplier Invoice register. */
  async listSupplierInvoices(query: ListSupplierInvoicesQuery) {
    const now = new Date();
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'supplier_payables.read', now);
    const page = pageWindow(query);
    const result = await new SupplierPayablesRepository(this.db).listSupplierInvoices({
      ...page,
      allowedProjectIds: visibility.allowedProjectIds,
      vendorId: query.vendorId,
      projectId: query.projectId,
      purchaseOrderId: query.purchaseOrderId,
      goodsReceiptId: query.goodsReceiptId,
      status: query.status,
      fromDate: query.fromDate ? inputDate(query.fromDate) : undefined,
      toDate: query.toDate ? inputDate(query.toDate) : undefined,
      dueBefore: query.dueBefore ? inputDate(query.dueBefore) : undefined
    });
    return { items: result.items.map((item) => supplierInvoiceResponse(item)), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Read one Supplier Invoice inside authenticated Company/Project scope. */
  async getSupplierInvoice(invoiceId: string) {
    const now = new Date();
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'supplier_payables.read', now);
    const invoice = await new SupplierPayablesRepository(this.db).findSupplierInvoiceById(invoiceId, visibility);
    if (!invoice) throw createSupplierPayablesError('SUPPLIER_INVOICE_NOT_FOUND');
    await this.requireProjectPermission(new AdministrationRepository(this.db), invoice.projectId, 'supplier_payables.read', now);
    return supplierInvoiceResponse(invoice);
  }

  /** Create one retry-safe DRAFT Supplier Invoice with server-calculated totals. */
  async createSupplierInvoice(input: CreateSupplierInvoiceBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(this.db, {
        operation: 'supplier-payables.invoices.create',
        idempotencyKey,
        fingerprintInput: input
      }, async (tx) => this.createSupplierInvoiceOnce(tx, input));
      return result.response.body;
    } catch (error) {
      if (isUniqueConstraintError(error)) throw createSupplierPayablesError('DUPLICATE_SUPPLIER_INVOICE');
      throw error;
    }
  }

  /** Validate dependencies, calculate totals and persist one DRAFT Supplier Invoice atomically. */
  private async createSupplierInvoiceOnce(tx: TransactionClient, input: CreateSupplierInvoiceBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'supplier_invoices.create', now);
    await this.requireProjectPermission(users, input.projectId, 'supplier_invoices.create', now);
    const repository = new SupplierPayablesRepository(tx);

    const duplicate = await repository.findSupplierInvoiceByVendorInvoiceNo(input.vendorId, input.invoiceNo.trim());
    if (duplicate) throw createSupplierPayablesError('DUPLICATE_SUPPLIER_INVOICE');
    await repository.ensureSupplierInvoiceAccounts();
    const defaultAccountCode = input.purchaseOrderId || input.goodsReceiptId
      ? INVENTORY_ASSET_ACCOUNT_CODE
      : PROJECT_EXPENSE_ACCOUNT_CODE;
    const defaultAccount = await repository.findGlAccountByCode(defaultAccountCode);
    if (!defaultAccount) throw new ValidationError({ message: 'Supplier Invoice posting account could not be prepared.' });
    const invoiceLines = input.lines.map((line) => ({
      ...line,
      expenseOrInventoryAccountId: line.expenseOrInventoryAccountId ?? defaultAccount.id
    }));
    await this.validateInvoiceDependencies(repository, visibility, {
      vendorId: input.vendorId,
      projectId: input.projectId,
      purchaseOrderId: input.purchaseOrderId ?? null,
      goodsReceiptId: input.goodsReceiptId ?? null,
      lines: invoiceLines
    }, false);

    const totals = calculateInvoiceTotals(invoiceLines, input.taxAmount);
    const created = await repository.createDraftSupplierInvoice({
      allowedProjectIds: visibility.allowedProjectIds,
      vendorId: input.vendorId,
      projectId: input.projectId,
      invoiceNo: input.invoiceNo.trim(),
      invoiceDate: inputDate(input.invoiceDate),
      dueDate: input.dueDate ? inputDate(input.dueDate) : null,
      purchaseOrderId: input.purchaseOrderId ?? null,
      goodsReceiptId: input.goodsReceiptId ?? null,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.totalAmount,
      lines: invoiceLines
    });
    if (!created) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
    const response = supplierInvoiceResponse(created);
    await recordAudit(tx, {
      action: 'supplier_invoice.created',
      entityType: 'supplier_invoice',
      entityId: created.id,
      projectId: created.projectId,
      after: response
    });
    return { statusCode: 201, body: response };
  }

  /** Post one DRAFT Supplier Invoice atomically to Finance/AP and policy-approved direct Project Cost. */
  async postSupplierInvoice(invoiceId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'supplier-payables.invoices.post',
      idempotencyKey,
      fingerprintInput: { invoiceId }
    }, async (tx) => this.postSupplierInvoiceOnce(tx, invoiceId));
    return result.response.body;
  }

  /** Create AP Finance posting and only non-Procurement direct-cost sources before marking the invoice POSTED. */
  private async postSupplierInvoiceOnce(tx: TransactionClient, invoiceId: string) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'supplier_invoices.post', now);
    const repository = new SupplierPayablesRepository(tx);
    const locked = await repository.lockSupplierInvoiceForWrite(invoiceId, visibility);
    if (!locked) throw createSupplierPayablesError('SUPPLIER_INVOICE_NOT_FOUND');
    if (hasStatus(locked.status, POSTED)) {
      const existing = await repository.findSupplierInvoiceById(invoiceId, visibility);
      if (!existing) throw createSupplierPayablesError('SUPPLIER_INVOICE_NOT_FOUND');
      return { statusCode: 200, body: supplierInvoiceResponse(existing) };
    }
    if (!hasStatus(locked.status, DRAFT)) throw new ConflictError({ message: 'Only DRAFT Supplier Invoices can be posted.' });

    await this.requireProjectPermission(users, locked.projectId, 'supplier_invoices.post', now);
    const directVisibility: SupplierPayablesRepositoryVisibility = { allowedProjectIds: [locked.projectId] };
    const invoice = await repository.findSupplierInvoiceById(invoiceId, directVisibility);
    if (!invoice) throw createSupplierPayablesError('SUPPLIER_INVOICE_NOT_FOUND');
    const dependencies = await this.validateInvoiceDependencies(repository, directVisibility, {
      vendorId: invoice.vendorId,
      projectId: invoice.projectId,
      purchaseOrderId: invoice.purchaseOrderId,
      goodsReceiptId: invoice.goodsReceiptId,
      lines: invoice.lines
    }, true);

    const recalculated = calculateInvoiceTotals(
      invoice.lines.map((line) => ({
        stageId: line.stageId,
        description: line.description,
        amount: moneyString(line.amount),
        expenseOrInventoryAccountId: line.expenseOrInventoryAccountId
      })),
      moneyString(invoice.taxAmount)
    );
    if (recalculated.subtotal !== moneyString(invoice.subtotal) || recalculated.totalAmount !== moneyString(invoice.totalAmount)) {
      throw new ConflictError({ message: 'Stored Supplier Invoice totals no longer reconcile to its immutable line values.' });
    }

    const payable = await repository.findGlAccountByCode(SUPPLIER_PAYABLE_ACCOUNT_CODE);
    if (!payable || !hasStatus(payable.status, ACTIVE) || payable.accountType.toUpperCase() !== 'LIABILITY') {
      throw new ValidationError({ message: `Configure active liability account ${SUPPLIER_PAYABLE_ACCOUNT_CODE} before posting Supplier Invoices.` });
    }

    const journalLines = invoice.lines.map((line) => {
      const accountId = line.expenseOrInventoryAccountId;
      if (!accountId || !dependencies.lineAccounts.has(accountId)) {
        throw new ValidationError({ message: 'Supplier Invoice line account is unavailable for posting.' });
      }
      return {
        accountId,
        projectId: invoice.projectId,
        stageId: line.stageId,
        debit: moneyString(line.amount),
        credit: ZERO_MONEY,
        description: `Supplier invoice ${invoice.invoiceNo}: ${line.description}`
      };
    });

    if (moneyToMinorUnits(invoice.taxAmount) > 0n) {
      const inputTax = await repository.findGlAccountByCode(INPUT_TAX_ACCOUNT_CODE);
      if (!inputTax || !hasStatus(inputTax.status, ACTIVE) || inputTax.accountType.toUpperCase() !== 'ASSET') {
        throw new ValidationError({ message: `Configure active asset account ${INPUT_TAX_ACCOUNT_CODE} before posting Supplier Invoice tax.` });
      }
      journalLines.push({
        accountId: inputTax.id,
        projectId: invoice.projectId,
        stageId: null,
        debit: moneyString(invoice.taxAmount),
        credit: ZERO_MONEY,
        description: `Input tax on supplier invoice ${invoice.invoiceNo}`
      });
    }
    journalLines.push({
      accountId: payable.id,
      projectId: invoice.projectId,
      stageId: null,
      debit: ZERO_MONEY,
      credit: moneyString(invoice.totalAmount),
      description: `Supplier payable ${invoice.invoiceNo}`
    });

    const financeSourceKey = supplierInvoiceFinanceSourceKey(invoice.id);
    const existingJournal = await new FinanceRepository(tx).findJournalBySourceKey(financeSourceKey);
    if (existingJournal && (
      existingJournal.sourceType !== 'supplier_invoice'
      || existingJournal.sourceId !== invoice.id
      || moneyString(existingJournal.totalDebit) !== moneyString(invoice.totalAmount)
      || moneyString(existingJournal.totalCredit) !== moneyString(invoice.totalAmount)
    )) {
      throw new ConflictError({ message: 'Supplier Invoice Finance source key is already owned by different posting data.' });
    }
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'supplier_invoice',
      sourceId: invoice.id,
      sourceKey: financeSourceKey,
      postingDate: invoice.invoiceDate,
      description: `Supplier invoice ${invoice.invoiceNo}`,
      lines: journalLines
    });

    const projectCostSourceKeys: string[] = [];
    const procurementOwnedCost = Boolean(invoice.purchaseOrderId || invoice.goodsReceiptId);
    if (!procurementOwnedCost) {
      for (const line of invoice.lines) {
        const accountId = line.expenseOrInventoryAccountId;
        const account = accountId ? dependencies.lineAccounts.get(accountId) : null;
        if (!account || account.accountType.toUpperCase() !== 'EXPENSE') continue;
        const sourceKey = supplierInvoiceCostSourceKey(invoice.id, line.id);
        const actual = await repository.upsertSupplierInvoiceCostActual({
          projectId: invoice.projectId,
          stageId: line.stageId,
          category: dependencies.directCostCategory,
          sourceId: line.id,
          sourceKey,
          postingDate: invoice.invoiceDate,
          amount: moneyString(line.amount)
        });
        if (actual.projectId !== invoice.projectId
          || actual.stageId !== line.stageId
          || actual.sourceType !== 'supplier_invoice'
          || actual.sourceId !== line.id
          || actual.category !== dependencies.directCostCategory
          || moneyString(actual.amount) !== moneyString(line.amount)) {
          throw new ConflictError({ message: 'Supplier Invoice Project Cost source key is already owned by different posting data.' });
        }
        projectCostSourceKeys.push(sourceKey);
      }
    }

    const posted = await repository.markSupplierInvoicePosted(invoice.id, directVisibility);
    if (!posted) throw new ConflictError({ message: 'Supplier Invoice state changed before posting completed.' });
    const response = supplierInvoiceResponse(posted);
    await recordAudit(tx, {
      action: 'supplier_invoice.posted',
      entityType: 'supplier_invoice',
      entityId: invoice.id,
      projectId: invoice.projectId,
      before: { status: DRAFT },
      after: {
        status: POSTED,
        financeSourceKey,
        projectCostPolicy: procurementOwnedCost ? 'operational-source-owned' : 'direct-expense-lines',
        projectCostSourceKeys
      }
    });
    await recordOutboxEvent(tx, {
      eventType: 'supplier_invoice.posted',
      resourceType: 'supplier_invoice',
      resourceId: invoice.id,
      payload: {
        supplierInvoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        vendorId: invoice.vendorId,
        projectId: invoice.projectId,
        totalAmount: moneyString(invoice.totalAmount),
        financeSourceKey,
        projectCostSourceKeys
      }
    });
    return { statusCode: 200, body: response };
  }

  /** Read one bounded permission-scoped Supplier Payment register. */
  async listSupplierPayments(query: ListSupplierPaymentsQuery) {
    const now = new Date();
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'supplier_payables.read', now);
    const page = pageWindow(query);
    const result = await new SupplierPayablesRepository(this.db).listSupplierPayments({
      ...page,
      allowedProjectIds: visibility.allowedProjectIds,
      vendorId: query.vendorId,
      projectId: query.projectId,
      status: query.status,
      fromDate: query.fromDate ? inputDate(query.fromDate) : undefined,
      toDate: query.toDate ? inputDate(query.toDate) : undefined
    });
    return {
      items: result.items.map((item) => supplierPaymentResponse(item)),
      total: result.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /** Create and post one Supplier Payment atomically because the Final-21 route contract has no separate payment-post command. */
  async createSupplierPayment(input: CreateSupplierPaymentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'supplier-payables.payments.create',
      idempotencyKey,
      fingerprintInput: input
    }, async (tx) => this.createSupplierPaymentOnce(tx, input));
    return result.response.body;
  }

  /** Validate payment scope, allocate its Company number, post Finance and persist POSTED payment state in one transaction. */
  private async createSupplierPaymentOnce(tx: TransactionClient, input: CreateSupplierPaymentBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'supplier_payments.create', now);
    if (input.projectId) {
      await this.requireProjectPermission(users, input.projectId, 'supplier_payments.create', now);
    } else if (!(await this.hasCompanyPermission(users, 'supplier_payments.create', now))) {
      throw new AuthorizationError();
    }

    const repository = new SupplierPayablesRepository(tx);
    const vendor = await repository.findVendorById(input.vendorId);
    if (!vendor) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
    if (input.projectId) {
      const project = await repository.findProjectById(input.projectId, visibility);
      if (!project || hasStatus(project.status, CLOSED)) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');
    }

    const cashBank = await repository.findCashBankAccountById(input.cashBankAccountId);
    if (!cashBank
      || !hasStatus(cashBank.status, ACTIVE)
      || !['CASH', 'BANK'].includes(cashBank.accountType.trim().toUpperCase())
      || cashBank.glAccount.accountType.trim().toUpperCase() !== cashBank.accountType.trim().toUpperCase()
      || !hasStatus(cashBank.glAccount.status, ACTIVE)) {
      throw new ValidationError({ message: 'Supplier Payment requires an active same-Company Cash/Bank account.' });
    }
    const payable = await repository.findGlAccountByCode(SUPPLIER_PAYABLE_ACCOUNT_CODE);
    if (!payable || !hasStatus(payable.status, ACTIVE) || payable.accountType.toUpperCase() !== 'LIABILITY') {
      throw new ValidationError({ message: `Configure active liability account ${SUPPLIER_PAYABLE_ACCOUNT_CODE} before posting Supplier Payments.` });
    }

    const number = await allocateCompanyNumber(tx, { sequenceKey: SUPPLIER_PAYMENT_SEQUENCE_KEY });
    const created = await repository.createSupplierPayment({
      allowedProjectIds: visibility.allowedProjectIds,
      vendorId: input.vendorId,
      projectId: input.projectId ?? null,
      paymentNo: number.formatted,
      paymentDate: inputDate(input.paymentDate),
      amount: moneyString(input.amount),
      cashBankAccountId: input.cashBankAccountId,
      reference: input.reference?.trim() ?? null,
      status: DRAFT
    });
    if (!created) throw createSupplierPayablesError('SUPPLIER_SCOPE_MISMATCH');

    const sourceKey = supplierPaymentFinanceSourceKey(created.id);
    const amount = moneyString(created.amount);
    const existingJournal = await new FinanceRepository(tx).findJournalBySourceKey(sourceKey);
    if (existingJournal && (
      existingJournal.sourceType !== SUPPLIER_PAYMENT_SOURCE_TYPE
      || existingJournal.sourceId !== created.id
      || moneyString(existingJournal.totalDebit) !== amount
      || moneyString(existingJournal.totalCredit) !== amount
    )) {
      throw new ConflictError({ message: 'Supplier Payment Finance source key is already owned by different posting data.' });
    }
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: SUPPLIER_PAYMENT_SOURCE_TYPE,
      sourceId: created.id,
      sourceKey,
      postingDate: created.paymentDate,
      description: `Supplier payment ${created.paymentNo}`,
      lines: [
        {
          accountId: payable.id,
          projectId: created.projectId,
          stageId: null,
          debit: amount,
          credit: ZERO_MONEY,
          description: `Supplier payable payment ${created.paymentNo}`
        },
        {
          accountId: cashBank.glAccount.id,
          projectId: created.projectId,
          stageId: null,
          debit: ZERO_MONEY,
          credit: amount,
          description: `Cash/Bank settlement ${created.paymentNo}`
        }
      ]
    });

    const posted = await repository.markSupplierPaymentPosted(created.id, { allowedProjectIds: visibility.allowedProjectIds });
    if (!posted) throw new ConflictError({ message: 'Supplier Payment state changed before posting completed.' });
    const response = supplierPaymentResponse(posted);
    await recordAudit(tx, {
      action: 'supplier_payment.posted',
      entityType: 'supplier_payment',
      entityId: posted.id,
      projectId: posted.projectId,
      after: { ...response, financeSourceKey: sourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'supplier_payment.posted',
      resourceType: 'supplier_payment',
      resourceId: posted.id,
      payload: {
        supplierPaymentId: posted.id,
        paymentNo: posted.paymentNo,
        vendorId: posted.vendorId,
        projectId: posted.projectId,
        amount,
        financeSourceKey: sourceKey
      }
    });
    return { statusCode: 201, body: response };
  }

  /** Allocate one POSTED Supplier Payment to POSTED same-Vendor invoices without mutating prior allocation history. */
  async allocateSupplierPayment(paymentId: string, input: AllocateSupplierPaymentBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'supplier-payables.payments.allocate',
      idempotencyKey,
      fingerprintInput: { paymentId, ...input }
    }, async (tx) => this.allocateSupplierPaymentOnce(tx, paymentId, input));
    return result.response.body;
  }

  /** Lock payment and invoices, derive both remaining sides, validate scope, then append allocation rows atomically. */
  private async allocateSupplierPaymentOnce(tx: TransactionClient, paymentId: string, input: AllocateSupplierPaymentBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'supplier_payments.allocate', now);
    const repository = new SupplierPayablesRepository(tx);
    const payment = await repository.lockSupplierPaymentForWrite(paymentId, visibility);
    if (!payment || !hasStatus(payment.status, POSTED)) throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
    if (payment.projectId) {
      await this.requireProjectPermission(users, payment.projectId, 'supplier_payments.allocate', now);
    } else if (!(await this.hasCompanyPermission(users, 'supplier_payments.allocate', now))) {
      throw new AuthorizationError();
    }

    const invoiceIds = [...new Set(input.allocations.map((allocation) => allocation.supplierInvoiceId))].sort();
    if (invoiceIds.length !== input.allocations.length) throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
    const lockedInvoices = new Map<string, Awaited<ReturnType<SupplierPayablesRepository['lockSupplierInvoiceForWrite']>>>();
    for (const invoiceId of invoiceIds) {
      const invoice = await repository.lockSupplierInvoiceForWrite(invoiceId, visibility);
      if (!invoice
        || !hasStatus(invoice.status, POSTED)
        || invoice.vendorId !== payment.vendorId
        || (payment.projectId !== null && invoice.projectId !== payment.projectId)) {
        throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
      }
      await this.requireProjectPermission(users, invoice.projectId, 'supplier_payments.allocate', now);
      lockedInvoices.set(invoiceId, invoice);
    }

    const alreadyAllocatedPayment = moneyToMinorUnits(await repository.sumAllocatedAmountForSupplierPayment(paymentId) ?? ZERO_MONEY);
    const requestedPayment = input.allocations.reduce((sum, allocation) => sum + moneyToMinorUnits(allocation.amount), 0n);
    const paymentAmount = moneyToMinorUnits(payment.amount);
    if (alreadyAllocatedPayment + requestedPayment > paymentAmount) {
      throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
    }

    for (const allocation of input.allocations) {
      const invoice = lockedInvoices.get(allocation.supplierInvoiceId);
      if (!invoice) throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
      const alreadyAllocatedInvoice = moneyToMinorUnits(await repository.sumAllocatedAmountForSupplierInvoice(invoice.id) ?? ZERO_MONEY);
      const requestedInvoice = moneyToMinorUnits(allocation.amount);
      if (alreadyAllocatedInvoice + requestedInvoice > moneyToMinorUnits(invoice.totalAmount)) {
        throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
      }
    }

    const allocatedAt = new Date();
    const created = await repository.createSupplierPaymentAllocations(paymentId, input.allocations, allocatedAt, visibility);
    if (created.length !== input.allocations.length) throw createSupplierPayablesError('PAYMENT_ALLOCATION_INVALID');
    const response = created.map((row) => supplierPaymentAllocationResponse(row));
    const remainingPayment = minorUnitsToMoney(paymentAmount - alreadyAllocatedPayment - requestedPayment);
    await recordAudit(tx, {
      action: 'supplier_payment.allocated',
      entityType: 'supplier_payment',
      entityId: payment.id,
      projectId: payment.projectId,
      after: { allocationIds: response.map((row) => row.id), allocations: response, remainingPayment }
    });
    await recordOutboxEvent(tx, {
      eventType: 'supplier_payment.allocated',
      resourceType: 'supplier_payment',
      resourceId: payment.id,
      payload: {
        supplierPaymentId: payment.id,
        paymentNo: payment.paymentNo,
        vendorId: payment.vendorId,
        projectId: payment.projectId,
        allocations: response.map((row) => ({ supplierInvoiceId: row.supplierInvoiceId, amount: row.amount })),
        remainingPayment
      }
    });
    return { statusCode: 201, body: response };
  }

  /** Return bounded Supplier aging derived only from POSTED invoices and immutable allocations as of one business date. */
  async getSupplierAging(query: SupplierAgingQuery) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    const visibility = await this.resolveVisibility(users, 'supplier_payables.read', now);
    if (query.projectId) await this.requireProjectPermission(users, query.projectId, 'supplier_payables.read', now);
    const page = pageWindow(query);
    const asOfDateText = query.asOfDate ?? dateOnly(now);
    const asOfDate = inputDate(asOfDateText);
    const result = await new SupplierPayablesRepository(this.db).listSupplierAgingSources({
      ...page,
      allowedProjectIds: visibility.allowedProjectIds,
      vendorId: query.vendorId,
      projectId: query.projectId,
      invoiceDateThrough: asOfDate,
      allocatedThrough: endOfInputDate(asOfDateText)
    });

    return {
      items: result.items.map((invoice: SupplierAgingSourceRow) => {
        const allocatedMinorUnits = invoice.allocations.reduce((sum, allocation) => sum + moneyToMinorUnits(allocation.amount), 0n);
        const totalMinorUnits = moneyToMinorUnits(invoice.totalAmount);
        const outstandingMinorUnits = totalMinorUnits > allocatedMinorUnits ? totalMinorUnits - allocatedMinorUnits : 0n;
        return {
          supplierInvoiceId: invoice.id,
          vendorId: invoice.vendorId,
          projectId: invoice.projectId,
          invoiceNo: invoice.invoiceNo,
          invoiceDate: dateOnly(invoice.invoiceDate),
          dueDate: invoice.dueDate ? dateOnly(invoice.dueDate) : null,
          totalAmount: minorUnitsToMoney(totalMinorUnits),
          allocatedAmount: minorUnitsToMoney(allocatedMinorUnits),
          outstandingAmount: minorUnitsToMoney(outstandingMinorUnits),
          ageDays: supplierInvoiceAgeDays(asOfDate, invoice.invoiceDate, invoice.dueDate)
        };
      }),
      total: result.total,
      page: page.page,
      pageSize: page.pageSize,
      asOfDate: asOfDateText
    };
  }
}
