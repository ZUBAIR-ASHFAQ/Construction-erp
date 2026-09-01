import { AuthorizationError, ConflictError, NotFoundError, type AppError } from '@construction-erp/errors';
import { z } from 'zod';

export const PROJECT_TEAM_PERMISSION_CODES = Object.freeze([
  'project_team.read',
  'project_team.manage'
] as const);

export const PROJECT_TEAM_ERROR_CODES = Object.freeze([
  'ASSIGNMENT_NOT_FOUND',
  'EMPLOYEE_NOT_ASSIGNABLE',
  'ALLOCATION_EXCEEDED',
  'STAGE_ASSIGNMENT_INVALID'
] as const);

export const PROJECT_TEAM_EVENT_TYPES = Object.freeze([
  'project_team.assigned',
  'project_team.updated',
  'project_team.assignment_ended'
] as const);

export const PROJECT_TEAM_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/projects/:projectId/team' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/team' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/projects/:projectId/team/:assignmentId' }),
  Object.freeze({ method: 'POST', route: '/api/v1/projects/:projectId/team/:assignmentId/end' })
] as const);

export type ProjectTeamPermissionCode = (typeof PROJECT_TEAM_PERMISSION_CODES)[number];
export type ProjectTeamErrorCode = (typeof PROJECT_TEAM_ERROR_CODES)[number];

const uuidSchema = z.string().uuid();
const roleSchema = z.string().trim().min(1).max(160);
const allocationSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d?|100)(?:\.\d{1,4})?$/,
  'allocationPercent must be an exact percentage with at most 4 decimal places'
).refine((value) => Number(value) > 0 && Number(value) <= 100, 'allocationPercent must be greater than 0 and at most 100');

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

/** Validate an optional assignment date range. */
function validateDateRange(
  value: { fromDate?: string | undefined; toDate?: string | null | undefined },
  context: z.RefinementCtx
): void {
  if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: 'toDate cannot precede fromDate.'
    });
  }
}

/** Validate the Project identifier used by Project Team collection routes. */
export const projectTeamProjectParamsSchema = z.object({ projectId: uuidSchema }).strict();

/** Validate the Project and assignment identifiers used by assignment routes. */
export const projectTeamAssignmentParamsSchema = z.object({
  projectId: uuidSchema,
  assignmentId: uuidSchema
}).strict();

/** Validate one Employee Project/Stage assignment. */
export const createProjectTeamAssignmentBodySchema = z.object({
  employeeId: uuidSchema,
  projectRole: roleSchema,
  allocationPercent: allocationSchema,
  stageId: uuidSchema.nullable().optional(),
  fromDate: dateSchema,
  toDate: dateSchema.nullable().optional()
}).strict().superRefine(validateDateRange);

/** Validate editable assignment fields without allowing Employee or Project ownership changes. */
export const updateProjectTeamAssignmentBodySchema = z.object({
  projectRole: roleSchema.optional(),
  allocationPercent: allocationSchema.optional(),
  stageId: uuidSchema.nullable().optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable assignment field must be provided.'
}).superRefine(validateDateRange);

/** Validate the explicit assignment-end command. */
export const endProjectTeamAssignmentBodySchema = z.object({
  endDate: dateSchema,
  note: z.string().trim().min(1).max(2000).nullable().optional()
}).strict();

export type CreateProjectTeamAssignmentBody = z.infer<typeof createProjectTeamAssignmentBodySchema>;
export type UpdateProjectTeamAssignmentBody = z.infer<typeof updateProjectTeamAssignmentBodySchema>;
export type EndProjectTeamAssignmentBody = z.infer<typeof endProjectTeamAssignmentBodySchema>;

const ERROR_MESSAGES: Readonly<Record<ProjectTeamErrorCode, string>> = Object.freeze({
  ASSIGNMENT_NOT_FOUND: 'The requested Project Team assignment was not found.',
  EMPLOYEE_NOT_ASSIGNABLE: 'The Employee cannot be assigned to this Project.',
  ALLOCATION_EXCEEDED: 'The Employee allocation would exceed 100% for an overlapping assignment period.',
  STAGE_ASSIGNMENT_INVALID: 'The selected Stage does not belong to this Project.'
});

/** Map one stable Module 8 business code to the public API error category. */
export function createProjectTeamError(code: ProjectTeamErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  if (code === 'ASSIGNMENT_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}

/** Create a fail-closed authorization error for Project Team scope or permission denial. */
export function createProjectTeamAuthorizationError(): AuthorizationError {
  return new AuthorizationError({ message: 'Project Team access is not allowed for this Project.' });
}
