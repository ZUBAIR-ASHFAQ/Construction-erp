import { AppError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { z } from 'zod';

export const LABOUR_PAYROLL_MAX_PAGE_SIZE = 100;

export const LABOUR_PAYROLL_PERMISSION_CODES = Object.freeze([
  'attendance.read',
  'attendance.create',
  'attendance.correct',
  'payroll.read',
  'payroll.create',
  'payroll.calculate',
  'payroll.finalize',
  'payroll.payments.create',
  'payroll.payments.reverse',
  'payroll.advances.create',
  'payroll.advances.reverse'
] as const);

export const LABOUR_PAYROLL_ERROR_CODES = Object.freeze([
  'ATTENDANCE_DUPLICATE',
  'ATTENDANCE_DAILY_HOURS_EXCEEDED',
  'ATTENDANCE_BEFORE_JOINING_DATE',
  'EMPLOYEE_INACTIVE',
  'EMPLOYEE_NOT_ASSIGNED',
  'PAYROLL_NOT_FOUND',
  'PAYROLL_LOCKED',
  'OVERTIME_MULTIPLIER_REQUIRED',
  'OVERTIME_REQUIRES_HOURLY_COMPENSATION',
  'PAYROLL_PAYMENT_INVALID',
  'PAYROLL_PAYMENT_EXCEEDS_OUTSTANDING',
  'PAYROLL_CASH_BANK_INVALID',
  'EMPLOYEE_ADVANCE_INVALID',
  'EMPLOYEE_ADVANCE_ALREADY_RECOVERED',
  'PAYROLL_NO_ATTENDANCE',
  'PAYROLL_COMPENSATION_MISSING',
  'PAYROLL_SALARY_PERIOD_INVALID',
  'PAYROLL_PERIOD_OPEN',
  'PAYROLL_NO_EARNINGS',
  'PAYROLL_POSTING_SETUP_INVALID',
  'PAYROLL_NOT_READY'
] as const);

export const LABOUR_PAYROLL_EVENT_TYPES = Object.freeze([
  'attendance.recorded',
  'payroll.created',
  'payroll.calculated',
  'payroll.finalized',
  'payroll.posted',
  'payroll.payment_posted',
  'payroll.payment_reversed',
  'payroll.advance_posted',
  'payroll.advance_reversed'
] as const);

export const LABOUR_PAYROLL_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/attendance' }),
  Object.freeze({ method: 'GET', route: '/api/v1/attendance/assignments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/attendance' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/attendance/:id' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/runs' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs/:id/calculate' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/runs/:id/finalize' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/runs/:id' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/cash-bank-accounts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/payments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/payments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/payments/:id/reverse' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/advances' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/advances' }),
  Object.freeze({ method: 'POST', route: '/api/v1/payroll/advances/:id/reverse' }),
  Object.freeze({ method: 'GET', route: '/api/v1/payroll/employees/:id/ledger' })
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
export const PAYROLL_PAYMENT_STATUS_VALUES = Object.freeze(['POSTED', 'REVERSED'] as const);

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
const overtimeMultiplierSchema = z.string().trim()
  .regex(/^(?:[1-9]\d{0,2})(?:\.\d{1,4})?$/, 'overtimeMultiplier must be a positive decimal with up to 4 decimals')
  .refine((value) => Number(value) <= 10, 'overtimeMultiplier must be between 1 and 10');
const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one attendance identifier. */
export const attendanceIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate one payroll run identifier. */
export const payrollRunIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate one Employee or Payroll Payment identifier. */
export const payrollEntityIdParamsSchema = z.object({ id: uuidSchema }).strict();

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

/** Validate the Employee/date lookup used to constrain attendance destinations. */
export const listAttendanceAssignmentsQuerySchema = z.object({
  employeeId: uuidSchema,
  workDate: dateSchema
}).strict();

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
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one attendance field must be supplied.').superRefine((value, ctx) => {
  const hours = Number(value.hours ?? '0');
  const overtime = Number(value.overtimeHours ?? '0');
  if (hours + overtime > 24) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hours'], message: 'hours plus overtimeHours cannot exceed 24.' });
  if (value.status === 'ABSENT' && (hours > 0 || overtime > 0)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['status'], message: 'ABSENT attendance cannot contain worked hours.' });
  }
});

/** Validate bounded Payroll Run history reads. */
export const listPayrollRunsQuerySchema = z.object({ ...paginationShape }).strict();

