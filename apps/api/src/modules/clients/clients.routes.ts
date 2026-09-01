import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { hasPermission } from '@construction-erp/request-context';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  clientContactParamsSchema,
  clientIdParamsSchema,
  createClientBodySchema,
  createClientContactBodySchema,
  listClientsQuerySchema,
  updateClientBodySchema,
  updateClientContactBodySchema,
  type ClientPermissionCode
} from './clients.schema.js';
import { ClientsService } from './clients.service.js';

export type ClientsRoutesOptions = Readonly<{
  database: DatabaseClient;
}>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const ID_PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const;
const CONTACT_PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'contactId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    contactId: { type: 'string', format: 'uuid' }
  }
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

/** Parse one Client Management request segment with Zod and Foundation validation errors. */
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

/** Enforce the route-level permission before the service revalidates it. */
function requireRoutePermission(permission: ClientPermissionCode): void {
  if (!hasPermission(permission)) throw new AuthorizationError();
}

/** Register the exact final Client Management HTTP surface. */
export async function registerClientsRoutes(
  app: FastifyInstance,
  options: ClientsRoutesOptions
): Promise<void> {
  const service = new ClientsService(options.database);

  app.get('/api/v1/clients', {
    schema: {
      tags: ['Client Management'],
      operationId: 'listClients',
      summary: 'List and search clients',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 200 },
          status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.read');
    const query = parseRequest(listClientsQuerySchema, request.query, 'query');
    return reply.send({ data: await service.listClients(query) });
  });

  app.post('/api/v1/clients', {
    schema: {
      tags: ['Client Management'],
      operationId: 'createClient',
      summary: 'Create client',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'legalName', 'displayName', 'billingAddress'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 100 },
          legalName: { type: 'string', minLength: 1, maxLength: 240 },
          displayName: { type: 'string', minLength: 1, maxLength: 240 },
          taxNo: { anyOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
          billingAddress: { type: 'string', minLength: 1, maxLength: 1000 },
          creditTermsDays: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] }
        }
      },
      response: { 201: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.create');
    const body = parseRequest(createClientBodySchema, request.body, 'body');
    return reply.status(201).send({ data: await service.createClient(body) });
  });

  app.get('/api/v1/clients/:id', {
    schema: {
      tags: ['Client Management'],
      operationId: 'getClient',
      summary: 'Get client, contacts and downstream summary',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.read');
    const params = parseRequest(clientIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.getClient(params.id) });
  });

  app.patch('/api/v1/clients/:id', {
    schema: {
      tags: ['Client Management'],
      operationId: 'updateClient',
      summary: 'Update client master data or lifecycle status',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 100 },
          legalName: { type: 'string', minLength: 1, maxLength: 240 },
          displayName: { type: 'string', minLength: 1, maxLength: 240 },
          taxNo: { anyOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
          billingAddress: { type: 'string', minLength: 1, maxLength: 1000 },
          creditTermsDays: { anyOf: [{ type: 'integer', minimum: 0 }, { type: 'null' }] },
          status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }
        }
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.update');
    const params = parseRequest(clientIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateClientBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateClient(params.id, body) });
  });

  app.post('/api/v1/clients/:id/contacts', {
    schema: {
      tags: ['Client Management'],
      operationId: 'createClientContact',
      summary: 'Add client contact',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          title: { anyOf: [{ type: 'string', minLength: 1, maxLength: 160 }, { type: 'null' }] },
          email: { anyOf: [{ type: 'string', format: 'email', maxLength: 320 }, { type: 'null' }] },
          phone: { anyOf: [{ type: 'string', minLength: 7, maxLength: 50 }, { type: 'null' }] },
          isPrimary: { type: 'boolean' }
        }
      },
      response: { 201: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.update');
    const params = parseRequest(clientIdParamsSchema, request.params, 'params');
    const body = parseRequest(createClientContactBodySchema, request.body, 'body');
    return reply.status(201).send({ data: await service.createClientContact(params.id, body) });
  });

  app.patch('/api/v1/clients/:id/contacts/:contactId', {
    schema: {
      tags: ['Client Management'],
      operationId: 'updateClientContact',
      summary: 'Update client contact',
      security: BEARER_SECURITY,
      params: CONTACT_PARAMS_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          title: { anyOf: [{ type: 'string', minLength: 1, maxLength: 160 }, { type: 'null' }] },
          email: { anyOf: [{ type: 'string', format: 'email', maxLength: 320 }, { type: 'null' }] },
          phone: { anyOf: [{ type: 'string', minLength: 7, maxLength: 50 }, { type: 'null' }] },
          isPrimary: { type: 'boolean' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
        }
      },
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('clients.update');
    const params = parseRequest(clientContactParamsSchema, request.params, 'params');
    const body = parseRequest(updateClientContactBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateClientContact(params.id, params.contactId, body) });
  });
}
