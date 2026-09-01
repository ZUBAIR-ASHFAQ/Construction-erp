import type { DatabaseClient } from '@construction-erp/database';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { ProjectProfitabilityRepository, type ProjectProfitabilityRepositoryVisibility } from './project-profitability.repository.js';
import {
  createProjectProfitabilityError,
  projectProfitabilityPortfolioResponseSchema,
  projectProfitabilityStagesResponseSchema,
  projectProfitabilitySummaryResponseSchema,
  projectProfitabilityTrendResponseSchema,
  type ProjectProfitabilityAsOfQuery,
  type ProjectProfitabilityFinancialValues,
  type ProjectProfitabilityPermissionCode,
  type ProjectProfitabilityPortfolioQuery,
  type ProjectProfitabilityPortfolioResponse,
  type ProjectProfitabilityStagesResponse,
  type ProjectProfitabilitySummaryResponse,
  type ProjectProfitabilityTrendGranularity,
  type ProjectProfitabilityTrendQuery,
  type ProjectProfitabilityTrendResponse
} from './project-profitability.schema.js';

const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const DEFAULT_PORTFOLIO_PAGE_SIZE = 25;

const FINANCIAL_VALUE_FIELDS = Object.freeze([
  'recognizedRevenue',
  'actualCost',
  'profitAmount',
  'billedAmount',
  'receivedAmount',
  'allocatedAmount',
  'advanceAmount',
  'outstandingAmount',
  'supplierPayableAmount'
] as const);

type DecimalLike = string | Readonly<{ toString(): string }>;
type ReceiptFinanceJournalLine = Readonly<{ projectId: string | null; stageId: string | null }>;
type ReceiptFinanceJournal = Readonly<{
  id: string;
  sourceType: string;
  sourceId: string | null;
  totalDebit: DecimalLike;
  totalCredit: DecimalLike;
  lines: readonly ReceiptFinanceJournalLine[];
}>;
type ReceiptFinancialEffect = Readonly<{ received: bigint; allocated: bigint }>;
type FinancialSourceBundle = Readonly<{
  actualCostSources: readonly Readonly<{ projectId: string; stageId: string | null; amount: DecimalLike; postingDate: Date }>[];
  billedSources: readonly Readonly<{
    clientInvoiceId: string;
    stageId: string | null;
    amount: DecimalLike;
    invoice: Readonly<{ projectId: string; invoiceDate: Date }>;
  }>[];
  revenueSources: readonly Readonly<{
    projectId: string | null;
    stageId: string | null;
    debit: DecimalLike;
    credit: DecimalLike;
    journal: Readonly<{ sourceType: string; sourceId: string | null; postingDate: Date }>;
  }>[];
  receiptSources: readonly ReceiptFinanceJournal[];
  supplierPayableSources: readonly Readonly<{
    projectId: string;
    totalAmount: DecimalLike;
    allocations: readonly Readonly<{ amount: DecimalLike }>[];
  }>[];
}>;
type TrendBucket = {
  periodStart: string;
  periodEnd: string;
  recognizedRevenue: bigint;
  actualCost: bigint;
};

/** Parse one validated API date without local-time conversion. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Resolve the inclusive end instant for one validated API date. */
function endOfInputDate(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

/** Serialize one Date as a stable UTC YYYY-MM-DD value. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Add whole UTC days without using local time. */
function addUtcDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Convert signed exact money into integer minor units without floating-point arithmetic. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const text = value.toString().trim();
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  const sign = match[1] === '-' ? -1n : 1n;
  const whole = BigInt(match[2] ?? '0');
  const fraction = BigInt(`${match[3] ?? ''}00`.slice(0, 2));
  return sign * ((whole * 100n) + fraction);
}

/** Convert signed integer minor units into stable two-decimal money. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const text = `${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

/** Sum one exact-money source collection into signed integer minor units. */
function sumMoney<T>(rows: readonly T[], valueOf: (row: T) => DecimalLike): bigint {
  return rows.reduce((sum, row) => sum + moneyToMinorUnits(valueOf(row)), 0n);
}

