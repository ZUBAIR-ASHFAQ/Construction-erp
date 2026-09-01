import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Supplier Payables reads. */
export const SUPPLIER_PAYABLES_MAX_PAGE_SIZE = 100;

/** Final Module 17 permission vocabulary. */
export const SUPPLIER_PAYABLES_PERMISSION_CODES = Object.freeze([
  'supplier_payables.read',
  'supplier_invoices.create',
  'supplier_invoices.post',
  'supplier_payments.create',
  'supplier_payments.allocate'
] as const);

/** Final Module 17 stable public business errors. */
export const SUPPLIER_PAYABLES_ERROR_CODES = Object.freeze([
  'SUPPLIER_INVOICE_NOT_FOUND',
  'DUPLICATE_SUPPLIER_INVOICE',
  'PAYMENT_ALLOCATION_INVALID',
  'SUPPLIER_SCOPE_MISMATCH'
] as const);

/** Exact Final Module 17 HTTP contract for the later route pass. */
export const SUPPLIER_PAYABLES_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/supplier-payables/invoices' }),
  Object.freeze({ method: 'POST', route: '/api/v1/supplier-payables/invoices' }),
  Object.freeze({ method: 'GET', route: '/api/v1/supplier-payables/invoices/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/supplier-payables/invoices/:id/post' }),
  Object.freeze({ method: 'GET', route: '/api/v1/supplier-payables/payments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/supplier-payables/payments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/supplier-payables/payments/:id/allocations' }),
  Object.freeze({ method: 'GET', route: '/api/v1/supplier-payables/aging' })
] as const);

/** Request fields that must always be derived by trusted server-side logic. */
export const SUPPLIER_PAYABLES_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId',
  'actorUserId',
  'permissions',
  'projectScope',
  'allowedProjectIds',
  'status',
  'subtotal',
  'totalAmount',
  'paymentNo',
  'allocatedAt'
] as const);

/** Confirmed Supplier Invoice lifecycle values used by persistence and posting. */
export const SUPPLIER_INVOICE_STATUS_VALUES = Object.freeze(['DRAFT', 'POSTED'] as const);

/** Confirmed Supplier Payment lifecycle values used by persistence and posting. */
export const SUPPLIER_PAYMENT_STATUS_VALUES = Object.freeze(['DRAFT', 'POSTED'] as const);

export type SupplierPayablesPermissionCode = (typeof SUPPLIER_PAYABLES_PERMISSION_CODES)[number];
export type SupplierPayablesErrorCode = (typeof SUPPLIER_PAYABLES_ERROR_CODES)[number];
export type SupplierInvoiceStatus = (typeof SUPPLIER_INVOICE_STATUS_VALUES)[number];
export type SupplierPaymentStatus = (typeof SUPPLIER_PAYMENT_STATUS_VALUES)[number];

const uuidSchema = z.string().uuid();
const statusTextSchema = z.string().trim().min(1).max(32);
const invoiceNoSchema = z.string().trim().min(1).max(150);
const descriptionSchema = z.string().trim().min(1).max(4000);
const referenceSchema = z.string().trim().min(1).max(200);
const exactPositiveMoneySchema = z.string().trim().regex(
  /^(?:[1-9]\d{0,15})(?:\.\d{1,2})?$|^0\.(?:0[1-9]|[1-9]\d?)$/,
  'amount must be a positive exact decimal with up to 2 decimal places'
);
const exactNonNegativeMoneySchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be a non-negative exact decimal with up to 2 decimal places'
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
  pageSize: z.coerce.number().int().min(1).max(SUPPLIER_PAYABLES_MAX_PAGE_SIZE).optional()
} as const;

/** Validate one Supplier Invoice or Supplier Payment identifier. */
export const supplierPayablesIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Validate bounded Supplier Invoice register filters. */
export const listSupplierInvoicesQuerySchema = z.object({
  vendorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  purchaseOrderId: uuidSchema.optional(),
  goodsReceiptId: uuidSchema.optional(),
  status: z.enum(SUPPLIER_INVOICE_STATUS_VALUES).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  dueBefore: dateSchema.optional(),
  ...paginationShape
}).strict().refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
  message: 'toDate cannot precede fromDate.',
  path: ['toDate']
});

