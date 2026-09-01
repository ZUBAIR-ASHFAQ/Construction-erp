import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import {
  SUPPLIER_PAYABLES_MAX_PAGE_SIZE,
  type SupplierInvoiceLineInput,
  type SupplierInvoiceStatus,
  type SupplierPaymentStatus
} from './supplier-payables.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type SupplierPayablesRepositoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
}>;

export type SupplierPayablesRepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListSupplierInvoicesRepositoryInput = SupplierPayablesRepositoryPageWindow
  & SupplierPayablesRepositoryVisibility
  & Readonly<{
    vendorId?: string | undefined;
    projectId?: string | undefined;
    purchaseOrderId?: string | undefined;
    goodsReceiptId?: string | undefined;
    status?: SupplierInvoiceStatus | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
    dueBefore?: Date | undefined;
  }>;

export type CreateDraftSupplierInvoiceRepositoryInput = SupplierPayablesRepositoryVisibility & Readonly<{
  vendorId: string;
  projectId: string;
  invoiceNo: string;
  invoiceDate: Date;
  dueDate?: Date | null;
  purchaseOrderId?: string | null;
  goodsReceiptId?: string | null;
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  lines: readonly SupplierInvoiceLineInput[];
}>;

export type ListSupplierPaymentsRepositoryInput = SupplierPayablesRepositoryPageWindow
  & SupplierPayablesRepositoryVisibility
  & Readonly<{
    vendorId?: string | undefined;
    projectId?: string | undefined;
    status?: SupplierPaymentStatus | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  }>;

export type CreateSupplierPaymentRepositoryInput = SupplierPayablesRepositoryVisibility & Readonly<{
  vendorId: string;
  projectId?: string | null;
  paymentNo: string;
  paymentDate: Date;
  amount: string;
  cashBankAccountId: string;
  reference?: string | null;
  status: SupplierPaymentStatus;
}>;

export type SupplierPaymentAllocationWrite = Readonly<{
  supplierInvoiceId: string;
  amount: string;
}>;

export type ListSupplierAgingSourcesRepositoryInput = SupplierPayablesRepositoryPageWindow
  & SupplierPayablesRepositoryVisibility
  & Readonly<{
    vendorId?: string | undefined;
    projectId?: string | undefined;
    invoiceDateThrough: Date;
    allocatedThrough: Date;
  }>;

