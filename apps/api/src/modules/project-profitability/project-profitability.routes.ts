import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  PROJECT_PROFITABILITY_ERROR_CODES,
  PROJECT_PROFITABILITY_MAX_PAGE_SIZE,
  PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES,
  projectProfitabilityAsOfQuerySchema,
  projectProfitabilityPortfolioQuerySchema,
  projectProfitabilityPortfolioResponseSchema,
  projectProfitabilityProjectParamsSchema,
  projectProfitabilityStagesResponseSchema,
  projectProfitabilitySummaryResponseSchema,
  projectProfitabilityTrendQuerySchema,
  projectProfitabilityTrendResponseSchema
} from './project-profitability.schema.js';
import { ProjectProfitabilityService } from './project-profitability.service.js';

export type ProjectProfitabilityRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID = { type: 'string', format: 'uuid' } as const;
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const CURRENCY = { type: 'string', pattern: '^[A-Z]{3}$' } as const;
const MONEY = { type: 'string', pattern: '^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const NON_NEGATIVE_MONEY = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const PERCENT = { type: 'string', pattern: '^(?:0|[1-9]\\d?|100)(?:\\.\\d{1,4})?$' } as const;
const NULLABLE_MONEY = { anyOf: [NON_NEGATIVE_MONEY, { type: 'null' }] } as const;
const PROJECT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: UUID }
} as const;
const AS_OF_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: { asOfDate: DATE }
} as const;
const TREND_QUERY = {
  type: 'object',
  additionalProperties: false,
  required: ['fromDate', 'toDate', 'granularity'],
  properties: {
    fromDate: DATE,
    toDate: DATE,
    granularity: { type: 'string', enum: [...PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES] }
  }
} as const;
const PORTFOLIO_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    asOfDate: DATE,
    search: { type: 'string', minLength: 1, maxLength: 200 },
    clientId: UUID,
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: PROJECT_PROFITABILITY_MAX_PAGE_SIZE }
  }
} as const;
const FINANCIAL_VALUES = {
  recognizedRevenue: MONEY,
  actualCost: MONEY,
  profitAmount: MONEY,
  billedAmount: NON_NEGATIVE_MONEY,
  receivedAmount: NON_NEGATIVE_MONEY,
  allocatedAmount: NON_NEGATIVE_MONEY,
  advanceAmount: NON_NEGATIVE_MONEY,
  outstandingAmount: NON_NEGATIVE_MONEY,
  supplierPayableAmount: NON_NEGATIVE_MONEY
} as const;
const FINANCIAL_VALUE_NAMES = Object.freeze(Object.keys(FINANCIAL_VALUES));
const PROJECT_SUMMARY = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'projectCode', 'projectName', 'currency', 'asOfDate', ...FINANCIAL_VALUE_NAMES],
  properties: {
    projectId: UUID,
    projectCode: { type: 'string', minLength: 1, maxLength: 100 },
    projectName: { type: 'string', minLength: 1, maxLength: 300 },
    currency: CURRENCY,
    asOfDate: DATE,
    ...FINANCIAL_VALUES
  }
} as const;
const STAGE_ROW = {
  type: 'object',
  additionalProperties: false,
  required: [
    'stageId', 'stageCode', 'stageName', 'sequenceNo', 'weightPercent',
    'physicalProgressPercent', 'plannedAmount', ...FINANCIAL_VALUE_NAMES
  ],
  properties: {
    stageId: UUID,
    stageCode: { type: 'string', minLength: 1, maxLength: 100 },
    stageName: { type: 'string', minLength: 1, maxLength: 300 },
    sequenceNo: { type: 'integer', minimum: 1 },
    weightPercent: PERCENT,
    physicalProgressPercent: PERCENT,
    plannedAmount: NULLABLE_MONEY,
    ...FINANCIAL_VALUES
  }
} as const;
const FINANCIAL_VALUES_OBJECT = {
  type: 'object',
  additionalProperties: false,
  required: FINANCIAL_VALUE_NAMES,
  properties: FINANCIAL_VALUES
} as const;
const STAGES_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'currency', 'asOfDate', 'stages', 'projectOnly', 'projectTotal'],
  properties: {
    projectId: UUID,
    currency: CURRENCY,
    asOfDate: DATE,
    stages: { type: 'array', items: STAGE_ROW },
    projectOnly: FINANCIAL_VALUES_OBJECT,
    projectTotal: FINANCIAL_VALUES_OBJECT
  }
} as const;
const TREND_POINT = {
  type: 'object',
  additionalProperties: false,
  required: ['periodStart', 'periodEnd', 'recognizedRevenue', 'actualCost', 'profitAmount'],
  properties: {
    periodStart: DATE,
    periodEnd: DATE,
    recognizedRevenue: MONEY,
    actualCost: MONEY,
    profitAmount: MONEY
  }
} as const;
const TREND_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'currency', 'fromDate', 'toDate', 'granularity', 'points'],
  properties: {
    projectId: UUID,
    currency: CURRENCY,
    fromDate: DATE,
    toDate: DATE,
    granularity: { type: 'string', enum: [...PROJECT_PROFITABILITY_TREND_GRANULARITY_VALUES] },
    points: { type: 'array', items: TREND_POINT }
  }
} as const;
const PORTFOLIO_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'projectCode', 'projectName', 'clientId', 'currency', ...FINANCIAL_VALUE_NAMES],
  properties: {
    projectId: UUID,
    projectCode: { type: 'string', minLength: 1, maxLength: 100 },
    projectName: { type: 'string', minLength: 1, maxLength: 300 },
    clientId: UUID,
    currency: CURRENCY,
    ...FINANCIAL_VALUES
  }
} as const;
const PORTFOLIO_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['asOfDate', 'items', 'total', 'page', 'pageSize'],
  properties: {
    asOfDate: DATE,
    items: { type: 'array', items: PORTFOLIO_ITEM },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: PROJECT_PROFITABILITY_MAX_PAGE_SIZE }
  }
} as const;
const ERROR_DESCRIPTION = `Stable Project Profitability business codes: ${PROJECT_PROFITABILITY_ERROR_CODES.join(', ')}. Foundation authentication and infrastructure errors keep their own stable codes.`;
const ERROR = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string', description: ERROR_DESCRIPTION },
        message: { type: 'string' },
        requestId: { type: 'string' },
        fieldErrors: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['field', 'message'],
            properties: {
              field: { type: 'string' },
              message: { type: 'string' },
              code: { type: 'string' }
            }
          }
        }
      }
    }
  }
} as const;
const COMMON_RESPONSES = { 400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR } as const;