/** Validate one Supplier Invoice line before Project/Stage/Finance ownership checks run in the service. */
export const supplierInvoiceLineInputSchema = z.object({
  stageId: uuidSchema.nullable().optional(),
  description: descriptionSchema,
  amount: exactPositiveMoneySchema,
  expenseOrInventoryAccountId: uuidSchema.nullable().optional()
}).strict();

/** Validate a draft Supplier Invoice while keeping totals and posting authority server-owned. */
export const createSupplierInvoiceBodySchema = z.object({
  vendorId: uuidSchema,
  projectId: uuidSchema,
  invoiceNo: invoiceNoSchema,
  invoiceDate: dateSchema,
  dueDate: dateSchema.nullable().optional(),
  purchaseOrderId: uuidSchema.nullable().optional(),
  goodsReceiptId: uuidSchema.nullable().optional(),
  taxAmount: exactNonNegativeMoneySchema.default('0'),
  lines: z.array(supplierInvoiceLineInputSchema).min(1).max(500)
}).strict().superRefine((value, ctx) => {
  if (value.dueDate && value.dueDate < value.invoiceDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['dueDate'],
      message: 'dueDate cannot precede invoiceDate.'
    });
  }
});

/** Validate the explicit bodyless Supplier Invoice posting command. */
export const postSupplierInvoiceBodySchema = z.object({}).strict();

/** Validate bounded Supplier Payment register filters. */
export const listSupplierPaymentsQuerySchema = z.object({
  vendorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  status: z.enum(SUPPLIER_PAYMENT_STATUS_VALUES).optional(),
  fromDate: dateSchema.optional(),
  toDate: dateSchema.optional(),
  ...paginationShape
}).strict().refine((value) => !value.fromDate || !value.toDate || value.toDate >= value.fromDate, {
  message: 'toDate cannot precede fromDate.',
  path: ['toDate']
});

/** Validate one Supplier Payment while numbering/status/account ownership remain server-side concerns. */
export const createSupplierPaymentBodySchema = z.object({
  vendorId: uuidSchema,
  projectId: uuidSchema.nullable().optional(),
  paymentDate: dateSchema,
  amount: exactPositiveMoneySchema,
  cashBankAccountId: uuidSchema,
  reference: referenceSchema.nullable().optional()
}).strict();

/** Validate one allocation line for a posted Supplier Payment. */
export const supplierPaymentAllocationInputSchema = z.object({
  supplierInvoiceId: uuidSchema,
  amount: exactPositiveMoneySchema
}).strict();

/** Validate allocation of one Supplier Payment across one or more Supplier Invoices. */
export const allocateSupplierPaymentBodySchema = z.object({
  allocations: z.array(supplierPaymentAllocationInputSchema).min(1).max(500)
}).strict().superRefine((value, ctx) => {
  const seenInvoiceIds = new Set<string>();
  value.allocations.forEach((allocation, index) => {
    if (seenInvoiceIds.has(allocation.supplierInvoiceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations', index, 'supplierInvoiceId'],
        message: 'Each Supplier Invoice may appear only once in one allocation command.'
      });
    }
    seenInvoiceIds.add(allocation.supplierInvoiceId);
  });
});

/** Validate bounded Supplier aging filters without accepting browser-defined formulas or buckets. */
export const supplierAgingQuerySchema = z.object({
  vendorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  asOfDate: dateSchema.optional(),
  ...paginationShape
}).strict();

/** Validate one serialized Supplier Invoice line. */
export const supplierInvoiceLineResponseSchema = z.object({
  id: uuidSchema,
  supplierInvoiceId: uuidSchema,
  stageId: uuidSchema.nullable(),
  description: z.string(),
  amount: z.string(),
  expenseOrInventoryAccountId: uuidSchema.nullable()
}).strict();

/** Validate one serialized Supplier Invoice with server-calculated totals. */
export const supplierInvoiceResponseSchema = z.object({
  id: uuidSchema,
  vendorId: uuidSchema,
  projectId: uuidSchema,
  invoiceNo: z.string().min(1),
  invoiceDate: dateSchema,
  dueDate: dateSchema.nullable(),
  purchaseOrderId: uuidSchema.nullable(),
  goodsReceiptId: uuidSchema.nullable(),
  status: statusTextSchema,
  subtotal: z.string(),
  taxAmount: z.string(),
  totalAmount: z.string(),
  lines: z.array(supplierInvoiceLineResponseSchema)
}).strict();

