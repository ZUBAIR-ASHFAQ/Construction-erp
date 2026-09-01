import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for the bounded Project cost ledger. */
export const MODULE_9_MAX_PAGE_SIZE = 100;

export const MODULE_9_PERMISSION_CODES = Object.freeze([
  'budgets.read',
  'budgets.create',
  'budgets.edit',
  'budgets.freeze',
  'job_cost.read',
  'forecast.update'
] as const);

export const MODULE_9_COST_CATEGORIES = Object.freeze([
  'material',
  'labour',
  'security',
  'equipment',
  'subcontract',
  'site_expense',
  'other'
] as const);

export const MODULE_9_ERROR_CODES = Object.freeze([
  'BUDGET_NOT_FOUND',
  'BUDGET_LOCKED',
  'DUPLICATE_COST_SOURCE',
  'INVALID_COST_STAGE'
] as const);

export const MODULE_9_EVENT_TYPES = Object.freeze([
  'budget.created',
  'budget.frozen',
  'budget.revised',
  'forecast.updated',
  'job_cost.source_posted'
] as const);

export const MODULE_9_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/budgets/current' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/budgets' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/projects/:projectId/budgets/:id/lines' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/budgets/:id/freeze' }),
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/job-cost' }),
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/job-cost/ledger' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/projects/:projectId/forecast' })
] as const);

export const MODULE_9_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId', 'actorUserId', 'permissions', 'projectScope', 'effectivePermissions',
  'projectId', 'versionNo', 'status', 'currency', 'createdBy', 'frozenAt', 'totalAmount',
  'sourceKey', 'sourceType', 'sourceId', 'postingDate', 'postedAt', 'updatedBy', 'updatedAt'
] as const);

export type Module9PermissionCode = (typeof MODULE_9_PERMISSION_CODES)[number];
export type Module9ErrorCode = (typeof MODULE_9_ERROR_CODES)[number];
export type Module9CostCategory = (typeof MODULE_9_COST_CATEGORIES)[number];
export type Module9EventType = (typeof MODULE_9_EVENT_TYPES)[number];

export const module9PermissionCodeSchema = z.enum(MODULE_9_PERMISSION_CODES);
export const module9ErrorCodeSchema = z.enum(MODULE_9_ERROR_CODES);

