import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { ValidationError } from '@construction-erp/errors';
import { z } from 'zod';
import { authenticateRequest, readBearerToken } from '../../plugins/authentication.js';
import {
  AUTH_RESULT_SCHEMA,
  BEARER_SECURITY,
  COMMON_ERROR_RESPONSES,
  CURRENT_IDENTITY_SCHEMA,
  DEPARTMENTS_PAGE_SCHEMA,
  DEPARTMENT_SCHEMA,
  ORGANIZATION_PROFILE_SCHEMA,
  EMPTY_BODY_OPENAPI_SCHEMA,
  ROLES_PAGE_SCHEMA,
  ROLE_SCHEMA,
  USER_ID_PARAMS_OPENAPI_SCHEMA,
  USER_PROJECT_SCOPE_SCHEMA,
  USER_SCHEMA,
  USERS_PAGE_SCHEMA,
  UUID_SCHEMA,
  dataEnvelopeSchema,
  acceptInvitationBodySchema,
  adminUpdateUserBodySchema,
  completePasswordResetBodySchema,
  createRoleBodySchema,
  createDepartmentBodySchema,
  updateOrganizationProfileBodySchema,
  createUserBodySchema,
  listRolesQuerySchema,
  listDepartmentsQuerySchema,
  listUsersQuerySchema,
  refreshSessionBodySchema,
  replaceRolePermissionsBodySchema,
  replaceAdminUserRolesBodySchema,
  replaceAdminUserProjectScopesBodySchema,
  requestPasswordResetBodySchema,
  roleIdParamsSchema,
  signInBodySchema,
  signOutBodySchema,
  userIdParamsSchema
} from './administration.schema.js';
import { AdministrationService } from './administration.service.js';

export type AdministrationRoutesOptions = Readonly<{
  database: DatabaseClient;
  authActionTokenSecret: string;
}>;

/** Build one Administration error envelope with the exact stable codes a route can emit. */
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

const ROLE_ASSIGNMENT_INVALID_REQUEST_RESPONSE = errorResponseSchema(['INVALID_REQUEST']);
const ROLE_ASSIGNMENT_AUTHENTICATION_RESPONSE = errorResponseSchema(['AUTHENTICATION_REQUIRED']);
const ROLE_ASSIGNMENT_AUTHORIZATION_RESPONSE = errorResponseSchema(['FORBIDDEN']);
const ROLE_ASSIGNMENT_INTERNAL_ERROR_RESPONSE = errorResponseSchema(['INTERNAL_SERVER_ERROR']);
const PROJECT_SCOPE_CONFLICT_RESPONSE = errorResponseSchema(['PROJECT_SCOPE_INVALID']);

/**
 * Parse a request segment with the existing Zod boundary and return readable
 * field errors through the Foundation error envelope when validation fails.
 */
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

/**
 * Read the small amount of client metadata stored with an authenticated
 * session. It does not decide identity, company, permissions, or project scope.
 */
function clientInfo(request: FastifyRequest) {
  const userAgentHeader = request.headers['user-agent'];
  const userAgent = Array.isArray(userAgentHeader)
    ? (userAgentHeader[0] ?? '')
    : (userAgentHeader ?? '');

  return {
    ip: request.ip,
    userAgent
  };
}

/**
 * Register final Module 2 Administration routes with simple OpenAPI metadata.
 * Business rules remain in the service and Project scope comes from explicit
 * server-owned Administration scope records.
 */
