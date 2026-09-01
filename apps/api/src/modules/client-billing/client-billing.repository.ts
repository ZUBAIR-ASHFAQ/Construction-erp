import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { CLIENT_BILLING_MAX_PAGE_SIZE, type ClaimLineInput } from './client-billing.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ClientBillingVisibility = Readonly<{ allowedProjectIds: readonly string[] | null }>;
export type ClientBillingPage = Readonly<{ skip: number; take: number }>;
export type ClientInvoiceLineWrite = Readonly<{
  stageId: string | null;
  description: string;
  amount: string;
  revenueAccountId: string | null;
}>;

/** Reject invalid repository pagination before it reaches the database. */
function assertPage(input: ClientBillingPage): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('skip must be a non-negative integer');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > CLIENT_BILLING_MAX_PAGE_SIZE) {
    throw new RangeError(`take must be between 1 and ${CLIENT_BILLING_MAX_PAGE_SIZE}`);
  }
}

/** Return unique non-null identifiers while preserving first-seen order. */
function uniqueIds(values: readonly (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

/** Build the project filter without widening an authenticated restricted scope. */
function projectWhere(visibility: ClientBillingVisibility) {
  return visibility.allowedProjectIds === null ? {} : { projectId: { in: [...new Set(visibility.allowedProjectIds)] } };
}

/** Return true when one project is inside the resolved request scope. */
function projectIsVisible(projectId: string, visibility: ClientBillingVisibility): boolean {
  return visibility.allowedProjectIds === null || visibility.allowedProjectIds.includes(projectId);
}

/** Keep claim reads deterministic and include only their business-owned lines and invoice. */
function claimInclude() {
  return { lines: { orderBy: [{ id: 'asc' as const }] }, invoice: { include: { lines: true } } };
}

export class ClientBillingRepository {
  /** Bind Client Billing persistence to Prisma or the current transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one project inside company and project scope. */
  async findProject(projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: { id: true, clientId: true, projectModel: true, projectValue: true, costPlusPercent: true, currency: true, status: true }
    });
  }

  /** Find requested Stages only when they belong to the selected Company Project and trusted Project scope. */
  async findProjectStagesByIds(projectId: string, stageIds: readonly string[], visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return [];
    const ids = uniqueIds(stageIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({
      where: scope.where({ projectId, id: { in: ids } }),
      select: { id: true, projectId: true, status: true },
      orderBy: [{ id: 'asc' }]
    });
  }

  /** List all Project Stages needed to calculate the blended Cost + Percentage Project ceiling. */
  async listProjectStages(projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({
      where: scope.where({ projectId }),
      select: { id: true, costPlusPercent: true },
      orderBy: [{ id: 'asc' }]
    });
  }

  /** Sum source-derived actual costs for one visible Project through the claim period end. */
  async sumProjectCostActuals(projectId: string, visibility: ClientBillingVisibility, throughDate?: Date) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.costActual.aggregate({
      where: scope.where({ projectId, ...(throughDate ? { postingDate: { lte: throughDate } } : {}) }),
      _sum: { amount: true }
    });
    return result._sum.amount;
  }

  /** Sum source-derived actual costs by requested Stage through the claim period end. */
  async sumStageCostActuals(projectId: string, stageIds: readonly string[], visibility: ClientBillingVisibility, throughDate?: Date) {
    if (!projectIsVisible(projectId, visibility)) return [];
    const ids = uniqueIds(stageIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.groupBy({
      by: ['stageId'],
      where: scope.where({ projectId, stageId: { in: ids }, ...(throughDate ? { postingDate: { lte: throughDate } } : {}) }),
      _sum: { amount: true },
      orderBy: { stageId: 'asc' }
    });
  }

  /** Sum previously finalized gross claims so the same Cost + Percentage basis cannot be certified twice. */
  async sumFinalizedClaimGross(projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.progressClaim.aggregate({
      where: scope.where({ projectId, status: 'FINALIZED' }),
      _sum: { grossValue: true }
    });
    return result._sum.grossValue;
  }

  /** Sum previously finalized Stage claim lines so each Stage shares the same no-double-certification rule. */
  async sumFinalizedClaimLinesByStage(projectId: string, stageIds: readonly string[], visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return [];
    const ids = uniqueIds(stageIds);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.progressClaimLine.groupBy({
      by: ['stageId'],
      where: {
        stageId: { in: ids },
        claim: { is: { companyId: scope.companyId, projectId, status: 'FINALIZED' } }
      },
      _sum: { amount: true },
      orderBy: { stageId: 'asc' }
    });
  }

  /** Find one same-Company General Ledger account for later Client Invoice posting validation. */
  async findGlAccountById(accountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.glAccount.findFirst({
      where: scope.where({ id: accountId }),
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

  /** Read issued/posted Client Invoice totals for one Client inside trusted Project visibility. */
  async readClientBillingSummary(clientId: string, visibility: ClientBillingVisibility, projectId?: string) {
    const scope = requireCompanyRepositoryScope();
    const billing = await this.db.clientInvoice.aggregate({
      where: scope.where({
        clientId,
        ...(projectId ? { projectId } : {}),
        status: { in: ['ISSUED', 'POSTED'] },
        ...projectWhere(visibility)
      }),
      _count: { _all: true },
      _sum: { totalAmount: true }
    });

    return {
      invoiceCount: billing._count._all,
      billedAmount: billing._sum.totalAmount
    };
  }

  /** Read issued/posted Client Invoice totals for one visible Project. */
  async readProjectBillingSummary(projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    const billing = await this.db.clientInvoice.aggregate({
      where: scope.where({ projectId, status: { in: ['ISSUED', 'POSTED'] } }),
      _count: { _all: true },
      _sum: { totalAmount: true }
    });

    return {
      invoiceCount: billing._count._all,
      billedAmount: billing._sum.totalAmount
    };
  }

  /** Read one project's Client Billing settings. */
  async findSettings(projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.projectBillingSetting.findFirst({ where: scope.where({ projectId }) });
  }

  /** Create or replace the editable settings owned by Client Billing. */
  async upsertSettings(projectId: string, input: {
    billingMethod: string;
    retentionPercent: string | null;
    billingCycle: string | null;
    advanceRecoveryEnabled: boolean;
    status: string;
  }) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectBillingSetting.upsert({
      where: { companyId_projectId: { companyId: scope.companyId, projectId } },
      create: scope.createData({ projectId, ...input }),
      update: input
    });
  }

  /** List permission-visible claims using bounded filters. */
  async listClaims(input: ClientBillingPage & { projectId?: string | undefined; status?: string | undefined }, visibility: ClientBillingVisibility) {
    assertPage(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...projectWhere(visibility),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    const [items, total] = await Promise.all([
      this.db.progressClaim.findMany({ where, include: claimInclude(), orderBy: [{ periodEnd: 'desc' }, { claimNo: 'desc' }], skip: input.skip, take: input.take }),
      this.db.progressClaim.count({ where })
    ]);
    return { items, total };
  }

  /** Find one claim without exposing another company or project scope. */
  async findClaim(claimId: string, visibility: ClientBillingVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.progressClaim.findFirst({ where: scope.where({ id: claimId, ...projectWhere(visibility) }), include: claimInclude() });
  }

  /** Lock one claim before a state-changing command. */
  async lockClaim(claimId: string, projectId: string, visibility: ClientBillingVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; projectId: string; status: string }>>`
      SELECT id, project_id AS "projectId", status
      FROM progress_claims
      WHERE id = ${claimId}::uuid AND project_id = ${projectId}::uuid AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Create one project/client-owned draft claim. */
  async createClaim(input: {
    projectId: string;
    clientId: string;
    claimNo: string;
    periodEnd: Date;
    createdBy: string;
    lines: readonly ClaimLineInput[];
  }) {
    const scope = requireCompanyRepositoryScope();
    return this.db.progressClaim.create({
      data: scope.createData({
        projectId: input.projectId,
        clientId: input.clientId,
        claimNo: input.claimNo,
        periodEnd: input.periodEnd,
        status: 'DRAFT',
        grossValue: '0.00',
        deductions: '0.00',
        retention: '0.00',
        netCertified: '0.00',
        createdBy: input.createdBy,
        lines: { create: input.lines.map((line) => ({
          stageId: line.stageId ?? null,
          description: line.description,
          billingProgressPercent: line.billingProgressPercent ?? null,
          amount: line.amount
        })) }
      }),
      include: claimInclude()
    });
  }

  /** Replace editable draft claim data and its complete line set. */
  async updateDraftClaim(input: { claimId: string; periodEnd?: Date | undefined; lines?: readonly ClaimLineInput[] | undefined }) {
    if (input.lines !== undefined) {
      await this.db.progressClaimLine.deleteMany({ where: { claimId: input.claimId } });
    }
    return this.db.progressClaim.update({
      where: { id: input.claimId },
      data: {
        ...(input.periodEnd ? { periodEnd: input.periodEnd } : {}),
        ...(input.lines ? { lines: { create: input.lines.map((line) => ({
          stageId: line.stageId ?? null,
          description: line.description,
          billingProgressPercent: line.billingProgressPercent ?? null,
          amount: line.amount
        })) } } : {})
      },
      include: claimInclude()
    });
  }

  /** Persist server-calculated final claim totals. */
  async finalizeClaim(input: { claimId: string; grossValue: string; deductions: string; retention: string; netCertified: string }) {
    return this.db.progressClaim.update({
      where: { id: input.claimId },
      data: { status: 'FINALIZED', grossValue: input.grossValue, deductions: input.deductions, retention: input.retention, netCertified: input.netCertified },
      include: claimInclude()
    });
  }

  /** Find one invoice by claim so invoice creation remains one-to-one and idempotent. */
  async findInvoiceByClaim(claimId: string, visibility: ClientBillingVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoice.findFirst({ where: scope.where({ claimId, ...projectWhere(visibility) }), include: { lines: true } });
  }

  /** Create one client invoice from a finalized claim. */
  async createInvoice(input: {
    projectId: string;
    clientId: string;
    claimId: string;
    invoiceNo: string;
    invoiceDate: Date;
    dueDate: Date;
    subtotal: string;
    taxAmount: string;
    totalAmount: string;
    lines: readonly ClientInvoiceLineWrite[];
  }) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoice.create({
      data: scope.createData({
        projectId: input.projectId,
        clientId: input.clientId,
        claimId: input.claimId,
        invoiceNo: input.invoiceNo,
        invoiceDate: input.invoiceDate,
        dueDate: input.dueDate,
        status: 'ISSUED',
        subtotal: input.subtotal,
        taxAmount: input.taxAmount,
        totalAmount: input.totalAmount,
        lines: { create: input.lines.map((line) => ({
          stageId: line.stageId,
          description: line.description,
          amount: line.amount,
          revenueAccountId: line.revenueAccountId
        })) }
      }),
      include: { lines: true }
    });
  }

  /** List permission-visible invoices with bounded source-owned filters. */
  async listInvoices(
    input: ClientBillingPage & Readonly<{
      projectId?: string | undefined;
      clientId?: string | undefined;
      status?: string | undefined;
      statuses?: readonly string[] | undefined;
      fromDate?: Date | undefined;
      toDate?: Date | undefined;
    }>,
    visibility: ClientBillingVisibility
  ) {
    assertPage(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...projectWhere(visibility),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.statuses ? { status: { in: [...input.statuses] } } : {}),
      ...(input.fromDate || input.toDate
        ? { invoiceDate: { ...(input.fromDate ? { gte: input.fromDate } : {}), ...(input.toDate ? { lte: input.toDate } : {}) } }
        : {})
    });
    const [items, total] = await Promise.all([
      this.db.clientInvoice.findMany({ where, include: { lines: true }, orderBy: [{ invoiceDate: 'desc' }, { invoiceNo: 'desc' }], skip: input.skip, take: input.take }),
      this.db.clientInvoice.count({ where })
    ]);
    return { items, total };
  }

  /** Find one invoice inside company and project visibility. */
  async findInvoice(invoiceId: string, visibility: ClientBillingVisibility) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoice.findFirst({ where: scope.where({ id: invoiceId, ...projectWhere(visibility) }), include: { lines: true } });
  }
}