/** Validate one bounded Supplier Invoice register response. */
export const listSupplierInvoicesResponseSchema = z.object({
  items: z.array(supplierInvoiceResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(SUPPLIER_PAYABLES_MAX_PAGE_SIZE)
}).strict();

/** Validate one serialized Supplier Payment. */
export const supplierPaymentResponseSchema = z.object({
  id: uuidSchema,
  vendorId: uuidSchema,
  projectId: uuidSchema.nullable(),
  paymentNo: z.string().min(1),
  paymentDate: dateSchema,
  amount: z.string(),
  cashBankAccountId: uuidSchema,
  reference: z.string().nullable(),
  status: statusTextSchema
}).strict();

/** Validate one bounded Supplier Payment register response. */
export const listSupplierPaymentsResponseSchema = z.object({
  items: z.array(supplierPaymentResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(SUPPLIER_PAYABLES_MAX_PAGE_SIZE)
}).strict();

/** Validate one immutable Supplier Payment allocation row. */
export const supplierPaymentAllocationResponseSchema = z.object({
  id: uuidSchema,
  supplierPaymentId: uuidSchema,
  supplierInvoiceId: uuidSchema,
  amount: z.string(),
  allocatedAt: z.string().datetime({ offset: true })
}).strict();

/** Validate one Supplier aging row derived from posted invoices and allocations. */
export const supplierAgingRowResponseSchema = z.object({
  supplierInvoiceId: uuidSchema,
  vendorId: uuidSchema,
  projectId: uuidSchema,
  invoiceNo: z.string().min(1),
  invoiceDate: dateSchema,
  dueDate: dateSchema.nullable(),
  totalAmount: z.string(),
  allocatedAmount: z.string(),
  outstandingAmount: z.string(),
  ageDays: z.number().int().min(0)
}).strict();

/** Validate one bounded Supplier aging response. */
export const supplierAgingResponseSchema = z.object({
  items: z.array(supplierAgingRowResponseSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(SUPPLIER_PAYABLES_MAX_PAGE_SIZE),
  asOfDate: dateSchema
}).strict();

export type ListSupplierInvoicesQuery = z.infer<typeof listSupplierInvoicesQuerySchema>;
export type SupplierInvoiceLineInput = z.infer<typeof supplierInvoiceLineInputSchema>;
export type CreateSupplierInvoiceBody = z.infer<typeof createSupplierInvoiceBodySchema>;
export type PostSupplierInvoiceBody = z.infer<typeof postSupplierInvoiceBodySchema>;
export type ListSupplierPaymentsQuery = z.infer<typeof listSupplierPaymentsQuerySchema>;
export type CreateSupplierPaymentBody = z.infer<typeof createSupplierPaymentBodySchema>;
export type SupplierPaymentAllocationInput = z.infer<typeof supplierPaymentAllocationInputSchema>;
export type AllocateSupplierPaymentBody = z.infer<typeof allocateSupplierPaymentBodySchema>;
export type SupplierAgingQuery = z.infer<typeof supplierAgingQuerySchema>;

const ERROR_MESSAGES: Readonly<Record<SupplierPayablesErrorCode, string>> = Object.freeze({
  SUPPLIER_INVOICE_NOT_FOUND: 'The requested Supplier Invoice was not found.',
  DUPLICATE_SUPPLIER_INVOICE: 'This Vendor invoice number already exists for the Company.',
  PAYMENT_ALLOCATION_INVALID: 'The Supplier Payment allocation is invalid or exceeds an available amount.',
  SUPPLIER_SCOPE_MISMATCH: 'The selected Vendor, Project, Stage, Purchase Order, Goods Receipt or payment scope is inconsistent.'
});

/** Create one stable Final Module 17 public business error. */
export function createSupplierPayablesError(code: SupplierPayablesErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  if (code === 'SUPPLIER_INVOICE_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}
