import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  approveStageProgressBodySchema,
  createProjectStageBodySchema,
  createStageProgressBodySchema,
  freezeStageBaselineBodySchema,
  projectStageParamsSchema,
  projectStageProjectParamsSchema,
  stageProgressApprovalParamsSchema,
  updateProjectStageBodySchema
} from './project-stages.schema.js';
import { ProjectStagesService } from './project-stages.service.js';

export type ProjectStagesRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const PROJECT_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId'],
  properties: { projectId: { type: 'string', format: 'uuid' } }
} as const;
const STAGE_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'stageId'],
  properties: {
    projectId: { type: 'string', format: 'uuid' },
    stageId: { type: 'string', format: 'uuid' }
  }
} as const;
const APPROVAL_PARAMS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['projectId', 'stageId', 'updateId'],
  properties: {
    projectId: { type: 'string', format: 'uuid' },
    stageId: { type: 'string', format: 'uuid' },
    updateId: { type: 'string', format: 'uuid' }
  }
} as const;
const STAGE_BODY_PROPERTIES = {
  code: { type: 'string', minLength: 1, maxLength: 100 },
  name: { type: 'string', minLength: 1, maxLength: 300 },
  sequenceNo: { type: 'integer', minimum: 1 },
  weightPercent: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,2}|100)(?:\\.\\d{1,4})?$' },
  plannedStartDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] },
  plannedEndDate: { anyOf: [{ type: 'string', format: 'date' }, { type: 'null' }] }
} as const;
const CREATE_STAGE_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'name', 'sequenceNo', 'weightPercent'],
  properties: STAGE_BODY_PROPERTIES
} as const;
const UPDATE_STAGE_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: STAGE_BODY_PROPERTIES
} as const;
const PROGRESS_BODY_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['progressPercent', 'progressDate'],
  properties: {
    progressPercent: { type: 'string', pattern: '^(?:0|[1-9]\\d{0,2}|100)(?:\\.\\d{1,4})?$' },
    progressDate: { type: 'string', format: 'date' },
    note: { anyOf: [{ type: 'string', minLength: 1, maxLength: 5000 }, { type: 'null' }] },
    evidenceDocumentId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] }
  }
} as const;
const EMPTY_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, maxProperties: 0 } as const;
const SUCCESS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['data'],
  properties: { data: { type: 'object', additionalProperties: true } }
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

/** Parse one Project Stage request boundary with Zod. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, location: 'params' | 'body'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST',
    message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({
      field: [location, ...issue.path.map(String)].join('.'),
      message: issue.message
    }))
  });
}

/** Read the required idempotency key for Stage write commands. */
function readIdempotencyKey(request: FastifyRequest): string {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({
      fieldErrors: [{ field: 'headers.idempotency-key', message: 'Idempotency-Key is required and must be at most 200 characters.' }]
    });
  }
  return value;
}

/** Register the exact Final Module 7 Project Stages / Progress HTTP contract. */
export async function registerProjectStagesRoutes(app: FastifyInstance, options: ProjectStagesRoutesOptions): Promise<void> {
  const service = new ProjectStagesService(options.database);

  app.get('/api/v1/projects/:projectId/stages', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7ListProjectStages',
      summary: 'List Project Stages with progress and permitted financial summary',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId } = parseRequest(projectStageProjectParamsSchema, request.params, 'params');
    return reply.send({ data: await service.listStages(projectId) });
  });

  app.post('/api/v1/projects/:projectId/stages', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7CreateProjectStage',
      summary: 'Create one draft Project Stage',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      body: CREATE_STAGE_BODY_JSON_SCHEMA,
      response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId } = parseRequest(projectStageProjectParamsSchema, request.params, 'params');
    const body = parseRequest(createProjectStageBodySchema, request.body, 'body');
    return reply.code(201).send({ data: await service.createStage(projectId, body, readIdempotencyKey(request)) });
  });

  app.patch('/api/v1/projects/:projectId/stages/:stageId', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7UpdateProjectStage',
      summary: 'Edit one draft Stage plan',
      security: BEARER_SECURITY,
      params: STAGE_PARAMS_JSON_SCHEMA,
      body: UPDATE_STAGE_BODY_JSON_SCHEMA,
      response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, stageId } = parseRequest(projectStageParamsSchema, request.params, 'params');
    const body = parseRequest(updateProjectStageBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateStage(projectId, stageId, body, readIdempotencyKey(request)) });
  });

  app.post('/api/v1/projects/:projectId/stages/baseline/freeze', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7FreezeProjectStageBaseline',
      summary: 'Freeze the exact 100-percent Stage baseline',
      security: BEARER_SECURITY,
      params: PROJECT_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 201: SUCCESS_JSON_SCHEMA, 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId } = parseRequest(projectStageProjectParamsSchema, request.params, 'params');
    parseRequest(freezeStageBaselineBodySchema, request.body ?? {}, 'body');
    return reply.code(201).send({ data: await service.freezeBaseline(projectId, readIdempotencyKey(request)) });
  });

  app.post('/api/v1/projects/:projectId/stages/:stageId/progress', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7RecordStageProgress',
      summary: 'Record one physical Stage progress update',
      security: BEARER_SECURITY,
      params: STAGE_PARAMS_JSON_SCHEMA,
      body: PROGRESS_BODY_JSON_SCHEMA,
      response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, stageId } = parseRequest(projectStageParamsSchema, request.params, 'params');
    const body = parseRequest(createStageProgressBodySchema, request.body, 'body');
    return reply.code(201).send({ data: await service.recordProgress(projectId, stageId, body, readIdempotencyKey(request)) });
  });

  app.post('/api/v1/projects/:projectId/stages/:stageId/progress/:updateId/approve', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7ApproveStageProgress',
      summary: 'Approve one physical Stage progress update',
      security: BEARER_SECURITY,
      params: APPROVAL_PARAMS_JSON_SCHEMA,
      body: EMPTY_BODY_JSON_SCHEMA,
      response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, stageId, updateId } = parseRequest(stageProgressApprovalParamsSchema, request.params, 'params');
    parseRequest(approveStageProgressBodySchema, request.body ?? {}, 'body');
    return reply.send({ data: await service.approveProgress(projectId, stageId, updateId, readIdempotencyKey(request)) });
  });

  app.get('/api/v1/projects/:projectId/stages/:stageId/financials', {
    schema: {
      tags: ['Module 7 - Project Stages / Progress'],
      operationId: 'module7GetStageFinancials',
      summary: 'Read Stage value, actual cost, billed, received and outstanding',
      security: BEARER_SECURITY,
      params: STAGE_PARAMS_JSON_SCHEMA,
      response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const { projectId, stageId } = parseRequest(projectStageParamsSchema, request.params, 'params');
    return reply.send({ data: await service.getStageFinancials(projectId, stageId) });
  });
}
