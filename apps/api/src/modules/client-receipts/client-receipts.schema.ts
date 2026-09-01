import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Client Receipt reads. */
export const CLIENT_RECEIPT_MAX_PAGE_SIZE = 100;

/** Final Module 16 permission vocabulary. */
export const CLIENT_RECEIPT_PERMISSION_CODES = Object.freeze([
  'client_receipts.read',
  'client_receipts.create',
  'client_receipts.allocate',
  'client_receipts.reverse'
] as const);

/** Final Module 16 stable public business errors. */
export const CLIENT_RECEIPT_ERROR_CODES = Object.freeze([
  'RECEIPT_NOT_FOUND',
  'ALLOCATION_EXCEEDS_RECEIPT',
  'ALLOCATION_EXCEEDS_INVOICE',
  'RECEIPT_SCOPE_MISMATCH',
  'RECEIPT_LOCKED'
] as const);

/** Exact Final Module 16 HTTP contract; no generic CRUD routes are added. */
export const CLIENT_RECEIPT_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/client-receipts' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-receipts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/client-receipts/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-receipts/:id/allocations' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-receipts/:id/unallocate' }),
  Object.freeze({ method: 'POST', route: '/api/v1/client-receipts/:id/reverse' })
] as const);

/** Request fields whose ownership or totals must always be derived by the server. */
export const CLIENT_RECEIPT_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'receiptNo',
  'status',
  'createdBy',
  'postedAt',
  'createdAt',
  'allocatedAt',
  'allocatedBy',
  'allocatedAmount',
  'unallocatedAmount',
  'invoiceOutstanding',
  'financeSourceKey'
] as const);

/** Receipt methods supported by the Finance-owned Cash/Bank model. */
export const CLIENT_RECEIPT_PAYMENT_METHOD_VALUES = Object.freeze(['CASH', 'BANK'] as const);

/** Receipt classifications needed by the Final-21 invoice-payment and advance flows. */
export const CLIENT_RECEIPT_TYPE_VALUES = Object.freeze(['ADVANCE', 'INVOICE_PAYMENT'] as const);

/** Posted receipt lifecycle values; corrections use the explicit reversal command. */
export const CLIENT_RECEIPT_STATUS_VALUES = Object.freeze(['POSTED', 'REVERSED'] as const);

export type ClientReceiptPermissionCode = (typeof CLIENT_RECEIPT_PERMISSION_CODES)[number];
export type ClientReceiptErrorCode = (typeof CLIENT_RECEIPT_ERROR_CODES)[number];
export type ClientReceiptPaymentMethod = (typeof CLIENT_RECEIPT_PAYMENT_METHOD_VALUES)[number];
export type ClientReceiptType = (typeof CLIENT_RECEIPT_TYPE_VALUES)[number];
export type ClientReceiptStatus = (typeof CLIENT_RECEIPT_STATUS_VALUES)[number];

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
const paymentMethodSchema = z.enum(CLIENT_RECEIPT_PAYMENT_METHOD_VALUES);
const receiptTypeSchema = z.enum(CLIENT_RECEIPT_TYPE_VALUES);
const receiptStatusSchema = z.enum(CLIENT_RECEIPT_STATUS_VALUES);
const referenceSchema = z.string().trim().min(1).max(200);

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(CLIENT_RECEIPT_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Client Receipt path identifier. */
export const clientReceiptIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate bounded Client Receipt register filters. */
export const listClientReceiptsQuerySchema = z.object({
  clientId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  stageId: uuidSchema.optional(),
  status: receiptStatusSchema.optional(),
  receiptType: receiptTypeSchema.optional(),
  paymentMethod: paymentMethodSchema.optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  ...paginationShape
}).strict().superRefine((value, context) => {
  if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toDate'],
      message: 'toDate cannot precede fromDate.'
    });
  }
});

/** Validate one new Client Receipt while ownership, numbering and posting metadata stay server-owned. */
export const createClientReceiptBodySchema = z.object({
  clientId: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable().optional(),
  receiptDate: dateSchema,
  amount: exactPositiveMoneySchema,
  paymentMethod: paymentMethodSchema,
  cashBankAccountId: uuidSchema,
  reference: referenceSchema.nullable().optional(),
  receiptType: receiptTypeSchema
}).strict();

/** Validate one Invoice allocation command without accepting server-owned allocation metadata. */
export const allocateClientReceiptBodySchema = z.object({
  clientInvoiceId: uuidSchema,
  amount: exactPositiveMoneySchema
}).strict();

/** Validate one controlled allocation reversal by its persisted allocation identifier. */
export const unallocateClientReceiptBodySchema = z.object({
  allocationId: uuidSchema
}).strict();

/** Receipt reversal is an explicit bodyless command; accounting metadata is server-derived. */
export const reverseClientReceiptBodySchema = z.object({}).strict();

/** Validate one serialized Client Receipt allocation. */
export const clientReceiptAllocationResponseSchema = z.object({
  id: uuidSchema,
  clientInvoiceId: uuidSchema,
  amount: exactPositiveMoneySchema,
  allocatedAt: z.string().datetime(),
  allocatedBy: uuidSchema
}).strict();

/** Validate one serialized posted or reversed Client Receipt with derived allocation totals. */
export const clientReceiptResponseSchema = z.object({
  id: uuidSchema,
  clientId: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  receiptNo: z.string().trim().min(1).max(100),
  receiptDate: dateSchema,
  amount: exactPositiveMoneySchema,
  paymentMethod: paymentMethodSchema,
  cashBankAccountId: uuidSchema,
  reference: referenceSchema.nullable(),
  receiptType: receiptTypeSchema,
  status: receiptStatusSchema,
  createdBy: uuidSchema,
  postedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  allocatedAmount: exactNonNegativeMoneySchema,
  unallocatedAmount: exactNonNegativeMoneySchema,
  allocations: z.array(clientReceiptAllocationResponseSchema)
}).strict();

/** Validate one bounded Client Receipt register response. */
export const listClientReceiptsResponseSchema = z.object({
  items: z.array(clientReceiptResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(CLIENT_RECEIPT_MAX_PAGE_SIZE)
}).strict();

/** Convert one stable Client Receipt error code into the shared API error envelope. */
export function createClientReceiptError(code: ClientReceiptErrorCode): AppError {
  switch (code) {
    case 'RECEIPT_NOT_FOUND':
      return new NotFoundError({ code, message: 'Client receipt was not found.' });
    case 'ALLOCATION_EXCEEDS_RECEIPT':
      return new ConflictError({ code, message: 'Allocation exceeds the unallocated receipt amount.' });
    case 'ALLOCATION_EXCEEDS_INVOICE':
      return new ConflictError({ code, message: 'Allocation exceeds the Client Invoice outstanding amount.' });
    case 'RECEIPT_SCOPE_MISMATCH':
      return new ConflictError({ code, message: 'Client, Project, Stage or Invoice does not match the Client Receipt scope.' });
    case 'RECEIPT_LOCKED':
      return new ConflictError({ code, message: 'Posted Client Receipt cannot be edited directly.' });
  }
}

export type ListClientReceiptsQuery = z.infer<typeof listClientReceiptsQuerySchema>;
export type CreateClientReceiptBody = z.infer<typeof createClientReceiptBodySchema>;
export type AllocateClientReceiptBody = z.infer<typeof allocateClientReceiptBodySchema>;
export type UnallocateClientReceiptBody = z.infer<typeof unallocateClientReceiptBodySchema>;
