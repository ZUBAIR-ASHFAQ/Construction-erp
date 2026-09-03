import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

/** Maximum page size for bounded Inventory reads. */
export const MODULE_11_MAX_PAGE_SIZE = 100;

/** Final Module 11 permission vocabulary. */
export const MODULE_11_PERMISSION_CODES = Object.freeze([
  'inventory.read',
  'materials.manage',
  'inventory.issue',
  'inventory.transfer',
  'inventory.adjust'
] as const);

/** Final Module 11 stable business errors. */
export const MODULE_11_ERROR_CODES = Object.freeze([
  'MATERIAL_NOT_FOUND',
  'INSUFFICIENT_STOCK',
  'WAREHOUSE_NOT_FOUND',
  'INVALID_STAGE_ISSUE',
  'STOCK_ADJUSTMENT_FORBIDDEN',
  'RECEIPT_EXCEEDS_PO'
] as const);

/** Final Module 11 public route catalog. */
export const MODULE_11_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/inventory/materials' }),
  Object.freeze({ method: 'POST', route: '/api/v1/inventory/materials' }),
  Object.freeze({ method: 'GET', route: '/api/v1/inventory/stock' }),
  Object.freeze({ method: 'GET', route: '/api/v1/inventory/ledger' }),
  Object.freeze({ method: 'POST', route: '/api/v1/inventory/issues' }),
  Object.freeze({ method: 'POST', route: '/api/v1/inventory/transfers' }),
  Object.freeze({ method: 'POST', route: '/api/v1/inventory/adjustments' })
] as const);

/** Final Module 11 server-owned request fields. */
export const MODULE_11_SERVER_OWNED_REQUEST_FIELDS = Object.freeze([
  'companyId', 'actorUserId', 'permissions', 'allowedProjectIds', 'status', 'issueNo',
  'issuedBy', 'unitCost', 'lineCost', 'movementType', 'sourceType', 'sourceId', 'occurredAt'
] as const);

export type Module11PermissionCode = (typeof MODULE_11_PERMISSION_CODES)[number];
export type Module11ErrorCode = (typeof MODULE_11_ERROR_CODES)[number];

