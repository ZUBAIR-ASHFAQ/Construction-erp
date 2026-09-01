import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createSiteExpenseBodySchema,
  listSiteExpensesQuerySchema,
  listSiteExpensesResponseSchema,
  postSiteExpenseBodySchema,
  reverseSiteExpenseBodySchema,
  siteExpenseIdParamsSchema,
  siteExpenseResponseSchema,
  updateSiteExpenseBodySchema
} from './site-expenses.schema.js';
import { SiteExpensesService } from './site-expenses.service.js';

export type SiteExpensesRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', format: 'date' } as const;
const MONEY_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:[1-9]\\d{0,15})(?:\\.\\d{1,2})?$|^0\\.(?:0[1-9]|[1-9]\\d?)$'
} as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const PAYMENT_MODE_JSON_SCHEMA = { type: 'string', enum: ['CASH', 'BANK', 'PAYABLE'] } as const;
const STATUS_JSON_SCHEMA = { type: 'string', enum: ['DRAFT', 'POSTED', 'REVERSED'] } as const;
const SITE_EXPENSE_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: UUID_JSON_SCHEMA }
} as const;
const LIST_SITE_EXPENSES_QUERY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: UUID_JSON_SCHEMA,
    stageId: UUID_JSON_SCHEMA,
    categoryId: UUID_JSON_SCHEMA,
    paymentMode: PAYMENT_MODE_JSON_SCHEMA,
    status: STATUS_JSON_SCHEMA,
    fromDate: DATE_JSON_SCHEMA,
    toDate: DATE_JSON_SCHEMA,
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;
const SITE_EXPENSE_BODY_PROPERTIES = {
  projectId: UUID_JSON_SCHEMA,
  stageId: NULLABLE_UUID_JSON_SCHEMA,
  expenseDate: DATE_JSON_SCHEMA,
  categoryId: UUID_JSON_SCHEMA,
  description: { type: 'string', minLength: 1, maxLength: 2000 },
  amount: MONEY_JSON_SCHEMA,
  paymentMode: PAYMENT_MODE_JSON_SCHEMA,
  cashBankAccountId: NULLABLE_UUID_JSON_SCHEMA,
  documentId: NULLABLE_UUID_JSON_SCHEMA
} as const;
const CREATE_SITE_EXPENSE_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'expenseDate', 'categoryId', 'description', 'amount', 'paymentMode'],
  properties: SITE_EXPENSE_BODY_PROPERTIES
} as const;
const UPDATE_SITE_EXPENSE_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: SITE_EXPENSE_BODY_PROPERTIES
} as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const SITE_EXPENSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'projectId', 'stageId', 'expenseNo', 'expenseDate', 'categoryId', 'description', 'amount',
    'paymentMode', 'cashBankAccountId', 'status', 'documentId', 'createdBy', 'postedAt'
  ],
  properties: {
    id: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    stageId: NULLABLE_UUID_JSON_SCHEMA,
    expenseNo: { type: 'string', minLength: 1 },
    expenseDate: DATE_JSON_SCHEMA,
    categoryId: UUID_JSON_SCHEMA,
    description: { type: 'string' },
    amount: { type: 'string' },
    paymentMode: PAYMENT_MODE_JSON_SCHEMA,
    cashBankAccountId: NULLABLE_UUID_JSON_SCHEMA,
    status: STATUS_JSON_SCHEMA,
    documentId: NULLABLE_UUID_JSON_SCHEMA,
    createdBy: UUID_JSON_SCHEMA,
    postedAt: { anyOf: [{ type: 'string', format: 'date-time' }, { type: 'null' }] }
  }
} as const;
const SITE_EXPENSE_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: SITE_EXPENSE_JSON_SCHEMA }
} as const;
const SITE_EXPENSE_LIST_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['items', 'total', 'page', 'pageSize'],
      properties: {
        items: { type: 'array', items: SITE_EXPENSE_JSON_SCHEMA },
        total: { type: 'integer', minimum: 0 },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 }
      }
    }
  }
} as const;
const ERROR_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['error'],
  properties: { error: { type: 'object', additionalProperties: true } }
} as const;
const COMMON_RESPONSES = {
  400: ERROR_JSON_SCHEMA,
  401: ERROR_JSON_SCHEMA,
  403: ERROR_JSON_SCHEMA,
  404: ERROR_JSON_SCHEMA,
  409: ERROR_JSON_SCHEMA,
  500: ERROR_JSON_SCHEMA
} as const;
const IDEMPOTENCY_HEADERS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['idempotency-key'],
  properties: {
    'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 }
  }
} as const;

