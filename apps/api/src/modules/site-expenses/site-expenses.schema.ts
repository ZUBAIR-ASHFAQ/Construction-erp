import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Site Expense reads. */
export const SITE_EXPENSE_MAX_PAGE_SIZE = 100;

/** Final Module 14 permission vocabulary. */
export const SITE_EXPENSE_PERMISSION_CODES = Object.freeze([
  'site_expenses.read',
  'site_expenses.create',
  'site_expenses.update',
  'site_expenses.post',
  'site_expenses.reverse'
] as const);

/** Final Module 14 stable business errors. */
export const SITE_EXPENSE_ERROR_CODES = Object.freeze([
  'EXPENSE_NOT_FOUND',
  'EXPENSE_LOCKED',
  'INVALID_EXPENSE_ACCOUNT',
  'INVALID_EXPENSE_STAGE'
] as const);

/** Exact Final Module 14 HTTP contract for the later route pass. */
export const SITE_EXPENSE_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/site-expenses' }),
  Object.freeze({ method: 'POST', route: '/api/v1/site-expenses' }),
  Object.freeze({ method: 'GET', route: '/api/v1/site-expenses/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/site-expenses/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/site-expenses/:id/post' }),
  Object.freeze({ method: 'POST', route: '/api/v1/site-expenses/:id/reverse' })
] as const);

/** Request fields that must always come from trusted server context or posting logic. */
export const SITE_EXPENSE_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'expenseNo',
  'status',
  'createdBy',
  'postedAt'
] as const);

/** Supported Site Expense payment treatments from the Final-21 business workflow. */
export const SITE_EXPENSE_PAYMENT_MODE_VALUES = Object.freeze(['CASH', 'BANK', 'PAYABLE'] as const);

/** Site Expense lifecycle values required by draft, post and reversal commands. */
export const SITE_EXPENSE_STATUS_VALUES = Object.freeze(['DRAFT', 'POSTED', 'REVERSED'] as const);

export type SiteExpensePermissionCode = (typeof SITE_EXPENSE_PERMISSION_CODES)[number];
export type SiteExpenseErrorCode = (typeof SITE_EXPENSE_ERROR_CODES)[number];
export type SiteExpensePaymentMode = (typeof SITE_EXPENSE_PAYMENT_MODE_VALUES)[number];
export type SiteExpenseStatus = (typeof SITE_EXPENSE_STATUS_VALUES)[number];

const uuidSchema = z.string().uuid();
const exactPositiveMoneySchema = z.string().trim().regex(
  /^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/,
  'amount must be a positive exact decimal with up to 2 decimal places'
);
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === (month ?? 0) - 1
      && parsed.getUTCDate() === day;
  }, 'date must be a valid calendar date');
const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(SITE_EXPENSE_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Site Expense identifier. */
export const siteExpenseIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate a name-only Site Expense category creation request. */
export const createExpenseCategoryBodySchema = z.object({ name: z.string().trim().min(1).max(200) }).strict();

/** Public Site Expense category selector row. */
export const expenseCategoryResponseSchema = z.object({ id: uuidSchema, code: z.string().min(1), name: z.string().min(1), status: z.string().min(1) }).strict();

/** Validate bounded Site Expense register filters. */
export const listSiteExpensesQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  categoryId: uuidSchema.optional(),
  paymentMode: z.enum(SITE_EXPENSE_PAYMENT_MODE_VALUES).optional(),
  status: z.enum(SITE_EXPENSE_STATUS_VALUES).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  ...paginationShape
}).strict().refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
  message: 'toDate cannot precede fromDate.',
  path: ['toDate']
});

/** Validate one draft Site Expense before Project/Stage/Finance ownership checks run in the service. */
export const createSiteExpenseBodySchema = z.object({
  projectId: uuidSchema,
  stageId: uuidSchema.nullable().optional(),
  expenseDate: dateSchema,
  categoryId: uuidSchema,
  description: z.string().trim().min(1).max(2000),
  amount: exactPositiveMoneySchema,
  paymentMode: z.enum(SITE_EXPENSE_PAYMENT_MODE_VALUES),
  cashBankAccountId: uuidSchema.nullable().optional(),
  documentId: uuidSchema.nullable().optional()
}).strict().superRefine((value, ctx) => {
  if ((value.paymentMode === 'CASH' || value.paymentMode === 'BANK') && !value.cashBankAccountId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cashBankAccountId'],
      message: 'cashBankAccountId is required for CASH or BANK payment mode.'
    });
  }
});

/** Validate editable fields on a draft Site Expense only. */
export const updateSiteExpenseBodySchema = z.object({
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.nullable().optional(),
  expenseDate: dateSchema.optional(),
  categoryId: uuidSchema.optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  amount: exactPositiveMoneySchema.optional(),
  paymentMode: z.enum(SITE_EXPENSE_PAYMENT_MODE_VALUES).optional(),
  cashBankAccountId: uuidSchema.nullable().optional(),
  documentId: uuidSchema.nullable().optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable Site Expense field is required.'
});

/** Validate the bodyless Site Expense post command. */
export const postSiteExpenseBodySchema = z.object({}).strict();

/** Validate the bodyless Site Expense reversal command. */
export const reverseSiteExpenseBodySchema = z.object({}).strict();

/** Validate one serialized Site Expense row without server-sensitive authority fields. */
export const siteExpenseResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  expenseNo: z.string().min(1),
  expenseDate: dateSchema,
  categoryId: uuidSchema,
  description: z.string(),
  amount: z.string(),
  paymentMode: z.enum(SITE_EXPENSE_PAYMENT_MODE_VALUES),
  cashBankAccountId: uuidSchema.nullable(),
  status: z.enum(SITE_EXPENSE_STATUS_VALUES),
  documentId: uuidSchema.nullable(),
  createdBy: uuidSchema,
  postedAt: z.string().datetime({ offset: true }).nullable()
}).strict();

/** Validate one bounded Site Expense register response. */
export const listSiteExpensesResponseSchema = z.object({
  items: z.array(siteExpenseResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(SITE_EXPENSE_MAX_PAGE_SIZE)
}).strict();

export type ListSiteExpensesQuery = z.infer<typeof listSiteExpensesQuerySchema>;
export type CreateExpenseCategoryBody = z.infer<typeof createExpenseCategoryBodySchema>;
export type ExpenseCategoryResponse = z.infer<typeof expenseCategoryResponseSchema>;
export type CreateSiteExpenseBody = z.infer<typeof createSiteExpenseBodySchema>;
export type UpdateSiteExpenseBody = z.infer<typeof updateSiteExpenseBodySchema>;
export type PostSiteExpenseBody = z.infer<typeof postSiteExpenseBodySchema>;
export type ReverseSiteExpenseBody = z.infer<typeof reverseSiteExpenseBodySchema>;

const ERROR_MESSAGES: Readonly<Record<SiteExpenseErrorCode, string>> = Object.freeze({
  EXPENSE_NOT_FOUND: 'The requested Site Expense was not found.',
  EXPENSE_LOCKED: 'A posted Site Expense is immutable and cannot be edited directly.',
  INVALID_EXPENSE_ACCOUNT: 'The Finance account setup for this Site Expense is invalid.',
  INVALID_EXPENSE_STAGE: 'The selected Stage does not belong to the selected Project.'
});

/** Create one stable Final Module 14 public business error. */
export function createSiteExpenseError(code: SiteExpenseErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  if (code === 'EXPENSE_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}
