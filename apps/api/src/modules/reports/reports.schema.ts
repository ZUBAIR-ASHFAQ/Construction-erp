import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Stable API base for Final-21 Module 20 Reports & Analytics. */
export const REPORTS_API_BASE = '/api/v1/reports' as const;

/** Maximum page size for one bounded synchronous report request. */
export const REPORTS_MAX_PAGE_SIZE = 100;

/** Maximum inclusive date range for one synchronous report request. */
export const REPORTS_MAX_DATE_RANGE_DAYS = 366;

/** Durable Foundation queue used for retryable report export generation. */
export const REPORT_EXPORT_QUEUE_NAME = 'report-exports' as const;

/** Stable queue job type for one asynchronous report export. */
export const REPORT_EXPORT_JOB_TYPE = 'reports.export' as const;

/** Hard row ceiling keeps worker memory and generated files bounded. */
export const REPORT_EXPORT_MAX_ROWS = 10_000;

/** Final Module 20 permission vocabulary. */
export const REPORTS_PERMISSION_CODES = Object.freeze([
  'reports.read',
  'reports.export',
  'reports.finance.read',
  'reports.hr.read',
  'reports.save_filters'
] as const);

/** Final Module 20 stable public business errors. */
export const REPORTS_ERROR_CODES = Object.freeze([
  'REPORT_NOT_FOUND',
  'REPORT_SCOPE_FORBIDDEN',
  'REPORT_FILTER_INVALID',
  'REPORT_EXPORT_FAILED'
] as const);

/** Report codes explicitly supported by the Final-21 report catalog. */
export const REPORT_CODES = Object.freeze([
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
] as const);

/** Export formats allowed by the Reports module. */
export const REPORT_OUTPUT_FORMATS = Object.freeze(['PDF', 'EXCEL', 'CSV'] as const);

/** Built-in catalog metadata keeps Module 20 usable without browser-defined report formulas. */
export const REPORT_DEFINITION_DEFAULTS = Object.freeze([
  { code: 'project-cost', name: 'Project Cost', domain: 'PROJECTS', requiredPermissions: ['reports.finance.read'] },
  { code: 'budget-vs-actual', name: 'Budget vs Actual', domain: 'PROJECTS', requiredPermissions: ['reports.finance.read'] },
  { code: 'project-profit-loss', name: 'Project Profit/Loss', domain: 'PROJECTS', requiredPermissions: ['reports.finance.read'] },
  { code: 'project-expenses', name: 'Project Expenses', domain: 'PROJECTS', requiredPermissions: ['reports.finance.read'] },
  { code: 'project-material', name: 'Project Material', domain: 'INVENTORY', requiredPermissions: [] },
  { code: 'stage-progress', name: 'Stage Progress', domain: 'PROJECTS', requiredPermissions: [] },
  { code: 'stage-cost', name: 'Stage Cost', domain: 'PROJECTS', requiredPermissions: ['reports.finance.read'] },
  { code: 'stage-billing', name: 'Stage Billing', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'stage-receipts', name: 'Stage Receipts', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'client-billing', name: 'Client Billing', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'client-payments', name: 'Client Payments', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'client-outstanding', name: 'Client Outstanding', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'client-advance', name: 'Client Advance', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'client-aging', name: 'Client Aging', domain: 'COMMERCIAL', requiredPermissions: ['reports.finance.read'] },
  { code: 'supplier-purchases', name: 'Supplier Purchases', domain: 'PROCUREMENT', requiredPermissions: [] },
  { code: 'supplier-payables', name: 'Supplier Payables', domain: 'PROCUREMENT', requiredPermissions: ['reports.finance.read'] },
  { code: 'supplier-payments', name: 'Supplier Payments', domain: 'PROCUREMENT', requiredPermissions: ['reports.finance.read'] },
  { code: 'supplier-aging', name: 'Supplier Aging', domain: 'PROCUREMENT', requiredPermissions: ['reports.finance.read'] },
  { code: 'attendance', name: 'Attendance', domain: 'PEOPLE', requiredPermissions: ['reports.hr.read'] },
  { code: 'payroll', name: 'Payroll', domain: 'PEOPLE', requiredPermissions: ['reports.hr.read'] },
  { code: 'labour-cost', name: 'Labour Cost', domain: 'PEOPLE', requiredPermissions: ['reports.hr.read', 'reports.finance.read'] },
  { code: 'cash-bank', name: 'Cash/Bank', domain: 'FINANCE', requiredPermissions: ['reports.finance.read'] },
  { code: 'general-ledger', name: 'General Ledger', domain: 'FINANCE', requiredPermissions: ['reports.finance.read'] },
  { code: 'profit-loss', name: 'Profit & Loss', domain: 'FINANCE', requiredPermissions: ['reports.finance.read'] },
  { code: 'balance-sheet', name: 'Balance Sheet', domain: 'FINANCE', requiredPermissions: ['reports.finance.read'] },
  { code: 'cash-flow', name: 'Cash Flow', domain: 'FINANCE', requiredPermissions: ['reports.finance.read'] }
].map((definition) => Object.freeze({
  ...definition,
  companyId: null,
  filterSchemaJson: {},
  outputFormats: [...REPORT_OUTPUT_FORMATS],
  status: 'ACTIVE'
})));

