import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  DASHBOARD_API_BASE,
  DASHBOARD_ERROR_CODES,
  DASHBOARD_MAX_PAGE_SIZE,
  DASHBOARD_WIDGET_CODES,
  dashboardAlertsQuerySchema,
  dashboardProjectParamsSchema,
  dashboardProjectQuerySchema,
  dashboardProjectsQuerySchema,
  dashboardSummaryQuerySchema,
  updateDashboardPreferencesBodySchema,
  type DashboardRouteDefinition
} from './dashboard.schema.js';
import { DashboardService } from './dashboard.service.js';

/** Runtime dependency required by the Dashboard HTTP module. */
export type DashboardRoutesOptions = Readonly<{ database: DatabaseClient }>;

/** Exact Final-21 Module 1 HTTP surface frozen by pass B1.1. */
export const DASHBOARD_HTTP_ROUTES = Object.freeze([
  { method: 'GET', path: `${DASHBOARD_API_BASE}/summary`, purpose: 'Company KPI summary' },
  { method: 'GET', path: `${DASHBOARD_API_BASE}/projects`, purpose: 'Project portfolio and overall progress' },
  { method: 'GET', path: `${DASHBOARD_API_BASE}/projects/:projectId`, purpose: 'Single-project financial and physical dashboard' },
  { method: 'GET', path: `${DASHBOARD_API_BASE}/alerts`, purpose: 'Permission-filtered alerts' },
  { method: 'PATCH', path: `${DASHBOARD_API_BASE}/preferences`, purpose: 'Save user layout and filter preferences' }
] satisfies readonly DashboardRouteDefinition[]);

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID = { type: 'string', format: 'uuid' } as const;
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const DATETIME = { type: 'string', format: 'date-time' } as const;
const NULLABLE_UUID = { anyOf: [UUID, { type: 'null' }] } as const;
const NULLABLE_DATE = { anyOf: [DATE, { type: 'null' }] } as const;
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const WIDGET_CODE = { type: 'string', enum: [...DASHBOARD_WIDGET_CODES] } as const;
const WIDGET_CODES = {
  type: 'array',
  items: WIDGET_CODE,
  maxItems: DASHBOARD_WIDGET_CODES.length
} as const;
const DATE_FILTER_PROPERTIES = {
  fromDate: DATE,
  toDate: DATE,
  asOfDate: DATE
} as const;
const PAGINATION_PROPERTIES = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: DASHBOARD_MAX_PAGE_SIZE }
} as const;
const SUMMARY_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: UUID,
    widgetCodes: WIDGET_CODES,
    ...DATE_FILTER_PROPERTIES
  }
} as const;
const PROJECTS_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    search: { type: 'string', minLength: 1, maxLength: 200 },
    status: { type: 'string', minLength: 1, maxLength: 80 },
    ...DATE_FILTER_PROPERTIES,
    ...PAGINATION_PROPERTIES
  }
} as const;
const PROJECT_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: UUID }
} as const;
const PROJECT_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    widgetCodes: WIDGET_CODES,
    ...DATE_FILTER_PROPERTIES
  }
} as const;
const ALERTS_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: UUID,
    ...DATE_FILTER_PROPERTIES,
    ...PAGINATION_PROPERTIES
  }
} as const;
const PREFERENCE_FILTERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: UUID,
    ...DATE_FILTER_PROPERTIES
  }
} as const;
const PREFERENCES_BODY = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: {
    widgetCodes: { ...WIDGET_CODES, minItems: 1 },
    defaultProjectId: NULLABLE_UUID,
    defaultFilters: PREFERENCE_FILTERS
  }
} as const;
const PROJECT = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectCode', 'name', 'clientId', 'status', 'currency', 'startDate', 'plannedEndDate', 'client'],
  properties: {
    id: UUID,
    projectCode: { type: 'string' },
    name: { type: 'string' },
    clientId: UUID,
    status: { type: 'string' },
    currency: { type: 'string' },
    startDate: DATETIME,
    plannedEndDate: DATETIME,
    client: {
      type: 'object',
      additionalProperties: false,
      required: ['displayName'],
      properties: { displayName: { type: 'string' } }
    }
  }
} as const;
const PROJECT_PORTFOLIO_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: [...PROJECT.required, 'overallPhysicalProgressPercent', 'stageCount', 'stageBaselineStatus'],
  properties: {
    ...PROJECT.properties,
    overallPhysicalProgressPercent: NULLABLE_STRING,
    stageCount: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
    stageBaselineStatus: NULLABLE_STRING
  }
} as const;
const PROJECTS_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: PROJECT_PORTFOLIO_ITEM },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: DASHBOARD_MAX_PAGE_SIZE }
  }
} as const;
const PREFERENCE_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['updatedAt'],
  properties: {
    widgetCodes: WIDGET_CODES,
    defaultProjectId: NULLABLE_UUID,
    defaultFilters: PREFERENCE_FILTERS,
    updatedAt: DATETIME
  }
} as const;
const ALERT = {
  type: 'object',
  additionalProperties: false,
  required: [
    'code', 'severity', 'sourceModule', 'projectId', 'projectCode', 'projectName',
    'stageId', 'title', 'dueDate', 'value', 'currency'
  ],
  properties: {
    code: { type: 'string', enum: ['PROJECT_OVERDUE', 'STAGE_OVERDUE', 'BUDGET_OVERRUN', 'PROJECT_LOSS'] },
    severity: { type: 'string', enum: ['WARNING', 'CRITICAL'] },
    sourceModule: { type: 'string', enum: ['projects', 'project-stages', 'budgets-job-cost', 'project-profitability'] },
    projectId: UUID,
    projectCode: { type: 'string' },
    projectName: { type: 'string' },
    stageId: NULLABLE_UUID,
    title: { type: 'string' },
    dueDate: NULLABLE_DATE,
    value: NULLABLE_STRING,
    currency: NULLABLE_STRING
  }
} as const;
const ALERTS_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'alertCount', 'asOfDate', 'page', 'pageSize', 'scannedProjectCount', 'projectTotal'],
  properties: {
    items: { type: 'array', items: ALERT },
    alertCount: { type: 'integer', minimum: 0 },
    asOfDate: DATE,
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: DASHBOARD_MAX_PAGE_SIZE },
    scannedProjectCount: { type: 'integer', minimum: 0 },
    projectTotal: { type: 'integer', minimum: 0 }
  }
} as const;
const DASHBOARD_READ_MODEL = { type: 'object', additionalProperties: true } as const;
const ERROR_DESCRIPTION = `Stable Dashboard business codes: ${DASHBOARD_ERROR_CODES.join(', ')}. Foundation authentication and source-module errors keep their own stable codes.`;
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

