import type { FastifyInstance } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { hasPermission } from '@construction-erp/request-context';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createSubcontractorBodySchema,
  createVendorBodySchema,
  createVendorContactBodySchema,
  listSubcontractorsQuerySchema,
  listVendorsQuerySchema,
  masterIdParamsSchema,
  updateSubcontractorBodySchema,
  updateVendorBodySchema,
  type VendorsSubcontractorsPermissionCode
} from './vendors-subcontractors.schema.js';
import { VendorsSubcontractorsService } from './vendors-subcontractors.service.js';

export type VendorsSubcontractorsRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const UUID_JSON_SCHEMA = { type: 'string', format: 'uuid' } as const;
const NULLABLE_UUID_JSON_SCHEMA = { anyOf: [UUID_JSON_SCHEMA, { type: 'null' }] } as const;
const ID_PARAMS_SCHEMA = { type: 'object', additionalProperties: false, required: ['id'], properties: { id: UUID_JSON_SCHEMA } } as const;
const PAGE_PROPERTIES = { page: { type: 'integer', minimum: 1 }, pageSize: { type: 'integer', minimum: 1, maximum: 100 } } as const;
const VENDOR_LIST_QUERY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: { search: { type: 'string', minLength: 1, maxLength: 200 }, status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }, qualificationStatus: { type: 'string', enum: ['QUALIFIED', 'PENDING'] }, ...PAGE_PROPERTIES }
} as const;
const VENDOR_BODY_PROPERTIES = {
  code: { type: 'string', minLength: 1, maxLength: 100 },
  legalName: { type: 'string', minLength: 1, maxLength: 300 },
  displayName: { type: 'string', minLength: 1, maxLength: 300 },
  taxNo: { anyOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
  paymentTermsDays: { anyOf: [{ type: 'integer', minimum: 0, maximum: 2147483647 }, { type: 'null' }] },
  currency: { anyOf: [{ type: 'string', minLength: 3, maxLength: 3 }, { type: 'null' }] },
  qualificationStatus: { anyOf: [{ type: 'string', enum: ['QUALIFIED', 'PENDING'] }, { type: 'null' }] },
  status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }
} as const;
const CREATE_VENDOR_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['code', 'legalName', 'displayName'], properties: VENDOR_BODY_PROPERTIES } as const;
const UPDATE_VENDOR_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, minProperties: 1, properties: VENDOR_BODY_PROPERTIES } as const;
const CONTACT_BODY_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['name'],
  properties: { name: { type: 'string', minLength: 1, maxLength: 200 }, email: { anyOf: [{ type: 'string', format: 'email', maxLength: 320 }, { type: 'null' }] }, phone: { anyOf: [{ type: 'string', minLength: 7, maxLength: 50 }, { type: 'null' }] }, role: { anyOf: [{ type: 'string', minLength: 1, maxLength: 120 }, { type: 'null' }] } }
} as const;
const SUBCONTRACTOR_LIST_QUERY_JSON_SCHEMA = { type: 'object', additionalProperties: false, properties: { search: { type: 'string', minLength: 1, maxLength: 200 }, status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }, ...PAGE_PROPERTIES } } as const;
const SUBCONTRACTOR_BODY_PROPERTIES = {
  vendorId: NULLABLE_UUID_JSON_SCHEMA,
  code: { type: 'string', minLength: 1, maxLength: 100 },
  specialty: { type: 'string', minLength: 1, maxLength: 200 },
  defaultTerms: { anyOf: [{ type: 'string', minLength: 1, maxLength: 2000 }, { type: 'null' }] },
  status: { type: 'string', enum: ['ACTIVE', 'ARCHIVED'] }
} as const;
const CREATE_SUBCONTRACTOR_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['code', 'specialty'], properties: SUBCONTRACTOR_BODY_PROPERTIES } as const;
const UPDATE_SUBCONTRACTOR_BODY_JSON_SCHEMA = { type: 'object', additionalProperties: false, minProperties: 1, properties: SUBCONTRACTOR_BODY_PROPERTIES } as const;
const SUCCESS_JSON_SCHEMA = { type: 'object', additionalProperties: false, required: ['data'], properties: { data: { type: 'object', additionalProperties: true } } } as const;
const ERROR_RESPONSE_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['error'],
  properties: { error: { type: 'object', additionalProperties: false, required: ['code', 'message', 'requestId'], properties: {
    code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string' },
    fieldErrors: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['field', 'message'], properties: { field: { type: 'string' }, message: { type: 'string' }, code: { type: 'string' } } } }
  } } }
} as const;
const COMMON_ERROR_RESPONSES = { 400: ERROR_RESPONSE_SCHEMA, 401: ERROR_RESPONSE_SCHEMA, 403: ERROR_RESPONSE_SCHEMA, 404: ERROR_RESPONSE_SCHEMA, 409: ERROR_RESPONSE_SCHEMA, 500: ERROR_RESPONSE_SCHEMA } as const;

