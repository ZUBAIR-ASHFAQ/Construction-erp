import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Client Billing reads. */
export const CLIENT_BILLING_MAX_PAGE_SIZE = 100;

/** Final Module 15 permission vocabulary. */
export const CLIENT_BILLING_PERMISSION_CODES = Object.freeze([
  'client_billing.read',
  'client_billing.settings.manage',
  'claims.create',
  'claims.edit',
  'claims.finalize',
  'client_invoices.create',
  'client_invoices.read'
] as const);

/** Final Module 15 stable public business errors. */
export const CLIENT_BILLING_ERROR_CODES = Object.freeze([
  'CLAIM_NOT_FOUND',
  'CLAIM_LOCKED',
  'INVOICE_NOT_FOUND',
  'INVALID_BILLING_BASIS',
  'BILLING_STAGE_INVALID'
] as const);

/** Exact Final Module 15 HTTP contract; no generic CRUD routes are added. */
export const CLIENT_BILLING_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/client-billing/projects/:projectId/settings' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/client-billing/projects/:projectId/settings' }),
  Object.freeze({ method: 'GET', route: '/api/v1/client-billing/claims' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-billing/claims' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/client-billing/claims/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-billing/claims/:id/finalize' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-billing/claims/:id/invoice' }),
  Object.freeze({ method: 'GET', route: '/api/v1/client-billing/invoices' }),
  Object.freeze({ method: 'GET', route: '/api/v1/client-billing/invoices/:id' })
] as const);

/** Request fields that remain authoritative server-owned values. */
export const CLIENT_BILLING_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'clientId',
  'claimNo',
  'status',
  'grossValue',
  'deductions',
  'retention',
  'netCertified',
  'invoiceNo',
  'subtotal',
  'taxAmount',
  'totalAmount',
  'createdBy',
  'postedAt'
] as const);

/** Project commercial models allowed by Final-21 Project Management. */
export const CLIENT_BILLING_METHOD_VALUES = Object.freeze(['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'] as const);

/** Confirmed billing-settings lifecycle values used by the current persistence contract. */
export const CLIENT_BILLING_SETTINGS_STATUS_VALUES = Object.freeze(['ACTIVE', 'INACTIVE'] as const);

/** Confirmed Progress Claim lifecycle values used by the current service. */
export const PROGRESS_CLAIM_STATUS_VALUES = Object.freeze(['DRAFT', 'FINALIZED'] as const);

/** Confirmed Client Invoice lifecycle value used for issued and Finance-posted source documents. */
export const CLIENT_INVOICE_STATUS_VALUES = Object.freeze(['ISSUED'] as const);

export type ClientBillingPermissionCode = (typeof CLIENT_BILLING_PERMISSION_CODES)[number];
export type ClientBillingErrorCode = (typeof CLIENT_BILLING_ERROR_CODES)[number];
export type ClientInvoiceStatus = (typeof CLIENT_INVOICE_STATUS_VALUES)[number];

const uuidSchema = z.string().uuid();
const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD')
  .refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year ?? 0, (month ?? 0) - 1, day ?? 0));
    return parsed.getUTCFullYear() === year
      && parsed.getUTCMonth() === (month ?? 0) - 1
      && parsed.getUTCDate() === day;
  }, 'date must be a valid calendar date');
const exactPositiveMoneySchema = z.string().trim().regex(
  /^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/,
  'amount must be a positive exact decimal with up to 2 decimal places'
);
const exactNonNegativeMoneySchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be a non-negative exact decimal with up to 2 decimal places'
);
const percentSchema = z.string().trim()
  .regex(/^(?:0|[1-9]\d{0,2})(?:\.\d{1,4})?$/, 'percent must use up to 4 decimal places')
  .refine((value) => Number(value) <= 100, 'percent must be between 0 and 100');
const billingMethodSchema = z.enum(CLIENT_BILLING_METHOD_VALUES);
const billingCycleSchema = z.string().trim().min(1).max(64);
const descriptionSchema = z.string().trim().min(1).max(1000);
const statusTextSchema = z.string().trim().min(1).max(32);

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(CLIENT_BILLING_MAX_PAGE_SIZE).optional()
} as const;

/** Validate the Project identifier used by billing-settings routes. */
export const projectBillingParamsSchema = z.object({ projectId: uuidSchema }).strict();

/** Validate one Progress Claim or Client Invoice identifier. */
export const billingIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate editable Project billing settings without accepting Project value or server-owned totals. */
export const updateProjectBillingSettingsBodySchema = z.object({
  billingMethod: billingMethodSchema,
  retentionPercent: percentSchema.nullable().optional(),
  billingCycle: billingCycleSchema.nullable().optional(),
  advanceRecoveryEnabled: z.boolean().default(false),
  status: z.enum(CLIENT_BILLING_SETTINGS_STATUS_VALUES).default('ACTIVE')
}).strict();

/** Validate one billable claim line before Project/Stage ownership checks run in the service. */
export const claimLineInputSchema = z.object({
  stageId: uuidSchema.nullable().optional(),
  description: descriptionSchema,
  billingProgressPercent: percentSchema.nullable().optional(),
  amount: exactPositiveMoneySchema
}).strict();

/** Validate bounded Progress Claim register filters. */
export const listClaimsQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  status: z.enum(PROGRESS_CLAIM_STATUS_VALUES).optional(),
  ...paginationShape
}).strict();

