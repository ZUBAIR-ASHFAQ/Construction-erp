import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

export const EMPLOYEES_MAX_PAGE_SIZE = 100;

export const EMPLOYEE_PERMISSION_CODES = Object.freeze([
  'employees.read',
  'employees.create',
  'employees.update',
  'employees.compensation.manage'
] as const);

export const EMPLOYEE_ERROR_CODES = Object.freeze([
  'EMPLOYEE_NOT_FOUND',
  'DUPLICATE_EMPLOYEE_NUMBER',
  'DUPLICATE_EMPLOYEE_ID',
  'COMPENSATION_DATE_OVERLAP',
  'EMPLOYEE_INACTIVE'
] as const);

export const EMPLOYEE_EVENT_TYPES = Object.freeze([
  'employee.created',
  'employee.updated',
  'employee.status_changed',
  'employee.compensation_changed'
] as const);

export const EMPLOYEE_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/employees' }),
  Object.freeze({ method: 'POST', route: '/api/v1/employees' }),
  Object.freeze({ method: 'GET', route: '/api/v1/employees/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/employees/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/employees/:id/compensation' }),
  Object.freeze({ method: 'POST', route: '/api/v1/employees/:id/status' })
] as const);

export const EMPLOYEE_STATUS_VALUES = Object.freeze(['ACTIVE', 'INACTIVE'] as const);
export const EMPLOYEE_PAY_TYPE_VALUES = Object.freeze(['SALARY', 'DAILY', 'HOURLY'] as const);

export type EmployeePermissionCode = (typeof EMPLOYEE_PERMISSION_CODES)[number];
export type EmployeeErrorCode = (typeof EMPLOYEE_ERROR_CODES)[number];
export type EmployeeEventType = (typeof EMPLOYEE_EVENT_TYPES)[number];

const uuidSchema = z.string().uuid();
const searchSchema = z.string().trim().min(1).max(200);
const employeeNoSchema = z.string().trim().min(1).max(100);
const employeeNameSchema = z.string().trim().min(1).max(200);
const identitySchema = z.string().trim().min(1).max(100);
const phoneSchema = z.string().trim().min(7).max(50)
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .refine((value) => /^\+?\d{7,15}$/.test(value), 'phone must contain 7 to 15 digits with an optional leading +');
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const departmentSchema = z.string().trim().min(1).max(160);
const jobTitleSchema = z.string().trim().min(1).max(160);
const employeeTypeSchema = z.string().trim().min(1).max(64);
const noteSchema = z.string().trim().min(1).max(2000);
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    return date.getUTCFullYear() === year
      && date.getUTCMonth() === (month ?? 0) - 1
      && date.getUTCDate() === day;
  }, 'date must be a valid calendar date');
const moneySchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be a non-negative exact decimal with at most 2 decimal places'
).refine((value) => Number(value) > 0, 'amount must be greater than zero');
const rateSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/,
  'rate must be a non-negative exact decimal with at most 4 decimal places'
).refine((value) => Number(value) > 0, 'rate must be greater than zero');

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(EMPLOYEES_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Employee route identifier. */
export const employeeIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate bounded Employee register filters. */
export const listEmployeesQuerySchema = z.object({
  search: searchSchema.optional(),
  status: z.enum(EMPLOYEE_STATUS_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Validate one new Employee master record without accepting Company or lifecycle authority. */
export const createEmployeeBodySchema = z.object({
  employeeNo: employeeNoSchema,
  userId: uuidSchema.nullable().optional(),
  name: employeeNameSchema,
  cnicOrId: identitySchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  department: departmentSchema,
  jobTitle: jobTitleSchema,
  employeeType: employeeTypeSchema,
  joiningDate: dateSchema
}).strict();

/** Validate editable Employee master fields while salary remains compensation-owned. */
export const updateEmployeeBodySchema = z.object({
  employeeNo: employeeNoSchema.optional(),
  userId: uuidSchema.nullable().optional(),
  name: employeeNameSchema.optional(),
  cnicOrId: identitySchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  department: departmentSchema.optional(),
  jobTitle: jobTitleSchema.optional(),
  employeeType: employeeTypeSchema.optional(),
  joiningDate: dateSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable Employee field must be provided.'
});

/** Validate one effective-dated salary, daily-wage or hourly-rate change. */
export const createEmployeeCompensationBodySchema = z.discriminatedUnion('payType', [
  z.object({
    payType: z.literal('SALARY'),
    baseSalaryOrWage: moneySchema,
    hourlyRate: z.null().optional(),
    effectiveFrom: dateSchema
  }).strict(),
  z.object({
    payType: z.literal('DAILY'),
    baseSalaryOrWage: moneySchema,
    hourlyRate: z.null().optional(),
    effectiveFrom: dateSchema
  }).strict(),
  z.object({
    payType: z.literal('HOURLY'),
    baseSalaryOrWage: z.null().optional(),
    hourlyRate: rateSchema,
    effectiveFrom: dateSchema
  }).strict()
]);

/** Validate the explicit Employee activate/deactivate command. */
export const updateEmployeeStatusBodySchema = z.object({
  status: z.enum(EMPLOYEE_STATUS_VALUES),
  reason: noteSchema.nullable().optional()
}).strict();

export type EmployeeIdParams = z.infer<typeof employeeIdParamsSchema>;
export type ListEmployeesQuery = z.infer<typeof listEmployeesQuerySchema>;
export type CreateEmployeeBody = z.infer<typeof createEmployeeBodySchema>;
export type UpdateEmployeeBody = z.infer<typeof updateEmployeeBodySchema>;
export type CreateEmployeeCompensationBody = z.infer<typeof createEmployeeCompensationBodySchema>;
export type UpdateEmployeeStatusBody = z.infer<typeof updateEmployeeStatusBodySchema>;

const ERROR_MESSAGES: Readonly<Record<EmployeeErrorCode, string>> = Object.freeze({
  EMPLOYEE_NOT_FOUND: 'The requested Employee was not found.',
  DUPLICATE_EMPLOYEE_NUMBER: 'An Employee with this employee number already exists.',
  DUPLICATE_EMPLOYEE_ID: 'An Employee with this CNIC/identity value already exists.',
  COMPENSATION_DATE_OVERLAP: 'The compensation effective date overlaps existing compensation history.',
  EMPLOYEE_INACTIVE: 'The Employee is inactive.'
});

/** Map final Employee business codes to stable public errors. */
export function createEmployeeError(code: EmployeeErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  switch (code) {
    case 'EMPLOYEE_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'DUPLICATE_EMPLOYEE_NUMBER':
    case 'DUPLICATE_EMPLOYEE_ID':
    case 'COMPENSATION_DATE_OVERLAP':
    case 'EMPLOYEE_INACTIVE':
      return new ConflictError({ code, message });
  }
}
