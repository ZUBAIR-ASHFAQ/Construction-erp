import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  approvePurchaseRequisitionBodySchema,
  cancelPurchaseOrderBodySchema,
  createGoodsReceiptBodySchema,
  createPurchaseOrderBodySchema,
  createPurchaseRequisitionBodySchema,
  goodsReceiptResponseSchema,
  issuePurchaseOrderBodySchema,
  listPurchaseOrdersQuerySchema,
  listPurchaseOrdersResponseSchema,
  listPurchaseRequisitionsQuerySchema,
  listPurchaseRequisitionsResponseSchema,
  procurementIdParamsSchema,
  purchaseOrderResponseSchema,
  purchaseRequisitionResponseSchema
} from './procurement.schema.js';
import { ProcurementService } from './procurement.service.js';

export type ProcurementRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const POSITIVE_DECIMAL_JSON_SCHEMA = { type: 'string', pattern: '^(?:[1-9]\\d{0,13}(?:\\.\\d{1,4})?|0\\.(?:\\d{0,3}[1-9]))$' } as const;
const NON_NEGATIVE_DECIMAL_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,4})?$' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const ID_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const PAGE_PROPERTIES = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const PROJECT_LIST_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { projectId: UUID_JSON_SCHEMA, ...PAGE_PROPERTIES } } as const;
const REQUISITION_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'requiredDate', 'items'],
  properties: {
    projectId: UUID_JSON_SCHEMA,
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    requiredDate: DATE_JSON_SCHEMA,
    notes: { anyOf: [{ type: 'string', maxLength: 4000 }, { type: 'null' }] },
    items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['materialId', 'description', 'quantity', 'unit'], properties: {
      materialId: UUID_JSON_SCHEMA,
      description: { type: 'string', minLength: 1 },
      quantity: POSITIVE_DECIMAL_JSON_SCHEMA,
      unit: { type: 'string', minLength: 1, maxLength: 64 },
      stageId: NULLABLE_UUID_JSON_SCHEMA
    } } }
  }
} as const;
const PURCHASE_ORDER_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['requisitionId', 'vendorId', 'orderDate', 'currency', 'deliveryAddress', 'terms', 'items'],
  properties: {
    requisitionId: UUID_JSON_SCHEMA,
    vendorId: UUID_JSON_SCHEMA,
    orderDate: DATE_JSON_SCHEMA,
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    deliveryAddress: { type: 'string', minLength: 1 },
    terms: { type: 'string', minLength: 1 },
    items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['requisitionItemId', 'quantity', 'unitPrice'], properties: {
      requisitionItemId: UUID_JSON_SCHEMA,
      quantity: POSITIVE_DECIMAL_JSON_SCHEMA,
      unitPrice: NON_NEGATIVE_DECIMAL_JSON_SCHEMA,
      taxRate: NON_NEGATIVE_DECIMAL_JSON_SCHEMA
    } } }
  }
} as const;
const CANCEL_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['reason'], properties: { reason: { type: 'string', minLength: 1 } } } as const;
const GOODS_RECEIPT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['purchaseOrderId', 'warehouseId', 'items'],
  properties: {
    purchaseOrderId: UUID_JSON_SCHEMA,
    warehouseId: UUID_JSON_SCHEMA,
    items: { type: 'array', minItems: 1, items: { type: 'object', additionalProperties: false, required: ['poItemId', 'materialId', 'quantity', 'acceptedQuantity', 'rejectedQuantity'], properties: {
      poItemId: UUID_JSON_SCHEMA,
      materialId: UUID_JSON_SCHEMA,
      quantity: POSITIVE_DECIMAL_JSON_SCHEMA,
      acceptedQuantity: NON_NEGATIVE_DECIMAL_JSON_SCHEMA,
      rejectedQuantity: NON_NEGATIVE_DECIMAL_JSON_SCHEMA,
      batchNo: { anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }] }
    } } }
  }
} as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const SUCCESS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: { type: 'object', additionalProperties: true } } } as const;
const ERROR_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA } as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = { type: 'object', additionalProperties: true, required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } } as const;