const uuid = z.string().uuid();
const pageShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(MODULE_11_MAX_PAGE_SIZE).optional()
} as const;
const positiveDecimal = z.string().trim().regex(/^(?:[1-9]\d{0,13}(?:\.\d{1,4})?|0\.(?:\d{0,3}[1-9]))$/);
const signedDecimal = z.string().trim().regex(/^-?(?:[1-9]\d{0,13}(?:\.\d{1,4})?|0\.(?:\d{0,3}[1-9]))$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** Validate bounded Material list filters. */
export const listMaterialsQuerySchema = z.object({ ...pageShape }).strict();

/** Validate creation of one Company-owned Material master. */
export const createMaterialBodySchema = z.object({
  code: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(300),
  unit: z.string().trim().min(1).max(64),
  category: z.string().trim().min(1).max(120).nullable().optional()
}).strict();

/** Validate bounded stock filters. */
export const listStockQuerySchema = z.object({
  ...pageShape,
  projectId: uuid.optional(),
  warehouseId: uuid.optional(),
  materialId: uuid.optional()
}).strict();

/** Validate bounded append-only ledger filters. */
export const listLedgerQuerySchema = z.object({
  ...pageShape,
  warehouseId: uuid.optional(),
  materialId: uuid.optional(),
  projectId: uuid.optional(),
  stageId: uuid.optional()
}).strict();

/** Validate one line in a Project/Stage material issue. */
export const materialIssueItemInputSchema = z.object({
  materialId: uuid,
  quantity: positiveDecimal
}).strict();

/** Validate one Project/Stage material issue command. */
export const createMaterialIssueBodySchema = z.object({
  projectId: uuid,
  stageId: uuid.nullable().optional(),
  warehouseId: uuid,
  issueDate: date,
  description: z.string().trim().max(1000).nullable().optional(),
  items: z.array(materialIssueItemInputSchema).min(1).max(100)
}).strict();

/** Validate one warehouse-to-warehouse transfer command. */
export const transferMaterialBodySchema = z.object({
  sourceWarehouseId: uuid,
  destinationWarehouseId: uuid,
  materialId: uuid,
  quantity: positiveDecimal
}).strict().refine((value) => value.sourceWarehouseId !== value.destinationWarehouseId, {
  path: ['destinationWarehouseId'],
  message: 'Source and destination warehouses must be different.'
});

/** Validate one controlled stock adjustment command. */
export const adjustStockBodySchema = z.object({
  projectId: uuid.optional(),
  warehouseId: uuid,
  materialId: uuid,
  quantityDelta: signedDecimal,
  reason: z.string().trim().min(1).max(1000)
}).strict();

/** Internal Procurement-to-Inventory receipt line contract. */
export const receiveInventoryItemInputSchema = z.object({
  poItemId: uuid,
  itemId: uuid,
  quantity: positiveDecimal,
  acceptedQty: z.string().trim().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/),
  rejectedQty: z.string().trim().regex(/^(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/),
  batchNo: z.string().trim().min(1).max(120).nullable().optional()
}).strict();

/** Internal Procurement-to-Inventory receipt contract. */
export const receiveInventoryBodySchema = z.object({
  purchaseOrderId: uuid,
  warehouseId: uuid,
  items: z.array(receiveInventoryItemInputSchema).min(1).max(200)
}).strict();

/** Safe Material response. */
export const materialResponseSchema = z.object({
  id: uuid,
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  category: z.string().nullable(),
  status: z.string()
}).strict();

/** Stock summary response derived from the ledger. */
export const stockRowResponseSchema = z.object({
  warehouseId: uuid,
  warehouseCode: z.string(),
  warehouseName: z.string(),
  projectId: uuid.nullable(),
  materialId: uuid,
  materialCode: z.string(),
  materialName: z.string(),
  unit: z.string(),
  quantityOnHand: z.string(),
  averageCost: z.string()
}).strict();

/** Warehouse option returned with the stock read so no extra CRUD route is needed. */
export const warehouseOptionResponseSchema = z.object({
  id: uuid,
  projectId: uuid.nullable(),
  code: z.string(),
  name: z.string(),
  status: z.string()
}).strict();

/** Append-only stock ledger response. */
export const stockLedgerResponseSchema = z.object({
  id: uuid,
  warehouseId: uuid,
  materialId: uuid,
  projectId: uuid.nullable(),
  stageId: uuid.nullable(),
  movementType: z.string(),
  quantity: z.string(),
  unitCost: z.string(),
  sourceType: z.string(),
  sourceId: z.string(),
  occurredAt: z.string().datetime()
}).strict();

/** Material issue response with source-derived line cost. */
export const materialIssueResponseSchema = z.object({
  id: uuid,
  projectId: uuid,
  stageId: uuid.nullable(),
  warehouseId: uuid,
  issueNo: z.string(),
  issueDate: date,
  status: z.string(),
  items: z.array(z.object({
    id: uuid,
    materialId: uuid,
    quantity: z.string(),
    unitCost: z.string(),
    lineCost: z.string()
  }).strict())
}).strict();

/** Paginated Material master response. */
export const listMaterialsResponseSchema = z.object({
  items: z.array(materialResponseSchema), total: z.number().int().min(0), page: z.number().int().min(1), pageSize: z.number().int().min(1).max(MODULE_11_MAX_PAGE_SIZE)
}).strict();

/** Paginated derived stock response including selectable Warehouses. */
export const listStockResponseSchema = z.object({
  items: z.array(stockRowResponseSchema),
  warehouses: z.array(warehouseOptionResponseSchema),
  total: z.number().int().min(0), page: z.number().int().min(1), pageSize: z.number().int().min(1).max(MODULE_11_MAX_PAGE_SIZE)
}).strict();

/** Paginated append-only ledger response. */
export const listLedgerResponseSchema = z.object({
  items: z.array(stockLedgerResponseSchema), total: z.number().int().min(0), page: z.number().int().min(1), pageSize: z.number().int().min(1).max(MODULE_11_MAX_PAGE_SIZE)
}).strict();

/** Two-ledger-row warehouse transfer response. */
export const transferMaterialResponseSchema = z.object({ transactions: z.array(stockLedgerResponseSchema).length(2) }).strict();

/** Controlled adjustment response includes the required reason for audit readability. */
export const adjustStockResponseSchema = stockLedgerResponseSchema.extend({ reason: z.string() }).strict();

/** Stable Final Module 11 error messages. */
const ERROR_MESSAGES: Readonly<Record<Module11ErrorCode, string>> = Object.freeze({
  MATERIAL_NOT_FOUND: 'The requested material was not found.',
  INSUFFICIENT_STOCK: 'There is not enough available stock for this command.',
  WAREHOUSE_NOT_FOUND: 'The requested warehouse was not found.',
  INVALID_STAGE_ISSUE: 'The selected stage does not belong to the selected project.',
  STOCK_ADJUSTMENT_FORBIDDEN: 'The requested stock adjustment is not allowed.',
  RECEIPT_EXCEEDS_PO: 'The receipt quantity exceeds the Purchase Order open quantity.'
});

/** Create one stable Final Module 11 public business error. */
export function createModule11Error(code: Module11ErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  if (code === 'MATERIAL_NOT_FOUND' || code === 'WAREHOUSE_NOT_FOUND') return new NotFoundError({ code, message });
  return new ConflictError({ code, message });
}

export type ListMaterialsQuery = z.infer<typeof listMaterialsQuerySchema>;
export type CreateMaterialBody = z.infer<typeof createMaterialBodySchema>;
export type ListStockQuery = z.infer<typeof listStockQuerySchema>;
export type ListLedgerQuery = z.infer<typeof listLedgerQuerySchema>;
export type CreateMaterialIssueBody = z.infer<typeof createMaterialIssueBodySchema>;
export type TransferMaterialBody = z.infer<typeof transferMaterialBodySchema>;
export type AdjustStockBody = z.infer<typeof adjustStockBodySchema>;
export type ReceiveInventoryBody = z.infer<typeof receiveInventoryBodySchema>;
