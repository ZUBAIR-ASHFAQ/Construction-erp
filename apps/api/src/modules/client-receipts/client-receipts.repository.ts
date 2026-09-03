import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import {
  CLIENT_RECEIPT_MAX_PAGE_SIZE,
  type ClientReceiptPaymentMethod,
  type ClientReceiptStatus,
  type ClientReceiptType
} from './client-receipts.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ClientReceiptsRepositoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
}>;

export type ClientReceiptsRepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListClientReceiptsRepositoryInput = ClientReceiptsRepositoryPageWindow
  & ClientReceiptsRepositoryVisibility
  & Readonly<{
    clientId?: string | undefined;
    projectId?: string | undefined;
    stageId?: string | undefined;
    status?: ClientReceiptStatus | undefined;
    receiptType?: ClientReceiptType | undefined;
    paymentMethod?: ClientReceiptPaymentMethod | undefined;
    fromDate?: Date | undefined;
    toDate?: Date | undefined;
  }>;

export type ClientReceiptFinancialScope = Readonly<{
  clientId?: string;
  projectId?: string;
  stageId?: string;
  allowedProjectIds?: readonly string[] | null;
}>;

export type CreateClientReceiptRepositoryInput = ClientReceiptsRepositoryVisibility & Readonly<{
  clientId: string;
  projectId: string;
  stageId?: string | null;
  receiptNo: string;
  receiptDate: Date;
  amount: string;
  paymentMethod: ClientReceiptPaymentMethod;
  cashBankAccountId: string;
  reference?: string | null;
  receiptType: ClientReceiptType;
  createdBy: string;
  postedAt: Date;
}>;

