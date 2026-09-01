import { AppError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { z } from 'zod';

export const PROCUREMENT_MAX_PAGE_SIZE = 100;

export const PROCUREMENT_PERMISSION_CODES = Object.freeze([
  'procurement.read',
  'requisitions.create',
  'requisitions.approve',
  'purchase_orders.create',
  'purchase_orders.issue',
  'goods_receipts.create'
] as const);

export const PROCUREMENT_ERROR_CODES = Object.freeze([
  'REQUISITION_NOT_FOUND',
  'REQUISITION_NOT_APPROVABLE',
  'PO_NOT_FOUND',
  'PO_NOT_RECEIVABLE',
  'OVER_RECEIPT_NOT_ALLOWED',
  'PO_NOT_ISSUABLE',
  'PO_NOT_CANCELLABLE',
  'OVER_ORDER_NOT_ALLOWED',
  'VENDOR_NOT_ACTIVE',
  'GOODS_RECEIPT_NOT_FOUND'
] as const);

export const PROCUREMENT_EVENT_TYPES = Object.freeze([
  'requisition.created',
  'requisition.approved',
  'purchase_order.issued',
  'goods_receipt.posted'
] as const);

export const PROCUREMENT_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/procurement/requisitions' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/requisitions' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/requisitions/:id/approve' }),
  Object.freeze({ method: 'GET', route: '/api/v1/procurement/purchase-orders' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/purchase-orders' }),
  Object.freeze({ method: 'GET', route: '/api/v1/procurement/purchase-orders/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/purchase-orders/:id/issue' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/purchase-orders/:id/cancel' }),
  Object.freeze({ method: 'POST', route: '/api/v1/procurement/goods-receipts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/procurement/goods-receipts/:id' })
] as const);

export type ProcurementPermissionCode = (typeof PROCUREMENT_PERMISSION_CODES)[number];
export type ProcurementErrorCode = (typeof PROCUREMENT_ERROR_CODES)[number];

const uuidSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must use YYYY-MM-DD');
const statusSchema = z.string().trim().min(1).max(32);
const textSchema = z.string().trim().min(1);
const unitSchema = z.string().trim().min(1).max(64);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const positiveDecimalSchema = z.string().trim().regex(/^(?:[1-9]\d{0,13}(?:\.\d{1,4})?|0\.(?:\d{0,3}[1-9]))$/);
const nonNegativeDecimalSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/);
const moneySchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/);

const paginationShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(PROCUREMENT_MAX_PAGE_SIZE).optional()
} as const;

export const procurementIdParamsSchema = z.object({ id: uuidSchema }).strict();


export const listPurchaseRequisitionsQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  ...paginationShape
}).strict();

export const purchaseRequisitionItemInputSchema = z.object({
  materialId: uuidSchema,
  description: textSchema,
  quantity: positiveDecimalSchema,
  unit: unitSchema,
  stageId: uuidSchema.nullable().optional()
}).strict();

export const createPurchaseRequisitionBodySchema = z.object({
  projectId: uuidSchema,
  stageId: uuidSchema.nullable().optional(),
  requiredDate: dateSchema,
  notes: z.string().trim().max(4000).nullable().optional(),
  items: z.array(purchaseRequisitionItemInputSchema).min(1)
}).strict();

export const approvePurchaseRequisitionBodySchema = z.object({}).strict();

export const purchaseRequisitionItemResponseSchema = z.object({
  id: uuidSchema,
  requisitionId: uuidSchema,
  materialId: uuidSchema.nullable(),
  description: textSchema,
  quantity: positiveDecimalSchema,
  unit: unitSchema,
  stageId: uuidSchema.nullable()
}).strict();

export const purchaseRequisitionResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  stageId: uuidSchema.nullable(),
  requestNo: textSchema,
  requestedBy: uuidSchema,
  requiredDate: dateSchema,
  status: statusSchema,
  notes: z.string().nullable(),
  items: z.array(purchaseRequisitionItemResponseSchema)
}).strict();

export const listPurchaseRequisitionsResponseSchema = z.object({
  items: z.array(purchaseRequisitionResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive()
}).strict();

export const listPurchaseOrdersQuerySchema = z.object({
  projectId: uuidSchema.optional(),
  ...paginationShape
}).strict();

export const purchaseOrderItemInputSchema = z.object({
  requisitionItemId: uuidSchema,
  quantity: positiveDecimalSchema,
  unitPrice: nonNegativeDecimalSchema,
  taxRate: nonNegativeDecimalSchema.default('0')
}).strict();

export const createPurchaseOrderBodySchema = z.object({
  requisitionId: uuidSchema,
  vendorId: uuidSchema,
  orderDate: dateSchema,
  currency: currencySchema,
  deliveryAddress: textSchema,
  terms: textSchema,
  items: z.array(purchaseOrderItemInputSchema).min(1)
}).strict();

export const issuePurchaseOrderBodySchema = z.object({}).strict();
export const cancelPurchaseOrderBodySchema = z.object({ reason: textSchema }).strict();

export const purchaseOrderItemResponseSchema = z.object({
  id: uuidSchema,
  purchaseOrderId: uuidSchema,
  requisitionItemId: uuidSchema.nullable(),
  materialId: uuidSchema.nullable(),
  stageId: uuidSchema.nullable(),
  description: textSchema,
  quantity: positiveDecimalSchema,
  unit: unitSchema,
  unitPrice: nonNegativeDecimalSchema,
  taxRate: nonNegativeDecimalSchema,
  lineTotal: moneySchema,
  receivedQuantity: nonNegativeDecimalSchema
}).strict();

export const purchaseOrderResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  requisitionId: uuidSchema.nullable(),
  poNo: textSchema,
  vendorId: uuidSchema,
  orderDate: dateSchema,
  currency: currencySchema,
  status: statusSchema,
  subtotal: moneySchema,
  taxAmount: moneySchema,
  totalAmount: moneySchema,
  deliveryAddress: textSchema,
  terms: textSchema,
  cancelReason: z.string().nullable(),
  items: z.array(purchaseOrderItemResponseSchema)
}).strict();

