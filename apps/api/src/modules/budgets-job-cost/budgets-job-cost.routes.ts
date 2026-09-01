import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createBudgetBodySchema,
  createBudgetResponseSchema,
  freezeBudgetBodySchema,
  freezeBudgetResponseSchema,
  getCurrentBudgetQuerySchema,
  getCurrentBudgetResponseSchema,
  getJobCostLedgerQuerySchema,
  getJobCostQuerySchema,
  jobCostLedgerResponseSchema,
  jobCostSummaryResponseSchema,
  module9BudgetParamsSchema,
  module9ProjectParamsSchema,
  replaceBudgetLinesBodySchema,
  replaceBudgetLinesResponseSchema,
  updateForecastBodySchema,
  updateForecastResponseSchema,
  type CreateBudgetResponse,
  type FreezeBudgetResponse,
  type GetCurrentBudgetResponse,
  type JobCostLedgerResponse,
  type JobCostSummaryResponse,
  type ReplaceBudgetLinesResponse,
  type UpdateForecastResponse
} from './budgets-job-cost.schema.js';
import { BudgetsJobCostService } from './budgets-job-cost.service.js';

export type BudgetsJobCostRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_JSON_SCHEMA = { type: 'string', format: 'date' } as const;
const TIMESTAMP_JSON_SCHEMA = { type: 'string', format: 'date-time' } as const;
const MONEY_JSON_SCHEMA = { type: 'string', pattern: '^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const PROJECT_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: UUID_JSON_SCHEMA }
} as const;
const BUDGET_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'id'],
  properties: { projectId: UUID_JSON_SCHEMA, id: UUID_JSON_SCHEMA }
} as const;
const COST_CATEGORY_JSON_SCHEMA = {
  type: 'string',
  enum: ['material', 'labour', 'security', 'equipment', 'subcontract', 'site_expense', 'other']
} as const;
const BUDGET_LINE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'stageId', 'category', 'description', 'plannedAmount'],
  properties: {
    id: UUID_JSON_SCHEMA,
    stageId: { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] },
    category: COST_CATEGORY_JSON_SCHEMA,
    description: { type: 'string', minLength: 1, maxLength: 500 },
    plannedAmount: MONEY_JSON_SCHEMA
  }
} as const;
const PROJECT_BUDGET_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'versionNo', 'status', 'currency', 'totalAmount', 'createdBy', 'frozenAt', 'lines'],
  properties: {
    id: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    versionNo: { type: 'integer', minimum: 1 },
    status: { type: 'string', minLength: 1, maxLength: 32 },
    currency: { type: 'string', minLength: 3, maxLength: 3 },
    totalAmount: MONEY_JSON_SCHEMA,
    createdBy: UUID_JSON_SCHEMA,
    frozenAt: { anyOf: [TIMESTAMP_JSON_SCHEMA, { type: 'null' }] },
    lines: { type: 'array', items: BUDGET_LINE_JSON_SCHEMA }
  }
} as const;
const FORECAST_LINE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'stageId', 'category', 'forecastAmount', 'updatedBy', 'updatedAt'],
  properties: {
    id: UUID_JSON_SCHEMA,
    projectId: UUID_JSON_SCHEMA,
    stageId: { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] },
    category: COST_CATEGORY_JSON_SCHEMA,
    forecastAmount: MONEY_JSON_SCHEMA,
    updatedBy: UUID_JSON_SCHEMA,
    updatedAt: TIMESTAMP_JSON_SCHEMA
  }
} as const;
const JOB_COST_TOTALS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['budgetCost', 'committedCost', 'actualCost', 'forecastCost', 'variance'],
  properties: {
    budgetCost: MONEY_JSON_SCHEMA,
    committedCost: MONEY_JSON_SCHEMA,
    actualCost: MONEY_JSON_SCHEMA,
    forecastCost: MONEY_JSON_SCHEMA,
    variance: MONEY_JSON_SCHEMA
  }
} as const;
const LEDGER_ENTRY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'recordType', 'stageId', 'category', 'sourceType', 'sourceId', 'sourceKey', 'postingDate', 'amount', 'status'],
  properties: {
    id: UUID_JSON_SCHEMA,
    recordType: { type: 'string', enum: ['COMMITMENT', 'ACTUAL'] },
    stageId: { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] },
    category: COST_CATEGORY_JSON_SCHEMA,
    sourceType: { type: 'string', minLength: 1, maxLength: 100 },
    sourceId: { type: 'string', minLength: 1, maxLength: 700 },
    sourceKey: { type: 'string', minLength: 1, maxLength: 700 },
    postingDate: DATE_JSON_SCHEMA,
    amount: MONEY_JSON_SCHEMA,
    status: { anyOf: [{ type: 'string', minLength: 1, maxLength: 32 }, { type: 'null' }] }
  }
} as const;
const BUDGET_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: PROJECT_BUDGET_JSON_SCHEMA }
} as const;
const JOB_COST_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'currentBudget', 'totals', 'forecasts'],
      properties: {
        projectId: UUID_JSON_SCHEMA,
        currentBudget: { anyOf: [PROJECT_BUDGET_JSON_SCHEMA, { type: 'null' }] },
        totals: JOB_COST_TOTALS_JSON_SCHEMA,
        forecasts: { type: 'array', items: FORECAST_LINE_JSON_SCHEMA }
      }
    }
  }
} as const;
const FORECAST_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'forecasts'],
      properties: {
        projectId: UUID_JSON_SCHEMA,
        forecasts: { type: 'array', items: FORECAST_LINE_JSON_SCHEMA }
      }
    }
  }
} as const;
const LEDGER_SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['projectId', 'items', 'total', 'page', 'pageSize'],
      properties: {
        projectId: UUID_JSON_SCHEMA,
        items: { type: 'array', items: LEDGER_ENTRY_JSON_SCHEMA },
        total: { type: 'integer', minimum: 0 },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 }
      }
    }
  }
} as const;

