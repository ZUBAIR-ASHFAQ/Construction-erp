import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient } from '@construction-erp/database';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { assertCompanyObjectKey, type ObjectStorage } from '@construction-erp/storage';
import { enqueueJob } from '@construction-erp/queue';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { DocumentsRepository } from '../documents-audit/documents-audit.repository.js';
import { BudgetsJobCostRepository } from '../budgets-job-cost/budgets-job-cost.repository.js';
import { BudgetsJobCostService } from '../budgets-job-cost/budgets-job-cost.service.js';
import { ClientBillingRepository } from '../client-billing/client-billing.repository.js';
import { ClientReceiptsRepository } from '../client-receipts/client-receipts.repository.js';
import { ClientReceiptsService } from '../client-receipts/client-receipts.service.js';
import { listClientReceiptsQuerySchema } from '../client-receipts/client-receipts.schema.js';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import {
  financeLedgerQuerySchema,
  listCashBankAccountsQuerySchema
} from '../finance/finance.schema.js';
import { InventoryService } from '../inventory/inventory.service.js';
import { listLedgerQuerySchema } from '../inventory/inventory.schema.js';
import { LabourPayrollService } from '../labour-payroll/labour-payroll.service.js';
import {
  listAttendanceQuerySchema,
  listPayrollRunsQuerySchema
} from '../labour-payroll/labour-payroll.schema.js';
import { ProcurementService } from '../procurement/procurement.service.js';
import { listPurchaseOrdersQuerySchema } from '../procurement/procurement.schema.js';
import { ProjectProfitabilityService } from '../project-profitability/project-profitability.service.js';
import { ProjectStagesService } from '../project-stages/project-stages.service.js';
import { SiteExpensesService } from '../site-expenses/site-expenses.service.js';
import { listSiteExpensesQuerySchema } from '../site-expenses/site-expenses.schema.js';
import { SupplierPayablesService } from '../supplier-payables/supplier-payables.service.js';
import {
  listSupplierInvoicesQuerySchema,
  listSupplierPaymentsQuerySchema,
  supplierAgingQuerySchema
} from '../supplier-payables/supplier-payables.schema.js';
import { ReportsRepository } from './reports.repository.js';
import {
  REPORT_CODES,
  REPORT_EXPORT_JOB_TYPE,
  REPORT_EXPORT_MAX_ROWS,
  REPORT_EXPORT_QUEUE_NAME,
  REPORT_OUTPUT_FORMATS,
  REPORTS_MAX_PAGE_SIZE,
  REPORTS_PERMISSION_CODES,
  createReportsError,
  reportCatalogResponseSchema,
  reportDownloadResponseSchema,
  reportFiltersSchema,
  reportRunResponseSchema,
  runReportResponseSchema,
  savedReportFilterResponseSchema,
  savedReportFiltersResponseSchema,
  type CreateReportExportBody,
  type ReportCatalogQuery,
  type ReportCatalogResponse,
  type ReportCode,
  type ReportDownloadResponse,
  type ReportFilters,
  type ReportOutputFormat,
  type ReportRunResponse,
  type ReportsPermissionCode,
  type RunReportBody,
  type RunReportResponse,
  type SaveReportFilterBody,
  type SavedReportFilterResponse,
  type SavedReportFiltersQuery,
  type SavedReportFiltersResponse
} from './reports.schema.js';

const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const DEFAULT_PAGE_SIZE = 25;

/** Server-owned Company, actor, permission, and Project visibility for one Reports operation. */
export type ReportsServiceScope = Readonly<{
  companyId: string;
  actorUserId: string;
  permissions: readonly string[];
  allowedProjectIds: readonly string[] | null;
}>;

type ReportDefinitionMetadata = Readonly<{
  code: ReportCode;
  name: string;
  domain: string;
  requiredPermissions: readonly ReportsPermissionCode[];
  outputFormats: readonly ReportOutputFormat[];
  status: string;
}>;

type SafeSchema<T> = Readonly<{
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}>;

type ReportResult = Readonly<{
  rows: readonly Record<string, unknown>[];
  total?: number;
  page?: number;
  pageSize?: number;
}>;

