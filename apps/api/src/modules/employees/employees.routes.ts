import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { hasPermission } from '@construction-erp/request-context';
import { z } from 'zod';
import { authenticateRequest } from '../../plugins/authentication.js';
import {
  createEmployeeBodySchema,
  createEmployeeCompensationBodySchema,
  employeeIdParamsSchema,
  listEmployeesQuerySchema,
  updateEmployeeBodySchema,
  updateEmployeeStatusBodySchema,
  type EmployeePermissionCode
} from './employees.schema.js';
import { EmployeesService } from './employees.service.js';

export type EmployeesRoutesOptions = Readonly<{ database: DatabaseClient }>;

const BEARER_SECURITY = [{ bearerAuth: [] }];
const ID_PARAMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } }
} as const;
const LIST_QUERY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    search: { type: 'string', minLength: 1, maxLength: 200 },
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;
const EMPLOYEE_MASTER_PROPERTIES = {
  employeeNo: { type: 'string', minLength: 1, maxLength: 100 },
  userId: { anyOf: [{ type: 'string', format: 'uuid' }, { type: 'null' }] },
  name: { type: 'string', minLength: 1, maxLength: 200 },
  cnicOrId: { anyOf: [{ type: 'string', minLength: 1, maxLength: 100 }, { type: 'null' }] },
  phone: { anyOf: [{ type: 'string', minLength: 7, maxLength: 50 }, { type: 'null' }] },
  email: { anyOf: [{ type: 'string', format: 'email', maxLength: 320 }, { type: 'null' }] },
  department: { type: 'string', minLength: 1, maxLength: 160 },
  jobTitle: { type: 'string', minLength: 1, maxLength: 160 },
  employeeType: { type: 'string', minLength: 1, maxLength: 64 },
  joiningDate: { type: 'string', format: 'date' }
} as const;
const CREATE_EMPLOYEE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['employeeNo', 'name', 'department', 'jobTitle', 'employeeType', 'joiningDate'],
  properties: EMPLOYEE_MASTER_PROPERTIES
} as const;
const UPDATE_EMPLOYEE_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  minProperties: 1,
  properties: EMPLOYEE_MASTER_PROPERTIES
} as const;
const COMPENSATION_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['payType', 'effectiveFrom'],
  properties: {
    payType: { type: 'string', enum: ['SALARY', 'DAILY', 'HOURLY'] },
    baseSalaryOrWage: { anyOf: [{ type: 'string', pattern: '^(?:0|[1-9]\\d{0,15})(?:\\.\\d{1,2})?$' }, { type: 'null' }] },
    hourlyRate: { anyOf: [{ type: 'string', pattern: '^(?:0|[1-9]\\d{0,13})(?:\\.\\d{1,4})?$' }, { type: 'null' }] },
    effectiveFrom: { type: 'string', format: 'date' }
  }
} as const;
const STATUS_BODY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['status'],
  properties: {
    status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
    reason: { anyOf: [{ type: 'string', minLength: 1, maxLength: 2000 }, { type: 'null' }] }
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

/** Parse one Employee request segment through its Zod boundary. */
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

/** Read the required idempotency key for controlled Employee write commands. */
function idempotencyKey(request: FastifyRequest): string {
  const rawValue = request.headers['idempotency-key'];
  const value = Array.isArray(rawValue) ? rawValue[0] : rawValue;
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
    throw new ValidationError({
      fieldErrors: [{
        field: 'headers.idempotency-key',
        message: 'Idempotency-Key is required for Employee write commands.'
      }]
    });
  }
  return value;
}

/** Enforce one route permission before the service repeats authorization. */
function requireRoutePermission(permission: EmployeePermissionCode): void {
  if (!hasPermission(permission)) throw new AuthorizationError();
}

/** Register the exact Final-21 Employee & Labour Management HTTP surface. */
export async function registerEmployeesRoutes(
  app: FastifyInstance,
  options: EmployeesRoutesOptions
): Promise<void> {
  const service = new EmployeesService(options.database);

  app.get('/api/v1/employees', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'listEmployees',
      summary: 'List/search Employees',
      security: BEARER_SECURITY,
      querystring: LIST_QUERY_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.read');
    const query = parseRequest(listEmployeesQuerySchema, request.query, 'query');
    return reply.send({ data: await service.listEmployees(query) });
  });

  app.post('/api/v1/employees', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'createEmployee',
      summary: 'Create Employee',
      security: BEARER_SECURITY,
      body: CREATE_EMPLOYEE_BODY_SCHEMA,
      response: { 201: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.create');
    const body = parseRequest(createEmployeeBodySchema, request.body, 'body');
    return reply.status(201).send({ data: await service.createEmployee(body, idempotencyKey(request)) });
  });

  app.get('/api/v1/employees/:id', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'getEmployee',
      summary: 'Get Employee detail',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.read');
    const { id } = parseRequest(employeeIdParamsSchema, request.params, 'params');
    return reply.send({ data: await service.getEmployee(id) });
  });

  app.patch('/api/v1/employees/:id', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'updateEmployee',
      summary: 'Update Employee master fields',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: UPDATE_EMPLOYEE_BODY_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.update');
    const { id } = parseRequest(employeeIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateEmployeeBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateEmployee(id, body, idempotencyKey(request)) });
  });

  app.post('/api/v1/employees/:id/compensation', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'createEmployeeCompensation',
      summary: 'Add effective Employee compensation',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: COMPENSATION_BODY_SCHEMA,
      response: { 201: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.compensation.manage');
    const { id } = parseRequest(employeeIdParamsSchema, request.params, 'params');
    const body = parseRequest(createEmployeeCompensationBodySchema, request.body, 'body');
    return reply.status(201).send({ data: await service.createCompensation(id, body, idempotencyKey(request)) });
  });

  app.post('/api/v1/employees/:id/status', {
    schema: {
      tags: ['Employee & Labour Management'],
      operationId: 'updateEmployeeStatus',
      summary: 'Activate or deactivate Employee',
      security: BEARER_SECURITY,
      params: ID_PARAMS_SCHEMA,
      body: STATUS_BODY_SCHEMA,
      response: { 200: { type: 'object', additionalProperties: true }, ...COMMON_ERROR_RESPONSES }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, options.database);
    requireRoutePermission('employees.update');
    const { id } = parseRequest(employeeIdParamsSchema, request.params, 'params');
    const body = parseRequest(updateEmployeeStatusBodySchema, request.body, 'body');
    return reply.send({ data: await service.updateStatus(id, body, idempotencyKey(request)) });
  });
}