/** Build one public error envelope schema using only stable shared/module codes. */
function errorResponseSchema(codes: readonly string[]) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message', 'requestId'],
        properties: {
          code: { type: 'string', enum: [...codes] },
          message: { type: 'string' },
          requestId: { type: 'string' },
          fieldErrors: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['field', 'message'],
              properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } }
            }
          }
        }
      }
    }
  } as const;
}

const INVALID_REQUEST_RESPONSE = errorResponseSchema(['INVALID_REQUEST']);
const AUTHENTICATION_RESPONSE = errorResponseSchema(['AUTHENTICATION_REQUIRED', 'AUTH_SESSION_EXPIRED']);
const AUTHORIZATION_RESPONSE = errorResponseSchema(['FORBIDDEN']);
const RESOURCE_NOT_FOUND_RESPONSE = errorResponseSchema(['RESOURCE_NOT_FOUND']);
const BUDGET_NOT_FOUND_RESPONSE = errorResponseSchema(['BUDGET_NOT_FOUND', 'RESOURCE_NOT_FOUND']);
const BUDGET_CONFLICT_RESPONSE = errorResponseSchema(['BUDGET_LOCKED', 'INVALID_COST_STAGE']);
const FORECAST_CONFLICT_RESPONSE = errorResponseSchema(['INVALID_COST_STAGE']);
const INTERNAL_ERROR_RESPONSE = errorResponseSchema(['INTERNAL_SERVER_ERROR']);

/** Parse one Module 9 request segment with Zod and the shared validation envelope. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'params' | 'query'): z.infer<T> {
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


/** Read the required idempotency key for Module 9 write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key header is required.',
      fieldErrors: [{ field: 'headers.idempotency-key', message: 'Idempotency-Key is required and must be at most 200 characters.' }]
    });
  }
  return value;
}

/** Validate one Project-budget DTO before it leaves the API boundary. */
function serializeBudget(value: unknown): GetCurrentBudgetResponse {
  return getCurrentBudgetResponseSchema.parse(value);
}

/** Validate one Project job-cost summary DTO before it leaves the API boundary. */
function serializeJobCost(value: unknown): JobCostSummaryResponse {
  return jobCostSummaryResponseSchema.parse(value);
}

/** Validate one forecast update DTO before it leaves the API boundary. */
function serializeForecast(value: unknown): UpdateForecastResponse {
  return updateForecastResponseSchema.parse(value);
}

/** Validate one read-only detailed ledger DTO before it leaves the API boundary. */
function serializeLedger(value: unknown): JobCostLedgerResponse {
  return jobCostLedgerResponseSchema.parse(value);
}