/** Validate one draft Progress Claim while ownership, numbering, status and totals remain server-owned. */
export const createClaimBodySchema = z.object({
  projectId: uuidSchema,
  periodEnd: dateSchema,
  lines: z.array(claimLineInputSchema).max(500).default([])
}).strict();

/** Validate only the fields that remain editable while a Progress Claim is DRAFT. */
export const updateClaimBodySchema = z.object({
  periodEnd: dateSchema.optional(),
  lines: z.array(claimLineInputSchema).max(500).optional()
}).strict().refine((value) => value.periodEnd !== undefined || value.lines !== undefined, {
  message: 'At least one editable claim field is required.'
});

/** Finalization is an explicit bodyless command; totals are calculated by the server. */
export const finalizeClaimBodySchema = z.object({}).strict();

/** Validate invoice dates while numbering, totals, status and posting ownership remain server-side. */
export const createInvoiceBodySchema = z.object({
  invoiceDate: dateSchema,
  dueDate: dateSchema
}).strict().refine((value) => value.dueDate >= value.invoiceDate, {
  message: 'dueDate cannot precede invoiceDate.',
  path: ['dueDate']
});

/** Validate bounded Client Invoice register filters. */
export const listInvoicesQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  status: z.enum(CLIENT_INVOICE_STATUS_VALUES).optional(),
  ...paginationShape
}).strict();

/** Validate serialized Project billing settings. */
export const projectBillingSettingsResponseSchema = z.object({
  projectId: uuidSchema,
  billingMethod: billingMethodSchema,
  retentionPercent: percentSchema.nullable(),
  billingCycle: billingCycleSchema.nullable(),
  advanceRecoveryEnabled: z.boolean(),
  status: z.enum(CLIENT_BILLING_SETTINGS_STATUS_VALUES)
}).strict();

/** Validate one serialized Progress Claim line. */
export const claimLineResponseSchema = z.object({
  id: uuidSchema,
  stageId: uuidSchema.nullable(),
  description: descriptionSchema,
  billingProgressPercent: percentSchema.nullable(),
  amount: exactNonNegativeMoneySchema
}).strict();

/** Validate one serialized Client Invoice line. */
export const clientInvoiceLineResponseSchema = z.object({
  id: uuidSchema,
  stageId: uuidSchema.nullable(),
  description: descriptionSchema,
  amount: exactNonNegativeMoneySchema
}).strict();

/** Validate one serialized Client Invoice with server-calculated totals. */
export const clientInvoiceResponseSchema: z.ZodTypeAny = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  clientId: uuidSchema,
  claimId: uuidSchema.nullable(),
  invoiceNo: z.string().trim().min(1).max(100),
  invoiceDate: dateSchema,
  dueDate: dateSchema.nullable(),
  status: statusTextSchema,
  subtotal: exactNonNegativeMoneySchema,
  taxAmount: exactNonNegativeMoneySchema,
  totalAmount: exactNonNegativeMoneySchema,
  lines: z.array(clientInvoiceLineResponseSchema)
}).strict();

/** Validate one serialized Progress Claim and its optional generated invoice. */
export const progressClaimResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  clientId: uuidSchema,
  claimNo: z.string().trim().min(1).max(100),
  periodEnd: dateSchema,
  status: statusTextSchema,
  grossValue: exactNonNegativeMoneySchema,
  deductions: exactNonNegativeMoneySchema,
  retention: exactNonNegativeMoneySchema,
  netCertified: exactNonNegativeMoneySchema,
  lines: z.array(claimLineResponseSchema),
  invoice: clientInvoiceResponseSchema.nullable()
}).strict();

/** Validate one bounded Progress Claim register response. */
export const listClaimsResponseSchema = z.object({
  items: z.array(progressClaimResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(CLIENT_BILLING_MAX_PAGE_SIZE)
}).strict();

/** Validate one bounded Client Invoice register response. */
export const listInvoicesResponseSchema = z.object({
  items: z.array(clientInvoiceResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(CLIENT_BILLING_MAX_PAGE_SIZE)
}).strict();

/** Convert one stable Client Billing error code into the project error envelope. */
export function createClientBillingError(code: ClientBillingErrorCode): AppError {
  switch (code) {
    case 'CLAIM_NOT_FOUND':
      return new NotFoundError({ code, message: 'Progress claim was not found.' });
    case 'CLAIM_LOCKED':
      return new ConflictError({ code, message: 'Finalized progress claim cannot be edited.' });
    case 'INVOICE_NOT_FOUND':
      return new NotFoundError({ code, message: 'Client invoice was not found.' });
    case 'INVALID_BILLING_BASIS':
      return new ConflictError({ code, message: 'The project billing basis is not valid for this command.' });
    case 'BILLING_STAGE_INVALID':
      return new ConflictError({ code, message: 'The selected stage does not belong to this project.' });
  }
}

export type UpdateProjectBillingSettingsBody = z.infer<typeof updateProjectBillingSettingsBodySchema>;
export type ListClaimsQuery = z.infer<typeof listClaimsQuerySchema>;
export type CreateClaimBody = z.infer<typeof createClaimBodySchema>;
export type UpdateClaimBody = z.infer<typeof updateClaimBodySchema>;
export type CreateInvoiceBody = z.infer<typeof createInvoiceBodySchema>;
export type ListInvoicesQuery = z.infer<typeof listInvoicesQuerySchema>;
export type ClaimLineInput = z.infer<typeof claimLineInputSchema>;
