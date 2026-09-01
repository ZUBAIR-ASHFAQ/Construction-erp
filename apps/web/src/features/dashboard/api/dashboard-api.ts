import { authenticatedRequest } from '../../administration/api/auth-api.js';
import type { JobCostTotals } from '../../budgets-job-cost/api/budgets-job-cost-api.js';
import type { CashBankAccountPage } from '../../finance/api/finance-api.js';
import type { ProjectProfitabilityFinancialValues } from '../../project-profitability/api/project-profitability-api.js';
import type { ProjectStagesSummary } from '../../project-stages/api/project-stages-api.js';

export const DASHBOARD_WIDGET_CODES = [
  'executive-summary',
  'project-health',
  'stage-progress',
  'budget-vs-actual',
  'billed-received-outstanding',
  'supplier-payable',
  'cash-bank',
  'profit-loss',
  'alerts'
] as const;

export type DashboardWidgetCode = (typeof DASHBOARD_WIDGET_CODES)[number];

export type DashboardDateFilters = Readonly<{
  fromDate?: string;
  toDate?: string;
  asOfDate?: string;
}>;

export type DashboardSummaryQuery = DashboardDateFilters & Readonly<{
  projectId?: string;
  widgetCodes?: readonly DashboardWidgetCode[];
}>;

export type DashboardProjectsQuery = DashboardDateFilters & Readonly<{
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}>;

export type DashboardProjectQuery = DashboardDateFilters & Readonly<{
  widgetCodes?: readonly DashboardWidgetCode[];
}>;

export type DashboardAlertsQuery = DashboardDateFilters & Readonly<{
  projectId?: string;
  page?: number;
  pageSize?: number;
}>;

export type DashboardPreferenceFilters = DashboardDateFilters & Readonly<{
  projectId?: string;
}>;

export type UpdateDashboardPreferencesInput = Readonly<{
  widgetCodes?: readonly DashboardWidgetCode[];
  defaultProjectId?: string | null;
  defaultFilters?: DashboardPreferenceFilters;
}>;

export type DashboardPreference = UpdateDashboardPreferencesInput & Readonly<{
  updatedAt: string;
}>;

export type DashboardSavedFilter = Readonly<{
  id: string;
  name: string;
  filterJson: unknown;
  createdAt: string;
}>;

export type DashboardProject = Readonly<{
  id: string;
  projectCode: string;
  name: string;
  clientId: string;
  status: string;
  currency: string;
  startDate: string;
  plannedEndDate: string;
  client: Readonly<{ displayName: string }>;
}>;

export type DashboardProjectPortfolioItem = DashboardProject & Readonly<{
  overallPhysicalProgressPercent: string | null;
  stageCount: number | null;
  stageBaselineStatus: string | null;
}>;

export type DashboardProjectPortfolio = Readonly<{
  items: DashboardProjectPortfolioItem[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type DashboardCurrencyFinancials = ProjectProfitabilityFinancialValues & Readonly<{
  currency: string;
  projectCount: number;
}>;

export type DashboardCompanySummary = Readonly<{
  projectCount: number;
  executiveSummary: Readonly<{
    financialsByCurrency: DashboardCurrencyFinancials[] | null;
    financialCoverage: Readonly<{
      includedProjects: number;
      totalProjects: number;
      complete: boolean;
      asOfDate: string;
    }> | null;
  }>;
  cashBank: CashBankAccountPage | null;
  preference: DashboardPreference | null;
  savedFilters: DashboardSavedFilter[];
}>;

export type DashboardProjectReadModel = Readonly<{
  project: DashboardProject;
  overallPhysicalProgressPercent: string | null;
  stageProgress: ProjectStagesSummary | null;
  budgetVsActual: JobCostTotals | null;
  financialPosition: ProjectProfitabilityFinancialValues | null;
  cashBank: CashBankAccountPage | null;
}>;

export type DashboardAlert = Readonly<{
  code: 'PROJECT_OVERDUE' | 'STAGE_OVERDUE' | 'BUDGET_OVERRUN' | 'PROJECT_LOSS';
  severity: 'WARNING' | 'CRITICAL';
  sourceModule: 'projects' | 'project-stages' | 'budgets-job-cost' | 'project-profitability';
  projectId: string;
  projectCode: string;
  projectName: string;
  stageId: string | null;
  title: string;
  dueDate: string | null;
  value: string | null;
  currency: string | null;
}>;

export type DashboardAlerts = Readonly<{
  items: DashboardAlert[];
  alertCount: number;
  asOfDate: string;
  page: number;
  pageSize: number;
  scannedProjectCount: number;
  projectTotal: number;
}>;

/** Build one query string from documented Dashboard filters only. */
function dashboardQuery(input: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item));
      continue;
    }
    query.set(key, String(value));
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Load the permission-filtered Company Dashboard summary and user preferences. */
export function getDashboardSummary(input: DashboardSummaryQuery = {}): Promise<DashboardCompanySummary> {
  return authenticatedRequest<DashboardCompanySummary>(`dashboard/summary${dashboardQuery(input)}`);
}

/** Load one bounded permission-scoped Project health page. */
export function listDashboardProjects(input: DashboardProjectsQuery = {}): Promise<DashboardProjectPortfolio> {
  return authenticatedRequest<DashboardProjectPortfolio>(`dashboard/projects${dashboardQuery(input)}`);
}

/** Load one Project's server-owned physical and financial Dashboard read model. */
export function getProjectDashboard(projectId: string, input: DashboardProjectQuery = {}): Promise<DashboardProjectReadModel> {
  return authenticatedRequest<DashboardProjectReadModel>(
    `dashboard/projects/${encodeURIComponent(projectId)}${dashboardQuery(input)}`
  );
}

/** Load bounded source-owned operational alerts for the current Dashboard scope. */
export function listDashboardAlerts(input: DashboardAlertsQuery = {}): Promise<DashboardAlerts> {
  return authenticatedRequest<DashboardAlerts>(`dashboard/alerts${dashboardQuery(input)}`);
}

/** Save only the authenticated user's Dashboard presentation preferences. */
export function updateDashboardPreferences(input: UpdateDashboardPreferencesInput): Promise<DashboardPreference> {
  return authenticatedRequest<DashboardPreference>('dashboard/preferences', {
    method: 'PATCH',
    body: JSON.stringify(input)
  });
}
