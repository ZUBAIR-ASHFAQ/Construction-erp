import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { PROJECT_PROFITABILITY_MAX_PAGE_SIZE } from './project-profitability.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ProjectProfitabilityRepositoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
}>;

export type ProjectProfitabilityRepositoryDateWindow = Readonly<{
  fromDate?: Date;
  throughDate: Date;
  postedThrough: Date;
}>;

export type ProjectProfitabilityPortfolioSourceInput = ProjectProfitabilityRepositoryVisibility & Readonly<{
  skip: number;
  take: number;
  search?: string | undefined;
  clientId?: string | undefined;
}>;

const BILLABLE_INVOICE_STATUSES = Object.freeze(['ISSUED', 'POSTED'] as const);
const FINANCE_VISIBLE_JOURNAL_STATUSES = Object.freeze(['POSTED', 'REVERSED'] as const);
const RECEIPT_FINANCE_SOURCE_TYPES = Object.freeze([
  'client_receipt',
  'client_receipt_reversal',
  'client_receipt_allocation',
  'client_receipt_allocation_reversal'
] as const);

/** Return unique Project IDs while preserving the caller's trusted order. */
function uniqueProjectIds(projectIds: readonly string[]): string[] {
  return [...new Set(projectIds)];
}

/** Intersect requested Projects with the trusted request Project scope. */
function visibleProjectIds(projectIds: readonly string[], visibility: ProjectProfitabilityRepositoryVisibility): string[] {
  const requested = uniqueProjectIds(projectIds);
  if (visibility.allowedProjectIds === null) return requested;
  const allowed = new Set(visibility.allowedProjectIds);
  return requested.filter((projectId) => allowed.has(projectId));
}

/** Check whether one Project is visible without querying another Company's data. */
function projectIsVisible(projectId: string, visibility: ProjectProfitabilityRepositoryVisibility): boolean {
  return visibility.allowedProjectIds === null || visibility.allowedProjectIds.includes(projectId);
}