/** Reject a derived balance that cannot be represented by the frozen non-negative API contract. */
function requireNonNegative(value: bigint): bigint {
  if (value < 0n) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  return value;
}

/** Require one balanced Finance Journal amount before using it as durable Receipt history. */
function receiptJournalAmount(journal: ReceiptFinanceJournal): bigint {
  const debit = moneyToMinorUnits(journal.totalDebit);
  const credit = moneyToMinorUnits(journal.totalCredit);
  if (debit < 0n || debit !== credit) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  return debit;
}

/** Resolve the Client cash/allocation effect of one durable Receipt Finance Journal. */
function receiptJournalEffect(
  journal: ReceiptFinanceJournal,
  byId: ReadonlyMap<string, ReceiptFinanceJournal>,
  visiting: ReadonlySet<string> = new Set()
): ReceiptFinancialEffect {
  if (visiting.has(journal.id)) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  const amount = receiptJournalAmount(journal);
  switch (journal.sourceType) {
    case 'client_receipt':
      return { received: amount, allocated: 0n };
    case 'client_receipt_reversal':
      return { received: -amount, allocated: 0n };
    case 'client_receipt_allocation':
      return { received: 0n, allocated: amount };
    case 'client_receipt_allocation_reversal':
      return { received: 0n, allocated: -amount };
    case 'REVERSAL': { // Finance generic reversal compensates its source Journal exactly once.
      if (!journal.sourceId) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
      const original = byId.get(journal.sourceId);
      if (!original) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
      const nextVisiting = new Set(visiting);
      nextVisiting.add(journal.id);
      const originalEffect = receiptJournalEffect(original, byId, nextVisiting);
      return { received: -originalEffect.received, allocated: -originalEffect.allocated };
    }
    default:
      throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  }
}

/** Reconstruct Project cash received and invoice allocations from immutable Finance history. */
function calculateReceiptFinancials(journals: readonly ReceiptFinanceJournal[]): ReceiptFinancialEffect {
  const byId = new Map(journals.map((journal) => [journal.id, journal]));
  let received = 0n;
  let allocated = 0n;
  for (const journal of journals) {
    const effect = receiptJournalEffect(journal, byId);
    received += effect.received;
    allocated += effect.allocated;
  }
  return { received: requireNonNegative(received), allocated: requireNonNegative(allocated) };
}

/** Resolve one Receipt Journal to exactly one visible Project and one explicit or null Stage. */
function receiptJournalAttribution(journal: ReceiptFinanceJournal): Readonly<{ projectId: string; stageId: string | null }> {
  const projectIds = new Set(journal.lines.map((line) => line.projectId).filter((projectId): projectId is string => Boolean(projectId)));
  const stageIds = new Set(journal.lines.map((line) => line.stageId ?? ''));
  if (journal.lines.length === 0 || journal.lines.some((line) => !line.projectId) || projectIds.size !== 1 || stageIds.size !== 1) {
    throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  }
  return { projectId: [...projectIds][0] as string, stageId: ([...stageIds][0] as string) || null };
}

/** Keep only Receipt Finance history that belongs to one Project and optional exact Stage bucket. */
function receiptSourcesFor(
  journals: readonly ReceiptFinanceJournal[],
  projectId: string,
  stageId?: string | null
): ReceiptFinanceJournal[] {
  return journals.filter((journal) => {
    const attribution = receiptJournalAttribution(journal);
    return attribution.projectId === projectId && (stageId === undefined || attribution.stageId === stageId);
  });
}

