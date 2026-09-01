import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { hasPermission } from '@construction-erp/request-context';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  activateProjectBodySchema,
  closeProjectBodySchema,
  completeProjectBodySchema,
  suspendProjectBodySchema,
  createProjectBodySchema,
  listProjectsQuerySchema,
  listProjectsResponseSchema,
  projectDetailsResponseSchema,
  projectIdParamsSchema,
  projectResponseSchema,
  projectStatusHistoryResponseSchema,
  updateProjectBodySchema,
  type ListProjectsResponse,
  type ProjectPermissionCode,
  type ProjectDetailsResponse,
  type ProjectResponse,
  type ProjectStatusHistoryResponse
} from './projects.schema.js';
import { ProjectsService } from './projects.service.js';

export type ProjectsRoutesOptions = Readonly<{
  database: DatabaseClient;
}>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const PROJECT_PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' }
  }
} as const;
const PROJECT_STATUS_JSON_SCHEMA = {
  type: 'string',
  enum: ['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED']
} as const;
const PROJECT_MODEL_JSON_SCHEMA = {
  type: 'string',
  enum: ['FIXED_PRICE', 'COST_PLUS_PERCENTAGE']
} as const;
const PROJECT_MODEL_REQUEST_JSON_SCHEMA = {
  type: 'string',
  minLength: 1,
  maxLength: 32
} as const;
const PROJECT_VALUE_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$'
} as const;
const COST_PLUS_PERCENT_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:0|[1-9]\\d{0,2}|100)(?:\\.\\d{1,4})?$'
} as const;
const PROJECT_RESPONSE_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id', 'projectCode', 'name', 'clientId', 'projectModel', 'projectValue', 'costPlusPercent',
    'status', 'currency', 'startDate', 'plannedEndDate', 'projectManagerUserId', 'location',
    'createdAt', 'updatedAt'
  ],
  properties: {
    id: { type: 'string', format: 'uuid' },
    projectCode: { type: 'string', minLength: 1, maxLength: 100 },
    name: { type: 'string', minLength: 1, maxLength: 300 },
    clientId: { type: 'string', format: 'uuid' },
    projectModel: PROJECT_MODEL_JSON_SCHEMA,
    projectValue: PROJECT_VALUE_JSON_SCHEMA,
    costPlusPercent: { anyOf: [COST_PLUS_PERCENT_JSON_SCHEMA, { type: 'null' }] },
    status: PROJECT_STATUS_JSON_SCHEMA,
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    startDate: { type: 'string', format: 'date' },
    plannedEndDate: { type: 'string', format: 'date' },
    projectManagerUserId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
    location: { anyOf: [{ type: 'string', minLength: 1, maxLength: 1000 }, { type: 'null' }] },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' }
  }
} as const;
const PROJECT_STATUS_HISTORY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'fromStatus', 'toStatus', 'changedBy', 'reason', 'changedAt'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    projectId: { type: 'string', format: 'uuid' },
    fromStatus: { anyOf: [PROJECT_STATUS_JSON_SCHEMA, { type: 'null' }] },
    toStatus: PROJECT_STATUS_JSON_SCHEMA,
    changedBy: { type: 'string', format: 'uuid' },
    reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    changedAt: { type: 'string', format: 'date-time' }
  }
} as const;
const PROJECT_SUCCESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: PROJECT_RESPONSE_JSON_SCHEMA
  }
} as const;
const PROJECT_MONEY_JSON_SCHEMA = { type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' } as const;
const PROJECT_PERCENT_JSON_SCHEMA = {
  type: 'string',
  pattern: '^(?:0|[1-9]\\d?|100)(?:\\.\\d{1,4})?$'
} as const;
const PROJECT_STAGE_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['stageCount', 'baselineStatus', 'totalWeightPercent', 'overallPhysicalProgressPercent'],
  properties: {
    stageCount: { type: 'integer', minimum: 0 },
    baselineStatus: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    totalWeightPercent: { anyOf: [PROJECT_PERCENT_JSON_SCHEMA, { type: 'null' }] },
    overallPhysicalProgressPercent: PROJECT_PERCENT_JSON_SCHEMA
  }
} as const;
const PROJECT_TEAM_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['activeAssignmentCount', 'activeEmployeeCount'],
  properties: {
    activeAssignmentCount: { type: 'integer', minimum: 0 },
    activeEmployeeCount: { type: 'integer', minimum: 0 }
  }
} as const;
const PROJECT_BUDGET_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['versionNo', 'status', 'currency', 'totalAmount'],
  properties: {
    versionNo: { type: 'integer', minimum: 1 },
    status: { type: 'string' },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
    totalAmount: PROJECT_MONEY_JSON_SCHEMA
  }
} as const;
const PROJECT_COST_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['budgetCost', 'committedCost', 'actualCost', 'forecastCost', 'variance'],
  properties: {
    budgetCost: PROJECT_MONEY_JSON_SCHEMA,
    committedCost: PROJECT_MONEY_JSON_SCHEMA,
    actualCost: PROJECT_MONEY_JSON_SCHEMA,
    forecastCost: PROJECT_MONEY_JSON_SCHEMA,
    variance: { type: 'string', pattern: '^-?(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' }
  }
} as const;
const PROJECT_BILLING_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['invoiceCount', 'billedAmount'],
  properties: {
    invoiceCount: { type: 'integer', minimum: 0 },
    billedAmount: PROJECT_MONEY_JSON_SCHEMA
  }
} as const;
const PROJECT_RECEIPT_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['receivedAmount', 'allocatedAmount', 'advanceAmount', 'outstandingAmount'],
  properties: {
    receivedAmount: PROJECT_MONEY_JSON_SCHEMA,
    allocatedAmount: PROJECT_MONEY_JSON_SCHEMA,
    advanceAmount: PROJECT_MONEY_JSON_SCHEMA,
    outstandingAmount: { anyOf: [PROJECT_MONEY_JSON_SCHEMA, { type: 'null' }] }
  }
} as const;
const PROJECT_DETAILS_SUCCESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'project', 'statusHistory', 'stageSummary', 'teamSummary', 'budgetSummary', 'costSummary',
        'billingSummary', 'receiptSummary'
      ],
      properties: {
        project: PROJECT_RESPONSE_JSON_SCHEMA,
        statusHistory: { type: 'array', items: PROJECT_STATUS_HISTORY_JSON_SCHEMA },
        stageSummary: { anyOf: [PROJECT_STAGE_SUMMARY_JSON_SCHEMA, { type: 'null' }] },
        teamSummary: { anyOf: [PROJECT_TEAM_SUMMARY_JSON_SCHEMA, { type: 'null' }] },
        budgetSummary: { anyOf: [PROJECT_BUDGET_SUMMARY_JSON_SCHEMA, { type: 'null' }] },
        costSummary: { anyOf: [PROJECT_COST_SUMMARY_JSON_SCHEMA, { type: 'null' }] },
        billingSummary: { anyOf: [PROJECT_BILLING_SUMMARY_JSON_SCHEMA, { type: 'null' }] },
        receiptSummary: { anyOf: [PROJECT_RECEIPT_SUMMARY_JSON_SCHEMA, { type: 'null' }] }
      }
    }
  }
} as const;
const LIST_PROJECTS_SUCCESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: {
    data: {
      type: 'object',
      additionalProperties: false,
      required: ['items', 'total', 'page', 'pageSize'],
      properties: {
        items: { type: 'array', items: PROJECT_RESPONSE_JSON_SCHEMA },
        total: { type: 'integer', minimum: 0 },
        page: { type: 'integer', minimum: 1 },
        pageSize: { type: 'integer', minimum: 1, maximum: 100 }
      }
    }
  }
} as const;