/** Reject an invalid portfolio page window before it reaches Prisma. */
function assertPageWindow(input: Readonly<{ skip: number; take: number }>): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > PROJECT_PROFITABILITY_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${PROJECT_PROFITABILITY_MAX_PAGE_SIZE}.`);
  }
}

/** Build one inclusive business-date filter shared by source-history reads. */
function businessDateFilter(window: ProjectProfitabilityRepositoryDateWindow) {
  return {
    ...(window.fromDate ? { gte: window.fromDate } : {}),
    lte: window.throughDate
  };
}

/** Read-only source persistence for Final Module 19 Project Profitability. */
export class ProjectProfitabilityRepository {
  /** Bind Project Profitability reads to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** Find one Company Project only when it is inside the trusted Project scope. */
  async findProject(projectId: string, visibility: ProjectProfitabilityRepositoryVisibility) {
    if (!projectIsVisible(projectId, visibility)) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: {
        id: true,
        projectCode: true,
        name: true,
        clientId: true,
        currency: true,
        status: true
      }
    });
  }

  /** List a bounded page of Company Projects without widening the trusted Project scope. */
  async listPortfolioProjects(input: ProjectProfitabilityPortfolioSourceInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const allowedProjectIds = input.allowedProjectIds === null ? null : uniqueProjectIds(input.allowedProjectIds);
    const where = scope.where({
      ...(allowedProjectIds === null ? {} : { id: { in: allowedProjectIds } }),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.search
        ? {
            OR: [
              { projectCode: { contains: input.search, mode: 'insensitive' as const } },
              { name: { contains: input.search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    });
    const [items, total] = await Promise.all([
      this.db.project.findMany({
        where,
        select: { id: true, projectCode: true, name: true, clientId: true, currency: true, status: true },
        orderBy: [{ projectCode: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.project.count({ where })
    ]);
    return { items, total };
  }

  /** List Stage identity and latest approved physical progress through one as-of date. */
  async listProjectStages(projectIds: readonly string[], throughDate: Date, visibility: ProjectProfitabilityRepositoryVisibility) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStage.findMany({
      where: scope.where({ projectId: { in: ids } }),
      select: {
        id: true,
        projectId: true,
        code: true,
        name: true,
        sequenceNo: true,
        weightPercent: true,
        plannedAmount: true,
        status: true,
        progressUpdates: {
          where: { status: 'APPROVED', progressDate: { lte: throughDate } },
          select: { progressPercent: true, progressDate: true, approvedAt: true },
          orderBy: [{ progressDate: 'desc' }, { approvedAt: 'desc' }, { id: 'desc' }],
          take: 1
        }
      },
      orderBy: [{ projectId: 'asc' }, { sequenceNo: 'asc' }, { id: 'asc' }]
    });
  }

  /** List Module 9 source-derived actual-cost rows for visible Projects and the requested date window. */
  async listActualCostSources(
    projectIds: readonly string[],
    window: ProjectProfitabilityRepositoryDateWindow,
    visibility: ProjectProfitabilityRepositoryVisibility
  ) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.findMany({
      where: scope.where({ projectId: { in: ids }, postingDate: businessDateFilter(window) }),
      select: { id: true, projectId: true, stageId: true, amount: true, postingDate: true, category: true, sourceType: true, sourceId: true, sourceKey: true },
      orderBy: [{ postingDate: 'asc' }, { id: 'asc' }]
    });
  }

  /** List issued/posted Module 15 invoice lines used only for billed-position reads. */
  async listBilledSources(
    projectIds: readonly string[],
    window: ProjectProfitabilityRepositoryDateWindow,
    visibility: ProjectProfitabilityRepositoryVisibility
  ) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.clientInvoiceLine.findMany({
      where: {
        invoice: {
          companyId: scope.companyId,
          projectId: { in: ids },
          status: { in: [...BILLABLE_INVOICE_STATUSES] },
          invoiceDate: businessDateFilter(window)
        }
      },
      select: {
        id: true,
        clientInvoiceId: true,
        stageId: true,
        amount: true,
        invoice: { select: { projectId: true, invoiceDate: true, status: true } }
      },
      orderBy: [{ clientInvoiceId: 'asc' }, { id: 'asc' }]
    });
  }

  /** List Finance-confirmed Client Billing revenue lines including posted compensating reversals. */
  async listRecognizedRevenueSources(
    projectIds: readonly string[],
    window: ProjectProfitabilityRepositoryDateWindow,
    visibility: ProjectProfitabilityRepositoryVisibility
  ) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const invoices = await this.db.clientInvoice.findMany({
      where: scope.where({
        projectId: { in: ids },
        status: { in: [...BILLABLE_INVOICE_STATUSES] },
        invoiceDate: businessDateFilter(window)
      }),
      select: { id: true }
    });
    const invoiceIds = invoices.map((invoice) => invoice.id);
    if (invoiceIds.length === 0) return [];

    const sourceJournals = await this.db.journal.findMany({
      where: scope.where({
        sourceType: 'client_invoice',
        sourceId: { in: invoiceIds },
        status: { in: [...FINANCE_VISIBLE_JOURNAL_STATUSES] },
        postingDate: businessDateFilter(window),
        postedAt: { lte: window.postedThrough }
      }),
      select: { id: true }
    });
    const sourceJournalIds = sourceJournals.map((journal) => journal.id);
    if (sourceJournalIds.length === 0) return [];

    const reversalJournals = await this.db.journal.findMany({
      where: scope.where({
        sourceType: 'REVERSAL',
        sourceId: { in: sourceJournalIds },
        status: 'POSTED',
        postingDate: businessDateFilter(window),
        postedAt: { lte: window.postedThrough }
      }),
      select: { id: true }
    });
    const journalIds = [...sourceJournalIds, ...reversalJournals.map((journal) => journal.id)];

    return this.db.journalLine.findMany({
      where: {
        projectId: { in: ids },
        journalId: { in: journalIds },
        journal: { companyId: scope.companyId },
        account: { companyId: scope.companyId, accountType: 'REVENUE' }
      },
      select: {
        id: true,
        projectId: true,
        stageId: true,
        debit: true,
        credit: true,
        journal: { select: { id: true, sourceType: true, sourceId: true, sourceKey: true, postingDate: true, postedAt: true, status: true } }
      },
      orderBy: [{ journalId: 'asc' }, { id: 'asc' }]
    });
  }

  /** List durable Finance history for Client cash, allocation, unallocation and receipt reversal sources. */
  async listClientReceiptFinanceSources(
    projectIds: readonly string[],
    window: ProjectProfitabilityRepositoryDateWindow,
    visibility: ProjectProfitabilityRepositoryVisibility
  ) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const sourceJournals = await this.db.journal.findMany({
      where: scope.where({
        sourceType: { in: [...RECEIPT_FINANCE_SOURCE_TYPES] },
        status: { in: [...FINANCE_VISIBLE_JOURNAL_STATUSES] },
        postingDate: businessDateFilter(window),
        postedAt: { lte: window.postedThrough },
        lines: { some: { projectId: { in: ids } } }
      }),
      select: { id: true }
    });
    const sourceJournalIds = sourceJournals.map((journal) => journal.id);
    if (sourceJournalIds.length === 0) return [];

    const genericReversals = await this.db.journal.findMany({
      where: scope.where({
        sourceType: 'REVERSAL',
        sourceId: { in: sourceJournalIds },
        status: 'POSTED',
        postingDate: businessDateFilter(window),
        postedAt: { lte: window.postedThrough }
      }),
      select: { id: true }
    });
    const journalIds = [...sourceJournalIds, ...genericReversals.map((journal) => journal.id)];

    return this.db.journal.findMany({
      where: scope.where({ id: { in: journalIds } }),
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        sourceKey: true,
        postingDate: true,
        postedAt: true,
        status: true,
        totalDebit: true,
        totalCredit: true,
        lines: {
          where: { projectId: { in: ids } },
          select: {
            projectId: true,
            stageId: true,
            debit: true,
            credit: true,
            account: { select: { accountCode: true, accountType: true } }
          },
          orderBy: [{ id: 'asc' }]
        }
      },
      orderBy: [{ postingDate: 'asc' }, { id: 'asc' }]
    });
  }

  /** List posted Supplier Invoices with Stage lines and posted-payment allocations through the as-of cutoff. */
  async listSupplierPayableSources(
    projectIds: readonly string[],
    window: ProjectProfitabilityRepositoryDateWindow,
    visibility: ProjectProfitabilityRepositoryVisibility
  ) {
    const ids = visibleProjectIds(projectIds, visibility);
    if (ids.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.supplierInvoice.findMany({
      where: scope.where({ projectId: { in: ids }, status: 'POSTED', invoiceDate: { lte: window.throughDate } }),
      select: {
        id: true,
        projectId: true,
        vendorId: true,
        invoiceDate: true,
        totalAmount: true,
        lines: {
          select: { id: true, stageId: true, amount: true },
          orderBy: [{ id: 'asc' }]
        },
        allocations: {
          where: {
            allocatedAt: { lte: window.postedThrough },
            supplierPayment: { companyId: scope.companyId, status: 'POSTED' }
          },
          select: {
            id: true,
            amount: true,
            allocatedAt: true,
            supplierPayment: { select: { id: true, projectId: true, paymentDate: true, status: true } }
          },
          orderBy: [{ allocatedAt: 'asc' }, { id: 'asc' }]
        }
      },
      orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }]
    });
  }
}