export const listPurchaseOrdersResponseSchema = z.object({
  items: z.array(purchaseOrderResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive()
}).strict();

export const goodsReceiptItemInputSchema = z.object({
  poItemId: uuidSchema,
  materialId: uuidSchema,
  quantity: positiveDecimalSchema,
  acceptedQuantity: nonNegativeDecimalSchema,
  rejectedQuantity: nonNegativeDecimalSchema,
  batchNo: z.string().trim().min(1).max(120).nullable().optional()
}).strict();

export const createGoodsReceiptBodySchema = z.object({
  purchaseOrderId: uuidSchema,
  warehouseId: uuidSchema,
  items: z.array(goodsReceiptItemInputSchema).min(1)
}).strict();

export const goodsReceiptItemResponseSchema = z.object({
  id: uuidSchema,
  goodsReceiptId: uuidSchema,
  poItemId: uuidSchema,
  materialId: uuidSchema,
  stageId: uuidSchema.nullable(),
  quantity: positiveDecimalSchema,
  acceptedQuantity: nonNegativeDecimalSchema,
  rejectedQuantity: nonNegativeDecimalSchema,
  batchNo: z.string().nullable()
}).strict();

export const goodsReceiptResponseSchema = z.object({
  id: uuidSchema,
  projectId: uuidSchema,
  vendorId: uuidSchema,
  warehouseId: uuidSchema,
  receiptNo: textSchema,
  purchaseOrderId: uuidSchema,
  receivedAt: z.string().datetime({ offset: true }),
  status: statusSchema,
  receivedBy: uuidSchema,
  items: z.array(goodsReceiptItemResponseSchema)
}).strict();

/** Create one stable Procurement application error. */
export function createProcurementError(code: ProcurementErrorCode): AppError {
  const map: Record<ProcurementErrorCode, AppError> = {
    REQUISITION_NOT_FOUND: new NotFoundError({ code: 'REQUISITION_NOT_FOUND', message: 'Purchase requisition was not found.' }),
    REQUISITION_NOT_APPROVABLE: new ConflictError({ code: 'REQUISITION_NOT_APPROVABLE', message: 'Purchase requisition cannot be approved in its current state.' }),
    PO_NOT_FOUND: new NotFoundError({ code: 'PO_NOT_FOUND', message: 'Purchase Order was not found.' }),
    PO_NOT_RECEIVABLE: new ConflictError({ code: 'PO_NOT_RECEIVABLE', message: 'Purchase Order cannot receive goods in its current state.' }),
    OVER_RECEIPT_NOT_ALLOWED: new ConflictError({ code: 'OVER_RECEIPT_NOT_ALLOWED', message: 'Goods Receipt exceeds the remaining Purchase Order quantity.' }),
    PO_NOT_ISSUABLE: new ConflictError({ code: 'PO_NOT_ISSUABLE', message: 'Purchase Order cannot be issued in its current state.' }),
    PO_NOT_CANCELLABLE: new ConflictError({ code: 'PO_NOT_CANCELLABLE', message: 'Purchase Order cannot be cancelled in its current state.' }),
    OVER_ORDER_NOT_ALLOWED: new ConflictError({ code: 'OVER_ORDER_NOT_ALLOWED', message: 'Purchase Order quantity exceeds the approved material requirement.' }),
    VENDOR_NOT_ACTIVE: new ConflictError({ code: 'VENDOR_NOT_ACTIVE', message: 'Vendor must be active and qualified before a Purchase Order can be created.' }),
    GOODS_RECEIPT_NOT_FOUND: new NotFoundError({ code: 'GOODS_RECEIPT_NOT_FOUND', message: 'Goods Receipt was not found.' })
  };
  return map[code] ?? new ValidationError({ message: code });
}

export type ListPurchaseRequisitionsQuery = z.infer<typeof listPurchaseRequisitionsQuerySchema>;
export type CreatePurchaseRequisitionBody = z.infer<typeof createPurchaseRequisitionBodySchema>;
export type PurchaseRequisitionItemInput = z.infer<typeof purchaseRequisitionItemInputSchema>;
export type ListPurchaseOrdersQuery = z.infer<typeof listPurchaseOrdersQuerySchema>;
export type CreatePurchaseOrderBody = z.infer<typeof createPurchaseOrderBodySchema>;
export type PurchaseOrderItemInput = z.infer<typeof purchaseOrderItemInputSchema>;
export type CancelPurchaseOrderBody = z.infer<typeof cancelPurchaseOrderBodySchema>;
export type CreateGoodsReceiptBody = z.infer<typeof createGoodsReceiptBodySchema>;