export async function registerAdministrationRoutes(
  app: FastifyInstance,
  options: AdministrationRoutesOptions
): Promise<void> {
  const database = options.database;
  const service = new AdministrationService(database, options.authActionTokenSecret);

  // Authenticate one active user through the final Module 2 login route.
  app.post('/api/v1/auth/login', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationLogin',
      summary: 'Login',
      description: 'Authenticate an active user and create separate opaque access and refresh credentials.',
      security: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          password: { type: 'string', minLength: 1, maxLength: 4096 }
        }
      },
      response: {
        200: dataEnvelopeSchema(AUTH_RESULT_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    const body = parseRequest(signInBodySchema, request.body, 'body');
    const result = await service.signIn(body, clientInfo(request));
    return reply.send({ data: result });
  });


  // Rotate an existing refresh session. This route is intentionally public.
  app.post('/api/v1/auth/refresh', {
    schema: {
      tags: ['Authentication Support'],
      operationId: 'administrationRefreshSession',
      summary: 'Refresh session',
      description: 'Authentication-support command used by the browser session lifecycle to rotate a valid refresh token; it is not an Administration CRUD endpoint.',
      security: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['refreshToken'],
        properties: {
          refreshToken: { type: 'string', minLength: 1, maxLength: 4096 }
        }
      },
      response: {
        200: dataEnvelopeSchema(AUTH_RESULT_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    const body = parseRequest(refreshSessionBodySchema, request.body ?? {}, 'body');
    const result = await service.refreshSession(body.refreshToken);
    return reply.send({ data: result });
  });

  // Accept a signed invitation and set the user's first password.
  app.post('/api/v1/auth/invitations/accept', {
    schema: {
      tags: ['Authentication Support'],
      operationId: 'administrationAcceptInvitation',
      summary: 'Accept invitation',
      description: 'Authentication-support command required by the Administration user-invite lifecycle; it sets the first password without adding generic user CRUD.',
      security: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 4096 },
          password: { type: 'string', minLength: 8, maxLength: 4096 }
        }
      },
      response: {
        200: dataEnvelopeSchema({
          type: 'object',
          additionalProperties: false,
          required: ['completed'],
          properties: { completed: { type: 'boolean' } }
        }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    const body = parseRequest(acceptInvitationBodySchema, request.body, 'body');
    const result = await service.acceptInvitation(body);
    return reply.send({ data: result });
  });

  // Start password recovery without revealing whether the submitted email exists.
  app.post('/api/v1/auth/password-reset/request', {
    schema: {
      tags: ['Authentication Support'],
      operationId: 'administrationRequestPasswordReset',
      summary: 'Request password reset',
      description: 'Authentication-support command that starts password recovery without revealing whether the submitted account exists.',
      security: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email'],
        properties: { email: { type: 'string', format: 'email', maxLength: 320 } }
      },
      response: {
        200: dataEnvelopeSchema({
          type: 'object',
          additionalProperties: false,
          required: ['accepted'],
          properties: { accepted: { type: 'boolean' } }
        }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    const body = parseRequest(requestPasswordResetBodySchema, request.body, 'body');
    const result = await service.requestPasswordReset(body);
    return reply.send({ data: result });
  });

  // Complete a signed password reset and revoke all older sessions.
  app.post('/api/v1/auth/password-reset/complete', {
    schema: {
      tags: ['Authentication Support'],
      operationId: 'administrationCompletePasswordReset',
      summary: 'Complete password reset',
      description: 'Authentication-support command that consumes a signed reset token, replaces the password, and revokes older sessions.',
      security: [],
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['token', 'password'],
        properties: {
          token: { type: 'string', minLength: 1, maxLength: 4096 },
          password: { type: 'string', minLength: 8, maxLength: 4096 }
        }
      },
      response: {
        200: dataEnvelopeSchema({
          type: 'object',
          additionalProperties: false,
          required: ['completed'],
          properties: { completed: { type: 'boolean' } }
        }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    const body = parseRequest(completePasswordResetBodySchema, request.body, 'body');
    const result = await service.completePasswordReset(body);
    return reply.send({ data: result });
  });

  // Revoke the current bearer session through the final Module 2 logout route.
  app.post('/api/v1/auth/logout', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationLogout',
      summary: 'Logout',
      security: BEARER_SECURITY,
      body: EMPTY_BODY_OPENAPI_SCHEMA,
      response: {
        200: dataEnvelopeSchema({
          type: 'object',
          additionalProperties: false,
          required: ['revoked'],
          properties: { revoked: { type: 'boolean' } }
        }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    parseRequest(signOutBodySchema, request.body ?? {}, 'body');
    const result = await service.signOut(readBearerToken(request));
    return reply.send({ data: result });
  });

  // Return the authenticated user's server-derived identity and permissions.
  app.get('/api/v1/auth/me', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationGetCurrentIdentity',
      summary: 'Get current identity',
      security: BEARER_SECURITY,
      response: {
        200: dataEnvelopeSchema(CURRENT_IDENTITY_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const result = await service.getCurrentIdentity();
    return reply.send({ data: result });
  });

  // Read the Foundation Company master through the narrow Administration Organization Profile surface.
  app.get('/api/v1/admin/organization-profile', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationGetOrganizationProfile',
      summary: 'Get organization profile',
      description: 'Returns the authenticated company profile. Base currency, status and fiscal settings are read-only on this narrow Administration surface.',
      security: BEARER_SECURITY,
      response: {
        200: dataEnvelopeSchema(ORGANIZATION_PROFILE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const result = await service.getOrganizationProfile();
    return reply.send({ data: result });
  });

  // Update only non-financial Organization Profile fields; company ownership remains server-derived.
  app.patch('/api/v1/admin/organization-profile', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationUpdateOrganizationProfile',
      summary: 'Update organization profile',
      description: 'Updates legal/display name, time zone and locale only. Company status, base currency and fiscal settings remain Foundation/Finance controlled.',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          legalName: { type: 'string', minLength: 1, maxLength: 200 },
          displayName: { type: 'string', minLength: 1, maxLength: 200 },
          timeZone: { type: 'string', minLength: 1, maxLength: 100 },
          locale: { type: 'string', minLength: 1, maxLength: 35 }
        }
      },
      response: {
        200: dataEnvelopeSchema(ORGANIZATION_PROFILE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const body = parseRequest(updateOrganizationProfileBodySchema, request.body, 'body');
    const result = await service.updateOrganizationProfile(body);
    return reply.send({ data: result });
  });

  // Final Module 2 user list route. Company and project authority still come from the authenticated context.
  app.get('/api/v1/admin/users', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationListUsers',
      summary: 'List users',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          search: { type: 'string', minLength: 1, maxLength: 200 },
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      response: {
        200: dataEnvelopeSchema(USERS_PAGE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const query = parseRequest(listUsersQuerySchema, request.query, 'query');
    const result = await service.listUsers(query);
    return reply.send({ data: result });
  });

  // Final Module 2 user create route. The server owns company, actor, permissions and onboarding state.
  app.post('/api/v1/admin/users', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationCreateUser',
      summary: 'Create user',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['email', 'name'],
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          phone: { type: 'string', nullable: true, minLength: 1, maxLength: 50 },
          name: { type: 'string', minLength: 1, maxLength: 200 }
        }
      },
      response: {
        201: dataEnvelopeSchema(USER_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const body = parseRequest(createUserBodySchema, request.body, 'body');
    const result = await service.createUser(body);
    return reply.status(201).send({ data: result });
  });

  // Final Module 2 user update route handles permitted profile and lifecycle fields together.
  app.patch('/api/v1/admin/users/:id', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationUpdateUser',
      summary: 'Update user or user status',
      security: BEARER_SECURITY,
      params: USER_ID_PARAMS_OPENAPI_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        minProperties: 1,
        properties: {
          email: { type: 'string', format: 'email', maxLength: 320 },
          phone: { type: 'string', nullable: true, minLength: 1, maxLength: 50 },
          name: { type: 'string', minLength: 1, maxLength: 200 },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] }
        }
      },
      response: {
        200: dataEnvelopeSchema(USER_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const params = parseRequest(userIdParamsSchema, request.params, 'params');
    const body = parseRequest(adminUpdateUserBodySchema, request.body, 'body');

    const user = await service.updateUser(params.id, body);
    return reply.send({ data: user });
  });

  // Final Module 2 Department list route.
  app.get('/api/v1/admin/departments', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationListDepartments',
      summary: 'List departments',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      response: {
        200: dataEnvelopeSchema(DEPARTMENTS_PAGE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const query = parseRequest(listDepartmentsQuerySchema, request.query, 'query');
    const result = await service.listDepartments(query);
    return reply.send({ data: result });
  });

  // Final Module 2 command creates one company-owned Department.
  app.post('/api/v1/admin/departments', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationCreateDepartment',
      summary: 'Create department',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 160 }
        }
      },
      response: {
        201: dataEnvelopeSchema(DEPARTMENT_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const body = parseRequest(createDepartmentBodySchema, request.body, 'body');
    const result = await service.createDepartment(body);
    return reply.status(201).send({ data: result });
  });

  // List company-visible roles through the final Module 2 route.
  app.get('/api/v1/admin/roles', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationListRoles',
      summary: 'List roles',
      security: BEARER_SECURITY,
      querystring: {
        type: 'object',
        additionalProperties: false,
        properties: {
          page: { type: 'integer', minimum: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 100 }
        }
      },
      response: {
        200: dataEnvelopeSchema(ROLES_PAGE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const query = parseRequest(listRolesQuerySchema, request.query, 'query');
    const result = await service.listRoles(query);
    return reply.send({ data: result });
  });

  // Final Module 2 company-role create route.
  app.post('/api/v1/admin/roles', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationCreateRole',
      summary: 'Create role',
      security: BEARER_SECURITY,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'name'],
        properties: {
          code: { type: 'string', minLength: 1, maxLength: 100 },
          name: { type: 'string', minLength: 1, maxLength: 160 },
          description: { type: 'string', nullable: true, minLength: 1, maxLength: 500 }
        }
      },
      response: {
        201: dataEnvelopeSchema(ROLE_SCHEMA),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const body = parseRequest(createRoleBodySchema, request.body, 'body');
    const result = await service.createRole(body);
    return reply.status(201).send({ data: result });
  });

  // Final Module 2 command for replacing one company role's full permission set.
  app.put('/api/v1/admin/roles/:id/permissions', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationReplaceRolePermissions',
      summary: 'Replace role permissions',
      security: BEARER_SECURITY,
      params: USER_ID_PARAMS_OPENAPI_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['permissionCodes'],
        properties: {
          permissionCodes: {
            type: 'array',
            uniqueItems: true,
            items: { type: 'string', minLength: 1, maxLength: 150 }
          }
        }
      },
      response: {
        200: dataEnvelopeSchema({ type: 'array', items: { type: 'string' } }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const params = parseRequest(roleIdParamsSchema, request.params, 'params');
    const body = parseRequest(replaceRolePermissionsBodySchema, request.body, 'body');
    const result = await service.replaceRolePermissions(params.id, body);
    return reply.send({ data: result });
  });

  // Replace one user's company-level role set without mixing Project access into roles.
  app.put('/api/v1/admin/users/:id/roles', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationReplaceUserRoles',
      summary: 'Replace user roles',
      security: BEARER_SECURITY,
      params: USER_ID_PARAMS_OPENAPI_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['roleIds'],
        properties: {
          roleIds: {
            type: 'array',
            uniqueItems: true,
            items: UUID_SCHEMA
          }
        }
      },
      response: {
        200: dataEnvelopeSchema({ type: 'array', items: UUID_SCHEMA }),
        ...COMMON_ERROR_RESPONSES
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const params = parseRequest(userIdParamsSchema, request.params, 'params');
    const body = parseRequest(replaceAdminUserRolesBodySchema, request.body, 'body');
    const result = await service.replaceAdminUserRoles(params.id, body);
    return reply.send({ data: result });
  });

  // Final Module 2 command replaces explicit Project access without mixing it into role assignment.
  app.put('/api/v1/admin/users/:id/project-scopes', {
    schema: {
      tags: ['Module 2 - Administration'],
      operationId: 'administrationReplaceUserProjectScopes',
      summary: 'Replace user Project scopes',
      description: 'Replaces the explicit same-company Projects this user may access. Company-level system administrators keep all-project access through their system role.',
      security: BEARER_SECURITY,
      params: USER_ID_PARAMS_OPENAPI_SCHEMA,
      body: {
        type: 'object',
        additionalProperties: false,
        required: ['projectScopes'],
        properties: {
          projectScopes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['projectId'],
              properties: {
                projectId: UUID_SCHEMA,
                roleCode: { type: 'string', nullable: true, minLength: 1, maxLength: 100 }
              }
            }
          }
        }
      },
      response: {
        200: dataEnvelopeSchema({ type: 'array', items: USER_PROJECT_SCOPE_SCHEMA }),
        400: ROLE_ASSIGNMENT_INVALID_REQUEST_RESPONSE,
        401: ROLE_ASSIGNMENT_AUTHENTICATION_RESPONSE,
        403: ROLE_ASSIGNMENT_AUTHORIZATION_RESPONSE,
        404: errorResponseSchema(['USER_NOT_FOUND']),
        409: PROJECT_SCOPE_CONFLICT_RESPONSE,
        500: ROLE_ASSIGNMENT_INTERNAL_ERROR_RESPONSE
      }
    }
  }, async (request, reply) => {
    await authenticateRequest(request, database);
    const params = parseRequest(userIdParamsSchema, request.params, 'params');
    const body = parseRequest(replaceAdminUserProjectScopesBodySchema, request.body, 'body');
    const result = await service.replaceAdminUserProjectScopes(params.id, body);
    return reply.send({ data: result });
  });

}