/** Lifecycle states for asynchronous report export runs. */
export const REPORT_RUN_STATUS_VALUES = Object.freeze([
  'QUEUED',
  'RUNNING',
  'COMPLETED',
  'FAILED'
] as const);

/** Request values that must always come from authenticated server context or source modules. */
export const REPORTS_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'requiredPermissions',
  'status',
  'fileId',
  'startedAt',
  'finishedAt',
  'errorCode',
  'formula',
  'expression',
  'metricExpression',
  'sql',
  'queryText'
] as const);

/** HTTP methods used by the frozen B20.1 Reports route contract. */
export type ReportsHttpMethod = 'GET' | 'POST';

/** One route in the frozen Reports & Analytics HTTP surface. */
export type ReportsRouteDefinition = Readonly<{
  method: ReportsHttpMethod;
  path: string;
  purpose: string;
}>;

export type ReportsPermissionCode = (typeof REPORTS_PERMISSION_CODES)[number];
export type ReportsErrorCode = (typeof REPORTS_ERROR_CODES)[number];
export type ReportCode = (typeof REPORT_CODES)[number];
export type ReportOutputFormat = (typeof REPORT_OUTPUT_FORMATS)[number];
export type ReportRunStatus = (typeof REPORT_RUN_STATUS_VALUES)[number];

const uuidSchema = z.string().uuid();
const reportCodeSchema = z.enum(REPORT_CODES);
const outputFormatSchema = z.enum(REPORT_OUTPUT_FORMATS);
const reportRunStatusSchema = z.enum(REPORT_RUN_STATUS_VALUES);
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

/** Reject reversed or unbounded report date windows before service work begins. */
function validateReportDateRange(
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
  if (inclusiveDays > REPORTS_MAX_DATE_RANGE_DAYS) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: `report date range cannot exceed ${REPORTS_MAX_DATE_RANGE_DAYS} days.`
    });
  }
}

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(REPORTS_MAX_PAGE_SIZE).optional()
} as const;

/** Common allow-listed filters; the service applies each report definition's narrower filter contract. */
export const reportFiltersSchema = z.object({
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  clientId: uuidSchema.optional(),
  vendorId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  warehouseId: uuidSchema.optional(),
  materialId: uuidSchema.optional(),
  cashBankAccountId: uuidSchema.optional(),
  periodId: uuidSchema.optional(),
  accountId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  asOfDate: dateSchema.optional(),
  status: z.string().trim().min(1).max(80).optional(),
  search: searchSchema.optional(),
  ...paginationShape
}).strict().superRefine(validateReportDateRange);

/** Validate optional catalog filters without exposing report-definition writes. */
export const reportCatalogQuerySchema = z.object({
  search: searchSchema.optional(),
  domain: z.string().trim().min(1).max(100).optional()
}).strict();

/** Validate one bounded synchronous report request. */
export const runReportBodySchema = z.object({
  reportCode: reportCodeSchema,
  filters: reportFiltersSchema.default({})
}).strict();

/** Validate one asynchronous export request. */
export const createReportExportBodySchema = z.object({
  reportCode: reportCodeSchema,
  filters: reportFiltersSchema.default({}),
  outputFormat: outputFormatSchema
}).strict();