const uuidSchema = z.string().uuid();
const statusSchema = z.string().trim().min(1).max(32);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const descriptionSchema = z.string().trim().min(1).max(500);
const sourceTypeSchema = z.string().trim().min(1).max(100);
const sourceIdSchema = z.string().trim().min(1).max(700);
const categorySchema = z.enum(MODULE_9_COST_CATEGORIES);
const moneySchema = z.string().trim().regex(
  /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'money must be an exact decimal string with at most 16 whole digits and 2 decimal places'
);
const nonNegativeMoneySchema = moneySchema.refine((value) => !value.startsWith('-'), 'amount must be non-negative');
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`)), 'date must be valid');
const timestampSchema = z.string().datetime({ offset: true });

/** Path contract for Project-scoped budget and cost operations. */
export const module9ProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();

/** Path contract for one budget inside a Project. */
export const module9BudgetParamsSchema = z.object({ projectId: uuidSchema, id: uuidSchema }).strict();

/** Current-budget read accepts no business filters. */
export const getCurrentBudgetQuerySchema = z.object({}).strict();

/** Creating a budget version has no browser-owned financial fields. */
export const createBudgetBodySchema = z.object({}).strict();

/** One Final-21 budget line with an optional Stage and a simple cost category. */
export const budgetLineInputSchema = z.object({
  stageId: uuidSchema.nullable().optional(),
  category: categorySchema,
  description: descriptionSchema,
  plannedAmount: nonNegativeMoneySchema
}).strict();

/** Replace the complete editable budget line set. */
export const replaceBudgetLinesBodySchema = z.object({ lines: z.array(budgetLineInputSchema) }).strict();

/** Freeze is an explicit bodyless command. */
export const freezeBudgetBodySchema = z.object({}).strict();

/** Job-cost summary accepts no business filters. */
export const getJobCostQuerySchema = z.object({}).strict();

/** One current Project/Stage/category forecast value. */
export const forecastLineInputSchema = z.object({
  stageId: uuidSchema.nullable().optional(),
  category: categorySchema,
  forecastAmount: nonNegativeMoneySchema
}).strict();

/** Replace the complete current Project forecast. */
export const updateForecastBodySchema = z.object({ lines: z.array(forecastLineInputSchema) }).strict();

/** Bounded detailed Project cost-ledger query. */
export const getJobCostLedgerQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MODULE_9_MAX_PAGE_SIZE).optional()
}).strict();

/** Safe budget-line readback. */
export const budgetLineResponseSchema = z.object({
  id: uuidSchema,
  stageId: uuidSchema.nullable(),
  category: categorySchema,
  description: descriptionSchema,
  plannedAmount: moneySchema
}).strict();

/** Safe Project-budget readback. */
export const projectBudgetResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  versionNo: z.number().int().min(1),
  status: statusSchema,
  currency: currencySchema,
  totalAmount: moneySchema,
  createdBy: uuidSchema,
  frozenAt: timestampSchema.nullable(),
  lines: z.array(budgetLineResponseSchema)
}).strict();

export const getCurrentBudgetResponseSchema = projectBudgetResponseSchema;
export const createBudgetResponseSchema = projectBudgetResponseSchema;
export const replaceBudgetLinesResponseSchema = projectBudgetResponseSchema;
export const freezeBudgetResponseSchema = projectBudgetResponseSchema;

/** Safe current forecast readback. */
export const forecastLineResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  category: categorySchema,
  forecastAmount: moneySchema,
  updatedBy: uuidSchema,
  updatedAt: timestampSchema
}).strict();

/** Project cost totals keep billing, receipts and profitability outside this module. */
export const jobCostTotalsResponseSchema = z.object({
  budgetCost: moneySchema,
  committedCost: moneySchema,
  actualCost: moneySchema,
  forecastCost: moneySchema,
  variance: moneySchema
}).strict();

/** Project budget/commitment/actual/forecast summary. */
export const jobCostSummaryResponseSchema = z.object({
  projectId: uuidSchema,
  currentBudget: projectBudgetResponseSchema.nullable(),
  totals: jobCostTotalsResponseSchema,
  forecasts: z.array(forecastLineResponseSchema)
}).strict();

/** Forecast replacement response. */
export const updateForecastResponseSchema = z.object({
  projectId: uuidSchema,
  forecasts: z.array(forecastLineResponseSchema)
}).strict();

/** Normalized read-only source-cost ledger row. */
export const jobCostLedgerEntryResponseSchema = z.object({
  id: uuidSchema,
  recordType: z.enum(['COMMITMENT', 'ACTUAL']),
  stageId: uuidSchema.nullable(),
  category: categorySchema,
  sourceType: sourceTypeSchema,
  sourceId: sourceIdSchema,
  sourceKey: sourceIdSchema,
  postingDate: dateSchema,
  amount: moneySchema,
  status: statusSchema.nullable()
}).strict();

/** Paginated detailed source-cost ledger. */
export const jobCostLedgerResponseSchema = z.object({
  projectId: uuidSchema,
  items: z.array(jobCostLedgerEntryResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(MODULE_9_MAX_PAGE_SIZE)
}).strict();

export type CreateBudgetBody = z.infer<typeof createBudgetBodySchema>;
export type ReplaceBudgetLinesBody = z.infer<typeof replaceBudgetLinesBodySchema>;
export type UpdateForecastBody = z.infer<typeof updateForecastBodySchema>;
export type GetJobCostLedgerQuery = z.infer<typeof getJobCostLedgerQuerySchema>;
export type Module9ProjectParams = z.infer<typeof module9ProjectParamsSchema>;
export type Module9BudgetParams = z.infer<typeof module9BudgetParamsSchema>;
export type GetCurrentBudgetResponse = z.infer<typeof getCurrentBudgetResponseSchema>;
export type CreateBudgetResponse = z.infer<typeof createBudgetResponseSchema>;
export type ReplaceBudgetLinesResponse = z.infer<typeof replaceBudgetLinesResponseSchema>;
export type FreezeBudgetResponse = z.infer<typeof freezeBudgetResponseSchema>;
export type JobCostSummaryResponse = z.infer<typeof jobCostSummaryResponseSchema>;
export type UpdateForecastResponse = z.infer<typeof updateForecastResponseSchema>;
export type JobCostLedgerResponse = z.infer<typeof jobCostLedgerResponseSchema>;
export type GetCurrentBudgetQuery = z.infer<typeof getCurrentBudgetQuerySchema>;
export type BudgetLineInput = z.infer<typeof budgetLineInputSchema>;
export type FreezeBudgetBody = z.infer<typeof freezeBudgetBodySchema>;
export type GetJobCostQuery = z.infer<typeof getJobCostQuerySchema>;
export type ForecastLineInput = z.infer<typeof forecastLineInputSchema>;
export type BudgetLineResponse = z.infer<typeof budgetLineResponseSchema>;
export type ProjectBudgetResponse = z.infer<typeof projectBudgetResponseSchema>;
export type ForecastLineResponse = z.infer<typeof forecastLineResponseSchema>;
export type JobCostTotalsResponse = z.infer<typeof jobCostTotalsResponseSchema>;
export type JobCostLedgerEntryResponse = z.infer<typeof jobCostLedgerEntryResponseSchema>;

const MODULE_9_ERROR_MESSAGES: Readonly<Record<Module9ErrorCode, string>> = Object.freeze({
  BUDGET_NOT_FOUND: 'The requested Project budget was not found.',
  BUDGET_LOCKED: 'The requested budget is frozen or another editable budget version already exists.',
  DUPLICATE_COST_SOURCE: 'The source cost has already been posted.',
  INVALID_COST_STAGE: 'The selected Stage does not belong to this Project.'
});

/** Map stable Module 9 business codes to public HTTP errors. */
export function createModule9Error(code: Module9ErrorCode): AppError {
  const message = MODULE_9_ERROR_MESSAGES[code];
  if (code === 'BUDGET_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}