/** Wrap one documented Dashboard response in the standard success envelope. */
function dataEnvelope(dataSchema: unknown) {
  return { type: 'object', additionalProperties: false, required: ['data'], properties: { data: dataSchema } } as const;
}

/** Parse one Dashboard HTTP boundary with the authoritative Zod schema and stable error code. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError({
    code: 'INVALID_DASHBOARD_FILTER',
    message: 'The Dashboard filter is invalid or unsupported.',
    fieldErrors: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || location,
      message: issue.message
    }))
  });
}

/** Build a reusable Zod boundary hook for one Dashboard path, query, or body value. */
function validateBoundary<T extends z.ZodTypeAny>(
  schema: T,
  readValue: (request: FastifyRequest) => unknown,
  location: string
) {
  return async (request: FastifyRequest): Promise<void> => {
    parseRequest(schema, readValue(request), location);
  };
}

/** Register exactly the five Final-21 Dashboard routes with authentication, Zod boundaries, and OpenAPI contracts. */
export async function registerDashboardRoutes(app: FastifyInstance, options: DashboardRoutesOptions): Promise<void> {
  const service = new DashboardService(options.database);

  /** Authenticate one Dashboard request before service-level permission and Project-scope checks. */
  const authenticate = async (request: FastifyRequest): Promise<void> => authenticateRequest(request, options.database);
  const validateSummaryQuery = validateBoundary(dashboardSummaryQuerySchema, (request) => request.query, 'query');
  const validateProjectsQuery = validateBoundary(dashboardProjectsQuerySchema, (request) => request.query, 'query');
  const validateProjectParams = validateBoundary(dashboardProjectParamsSchema, (request) => request.params, 'params');
  const validateProjectQuery = validateBoundary(dashboardProjectQuerySchema, (request) => request.query, 'query');
  const validateAlertsQuery = validateBoundary(dashboardAlertsQuerySchema, (request) => request.query, 'query');
  const validatePreferencesBody = validateBoundary(updateDashboardPreferencesBodySchema, (request) => request.body, 'body');

  app.get(`${DASHBOARD_API_BASE}/summary`, {
    preValidation: [authenticate, validateSummaryQuery],
    schema: {
      tags: ['Dashboard'],
      operationId: 'getDashboardSummary',
      summary: 'Read the permission-filtered Company or Project Dashboard summary',
      security: BEARER_SECURITY,
      querystring: SUMMARY_QUERY,
      response: { 200: dataEnvelope(DASHBOARD_READ_MODEL), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(dashboardSummaryQuerySchema, request.query, 'query');
    return { data: await service.getSummary(query) };
  });

  app.get(`${DASHBOARD_API_BASE}/projects`, {
    preValidation: [authenticate, validateProjectsQuery],
    schema: {
      tags: ['Dashboard'],
      operationId: 'listDashboardProjects',
      summary: 'Read the bounded Project portfolio with weighted physical progress',
      security: BEARER_SECURITY,
      querystring: PROJECTS_QUERY,
      response: { 200: dataEnvelope(PROJECTS_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(dashboardProjectsQuerySchema, request.query, 'query');
    return { data: await service.getProjects(query) };
  });

  app.get(`${DASHBOARD_API_BASE}/projects/:projectId`, {
    preValidation: [authenticate, validateProjectParams, validateProjectQuery],
    schema: {
      tags: ['Dashboard'],
      operationId: 'getProjectDashboard',
      summary: 'Read one Project financial and physical Dashboard',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS,
      querystring: PROJECT_QUERY,
      response: { 200: dataEnvelope(DASHBOARD_READ_MODEL), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const { projectId } = parseRequest(dashboardProjectParamsSchema, request.params, 'params');
    const query = parseRequest(dashboardProjectQuerySchema, request.query, 'query');
    return { data: await service.getProjectDashboard(projectId, query) };
  });

  app.get(`${DASHBOARD_API_BASE}/alerts`, {
    preValidation: [authenticate, validateAlertsQuery],
    schema: {
      tags: ['Dashboard'],
      operationId: 'listDashboardAlerts',
      summary: 'Read bounded permission-filtered source-module alerts',
      security: BEARER_SECURITY,
      querystring: ALERTS_QUERY,
      response: { 200: dataEnvelope(ALERTS_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(dashboardAlertsQuerySchema, request.query, 'query');
    return { data: await service.getAlerts(query) };
  });

  app.patch(`${DASHBOARD_API_BASE}/preferences`, {
    preValidation: [authenticate, validatePreferencesBody],
    schema: {
      tags: ['Dashboard'],
      operationId: 'updateDashboardPreferences',
      summary: 'Save the authenticated user Dashboard presentation preferences',
      security: BEARER_SECURITY,
      body: PREFERENCES_BODY,
      response: { 200: dataEnvelope(PREFERENCE_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const body = parseRequest(updateDashboardPreferencesBodySchema, request.body, 'body');
    return { data: await service.updatePreferences(body) };
  });
}