/** Build one public error envelope schema with an explicit stable-code allow-list. */
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
}

const INVALID_REQUEST_RESPONSE = errorResponseSchema(['INVALID_REQUEST']);
const AUTHENTICATION_RESPONSE = errorResponseSchema(['AUTHENTICATION_REQUIRED']);
const AUTHORIZATION_RESPONSE = errorResponseSchema(['FORBIDDEN']);
const PROJECT_SCOPE_AUTHORIZATION_RESPONSE = errorResponseSchema(['FORBIDDEN', 'PROJECT_SCOPE_FORBIDDEN']);
const PROJECT_NOT_FOUND_RESPONSE = errorResponseSchema(['PROJECT_NOT_FOUND']);
const PROJECT_CREATE_CONFLICT_RESPONSE = errorResponseSchema(['DUPLICATE_PROJECT_CODE', 'INVALID_PROJECT_MODEL']);
const PROJECT_UPDATE_CONFLICT_RESPONSE = errorResponseSchema(['INVALID_PROJECT_MODEL', 'INVALID_PROJECT_TRANSITION']);
const PROJECT_ACTIVATE_CONFLICT_RESPONSE = errorResponseSchema(['INVALID_PROJECT_MODEL', 'INVALID_PROJECT_TRANSITION']);
const PROJECT_LIFECYCLE_CONFLICT_RESPONSE = errorResponseSchema(['INVALID_PROJECT_TRANSITION']);
const PROJECT_CLOSE_CONFLICT_RESPONSE = errorResponseSchema([
  'PROJECT_NOT_READY',
  'INVALID_PROJECT_TRANSITION'
]);
const INTERNAL_ERROR_RESPONSE = errorResponseSchema(['INTERNAL_SERVER_ERROR']);

