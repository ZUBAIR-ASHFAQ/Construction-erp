import { authenticatedRequest } from '../../administration/api/auth-api.js';

export const REPORT_CODES = [
  'project-cost',
  'budget-vs-actual',
  'project-profit-loss',
  'project-expenses',
  'project-material',
  'stage-progress',
  'stage-cost',
  'stage-billing',
  'stage-receipts',
  'client-billing',
  'client-payments',
  'client-outstanding',
  'client-advance',
  'client-aging',
  'supplier-purchases',
  'supplier-payables',
  'supplier-payments',
  'supplier-aging',
  'attendance',
  'payroll',
  'labour-cost',
  'cash-bank',
  'general-ledger',
  'profit-loss',
  'balance-sheet',
  'cash-flow'
] as const;

export type ReportCode = (typeof REPORT_CODES)[number];
export type ReportOutputFormat = 'PDF' | 'EXCEL' | 'CSV';
export type ReportRunStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';

export type ReportFilters = Readonly<{
  projectId?: string;
  stageId?: string;
  clientId?: string;
  vendorId?: string;
  employeeId?: string;
  warehouseId?: string;
  materialId?: string;
  cashBankAccountId?: string;
  periodId?: string;
  accountId?: string;
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
  status?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}>;

export type ReportCatalogItem = Readonly<{
  code: ReportCode;
  name: string;
  domain: string;
  requiredPermissions: string[];
  outputFormats: ReportOutputFormat[];
  status: string;
}>;

export type ReportCatalog = Readonly<{ items: ReportCatalogItem[] }>;

export type RunReportInput = Readonly<{
  reportCode: ReportCode;
  filters: ReportFilters;
}>;

export type ReportResult = Readonly<{
  reportCode: ReportCode;
  generatedAt: string;
  asOfDate: string | null;
  rows: Record<string, unknown>[];
  total?: number;
  page?: number;
  pageSize?: number;
}>;

export type CreateReportExportInput = RunReportInput & Readonly<{
  outputFormat: ReportOutputFormat;
}>;

export type ReportRun = Readonly<{
  id: string;
  reportCode: ReportCode;
  outputFormat: ReportOutputFormat;
  status: ReportRunStatus;
  fileId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorCode: string | null;
}>;

export type ReportDownload = Readonly<{
  url: string;
  expiresAt: string;
}>;

export type SavedReportFilter = Readonly<{
  id: string;
  reportCode: ReportCode;
  name: string;
  filters: ReportFilters;
  createdAt: string;
}>;

export type SavedReportFilters = Readonly<{ items: SavedReportFilter[] }>;

/** Build one bounded query string from documented catalog filters only. */
function catalogQuery(input: Readonly<{ search?: string; domain?: string }>): string {
  const query = new URLSearchParams();
  if (input.search) query.set('search', input.search);
  if (input.domain) query.set('domain', input.domain);
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Load the report catalog already filtered by the authenticated user's permissions. */
export function listReportCatalog(input: Readonly<{ search?: string; domain?: string }> = {}): Promise<ReportCatalog> {
  return authenticatedRequest<ReportCatalog>(`reports/catalog${catalogQuery(input)}`);
}

/** Run one bounded server-owned report without calculating report values in the browser. */
export function runReport(input: RunReportInput): Promise<ReportResult> {
  return authenticatedRequest<ReportResult>('reports/run', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Queue one server-generated PDF, Excel, or CSV report export. */
export function createReportExport(input: CreateReportExportInput): Promise<ReportRun> {
  return authenticatedRequest<ReportRun>('reports/exports', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Read the current status of one report export owned by the authenticated user. */
export function getReportRun(runId: string): Promise<ReportRun> {
  return authenticatedRequest<ReportRun>(`reports/runs/${encodeURIComponent(runId)}`);
}

/** Request a short-lived authorized download for one completed report export. */
export function getReportDownload(runId: string): Promise<ReportDownload> {
  return authenticatedRequest<ReportDownload>(`reports/runs/${encodeURIComponent(runId)}/download`);
}

/** Load the authenticated user's saved filters for one optional report code. */
export function listSavedReportFilters(reportCode?: ReportCode): Promise<SavedReportFilters> {
  const query = reportCode ? `?reportCode=${encodeURIComponent(reportCode)}` : '';
  return authenticatedRequest<SavedReportFilters>(`reports/saved-filters${query}`);
}

/** Save one validated filter set under the authenticated user. */
export function saveReportFilter(input: Readonly<{ reportCode: ReportCode; name: string; filters: ReportFilters }>): Promise<SavedReportFilter> {
  return authenticatedRequest<SavedReportFilter>('reports/saved-filters', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}
