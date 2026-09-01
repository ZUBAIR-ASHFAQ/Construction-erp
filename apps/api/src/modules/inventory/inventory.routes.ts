import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  adjustStockBodySchema,
  adjustStockResponseSchema,
  createMaterialBodySchema,
  createMaterialIssueBodySchema,
  listLedgerQuerySchema,
  listLedgerResponseSchema,
  listMaterialsQuerySchema,
  listMaterialsResponseSchema,
  listStockQuerySchema,
  listStockResponseSchema,
  materialIssueResponseSchema,
  materialResponseSchema,
  transferMaterialBodySchema,
  transferMaterialResponseSchema
} from './inventory.schema.js';
import { InventoryService } from './inventory.service.js';

export type InventoryRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const POSITIVE_DECIMAL_JSON_SCHEMA = { type: 'string', pattern: '^(?:[1-9]\\d{0,13}(?:\\.\\d{1,4})?|0\\.(?:\\d{0,3}[1-9]))$' } as const;
const SIGNED_DECIMAL_JSON_SCHEMA = { type: 'string', pattern: '^-?(?:[1-9]\\d{0,13}(?:\\.\\d{1,4})?|0\\.(?:\\d{0,3}[1-9]))$' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const PAGE_PROPERTIES = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const MATERIALS_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: PAGE_PROPERTIES } as const;
const STOCK_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { ...PAGE_PROPERTIES, warehouseId: UUID_JSON_SCHEMA, materialId: UUID_JSON_SCHEMA } } as const;
const LEDGER_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { ...PAGE_PROPERTIES, warehouseId: UUID_JSON_SCHEMA, materialId: UUID_JSON_SCHEMA, projectId: UUID_JSON_SCHEMA, stageId: UUID_JSON_SCHEMA } } as const;
const CREATE_MATERIAL_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['code', 'name', 'unit'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 300 },
    unit: { type: 'string', minLength: 1, maxLength: 64 },
    category: { anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }] }
  }
} as const;
const ISSUE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'warehouseId', 'issueDate', 'items'],
  properties: {
    projectId: UUID_JSON_SCHEMA,
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    warehouseId: UUID_JSON_SCHEMA,
    issueDate: DATE_JSON_SCHEMA,
    description: { anyOf: [{ type: 'string', maxLength: 1000 }, { type: 'null' }] },
    items: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'object', additionalProperties: false, required: ['materialId', 'quantity'], properties: { materialId: UUID_JSON_SCHEMA, quantity: POSITIVE_DECIMAL_JSON_SCHEMA } } }
  }
} as const;
const TRANSFER_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sourceWarehouseId', 'destinationWarehouseId', 'materialId', 'quantity'],
  properties: { sourceWarehouseId: UUID_JSON_SCHEMA, destinationWarehouseId: UUID_JSON_SCHEMA, materialId: UUID_JSON_SCHEMA, quantity: POSITIVE_DECIMAL_JSON_SCHEMA }
} as const;
const ADJUSTMENT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['warehouseId', 'materialId', 'quantityDelta', 'reason'],
  properties: { warehouseId: UUID_JSON_SCHEMA, materialId: UUID_JSON_SCHEMA, quantityDelta: SIGNED_DECIMAL_JSON_SCHEMA, reason: { type: 'string', minLength: 1, maxLength: 1000 } }
} as const;
const SUCCESS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: { type: 'object', additionalProperties: true } } } as const;
const ERROR_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA } as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } }
} as const;

/** Parse one Inventory request segment through its Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [source, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the Foundation retry key required by Inventory write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ code: 'INVALID_REQUEST', message: 'A valid Idempotency-Key header is required.' });
  }
  return value.trim();
}

/** Register the exact Final-21 Material, stock, ledger, issue, transfer and adjustment routes. */
export async function registerInventoryRoutes(app: FastifyInstance, options: InventoryRoutesOptions): Promise<void> {
  const service = new InventoryService(options.database);

  app.get('/api/v1/inventory/materials', { schema: { tags: ['Inventory'], operationId: 'listInventoryMaterials', summary: 'List materials', security: BEARER_SECURITY, querystring: MATERIALS_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listMaterialsResponseSchema.parse(await service.listMaterials(parseRequest(listMaterialsQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/inventory/materials', { schema: { tags: ['Inventory'], operationId: 'createInventoryMaterial', summary: 'Create material', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_MATERIAL_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = materialResponseSchema.parse(await service.createMaterial(parseRequest(createMaterialBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/inventory/stock', { schema: { tags: ['Inventory'], operationId: 'listInventoryStock', summary: 'Read warehouse stock', security: BEARER_SECURITY, querystring: STOCK_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listStockResponseSchema.parse(await service.listStock(parseRequest(listStockQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.get('/api/v1/inventory/ledger', { schema: { tags: ['Inventory'], operationId: 'listInventoryLedger', summary: 'Read append-only stock ledger', security: BEARER_SECURITY, querystring: LEDGER_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listLedgerResponseSchema.parse(await service.listLedger(parseRequest(listLedgerQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/inventory/issues', { schema: { tags: ['Inventory'], operationId: 'createInventoryIssue', summary: 'Issue material to a project or stage', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: ISSUE_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = materialIssueResponseSchema.parse(await service.createMaterialIssue(parseRequest(createMaterialIssueBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/inventory/transfers', { schema: { tags: ['Inventory'], operationId: 'transferInventoryMaterial', summary: 'Transfer material between warehouses', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: TRANSFER_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = transferMaterialResponseSchema.parse(await service.transferMaterial(parseRequest(transferMaterialBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/inventory/adjustments', { schema: { tags: ['Inventory'], operationId: 'adjustInventoryStock', summary: 'Create a controlled stock adjustment', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: ADJUSTMENT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } } }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = adjustStockResponseSchema.parse(await service.adjustStock(parseRequest(adjustStockBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });
}
