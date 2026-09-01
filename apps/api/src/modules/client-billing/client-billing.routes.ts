import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  CLIENT_BILLING_ERROR_CODES,
  billingIdParamsSchema,
  clientInvoiceResponseSchema,
  createClaimBodySchema,
  createInvoiceBodySchema,
  finalizeClaimBodySchema,
  listClaimsQuerySchema,
  listClaimsResponseSchema,
  listInvoicesQuerySchema,
  listInvoicesResponseSchema,
  progressClaimResponseSchema,
  projectBillingParamsSchema,
  projectBillingSettingsResponseSchema,
  updateClaimBodySchema,
  updateProjectBillingSettingsBodySchema
} from './client-billing.schema.js';
import { ClientBillingService } from './client-billing.service.js';

export type ClientBillingRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const MONEY_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const POSITIVE_MONEY_JSON_SCHEMA = { type: 'string', pattern: '^(?:[1-9]\\d{0,15})(?:\\.\\d{1,2})?$|^0\\.(?:0[1-9]|[1-9]\\d?)$' } as const;
const PERCENT_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,2})(?:\\.\\d{1,4})?$' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_DATE_JSON_SCHEMA = { anyOf: [DATE_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_PERCENT_JSON_SCHEMA = { anyOf: [PERCENT_JSON_SCHEMA, { type: 'null' }] } as const;
const NULLABLE_STRING_JSON_SCHEMA = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const BILLING_METHOD_JSON_SCHEMA = { type: 'string', enum: ['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'] } as const;
const SETTINGS_STATUS_JSON_SCHEMA = { type: 'string', enum: ['ACTIVE', 'INACTIVE'] } as const;
const CLAIM_STATUS_JSON_SCHEMA = { type: 'string', enum: ['DRAFT', 'FINALIZED'] } as const;
const INVOICE_STATUS_JSON_SCHEMA = { type: 'string', enum: ['ISSUED'] } as const;
const PAGE_PROPERTIES = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const PROJECT_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: UUID_JSON_SCHEMA } } as const;
const ID_PARAMS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const CLAIMS_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { projectId: UUID_JSON_SCHEMA, status: CLAIM_STATUS_JSON_SCHEMA, ...PAGE_PROPERTIES } } as const;
const INVOICES_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { projectId: UUID_JSON_SCHEMA, status: INVOICE_STATUS_JSON_SCHEMA, ...PAGE_PROPERTIES } } as const;
const CLAIM_LINE_INPUT_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['description', 'amount'],
  properties: {
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    description: { type: 'string', minLength: 1, maxLength: 1000 },
    billingProgressPercent: NULLABLE_PERCENT_JSON_SCHEMA,
    amount: POSITIVE_MONEY_JSON_SCHEMA
  }
} as const;
const SETTINGS_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['billingMethod'],
  properties: {
    billingMethod: BILLING_METHOD_JSON_SCHEMA,
    retentionPercent: NULLABLE_PERCENT_JSON_SCHEMA,
    billingCycle: { anyOf: [{ type: 'string', minLength: 1, maxLength: 64 }, { type: 'null' }] },
    advanceRecoveryEnabled: { type: 'boolean', default: false },
    status: { ...SETTINGS_STATUS_JSON_SCHEMA, default: 'ACTIVE' }
  }
} as const;
const CREATE_CLAIM_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'periodEnd'],
  properties: { projectId: UUID_JSON_SCHEMA, periodEnd: DATE_JSON_SCHEMA, lines: { type: 'array', maxItems: 500, items: CLAIM_LINE_INPUT_JSON_SCHEMA, default: [] } }
} as const;
const UPDATE_CLAIM_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { periodEnd: DATE_JSON_SCHEMA, lines: { type: 'array', maxItems: 500, items: CLAIM_LINE_INPUT_JSON_SCHEMA } },
  anyOf: [{ required: ['periodEnd'] }, { required: ['lines'] }]
} as const;
const EMPTY_COMMAND_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const CREATE_INVOICE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['invoiceDate', 'dueDate'],
  properties: {
    invoiceDate: { ...DATE_JSON_SCHEMA, description: 'Invoice date in YYYY-MM-DD.' },
    dueDate: { ...DATE_JSON_SCHEMA, description: 'Due date in YYYY-MM-DD; the API requires it to be on or after invoiceDate.' }
  }
} as const;
const CLAIM_LINE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'stageId', 'description', 'billingProgressPercent', 'amount'],
  properties: { id: UUID_JSON_SCHEMA, stageId: NULLABLE_UUID_JSON_SCHEMA, description: { type: 'string' }, billingProgressPercent: NULLABLE_PERCENT_JSON_SCHEMA, amount: MONEY_JSON_SCHEMA }
} as const;
const INVOICE_LINE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['id', 'stageId', 'description', 'amount'],
  properties: { id: UUID_JSON_SCHEMA, stageId: NULLABLE_UUID_JSON_SCHEMA, description: { type: 'string' }, amount: MONEY_JSON_SCHEMA }
} as const;
const INVOICE_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'clientId', 'claimId', 'invoiceNo', 'invoiceDate', 'dueDate', 'status', 'subtotal', 'taxAmount', 'totalAmount', 'lines'],
  properties: {
    id: UUID_JSON_SCHEMA, projectId: UUID_JSON_SCHEMA, clientId: UUID_JSON_SCHEMA, claimId: NULLABLE_UUID_JSON_SCHEMA,
    invoiceNo: { type: 'string' }, invoiceDate: DATE_JSON_SCHEMA, dueDate: NULLABLE_DATE_JSON_SCHEMA, status: INVOICE_STATUS_JSON_SCHEMA,
    subtotal: MONEY_JSON_SCHEMA, taxAmount: MONEY_JSON_SCHEMA, totalAmount: MONEY_JSON_SCHEMA,
    lines: { type: 'array', items: INVOICE_LINE_JSON_SCHEMA }
  }
} as const;
const CLAIM_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['id', 'projectId', 'clientId', 'claimNo', 'periodEnd', 'status', 'grossValue', 'deductions', 'retention', 'netCertified', 'lines', 'invoice'],
  properties: {
    id: UUID_JSON_SCHEMA, projectId: UUID_JSON_SCHEMA, clientId: UUID_JSON_SCHEMA, claimNo: { type: 'string' }, periodEnd: DATE_JSON_SCHEMA,
    status: CLAIM_STATUS_JSON_SCHEMA, grossValue: MONEY_JSON_SCHEMA, deductions: MONEY_JSON_SCHEMA, retention: MONEY_JSON_SCHEMA, netCertified: MONEY_JSON_SCHEMA,
    lines: { type: 'array', items: CLAIM_LINE_JSON_SCHEMA }, invoice: { anyOf: [INVOICE_JSON_SCHEMA, { type: 'null' }] }
  }
} as const;
const SETTINGS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'billingMethod', 'retentionPercent', 'billingCycle', 'advanceRecoveryEnabled', 'status'],
  properties: { projectId: UUID_JSON_SCHEMA, billingMethod: BILLING_METHOD_JSON_SCHEMA, retentionPercent: NULLABLE_PERCENT_JSON_SCHEMA, billingCycle: NULLABLE_STRING_JSON_SCHEMA, advanceRecoveryEnabled: { type: 'boolean' }, status: SETTINGS_STATUS_JSON_SCHEMA }
} as const;
const CLAIM_LIST_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['items', 'total', 'page', 'pageSize'], properties: { items: { type: 'array', items: CLAIM_JSON_SCHEMA }, total: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } } as const;
const INVOICE_LIST_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['items', 'total', 'page', 'pageSize'], properties: { items: { type: 'array', items: INVOICE_JSON_SCHEMA }, total: { type: 'integer', minimum: 0 }, page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } } as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = { type: 'object', additionalProperties: true, required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } } } as const;
const CLIENT_BILLING_ERROR_DESCRIPTION = `Stable Client Billing business codes: ${CLIENT_BILLING_ERROR_CODES.join(', ')}. Foundation/auth/idempotency/numbering/Finance errors keep their own stable codes.`;
const ERROR_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string', description: CLIENT_BILLING_ERROR_DESCRIPTION }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA, 503: ERROR_JSON_SCHEMA } as const;