const REPORT_SOURCE_PERMISSIONS: Readonly<Record<ReportCode, readonly string[]>> = Object.freeze({
  'project-cost': ['job_cost.read'],
  'budget-vs-actual': ['job_cost.read'],
  'project-profit-loss': ['project_profitability.read', 'project_profitability.finance.read'],
  'project-expenses': ['site_expenses.read'],
  'project-material': ['inventory.read'],
  'stage-progress': ['stages.read'],
  'stage-cost': ['stages.financial.read'],
  'stage-billing': ['stages.financial.read'],
  'stage-receipts': ['stages.financial.read'],
  'client-billing': ['client_invoices.read'],
  'client-payments': ['client_receipts.read'],
  'client-outstanding': ['client_billing.read', 'client_receipts.read'],
  'client-advance': ['client_billing.read', 'client_receipts.read'],
  'client-aging': ['client_invoices.read', 'client_receipts.read'],
  'supplier-purchases': ['procurement.read'],
  'supplier-payables': ['supplier_payables.read'],
  'supplier-payments': ['supplier_payables.read'],
  'supplier-aging': ['supplier_payables.read'],
  attendance: ['attendance.read'],
  payroll: ['payroll.read'],
  'labour-cost': ['job_cost.read'],
  'cash-bank': ['finance.read'],
  'general-ledger': ['finance.read'],
  'profit-loss': ['finance.read'],
  'balance-sheet': ['finance.read'],
  'cash-flow': ['finance.read']
});

