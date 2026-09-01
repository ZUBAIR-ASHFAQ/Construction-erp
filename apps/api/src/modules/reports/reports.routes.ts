import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { ObjectStorage } from '@construction-erp/storage';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  REPORT_CODES,
  REPORT_OUTPUT_FORMATS,
  REPORT_RUN_STATUS_VALUES,
  REPORTS_API_BASE,
  REPORTS_ERROR_CODES,
  REPORTS_MAX_PAGE_SIZE,
  createReportExportBodySchema,
  reportCatalogQuerySchema,
  reportCatalogResponseSchema,
  reportDownloadResponseSchema,
  reportRunIdParamsSchema,
  reportRunResponseSchema,
  runReportBodySchema,
  runReportResponseSchema,
  saveReportFilterBodySchema,
  savedReportFilterResponseSchema,
  savedReportFiltersQuerySchema,
  savedReportFiltersResponseSchema,
  type ReportsRouteDefinition
} from './reports.schema.js';
import { ReportsService } from './reports.service.js';

/** Runtime dependencies required by the complete Reports HTTP surface. */
export type ReportsRoutesOptions = Readonly<{
  database: DatabaseClient;
  objectStorage: ObjectStorage;
  signedUrlTtlSeconds: number;
}>;

/** Exact Final-21 Module 20 HTTP surface frozen by pass B20.1. */
export const REPORTS_HTTP_ROUTES = Object.freeze([
  { method: 'GET', path: `${REPORTS_API_BASE}/catalog`, purpose: 'Available reports' },
  { method: 'POST', path: `${REPORTS_API_BASE}/run`, purpose: 'Run bounded report' },
  { method: 'POST', path: `${REPORTS_API_BASE}/exports`, purpose: 'Start export job' },
  { method: 'GET', path: `${REPORTS_API_BASE}/runs/:id`, purpose: 'Export status' },
  { method: 'GET', path: `${REPORTS_API_BASE}/runs/:id/download`, purpose: 'Authorized download' },
  { method: 'GET', path: `${REPORTS_API_BASE}/saved-filters`, purpose: 'Saved filters' },
  { method: 'POST', path: `${REPORTS_API_BASE}/saved-filters`, purpose: 'Save filter' }
] satisfies readonly ReportsRouteDefinition[]);

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID = { type: 'string', format: 'uuid' } as const;
const DATE = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' } as const;
const DATETIME = { type: 'string', format: 'date-time' } as const;
const REPORT_CODE = { type: 'string', enum: [...REPORT_CODES] } as const;
const OUTPUT_FORMAT = { type: 'string', enum: [...REPORT_OUTPUT_FORMATS] } as const;
const RUN_STATUS = { type: 'string', enum: [...REPORT_RUN_STATUS_VALUES] } as const;
const NULLABLE_UUID = { anyOf: [UUID, { type: 'null' }] } as const;
const NULLABLE_DATE = { anyOf: [DATE, { type: 'null' }] } as const;
const NULLABLE_DATETIME = { anyOf: [DATETIME, { type: 'null' }] } as const;
const NULLABLE_STRING = { anyOf: [{ type: 'string' }, { type: 'null' }] } as const;
const PAGE = {
  page: { type: 'integer', minimum: 1 },
  pageSize: { type: 'integer', minimum: 1, maximum: REPORTS_MAX_PAGE_SIZE }
} as const;
const FILTERS = {
  type: 'object',
  additionalProperties: false,
  properties: {
    projectId: UUID,
    stageId: UUID,
    clientId: UUID,
    vendorId: UUID,
    employeeId: UUID,
    warehouseId: UUID,
    materialId: UUID,
    cashBankAccountId: UUID,
    periodId: UUID,
    accountId: UUID,
    fromDate: DATE,
    toDate: DATE,
    asOfDate: DATE,
    status: { type: 'string', minLength: 1, maxLength: 80 },
    search: { type: 'string', minLength: 1, maxLength: 200 },
    ...PAGE
  }
} as const;
const CATALOG_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: {
    search: { type: 'string', minLength: 1, maxLength: 200 },
    domain: { type: 'string', minLength: 1, maxLength: 100 }
  }
} as const;
const RUN_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reportCode'],
  properties: { reportCode: REPORT_CODE, filters: FILTERS }
} as const;
const EXPORT_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reportCode', 'outputFormat'],
  properties: { reportCode: REPORT_CODE, filters: FILTERS, outputFormat: OUTPUT_FORMAT }
} as const;
const RUN_ID_PARAMS = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: UUID }
} as const;
const SAVED_FILTERS_QUERY = {
  type: 'object',
  additionalProperties: false,
  properties: { reportCode: REPORT_CODE }
} as const;
const SAVE_FILTER_BODY = {
  type: 'object',
  additionalProperties: false,
  required: ['reportCode', 'name'],
  properties: {
    reportCode: REPORT_CODE,
    name: { type: 'string', minLength: 1, maxLength: 100 },
    filters: FILTERS
  }
} as const;
const CATALOG_ITEM = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name', 'domain', 'requiredPermissions', 'outputFormats', 'status'],
  properties: {
    code: REPORT_CODE,
    name: { type: 'string' },
    domain: { type: 'string' },
    requiredPermissions: { type: 'array', items: { type: 'string' } },
    outputFormats: { type: 'array', items: OUTPUT_FORMAT },
    status: { type: 'string' }
  }
} as const;
const CATALOG_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', items: CATALOG_ITEM } }
} as const;
const RUN_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['reportCode', 'generatedAt', 'asOfDate', 'rows'],
  properties: {
    reportCode: REPORT_CODE,
    generatedAt: DATETIME,
    asOfDate: NULLABLE_DATE,
    rows: { type: 'array', items: { type: 'object', additionalProperties: true } },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: REPORTS_MAX_PAGE_SIZE }
  }
} as const;
const REPORT_RUN_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'reportCode', 'outputFormat', 'status', 'fileId', 'startedAt', 'finishedAt', 'errorCode'],
  properties: {
    id: UUID,
    reportCode: REPORT_CODE,
    outputFormat: OUTPUT_FORMAT,
    status: RUN_STATUS,
    fileId: NULLABLE_UUID,
    startedAt: NULLABLE_DATETIME,
    finishedAt: NULLABLE_DATETIME,
    errorCode: NULLABLE_STRING
  }
} as const;
const DOWNLOAD_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['url', 'expiresAt'],
  properties: { url: { type: 'string', format: 'uri' }, expiresAt: DATETIME }
} as const;
const SAVED_FILTER = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'reportCode', 'name', 'filters', 'createdAt'],
  properties: { id: UUID, reportCode: REPORT_CODE, name: { type: 'string' }, filters: FILTERS, createdAt: DATETIME }
} as const;
const SAVED_FILTERS_RESPONSE = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: { items: { type: 'array', items: SAVED_FILTER } }
} as const;
const ERROR_DESCRIPTION = `Stable Reports business codes: ${REPORTS_ERROR_CODES.join(', ')}. Foundation authentication and source-module errors keep their own stable codes.`;
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
            properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } }
          }
        }
      }
    }
  }
} as const;
const COMMON_RESPONSES = { 400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR } as const;