/** Require every billed Client Invoice to have its Finance-confirmed revenue source Journal. */
function requireRecognizedRevenueOwnership(
  billedSources: readonly Readonly<{ clientInvoiceId: string }>[],
  revenueSources: readonly Readonly<{ journal: Readonly<{ sourceType: string; sourceId: string | null }> }>[]
): void {
  const billedInvoiceIds = new Set(billedSources.map((source) => source.clientInvoiceId));
  if (billedInvoiceIds.size === 0) return;
  const financeInvoiceIds = new Set(
    revenueSources
      .filter((source) => source.journal.sourceType === 'client_invoice' && source.journal.sourceId)
      .map((source) => source.journal.sourceId as string)
  );
  for (const invoiceId of billedInvoiceIds) {
    if (!financeInvoiceIds.has(invoiceId)) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  }
}

/** Calculate net Finance-confirmed revenue as Revenue credits less debits. */
function calculateRecognizedRevenue(
  rows: readonly Readonly<{ debit: DecimalLike; credit: DecimalLike }>[]
): bigint {
  return rows.reduce(
    (sum, row) => sum + moneyToMinorUnits(row.credit) - moneyToMinorUnits(row.debit),
    0n
  );
}

/** Calculate posted Supplier payable without inventing a separate AP balance. */
function calculateSupplierPayable(
  invoices: readonly Readonly<{
    totalAmount: DecimalLike;
    allocations: readonly Readonly<{ amount: DecimalLike }>[];
  }>[]
): bigint {
  return invoices.reduce((sum, invoice) => {
    const total = requireNonNegative(moneyToMinorUnits(invoice.totalAmount));
    const allocated = requireNonNegative(sumMoney(invoice.allocations, (allocation) => allocation.amount));
    if (allocated > total) throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
    return sum + (total - allocated);
  }, 0n);
}

/** Convert six independent source values into the frozen nine-value financial response. */
function buildFinancialValues(input: Readonly<{
  recognizedRevenue: bigint;
  actualCost: bigint;
  billedAmount: bigint;
  receivedAmount: bigint;
  allocatedAmount: bigint;
  supplierPayableAmount: bigint;
}>): ProjectProfitabilityFinancialValues {
  const recognizedRevenue = input.recognizedRevenue;
  const actualCost = input.actualCost;
  const billedAmount = requireNonNegative(input.billedAmount);
  const receivedAmount = requireNonNegative(input.receivedAmount);
  const allocatedAmount = requireNonNegative(input.allocatedAmount);
  const supplierPayableAmount = requireNonNegative(input.supplierPayableAmount);
  if (allocatedAmount > receivedAmount || allocatedAmount > billedAmount) {
    throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
  }
  const advanceAmount = receivedAmount - allocatedAmount;
  const outstandingAmount = billedAmount - allocatedAmount;
  const profitAmount = recognizedRevenue - actualCost;
  return {
    recognizedRevenue: minorUnitsToMoney(recognizedRevenue),
    actualCost: minorUnitsToMoney(actualCost),
    profitAmount: minorUnitsToMoney(profitAmount),
    billedAmount: minorUnitsToMoney(billedAmount),
    receivedAmount: minorUnitsToMoney(receivedAmount),
    allocatedAmount: minorUnitsToMoney(allocatedAmount),
    advanceAmount: minorUnitsToMoney(advanceAmount),
    outstandingAmount: minorUnitsToMoney(outstandingAmount),
    supplierPayableAmount: minorUnitsToMoney(supplierPayableAmount)
  };
}