const REPORT_ALLOWED_FILTERS: Readonly<Record<ReportCode, readonly (keyof ReportFilters)[]>> = Object.freeze({
  'project-cost': ['projectId', 'page', 'pageSize'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId', 'asOfDate'],
  'project-expenses': ['projectId', 'stageId', 'fromDate', 'toDate', 'status', 'page', 'pageSize'],
  'project-material': ['projectId', 'stageId', 'warehouseId', 'materialId', 'page', 'pageSize'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-billing': ['clientId', 'projectId', 'fromDate', 'toDate', 'status', 'page', 'pageSize'],
  'client-payments': ['clientId', 'projectId', 'stageId', 'fromDate', 'toDate', 'status', 'page', 'pageSize'],
  'client-outstanding': ['clientId', 'projectId'],
  'client-advance': ['clientId', 'projectId'],
  'client-aging': ['clientId', 'projectId', 'asOfDate', 'page', 'pageSize'],
  'supplier-purchases': ['projectId', 'page', 'pageSize'],
  'supplier-payables': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status', 'page', 'pageSize'],
  'supplier-payments': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status', 'page', 'pageSize'],
  'supplier-aging': ['vendorId', 'projectId', 'asOfDate', 'page', 'pageSize'],
  attendance: ['projectId', 'employeeId', 'fromDate', 'toDate', 'page', 'pageSize'],
  payroll: ['page', 'pageSize'],
  'labour-cost': ['projectId', 'stageId', 'fromDate', 'toDate', 'page', 'pageSize'],
  'cash-bank': ['status', 'page', 'pageSize'],
  'general-ledger': ['periodId', 'accountId', 'projectId', 'stageId', 'page', 'pageSize'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

const REPORT_REQUIRED_FILTERS: Readonly<Partial<Record<ReportCode, readonly (keyof ReportFilters)[]>>> = Object.freeze({
  'project-cost': ['projectId'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-outstanding': ['clientId'],
  'client-advance': ['clientId'],
  'labour-cost': ['projectId'],
  'general-ledger': ['periodId'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

/** Return true only for one frozen Reports permission code. */
function isReportsPermissionCode(value: unknown): value is ReportsPermissionCode {
  return typeof value === 'string' && (REPORTS_PERMISSION_CODES as readonly string[]).includes(value);
}

/** Return true only for one frozen Reports output format. */
function isReportOutputFormat(value: unknown): value is ReportOutputFormat {
  return typeof value === 'string' && (REPORT_OUTPUT_FORMATS as readonly string[]).includes(value);
}

/** Return true only for one frozen Final-21 report code. */
function isReportCode(value: unknown): value is ReportCode {
  return typeof value === 'string' && (REPORT_CODES as readonly string[]).includes(value);
}

/** Convert server-owned report-definition JSON into a small validated metadata object. */
function parseReportDefinition(row: Readonly<{
  code: string;
  name: string;
  domain: string;
  requiredPermissions: unknown;
  outputFormats: unknown;
  status: string;
}>): ReportDefinitionMetadata | null {
  if (!isReportCode(row.code)) return null;
  if (!Array.isArray(row.requiredPermissions) || !row.requiredPermissions.every(isReportsPermissionCode)) return null;
  if (!Array.isArray(row.outputFormats) || !row.outputFormats.every(isReportOutputFormat) || row.outputFormats.length === 0) return null;

  return {
    code: row.code,
    name: row.name,
    domain: row.domain,
    requiredPermissions: [...new Set(row.requiredPermissions)],
    outputFormats: [...new Set(row.outputFormats)],
    status: row.status
  };
}

/** Return true when one permission set contains every required permission. */
function hasAllPermissions(permissions: readonly string[], required: readonly string[]): boolean {
  return required.every((permission) => permissions.includes(permission));
}

/** Validate persisted filter JSON before returning or reusing it. */
function parseStoredFilters(value: unknown): ReportFilters {
  const parsed = reportFiltersSchema.safeParse(value);
  if (!parsed.success) throw createReportsError('REPORT_FILTER_INVALID');
  return parsed.data;
}

/** Parse a source-module query and expose invalid report filters through one stable Reports error. */
function parseSourceQuery<T>(schema: SafeSchema<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw createReportsError('REPORT_FILTER_INVALID');
  return parsed.data;
}

/** Validate that one report uses only its declared filters and required identifiers. */
function validateReportFilters(reportCode: ReportCode, filters: ReportFilters): void {
  const allowed = new Set<keyof ReportFilters>(REPORT_ALLOWED_FILTERS[reportCode]);
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && !allowed.has(key as keyof ReportFilters)) throw createReportsError('REPORT_FILTER_INVALID');
  }
  for (const key of REPORT_REQUIRED_FILTERS[reportCode] ?? []) {
    if (filters[key] === undefined) throw createReportsError('REPORT_FILTER_INVALID');
  }
  if (filters.stageId && !filters.projectId) throw createReportsError('REPORT_FILTER_INVALID');
}

/** Return true when one report exposes bounded page and page-size filters. */
function reportSupportsPagination(reportCode: ReportCode): boolean {
  const allowed = REPORT_ALLOWED_FILTERS[reportCode];
  return allowed.includes('page') && allowed.includes('pageSize');
}

/** Remove browser pagination so one export can page through the complete bounded result itself. */
function withoutPagination(filters: ReportFilters): ReportFilters {
  const { page: _page, pageSize: _pageSize, ...rest } = filters;
  return rest;
}

/** Convert one date-only filter to the source modules' UTC date boundary. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Convert one date-only filter to the inclusive UTC end-of-day boundary. */
function endOfInputDate(value: string): Date {
  return new Date(`${value}T23:59:59.999Z`);
}

/** Return a stable YYYY-MM-DD value for one Date. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Build one bounded page window shared by report-only source reads. */
function pageWindow(filters: ReportFilters): Readonly<{ page: number; pageSize: number; skip: number; take: number }> {
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Convert exact decimal money to integer minor units for deterministic report arithmetic. */
function moneyToMinorUnits(value: unknown): bigint {
  const text = value === null || value === undefined ? '0' : String(value);
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minor = (BigInt(whole || '0') * 100n) + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -minor : minor;
}

/** Convert exact integer minor units back to a stable two-decimal string. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Convert Dates, decimals, and BigInt source values into JSON-safe report data. */
function toJsonSafe(value: unknown): unknown {
  const serialized = JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item);
  return serialized === undefined ? null : JSON.parse(serialized);
}

/** Normalize one source-module result into the generic synchronous Reports envelope. */
function normalizeReportResult(value: unknown): ReportResult {
  const safe = toJsonSafe(value);
  if (Array.isArray(safe)) {
    return { rows: safe.map((item) => typeof item === 'object' && item !== null ? item as Record<string, unknown> : { value: item }) };
  }
  if (typeof safe !== 'object' || safe === null) return { rows: [{ value: safe }] };

  const object = safe as Record<string, unknown>;
  const sourceRows = Array.isArray(object.items) ? object.items : Array.isArray(object.rows) ? object.rows : null;
  if (!sourceRows) return { rows: [object] };
  const rows = sourceRows.map((item) => typeof item === 'object' && item !== null ? item as Record<string, unknown> : { value: item });
  return {
    rows,
    ...(typeof object.total === 'number' ? { total: object.total } : {}),
    ...(typeof object.page === 'number' ? { page: object.page } : {}),
    ...(typeof object.pageSize === 'number' ? { pageSize: object.pageSize } : {})
  };
}

/** Classify one positive overdue day count into a stable client-aging bucket. */
function clientAgingBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'CURRENT';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

/** Convert one repository report-run row into the frozen public response contract. */
function reportRunResponse(row: Readonly<{
  id: string;
  reportCode: string;
  outputFormat: string;
  status: string;
  fileId: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorCode: string | null;
}>): ReportRunResponse {
  return reportRunResponseSchema.parse({
    id: row.id,
    reportCode: row.reportCode,
    outputFormat: row.outputFormat,
    status: row.status,
    fileId: row.fileId,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    errorCode: row.errorCode
  });
}

/** Convert one persisted saved-filter row into its strict public response. */
function savedFilterResponse(row: Readonly<{
  id: string;
  reportCode: string;
  name: string;
  filtersJson: unknown;
  createdAt: Date;
}>): SavedReportFilterResponse {
  return savedReportFilterResponseSchema.parse({
    id: row.id,
    reportCode: row.reportCode,
    name: row.name,
    filters: parseStoredFilters(row.filtersJson),
    createdAt: row.createdAt.toISOString()
  });
}

/** Orchestrate permission-safe Report catalog, synchronous reads, exports, and saved filters. */
export class ReportsService {
  /** Bind Reports business rules to the application database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Revalidate request context, Company permissions, and optional Project visibility. */
  private async requireScope(requiredPermissions: readonly string[], projectId?: string): Promise<ReportsServiceScope> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw createReportsError('REPORT_SCOPE_FORBIDDEN');
    if (projectId && security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) {
      throw createReportsError('REPORT_SCOPE_FORBIDDEN');
    }
    if (!hasAllPermissions(security.permissions, requiredPermissions)) throw createReportsError('REPORT_SCOPE_FORBIDDEN');

    const repository = new AdministrationRepository(this.db);
    const lookup = {
      userId: security.actorUserId,
      asOf: new Date(),
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    } as const;
    const effectivePermissions = projectId
      ? await repository.findEffectivePermissionCodesForProject(projectId, lookup)
      : await repository.findEffectivePermissionCodes(lookup);
    if (!effectivePermissions || !hasAllPermissions(effectivePermissions, requiredPermissions)) {
      throw createReportsError('REPORT_SCOPE_FORBIDDEN');
    }

    const allowedProjectIds = projectId
      ? [projectId]
      : security.projectScope.kind === 'all'
        ? null
        : [...new Set(security.projectScope.projectIds)].sort();

    return {
      companyId: security.companyId,
      actorUserId: security.actorUserId,
      permissions: effectivePermissions.filter((permission) => security.permissions.includes(permission)),
      allowedProjectIds
    };
  }

  /** Load one active report definition and enforce report plus source permissions and Project scope. */
  private async requireReportAccess(
    reportCode: ReportCode,
    filters: ReportFilters,
    extraPermissions: readonly string[] = []
  ): Promise<Readonly<{ definition: ReportDefinitionMetadata; scope: ReportsServiceScope }>> {
    const row = await new ReportsRepository(this.db).findReportDefinitionByCode(reportCode);
    if (!row) throw createReportsError('REPORT_NOT_FOUND');
    const definition = parseReportDefinition(row);
    if (!definition) throw createReportsError('REPORT_NOT_FOUND');

    const requiredPermissions = [...new Set<string>([
      'reports.read',
      ...definition.requiredPermissions,
      ...extraPermissions
    ])];
    const scope = await this.requireScope(requiredPermissions, filters.projectId);
    return { definition, scope };
  }

  /** Read current client billed, allocated, outstanding, received, and advance amounts without double counting cash. */
  private async readClientPosition(filters: ReportFilters, scope: ReportsServiceScope) {
    const clientId = filters.clientId as string;
    const visibility = { allowedProjectIds: scope.allowedProjectIds };
    const [billing, receipts] = await Promise.all([
      new ClientBillingRepository(this.db).readClientBillingSummary(clientId, visibility, filters.projectId),
      new ClientReceiptsRepository(this.db).readReceiptFinancialTotals({
        clientId,
        ...(filters.projectId ? { projectId: filters.projectId } : {}),
        allowedProjectIds: scope.allowedProjectIds
      })
    ]);
    const billed = moneyToMinorUnits(billing.billedAmount);
    const received = moneyToMinorUnits(receipts.receivedAmount);
    const allocated = moneyToMinorUnits(receipts.allocatedAmount);
    return {
      clientId,
      billedAmount: minorUnitsToMoney(billed),
      receivedAmount: minorUnitsToMoney(received),
      allocatedAmount: minorUnitsToMoney(allocated),
      outstandingAmount: minorUnitsToMoney(billed - allocated),
      advanceAmount: minorUnitsToMoney(received - allocated)
    };
  }

  /** Build bounded client invoice aging from issued invoices and posted receipt allocations. */
  private async readClientAging(filters: ReportFilters, scope: ReportsServiceScope) {
    const window = pageWindow(filters);
    const asOfDate = filters.asOfDate ?? dateOnly(new Date());
    const invoiceRepository = new ClientBillingRepository(this.db);
    const allocationRepository = new ClientReceiptsRepository(this.db);
    const result = await invoiceRepository.listInvoices({
      skip: window.skip,
      take: window.take,
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
      statuses: ['ISSUED'],
      toDate: inputDate(asOfDate)
    }, { allowedProjectIds: scope.allowedProjectIds });
    const allocationGroups = await allocationRepository.sumAllocatedAmountsForInvoices(
      result.items.map((invoice) => invoice.id),
      endOfInputDate(asOfDate)
    );
    const allocatedByInvoice = new Map(allocationGroups.map((group) => [
      group.clientInvoiceId,
      moneyToMinorUnits(group._sum.amount)
    ]));
    const asOf = inputDate(asOfDate).getTime();
    const items = result.items.map((invoice) => {
      const total = moneyToMinorUnits(invoice.totalAmount);
      const allocated = allocatedByInvoice.get(invoice.id) ?? 0n;
      const dueDate = invoice.dueDate ?? invoice.invoiceDate;
      const daysOverdue = Math.max(0, Math.floor((asOf - dueDate.getTime()) / 86_400_000));
      return {
        invoiceId: invoice.id,
        invoiceNo: invoice.invoiceNo,
        clientId: invoice.clientId,
        projectId: invoice.projectId,
        invoiceDate: dateOnly(invoice.invoiceDate),
        dueDate: dueDate ? dateOnly(dueDate) : null,
        totalAmount: minorUnitsToMoney(total),
        allocatedAmount: minorUnitsToMoney(allocated),
        outstandingAmount: minorUnitsToMoney(total - allocated),
        daysOverdue,
        agingBucket: clientAgingBucket(daysOverdue)
      };
    });
    return { items, total: result.total, page: window.page, pageSize: window.pageSize, asOfDate };
  }

  /** Read labour and security actual-cost sources from the Module 9 append-only actual ledger. */
  private async readLabourCost(filters: ReportFilters) {
    const window = pageWindow(filters);
    const result = await new BudgetsJobCostRepository(this.db).listActualCostSources({
      projectId: filters.projectId as string,
      ...(filters.stageId ? { stageId: filters.stageId } : {}),
      categories: ['labour', 'security'],
      ...(filters.fromDate ? { fromDate: inputDate(filters.fromDate) } : {}),
      ...(filters.toDate ? { toDate: inputDate(filters.toDate) } : {}),
      skip: window.skip,
      take: window.take
    });
    return {
      items: result.items.map((item) => ({ ...item, postingDate: dateOnly(item.postingDate) })),
      total: result.total,
      page: window.page,
      pageSize: window.pageSize
    };
  }

  /** Build one source-derived P&L, Balance Sheet, or Cash Flow from posted Finance data. */
  private async readFinancialStatement(reportCode: 'profit-loss' | 'balance-sheet' | 'cash-flow', periodId: string) {
    const finance = new FinanceService(this.db);
    const trial = await finance.getTrialBalance({ periodId });
    const accounts = await new FinanceRepository(this.db).findAccountsByIds(trial.rows.map((row) => row.accountId));
    const accountTypeById = new Map(accounts.map((account) => [account.id, account.accountType]));

    if (reportCode === 'cash-flow') {
      const cashBank = await finance.listCashBankAccounts({ page: 1, pageSize: REPORTS_MAX_PAGE_SIZE });
      const trialByAccount = new Map(trial.rows.map((row) => [row.accountId, row]));
      return {
        periodId,
        rows: cashBank.items.map((account) => {
          const row = trialByAccount.get(account.glAccountId);
          const movement = moneyToMinorUnits(row?.debit) - moneyToMinorUnits(row?.credit);
          return {
            cashBankAccountId: account.id,
            code: account.code,
            name: account.name,
            accountType: account.accountType,
            periodMovement: minorUnitsToMoney(movement),
            currentBalance: account.balance
          };
        }),
        total: cashBank.total
      };
    }

    const rows: Record<string, unknown>[] = [];
    let firstTotal = 0n;
    let secondTotal = 0n;
    for (const row of trial.rows) {
      const accountType = accountTypeById.get(row.accountId);
      if (reportCode === 'profit-loss' && accountType !== 'REVENUE' && accountType !== 'EXPENSE') continue;
      if (reportCode === 'balance-sheet' && !['ASSET', 'LIABILITY', 'EQUITY'].includes(accountType ?? '')) continue;
      const debit = moneyToMinorUnits(row.debit);
      const credit = moneyToMinorUnits(row.credit);
      const amount = accountType === 'REVENUE' || accountType === 'LIABILITY' || accountType === 'EQUITY'
        ? credit - debit
        : debit - credit;
      rows.push({ ...row, accountType, amount: minorUnitsToMoney(amount) });
      if (reportCode === 'profit-loss') {
        if (accountType === 'REVENUE') firstTotal += amount;
        else secondTotal += amount;
      } else if (accountType === 'ASSET') {
        firstTotal += amount;
      } else {
        secondTotal += amount;
      }
    }

    if (reportCode === 'profit-loss') {
      rows.push({ rowType: 'TOTAL', accountType: 'REVENUE', amount: minorUnitsToMoney(firstTotal) });
      rows.push({ rowType: 'TOTAL', accountType: 'EXPENSE', amount: minorUnitsToMoney(secondTotal) });
      rows.push({ rowType: 'NET_PROFIT_LOSS', amount: minorUnitsToMoney(firstTotal - secondTotal) });
    } else {
      rows.push({ rowType: 'TOTAL', accountType: 'ASSET', amount: minorUnitsToMoney(firstTotal) });
      rows.push({ rowType: 'TOTAL', accountType: 'LIABILITY_EQUITY', amount: minorUnitsToMoney(secondTotal) });
      rows.push({ rowType: 'BALANCE_CHECK', amount: minorUnitsToMoney(firstTotal - secondTotal) });
    }
    return { periodId, rows, total: rows.length };
  }

  /** Dispatch one validated report to existing source-module reads instead of duplicating source-of-truth logic. */
  private async readReport(reportCode: ReportCode, filters: ReportFilters, scope: ReportsServiceScope): Promise<unknown> {
    switch (reportCode) {
      case 'project-cost':
        return new BudgetsJobCostService(this.db).getJobCostLedger(filters.projectId as string, { ...(filters.page ? { page: filters.page } : {}), ...(filters.pageSize ? { pageSize: filters.pageSize } : {}) });
      case 'budget-vs-actual':
        return new BudgetsJobCostService(this.db).getJobCost(filters.projectId as string);
      case 'project-profit-loss':
        return new ProjectProfitabilityService(this.db).getProjectSummary(filters.projectId as string, filters.asOfDate ? { asOfDate: filters.asOfDate } : {});
      case 'project-expenses':
        return new SiteExpensesService(this.db).listSiteExpenses(parseSourceQuery(listSiteExpensesQuerySchema, filters));
      case 'project-material':
        return new InventoryService(this.db).listLedger(parseSourceQuery(listLedgerQuerySchema, filters));
      case 'stage-progress':
        return new ProjectStagesService(this.db).listStages(filters.projectId as string);
      case 'stage-cost':
      case 'stage-billing':
      case 'stage-receipts':
        return new ProjectStagesService(this.db).getStageFinancials(filters.projectId as string, filters.stageId as string);
      case 'client-billing': {
        if (filters.status && filters.status !== 'ISSUED') throw createReportsError('REPORT_FILTER_INVALID');
        const window = pageWindow(filters);
        const result = await new ClientBillingRepository(this.db).listInvoices({
          skip: window.skip,
          take: window.take,
          ...(filters.clientId ? { clientId: filters.clientId } : {}),
          ...(filters.projectId ? { projectId: filters.projectId } : {}),
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.fromDate ? { fromDate: inputDate(filters.fromDate) } : {}),
          ...(filters.toDate ? { toDate: inputDate(filters.toDate) } : {})
        }, { allowedProjectIds: scope.allowedProjectIds });
        return { items: result.items, total: result.total, page: window.page, pageSize: window.pageSize };
      }
      case 'client-payments':
        return new ClientReceiptsService(this.db).listClientReceipts(parseSourceQuery(listClientReceiptsQuerySchema, filters));
      case 'client-outstanding':
      case 'client-advance':
        return this.readClientPosition(filters, scope);
      case 'client-aging':
        return this.readClientAging(filters, scope);
      case 'supplier-purchases':
        return new ProcurementService(this.db).listPurchaseOrders(parseSourceQuery(listPurchaseOrdersQuerySchema, filters));
      case 'supplier-payables':
        return new SupplierPayablesService(this.db).listSupplierInvoices(parseSourceQuery(listSupplierInvoicesQuerySchema, filters));
      case 'supplier-payments':
        return new SupplierPayablesService(this.db).listSupplierPayments(parseSourceQuery(listSupplierPaymentsQuerySchema, filters));
      case 'supplier-aging':
        return new SupplierPayablesService(this.db).getSupplierAging(parseSourceQuery(supplierAgingQuerySchema, filters));
      case 'attendance':
        return new LabourPayrollService(this.db).listAttendance(parseSourceQuery(listAttendanceQuerySchema, filters));
      case 'payroll':
        return new LabourPayrollService(this.db).listPayrollRuns(parseSourceQuery(listPayrollRunsQuerySchema, filters));
      case 'labour-cost':
        return this.readLabourCost(filters);
      case 'cash-bank':
        return new FinanceService(this.db).listCashBankAccounts(parseSourceQuery(listCashBankAccountsQuerySchema, filters));
      case 'general-ledger':
        return new FinanceService(this.db).getLedger(parseSourceQuery(financeLedgerQuerySchema, filters));
      case 'profit-loss':
      case 'balance-sheet':
      case 'cash-flow':
        return this.readFinancialStatement(reportCode, filters.periodId as string);
    }
  }

  /** Return only catalog entries allowed by the current authenticated permissions. */
  async listCatalog(query: ReportCatalogQuery): Promise<ReportCatalogResponse> {
    const scope = await this.requireScope(['reports.read']);
    const rows = await new ReportsRepository(this.db).listReportDefinitions(query);
    const items = rows
      .map(parseReportDefinition)
      .filter((definition): definition is ReportDefinitionMetadata => definition !== null)
      .filter((definition) => hasAllPermissions(scope.permissions, [
        'reports.read',
        ...definition.requiredPermissions,
        ...REPORT_SOURCE_PERMISSIONS[definition.code]
      ]))
      .map((definition) => ({
        code: definition.code,
        name: definition.name,
        domain: definition.domain,
        requiredPermissions: [...definition.requiredPermissions],
        outputFormats: [...definition.outputFormats],
        status: definition.status
      }));
    return reportCatalogResponseSchema.parse({ items });
  }

  /** Run one bounded synchronous report from approved source modules after permission and filter checks. */
  async runReport(input: RunReportBody): Promise<RunReportResponse> {
    validateReportFilters(input.reportCode, input.filters);
    const { scope } = await this.requireReportAccess(
      input.reportCode,
      input.filters,
      REPORT_SOURCE_PERMISSIONS[input.reportCode]
    );
    const result = normalizeReportResult(await this.readReport(input.reportCode, input.filters, scope));
    return runReportResponseSchema.parse({
      reportCode: input.reportCode,
      generatedAt: new Date().toISOString(),
      asOfDate: input.filters.asOfDate ?? input.filters.toDate ?? null,
      rows: result.rows,
      ...(result.total === undefined ? {} : { total: result.total }),
      ...(result.page === undefined ? {} : { page: result.page }),
      ...(result.pageSize === undefined ? {} : { pageSize: result.pageSize })
    });
  }

  /** Read one complete export dataset in bounded pages after reapplying current source permissions. */
  async runExportData(input: RunReportBody): Promise<RunReportResponse> {
    const filters = withoutPagination(input.filters);
    validateReportFilters(input.reportCode, filters);
    const { scope } = await this.requireReportAccess(
      input.reportCode,
      filters,
      ['reports.export', ...REPORT_SOURCE_PERMISSIONS[input.reportCode]]
    );

    if (!reportSupportsPagination(input.reportCode)) {
      const result = normalizeReportResult(await this.readReport(input.reportCode, filters, scope));
      if (result.rows.length > REPORT_EXPORT_MAX_ROWS) throw createReportsError('REPORT_EXPORT_FAILED');
      return runReportResponseSchema.parse({
        reportCode: input.reportCode,
        generatedAt: new Date().toISOString(),
        asOfDate: filters.asOfDate ?? filters.toDate ?? null,
        rows: result.rows,
        total: result.rows.length
      });
    }

    const rows: Record<string, unknown>[] = [];
    let page = 1;
    let total: number | undefined;
    while (rows.length < REPORT_EXPORT_MAX_ROWS) {
      const pageFilters = { ...filters, page, pageSize: REPORTS_MAX_PAGE_SIZE };
      const result = normalizeReportResult(await this.readReport(input.reportCode, pageFilters, scope));
      total = result.total ?? total;
      if (total !== undefined && total > REPORT_EXPORT_MAX_ROWS) throw createReportsError('REPORT_EXPORT_FAILED');
      rows.push(...result.rows);
      if (result.rows.length < REPORTS_MAX_PAGE_SIZE || (total !== undefined && rows.length >= total)) break;
      page += 1;
    }

    if (rows.length >= REPORT_EXPORT_MAX_ROWS && (total === undefined || total > REPORT_EXPORT_MAX_ROWS)) {
      throw createReportsError('REPORT_EXPORT_FAILED');
    }
    return runReportResponseSchema.parse({
      reportCode: input.reportCode,
      generatedAt: new Date().toISOString(),
      asOfDate: filters.asOfDate ?? filters.toDate ?? null,
      rows,
      total: total ?? rows.length
    });
  }

  /** Persist one export request and its durable queue job atomically after permission and format checks. */
  async createExport(input: CreateReportExportBody): Promise<ReportRunResponse> {
    const filters = withoutPagination(input.filters);
    validateReportFilters(input.reportCode, filters);
    const { definition, scope } = await this.requireReportAccess(
      input.reportCode,
      filters,
      ['reports.export', ...REPORT_SOURCE_PERMISSIONS[input.reportCode]]
    );
    if (!definition.outputFormats.includes(input.outputFormat)) throw createReportsError('REPORT_FILTER_INVALID');

    return withTransaction(this.db, async (tx) => {
      const row = await new ReportsRepository(tx).createReportRun({
        reportCode: input.reportCode,
        requestedBy: scope.actorUserId,
        filters,
        outputFormat: input.outputFormat
      });
      await enqueueJob(tx, {
        queueName: REPORT_EXPORT_QUEUE_NAME,
        jobType: REPORT_EXPORT_JOB_TYPE,
        payload: { runId: row.id },
        maxAttempts: 3
      });
      await recordAudit(tx, {
        action: 'report.run_created',
        entityType: 'report_run',
        entityId: row.id,
        after: {
          reportCode: row.reportCode,
          outputFormat: row.outputFormat,
          filters
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'report.run_created',
        resourceType: 'report_run',
        resourceId: row.id,
        payload: {
          reportRunId: row.id,
          reportCode: row.reportCode,
          outputFormat: row.outputFormat
        }
      });
      return reportRunResponse(row);
    });
  }

  /** Return one export run only to its requesting user with current report access. */
  async getReportRun(runId: string): Promise<ReportRunResponse> {
    const baseScope = await this.requireScope(['reports.read']);
    const row = await new ReportsRepository(this.db).findReportRunById(runId, baseScope.actorUserId);
    if (!row || !isReportCode(row.reportCode)) throw createReportsError('REPORT_SCOPE_FORBIDDEN');

    const filters = parseStoredFilters(row.filtersJson);
    validateReportFilters(row.reportCode, filters);
    await this.requireReportAccess(row.reportCode, filters, REPORT_SOURCE_PERMISSIONS[row.reportCode]);
    return reportRunResponse(row);
  }

  /** Authorize one completed export and return a short-lived signed file URL to its requesting user. */
  async createDownloadUrl(
    runId: string,
    storage: ObjectStorage,
    signedUrlTtlSeconds: number
  ): Promise<ReportDownloadResponse> {
    const baseScope = await this.requireScope(['reports.read', 'reports.export']);
    const row = await new ReportsRepository(this.db).findReportRunById(runId, baseScope.actorUserId);
    if (!row || !isReportCode(row.reportCode)) throw createReportsError('REPORT_SCOPE_FORBIDDEN');

    const filters = parseStoredFilters(row.filtersJson);
    validateReportFilters(row.reportCode, filters);
    await this.requireReportAccess(
      row.reportCode,
      filters,
      ['reports.export', ...REPORT_SOURCE_PERMISSIONS[row.reportCode]]
    );
    if (row.status !== 'COMPLETED' || !row.fileId) throw createReportsError('REPORT_EXPORT_FAILED');

    const document = await new DocumentsRepository(this.db).findDocumentById(row.fileId);
    if (
      !document
      || document.category !== 'REPORT_EXPORT'
      || document.createdBy !== baseScope.actorUserId
      || document.projectId !== (filters.projectId ?? null)
      || !document.currentVersion
    ) {
      throw createReportsError('REPORT_SCOPE_FORBIDDEN');
    }

    const signed = await storage.createSignedDownloadUrl({
      key: assertCompanyObjectKey(document.currentVersion.storageKey),
      expiresInSeconds: signedUrlTtlSeconds
    });
    await withTransaction(this.db, async (tx) => {
      await recordAudit(tx, {
        action: 'report.export_download_authorized',
        entityType: 'report_run',
        entityId: row.id,
        after: {
          reportCode: row.reportCode,
          outputFormat: row.outputFormat,
          fileId: row.fileId
        }
      });
    });

    return reportDownloadResponseSchema.parse({
      url: signed.url,
      expiresAt: signed.expiresAt.toISOString()
    });
  }

  /** List the current user's saved filters only for reports they can still access. */
  async listSavedFilters(query: SavedReportFiltersQuery): Promise<SavedReportFiltersResponse> {
    const scope = await this.requireScope(['reports.read', 'reports.save_filters']);
    const repository = new ReportsRepository(this.db);
    const definitions = await repository.listReportDefinitions();
    const allowedCodes = new Set(
      definitions
        .map(parseReportDefinition)
        .filter((definition): definition is ReportDefinitionMetadata => definition !== null)
        .filter((definition) => hasAllPermissions(scope.permissions, [
          'reports.read',
          ...definition.requiredPermissions,
          ...REPORT_SOURCE_PERMISSIONS[definition.code]
        ]))
        .map((definition) => definition.code)
    );
    if (query.reportCode && !allowedCodes.has(query.reportCode)) throw createReportsError('REPORT_SCOPE_FORBIDDEN');

    const rows = await repository.listSavedFilters(scope.actorUserId, query.reportCode);
    const items = rows
      .filter((row) => isReportCode(row.reportCode) && allowedCodes.has(row.reportCode))
      .map(savedFilterResponse);
    return savedReportFiltersResponseSchema.parse({ items });
  }

  /** Save one validated filter under the current user after report and Project-scope checks. */
  async saveFilter(input: SaveReportFilterBody): Promise<SavedReportFilterResponse> {
    validateReportFilters(input.reportCode, input.filters);
    const { scope } = await this.requireReportAccess(
      input.reportCode,
      input.filters,
      ['reports.save_filters', ...REPORT_SOURCE_PERMISSIONS[input.reportCode]]
    );
    const row = await new ReportsRepository(this.db).createSavedFilter({
      userId: scope.actorUserId,
      reportCode: input.reportCode,
      name: input.name,
      filters: input.filters
    });
    return savedFilterResponse(row);
  }
}