type ProjectListResult = Awaited<ReturnType<ProjectsService['listProjects']>>;
type ProjectRecord = ProjectListResult['items'][number];
type ProjectDetails = Awaited<ReturnType<ProjectsService['getProject']>>;
type ProjectHistoryRecord = ProjectDetails['statusHistory'][number];

/** Parse one Project Management request segment with Zod and the shared validation envelope. */
function parseRequest<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
  source: 'body' | 'params' | 'query'
): z.infer<T> {
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

/** Enforce a company-scope route permission for commands that do not yet have a Project resource. */
function requireRoutePermission(permission: ProjectPermissionCode): void {
  if (!hasPermission(permission)) throw new AuthorizationError();
}

/** Convert one database date to the API's stable YYYY-MM-DD form. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Serialize one Project master without exposing company ownership internals. */
function serializeProject(project: ProjectRecord): ProjectResponse {
  return projectResponseSchema.parse({
    id: project.id,
    projectCode: project.projectCode,
    name: project.name,
    clientId: project.clientId,
    projectModel: project.projectModel,
    projectValue: project.projectValue.toString(),
    costPlusPercent: project.costPlusPercent === null ? null : project.costPlusPercent.toString(),
    status: project.status,
    currency: project.currency,
    startDate: dateOnly(project.startDate),
    plannedEndDate: dateOnly(project.plannedEndDate),
    projectManagerUserId: project.projectManagerUserId,
    location: project.location,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  });
}

/** Serialize one append-only Project lifecycle-history row. */
function serializeStatusHistory(row: ProjectHistoryRecord): ProjectStatusHistoryResponse {
  return projectStatusHistoryResponseSchema.parse({
    id: row.id,
    projectId: row.projectId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedBy: row.changedBy,
    reason: row.reason,
    changedAt: row.changedAt.toISOString()
  });
}

/** Serialize a paginated Project register result. */
function serializeProjectList(result: ProjectListResult): ListProjectsResponse {
  return listProjectsResponseSchema.parse({
    items: result.items.map(serializeProject),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize
  });
}

/** Serialize Project detail with lifecycle history and permission-safe source summaries. */
function serializeProjectDetails(result: ProjectDetails): ProjectDetailsResponse {
  return projectDetailsResponseSchema.parse({
    project: serializeProject(result.project),
    statusHistory: result.statusHistory.map(serializeStatusHistory),
    stageSummary: result.stageSummary,
    teamSummary: result.teamSummary,
    budgetSummary: result.budgetSummary,
    costSummary: result.costSummary,
    billingSummary: result.billingSummary,
    receiptSummary: result.receiptSummary
  });
}

/** Register the Final Module 6 Project Management routes. */
export async function registerProjectsRoutes(app: FastifyInstance, options: ProjectsRoutesOptions): Promise<void> {
  const service = new ProjectsService(options.database);

  app.get('/api/v1/projects', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6ListProjects',
      summary: 'List company Projects',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 200 },
          clientId: { type: 'string', format: 'uuid' },
          projectModel: PROJECT_MODEL_JSON_SCHEMA,
          status: PROJECT_STATUS_JSON_SCHEMA,
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      response: {
        200: LIST_PROJECTS_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listProjectsQuerySchema, request.query, 'query');
    return reply.send({ data: serializeProjectList(await service.listProjects(query)) });
  });

  app.post('/api/v1/projects', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6CreateProject',
      summary: 'Create one DRAFT Project directly from a Client',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        required: [
          'projectCode', 'name', 'clientId', 'projectModel', 'projectValue', 'currency',
          'startDate', 'plannedEndDate'
        ],
        properties: {
          projectCode: { type: 'string', minLength: 1, maxLength: 100 },
          name: { type: 'string', minLength: 1, maxLength: 300 },
          clientId: { type: 'string', format: 'uuid' },
          projectModel: PROJECT_MODEL_REQUEST_JSON_SCHEMA,
          projectValue: PROJECT_VALUE_JSON_SCHEMA,
          costPlusPercent: { anyOf: [COST_PLUS_PERCENT_JSON_SCHEMA, { type: 'null' }] },
          currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Za-z]{3}$' },
          startDate: { type: 'string', format: 'date' },
          plannedEndDate: { type: 'string', format: 'date' },
          projectManagerUserId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
          location: { anyOf: [{ type: 'string', minLength: 1, maxLength: 1000 }, { type: 'null' }] }
        }
      },
      response: {
        201: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: AUTHORIZATION_RESPONSE,
        409: PROJECT_CREATE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('projects.create');
    const body = parseRequest(createProjectBodySchema, request.body, 'body');
    return reply.status(201).send({ data: serializeProject(await service.createProject(body)) });
  });

  app.get('/api/v1/projects/:id', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6GetProject',
      summary: 'Get one Project and lifecycle history',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      response: {
        200: PROJECT_DETAILS_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    return reply.send({ data: serializeProjectDetails(await service.getProject(params.id)) });
  });

  app.patch('/api/v1/projects/:id', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6UpdateProject',
      summary: 'Update editable Project master data',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 300 },
          clientId: { type: 'string', format: 'uuid' },
          projectModel: PROJECT_MODEL_REQUEST_JSON_SCHEMA,
          projectValue: PROJECT_VALUE_JSON_SCHEMA,
          costPlusPercent: { anyOf: [COST_PLUS_PERCENT_JSON_SCHEMA, { type: 'null' }] },
          currency: { type: 'string', minLength: 3, maxLength: 3, pattern: '^[A-Za-z]{3}$' },
          startDate: { type: 'string', format: 'date' },
          plannedEndDate: { type: 'string', format: 'date' },
          projectManagerUserId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
          location: { anyOf: [{ type: 'string', minLength: 1, maxLength: 1000 }, { type: 'null' }] }
        }
      },
      response: {
        200: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        409: PROJECT_UPDATE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateProjectBodySchema, request.body, 'body');
    return reply.send({ data: serializeProject(await service.updateProject(params.id, body)) });
  });

  app.post('/api/v1/projects/:id/activate', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6ActivateProject',
      summary: 'Activate one ready DRAFT Project',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      response: {
        200: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        409: PROJECT_ACTIVATE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    parseRequest(activateProjectBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: serializeProject(await service.activateProject(params.id)) });
  });

  app.post('/api/v1/projects/:id/suspend', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6SuspendProject',
      summary: 'Suspend one ACTIVE Project through the Pass-366 repair command',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', minLength: 1, maxLength: 5000 }
        }
      },
      response: {
        200: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        409: PROJECT_LIFECYCLE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    const body = parseRequest(suspendProjectBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: serializeProject(await service.suspendProject(params.id, body)) });
  });

  app.post('/api/v1/projects/:id/complete', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6CompleteProject',
      summary: 'Mark one ACTIVE Project operationally complete',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      response: {
        200: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        409: PROJECT_LIFECYCLE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    parseRequest(completeProjectBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: serializeProject(await service.completeProject(params.id)) });
  });

  app.post('/api/v1/projects/:id/close', {
    schema: {
      tags: ['Module 6 - Project Management'],
      operationId: 'module6CloseProject',
      summary: 'Close one completed Project after readiness checks',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: { type: 'string', minLength: 1, maxLength: 5000 }
        }
      },
      response: {
        200: PROJECT_SUCCESS_SCHEMA,
        400: INVALID_REQUEST_RESPONSE,
        401: AUTHENTICATION_RESPONSE,
        403: PROJECT_SCOPE_AUTHORIZATION_RESPONSE,
        404: PROJECT_NOT_FOUND_RESPONSE,
        409: PROJECT_CLOSE_CONFLICT_RESPONSE,
        500: INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(projectIdParamsSchema, request.params, 'params');
    const body = parseRequest(closeProjectBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: serializeProject(await service.closeProject(params.id, body)) });
  });
}
