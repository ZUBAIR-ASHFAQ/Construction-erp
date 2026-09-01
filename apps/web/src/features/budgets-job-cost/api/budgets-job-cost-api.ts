import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type BudgetCostCategory = 'material' | 'labour' | 'security' | 'equipment' | 'subcontract' | 'site_expense' | 'other';

export type BudgetLine = Readonly<{
  id: string;
  stageId: string | null;
  category: BudgetCostCategory;
  description: string;
  plannedAmount: string;
}>;

export type ProjectBudget = Readonly<{
  id: string;
  projectId: string;
  versionNo: number;
  status: string;
  currency: string;
  totalAmount: string;
  createdBy: string;
  frozenAt: string | null;
  lines: BudgetLine[];
}>;

export type BudgetLineInput = Readonly<{
  stageId?: string | null;
  category: BudgetCostCategory;
  description: string;
  plannedAmount: string;
}>;

export type ReplaceBudgetLinesInput = Readonly<{ lines: BudgetLineInput[] }>;
export type ForecastLineInput = Readonly<{ stageId?: string | null; category: BudgetCostCategory; forecastAmount: string }>;
export type UpdateForecastInput = Readonly<{ lines: ForecastLineInput[] }>;

export type ForecastLine = Readonly<{
  id: string;
  projectId: string;
  stageId: string | null;
  category: BudgetCostCategory;
  forecastAmount: string;
  updatedBy: string;
  updatedAt: string;
}>;

export type JobCostTotals = Readonly<{
  budgetCost: string;
  committedCost: string;
  actualCost: string;
  forecastCost: string;
  variance: string;
}>;

export type JobCostSummary = Readonly<{
  projectId: string;
  currentBudget: ProjectBudget | null;
  totals: JobCostTotals;
  forecasts: ForecastLine[];
}>;

export type UpdateForecastResult = Readonly<{ projectId: string; forecasts: ForecastLine[] }>;

export type JobCostLedgerEntry = Readonly<{
  id: string;
  recordType: 'COMMITMENT' | 'ACTUAL';
  stageId: string | null;
  category: BudgetCostCategory;
  sourceType: string;
  sourceId: string;
  sourceKey: string;
  postingDate: string;
  amount: string;
  status: string | null;
}>;

export type JobCostLedgerPage = Readonly<{
  projectId: string;
  items: JobCostLedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
}>;
export type GetJobCostLedgerInput = Readonly<{ page?: number; pageSize?: number }>;

/** Create a browser idempotency key for one controlled Module 9 write. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': crypto.randomUUID() };
}

/** Load the newest Project budget version. */
export function getCurrentBudget(projectId: string): Promise<ProjectBudget> {
  return authenticatedRequest<ProjectBudget>(`projects/${projectId}/budgets/current`);
}

/** Create one server-numbered Project budget version with server-owned currency and totals. */
export function createBudget(projectId: string): Promise<ProjectBudget> {
  return authenticatedRequest<ProjectBudget>(`projects/${projectId}/budgets`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({})
  });
}

/** Replace the complete editable budget line set. */
export function replaceBudgetLines(projectId: string, budgetId: string, input: ReplaceBudgetLinesInput): Promise<ProjectBudget> {
  return authenticatedRequest<ProjectBudget>(`projects/${projectId}/budgets/${budgetId}/lines`, {
    method: 'PUT',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Freeze one editable budget. */
export function freezeBudget(projectId: string, budgetId: string): Promise<ProjectBudget> {
  return authenticatedRequest<ProjectBudget>(`projects/${projectId}/budgets/${budgetId}/freeze`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify({})
  });
}

/** Load the server-calculated Project job-cost position. */
export function getJobCost(projectId: string): Promise<JobCostSummary> {
  return authenticatedRequest<JobCostSummary>(`projects/${projectId}/job-cost`);
}

/** Replace the current Project/Stage/category forecast. */
export function updateForecast(projectId: string, input: UpdateForecastInput): Promise<UpdateForecastResult> {
  return authenticatedRequest<UpdateForecastResult>(`projects/${projectId}/forecast`, {
    method: 'PUT',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Load one bounded page of source-derived cost history. */
export function getJobCostLedger(projectId: string, input: GetJobCostLedgerInput = {}): Promise<JobCostLedgerPage> {
  const query = new URLSearchParams();
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  const suffix = query.size > 0 ? `?${query.toString()}` : '';
  return authenticatedRequest<JobCostLedgerPage>(`projects/${projectId}/job-cost/ledger${suffix}`);
}
