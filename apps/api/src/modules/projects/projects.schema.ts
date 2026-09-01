import {
  AppError,
  AuthorizationError,
  ConflictError,
  NotFoundError
} from '@construction-erp/errors';
import { z } from 'zod';

/** Final Project Management contracts shared by repository, service and routes. */
export const PROJECT_MAX_PAGE_SIZE = 100;

export const PROJECT_PERMISSION_CODES = Object.freeze([
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.activate',
  'projects.complete',
  'projects.close'
] as const);

export const PROJECT_ERROR_CODES = Object.freeze([
  'PROJECT_NOT_FOUND',
  'DUPLICATE_PROJECT_CODE',
  'PROJECT_SCOPE_FORBIDDEN',
  'INVALID_PROJECT_MODEL',
  'PROJECT_NOT_READY',
  'INVALID_PROJECT_TRANSITION'
] as const);

export const PROJECT_EVENT_TYPES = Object.freeze([
  'project.created',
  'project.activated',
  'project.status_changed',
  'project.completed',
  'project.closed'
] as const);

export const PROJECT_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/projects' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects' }),
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/projects/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:id/activate' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:id/suspend' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:id/resume' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:id/complete' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:id/close' })
] as const);

export const PROJECT_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'status',
  'statusHistory',
  'changedBy',
  'createdAt',
  'updatedAt'
] as const);

export type ProjectPermissionCode = (typeof PROJECT_PERMISSION_CODES)[number];
export type ProjectErrorCode = (typeof PROJECT_ERROR_CODES)[number];
export type ProjectEventType = (typeof PROJECT_EVENT_TYPES)[number];

export const projectPermissionCodeSchema = z.enum(PROJECT_PERMISSION_CODES);
export const projectErrorCodeSchema = z.enum(PROJECT_ERROR_CODES);
export const projectStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED']);
export const projectModelSchema = z.enum(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']);
const projectModelRequestSchema = z.string().trim().min(1).max(32);

const uuidSchema = z.string().uuid();
const projectCodeSchema = z.string().trim().min(1).max(100);
const projectNameSchema = z.string().trim().min(1).max(300);
const projectLocationSchema = z.string().trim().min(1).max(1000);
const searchSchema = z.string().trim().min(1).max(200);
const closeReasonSchema = z.string().trim().min(1).max(5000);
const currencySchema = z.string().trim().length(3)
  .transform((value) => value.toUpperCase())
  .refine((value) => /^[A-Z]{3}$/.test(value), 'currency must be a three-letter code');
const projectValueSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'projectValue must be a non-negative exact decimal with at most 2 decimal places.'
);
const projectPercentResponseSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
  'percentage must be between 0 and 100 with at most 4 decimal places.'
);
const costPlusPercentSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/,
  'costPlusPercent must be an exact decimal between 0 and 100 with at most 4 decimal places.'
).refine((value) => Number(value) > 0 && Number(value) <= 100, {
  message: 'costPlusPercent must be greater than 0 and at most 100.'
});
const timestampSchema = z.string().datetime({ offset: true });

/** Check that a date-only string is a real calendar date. */
function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

const dateSchema = z.string().refine(isValidDateOnly, {
  message: 'date must use a valid YYYY-MM-DD calendar date'
});

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(PROJECT_MAX_PAGE_SIZE).optional()
} as const;

/** Add a readable validation error when a complete date pair is out of order. */
function validateProvidedDateRange(
  value: { startDate?: string | undefined; plannedEndDate?: string | undefined },
  context: z.RefinementCtx
): void {
  if (value.startDate && value.plannedEndDate && value.plannedEndDate < value.startDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plannedEndDate'],
      message: 'plannedEndDate cannot precede startDate.'
    });
  }
}

