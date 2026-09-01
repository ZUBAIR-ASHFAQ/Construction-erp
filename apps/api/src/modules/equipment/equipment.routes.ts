import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createEquipmentAssignmentBodySchema,
  createEquipmentBodySchema,
  createEquipmentMaintenanceBodySchema,
  endEquipmentAssignmentBodySchema,
  equipmentAssignmentParamsSchema,
  equipmentAssignmentResponseSchema,
  equipmentHistoryQuerySchema,
  equipmentHistoryResponseSchema,
  equipmentIdParamsSchema,
  equipmentMaintenanceResponseSchema,
  equipmentResponseSchema,
  equipmentUsageResponseSchema,
  listEquipmentQuerySchema,
  listEquipmentResponseSchema,
  recordEquipmentUsageBodySchema
} from './equipment.schema.js';
import { EquipmentService } from './equipment.service.js';

export type EquipmentRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const DECIMAL_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,4})?$' } as const;
const MONEY_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_DECIMAL_JSON_SCHEMA = { anyOf: [DECIMAL_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_DATE_JSON_SCHEMA = { anyOf: [DATE_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_STRING_JSON_SCHEMA = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const ID_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const ASSIGNMENT_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id', 'assignmentId'], properties: { id: UUID_JSON_SCHEMA, assignmentId: UUID_JSON_SCHEMA } } as const;
const PAGE_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } } as const;
const HISTORY_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { pageSize: { type: 'integer', minimum: 1, maximum: 100 } } } as const;
const CREATE_EQUIPMENT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['code', 'name', 'equipmentType', 'ownershipType'],
  properties: {
    code: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 300 },
    equipmentType: { type: 'string', minLength: 1, maxLength: 120 },
    ownershipType: { type: 'string', minLength: 1, maxLength: 64 },
    defaultRate: NULLABLE_DECIMAL_JSON_SCHEMA,
    rateUnit: { anyOf: [{ type: 'string', minLength: 1, maxLength: 32 }, { type: 'null' }] }
  }
} as const;
const ASSIGNMENT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'fromDate'],
  properties: { projectId: UUID_JSON_SCHEMA, stageId: NULLABLE_UUID_JSON_SCHEMA, fromDate: DATE_JSON_SCHEMA, toDate: NULLABLE_DATE_JSON_SCHEMA }
} as const;
const END_ASSIGNMENT_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['endDate'], properties: { endDate: DATE_JSON_SCHEMA } } as const;
const USAGE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['assignmentId', 'usageDate', 'quantity'],
  properties: { assignmentId: UUID_JSON_SCHEMA, usageDate: DATE_JSON_SCHEMA, quantity: DECIMAL_JSON_SCHEMA, rate: NULLABLE_DECIMAL_JSON_SCHEMA }
} as const;
const MAINTENANCE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['maintenanceDate', 'type', 'cost'],
  properties: { maintenanceDate: DATE_JSON_SCHEMA, type: { type: 'string', minLength: 1, maxLength: 120 }, cost: MONEY_JSON_SCHEMA, note: NULLABLE_STRING_JSON_SCHEMA }
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

/** Parse one Equipment request segment through its Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query' | 'params'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [source, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the Foundation retry key required by Equipment write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ code: 'INVALID_REQUEST', message: 'A valid Idempotency-Key header is required.' });
  }
  return value.trim();
}

/** Register the Equipment Management routes, including the controlled assignment-end command. */
export async function registerEquipmentRoutes(app: FastifyInstance, options: EquipmentRoutesOptions): Promise<void> {
  const service = new EquipmentService(options.database);

  app.get('/api/v1/equipment', {
    schema: { tags: ['Equipment'], operationId: 'listEquipment', summary: 'List equipment', security: BEARER_SECURITY, querystring: PAGE_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = listEquipmentResponseSchema.parse(await service.listEquipment(parseRequest(listEquipmentQuerySchema, request.query, 'query')));
    return reply.send({ data });
  });

  app.post('/api/v1/equipment', {
    schema: { tags: ['Equipment'], operationId: 'createEquipment', summary: 'Create equipment', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_EQUIPMENT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const data = equipmentResponseSchema.parse(await service.createEquipment(parseRequest(createEquipmentBodySchema, request.body, 'body'), readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/equipment/:id/assignments', {
    schema: { tags: ['Equipment'], operationId: 'assignEquipment', summary: 'Assign equipment to a project or stage', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: ASSIGNMENT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(equipmentIdParamsSchema, request.params, 'params');
    const body = parseRequest(createEquipmentAssignmentBodySchema, request.body, 'body');
    const data = equipmentAssignmentResponseSchema.parse(await service.assignEquipment(params.id, body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/equipment/:id/assignments/:assignmentId/end', {
    schema: { tags: ['Equipment'], operationId: 'endEquipmentAssignment', summary: 'End one active equipment assignment without deleting history', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ASSIGNMENT_PARAMS_JSON_SCHEMA, body: END_ASSIGNMENT_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(equipmentAssignmentParamsSchema, request.params, 'params');
    const body = parseRequest(endEquipmentAssignmentBodySchema, request.body, 'body');
    const data = equipmentAssignmentResponseSchema.parse(await service.endAssignment(params.id, params.assignmentId, body, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/equipment/:id/usage', {
    schema: { tags: ['Equipment'], operationId: 'recordEquipmentUsage', summary: 'Record and post equipment usage cost', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: USAGE_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(equipmentIdParamsSchema, request.params, 'params');
    const body = parseRequest(recordEquipmentUsageBodySchema, request.body, 'body');
    const data = equipmentUsageResponseSchema.parse(await service.recordUsage(params.id, body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/equipment/:id/maintenance', {
    schema: { tags: ['Equipment'], operationId: 'recordEquipmentMaintenance', summary: 'Record equipment maintenance', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: MAINTENANCE_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(equipmentIdParamsSchema, request.params, 'params');
    const body = parseRequest(createEquipmentMaintenanceBodySchema, request.body, 'body');
    const data = equipmentMaintenanceResponseSchema.parse(await service.createMaintenance(params.id, body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/equipment/:id/history', {
    schema: { tags: ['Equipment'], operationId: 'getEquipmentHistory', summary: 'Read equipment assignment usage maintenance and cost history', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, querystring: HISTORY_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(equipmentIdParamsSchema, request.params, 'params');
    const query = parseRequest(equipmentHistoryQuerySchema, request.query, 'query');
    const data = equipmentHistoryResponseSchema.parse(await service.getHistory(params.id, query));
    return reply.send({ data });
  });
}
