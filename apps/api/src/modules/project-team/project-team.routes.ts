import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createProjectTeamAssignmentBodySchema,
  endProjectTeamAssignmentBodySchema,
  projectTeamAssignmentParamsSchema,
  projectTeamProjectParamsSchema,
  updateProjectTeamAssignmentBodySchema
} from './project-team.schema.js';
import { ProjectTeamService } from './project-team.service.js';

export type ProjectTeamRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const PROJECT_PARAMS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId'],
  properties: { projectId: { type: 'string', format: 'uuid' } }
} as const;
const ASSIGNMENT_PARAMS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['projectId', 'assignmentId'],
  properties: {
    projectId: { type: 'string', format: 'uuid' },
    assignmentId: { type: 'string', format: 'uuid' }
  }
} as const;
const ASSIGNMENT_BODY_PROPERTIES = {
  employeeId: { type: 'string', format: 'uuid' },
  projectRole: { type: 'string', minLength: 1, maxLength: 160 },
  allocationPercent: { type: 'string', pattern: '^(?:0|[1-9]\\d?|100)(?:\\.\\d{1,4})?$' },
  stageId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
  fromDate: { type: 'string', format: 'date' },
  toDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }
} as const;
const CREATE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['employeeId', 'projectRole', 'allocationPercent', 'fromDate'],
  properties: ASSIGNMENT_BODY_PROPERTIES
} as const;
const UPDATE_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, minProperties: 1,
  properties: {
    projectRole: ASSIGNMENT_BODY_PROPERTIES.projectRole,
    allocationPercent: ASSIGNMENT_BODY_PROPERTIES.allocationPercent,
    stageId: ASSIGNMENT_BODY_PROPERTIES.stageId,
    fromDate: ASSIGNMENT_BODY_PROPERTIES.fromDate,
    toDate: ASSIGNMENT_BODY_PROPERTIES.toDate
  }
} as const;
const END_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['endDate'],
  properties: {
    endDate: { type: 'string', format: 'date' },
    note: { anyOf: [{ type: 'string', minLength: 1, maxLength: 2000 }, { type: 'null' }] }
  }
} as const;
const SUCCESS_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['data'],
  properties: { data: { type: 'object', additionalProperties: true } }
} as const;
const ERROR_JSON_SCHEMA = {
  type: 'object', additionalProperties: true, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: true } }
} as const;
const COMMON_RESPONSES = { 400: ERROR_JSON_SCHEMA, 401: ERROR_JSON_SCHEMA, 403: ERROR_JSON_SCHEMA, 404: ERROR_JSON_SCHEMA, 409: ERROR_JSON_SCHEMA, 500: ERROR_JSON_SCHEMA } as const;

/** Parse one Project Team request boundary with Zod. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: 'params' | 'body'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [location, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Read the required idempotency key for Project Team write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({ fieldErrors: [{ field: 'headers.idempotency-key', message: 'Idempotency-Key is required and must be at most 200 characters.' }] });
  }
  return value;
}

/** Register the exact Final Module 8 Project Team / Assignment HTTP contract. */
export async function registerProjectTeamRoutes(app: FastifyInstance, options: ProjectTeamRoutesOptions): Promise<void> {
  const service = new ProjectTeamService(options.database);

  app.get('/api/v1/projects/:projectId/team', {
    schema: { tags: ['Module 8 - Project Team / Assignment'], operationId: 'module8ListProjectTeam', summary: 'List Project Team assignments', security: BEARER_SECURITY, params: PROJECT_PARAMS_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId } = parseRequest(projectTeamProjectParamsSchema, request.params, 'params');
    return reply.send({ data: await service.listAssignments(projectId) });
  });

  app.post('/api/v1/projects/:projectId/team', {
    schema: { tags: ['Module 8 - Project Team / Assignment'], operationId: 'module8AssignEmployee', summary: 'Assign one active Employee to a Project and optional Stage', security: BEARER_SECURITY, params: PROJECT_PARAMS_JSON_SCHEMA, body: CREATE_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId } = parseRequest(projectTeamProjectParamsSchema, request.params, 'params');
    const body = parseRequest(createProjectTeamAssignmentBodySchema, request.body, 'body');
    return reply.code(201).send({ data: await service.createAssignment(projectId, body, readIdempotencyKey(request)) });
  });

  app.patch('/api/v1/projects/:projectId/team/:assignmentId', {
    schema: { tags: ['Module 8 - Project Team / Assignment'], operationId: 'module8UpdateProjectTeamAssignment', summary: 'Update Project role, allocation, Stage or effective dates', security: BEARER_SECURITY, params: ASSIGNMENT_PARAMS_JSON_SCHEMA, body: UPDATE_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, assignmentId } = parseRequest(projectTeamAssignmentParamsSchema, request.params, 'params');
    const body = parseRequest(updateProjectTeamAssignmentBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateAssignment(projectId, assignmentId, body, readIdempotencyKey(request)) });
  });

  app.post('/api/v1/projects/:projectId/team/:assignmentId/end', {
    schema: { tags: ['Module 8 - Project Team / Assignment'], operationId: 'module8EndProjectTeamAssignment', summary: 'End one active Project Team assignment without deleting history', security: BEARER_SECURITY, params: ASSIGNMENT_PARAMS_JSON_SCHEMA, body: END_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, assignmentId } = parseRequest(projectTeamAssignmentParamsSchema, request.params, 'params');
    const body = parseRequest(endProjectTeamAssignmentBodySchema, request.body, 'body');
    return reply.send({ data: await service.endAssignment(projectId, assignmentId, body, readIdempotencyKey(request)) });
  });
}