/** Validate commercial fields that can be checked without reading the current Project row. */
function validateProvidedCommercialModel(
  value: { projectModel?: string | undefined; costPlusPercent?: string | null | undefined },
  context: z.RefinementCtx
): void {
  if (value.projectModel === 'FIXED_PRICE' && value.costPlusPercent !== undefined && value.costPlusPercent !== null) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costPlusPercent'],
      message: 'costPlusPercent must be empty for a Fixed Price Project.'
    });
  }

  if (value.projectModel === 'COST_PLUS_PERCENTAGE' && (value.costPlusPercent === undefined || value.costPlusPercent === null)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['costPlusPercent'],
      message: 'costPlusPercent is required for a Cost + Percentage Project.'
    });
  }
}

/** Path contract for Project detail, update and lifecycle command routes. */
export const projectIdParamsSchema = z.object({
  id: uuidSchema
}).strict();

/** Bounded Project-register filters backed by the Project lookup indexes. */
export const listProjectsQuerySchema = z.object({
  search: searchSchema.optional(),
  clientId: uuidSchema.optional(),
  projectModel: projectModelSchema.optional(),
  status: projectStatusSchema.optional(),
  ...paginationQueryShape
}).strict();

/** Create one company-owned DRAFT Project without accepting server-owned lifecycle fields. */
export const createProjectBodySchema = z.object({
  projectCode: projectCodeSchema,
  name: projectNameSchema,
  clientId: uuidSchema,
  projectModel: projectModelRequestSchema,
  projectValue: projectValueSchema,
  costPlusPercent: costPlusPercentSchema.nullable().optional(),
  currency: currencySchema,
  startDate: dateSchema,
  plannedEndDate: dateSchema,
  projectManagerUserId: uuidSchema.nullable().optional(),
  location: projectLocationSchema.nullable().optional()
}).strict().superRefine((value, context) => {
  validateProvidedDateRange(value, context);
  validateProvidedCommercialModel(value, context);
});

/** Update only normal editable Project-master fields; code and status remain outside this PATCH. */
export const updateProjectBodySchema = z.object({
  name: projectNameSchema.optional(),
  clientId: uuidSchema.optional(),
  projectModel: projectModelRequestSchema.optional(),
  projectValue: projectValueSchema.optional(),
  costPlusPercent: costPlusPercentSchema.nullable().optional(),
  currency: currencySchema.optional(),
  startDate: dateSchema.optional(),
  plannedEndDate: dateSchema.optional(),
  projectManagerUserId: uuidSchema.nullable().optional(),
  location: projectLocationSchema.nullable().optional()
}).strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one editable Project field must be provided.'
  })
  .superRefine((value, context) => {
    validateProvidedDateRange(value, context);
    validateProvidedCommercialModel(value, context);
  });

/** Activation is an explicit bodyless lifecycle command. */
export const activateProjectBodySchema = z.object({}).strict();

/** Completion is an explicit bodyless lifecycle command. */
export const completeProjectBodySchema = z.object({}).strict();

/** Suspend accepts only an optional reason used by lifecycle history and audit. */
export const suspendProjectBodySchema = z.object({
  reason: closeReasonSchema.optional()
}).strict();

/** Resume accepts only an optional reason used by lifecycle history and audit. */
export const resumeProjectBodySchema = z.object({
  reason: closeReasonSchema.optional()
}).strict();

/** Close accepts only an optional reason used by lifecycle history and audit. */
export const closeProjectBodySchema = z.object({
  reason: closeReasonSchema.optional()
}).strict();

/** Safe Project master returned to clients without exposing company ownership internals. */
export const projectResponseSchema = z.object({
  id: uuidSchema,
  projectCode: projectCodeSchema,
  name: projectNameSchema,
  clientId: uuidSchema,
  projectModel: projectModelSchema,
  projectValue: projectValueSchema,
  costPlusPercent: costPlusPercentSchema.nullable(),
  status: projectStatusSchema,
  currency: currencySchema,
  startDate: dateSchema,
  plannedEndDate: dateSchema,
  projectManagerUserId: uuidSchema.nullable(),
  location: projectLocationSchema.nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema
}).strict();