/** Wrap one documented response value in the standard API success envelope. */
function dataEnvelope(dataSchema: unknown) {
  return { type: 'object', additionalProperties: false, required: ['data'], properties: { data: dataSchema } } as const;
}

/** Parse one Reports HTTP boundary with the authoritative Zod schema. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new ValidationError({
    code: 'REPORT_FILTER_INVALID',
    message: `Invalid report ${location}.`,
    fieldErrors: parsed.error.issues.map((issue) => ({
      field: issue.path.join('.') || location,
      message: issue.message
    }))
  });
}

/** Register exactly the seven Final-21 Reports routes with authentication, Zod boundaries, and OpenAPI contracts. */
export async function registerReportsRoutes(app: FastifyInstance, options: ReportsRoutesOptions): Promise<void> {
  const service = new ReportsService(options.database);

  /** Authenticate one Reports request against the configured database. */
  const authenticate = async (request: FastifyRequest): Promise<void> => authenticateRequest(request, options.database);

  app.get(`${REPORTS_API_BASE}/catalog`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'listReportCatalog',
      summary: 'List reports available to the authenticated user',
      security: BEARER_SECURITY,
      querystring: CATALOG_QUERY,
      response: { 200: dataEnvelope(CATALOG_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(reportCatalogQuerySchema, request.query, 'query');
    return { data: reportCatalogResponseSchema.parse(await service.listCatalog(query)) };
  });

  app.post(`${REPORTS_API_BASE}/run`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'runReport',
      summary: 'Run one bounded permission-safe report',
      security: BEARER_SECURITY,
      body: RUN_BODY,
      response: { 200: dataEnvelope(RUN_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const body = parseRequest(runReportBodySchema, request.body, 'body');
    return { data: runReportResponseSchema.parse(await service.runReport(body)) };
  });

  app.post(`${REPORTS_API_BASE}/exports`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'createReportExport',
      summary: 'Queue one bounded report export',
      security: BEARER_SECURITY,
      body: EXPORT_BODY,
      response: { 202: dataEnvelope(REPORT_RUN_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    const body = parseRequest(createReportExportBodySchema, request.body, 'body');
    const data = reportRunResponseSchema.parse(await service.createExport(body));
    return reply.code(202).send({ data });
  });

  app.get(`${REPORTS_API_BASE}/runs/:id`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'getReportRun',
      summary: 'Read one user-owned report export status',
      security: BEARER_SECURITY,
      params: RUN_ID_PARAMS,
      response: { 200: dataEnvelope(REPORT_RUN_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const params = parseRequest(reportRunIdParamsSchema, request.params, 'params');
    return { data: reportRunResponseSchema.parse(await service.getReportRun(params.id)) };
  });

  app.get(`${REPORTS_API_BASE}/runs/:id/download`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'downloadReportRun',
      summary: 'Authorize a short-lived download for one completed report export',
      security: BEARER_SECURITY,
      params: RUN_ID_PARAMS,
      response: { 200: dataEnvelope(DOWNLOAD_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const params = parseRequest(reportRunIdParamsSchema, request.params, 'params');
    const data = await service.createDownloadUrl(params.id, options.objectStorage, options.signedUrlTtlSeconds);
    return { data: reportDownloadResponseSchema.parse(data) };
  });

  app.get(`${REPORTS_API_BASE}/saved-filters`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'listSavedReportFilters',
      summary: 'List the authenticated user saved report filters',
      security: BEARER_SECURITY,
      querystring: SAVED_FILTERS_QUERY,
      response: { 200: dataEnvelope(SAVED_FILTERS_RESPONSE), ...COMMON_RESPONSES }
    }
  }, async (request) => {
    const query = parseRequest(savedReportFiltersQuerySchema, request.query, 'query');
    return { data: savedReportFiltersResponseSchema.parse(await service.listSavedFilters(query)) };
  });

  app.post(`${REPORTS_API_BASE}/saved-filters`, {
    preHandler: [authenticate],
    schema: {
      tags: ['Reports & Analytics'],
      operationId: 'saveReportFilter',
      summary: 'Save one validated report filter for the authenticated user',
      security: BEARER_SECURITY,
      body: SAVE_FILTER_BODY,
      response: { 201: dataEnvelope(SAVED_FILTER), ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    const body = parseRequest(saveReportFilterBodySchema, request.body, 'body');
    const data = savedReportFilterResponseSchema.parse(await service.saveFilter(body));
    return reply.code(201).send({ data });
  });
}
