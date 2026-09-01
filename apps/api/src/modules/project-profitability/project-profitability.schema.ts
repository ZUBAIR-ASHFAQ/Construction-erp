import {
  AppError,
  AuthorizationError,
  ConflictError,
  ValidationError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Project Profitability portfolio reads. */
export const PROJECT_PROFITABILITY_MAX_PAGE_SIZE = 100;

/** Maximum inclusive date span allowed for one Project Profitability trend request. */
export const PROJECT_PROFITABILITY_MAX_TREND_DAYS = 366;

/** Final Module 19 permission vocabulary. */
export const PROJECT_PROFITABILITY_PERMISSION_CODES = Object.freeze([
  'project_profitability.read',
  'project_profitability.finance.read',
  'project_profitability.portfolio.read'
] as const);

/** Final Module 19 stable public business errors. */
export const PROJECT_PROFITABILITY_ERROR_CODES = Object.freeze([
  'PROFITABILITY_SCOPE_FORBIDDEN',
  'PROFITABILITY_SOURCE_INCOMPLETE',
  'INVALID_PROFITABILITY_FILTER'
] as const);

/** Exact Final Module 19 HTTP contract; Project Profitability remains read-only. */
export const PROJECT_PROFITABILITY_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/project-profitability/projects/:projectId' }),
  Object.freeze({ method: 'GET', route: '/api/v1/project-profitability/projects/:projectId/stages' }),
  Object.freeze({ method: 'GET', route: '/api/v1/project-profitability/projects/:projectId/trend' }),
  Object.freeze({ method: 'GET', route: '/api/v1/project-profitability/portfolio' })
] as const);

/** Trend bucket sizes supported by the bounded Module 19 analytical read. */
export const PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES = Object.freeze([
  'DAY',
  'WEEK',
  'MONTH'
] as const);

/** Request values that must always be derived from authenticated source ownership. */
export const PROJECT_PROFITABILITY_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'recognizedRevenue',
  'actualCost',
  'profitAmount',
  'billedAmount',
  'receivedAmount',
  'allocatedAmount',
  'advanceAmount',
  'outstandingAmount',
  'supplierPayableAmount',
  'formula',
  'expression',
  'metricExpression'
] as const);

export type ProjectProfitabilityPermissionCode = (typeof PROJECT_PROFITABILITY_PERMISSION_CODES)[number];
export type ProjectProfitabilityErrorCode = (typeof PROJECT_PROFITABILITY_ERROR_CODES)[number];
export type ProjectProfitabilityTrendGranularity = (typeof PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES)[number];

const uuidSchema = z.string().uuid();
const searchSchema = z.string().trim().min(1).max(200);
const currencySchema = z.string().trim().length(3)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), 'currency must be a three-letter code');
const exactMoneySchema = z.string().trim().regex(
  /^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be an exact decimal with up to 2 decimal places'
);
const exactNonNegativeMoneySchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be a non-negative exact decimal with up to 2 decimal places'
);
const exactPercentSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
  'percentage must be an exact decimal between 0 and 100 with up to 4 decimal places'
).refine((value) => Number(value) >= 0 && Number(value) <= 100, {
  message: 'percentage must be between 0 and 100'
});
const trendGranularitySchema = z.enum(PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES);

/** Check that one date-only string is a real calendar date. */
function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

const dateSchema = z.string().refine(isValidDateOnly, {
  message: 'date must use a valid YYYY-MM-DD calendar date'
});