/** Append-only lifecycle history returned as part of Project detail. */
export const projectStatusHistoryResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  fromStatus: projectStatusSchema.nullable(),
  toStatus: projectStatusSchema,
  changedBy: uuidSchema,
  reason: z.string().nullable(),
  changedAt: timestampSchema
}).strict();

/** Paginated Project-register result used inside the shared success envelope. */
export const listProjectsResponseSchema = z.object({
  items: z.array(projectResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(PROJECT_MAX_PAGE_SIZE)
}).strict();

/** Project detail returns source-owned Stage, Team, Budget, Cost, Billing and Receipt summaries. */
export const projectDetailsResponseSchema = z.object({
  project: projectResponseSchema,
  statusHistory: z.array(projectStatusHistoryResponseSchema),
  stageSummary: z.object({
    stageCount: z.number().int().min(0),
    baselineStatus: z.string().nullable(),
    totalWeightPercent: projectPercentResponseSchema.nullable(),
    overallPhysicalProgressPercent: projectPercentResponseSchema
  }).strict().nullable(),
  teamSummary: z.object({
    activeAssignmentCount: z.number().int().min(0),
    activeEmployeeCount: z.number().int().min(0)
  }).strict().nullable(),
  budgetSummary: z.object({
    versionNo: z.number().int().min(1),
    status: z.string(),
    currency: currencySchema,
    totalAmount: projectValueSchema
  }).strict().nullable(),
  costSummary: z.object({
    budgetCost: projectValueSchema,
    committedCost: projectValueSchema,
    actualCost: projectValueSchema,
    forecastCost: projectValueSchema,
    variance: z.string().regex(/^-?(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/)
  }).strict().nullable(),
  billingSummary: z.object({
    invoiceCount: z.number().int().min(0),
    billedAmount: projectValueSchema
  }).strict().nullable(),
  receiptSummary: z.object({
    receivedAmount: projectValueSchema,
    allocatedAmount: projectValueSchema,
    advanceAmount: projectValueSchema,
    outstandingAmount: projectValueSchema.nullable()
  }).strict().nullable()
}).strict();

export type ProjectIdParams = z.infer<typeof projectIdParamsSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
export type CreateProjectBody = z.infer<typeof createProjectBodySchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectBodySchema>;
export type ActivateProjectBody = z.infer<typeof activateProjectBodySchema>;
export type CompleteProjectBody = z.infer<typeof completeProjectBodySchema>;
export type SuspendProjectBody = z.infer<typeof suspendProjectBodySchema>;
export type ResumeProjectBody = z.infer<typeof resumeProjectBodySchema>;
export type CloseProjectBody = z.infer<typeof closeProjectBodySchema>;
export type ProjectResponse = z.infer<typeof projectResponseSchema>;
export type ProjectStatusHistoryResponse = z.infer<typeof projectStatusHistoryResponseSchema>;
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;
export type ProjectDetailsResponse = z.infer<typeof projectDetailsResponseSchema>;

const PROJECT_ERROR_MESSAGES: Readonly<Record<ProjectErrorCode, string>> = Object.freeze({
  PROJECT_NOT_FOUND: 'The requested Project was not found.',
  DUPLICATE_PROJECT_CODE: 'A Project with this code already exists.',
  PROJECT_SCOPE_FORBIDDEN: 'You are not allowed to access this Project.',
  INVALID_PROJECT_MODEL: 'The Project model is not supported.',
  PROJECT_NOT_READY: 'The Project is not ready for the requested lifecycle transition.',
  INVALID_PROJECT_TRANSITION: 'The requested Project lifecycle transition is not allowed.'
});

/** Map each Project Management business code to one stable public HTTP error type. */
export function createProjectError(code: ProjectErrorCode): AppError {
  const message = PROJECT_ERROR_MESSAGES[code];

  switch (code) {
    case 'PROJECT_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'PROJECT_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message });
    case 'DUPLICATE_PROJECT_CODE':
    case 'INVALID_PROJECT_MODEL':
    case 'PROJECT_NOT_READY':
    case 'INVALID_PROJECT_TRANSITION':
      return new ConflictError({ code, message });
  }
}
