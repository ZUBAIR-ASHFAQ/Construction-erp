import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

export const LABOUR_PAYROLL_MAX_PAGE_SIZE = 100;

export const LABOUR_PAYROLL_PERMISSION_CODES = Object.freeze([
  'attendance.read',
  'attendance.create',
  'attendance.correct',
  'payroll.read',
  'payroll.create',
  'payroll.calculate',
  'payroll.finalize'
] as const);

export const LABOUR_PAYROLL_ERROR_CODES = Object.freeze([
  'ATTENDANCE_DUPLICATE',
  'EMPLOYEE_NOT_ASSIGNED',
  'PAYROLL_NOT_FOUND',
  'PAYROLL_LOCKED',
  'PAYROLL_NOT_READY'
] as const);

export const LABOUR_PAYROLL_EVENT_TYPES = Object.freeze([
  'attendance.recorded',
  'payroll.created',
  'payroll.calculated',
  'payroll.finalized',
  'payroll.posted'
] as const);

export const LABOUR_PAYROLL_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/attendance' }),
  Object.freeze({ method: 'POST', route: '/api/v1/attendance' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/attendance/:id' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/runs' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs/:id/calculate' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs/:id/finalize' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/runs/:id' })
] as const);

export const LABOUR_PAYROLL_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'createdBy',
  'enteredBy',
  'grossAmount',
  'deductions',
  'netAmount',
  'projectAllocationJson',
  'finalizedAt',
  'documentId',
  'generatedAt'
] as const);

export const ATTENDANCE_STATUS_VALUES = Object.freeze(['PRESENT', 'ABSENT'] as const);
export const PAYROLL_RUN_STATUS_VALUES = Object.freeze(['DRAFT', 'CALCULATED', 'FINALIZED'] as const);

export type LabourPayrollPermissionCode = (typeof LABOUR_PAYROLL_PERMISSION_CODES)[number];
export type LabourPayrollErrorCode = (typeof LABOUR_PAYROLL_ERROR_CODES)[number];
export type AttendanceStatus = (typeof ATTENDANCE_STATUS_VALUES)[number];

const uuidSchema = z.string().uuid();
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === (month ?? 0) - 1 && parsed.getUTCDate() === day;
  }, 'date must be a valid calendar date');
const exactHoursSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/, 'hours must be an exact non-negative decimal with up to 4 decimals');
const exactMoneySchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/, 'money must be an exact non-negative decimal with up to 2 decimals');
const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one attendance identifier. */
export const attendanceIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate one payroll run identifier. */
export const payrollRunIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate bounded attendance filters. */
export const listAttendanceQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  employeeId: uuidSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  ...paginationShape
}).strict().refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
  message: 'toDate cannot precede fromDate.',
  path: ['toDate']
});

/** Validate one authorized daily attendance/work record. */
export const createAttendanceBodySchema = z.object({
  employeeId: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable().optional(),
  workDate: dateSchema,
  status: z.enum(ATTENDANCE_STATUS_VALUES),
  hours: exactHoursSchema.nullable().optional(),
  overtimeHours: exactHoursSchema.nullable().optional()
}).strict().superRefine((value, ctx) => {
  const hours = Number(value.hours ?? '0');
  const overtime = Number(value.overtimeHours ?? '0');
  if (hours + overtime > 24) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'hours plus overtimeHours cannot exceed 24.' });
  }
  if (value.status === 'ABSENT' && (hours > 0 || overtime > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'ABSENT attendance cannot contain worked hours.' });
  }
});

/** Validate an unposted attendance correction without changing Employee or Project ownership. */
export const updateAttendanceBodySchema = z.object({
  stageId: uuidSchema.nullable().optional(),
  status: z.enum(ATTENDANCE_STATUS_VALUES).optional(),
  hours: exactHoursSchema.nullable().optional(),
  overtimeHours: exactHoursSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one attendance field must be supplied.');

/** Validate bounded Payroll Run history reads. */
export const listPayrollRunsQuerySchema = z.object({ ...paginationShape }).strict();

/** Validate one Payroll period. Salary runs intentionally use a date period only; posting date is the period end. */
export const createPayrollRunBodySchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema
}).strict().refine((value) => value.periodEnd >= value.periodStart, {
  message: 'periodEnd cannot precede periodStart.',
  path: ['periodEnd']
});