/** Wrap one documented Project Profitability response in the standard success envelope. */
function dataEnvelope(dataSchema: unknown) {
  return { type: 'object', additionalProperties: false, required: ['data'], properties: { data: dataSchema } } as const;
}

/** Parse one Project Profitability HTTP boundary and keep invalid filters on the stable Module 19 code. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError({
    code: 'INVALID_PROFITABILITY_FILTER',
    message: 'The Project Profitability filter is invalid.',
    fieldErrors: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || location,
      message: issue.message
    }))
  });
}

/** Build a pre-validation hook so Zod rejects unknown input before Fastify can normalize the documented JSON schema. */
function validateBoundary<T extends z.ZodTypeAny>(
  schema: T,
  readValue: (request: FastifyRequest) => unknown,
  location: string
) {
  return async (request: FastifyRequest): Promise<void> => {
    parseRequest(schema, readValue(request), location);
  };
}

/** Register exactly the four read-only Final-21 Project Profitability routes with RBAC-safe OpenAPI contracts. */
export async function registerProjectProfitabilityRoutes(
  app: FastifyInstance,
  options: ProjectProfitabilityRoutesOptions
): Promise<void> {
  const service = new ProjectProfitabilityService(options.database);

  /** Authenticate one Project Profitability request before boundary and service-level scope checks. */
  const authenticate = async (request: FastifyRequest): Promise<void> => authenticateRequest(request, options.database);
  const validateProjectParams = validateBoundary(projectProfitabilityProjectParamsSchema, (request) => request.params, 'params');
  const validateAsOfQuery = validateBoundary(projectProfitabilityAsOfQuerySchema, (request) => request.query, 'query');
  const validateTrendQuery = validateBoundary(projectProfitabilityTrendQuerySchema, (request) => request.query, 'query');
  const validatePortfolioQuery = validateBoundary(projectProfitabilityPortfolioQuerySchema, (request) => request.query, 'query');

  app.get('/api/v1/project-profitability/projects/:projectId', {
    preValidation: [authenticate, validateProjectParams, validateAsOfQuery],
    schema: {
      tags: ['Project Profitability'],
      operationId: 'getProjectProfitabilitySummary',
      summary: 'Read Project profitability and financial position',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS,
      querystring: AS_OF_QUERY,
      response: { 200: dataEnvelope(PROJECT_SUMMARY), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const { projectId } = parseRequest(projectProfitabilityProjectParamsSchema, request.params, 'params');
    const query = parseRequest(projectProfitabilityAsOfQuerySchema, request.query, 'query');
    return { data: projectProfitabilitySummaryResponseSchema.parse(await service.getProjectSummary(projectId, query)) };
  });

  app.get('/api/v1/project-profitability/projects/:projectId/stages', {
    preValidation: [authenticate, validateProjectParams, validateAsOfQuery],
    schema: {
      tags: ['Project Profitability'],
      operationId: 'getProjectProfitabilityStages',
      summary: 'Read Stage profitability with Project-only reconciliation',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS,
      querystring: AS_OF_QUERY,
      response: { 200: dataEnvelope(STAGES_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const { projectId } = parseRequest(projectProfitabilityProjectParamsSchema, request.params, 'params');
    const query = parseRequest(projectProfitabilityAsOfQuerySchema, request.query, 'query');
    return { data: projectProfitabilityStagesResponseSchema.parse(await service.getProjectStages(projectId, query)) };
  });

  app.get('/api/v1/project-profitability/projects/:projectId/trend', {
    preValidation: [authenticate, validateProjectParams, validateTrendQuery],
    schema: {
      tags: ['Project Profitability'],
      operationId: 'getProjectProfitabilityTrend',
      summary: 'Read bounded Project revenue, cost and profit trend',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS,
      querystring: TREND_QUERY,
      response: { 200: dataEnvelope(TREND_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const { projectId } = parseRequest(projectProfitabilityProjectParamsSchema, request.params, 'params');
    const query = parseRequest(projectProfitabilityTrendQuerySchema, request.query, 'query');
    return { data: projectProfitabilityTrendResponseSchema.parse(await service.getProjectTrend(projectId, query)) };
  });

  app.get('/api/v1/project-profitability/portfolio', {
    preValidation: [authenticate, validatePortfolioQuery],
    schema: {
      tags: ['Project Profitability'],
      operationId: 'getProjectProfitabilityPortfolio',
      summary: 'Read bounded permission-scoped Project profitability portfolio',
      security: BEARER_SECURITY,
      querystring: PORTFOLIO_QUERY,
      response: { 200: dataEnvelope(PORTFOLIO_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(projectProfitabilityPortfolioQuerySchema, request.query, 'query');
    return { data: projectProfitabilityPortfolioResponseSchema.parse(await service.getPortfolio(query)) };
  });
}