/** Derive one Project or Stage financial bucket from already-scoped source rows. */
function calculateFinancialBucket(input: Readonly<{
  actualCostSources: readonly Readonly<{ amount: DecimalLike }>[];
  billedSources: readonly Readonly<{ clientInvoiceId: string; amount: DecimalLike }>[];
  revenueSources: readonly Readonly<{ debit: DecimalLike; credit: DecimalLike; journal: Readonly<{ sourceType: string; sourceId: string | null }> }>[];
  receiptSources: readonly ReceiptFinanceJournal[];
  supplierPayableSources: readonly Readonly<{ totalAmount: DecimalLike; allocations: readonly Readonly<{ amount: DecimalLike }>[] }>[];
}>): ProjectProfitabilityFinancialValues {
  requireRecognizedRevenueOwnership(input.billedSources, input.revenueSources);
  const receiptFinancials = calculateReceiptFinancials(input.receiptSources);
  return buildFinancialValues({
    recognizedRevenue: calculateRecognizedRevenue(input.revenueSources),
    actualCost: sumMoney(input.actualCostSources, (source) => source.amount),
    billedAmount: sumMoney(input.billedSources, (source) => source.amount),
    receivedAmount: receiptFinancials.received,
    allocatedAmount: receiptFinancials.allocated,
    supplierPayableAmount: calculateSupplierPayable(input.supplierPayableSources)
  });
}

/** Select one Project and optional exact Stage from the bulk source bundle. */
function financialBucketFor(
  sources: FinancialSourceBundle,
  projectId: string,
  stageId?: string | null,
  includeSupplierPayable = true
): ProjectProfitabilityFinancialValues {
  const exactStage = stageId !== undefined;
  return calculateFinancialBucket({
    actualCostSources: sources.actualCostSources.filter((source) => source.projectId === projectId && (!exactStage || source.stageId === stageId)),
    billedSources: sources.billedSources.filter((source) => source.invoice.projectId === projectId && (!exactStage || source.stageId === stageId)),
    revenueSources: sources.revenueSources.filter((source) => source.projectId === projectId && (!exactStage || source.stageId === stageId)),
    receiptSources: receiptSourcesFor(sources.receiptSources, projectId, stageId),
    supplierPayableSources: includeSupplierPayable
      ? sources.supplierPayableSources.filter((source) => source.projectId === projectId)
      : []
  });
}

/** Verify that every Stage financial measure plus Project-only measure equals the Project total. */
function requireStageReconciliation(
  stages: readonly Readonly<ProjectProfitabilityFinancialValues>[],
  projectOnly: ProjectProfitabilityFinancialValues,
  projectTotal: ProjectProfitabilityFinancialValues
): void {
  for (const field of FINANCIAL_VALUE_FIELDS) {
    const stageTotal = stages.reduce((sum, stage) => sum + moneyToMinorUnits(stage[field]), 0n);
    const reconciled = stageTotal + moneyToMinorUnits(projectOnly[field]);
    if (reconciled !== moneyToMinorUnits(projectTotal[field])) {
      throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
    }
  }
}

/** Build one inclusive source window for an as-of Project profitability read. */
function sourceWindow(asOfDate: string) {
  return {
    throughDate: inputDate(asOfDate),
    postedThrough: endOfInputDate(asOfDate)
  } as const;
}

/** Return the stable DAY, Monday-based WEEK or calendar-MONTH bucket key for one UTC date. */
function trendBucketKey(value: Date, granularity: ProjectProfitabilityTrendGranularity): string {
  if (granularity === 'DAY') return dateOnly(value);
  if (granularity === 'MONTH') return `${dateOnly(value).slice(0, 7)}-01`;
  const day = value.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return dateOnly(addUtcDays(value, mondayOffset));
}

/** Create request-clipped trend buckets and include empty periods for deterministic charts. */
function createTrendBuckets(query: ProjectProfitabilityTrendQuery): Map<string, TrendBucket> {
  const buckets = new Map<string, TrendBucket>();
  const toDate = inputDate(query.toDate);
  for (let current = inputDate(query.fromDate); current <= toDate; current = addUtcDays(current, 1)) {
    const key = trendBucketKey(current, query.granularity);
    const currentDate = dateOnly(current);
    const existing = buckets.get(key);
    if (existing) existing.periodEnd = currentDate;
    else buckets.set(key, { periodStart: currentDate, periodEnd: currentDate, recognizedRevenue: 0n, actualCost: 0n });
  }
  return buckets;
}

