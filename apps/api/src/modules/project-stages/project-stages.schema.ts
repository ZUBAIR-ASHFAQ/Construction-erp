import { AppError, AuthorizationError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

export const STAGE_PERMISSION_CODES = Object.freeze([
  'stages.read',
  'stages.manage',
  'stages.baseline.freeze',
  'stages.progress.update',
  'stages.progress.approve',
  'stages.financial.read'
] as const);

export const STAGE_ERROR_CODES = Object.freeze([
  'STAGE_NOT_FOUND',
  'STAGE_WEIGHT_TOTAL_INVALID',
  'STAGE_BASELINE_LOCKED',
  'INVALID_STAGE_PROGRESS',
  'STAGE_SCOPE_FORBIDDEN'
] as const);

export const STAGE_EVENT_TYPES = Object.freeze([
  'project_stage.created',
  'project_stage.baseline_frozen',
  'project_stage.progress_recorded',
  'project_stage.progress_approved',
  'project_stage.completed'
] as const);

export const STAGE_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/stages' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/stages' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/projects/:projectId/stages/:stageId' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/stages/baseline/freeze' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/stages/:stageId/progress' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/stages/:stageId/progress/:updateId/approve' }),
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/stages/:stageId/financials' })
] as const);

export type StagePermissionCode = (typeof STAGE_PERMISSION_CODES)[number];
export type StageErrorCode = (typeof STAGE_ERROR_CODES)[number];

const uuidSchema = z.string().uuid();
const codeSchema = z.string().trim().min(1).max(100);
const nameSchema = z.string().trim().min(1).max(300);
const noteSchema = z.string().trim().min(1).max(5000);
const weightSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/,
  'weightPercent must be an exact percentage with at most 4 decimal places'
).refine((value) => Number(value) > 0 && Number(value) <= 100, 'weightPercent must be greater than 0 and at most 100');
const progressSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/,
  'progressPercent must be between 0 and 100 with at most 4 decimal places'
).refine((value) => Number(value) >= 0 && Number(value) <= 100, 'progressPercent must be between 0 and 100');
const costPlusPercentSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,2}|100)(?:\.\d{1,4})?$/,
  'costPlusPercent must be an exact percentage with at most 4 decimal places'
).refine((value) => Number(value) > 0 && Number(value) <= 100, 'costPlusPercent must be greater than 0 and at most 100');

/** Check that one date-only value is a real calendar date. */
function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const dateSchema = z.string().refine(isValidDateOnly, 'date must use a valid YYYY-MM-DD calendar date');

/** Validate optional planned stage dates when both are provided. */
function validatePlannedDates(
  value: { plannedStartDate?: string | null | undefined; plannedEndDate?: string | null | undefined },
  context: z.RefinementCtx
): void {
  if (value.plannedStartDate && value.plannedEndDate && value.plannedEndDate < value.plannedStartDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['plannedEndDate'],
      message: 'plannedEndDate cannot precede plannedStartDate.'
    });
  }
}

/** Validate the Project route identifier used by Stage collection commands. */
export const projectStageProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();

/** Validate the Project and Stage identifiers used by Stage resource commands. */
export const projectStageParamsSchema = z.object({ projectId: uuidSchema, stageId: uuidSchema }).strict();

/** Validate the Project, Stage and progress-update identifiers used by approval. */
export const stageProgressApprovalParamsSchema = z.object({
  projectId: uuidSchema,
  stageId: uuidSchema,
  updateId: uuidSchema
}).strict();

/** Validate one new draft Project Stage. */
export const createProjectStageBodySchema = z.object({
  code: codeSchema,
  name: nameSchema,
  sequenceNo: z.number().int().min(1),
  weightPercent: weightSchema,
  costPlusPercent: costPlusPercentSchema.nullable().optional(),
  plannedStartDate: dateSchema.nullable().optional(),
  plannedEndDate: dateSchema.nullable().optional()
}).strict().superRefine(validatePlannedDates);

/** Validate editable Stage planning fields before baseline freeze. */
export const updateProjectStageBodySchema = z.object({
  code: codeSchema.optional(),
  name: nameSchema.optional(),
  sequenceNo: z.number().int().min(1).optional(),
  weightPercent: weightSchema.optional(),
  costPlusPercent: costPlusPercentSchema.nullable().optional(),
  plannedStartDate: dateSchema.nullable().optional(),
  plannedEndDate: dateSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable Stage field must be provided.'
}).superRefine(validatePlannedDates);

/** Baseline freeze is an explicit bodyless command. */
export const freezeStageBaselineBodySchema = z.object({}).strict();

/** Validate one physical-progress update without accepting approval authority. */
export const createStageProgressBodySchema = z.object({
  progressPercent: progressSchema,
  progressDate: dateSchema,
  note: noteSchema.nullable().optional(),
  evidenceDocumentId: uuidSchema.nullable().optional()
}).strict();

/** Approval is an explicit bodyless command. */
export const approveStageProgressBodySchema = z.object({}).strict();

export type CreateProjectStageBody = z.infer<typeof createProjectStageBodySchema>;
export type UpdateProjectStageBody = z.infer<typeof updateProjectStageBodySchema>;
export type CreateStageProgressBody = z.infer<typeof createStageProgressBodySchema>;

const ERROR_MESSAGES: Readonly<Record<StageErrorCode, string>> = Object.freeze({
  STAGE_NOT_FOUND: 'The requested Project Stage was not found.',
  STAGE_WEIGHT_TOTAL_INVALID: 'The active Project Stage baseline must total exactly 100.0000%.',
  STAGE_BASELINE_LOCKED: 'The frozen Project Stage baseline cannot be directly edited.',
  INVALID_STAGE_PROGRESS: 'The Stage physical progress value or transition is invalid.',
  STAGE_SCOPE_FORBIDDEN: 'The requested Stage is outside the allowed Project scope.'
});

/** Map one stable Module 7 business code to the public API error category. */
export function createStageError(code: StageErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  switch (code) {
    case 'STAGE_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'STAGE_SCOPE_FORBIDDEN':
      return new AuthorizationError({ code, message });
    case 'STAGE_WEIGHT_TOTAL_INVALID':
    case 'STAGE_BASELINE_LOCKED':
    case 'INVALID_STAGE_PROGRESS':
      return new ConflictError({ code, message });
  }
}