/** Wrap one documented response object in the standard success envelope. */
function dataEnvelope(dataSchema: unknown) {
  return { type: 'object', additionalProperties: false, required: ['data'], properties: { data: dataSchema } } as const;
}

/** Parse one request boundary with Zod and return a stable validation error. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError({
    message: `Invalid ${location}.`,
    fieldErrors: parsed.error.issues.map((issue) => ({ field: issue.path.join('.') || location, message: issue.message }))
  });
}

/** Read the idempotency key required by Client Billing write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.trim().length === 0 || key.length > 200) {
    throw new ValidationError({ message: 'Idempotency-Key header is required and must be at most 200 characters.' });
  }
  return key.trim();
}

/** Register the exact nine Final-21 Client Billing routes with complete HTTP/OpenAPI contracts. */
export async function registerClientBillingRoutes(app: FastifyInstance, options: ClientBillingRoutesOptions): Promise<void> {
  const service = new ClientBillingService(options.database);

  /** Authenticate one Client Billing request against the configured database. */
  const authenticate = async (request: FastifyRequest): Promise<void> => authenticateRequest(request, options.database);

  app.get('/api/v1/client-billing/projects/:projectId/settings', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'getClientBillingSettings', summary: 'Read Project billing settings', security: BEARER_SECURITY, params: PROJECT_PARAMS_JSON_SCHEMA, response: { 200: dataEnvelope(SETTINGS_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(projectBillingParamsSchema, request.params, 'params');
    return { data: projectBillingSettingsResponseSchema.parse(await service.getSettings(params.projectId)) };
  });

  app.put('/api/v1/client-billing/projects/:projectId/settings', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'updateClientBillingSettings', summary: 'Update permitted Project billing settings', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: PROJECT_PARAMS_JSON_SCHEMA, body: SETTINGS_BODY_JSON_SCHEMA, response: { 200: dataEnvelope(SETTINGS_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(projectBillingParamsSchema, request.params, 'params');
    const body = parseRequest(updateProjectBillingSettingsBodySchema, request.body, 'body');
    return { data: projectBillingSettingsResponseSchema.parse(await service.updateSettings(params.projectId, body, readIdempotencyKey(request))) };
  });

  app.get('/api/v1/client-billing/claims', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'listClientBillingClaims', summary: 'List Progress Claims', security: BEARER_SECURITY, querystring: CLAIMS_QUERY_JSON_SCHEMA, response: { 200: dataEnvelope(CLAIM_LIST_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const query = parseRequest(listClaimsQuerySchema, request.query, 'query');
    return { data: listClaimsResponseSchema.parse(await service.listClaims(query)) };
  });

  app.post('/api/v1/client-billing/claims', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'createClientBillingClaim', summary: 'Create a draft Progress Claim', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, body: CREATE_CLAIM_BODY_JSON_SCHEMA, response: { 201: dataEnvelope(CLAIM_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    const body = parseRequest(createClaimBodySchema, request.body, 'body');
    const data = progressClaimResponseSchema.parse(await service.createClaim(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.patch('/api/v1/client-billing/claims/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'updateClientBillingClaim', summary: 'Edit a draft Progress Claim', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: UPDATE_CLAIM_BODY_JSON_SCHEMA, response: { 200: dataEnvelope(CLAIM_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(billingIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateClaimBodySchema, request.body, 'body');
    return { data: progressClaimResponseSchema.parse(await service.updateClaim(params.id, body, readIdempotencyKey(request))) };
  });

  app.post('/api/v1/client-billing/claims/:id/finalize', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'finalizeClientBillingClaim', summary: 'Finalize and certify a Progress Claim', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: EMPTY_COMMAND_BODY_JSON_SCHEMA, response: { 200: dataEnvelope(CLAIM_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(billingIdParamsSchema, request.params, 'params');
    parseRequest(finalizeClaimBodySchema, request.body ?? {}, 'body');
    return { data: progressClaimResponseSchema.parse(await service.finalizeClaim(params.id, readIdempotencyKey(request))) };
  });

  app.post('/api/v1/client-billing/claims/:id/invoice', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'createClientBillingInvoice', summary: 'Create and post a Client Invoice from a finalized claim', security: BEARER_SECURITY, headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA, params: ID_PARAMS_JSON_SCHEMA, body: CREATE_INVOICE_BODY_JSON_SCHEMA, response: { 201: dataEnvelope(INVOICE_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    const params = parseRequest(billingIdParamsSchema, request.params, 'params');
    const body = parseRequest(createInvoiceBodySchema, request.body, 'body');
    const data = clientInvoiceResponseSchema.parse(await service.createInvoice(params.id, body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/client-billing/invoices', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'listClientBillingInvoices', summary: 'List Client Invoices', security: BEARER_SECURITY, querystring: INVOICES_QUERY_JSON_SCHEMA, response: { 200: dataEnvelope(INVOICE_LIST_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const query = parseRequest(listInvoicesQuerySchema, request.query, 'query');
    return { data: listInvoicesResponseSchema.parse(await service.listInvoices(query)) };
  });

  app.get('/api/v1/client-billing/invoices/:id', {
    preHandler: [authenticate],
    schema: { tags: ['Client Billing'], operationId: 'getClientBillingInvoice', summary: 'Read one Client Invoice', security: BEARER_SECURITY, params: ID_PARAMS_JSON_SCHEMA, response: { 200: dataEnvelope(INVOICE_JSON_SCHEMA), ...COMMON_RESPONSES } }
  }, async (request) => {
    const params = parseRequest(billingIdParamsSchema, request.params, 'params');
    return { data: clientInvoiceResponseSchema.parse(await service.getInvoice(params.id)) };
  });
}