/** Parse one Supplier & Subcontractor request segment through its Zod boundary. */
function parseRequest<T extends z.ZodTypeAny>(schema: T, value: unknown, source: 'body' | 'params' | 'query'): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError({
    code: 'INVALID_REQUEST', message: 'Request validation failed.',
    fieldErrors: result.error.issues.map((issue) => ({ field: [source, ...issue.path.map(String)].join('.'), message: issue.message }))
  });
}

/** Enforce one route permission before the service repeats the business authorization check. */
function requireRoutePermission(permission: VendorsSubcontractorsPermissionCode): void {
  if (!hasPermission(permission)) throw new AuthorizationError();
}

/** Register the exact final Supplier & Subcontractor Management HTTP surface. */
export async function registerVendorsSubcontractorsRoutes(app: FastifyInstance, options: VendorsSubcontractorsRoutesOptions): Promise<void> {
  const service = new VendorsSubcontractorsService(options.database);

  app.get('/api/v1/vendors', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'listVendors', summary: 'List/search suppliers and vendors', security: BEARER_SECURITY, querystring: VENDOR_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('vendors.read');
    return reply.send({ data: await service.listVendors(parseRequest(listVendorsQuerySchema, request.query, 'query')) });
  });

  app.post('/api/v1/vendors', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'createVendor', summary: 'Create supplier/vendor', security: BEARER_SECURITY, body: CREATE_VENDOR_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('vendors.create');
    return reply.status(201).send({ data: await service.createVendor(parseRequest(createVendorBodySchema, request.body, 'body')) });
  });

  app.get('/api/v1/vendors/:id', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'getVendor', summary: 'Get supplier/vendor detail', security: BEARER_SECURITY, params: ID_PARAMS_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('vendors.read');
    const { id } = parseRequest(masterIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.getVendor(id) });
  });

  app.patch('/api/v1/vendors/:id', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'updateVendor', summary: 'Update supplier/vendor', security: BEARER_SECURITY, params: ID_PARAMS_SCHEMA, body: UPDATE_VENDOR_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('vendors.update');
    const { id } = parseRequest(masterIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.updateVendor(id, parseRequest(updateVendorBodySchema, request.body, 'body')) });
  });

  app.post('/api/v1/vendors/:id/contacts', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'createVendorContact', summary: 'Add supplier/vendor contact', security: BEARER_SECURITY, params: ID_PARAMS_SCHEMA, body: CONTACT_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('vendors.update');
    const { id } = parseRequest(masterIdParamsSchema, request.params, 'params');
    return reply.status(201).send({ data: await service.createVendorContact(id, parseRequest(createVendorContactBodySchema, request.body, 'body')) });
  });

  app.get('/api/v1/subcontractors', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'listSubcontractors', summary: 'List subcontractor profiles', security: BEARER_SECURITY, querystring: SUBCONTRACTOR_LIST_QUERY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('subcontractors.read');
    return reply.send({ data: await service.listSubcontractors(parseRequest(listSubcontractorsQuerySchema, request.query, 'query')) });
  });

  app.post('/api/v1/subcontractors', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'createSubcontractor', summary: 'Create subcontractor profile', security: BEARER_SECURITY, body: CREATE_SUBCONTRACTOR_BODY_JSON_SCHEMA, response: { 201: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('subcontractors.manage');
    return reply.status(201).send({ data: await service.createSubcontractor(parseRequest(createSubcontractorBodySchema, request.body, 'body')) });
  });

  app.patch('/api/v1/subcontractors/:id', {
    schema: { tags: ['Supplier & Subcontractor Management'], operationId: 'updateSubcontractor', summary: 'Update subcontractor profile', security: BEARER_SECURITY, params: ID_PARAMS_SCHEMA, body: UPDATE_SUBCONTRACTOR_BODY_JSON_SCHEMA, response: { 200: SUCCESS_JSON_SCHEMA, ...COMMON_ERROR_RESPONSES } }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('subcontractors.manage');
    const { id } = parseRequest(masterIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.updateSubcontractor(id, parseRequest(updateSubcontractorBodySchema, request.body, 'body')) });
  });
}
