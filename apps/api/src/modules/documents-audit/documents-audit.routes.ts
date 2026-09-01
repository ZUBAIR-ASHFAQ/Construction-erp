import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import type { ObjectStorage } from '@construction-erp/storage';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  completeDocumentUploadBodySchema,
  createDocumentLinkBodySchema,
  createUploadIntentBodySchema,
  createVersionUploadIntentBodySchema,
  documentIdParamsSchema,
  documentLinkIdParamsSchema,
  listAuditLogsQuerySchema,
  listDocumentsQuerySchema,
  MODULE_21_MAX_PAGE_SIZE
} from './documents-audit.schema.js';
import { DocumentsService, type DocumentsUploadPolicy } from './documents-audit.service.js';

export type DocumentsRoutesOptions = Readonly<{
  database: DatabaseClient;
  objectStorage: ObjectStorage;
  uploadPolicy: DocumentsUploadPolicy;
}>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const ID_PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const;
const IDEMPOTENCY_HEADERS_SCHEMA = {
  type: 'object',
  required: ['idempotency-key'],
  properties: { 'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 } }
} as const;
const ERROR_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  required: ['error'],
  properties: { error: { type: 'object', additionalProperties: true } }
} as const;
const COMMON_ERROR_RESPONSES = {
  400: ERROR_RESPONSE_SCHEMA,
  401: ERROR_RESPONSE_SCHEMA,
  403: ERROR_RESPONSE_SCHEMA,
  404: ERROR_RESPONSE_SCHEMA,
  409: ERROR_RESPONSE_SCHEMA,
  500: ERROR_RESPONSE_SCHEMA
} as const;

/** Parse one request segment with the Module 21 Zod boundary. */
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

/** Read the required retry key used by idempotent upload completion. */
function readIdempotencyKey(request: FastifyRequest): string {
  const value = request.headers['idempotency-key'];
  const key = Array.isArray(value) ? value[0] : value;
  if (!key || key.trim().length === 0 || key.length > 200) {
    throw new ValidationError({
      code: 'INVALID_REQUEST',
      message: 'A valid Idempotency-Key header is required.',
      fieldErrors: [{ field: 'headers.idempotency-key', message: 'Expected 1-200 characters.' }]
    });
  }
  return key.trim();
}

/** Register final Module 21 routes plus the bounded document-browser list read. */
export async function registerDocumentsRoutes(
  app: FastifyInstance,
  options: DocumentsRoutesOptions
): Promise<void> {
  const service = new DocumentsService(options.database, options.objectStorage, options.uploadPolicy);

  app.post('/api/v1/documents/uploads/init', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21InitializeDocumentUpload',
      summary: 'Create signed document upload intent',
      security: BEARER_SECURITY,
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(createUploadIntentBodySchema, request.body, 'body');
    return reply.send({ data: await service.createUploadIntent(body) });
  });

  app.post('/api/v1/documents/uploads/complete', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21CompleteDocumentUpload',
      summary: 'Finalize uploaded document',
      security: BEARER_SECURITY,
      headers: IDEMPOTENCY_HEADERS_SCHEMA,
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const body = parseRequest(completeDocumentUploadBodySchema, request.body, 'body');
    return reply.send({ data: await service.completeUploadIntent(body.uploadIntentId, readIdempotencyKey(request)) });
  });

  app.get('/api/v1/documents', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21ListDocuments',
      summary: 'List visible documents for the document browser',
      description: 'Bounded authenticated read required by the Module 21 React document browser; it is not a generic document CRUD surface.',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 200 },
          projectId: { type: 'string', format: 'uuid' },
          category: { type: 'string', minLength: 1, maxLength: 100 },
          status: { type: 'string', minLength: 1, maxLength: 100 },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: MODULE_21_MAX_PAGE_SIZE }
        }
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listDocumentsQuerySchema, request.query, 'query');
    return reply.send({ data: await service.listDocuments(query) });
  });

  app.get('/api/v1/documents/:id', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21GetDocument',
      summary: 'Get document metadata and immutable versions',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(documentIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.getDocument(params.id) });
  });

  app.post('/api/v1/documents/:id/versions', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21CreateVersionUploadIntent',
      summary: 'Create next immutable version upload intent',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(documentIdParamsSchema, request.params, 'params');
    const body = parseRequest(createVersionUploadIntentBodySchema, request.body, 'body');
    return reply.send({ data: await service.createVersionUploadIntent(params.id, body) });
  });

  app.post('/api/v1/documents/:id/links', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21LinkDocument',
      summary: 'Link document to approved resource',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: { type: 'object', additionalProperties: true },
      response: { 201: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(documentIdParamsSchema, request.params, 'params');
    const body = parseRequest(createDocumentLinkBodySchema, request.body, 'body');
    return reply.code(201).send({ data: await service.linkDocumentToResource({
      documentId: params.id,
      versionId: body.versionId,
      linkedResourceType: body.resourceType,
      linkedResourceId: body.resourceId
    }) });
  });

  app.delete('/api/v1/documents/:id/links/:linkId', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21UnlinkDocument',
      summary: 'Remove authorized document link',
      security: BEARER_SECURITY,
      params: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(documentLinkIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.unlinkDocumentFromResource(params.id, params.linkId) });
  });

  app.get('/api/v1/documents/:id/download', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21CreateDownloadUrl',
      summary: 'Authorize signed document download',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const params = parseRequest(documentIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.createDownloadUrl(params.id) });
  });

  app.get('/api/v1/audit-logs', {
    schema: {
      tags: ['Module 21 - Documents & Audit Log'],
      operationId: 'module21ListAuditLogs',
      summary: 'Search append-only audit history',
      security: BEARER_SECURITY,
      querystring: { type: 'object', additionalProperties: true },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    const query = parseRequest(listAuditLogsQuerySchema, request.query, 'query');
    return reply.send({ data: await service.listAuditLogs(query) });
  });
}