/** Return true only when one date is inside the validated inclusive trend window. */
function dateInsideTrend(value: Date, query: ProjectProfitabilityTrendQuery): boolean {
  const date = dateOnly(value);
  return date >= query.fromDate && date <= query.toDate;
}

/** Keep the intersection of Project IDs returned for every required permission. */
function intersectProjectIds(projectIdSets: readonly (readonly string[])[]): string[] {
  if (projectIdSets.length === 0) return [];
  const [first, ...rest] = projectIdSets;
  return (first ?? []).filter((projectId) => rest.every((set) => set.includes(projectId))).sort();
}

/** Orchestrate deterministic, read-only Final Module 19 profitability calculations. */
export class ProjectProfitabilityService {
  /** Bind Project Profitability business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require Project-level Module 19 read and finance permissions inside trusted request scope. */
  private async requireProjectReadAccess(projectId: string, asOf: Date): Promise<ProjectProfitabilityRepositoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') {
      throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');
    }
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) {
      throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');
    }

    const requiredPermissions: readonly ProjectProfitabilityPermissionCode[] = [
      'project_profitability.read',
      'project_profitability.finance.read'
    ];
    const permissions = await new AdministrationRepository(this.db).findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (!permissions || requiredPermissions.some((permission) => !permissions.includes(permission))) {
      throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');
    }
    return { allowedProjectIds: [projectId] };
  }

  /** Resolve Projects that satisfy request scope plus read, finance-read and portfolio-read permissions. */
  private async requirePortfolioReadAccess(asOf: Date): Promise<ProjectProfitabilityRepositoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') {
      throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');
    }
    const candidateIds = security.projectScope.kind === 'all' ? null : security.projectScope.projectIds;
    const repository = new AdministrationRepository(this.db);
    const lookup = {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    } as const;
    const projectIdSets = await Promise.all([
      repository.listProjectIdsWithPermission('project_profitability.read', candidateIds, lookup),
      repository.listProjectIdsWithPermission('project_profitability.finance.read', candidateIds, lookup),
      repository.listProjectIdsWithPermission('project_profitability.portfolio.read', candidateIds, lookup)
    ]);
    return { allowedProjectIds: intersectProjectIds(projectIdSets) };
  }

  /** Read the five approved/posted source groups once for one visible Project set. */
  private async readFinancialSources(
    repository: ProjectProfitabilityRepository,
    projectIds: readonly string[],
    asOfDate: string,
    visibility: ProjectProfitabilityRepositoryVisibility
  ): Promise<FinancialSourceBundle> {
    const window = sourceWindow(asOfDate);
    const [actualCostSources, billedSources, revenueSources, receiptSources, supplierPayableSources] = await Promise.all([
      repository.listActualCostSources(projectIds, window, visibility),
      repository.listBilledSources(projectIds, window, visibility),
      repository.listRecognizedRevenueSources(projectIds, window, visibility),
      repository.listClientReceiptFinanceSources(projectIds, window, visibility),
      repository.listSupplierPayableSources(projectIds, window, visibility)
    ]);
    return { actualCostSources, billedSources, revenueSources, receiptSources, supplierPayableSources };
  }

  /** Return one Project summary derived only from approved/posted source-module history. */
  async getProjectSummary(projectId: string, query: ProjectProfitabilityAsOfQuery): Promise<ProjectProfitabilitySummaryResponse> {
    const now = new Date();
    const asOfDate = query.asOfDate ?? dateOnly(now);
    const visibility = await this.requireProjectReadAccess(projectId, now);
    const repository = new ProjectProfitabilityRepository(this.db);
    const project = await repository.findProject(projectId, visibility);
    if (!project) throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');

    const window = sourceWindow(asOfDate);
    const projectIds = [projectId] as const;
    const [actualCostSources, billedSources, revenueSources, receiptSources, supplierPayableSources] = await Promise.all([
      repository.listActualCostSources(projectIds, window, visibility),
      repository.listBilledSources(projectIds, window, visibility),
      repository.listRecognizedRevenueSources(projectIds, window, visibility),
      repository.listClientReceiptFinanceSources(projectIds, window, visibility),
      repository.listSupplierPayableSources(projectIds, window, visibility)
    ]);

    requireRecognizedRevenueOwnership(billedSources, revenueSources);
    const actualCost = sumMoney(actualCostSources, (source) => source.amount);
    const billedAmount = requireNonNegative(sumMoney(billedSources, (source) => source.amount));
    const recognizedRevenue = calculateRecognizedRevenue(revenueSources);
    const receiptFinancials = calculateReceiptFinancials(receiptSources);
    if (receiptFinancials.allocated > receiptFinancials.received || receiptFinancials.allocated > billedAmount) {
      throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
    }
    const advanceAmount = receiptFinancials.received - receiptFinancials.allocated;
    const outstandingAmount = billedAmount - receiptFinancials.allocated;
    const supplierPayableAmount = calculateSupplierPayable(supplierPayableSources);
    const profitAmount = recognizedRevenue - actualCost;

    return projectProfitabilitySummaryResponseSchema.parse({
      projectId: project.id,
      projectCode: project.projectCode,
      projectName: project.name,
      currency: project.currency,
      asOfDate,
      recognizedRevenue: minorUnitsToMoney(recognizedRevenue),
      actualCost: minorUnitsToMoney(actualCost),
      profitAmount: minorUnitsToMoney(profitAmount),
      billedAmount: minorUnitsToMoney(billedAmount),
      receivedAmount: minorUnitsToMoney(receiptFinancials.received),
      allocatedAmount: minorUnitsToMoney(receiptFinancials.allocated),
      advanceAmount: minorUnitsToMoney(advanceAmount),
      outstandingAmount: minorUnitsToMoney(outstandingAmount),
      supplierPayableAmount: minorUnitsToMoney(supplierPayableAmount)
    });
  }

  /** Return Stage profitability plus one explicit Project-only reconciliation bucket. */
  async getProjectStages(projectId: string, query: ProjectProfitabilityAsOfQuery): Promise<ProjectProfitabilityStagesResponse> {
    const now = new Date();
    const asOfDate = query.asOfDate ?? dateOnly(now);
    const visibility = await this.requireProjectReadAccess(projectId, now);
    const repository = new ProjectProfitabilityRepository(this.db);
    const project = await repository.findProject(projectId, visibility);
    if (!project) throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');

    const [stageSources, sources] = await Promise.all([
      repository.listProjectStages([projectId], inputDate(asOfDate), visibility),
      this.readFinancialSources(repository, [projectId], asOfDate, visibility)
    ]);
    const stageIds = new Set(stageSources.map((stage) => stage.id));
    const sourceStageIds = [
      ...sources.actualCostSources.map((source) => source.stageId),
      ...sources.billedSources.map((source) => source.stageId),
      ...sources.revenueSources.map((source) => source.stageId),
      ...sources.receiptSources.map((source) => receiptJournalAttribution(source).stageId)
    ].filter((stageId): stageId is string => Boolean(stageId));
    if (sourceStageIds.some((stageId) => !stageIds.has(stageId))) {
      throw createProjectProfitabilityError('PROFITABILITY_SOURCE_INCOMPLETE');
    }

    const stages = stageSources.map((stage) => ({
      stageId: stage.id,
      stageCode: stage.code,
      stageName: stage.name,
      sequenceNo: stage.sequenceNo,
      weightPercent: stage.weightPercent.toString(),
      physicalProgressPercent: stage.progressUpdates[0]?.progressPercent.toString() ?? '0',
      plannedAmount: stage.plannedAmount?.toString() ?? null,
      ...financialBucketFor(sources, projectId, stage.id, false)
    }));
    const projectOnly = financialBucketFor(sources, projectId, null, true);
    const projectTotal = financialBucketFor(sources, projectId, undefined, true);
    requireStageReconciliation(stages, projectOnly, projectTotal);

    return projectProfitabilityStagesResponseSchema.parse({
      projectId: project.id,
      currency: project.currency,
      asOfDate,
      stages,
      projectOnly,
      projectTotal
    });
  }

  /** Return bounded revenue, actual-cost and profit buckets without mixing in cash or payable values. */
  async getProjectTrend(projectId: string, query: ProjectProfitabilityTrendQuery): Promise<ProjectProfitabilityTrendResponse> {
    const now = new Date();
    const visibility = await this.requireProjectReadAccess(projectId, now);
    const repository = new ProjectProfitabilityRepository(this.db);
    const project = await repository.findProject(projectId, visibility);
    if (!project) throw createProjectProfitabilityError('PROFITABILITY_SCOPE_FORBIDDEN');

    const window = {
      fromDate: inputDate(query.fromDate),
      throughDate: inputDate(query.toDate),
      postedThrough: endOfInputDate(query.toDate)
    } as const;
    const [actualCostSources, billedSources, revenueSources] = await Promise.all([
      repository.listActualCostSources([projectId], window, visibility),
      repository.listBilledSources([projectId], window, visibility),
      repository.listRecognizedRevenueSources([projectId], window, visibility)
    ]);
    requireRecognizedRevenueOwnership(billedSources, revenueSources);

    const buckets = createTrendBuckets(query);
    for (const source of actualCostSources) {
      if (!dateInsideTrend(source.postingDate, query)) continue;
      const bucket = buckets.get(trendBucketKey(source.postingDate, query.granularity));
      if (bucket) bucket.actualCost += moneyToMinorUnits(source.amount);
    }
    for (const source of revenueSources) {
      if (!dateInsideTrend(source.journal.postingDate, query)) continue;
      const bucket = buckets.get(trendBucketKey(source.journal.postingDate, query.granularity));
      if (bucket) bucket.recognizedRevenue += moneyToMinorUnits(source.credit) - moneyToMinorUnits(source.debit);
    }

    const points = [...buckets.values()].map((bucket) => ({
      periodStart: bucket.periodStart,
      periodEnd: bucket.periodEnd,
      recognizedRevenue: minorUnitsToMoney(bucket.recognizedRevenue),
      actualCost: minorUnitsToMoney(bucket.actualCost),
      profitAmount: minorUnitsToMoney(bucket.recognizedRevenue - bucket.actualCost)
    }));
    return projectProfitabilityTrendResponseSchema.parse({
      projectId: project.id,
      currency: project.currency,
      fromDate: query.fromDate,
      toDate: query.toDate,
      granularity: query.granularity,
      points
    });
  }

  /** Return one bounded permission-scoped portfolio page while keeping every Project currency separate. */
  async getPortfolio(query: ProjectProfitabilityPortfolioQuery): Promise<ProjectProfitabilityPortfolioResponse> {
    const now = new Date();
    const asOfDate = query.asOfDate ?? dateOnly(now);
    const visibility = await this.requirePortfolioReadAccess(now);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PORTFOLIO_PAGE_SIZE;
    const repository = new ProjectProfitabilityRepository(this.db);
    const result = await repository.listPortfolioProjects({
      allowedProjectIds: visibility.allowedProjectIds,
      skip: (page - 1) * pageSize,
      take: pageSize,
      search: query.search,
      clientId: query.clientId
    });
    const projectIds = result.items.map((project) => project.id);
    const sources = await this.readFinancialSources(repository, projectIds, asOfDate, visibility);
    const items = result.items.map((project) => ({
      projectId: project.id,
      projectCode: project.projectCode,
      projectName: project.name,
      clientId: project.clientId,
      currency: project.currency,
      ...financialBucketFor(sources, project.id)
    }));

    return projectProfitabilityPortfolioResponseSchema.parse({
      asOfDate,
      items,
      total: result.total,
      page,
      pageSize
    });
  }
}