/** Validate bounded Employee salary-payment filters. */
export const listPayrollPaymentsQuerySchema = z.object({
  employeeId: uuidSchema.optional(),
  payrollRunId: uuidSchema.optional(),
  status: z.enum(PAYROLL_PAYMENT_STATUS_VALUES).optional(),
  ...paginationShape
}).strict();

/** Validate bounded Employee advance filters. */
export const listEmployeeAdvancesQuerySchema = z.object({
  employeeId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  status: z.enum(PAYROLL_PAYMENT_STATUS_VALUES).optional(),
  ...paginationShape
}).strict();

/** Validate an immediate project-linked salary advance paid from Cash/Bank. */
export const createEmployeeAdvanceBodySchema = z.object({
  employeeId: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable().optional(),
  advanceDate: dateSchema,
  amount: exactMoneySchema.refine((value) => Number(value) > 0, 'amount must be greater than zero'),
  cashBankAccountId: uuidSchema,
  reason: z.string().trim().min(1).max(500),
  reference: z.string().trim().min(1).max(200).nullable().optional()
}).strict();

/** Validate an append-only advance reversal date. */
export const reverseEmployeeAdvanceBodySchema = z.object({ reversalDate: dateSchema }).strict();

/** Validate the optional Project filter for an Employee ledger. */
export const employeeSalaryLedgerQuerySchema = z.object({ projectId: uuidSchema.optional() }).strict();

/** Validate one partial or full Employee salary settlement. */
export const createPayrollPaymentBodySchema = z.object({
  payrollLineId: uuidSchema,
  paymentDate: dateSchema,
  amount: exactMoneySchema.refine((value) => Number(value) > 0, 'amount must be greater than zero'),
  cashBankAccountId: uuidSchema,
  reference: z.string().trim().min(1).max(200).nullable().optional()
}).strict();

/** Validate the accounting date used for an append-only salary-payment reversal. */
export const reversePayrollPaymentBodySchema = z.object({ reversalDate: dateSchema }).strict();

/** Validate one Payroll period. Salary runs intentionally use a date period only; posting date is the period end. */
export const createPayrollRunBodySchema = z.object({
  periodStart: dateSchema,
  periodEnd: dateSchema
}).strict().refine((value) => value.periodEnd >= value.periodStart, {
  message: 'periodEnd cannot precede periodStart.',
  path: ['periodEnd']
});

/** Validate optional Payroll-run overtime policy while keeping calculation server-owned. */
export const calculatePayrollRunBodySchema = z.object({
  overtimeMultiplier: overtimeMultiplierSchema.optional()
}).strict();

/** Validate the bodyless Payroll finalization command. */
export const finalizePayrollRunBodySchema = z.object({}).strict();

/** Validate one serialized attendance row. */
export const attendanceResponseSchema = z.object({
  id: uuidSchema,
  employeeId: uuidSchema,
  employeeNo: z.string().min(1),
  employeeName: z.string().min(1),
  projectId: uuidSchema,
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  stageId: uuidSchema.nullable(),
  stageName: z.string().nullable(),
  workDate: dateSchema,
  status: z.enum(ATTENDANCE_STATUS_VALUES),
  hours: exactHoursSchema.nullable(),
  overtimeHours: exactHoursSchema.nullable(),
  enteredBy: uuidSchema,
  enteredByName: z.string().min(1)
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
  employeeNo: z.string().min(1),
  employeeName: z.string().min(1),
  grossAmount: exactMoneySchema,
  salaryBeforeAbsence: exactMoneySchema,
  absenceDeduction: exactMoneySchema,
  advanceDeduction: exactMoneySchema,
  deductions: exactMoneySchema,
  netAmount: exactMoneySchema,
  paidAmount: exactMoneySchema,
  outstandingAmount: exactMoneySchema,
  projectAllocation: z.array(payrollAllocationResponseSchema),
  payslip: z.object({
    id: uuidSchema,
    documentId: uuidSchema.nullable(),
    generatedAt: z.string().datetime({ offset: true }).nullable()
  }).nullable()
}).strict();

/** Validate one effective Project Team assignment exposed to the attendance form. */
export const attendanceAssignmentResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  stageId: uuidSchema.nullable(),
  stageCode: z.string().nullable(),
  stageName: z.string().nullable(),
  fromDate: dateSchema,
  toDate: dateSchema.nullable()
}).strict();

/** Validate one Cash/Bank selector row exposed only to salary-payment users. */
export const payrollCashBankAccountResponseSchema = z.object({
  id: uuidSchema,
  code: z.string().min(1),
  name: z.string().min(1),
  accountType: z.enum(['CASH', 'BANK']),
  accountNumber: z.string().nullable(),
  balance: z.string()
}).strict();

