import {
  AppError,
  AuthorizationError,
  NotFoundError,
  ValidationError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Stable API base for Final-21 Module 1 Dashboard. */
export const DASHBOARD_API_BASE = '/api/v1/dashboard' as const;

/** Maximum page size for one bounded Dashboard list request. */
export const DASHBOARD_MAX_PAGE_SIZE = 100;

/** Maximum inclusive date range accepted by Dashboard filters. */
export const DASHBOARD_MAX_DATE_RANGE_DAYS = 366;

/** Final Module 1 permission vocabulary. */
export const DASHBOARD_PERMISSION_CODES = Object.freeze([
  'dashboard.read',
  'dashboard.project.read',
  'dashboard.finance.read',
  'dashboard.manage_preferences'
] as const);

/** Final Module 1 stable public business errors. */
export const DASHBOARD_ERROR_CODES = Object.freeze([
  'DASHBOARD_SCOPE_FORBIDDEN',
  'DASHBOARD_WIDGET_NOT_AVAILABLE',
  'INVALID_DASHBOARD_FILTER'
] as const);

/** Allow-listed Dashboard widgets derived from the Final-21 UI requirements. */
export const DASHBOARD_WIDGET_CODES = Object.freeze([
  'executive-summary',
  'project-health',
  'stage-progress',
  'budget-vs-actual',
  'billed-received-outstanding',
  'supplier-payable',
  'cash-bank',
  'profit-loss',
  'alerts'
] as const);

/** Request values that must always come from authenticated context or source modules. */
export const DASHBOARD_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'authoritativeTotals',
  'overallProgress',
  'actualCost',
  'billed',
  'received',
  'outstanding',
  'payable',
  'profit',
  'formula',
  'expression',
  'metricExpression',
  'sql',
  'queryText'
] as const);

/** HTTP methods used by the frozen B1.1 Dashboard route contract. */
export type DashboardHttpMethod = 'GET' | 'PATCH';

/** One route in the frozen Dashboard HTTP surface. */
export type DashboardRouteDefinition = Readonly<{
  method: DashboardHttpMethod;
  path: string;
  purpose: string;
}>;

export type DashboardPermissionCode = (typeof DASHBOARD_PERMISSION_CODES)[number];
export type DashboardErrorCode = (typeof DASHBOARD_ERROR_CODES)[number];
export type DashboardWidgetCode = (typeof DASHBOARD_WIDGET_CODES)[number];

const uuidSchema = z.string().uuid();
const widgetCodeSchema = z.enum(DASHBOARD_WIDGET_CODES);
const searchSchema = z.string().trim().min(1).max(200);

/** Check that one date-only value represents a real calendar date. */
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

/** Convert one validated date-only value to a UTC day ordinal. */
function dateOrdinal(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Math.floor(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1) / 86_400_000);
}

/** Reject reversed or unbounded Dashboard date windows before service work begins. */
function validateDashboardDateRange(
  value: { fromDate?: string | undefined; toDate?: string | undefined },
  context: z.RefinementCtx
): void {
  if (!value.fromDate || !value.toDate) return;

  if (value.toDate < value.fromDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: 'toDate cannot precede fromDate.'
    });
    return;
  }

  const inclusiveDays = dateOrdinal(value.toDate) - dateOrdinal(value.fromDate) + 1;
  if (inclusiveDays > DASHBOARD_MAX_DATE_RANGE_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: `dashboard date range cannot exceed ${DASHBOARD_MAX_DATE_RANGE_DAYS} days.`
    });
  }
}

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(DASHBOARD_MAX_PAGE_SIZE).optional()
} as const;

const dateFilterShape = {
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  asOfDate: dateSchema.optional()
} as const;

/** Validate optional company-summary filters without accepting ownership or formulas. */
export const dashboardSummaryQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  widgetCodes: z.array(widgetCodeSchema).max(DASHBOARD_WIDGET_CODES.length).optional(),
  ...dateFilterShape
}).strict().superRefine(validateDashboardDateRange);

/** Validate bounded Project portfolio filters. */
export const dashboardProjectsQuerySchema = z.object({
  search: searchSchema.optional(),
  status: z.string().trim().min(1).max(80).optional(),
  ...dateFilterShape,
  ...paginationShape
}).strict().superRefine(validateDashboardDateRange);

/** Validate the Project identifier used by the single-Project Dashboard route. */
export const dashboardProjectParamsSchema = z.object({
  projectId: uuidSchema
}).strict();

/** Validate optional single-Project Dashboard filters and widget selection. */
export const dashboardProjectQuerySchema = z.object({
  widgetCodes: z.array(widgetCodeSchema).max(DASHBOARD_WIDGET_CODES.length).optional(),
  ...dateFilterShape
}).strict().superRefine(validateDashboardDateRange);

/** Validate bounded operational-alert filters. */
export const dashboardAlertsQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  ...dateFilterShape,
  ...paginationShape
}).strict().superRefine(validateDashboardDateRange);

/** Validate the small filter shape that may be stored inside user Dashboard preferences. */
export const dashboardPreferenceFiltersSchema = z.object({
  projectId: uuidSchema.optional(),
  search: searchSchema.optional(),
  status: z.string().trim().min(1).max(80).optional(),
  ...dateFilterShape
}).strict().superRefine(validateDashboardDateRange);

/** Validate one preference update while keeping company, actor and KPI values server-owned. */
export const updateDashboardPreferencesBodySchema = z.object({
  widgetCodes: z.array(widgetCodeSchema).min(1).max(DASHBOARD_WIDGET_CODES.length).optional(),
  defaultProjectId: uuidSchema.nullable().optional(),
  defaultFilters: dashboardPreferenceFiltersSchema.optional()
}).strict().refine(
  (value) => Object.values(value).some((item) => item !== undefined),
  { message: 'At least one Dashboard preference must be provided.' }
);

const DASHBOARD_ERROR_MESSAGES: Readonly<Record<DashboardErrorCode, string>> = Object.freeze({
  DASHBOARD_SCOPE_FORBIDDEN: 'The requested Project is outside the authenticated Dashboard scope.',
  DASHBOARD_WIDGET_NOT_AVAILABLE: 'The requested Dashboard widget is not available.',
  INVALID_DASHBOARD_FILTER: 'The Dashboard filter is invalid or unsupported.'
});

/** Convert one stable Dashboard error code into the shared API error envelope. */
export function createDashboardError(code: DashboardErrorCode): AppError {
  const message = DASHBOARD_ERROR_MESSAGES[code];

  switch (code) {
    case 'DASHBOARD_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message });
    case 'DASHBOARD_WIDGET_NOT_AVAILABLE':
      return new NotFoundError({ code, message });
    case 'INVALID_DASHBOARD_FILTER':
      return new ValidationError({ code, message });
  }
}

export type DashboardSummaryQuery = z.infer<typeof dashboardSummaryQuerySchema>;
export type DashboardProjectsQuery = z.infer<typeof dashboardProjectsQuerySchema>;
export type DashboardProjectParams = z.infer<typeof dashboardProjectParamsSchema>;
export type DashboardProjectQuery = z.infer<typeof dashboardProjectQuerySchema>;
export type DashboardAlertsQuery = z.infer<typeof dashboardAlertsQuerySchema>;
export type DashboardPreferenceFilters = z.infer<typeof dashboardPreferenceFiltersSchema>;
export type UpdateDashboardPreferencesBody = z.infer<typeof updateDashboardPreferencesBodySchema>;
