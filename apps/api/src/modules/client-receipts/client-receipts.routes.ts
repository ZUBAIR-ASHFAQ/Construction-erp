import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  CLIENT_RECEIPT_ERROR_CODES,
  allocateClientReceiptBodySchema,
  clientReceiptIdParamsSchema,
  clientReceiptResponseSchema,
  createClientReceiptBodySchema,
  listClientReceiptsQuerySchema,
  listClientReceiptsResponseSchema,
  reverseClientReceiptBodySchema,
  unallocateClientReceiptBodySchema
} from './client-receipts.schema.js';
import { ClientReceiptsService } from './client-receipts.service.js';

export type ClientReceiptsRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID = { type: 'string', format: 'uuid' } as const;
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const MONEY = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const POSITIVE_MONEY = { type: 'string', pattern: '^(?:[1-9]\\d{0,15})(?:\\.\\d{1,2})?$|^0\\.(?:0[1-9]|[1-9]\\d?)$' } as const;
const PAYMENT_METHOD = { type: 'string', enum: ['CASH', 'BANK'] } as const;
const RECEIPT_TYPE = { type: 'string', enum: ['ADVANCE', 'INVOICE_PAYMENT'] } as const;
const RECEIPT_STATUS = { type: 'string', enum: ['POSTED', 'REVERSED'] } as const;
const NULLABLE_UUID = { anyOf: [UUID, { type: 'null' }] } as const;
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const NULLABLE_DATETIME = { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] } as const;
const PAGE = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const ID_PARAMS = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID } } as const;
const LIST_QUERY = {
  type: 'object', additionalProperties: false,
  properties: {
    clientId: UUID, projectId: UUID, stageId: UUID, status: RECEIPT_STATUS, receiptType: RECEIPT_TYPE,
    paymentMethod: PAYMENT_METHOD, fromDate: DATE, toDate: DATE, ...PAGE
  }
} as const;
const CREATE_BODY = {
  type: 'object', additionalProperties: false,
  required: ['clientId', 'projectId', 'receiptDate', 'amount', 'paymentMethod', 'cashBankAccountId', 'receiptType'],
  properties: {
    clientId: UUID, projectId: UUID, stageId: NULLABLE_UUID, receiptDate: DATE, amount: POSITIVE_MONEY,
    paymentMethod: PAYMENT_METHOD, cashBankAccountId: UUID,
    reference: { anyOf: [{ type: 'string', minLength: 1, maxLength: 200 }, { type: 'null' }] }, receiptType: RECEIPT_TYPE
  }
} as const;
const ALLOCATE_BODY = { type: 'object', additionalProperties: false, required: ['clientInvoiceId', 'amount'], properties: { clientInvoiceId: UUID, amount: POSITIVE_MONEY } } as const;
const UNALLOCATE_BODY = { type: 'object', additionalProperties: false, required: ['allocationId'], properties: { allocationId: UUID } } as const;
const EMPTY_BODY = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const ALLOCATION = {
  type: 'object', additionalProperties: false, required: ['id', 'clientInvoiceId', 'amount', 'allocatedAt', 'allocatedBy'],
  properties: { id: UUID, clientInvoiceId: UUID, amount: POSITIVE_MONEY, allocatedAt: { type: 'string', format: 'date-time' }, allocatedBy: UUID }
} as const;
const RECEIPT = {
  type: 'object', additionalProperties: false,
  required: ['id', 'clientId', 'projectId', 'stageId', 'receiptNo', 'receiptDate', 'amount', 'paymentMethod', 'cashBankAccountId', 'reference', 'receiptType', 'status', 'createdBy', 'postedAt', 'createdAt', 'allocatedAmount', 'unallocatedAmount', 'allocations'],
  properties: {
    id: UUID, clientId: UUID, projectId: UUID, stageId: NULLABLE_UUID, receiptNo: { type: 'string' }, receiptDate: DATE,
    amount: POSITIVE_MONEY, paymentMethod: PAYMENT_METHOD, cashBankAccountId: UUID, reference: NULLABLE_STRING,
    receiptType: RECEIPT_TYPE, status: RECEIPT_STATUS, createdBy: UUID, postedAt: NULLABLE_DATETIME,
    createdAt: { type: 'string', format: 'date-time' }, allocatedAmount: MONEY, unallocatedAmount: MONEY,
    allocations: { type: 'array', items: ALLOCATION }
  }
} as const;
const RECEIPT_LIST = {
  type: 'object', additionalProperties: false, required: ['items', 'total', 'page', 'pageSize'],
  properties: { items: { type: 'array', items: RECEIPT }, total: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } }
} as const;
const IDEMPOTENCY_HEADERS = { type: 'object', additionalProperties: true, required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } } as const;
const ERROR_DESCRIPTION = `Stable Client Receipts business codes: ${CLIENT_RECEIPT_ERROR_CODES.join(', ')}. Foundation/auth/idempotency/Finance errors keep their own stable codes.`;
const ERROR = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string', description: ERROR_DESCRIPTION }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_RESPONSES = { 400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR } as const;