/** Validate one immutable Employee salary-payment record. */
export const payrollPaymentResponseSchema = z.object({
  id: uuidSchema,
  payrollLineId: uuidSchema,
  payrollRunId: uuidSchema,
  employeeId: uuidSchema,
  employeeNo: z.string().min(1),
  employeeName: z.string().min(1),
  paymentNo: z.string().min(1),
  paymentDate: dateSchema,
  payrollPeriod: z.string().min(1),
  amount: exactMoneySchema,
  cashBankAccountId: uuidSchema,
  cashBankAccountName: z.string().min(1),
  reference: z.string().nullable(),
  status: z.enum(PAYROLL_PAYMENT_STATUS_VALUES),
  reversalDate: dateSchema.nullable(),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime({ offset: true })
}).strict();

/** Validate one bounded salary-payment register. */
export const listPayrollPaymentsResponseSchema = z.object({
  items: z.array(payrollPaymentResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE)
}).strict();

/** Validate one immutable Employee salary-advance record and its recovery balance. */
export const employeeAdvanceResponseSchema = z.object({
  id: uuidSchema,
  employeeId: uuidSchema,
  employeeNo: z.string().min(1),
  employeeName: z.string().min(1),
  projectId: uuidSchema,
  projectCode: z.string().min(1),
  projectName: z.string().min(1),
  stageId: uuidSchema.nullable(),
  stageName: z.string().nullable(),
  advanceNo: z.string().min(1),
  advanceDate: dateSchema,
  amount: exactMoneySchema,
  recoveredAmount: exactMoneySchema,
  outstandingAmount: exactMoneySchema,
  cashBankAccountId: uuidSchema,
  cashBankAccountName: z.string().min(1),
  reason: z.string().min(1),
  reference: z.string().nullable(),
  status: z.enum(PAYROLL_PAYMENT_STATUS_VALUES),
  reversalDate: dateSchema.nullable(),
  createdByName: z.string().min(1),
  createdAt: z.string().datetime({ offset: true })
}).strict();