/** Validate one persisted report-run identifier. */
export const reportRunIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate saved-filter listing by an optional allow-listed report code. */
export const savedReportFiltersQuerySchema = z.object({
  reportCode: reportCodeSchema.optional()
}).strict();

/** Validate one user-owned saved filter without accepting company or user ownership fields. */
export const saveReportFilterBodySchema = z.object({
  reportCode: reportCodeSchema,
  name: z.string().trim().min(1).max(100),
  filters: reportFiltersSchema.default({})
}).strict();

/** Validate one report shown in the permission-filtered catalog. */
export const reportCatalogItemResponseSchema = z.object({
  code: reportCodeSchema,
  name: z.string().trim().min(1).max(200),
  domain: z.string().trim().min(1).max(100),
  requiredPermissions: z.array(z.string().trim().min(1).max(120)),
  outputFormats: z.array(outputFormatSchema),
  status: z.string().trim().min(1).max(40)
}).strict();

/** Validate the permission-filtered report catalog response. */
export const reportCatalogResponseSchema = z.object({
  items: z.array(reportCatalogItemResponseSchema)
}).strict();

/** Validate generic report result metadata while report rows remain server-generated source data. */
export const runReportResponseSchema = z.object({
  reportCode: reportCodeSchema,
  generatedAt: z.string().datetime(),
  asOfDate: dateSchema.nullable(),
  rows: z.array(z.record(z.string(), z.unknown())),
  total: z.number().int().min(0).optional(),
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(REPORTS_MAX_PAGE_SIZE).optional()
}).strict();

/** Validate one asynchronous report export run. */
export const reportRunResponseSchema = z.object({
  id: uuidSchema,
  reportCode: reportCodeSchema,
  outputFormat: outputFormatSchema,
  status: reportRunStatusSchema,
  fileId: uuidSchema.nullable(),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  errorCode: z.string().trim().min(1).max(100).nullable()
}).strict();

/** Validate one authorized signed download response. */
export const reportDownloadResponseSchema = z.object({
  url: z.string().url(),
  expiresAt: z.string().datetime()
}).strict();

/** Validate one saved report filter returned to its owning user. */
export const savedReportFilterResponseSchema = z.object({
  id: uuidSchema,
  reportCode: reportCodeSchema,
  name: z.string().trim().min(1).max(100),
  filters: reportFiltersSchema,
  createdAt: z.string().datetime()
}).strict();

/** Validate the current user's saved-filter list. */
export const savedReportFiltersResponseSchema = z.object({
  items: z.array(savedReportFilterResponseSchema)
}).strict();

/** Convert one stable Reports error code into the shared API error envelope. */
export function createReportsError(code: ReportsErrorCode): AppError {
  switch (code) {
    case 'REPORT_NOT_FOUND':
      return new NotFoundError({ code, message: 'The requested report is not available.' });
    case 'REPORT_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message: 'The requested report or Project is outside the authenticated scope.' });
    case 'REPORT_FILTER_INVALID':
      return new ValidationError({ code, message: 'The report filter is invalid.' });
    case 'REPORT_EXPORT_FAILED':
      return new ConflictError({ code, message: 'The report export did not complete successfully.' });
  }
}

export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type ReportCatalogQuery = z.infer<typeof reportCatalogQuerySchema>;
export type RunReportBody = z.infer<typeof runReportBodySchema>;
export type CreateReportExportBody = z.infer<typeof createReportExportBodySchema>;
export type ReportRunIdParams = z.infer<typeof reportRunIdParamsSchema>;
export type SavedReportFiltersQuery = z.infer<typeof savedReportFiltersQuerySchema>;
export type SaveReportFilterBody = z.infer<typeof saveReportFilterBodySchema>;
export type ReportCatalogItemResponse = z.infer<typeof reportCatalogItemResponseSchema>;
export type ReportCatalogResponse = z.infer<typeof reportCatalogResponseSchema>;
export type RunReportResponse = z.infer<typeof runReportResponseSchema>;
export type ReportRunResponse = z.infer<typeof reportRunResponseSchema>;
export type ReportDownloadResponse = z.infer<typeof reportDownloadResponseSchema>;
export type SavedReportFilterResponse = z.infer<typeof savedReportFilterResponseSchema>;
export type SavedReportFiltersResponse = z.infer<typeof savedReportFiltersResponseSchema>;