/** Wrap one documented response value in the standard API success envelope. */
function dataEnvelope(dataSchema: unknown) {
  return { type: 'object', additionalProperties: false, required: ['data'], properties: { data: dataSchema } } as const;
}

/** Parse one HTTP boundary with the authoritative Client Receipts Zod schema. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError({
    message: `Invalid ${location}.`,
    fieldErrors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || location, message: issue.message }))
  });
}

/** Read the Foundation idempotency key required by Client Receipt write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.trim().length === 0 || key.length > 200) {
    throw new ValidationError({ message: 'Idempotency-Key header is required and must be at most 200 characters.' });
  }
  return key.trim();
}

/** Register exactly the six Final-21 Client Receipts routes with complete HTTP/OpenAPI contracts. */
export async function registerClientReceiptsRoutes(app: FastifyInstance, options: ClientReceiptsRoutesOptions): Promise<void> {
  const service = new ClientReceiptsService(options.database);

  /** Authenticate one Client Receipts request against the configured database. */
  const authenticate = async (request: FastifyRequest): Promise<void> => authenticateRequest(request, options.database);

  app.get('/api/v1/client-receipts', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'listClientReceipts', summary: 'List Client Receipts', security: BEARER_SECURITY, querystring: LIST_QUERY, response: { 200: dataEnvelope(RECEIPT_LIST), ...COMMON_RESPONSES } }
  }, async (request) => {
    const query = parseRequest(listClientReceiptsQuerySchema, request.query, 'query');
    return { data: listClientReceiptsResponseSchema.parse(await service.listClientReceipts(query)) };
  });

  app.post('/api/v1/client-receipts', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'createClientReceipt', summary: 'Create and post a Client Receipt', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS, body: CREATE_BODY, response: { 201: dataEnvelope(RECEIPT), ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    const body = parseRequest(createClientReceiptBodySchema, request.body, 'body');
    const data = clientReceiptResponseSchema.parse(await service.createClientReceipt(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/client-receipts/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'getClientReceipt', summary: 'Read one Client Receipt', security: BEARER_SECURITY, params: ID_PARAMS, response: { 200: dataEnvelope(RECEIPT), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(clientReceiptIdParamsSchema, request.params, 'params');
    return { data: clientReceiptResponseSchema.parse(await service.getClientReceipt(params.id)) };
  });

  app.post('/api/v1/client-receipts/:id/allocations', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'allocateClientReceipt', summary: 'Allocate Client Receipt cash to an Invoice', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS, params: ID_PARAMS, body: ALLOCATE_BODY, response: { 201: dataEnvelope(RECEIPT), ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    const params = parseRequest(clientReceiptIdParamsSchema, request.params, 'params');
    const body = parseRequest(allocateClientReceiptBodySchema, request.body, 'body');
    const data = clientReceiptResponseSchema.parse(await service.allocateClientReceipt(params.id, body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.post('/api/v1/client-receipts/:id/unallocate', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'unallocateClientReceipt', summary: 'Reverse one permitted Client Receipt allocation', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS, params: ID_PARAMS, body: UNALLOCATE_BODY, response: { 200: dataEnvelope(RECEIPT), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(clientReceiptIdParamsSchema, request.params, 'params');
    const body = parseRequest(unallocateClientReceiptBodySchema, request.body, 'body');
    return { data: clientReceiptResponseSchema.parse(await service.unallocateClientReceipt(params.id, body, readIdempotencyKey(request))) };
  });

  app.post('/api/v1/client-receipts/:id/reverse', {
    preHandler: [authenticate],
    schema: { tags: ['Client Receipts'], operationId: 'reverseClientReceipt', summary: 'Reverse one fully unallocated Client Receipt', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS, params: ID_PARAMS, body: EMPTY_BODY, response: { 200: dataEnvelope(RECEIPT), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(clientReceiptIdParamsSchema, request.params, 'params');
    parseRequest(reverseClientReceiptBodySchema, request.body ?? {}, 'body');
    return { data: clientReceiptResponseSchema.parse(await service.reverseClientReceipt(params.id, readIdempotencyKey(request))) };
  });
}