/** Validate the bodyless Payroll calculation command. */
export const calculatePayrollRunBodySchema = z.object({}).strict();

/** Validate the bodyless Payroll finalization command. */
export const finalizePayrollRunBodySchema = z.object({}).strict();

/** Validate one serialized attendance row. */
export const attendanceResponseSchema = z.object({
  id: uuidSchema,
  employeeId: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  workDate: dateSchema,
  status: z.enum(ATTENDANCE_STATUS_VALUES),
  hours: exactHoursSchema.nullable(),
  overtimeHours: exactHoursSchema.nullable(),
  enteredBy: uuidSchema
}).strict();

/** Validate one bounded attendance page. */
export const listAttendanceResponseSchema = z.object({
  items: z.array(attendanceResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE)
}).strict();

/** Validate one Project/Stage amount inside server-owned payroll allocation. */
export const payrollAllocationResponseSchema = z.object({
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  category: z.enum(['labour', 'security']),
  amount: exactMoneySchema
}).strict();

/** Validate one server-calculated Employee payroll line. */
export const payrollLineResponseSchema = z.object({
  id: uuidSchema,
  employeeId: uuidSchema,
  grossAmount: exactMoneySchema,
  deductions: exactMoneySchema,
  netAmount: exactMoneySchema,
  projectAllocation: z.array(payrollAllocationResponseSchema),
  payslip: z.object({
    id: uuidSchema,
    documentId: uuidSchema.nullable(),
    generatedAt: z.string().datetime({ offset: true }).nullable()
  }).nullable()
}).strict();

/** Validate one Payroll Run detail. */
export const payrollRunResponseSchema = z.object({
  id: uuidSchema,
  periodStart: dateSchema,
  periodEnd: dateSchema,
  status: z.enum(PAYROLL_RUN_STATUS_VALUES),
  createdBy: uuidSchema,
  finalizedAt: z.string().datetime({ offset: true }).nullable(),
  lines: z.array(payrollLineResponseSchema)
}).strict();

/** Validate one bounded Payroll Run summary page. */
export const listPayrollRunsResponseSchema = z.object({
  items: z.array(payrollRunResponseSchema.omit({ lines: true })),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE)
}).strict();

export type ListAttendanceQuery = z.infer<typeof listAttendanceQuerySchema>;
export type CreateAttendanceBody = z.infer<typeof createAttendanceBodySchema>;
export type UpdateAttendanceBody = z.infer<typeof updateAttendanceBodySchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsQuerySchema>;
export type CreatePayrollRunBody = z.infer<typeof createPayrollRunBodySchema>;
export type CalculatePayrollRunBody = z.infer<typeof calculatePayrollRunBodySchema>;
export type FinalizePayrollRunBody = z.infer<typeof finalizePayrollRunBodySchema>;

const ERROR_MESSAGES: Readonly<Record<LabourPayrollErrorCode, string>> = Object.freeze({
  ATTENDANCE_DUPLICATE: 'Attendance already exists for this Employee, Project and work date.',
  EMPLOYEE_NOT_ASSIGNED: 'The Employee has no valid Project/Stage assignment for this work date.',
  PAYROLL_NOT_FOUND: 'Payroll Run was not found.',
  PAYROLL_LOCKED: 'Finalized Payroll is immutable and cannot be changed directly.',
  PAYROLL_NOT_READY: 'Payroll cannot continue because required attendance, compensation, posting accounts or calculation state is incomplete.'
});

/** Create one stable Labour/Payroll business error. */
export function createLabourPayrollError(code: LabourPayrollErrorCode): AppError {
  if (code === 'PAYROLL_NOT_FOUND') return new NotFoundError({ code, message: ERROR_MESSAGES[code] });
  return new ConflictError({ code, message: ERROR_MESSAGES[code] });
}