export const listEmployeeAdvancesResponseSchema = z.object({
  items: z.array(employeeAdvanceResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(LABOUR_PAYROLL_MAX_PAGE_SIZE)
}).strict();

/** Validate the source-derived Employee salary ledger. */
export const employeeSalaryLedgerResponseSchema = z.object({
  employee: z.object({ id: uuidSchema, employeeNo: z.string().min(1), name: z.string().min(1) }).strict(),
  totalSalary: exactMoneySchema,
  totalPaid: exactMoneySchema,
  totalAdvances: exactMoneySchema,
  totalAdvanceRecovered: exactMoneySchema,
  advanceOutstanding: exactMoneySchema,
  outstanding: exactMoneySchema,
  entries: z.array(z.object({
    id: z.string().min(1),
    entryDate: dateSchema,
    entryType: z.enum(['SALARY_DUE', 'PAYMENT', 'PAYMENT_REVERSAL', 'ADVANCE', 'ADVANCE_REVERSAL', 'ADVANCE_RECOVERY']),
    reference: z.string().min(1),
    debit: exactMoneySchema,
    credit: exactMoneySchema,
    balance: exactMoneySchema,
    projectId: uuidSchema.nullable(),
    projectName: z.string().nullable(),
    stageName: z.string().nullable(),
    payrollRunId: uuidSchema.nullable(),
    payrollLineId: uuidSchema.nullable(),
    advanceId: uuidSchema.nullable(),
    paymentId: uuidSchema.nullable()
  }).strict())
}).strict();

/** Validate one Payroll Run detail. */
export const payrollRunResponseSchema = z.object({
  id: uuidSchema,
  periodStart: dateSchema,
  periodEnd: dateSchema,
  status: z.enum(PAYROLL_RUN_STATUS_VALUES),
  createdBy: uuidSchema,
  createdByName: z.string().min(1),
  finalizedAt: z.string().datetime({ offset: true }).nullable(),
  overtimeMultiplier: overtimeMultiplierSchema.nullable(),
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
export type ListAttendanceAssignmentsQuery = z.infer<typeof listAttendanceAssignmentsQuerySchema>;
export type CreateAttendanceBody = z.infer<typeof createAttendanceBodySchema>;
export type UpdateAttendanceBody = z.infer<typeof updateAttendanceBodySchema>;
export type ListPayrollRunsQuery = z.infer<typeof listPayrollRunsQuerySchema>;
export type ListPayrollPaymentsQuery = z.infer<typeof listPayrollPaymentsQuerySchema>;
export type ListEmployeeAdvancesQuery = z.infer<typeof listEmployeeAdvancesQuerySchema>;
export type CreateEmployeeAdvanceBody = z.infer<typeof createEmployeeAdvanceBodySchema>;
export type ReverseEmployeeAdvanceBody = z.infer<typeof reverseEmployeeAdvanceBodySchema>;
export type EmployeeSalaryLedgerQuery = z.infer<typeof employeeSalaryLedgerQuerySchema>;
export type CreatePayrollPaymentBody = z.infer<typeof createPayrollPaymentBodySchema>;
export type ReversePayrollPaymentBody = z.infer<typeof reversePayrollPaymentBodySchema>;
export type CreatePayrollRunBody = z.infer<typeof createPayrollRunBodySchema>;
export type CalculatePayrollRunBody = z.infer<typeof calculatePayrollRunBodySchema>;
export type FinalizePayrollRunBody = z.infer<typeof finalizePayrollRunBodySchema>;

const ERROR_MESSAGES: Readonly<Record<LabourPayrollErrorCode, string>> = Object.freeze({
  ATTENDANCE_DUPLICATE: 'Attendance already exists for this Employee, Project/Stage and work date.',
  ATTENDANCE_DAILY_HOURS_EXCEEDED: 'Employee attendance cannot exceed 24 total hours across all Projects on one work date.',
  ATTENDANCE_BEFORE_JOINING_DATE: 'Attendance cannot be recorded before the Employee joining date.',
  EMPLOYEE_INACTIVE: 'Attendance cannot be recorded or corrected for an inactive Employee.',
  EMPLOYEE_NOT_ASSIGNED: 'The Employee has no valid Project/Stage assignment for this work date.',
  PAYROLL_NOT_FOUND: 'Payroll Run was not found.',
  PAYROLL_LOCKED: 'Finalized Payroll is immutable and cannot be changed directly.',
  OVERTIME_MULTIPLIER_REQUIRED: 'Hourly overtime exists in this Payroll Run. Enter an overtime multiplier before calculation.',
  OVERTIME_REQUIRES_HOURLY_COMPENSATION: 'Overtime hours can only be recorded when the Employee has effective HOURLY compensation for the work date.',
  PAYROLL_PAYMENT_INVALID: 'The selected Employee salary payment or finalized Payroll line is invalid.',
  PAYROLL_PAYMENT_EXCEEDS_OUTSTANDING: 'The Employee salary payment exceeds the outstanding amount for this Payroll line.',
  PAYROLL_CASH_BANK_INVALID: 'Select an active same-Company Cash or Bank account.',
  EMPLOYEE_ADVANCE_INVALID: 'The selected Employee salary advance, Project, Stage, or Employee is invalid.',
  EMPLOYEE_ADVANCE_ALREADY_RECOVERED: 'This salary advance has already been recovered by finalized Payroll and cannot be reversed.',
  PAYROLL_NO_ATTENDANCE: 'No attendance records exist inside this Payroll period. Mark attendance before calculating Payroll.',
  PAYROLL_COMPENSATION_MISSING: 'An Employee in this Payroll period has no single effective salary, daily wage or hourly rate for all recorded attendance dates.',
  PAYROLL_SALARY_PERIOD_INVALID: 'Salaried Employees require a complete calendar-month Payroll period.',
  PAYROLL_PERIOD_OPEN: 'Payroll cannot be finalized before the Payroll period end date.',
  PAYROLL_NO_EARNINGS: 'The Payroll period contains no payable present days or worked hours.',
  PAYROLL_POSTING_SETUP_INVALID: 'Payroll Finance posting accounts are incomplete or invalid.',
  PAYROLL_NOT_READY: 'Payroll cannot continue because required attendance, compensation, posting accounts or calculation state is incomplete.'
});

/** Create one stable Labour/Payroll business error. */
export function createLabourPayrollError(code: LabourPayrollErrorCode): AppError {
  if (code === 'PAYROLL_NOT_FOUND') return new NotFoundError({ code, message: ERROR_MESSAGES[code] });
  if (code === 'ATTENDANCE_DAILY_HOURS_EXCEEDED' || code === 'ATTENDANCE_BEFORE_JOINING_DATE' || code === 'OVERTIME_REQUIRES_HOURLY_COMPENSATION') {
    return new ValidationError({ code, message: ERROR_MESSAGES[code] });
  }
  return new ConflictError({ code, message: ERROR_MESSAGES[code] });
}
