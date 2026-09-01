import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type ProjectProfitabilityTrendGranularity = 'DAY' | 'WEEK' | 'MONTH';

export type ProjectProfitabilityFinancialValues = Readonly<{
  recognizedRevenue: string;
  actualCost: string;
  profitAmount: string;
  billedAmount: string;
  receivedAmount: string;
  allocatedAmount: string;
  advanceAmount: string;
  outstandingAmount: string;
  supplierPayableAmount: string;
}>;

export type ProjectProfitabilitySummary = ProjectProfitabilityFinancialValues & Readonly<{
  projectId: string;
  projectCode: string;
  projectName: string;
  currency: string;
  asOfDate: string;
}>;

export type ProjectProfitabilityStageRow = ProjectProfitabilityFinancialValues & Readonly<{
  stageId: string;
  stageCode: string;
  stageName: string;
  sequenceNo: number;
  weightPercent: string;
  physicalProgressPercent: string;
  plannedAmount: string | null;
}>;

export type ProjectProfitabilityStages = Readonly<{
  projectId: string;
  currency: string;
  asOfDate: string;
  stages: ProjectProfitabilityStageRow[];
  projectOnly: ProjectProfitabilityFinancialValues;
  projectTotal: ProjectProfitabilityFinancialValues;
}>;

export type ProjectProfitabilityTrendPoint = Readonly<{
  periodStart: string;
  periodEnd: string;
  recognizedRevenue: string;
  actualCost: string;
  profitAmount: string;
}>;

export type ProjectProfitabilityTrend = Readonly<{
  projectId: string;
  currency: string;
  fromDate: string;
  toDate: string;
  granularity: ProjectProfitabilityTrendGranularity;
  points: ProjectProfitabilityTrendPoint[];
}>;

export type ProjectProfitabilityPortfolioItem = ProjectProfitabilityFinancialValues & Readonly<{
  projectId: string;
  projectCode: string;
  projectName: string;
  clientId: string;
  currency: string;
}>;

export type ProjectProfitabilityPortfolioPage = Readonly<{
  asOfDate: string;
  items: ProjectProfitabilityPortfolioItem[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type ProjectProfitabilityAsOfInput = Readonly<{ asOfDate?: string }>;

export type ProjectProfitabilityTrendInput = Readonly<{
  fromDate: string;
  toDate: string;
  granularity: ProjectProfitabilityTrendGranularity;
}>;

export type ProjectProfitabilityPortfolioInput = Readonly<{
  asOfDate?: string;
  search?: string;
  clientId?: string;
  page?: number;
  pageSize?: number;
}>;

/** Build one strict query string from only documented Project Profitability filters. */
function queryString(
  input: ProjectProfitabilityAsOfInput | ProjectProfitabilityTrendInput | ProjectProfitabilityPortfolioInput
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Read one Project profitability summary without calculating financial values in the browser. */
export function getProjectProfitabilitySummary(
  projectId: string,
  input: ProjectProfitabilityAsOfInput = {}
): Promise<ProjectProfitabilitySummary> {
  return authenticatedRequest<ProjectProfitabilitySummary>(
    `project-profitability/projects/${encodeURIComponent(projectId)}${queryString(input)}`
  );
}

/** Read Stage profitability plus the explicit Project-only reconciliation bucket. */
export function getProjectProfitabilityStages(
  projectId: string,
  input: ProjectProfitabilityAsOfInput = {}
): Promise<ProjectProfitabilityStages> {
  return authenticatedRequest<ProjectProfitabilityStages>(
    `project-profitability/projects/${encodeURIComponent(projectId)}/stages${queryString(input)}`
  );
}

/** Read one bounded revenue, cost and profit trend for the selected Project. */
export function getProjectProfitabilityTrend(
  projectId: string,
  input: ProjectProfitabilityTrendInput
): Promise<ProjectProfitabilityTrend> {
  return authenticatedRequest<ProjectProfitabilityTrend>(
    `project-profitability/projects/${encodeURIComponent(projectId)}/trend${queryString(input)}`
  );
}

/** Read one permission-scoped Project profitability portfolio page without cross-currency totals. */
export function listProjectProfitabilityPortfolio(
  input: ProjectProfitabilityPortfolioInput = {}
): Promise<ProjectProfitabilityPortfolioPage> {
  return authenticatedRequest<ProjectProfitabilityPortfolioPage>(
    `project-profitability/portfolio${queryString(input)}`
  );
}