/** Parse one Site Expense request segment through the frozen Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'query' | 'params'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({
      field: [source, ...issue.path.map(String)].join('.'),
      message: issue.message
    }))
  });
}

/** Read the Foundation retry key required by every Site Expense write command. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key header is required.'
    });
  }
  return value.trim();
}

/** Register the exact six Final-21 Site Expense Management routes. */
export async function registerSiteExpensesRoutes(app: FastifyInstance, options: SiteExpensesRoutesOptions): Promise<void> {
  const service = new SiteExpensesService(options.database);

  app.get('/api/v1/site-expenses', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'listSiteExpenses',
      summary: 'List and filter Site Expenses',
      security: BEARER_SECURITY,
      querystring: LIST_SITE_EXPENSES_QUERY_JSON_SCHEMA,
      response: { 200: SITE_EXPENSE_LIST_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listSiteExpensesQuerySchema, request.query, 'query');
    const data = listSiteExpensesResponseSchema.parse(await service.listSiteExpenses(query));
    return reply.send({ data });
  });

  app.post('/api/v1/site-expenses', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'createSiteExpense',
      summary: 'Create a draft Site Expense',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      body: CREATE_SITE_EXPENSE_BODY_JSON_SCHEMA,
      response: { 201: SITE_EXPENSE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createSiteExpenseBodySchema, request.body, 'body');
    const data = siteExpenseResponseSchema.parse(await service.createSiteExpense(body, readIdempotencyKey(request)));
    return reply.code(201).send({ data });
  });

  app.get('/api/v1/site-expenses/:id', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'getSiteExpense',
      summary: 'Read one Site Expense',
      security: BEARER_SECURITY,
      params: SITE_EXPENSE_PARAMS_JSON_SCHEMA,
      response: { 200: SITE_EXPENSE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(siteExpenseIdParamsSchema, request.params, 'params');
    const data = siteExpenseResponseSchema.parse(await service.getSiteExpense(params.id));
    return reply.send({ data });
  });

  app.patch('/api/v1/site-expenses/:id', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'updateSiteExpense',
      summary: 'Edit one draft Site Expense',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SITE_EXPENSE_PARAMS_JSON_SCHEMA,
      body: UPDATE_SITE_EXPENSE_BODY_JSON_SCHEMA,
      response: { 200: SITE_EXPENSE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(siteExpenseIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateSiteExpenseBodySchema, request.body, 'body');
    const data = siteExpenseResponseSchema.parse(await service.updateSiteExpense(params.id, body, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/site-expenses/:id/post', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'postSiteExpense',
      summary: 'Post Site Expense to Finance and Project Cost',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SITE_EXPENSE_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 200: SITE_EXPENSE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(siteExpenseIdParamsSchema, request.params, 'params');
    parseRequest(postSiteExpenseBodySchema, request.body ?? {}, 'body');
    const data = siteExpenseResponseSchema.parse(await service.postSiteExpense(params.id, readIdempotencyKey(request)));
    return reply.send({ data });
  });

  app.post('/api/v1/site-expenses/:id/reverse', {
    schema: {
      tags: ['Site Expenses'],
      operationId: 'reverseSiteExpense',
      summary: 'Reverse one posted Site Expense with compensating entries',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA,
      params: SITE_EXPENSE_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 200: SITE_EXPENSE_SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(siteExpenseIdParamsSchema, request.params, 'params');
    parseRequest(reverseSiteExpenseBodySchema, request.body ?? {}, 'body');
    const data = siteExpenseResponseSchema.parse(await service.reverseSiteExpense(params.id, readIdempotencyKey(request)));
    return reply.send({ data });
  });
}