/** Convert one validated date-only string to a UTC day ordinal for bounded range checks. */
function dateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/** Reject invalid or unbounded trend windows before repository work begins. */
function validateTrendDateRange(
  value: { fromDate: string; toDate: string },
  context: z.RefinementCtx
): void {
  if (value.toDate < value.fromDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: 'toDate cannot precede fromDate.'
    });
    return;
  }

  const inclusiveDays = dateOrdinal(value.toDate) - dateOrdinal(value.fromDate) + 1;
  if (inclusiveDays > PROJECT_PROFITABILITY_MAX_TREND_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: `trend date range cannot exceed ${PROJECT_PROFITABILITY_MAX_TREND_DAYS} days.`
    });
  }
}

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(PROJECT_PROFITABILITY_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Project identifier used by Project, Stage and trend profitability reads. */
export const projectProfitabilityProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();

/** Validate one optional inclusive as-of date without accepting formulas or ownership fields. */
export const projectProfitabilityAsOfQuerySchema = z.object({
  asOfDate: dateSchema.optional()
}).strict();

/** Validate one bounded Project profitability trend request. */
export const projectProfitabilityTrendQuerySchema = z.object({
  fromDate: dateSchema,
  toDate: dateSchema,
  granularity: trendGranularitySchema
}).strict().superRefine(validateTrendDateRange);

/** Validate one bounded permission-scoped portfolio request. */
export const projectProfitabilityPortfolioQuerySchema = z.object({
  asOfDate: dateSchema.optional(),
  search: searchSchema.optional(),
  clientId: uuidSchema.optional(),
  ...paginationShape
}).strict();

/** Financial measures shared by Project, Stage and portfolio profitability responses. */
export const projectProfitabilityFinancialValuesSchema = z.object({
  recognizedRevenue: exactMoneySchema,
  actualCost: exactMoneySchema,
  profitAmount: exactMoneySchema,
  billedAmount: exactNonNegativeMoneySchema,
  receivedAmount: exactNonNegativeMoneySchema,
  allocatedAmount: exactNonNegativeMoneySchema,
  advanceAmount: exactNonNegativeMoneySchema,
  outstandingAmount: exactNonNegativeMoneySchema,
  supplierPayableAmount: exactNonNegativeMoneySchema
}).strict();

/** Validate one Project-level profitability summary without storing a second source of truth. */
export const projectProfitabilitySummaryResponseSchema = z.object({
  projectId: uuidSchema,
  projectCode: z.string().trim().min(1).max(100),
  projectName: z.string().trim().min(1).max(300),
  currency: currencySchema,
  asOfDate: dateSchema,
  ...projectProfitabilityFinancialValuesSchema.shape
}).strict();

/** Validate one Stage row while keeping physical progress and financial measures distinct. */
export const projectProfitabilityStageRowResponseSchema = z.object({
  stageId: uuidSchema,
  stageCode: z.string().trim().min(1).max(100),
  stageName: z.string().trim().min(1).max(300),
  sequenceNo: z.number().int().min(1),
  weightPercent: exactPercentSchema,
  physicalProgressPercent: exactPercentSchema,
  plannedAmount: exactNonNegativeMoneySchema.nullable(),
  ...projectProfitabilityFinancialValuesSchema.shape
}).strict();

/** Validate one Project-only financial bucket that must never be guessed into a Stage. */
export const projectProfitabilityProjectOnlyResponseSchema = projectProfitabilityFinancialValuesSchema;

/** Validate the Stage profitability read with an explicit Project-only reconciliation bucket. */
export const projectProfitabilityStagesResponseSchema = z.object({
  projectId: uuidSchema,
  currency: currencySchema,
  asOfDate: dateSchema,
  stages: z.array(projectProfitabilityStageRowResponseSchema),
  projectOnly: projectProfitabilityProjectOnlyResponseSchema,
  projectTotal: projectProfitabilityFinancialValuesSchema
}).strict();

/** Validate one bounded revenue/cost/profit trend bucket. */
export const projectProfitabilityTrendPointResponseSchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema,
  recognizedRevenue: exactMoneySchema,
  actualCost: exactMoneySchema,
  profitAmount: exactMoneySchema
}).strict();

/** Validate one complete Project trend response. */
export const projectProfitabilityTrendResponseSchema = z.object({
  projectId: uuidSchema,
  currency: currencySchema,
  fromDate: dateSchema,
  toDate: dateSchema,
  granularity: trendGranularitySchema,
  points: z.array(projectProfitabilityTrendPointResponseSchema)
}).strict();

/** Validate one permission-scoped Project item in the portfolio response. */
export const projectProfitabilityPortfolioItemResponseSchema = z.object({
  projectId: uuidSchema,
  projectCode: z.string().trim().min(1).max(100),
  projectName: z.string().trim().min(1).max(300),
  clientId: uuidSchema,
  currency: currencySchema,
  ...projectProfitabilityFinancialValuesSchema.shape
}).strict();

/** Validate one bounded Project Profitability portfolio page without unsafe cross-currency totals. */
export const projectProfitabilityPortfolioResponseSchema = z.object({
  asOfDate: dateSchema,
  items: z.array(projectProfitabilityPortfolioItemResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(PROJECT_PROFITABILITY_MAX_PAGE_SIZE)
}).strict();

/** Convert one stable Project Profitability code into the shared API error envelope. */
export function createProjectProfitabilityError(code: ProjectProfitabilityErrorCode): AppError {
  switch (code) {
    case 'PROFITABILITY_SCOPE_FORBIDDEN':
      return new AuthorizationError({
        code,
        message: 'Project Profitability access is outside the authenticated Company or Project scope.'
      });
    case 'PROFITABILITY_SOURCE_INCOMPLETE':
      return new ConflictError({
        code,
        message: 'Required approved or posted profitability source data is incomplete.'
      });
    case 'INVALID_PROFITABILITY_FILTER':
      return new ValidationError({
        code,
        message: 'The Project Profitability filter is invalid.'
      });
  }
}

export type ProjectProfitabilityProjectParams = z.infer<typeof projectProfitabilityProjectParamsSchema>;
export type ProjectProfitabilityAsOfQuery = z.infer<typeof projectProfitabilityAsOfQuerySchema>;
export type ProjectProfitabilityTrendQuery = z.infer<typeof projectProfitabilityTrendQuerySchema>;
export type ProjectProfitabilityPortfolioQuery = z.infer<typeof projectProfitabilityPortfolioQuerySchema>;
export type ProjectProfitabilityFinancialValues = z.infer<typeof projectProfitabilityFinancialValuesSchema>;
export type ProjectProfitabilitySummaryResponse = z.infer<typeof projectProfitabilitySummaryResponseSchema>;
export type ProjectProfitabilityStageRowResponse = z.infer<typeof projectProfitabilityStageRowResponseSchema>;
export type ProjectProfitabilityStagesResponse = z.infer<typeof projectProfitabilityStagesResponseSchema>;
export type ProjectProfitabilityTrendPointResponse = z.infer<typeof projectProfitabilityTrendPointResponseSchema>;
export type ProjectProfitabilityTrendResponse = z.infer<typeof projectProfitabilityTrendResponseSchema>;
export type ProjectProfitabilityPortfolioItemResponse = z.infer<typeof projectProfitabilityPortfolioItemResponseSchema>;
export type ProjectProfitabilityPortfolioResponse = z.infer<typeof projectProfitabilityPortfolioResponseSchema>;