/** Register exactly the seven Final Module 9 Project Budget & Cost Tracking routes. */
export async function registerBudgetsJobCostRoutes(app: FastifyInstance, options: BudgetsJobCostRoutesOptions): Promise<void> {
  const service = new BudgetsJobCostService(options.database);

  app.get('/api/v1/projects/:projectId/budgets/current', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9GetCurrentBudget',
      summary: 'Get the current Project budget version', security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA, querystring: { type: 'object', additionalProperties: false },
      response: { 200: BUDGET_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: BUDGET_NOT_FOUND_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9ProjectParamsSchema, request.params, 'params');
    parseRequest(getCurrentBudgetQuerySchema, request.query, 'query');
    return reply.send({ data: serializeBudget(await service.getCurrentBudget(params.projectId)) });
  });

  app.post('/api/v1/projects/:projectId/budgets', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9CreateBudget',
      summary: 'Create the next Project budget version', security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 201: BUDGET_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: RESOURCE_NOT_FOUND_RESPONSE, 409: BUDGET_CONFLICT_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9ProjectParamsSchema, request.params, 'params');
    const body = parseRequest(createBudgetBodySchema, request.body ?? {}, 'body');
    const result: CreateBudgetResponse = createBudgetResponseSchema.parse(await service.createBudget(params.projectId, body, readIdempotencyKey(request)));
    return reply.status(201).send({ data: result });
  });

  app.put('/api/v1/projects/:projectId/budgets/:id/lines', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9ReplaceBudgetLines',
      summary: 'Replace one draft Project budget line set', security: BEARER_SECURITY,
      params: BUDGET_PARAMS_JSON_SCHEMA,
      body: {
        type: 'object', additionalProperties: false, required: ['lines'],
        properties: {
          lines: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['category', 'description', 'plannedAmount'],
              properties: {
                stageId: { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] }, category: COST_CATEGORY_JSON_SCHEMA,
                description: { type: 'string', minLength: 1, maxLength: 500 }, plannedAmount: MONEY_JSON_SCHEMA
              }
            }
          }
        }
      },
      response: { 200: BUDGET_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: BUDGET_NOT_FOUND_RESPONSE, 409: BUDGET_CONFLICT_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9BudgetParamsSchema, request.params, 'params');
    const body = parseRequest(replaceBudgetLinesBodySchema, request.body, 'body');
    const result: ReplaceBudgetLinesResponse = replaceBudgetLinesResponseSchema.parse(await service.replaceBudgetLines(params.projectId, params.id, body, readIdempotencyKey(request)));
    return reply.send({ data: result });
  });

  app.post('/api/v1/projects/:projectId/budgets/:id/freeze', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9FreezeBudget',
      summary: 'Freeze one validated Project budget version', security: BEARER_SECURITY,
      params: BUDGET_PARAMS_JSON_SCHEMA,
      body: { type: 'object', additionalProperties: false, properties: {} },
      response: { 200: BUDGET_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: BUDGET_NOT_FOUND_RESPONSE, 409: BUDGET_CONFLICT_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9BudgetParamsSchema, request.params, 'params');
    parseRequest(freezeBudgetBodySchema, request.body ?? {}, 'body');
    const result: FreezeBudgetResponse = freezeBudgetResponseSchema.parse(await service.freezeBudget(params.projectId, params.id, readIdempotencyKey(request)));
    return reply.send({ data: result });
  });

  app.get('/api/v1/projects/:projectId/job-cost', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9GetJobCost',
      summary: 'Get Project budget, commitment, actual and forecast totals', security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA, querystring: { type: 'object', additionalProperties: false },
      response: { 200: JOB_COST_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: RESOURCE_NOT_FOUND_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9ProjectParamsSchema, request.params, 'params');
    parseRequest(getJobCostQuerySchema, request.query, 'query');
    return reply.send({ data: serializeJobCost(await service.getJobCost(params.projectId)) });
  });

  app.get('/api/v1/projects/:projectId/job-cost/ledger', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9GetJobCostLedger',
      summary: 'Get the bounded source-traceable Project cost ledger', security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      querystring: { type: 'object', additionalProperties: false, properties: { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } },
      response: { 200: LEDGER_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: RESOURCE_NOT_FOUND_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9ProjectParamsSchema, request.params, 'params');
    const query = parseRequest(getJobCostLedgerQuerySchema, request.query, 'query');
    return reply.send({ data: serializeLedger(await service.getJobCostLedger(params.projectId, query)) });
  });

  app.put('/api/v1/projects/:projectId/forecast', {
    schema: {
      tags: ['Module 9 - Project Budget & Cost Tracking'], operationId: 'module9UpdateForecast',
      summary: 'Replace the current Project/Stage/category forecast', security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      body: {
        type: 'object', additionalProperties: false, required: ['lines'],
        properties: {
          lines: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['category', 'forecastAmount'],
              properties: { stageId: { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] }, category: COST_CATEGORY_JSON_SCHEMA, forecastAmount: MONEY_JSON_SCHEMA }
            }
          }
        }
      },
      response: { 200: FORECAST_SUCCESS_JSON_SCHEMA, 400: INVALID_REQUEST_RESPONSE, 401: AUTHENTICATION_RESPONSE, 403: AUTHORIZATION_RESPONSE, 404: RESOURCE_NOT_FOUND_RESPONSE, 409: FORECAST_CONFLICT_RESPONSE, 500: INTERNAL_ERROR_RESPONSE }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(module9ProjectParamsSchema, request.params, 'params');
    const body = parseRequest(updateForecastBodySchema, request.body, 'body');
    return reply.send({ data: serializeForecast(await service.updateForecast(params.projectId, body, readIdempotencyKey(request))) });
  });
}