/** Reject invalid bounded pagination before one Supplier Payables query reaches Prisma. */
function assertPageWindow(input: SupplierPayablesRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > SUPPLIER_PAYABLES_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${SUPPLIER_PAYABLES_MAX_PAGE_SIZE}.`);
  }
}

/** Return a stable de-duplicated Project scope or null for Company-wide Project access. */
function normalizeAllowedProjectIds(allowedProjectIds: readonly string[] | null): readonly string[] | null {
  return allowedProjectIds === null ? null : [...new Set(allowedProjectIds)];
}

/** Check whether one Project is inside the trusted request Project scope. */
function isProjectAllowed(projectId: string, allowedProjectIds: readonly string[] | null): boolean {
  return allowedProjectIds === null || allowedProjectIds.includes(projectId);
}

/** Build a required-Project Prisma predicate from trusted request scope. */
function requiredProjectScopeWhere(allowedProjectIds: readonly string[] | null) {
  return allowedProjectIds === null ? {} : { projectId: { in: [...allowedProjectIds] } };
}

/** Build an optional-Project Prisma predicate without exposing Company-wide payments to restricted Project users. */
function optionalProjectScopeWhere(allowedProjectIds: readonly string[] | null) {
  return allowedProjectIds === null ? {} : { projectId: { in: [...allowedProjectIds] } };
}

/** Keep Supplier Invoice line ordering deterministic for list/detail responses. */
function supplierInvoiceInclude() {
  return {
    lines: { orderBy: [{ id: 'asc' as const }] }
  };
}

/** Persistence for Final Module 17 Supplier Payables only. */
export class SupplierPayablesRepository {
  /** Bind Supplier Payables persistence to Prisma or one active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one same-Company Vendor for Supplier Invoice or Payment validation. */
  async findVendorById(vendorId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.vendor.findFirst({
      where: scope.where({ id: vendorId }),
      select: {
        id: true,
        status: true,
        qualificationStatus: true,
        paymentTermsDays: true,
        currency: true
      }
    });
  }

  /** Find one same-Company Project only when it is inside trusted Project scope. */
  async findProjectById(projectId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: { id: true, status: true, currency: true }
    });
  }

  /** Find one Purchase Order only when Vendor, Project, Company and trusted Project scope agree. */
  async findPurchaseOrderById(
    purchaseOrderId: string,
    projectId: string,
    vendorId: string,
    visibility: SupplierPayablesRepositoryVisibility
  ) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.purchaseOrder.findFirst({
      where: scope.where({ id: purchaseOrderId, projectId, vendorId }),
      select: {
        id: true,
        projectId: true,
        vendorId: true,
        status: true,
        currency: true,
        total: true
      }
    });
  }

  /** Find one Goods Receipt only when Vendor, Project, Company and trusted Project scope agree. */
  async findGoodsReceiptById(
    goodsReceiptId: string,
    projectId: string,
    vendorId: string,
    visibility: SupplierPayablesRepositoryVisibility
  ) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.goodsReceipt.findFirst({
      where: scope.where({ id: goodsReceiptId, projectId, vendorId }),
      select: {
        id: true,
        projectId: true,
        vendorId: true,
        purchaseOrderId: true,
        status: true,
        receiptNo: true
      }
    });
  }

  /** Find one Stage only when it belongs to the selected Company Project and trusted Project scope. */
  async findStageById(projectId: string, stageId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({
      where: scope.where({ id: stageId, projectId }),
      select: { id: true, projectId: true, status: true }
    });
  }

  /** Find one same-Company expense/inventory General Ledger account for an invoice line. */
  async findGlAccountById(glAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({
      where: scope.where({ id: glAccountId }),
      select: { id: true, accountCode: true, accountType: true, status: true }
    });
  }

  /** Find one same-Company General Ledger account by stable account code. */
  async findGlAccountByCode(accountCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({
      where: scope.where({ accountCode }),
      select: { id: true, accountCode: true, accountType: true, status: true }
    });
  }

  /** Find whether the selected Vendor has one active Subcontractor profile for direct-cost classification. */
  async findActiveSubcontractorByVendorId(vendorId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractor.findFirst({
      where: scope.where({ vendorId, status: 'ACTIVE' }),
      select: { id: true, vendorId: true, status: true }
    });
  }

  /** Find one same-Company Cash/Bank account and its mapped General Ledger account. */
  async findCashBankAccountById(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({
      where: scope.where({ id: cashBankAccountId }),
      include: { glAccount: true }
    });
  }

  /** Find a Vendor invoice number inside the Company to support duplicate-invoice validation. */
  async findSupplierInvoiceByVendorInvoiceNo(vendorId: string, invoiceNo: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.supplierInvoice.findFirst({
      where: scope.where({ vendorId, invoiceNo }),
      include: supplierInvoiceInclude()
    });
  }

  /** List Supplier Invoices inside Company and trusted Project scope with bounded filters. */
  async listSupplierInvoices(input: ListSupplierInvoicesRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (input.projectId && !isProjectAllowed(input.projectId, allowedProjectIds)) return { items: [], total: 0 };

    const projectFilter = input.projectId
      ? input.projectId
      : allowedProjectIds === null
        ? undefined
        : { in: [...allowedProjectIds] };
    const where = scope.where({
      ...(projectFilter === undefined ? {} : { projectId: projectFilter }),
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(input.purchaseOrderId ? { purchaseOrderId: input.purchaseOrderId } : {}),
      ...(input.goodsReceiptId ? { goodsReceiptId: input.goodsReceiptId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.fromDate || input.toDate
        ? {
            invoiceDate: {
              ...(input.fromDate ? { gte: input.fromDate } : {}),
              ...(input.toDate ? { lte: input.toDate } : {})
            }
          }
        : {}),
      ...(input.dueBefore ? { dueDate: { lte: input.dueBefore } } : {})
    });

    const [items, total] = await Promise.all([
      this.db.supplierInvoice.findMany({
        where,
        include: supplierInvoiceInclude(),
        orderBy: [{ invoiceDate: 'desc' }, { invoiceNo: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.supplierInvoice.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Supplier Invoice only inside Company and trusted Project scope. */
  async findSupplierInvoiceById(invoiceId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.supplierInvoice.findFirst({
      where: scope.where({ id: invoiceId, ...requiredProjectScopeWhere(allowedProjectIds) }),
      include: supplierInvoiceInclude()
    });
  }

  /** Find multiple Supplier Invoices inside Company and trusted Project scope for one allocation command. */
  async findSupplierInvoicesByIds(invoiceIds: readonly string[], visibility: SupplierPayablesRepositoryVisibility) {
    if (invoiceIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.supplierInvoice.findMany({
      where: scope.where({ id: { in: [...new Set(invoiceIds)] }, ...requiredProjectScopeWhere(allowedProjectIds) }),
      include: supplierInvoiceInclude(),
      orderBy: [{ id: 'asc' }]
    });
  }

  /** Create one DRAFT Supplier Invoice and its complete immutable-for-posting line set. */
  async createDraftSupplierInvoice(input: CreateDraftSupplierInvoiceRepositoryInput) {
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (!isProjectAllowed(input.projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({
      where: scope.where({ id: input.projectId }),
      select: { id: true }
    });
    if (!project) return null;

    return this.db.supplierInvoice.create({
      data: scope.createData({
        vendorId: input.vendorId,
        projectId: input.projectId,
        invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        goodsReceiptId: input.goodsReceiptId ?? null,
        status: 'DRAFT',
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        lines: {
          create: input.lines.map((line) => ({
            stageId: line.stageId ?? null,
            description: line.description,
            amount: line.amount,
            expenseOrInventoryAccountId: line.expenseOrInventoryAccountId ?? null
          }))
        }
      }),
      include: supplierInvoiceInclude()
    });
  }

  /** Lock one Company-owned visible Supplier Invoice before a state-sensitive posting command. */
  async lockSupplierInvoiceForWrite(invoiceId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const visible = await this.findSupplierInvoiceById(invoiceId, { allowedProjectIds });
    if (!visible) return null;

    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      vendorId: string;
      projectId: string;
      invoiceNo: string;
      invoiceDate: Date;
      dueDate: Date | null;
      purchaseOrderId: string | null;
      goodsReceiptId: string | null;
      status: string;
      subtotal: { toString(): string };
      taxAmount: { toString(): string };
      totalAmount: { toString(): string };
    }>>`
      SELECT id,
             vendor_id AS "vendorId",
             project_id AS "projectId",
             invoice_no AS "invoiceNo",
             invoice_date AS "invoiceDate",
             due_date AS "dueDate",
             purchase_order_id AS "purchaseOrderId",
             goods_receipt_id AS "goodsReceiptId",
             status,
             subtotal,
             tax_amount AS "taxAmount",
             total_amount AS "totalAmount"
      FROM supplier_invoices
      WHERE id = ${invoiceId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    const locked = rows[0] ?? null;
    if (!locked || !isProjectAllowed(locked.projectId, allowedProjectIds)) return null;
    return locked;
  }

  /** Upsert one policy-approved direct Supplier Invoice actual-cost line by stable source key. */
  async upsertSupplierInvoiceCostActual(input: Readonly<{
    projectId: string;
    stageId: string | null;
    category: 'subcontract' | 'other';
    sourceId: string;
    sourceKey: string;
    postingDate: Date;
    amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.upsert({
      where: { companyId_sourceKey: { companyId: scope.companyId, sourceKey: input.sourceKey } },
      update: {},
      create: scope.createData({
        projectId: input.projectId,
        stageId: input.stageId,
        category: input.category,
        sourceType: 'supplier_invoice',
        sourceId: input.sourceId,
        sourceKey: input.sourceKey,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** Persist the controlled DRAFT to POSTED Supplier Invoice transition only once. */
  async markSupplierInvoicePosted(invoiceId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const updated = await this.db.supplierInvoice.updateMany({
      where: scope.where({ id: invoiceId, status: 'DRAFT', ...requiredProjectScopeWhere(allowedProjectIds) }),
      data: { status: 'POSTED' }
    });
    if (updated.count !== 1) return null;
    return this.findSupplierInvoiceById(invoiceId, { allowedProjectIds });
  }

  /** Read posted invoice, allocated-payment and outstanding sources for one Vendor inside trusted Project scope. */
  async getVendorPayableSummary(vendorId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const invoiceWhere = scope.where({
      vendorId,
      status: 'POSTED',
      ...requiredProjectScopeWhere(allowedProjectIds)
    });

    const [postedInvoiceCount, invoiceTotals, allocationTotals] = await Promise.all([
      this.db.supplierInvoice.count({ where: invoiceWhere }),
      this.db.supplierInvoice.aggregate({ where: invoiceWhere, _sum: { totalAmount: true } }),
      this.db.supplierPaymentAllocation.aggregate({
        where: {
          supplierInvoice: {
            companyId: scope.companyId,
            vendorId,
            status: 'POSTED',
            ...requiredProjectScopeWhere(allowedProjectIds)
          },
          supplierPayment: { companyId: scope.companyId, status: 'POSTED' }
        },
        _sum: { amount: true }
      })
    ]);

    return {
      postedInvoiceCount,
      postedInvoiceTotal: invoiceTotals._sum.totalAmount,
      allocatedPaymentTotal: allocationTotals._sum.amount
    };
  }

  /** Sum immutable allocations already applied to one same-Company Supplier Invoice. */
  async sumAllocatedAmountForSupplierInvoice(invoiceId: string) {
    const scope = requireCompanyRepositoryScope();
    const aggregate = await this.db.supplierPaymentAllocation.aggregate({
      where: {
        supplierInvoiceId: invoiceId,
        supplierInvoice: { companyId: scope.companyId },
        supplierPayment: { companyId: scope.companyId, status: 'POSTED' }
      },
      _sum: { amount: true }
    });
    return aggregate._sum.amount;
  }

  /** List Supplier Payments inside Company and trusted Project scope with bounded filters. */
  async listSupplierPayments(input: ListSupplierPaymentsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (input.projectId && !isProjectAllowed(input.projectId, allowedProjectIds)) return { items: [], total: 0 };

    const projectFilter = input.projectId
      ? input.projectId
      : allowedProjectIds === null
        ? undefined
        : { in: [...allowedProjectIds] };
    const where = scope.where({
      ...(projectFilter === undefined ? {} : { projectId: projectFilter }),
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.fromDate || input.toDate
        ? {
            paymentDate: {
              ...(input.fromDate ? { gte: input.fromDate } : {}),
              ...(input.toDate ? { lte: input.toDate } : {})
            }
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.supplierPayment.findMany({
        where,
        orderBy: [{ paymentDate: 'desc' }, { paymentNo: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.supplierPayment.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Supplier Payment only inside Company and trusted Project scope. */
  async findSupplierPaymentById(paymentId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.supplierPayment.findFirst({
      where: scope.where({ id: paymentId, ...optionalProjectScopeWhere(allowedProjectIds) }),
      include: { allocations: { orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }] } }
    });
  }

  /** Create one server-numbered Supplier Payment after the service validates Vendor, Project and Cash/Bank ownership. */
  async createSupplierPayment(input: CreateSupplierPaymentRepositoryInput) {
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (allowedProjectIds !== null && (!input.projectId || !isProjectAllowed(input.projectId, allowedProjectIds))) return null;
    if (input.projectId) {
      const scope = requireCompanyRepositoryScope();
      const project = await this.db.project.findFirst({ where: scope.where({ id: input.projectId }), select: { id: true } });
      if (!project) return null;
    }

    const scope = requireCompanyRepositoryScope();
    return this.db.supplierPayment.create({
      data: scope.createData({
        vendorId: input.vendorId,
        projectId: input.projectId ?? null,
        paymentNo: input.paymentNo,
        paymentDate: input.paymentDate,
        amount: input.amount,
        cashBankAccountId: input.cashBankAccountId,
        reference: input.reference ?? null,
        status: input.status
      }),
      include: { allocations: true }
    });
  }

  /** Lock one Company-owned visible Supplier Payment before allocation validation and persistence. */
  async lockSupplierPaymentForWrite(paymentId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const visible = await this.findSupplierPaymentById(paymentId, { allowedProjectIds });
    if (!visible) return null;

    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      vendorId: string;
      projectId: string | null;
      paymentNo: string;
      paymentDate: Date;
      amount: { toString(): string };
      cashBankAccountId: string;
      reference: string | null;
      status: string;
    }>>`
      SELECT id,
             vendor_id AS "vendorId",
             project_id AS "projectId",
             payment_no AS "paymentNo",
             payment_date AS "paymentDate",
             amount,
             cash_bank_account_id AS "cashBankAccountId",
             reference,
             status
      FROM supplier_payments
      WHERE id = ${paymentId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    const locked = rows[0] ?? null;
    if (!locked) return null;
    if (allowedProjectIds !== null && (!locked.projectId || !allowedProjectIds.includes(locked.projectId))) return null;
    return locked;
  }

  /** Persist the controlled DRAFT to POSTED Supplier Payment transition only once. */
  async markSupplierPaymentPosted(paymentId: string, visibility: SupplierPayablesRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const updated = await this.db.supplierPayment.updateMany({
      where: scope.where({ id: paymentId, status: 'DRAFT', ...optionalProjectScopeWhere(allowedProjectIds) }),
      data: { status: 'POSTED' }
    });
    if (updated.count !== 1) return null;
    return this.findSupplierPaymentById(paymentId, { allowedProjectIds });
  }

  /** Sum immutable allocations already applied from one same-Company Supplier Payment. */
  async sumAllocatedAmountForSupplierPayment(paymentId: string) {
    const scope = requireCompanyRepositoryScope();
    const aggregate = await this.db.supplierPaymentAllocation.aggregate({
      where: {
        supplierPaymentId: paymentId,
        supplierPayment: { companyId: scope.companyId }
      },
      _sum: { amount: true }
    });
    return aggregate._sum.amount;
  }

  /** Append validated Supplier Payment allocation rows without mutating prior allocation history. */
  async createSupplierPaymentAllocations(
    paymentId: string,
    allocations: readonly SupplierPaymentAllocationWrite[],
    allocatedAt: Date,
    visibility: SupplierPayablesRepositoryVisibility
  ) {
    if (allocations.length === 0) return [];
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const payment = await this.findSupplierPaymentById(paymentId, { allowedProjectIds });
    if (!payment) return [];

    const invoiceIds = allocations.map((allocation) => allocation.supplierInvoiceId);
    const visibleInvoices = await this.findSupplierInvoicesByIds(invoiceIds, { allowedProjectIds });
    if (visibleInvoices.length !== new Set(invoiceIds).size) return [];

    const created = [];
    for (const allocation of allocations) {
      const row = await this.db.supplierPaymentAllocation.create({
        data: {
          supplierPaymentId: paymentId,
          supplierInvoiceId: allocation.supplierInvoiceId,
          amount: allocation.amount,
          allocatedAt
        }
      });
      created.push(row);
    }

    return created;
  }

  /** Read bounded posted Supplier Invoice sources and as-of allocations for aging calculation in the service layer. */
  async listSupplierAgingSources(input: ListSupplierAgingSourcesRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (input.projectId && !isProjectAllowed(input.projectId, allowedProjectIds)) return { items: [], total: 0 };

    const projectFilter = input.projectId
      ? input.projectId
      : allowedProjectIds === null
        ? undefined
        : { in: [...allowedProjectIds] };
    const where = scope.where({
      ...(projectFilter === undefined ? {} : { projectId: projectFilter }),
      ...(input.vendorId ? { vendorId: input.vendorId } : {}),
      status: 'POSTED',
      invoiceDate: { lte: input.invoiceDateThrough }
    });

    const [items, total] = await Promise.all([
      this.db.supplierInvoice.findMany({
        where,
        include: {
          allocations: {
            where: {
              allocatedAt: { lte: input.allocatedThrough },
              supplierPayment: { companyId: scope.companyId, status: 'POSTED' }
            },
            select: { amount: true, allocatedAt: true },
            orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }]
          }
        },
        orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }, { invoiceNo: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.supplierInvoice.count({ where })
    ]);
    return { items, total };
  }
}