/** Reject invalid bounded pagination before one Client Receipt query reaches Prisma. */
function assertPageWindow(input: ClientReceiptsRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > CLIENT_RECEIPT_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${CLIENT_RECEIPT_MAX_PAGE_SIZE}.`);
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

/** Build the required-Project Prisma predicate from trusted request scope. */
function projectScopeWhere(allowedProjectIds: readonly string[] | null) {
  return allowedProjectIds === null ? {} : { projectId: { in: [...allowedProjectIds] } };
}

/** Keep receipt allocation history deterministic for list and detail reads. */
function receiptInclude() {
  return { allocations: { orderBy: [{ allocatedAt: 'asc' as const }, { id: 'asc' as const }] } };
}

/** Subtract two non-negative persisted money values without binary floating-point conversion. */
export function subtractMoneyAmounts(left: string | Readonly<{ toString(): string }>, right: string | Readonly<{ toString(): string }>): string {
  const leftText = left.toString();
  const rightText = right.toString();
  const [leftWhole = '0', leftFraction = ''] = leftText.split('.');
  const [rightWhole = '0', rightFraction = ''] = rightText.split('.');
  const leftUnits = (BigInt(leftWhole) * 100n) + BigInt(`${leftFraction}00`.slice(0, 2));
  const rightUnits = (BigInt(rightWhole) * 100n) + BigInt(`${rightFraction}00`.slice(0, 2));
  const difference = leftUnits - rightUnits;
  const absolute = difference < 0n ? -difference : difference;
  const sign = difference < 0n ? '-' : '';
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Persistence for Final Module 16 Client Receipts / Payments only. */
export class ClientReceiptsRepository {
  /** Bind Client Receipt persistence to Prisma or one active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Read posted cash and active allocation totals for one authorized Client, Project or Stage scope. */
  async readReceiptFinancialTotals(input: ClientReceiptFinancialScope) {
    const scope = requireCompanyRepositoryScope();
    const receiptWhere = scope.where({
      status: 'POSTED',
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.allowedProjectIds === undefined || input.allowedProjectIds === null
        ? {}
        : { projectId: { in: [...new Set(input.allowedProjectIds)] } })
    });
    const [received, allocated] = await Promise.all([
      this.db.clientReceipt.aggregate({ where: receiptWhere, _sum: { amount: true } }),
      this.db.clientReceiptAllocation.aggregate({
        where: { receipt: receiptWhere },
        _sum: { amount: true }
      })
    ]);
    return {
      receivedAmount: received._sum.amount,
      allocatedAmount: allocated._sum.amount
    };
  }

  /** Find one same-Company Client for receipt ownership validation. */
  async findClientById(clientId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.client.findFirst({
      where: scope.where({ id: clientId }),
      select: { id: true, status: true }
    });
  }

  /** Find one Client-owned Project only when it is inside trusted Project scope. */
  async findProjectById(projectId: string, clientId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId, clientId }),
      select: { id: true, clientId: true, status: true, currency: true }
    });
  }

  /** Find one optional Stage only when it belongs to the selected Company Project and trusted Project scope. */
  async findStageById(projectId: string, stageId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findFirst({
      where: scope.where({ id: stageId, projectId }),
      select: { id: true, projectId: true, status: true }
    });
  }

  /** Find one same-Company Cash/Bank account together with its mapped General Ledger account. */
  async findCashBankAccountById(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({
      where: scope.where({ id: cashBankAccountId }),
      include: { glAccount: true }
    });
  }

  /** Find one same-Company General Ledger account by its stable Finance account code. */
  async findGlAccountByCode(accountCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({
      where: scope.where({ accountCode }),
      select: { id: true, accountCode: true, accountType: true, status: true }
    });
  }

  /** Ensure one server-owned Client Receipt control account exists without overwriting existing Finance configuration. */
  async ensureReceiptControlAccount(input: Readonly<{ accountCode: string; name: string; accountType: string }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.upsert({
      where: { companyId_accountCode: { companyId: scope.companyId, accountCode: input.accountCode } },
      create: scope.createData({ accountCode: input.accountCode, name: input.name, accountType: input.accountType, parentId: null, status: 'ACTIVE' }),
      update: {},
      select: { id: true, accountCode: true, accountType: true, status: true }
    });
  }

  /** Find one Client Invoice only when Company, Client, Project and trusted Project scope all agree. */
  async findClientInvoiceById(
    clientInvoiceId: string,
    clientId: string,
    projectId: string,
    visibility: ClientReceiptsRepositoryVisibility
  ) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    if (!isProjectAllowed(projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoice.findFirst({
      where: scope.where({ id: clientInvoiceId, clientId, projectId }),
      include: { lines: { orderBy: [{ id: 'asc' }] } }
    });
  }

  /** List Client Receipts inside Company and trusted Project scope with bounded filters. */
  async listClientReceipts(input: ListClientReceiptsRepositoryInput) {
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
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.stageId ? { stageId: input.stageId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.receiptType ? { receiptType: input.receiptType } : {}),
      ...(input.paymentMethod ? { paymentMethod: input.paymentMethod } : {}),
      ...(input.fromDate || input.toDate
        ? {
            receiptDate: {
              ...(input.fromDate ? { gte: input.fromDate } : {}),
              ...(input.toDate ? { lte: input.toDate } : {})
            }
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.clientReceipt.findMany({
        where,
        include: receiptInclude(),
        orderBy: [{ receiptDate: 'desc' }, { receiptNo: 'desc' }, { id: 'desc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.clientReceipt.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Client Receipt only inside Company and trusted Project scope. */
  async findClientReceiptById(receiptId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.clientReceipt.findFirst({
      where: scope.where({ id: receiptId, ...projectScopeWhere(allowedProjectIds) }),
      include: receiptInclude()
    });
  }

  /** Create one server-numbered posted Client Receipt after service-level ownership validation. */
  async createClientReceipt(input: CreateClientReceiptRepositoryInput) {
    const allowedProjectIds = normalizeAllowedProjectIds(input.allowedProjectIds);
    if (!isProjectAllowed(input.projectId, allowedProjectIds)) return null;
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({
      where: scope.where({ id: input.projectId, clientId: input.clientId }),
      select: { id: true }
    });
    if (!project) return null;

    return this.db.clientReceipt.create({
      data: scope.createData({
        clientId: input.clientId,
        projectId: input.projectId,
        stageId: input.stageId ?? null,
        receiptNo: input.receiptNo,
        receiptDate: input.receiptDate,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        cashBankAccountId: input.cashBankAccountId,
        reference: input.reference ?? null,
        receiptType: input.receiptType,
        status: 'POSTED',
        createdBy: input.createdBy,
        postedAt: input.postedAt
      }),
      include: receiptInclude()
    });
  }

  /** Lock one Company-owned visible Client Receipt before allocation, unallocation or reversal work. */
  async lockClientReceiptForWrite(receiptId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const visible = await this.findClientReceiptById(receiptId, { allowedProjectIds });
    if (!visible) return null;

    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      clientId: string;
      projectId: string;
      stageId: string | null;
      receiptNo: string;
      receiptDate: Date;
      amount: { toString(): string };
      paymentMethod: string;
      cashBankAccountId: string;
      reference: string | null;
      receiptType: string;
      status: string;
      createdBy: string;
      postedAt: Date | null;
    }>>`
      SELECT id,
             client_id AS "clientId",
             project_id AS "projectId",
             stage_id AS "stageId",
             receipt_no AS "receiptNo",
             receipt_date AS "receiptDate",
             amount,
             payment_method AS "paymentMethod",
             cash_bank_account_id AS "cashBankAccountId",
             reference,
             receipt_type AS "receiptType",
             status,
             created_by AS "createdBy",
             posted_at AS "postedAt"
      FROM client_receipts
      WHERE id = ${receiptId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    const locked = rows[0] ?? null;
    if (!locked || !isProjectAllowed(locked.projectId, allowedProjectIds)) return null;
    return locked;
  }

  /** Lock one Client Invoice before allocation-limit validation without widening Project scope. */
  async lockClientInvoiceForAllocation(
    clientInvoiceId: string,
    clientId: string,
    projectId: string,
    visibility: ClientReceiptsRepositoryVisibility
  ) {
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const visible = await this.findClientInvoiceById(clientInvoiceId, clientId, projectId, { allowedProjectIds });
    if (!visible) return null;

    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      clientId: string;
      projectId: string;
      status: string;
      totalAmount: { toString(): string };
    }>>`
      SELECT id,
             client_id AS "clientId",
             project_id AS "projectId",
             status,
             total_receivable AS "totalAmount"
      FROM client_invoices
      WHERE id = ${clientInvoiceId}::uuid
        AND company_id = ${scope.companyId}::uuid
        AND client_id = ${clientId}::uuid
        AND project_id = ${projectId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Sum allocations currently applied from one same-Company Client Receipt. */
  async sumAllocatedAmountForReceipt(receiptId: string) {
    const scope = requireCompanyRepositoryScope();
    const aggregate = await this.db.clientReceiptAllocation.aggregate({
      where: { receiptId, receipt: { companyId: scope.companyId, status: 'POSTED' } },
      _sum: { amount: true }
    });
    return aggregate._sum.amount;
  }

  /** Sum active posted-receipt allocations currently applied to one same-Company Client Invoice. */
  async sumAllocatedAmountForInvoice(clientInvoiceId: string) {
    const scope = requireCompanyRepositoryScope();
    const aggregate = await this.db.clientReceiptAllocation.aggregate({
      where: {
        clientInvoiceId,
        invoice: { companyId: scope.companyId },
        receipt: { companyId: scope.companyId, status: 'POSTED' }
      },
      _sum: { amount: true }
    });
    return aggregate._sum.amount;
  }


  /** Sum active posted-receipt allocations for a bounded Invoice set without N+1 reads. */
  async sumAllocatedAmountsForInvoices(clientInvoiceIds: readonly string[], allocatedThrough?: Date) {
    const scope = requireCompanyRepositoryScope();
    const invoiceIds = [...new Set(clientInvoiceIds)];
    if (invoiceIds.length === 0) return [];
    return this.db.clientReceiptAllocation.groupBy({
      by: ['clientInvoiceId'],
      where: {
        clientInvoiceId: { in: invoiceIds },
        invoice: { companyId: scope.companyId },
        receipt: { companyId: scope.companyId, status: 'POSTED' },
        ...(allocatedThrough ? { allocatedAt: { lte: allocatedThrough } } : {})
      },
      _sum: { amount: true }
    });
  }

  /** Sum active receipt allocations applied to one Invoice from one specific receipt Stage. */
  async sumAllocatedAmountForInvoiceStage(clientInvoiceId: string, stageId: string) {
    const scope = requireCompanyRepositoryScope();
    const aggregate = await this.db.clientReceiptAllocation.aggregate({
      where: {
        clientInvoiceId,
        invoice: { companyId: scope.companyId },
        receipt: { companyId: scope.companyId, status: 'POSTED', stageId }
      },
      _sum: { amount: true }
    });
    return aggregate._sum.amount;
  }

  /** Find one allocation only when its parent receipt is Company-owned and Project-visible. */
  async findAllocationById(
    receiptId: string,
    allocationId: string,
    visibility: ClientReceiptsRepositoryVisibility
  ) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    return this.db.clientReceiptAllocation.findFirst({
      where: {
        id: allocationId,
        receiptId,
        receipt: { companyId: scope.companyId, ...projectScopeWhere(allowedProjectIds) }
      }
    });
  }

  /** Append one validated Client Receipt allocation without changing the original receipt. */
  async createAllocation(input: Readonly<{
    receiptId: string;
    clientInvoiceId: string;
    amount: string;
    allocatedAt: Date;
    allocatedBy: string;
  }>) {
    return this.db.clientReceiptAllocation.create({
      data: {
        receiptId: input.receiptId,
        clientInvoiceId: input.clientInvoiceId,
        amount: input.amount,
        allocatedAt: input.allocatedAt,
        allocatedBy: input.allocatedBy
      }
    });
  }

  /** Remove one explicitly selected allocation after the service records its controlled reversal evidence. */
  async deleteAllocation(receiptId: string, allocationId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const existing = await this.findAllocationById(receiptId, allocationId, visibility);
    if (!existing) return null;
    await this.db.clientReceiptAllocation.delete({ where: { id: allocationId } });
    return existing;
  }

  /** Persist the controlled POSTED to REVERSED Client Receipt transition only once. */
  async markClientReceiptReversed(receiptId: string, visibility: ClientReceiptsRepositoryVisibility) {
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = normalizeAllowedProjectIds(visibility.allowedProjectIds);
    const updated = await this.db.clientReceipt.updateMany({
      where: scope.where({ id: receiptId, status: 'POSTED', ...projectScopeWhere(allowedProjectIds) }),
      data: { status: 'REVERSED' }
    });
    if (updated.count !== 1) return null;
    return this.findClientReceiptById(receiptId, { allowedProjectIds });
  }
}