/** Parse one Procurement request segment through its Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query' | 'params'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [source, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the Foundation retry key required by Procurement write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ code: 'INVALID_REQUEST', message: 'A valid Idempotency-Key header is required.' });
  }
  return value.trim();
}

/** Register the Final-21 Material Requirement, Purchase Order and Goods Receipt routes. */
export async function registerProcurementRoutes(app: FastifyInstance, options: ProcurementRoutesOptions): Promise<void> {
  const service = new ProcurementService(options.database);

  app.get('/api/v1/procurement/requisitions', { schema: { tags: ['Procurement'], operationId: 'listProcurementRequisitions', summary: 'List material requirements', security: BEARER_SECURITY, querystring: PROJECT_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listPurchaseRequisitionsResponseSchema.parse(await service.listPurchaseRequisitions(parseRequest(listPurchaseRequisitionsQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/procurement/requisitions', { schema: { tags: ['Procurement'], operationId: 'createProcurementRequisition', summary: 'Create a material requirement', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: REQUISITION_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = purchaseRequisitionResponseSchema.parse(await service.createPurchaseRequisition(parseRequest(createPurchaseRequisitionBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/procurement/requisitions/:id/approve', { schema: { tags: ['Procurement'], operationId: 'approveProcurementRequisition', summary: 'Approve a material requirement', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: EMPTY_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { id } = parseRequest(procurementIdParamsSchema, request.params, 'params');
    parseRequest(approvePurchaseRequisitionBodySchema, request.body ?? {}, 'body');
    const data = purchaseRequisitionResponseSchema.parse(await service.approvePurchaseRequisition(id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.get('/api/v1/procurement/purchase-orders', { schema: { tags: ['Procurement'], operationId: 'listProcurementPurchaseOrders', summary: 'List Purchase Orders', security: BEARER_SECURITY, querystring: PROJECT_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listPurchaseOrdersResponseSchema.parse(await service.listPurchaseOrders(parseRequest(listPurchaseOrdersQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/procurement/purchase-orders', { schema: { tags: ['Procurement'], operationId: 'createProcurementPurchaseOrder', summary: 'Create a Purchase Order from an approved requirement', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: PURCHASE_ORDER_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = purchaseOrderResponseSchema.parse(await service.createPurchaseOrder(parseRequest(createPurchaseOrderBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/procurement/purchase-orders/:id', { schema: { tags: ['Procurement'], operationId: 'getProcurementPurchaseOrder', summary: 'Get Purchase Order detail', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { id } = parseRequest(procurementIdParamsSchema, request.params, 'params');
    const data = purchaseOrderResponseSchema.parse(await service.getPurchaseOrder(id));
    return reply.send({ data });
  });

  app.post('/api/v1/procurement/purchase-orders/:id/issue', { schema: { tags: ['Procurement'], operationId: 'issueProcurementPurchaseOrder', summary: 'Issue a Purchase Order and create commitments', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: EMPTY_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { id } = parseRequest(procurementIdParamsSchema, request.params, 'params');
    parseRequest(issuePurchaseOrderBodySchema, request.body ?? {}, 'body');
    const data = purchaseOrderResponseSchema.parse(await service.issuePurchaseOrder(id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/procurement/purchase-orders/:id/cancel', { schema: { tags: ['Procurement'], operationId: 'cancelProcurementPurchaseOrder', summary: 'Cancel a Purchase Order', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CANCEL_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { id } = parseRequest(procurementIdParamsSchema, request.params, 'params');
    const data = purchaseOrderResponseSchema.parse(await service.cancelPurchaseOrder(id, parseRequest(cancelPurchaseOrderBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/procurement/goods-receipts', { schema: { tags: ['Procurement'], operationId: 'createProcurementGoodsReceipt', summary: 'Receive goods against an issued Purchase Order', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: GOODS_RECEIPT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = goodsReceiptResponseSchema.parse(await service.createGoodsReceipt(parseRequest(createGoodsReceiptBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/procurement/goods-receipts/:id', { schema: { tags: ['Procurement'], operationId: 'getProcurementGoodsReceipt', summary: 'Get Goods Receipt detail', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { id } = parseRequest(procurementIdParamsSchema, request.params, 'params');
    const data = goodsReceiptResponseSchema.parse(await service.getGoodsReceipt(id));
    return reply.send({ data });
  });
}
