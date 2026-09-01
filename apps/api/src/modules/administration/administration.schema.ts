import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError
} from '@construction-erp/errors';
import { z } from 'zod';

/**
 * Final Module 2 Administration request-boundary contract.
 *
 * Authority fields such as companyId, actor identity and effective permissions
 * are deliberately absent. They are resolved from trusted server context.
 * Project-scope boundary schemas live here after the Project table exists; protected
 * authentication resolves trusted Project access from server-owned Administration records.
 */

export const ADMINISTRATION_MAX_PAGE_SIZE = 100;

export const ADMINISTRATION_PERMISSION_CODES = Object.freeze([
  'admin.users.read',
  'admin.users.manage',
  'admin.roles.read',
  'admin.roles.manage',
  'admin.project_scopes.manage',
  'admin.departments.manage'
] as const);

/** Exact Final-21 Module 2 route contract from the controlling requirements. */
export const ADMINISTRATION_REQUIRED_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'POST', route: '/api/v1/auth/login' }),
  Object.freeze({ method: 'POST', route: '/api/v1/auth/logout' }),
  Object.freeze({ method: 'GET', route: '/api/v1/auth/me' }),
  Object.freeze({ method: 'GET', route: '/api/v1/admin/users' }),
  Object.freeze({ method: 'POST', route: '/api/v1/admin/users' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/admin/users/:id' }),
  Object.freeze({ method: 'GET', route: '/api/v1/admin/roles' }),
  Object.freeze({ method: 'POST', route: '/api/v1/admin/roles' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/admin/roles/:id/permissions' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/admin/users/:id/roles' }),
  Object.freeze({ method: 'PUT', route: '/api/v1/admin/users/:id/project-scopes' }),
  Object.freeze({ method: 'GET', route: '/api/v1/admin/departments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/admin/departments' })
] as const);

/** Supporting authentication commands required by the implemented session, invite, and recovery lifecycle. */
export const ADMINISTRATION_SUPPORT_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'POST', route: '/api/v1/auth/refresh' }),
  Object.freeze({ method: 'POST', route: '/api/v1/auth/invitations/accept' }),
  Object.freeze({ method: 'POST', route: '/api/v1/auth/password-reset/request' }),
  Object.freeze({ method: 'POST', route: '/api/v1/auth/password-reset/complete' })
] as const);

/** Narrow route amendment that resolves the Final-21 Organization Profile UI requirement without adding Company CRUD. */
export const ADMINISTRATION_ORGANIZATION_PROFILE_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/admin/organization-profile' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/admin/organization-profile' })
] as const);


export const ADMINISTRATION_ERROR_CODES = Object.freeze([
  'AUTH_INVALID_CREDENTIALS',
  'AUTH_SESSION_EXPIRED',
  'USER_NOT_FOUND',
  'DUPLICATE_USER_EMAIL',
  'ROLE_NOT_FOUND',
  'FORBIDDEN',
  'PROJECT_SCOPE_INVALID',
  'CROSS_COMPANY_FORBIDDEN'
] as const);

export type AdministrationPermissionCode = (typeof ADMINISTRATION_PERMISSION_CODES)[number];
export type AdministrationErrorCode = (typeof ADMINISTRATION_ERROR_CODES)[number];


const uuidSchema = z.string().uuid();
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const nameSchema = z.string().trim().min(1).max(200);
const phoneSchema = z.string().trim().min(1).max(50);
const secretTokenSchema = z.string().min(1).max(4096);
const passwordInputSchema = z.string().min(1).max(4096);
const newPasswordSchema = z.string().min(8).max(4096);
const searchSchema = z.string().trim().min(1).max(200);
const roleCodeSchema = z.string().trim().min(1).max(100);
const roleNameSchema = z.string().trim().min(1).max(160);
const roleDescriptionSchema = z.string().trim().min(1).max(500);
const permissionCodeInputSchema = z.string().trim().min(1).max(150);
const departmentNameSchema = z.string().trim().min(1).max(160);

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(ADMINISTRATION_MAX_PAGE_SIZE).optional()
} as const;

export const userIdParamsSchema = z.object({
  id: uuidSchema
}).strict();

export const roleIdParamsSchema = z.object({
  id: uuidSchema
}).strict();

export const signInBodySchema = z.object({
  email: emailSchema,
  password: passwordInputSchema
}).strict();

/** Require the refresh secret only on the public refresh command. */
export const refreshSessionBodySchema = z.object({
  refreshToken: secretTokenSchema
}).strict();

export const signOutBodySchema = z.object({}).strict();

export const acceptInvitationBodySchema = z.object({
  token: secretTokenSchema,
  password: newPasswordSchema
}).strict();

export const requestPasswordResetBodySchema = z.object({
  email: emailSchema
}).strict();

export const completePasswordResetBodySchema = z.object({
  token: secretTokenSchema,
  password: newPasswordSchema
}).strict();

export const listUsersQuerySchema = z.object({
  search: searchSchema.optional(),
  ...paginationQueryShape
}).strict();

export const createUserBodySchema = z.object({
  email: emailSchema,
  phone: phoneSchema.nullable().optional(),
  name: nameSchema
}).strict();

/** Validate the final Administration user update command for permitted profile and status fields. */
export const adminUpdateUserBodySchema = z.object({
  email: emailSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  name: nameSchema.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
}).strict().refine(
  (value) => value.email !== undefined || value.phone !== undefined || value.name !== undefined || value.status !== undefined,
  { message: 'At least one editable user field or status is required.' }
);

export const listRolesQuerySchema = z.object({
  ...paginationQueryShape
}).strict();

/** Validate the bounded Department list query. */
export const listDepartmentsQuerySchema = z.object({
  ...paginationQueryShape
}).strict();

/** Validate one new company-owned Department. */
export const createDepartmentBodySchema = z.object({
  name: departmentNameSchema
}).strict();

/** Validate the narrow Organization Profile edit surface; financial/fiscal ownership fields stay read-only here. */
export const updateOrganizationProfileBodySchema = z.object({
  legalName: nameSchema.optional(),
  displayName: nameSchema.optional(),
  timeZone: z.string().trim().min(1).max(100).optional(),
  locale: z.string().trim().min(1).max(35).optional()
}).strict().refine(
  (value) => value.legalName !== undefined
    || value.displayName !== undefined
    || value.timeZone !== undefined
    || value.locale !== undefined,
  { message: 'At least one editable organization profile field is required.' }
);

export const createRoleBodySchema = z.object({
  code: roleCodeSchema,
  name: roleNameSchema,
  description: roleDescriptionSchema.nullable().optional()
}).strict();

export const replaceRolePermissionsBodySchema = z.object({
  permissionCodes: z.array(permissionCodeInputSchema).superRefine((values, context) => {
    if (new Set(values).size !== values.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Permission codes must be unique.'
      });
    }
  })
}).strict();

/** Validate the final Administration command that replaces company-level user roles. */
export const replaceAdminUserRolesBodySchema = z.object({
  roleIds: z.array(uuidSchema).superRefine((roleIds, context) => {
    if (new Set(roleIds).size !== roleIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Role IDs must be unique.'
      });
    }
  })
}).strict();

const userProjectScopeInputSchema = z.object({
  projectId: uuidSchema,
  roleCode: roleCodeSchema.nullable().optional()
}).strict();

/** Validate the final Administration command that replaces explicit Project access. */
export const replaceAdminUserProjectScopesBodySchema = z.object({
  projectScopes: z.array(userProjectScopeInputSchema).superRefine((projectScopes, context) => {
    const projectIds = projectScopes.map((scope) => scope.projectId);
    if (new Set(projectIds).size !== projectIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project IDs must be unique.'
      });
    }
  })
}).strict();

/** Validate the trusted Administration all/restricted Project-scope response boundary. */
export const resolvedProjectScopeSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('all')
  }).strict(),
  z.object({
    kind: z.literal('restricted'),
    projectIds: z.array(uuidSchema).superRefine((projectIds, context) => {
      if (new Set(projectIds).size !== projectIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Project scope IDs must be unique.'
        });
      }
    })
  }).strict()
]);

export const emptyCommandBodySchema = z.object({}).strict();

export type SignInBody = z.infer<typeof signInBodySchema>;
export type AcceptInvitationBody = z.infer<typeof acceptInvitationBodySchema>;
export type RequestPasswordResetBody = z.infer<typeof requestPasswordResetBodySchema>;
export type CompletePasswordResetBody = z.infer<typeof completePasswordResetBodySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type CreateUserBody = z.infer<typeof createUserBodySchema>;
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserBodySchema>;
export type ListRolesQuery = z.infer<typeof listRolesQuerySchema>;
export type CreateRoleBody = z.infer<typeof createRoleBodySchema>;
export type ListDepartmentsQuery = z.infer<typeof listDepartmentsQuerySchema>;
export type CreateDepartmentBody = z.infer<typeof createDepartmentBodySchema>;
export type UpdateOrganizationProfileBody = z.infer<typeof updateOrganizationProfileBodySchema>;
export type ReplaceRolePermissionsBody = z.infer<typeof replaceRolePermissionsBodySchema>;
export type ReplaceAdminUserRolesBody = z.infer<typeof replaceAdminUserRolesBodySchema>;
export type ReplaceAdminUserProjectScopesBody = z.infer<typeof replaceAdminUserProjectScopesBodySchema>;
export type ResolvedProjectScope = z.infer<typeof resolvedProjectScopeSchema>;


/** OpenAPI response shapes kept with Administration boundary schemas so routes stay small. */
export const UUID_SCHEMA = { type: 'string', format: 'uuid' } as const;
const DATE_TIME_SCHEMA = { type: 'string', format: 'date-time' } as const;
const NULLABLE_DATE_TIME_SCHEMA = { type: 'string', format: 'date-time', nullable: true } as const;
const NULLABLE_STRING_SCHEMA = { type: 'string', nullable: true } as const;
/** Administration OpenAPI shape for trusted resolved Project scope. */
export const RESOLVED_PROJECT_SCOPE_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['all'] }
      }
    },
    {
      type: 'object',
      additionalProperties: false,
      required: ['kind', 'projectIds'],
      properties: {
        kind: { type: 'string', enum: ['restricted'] },
        projectIds: { type: 'array', uniqueItems: true, items: UUID_SCHEMA }
      }
    }
  ]
} as const;

export const USER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'companyId',
    'email',
    'phone',
    'name',
    'status',
    'lastLoginAt',
    'createdAt',
    'updatedAt'
  ],
  properties: {
    id: UUID_SCHEMA,
    companyId: UUID_SCHEMA,
    email: { type: 'string', format: 'email' },
    phone: NULLABLE_STRING_SCHEMA,
    name: { type: 'string' },
    status: { type: 'string' },
    lastLoginAt: NULLABLE_DATE_TIME_SCHEMA,
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA
  }
} as const;

export const ROLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'companyId',
    'code',
    'name',
    'description',
    'isSystem',
    'status',
    'createdAt',
    'updatedAt'
  ],
  properties: {
    id: UUID_SCHEMA,
    companyId: { type: 'string', format: 'uuid', nullable: true },
    code: { type: 'string' },
    name: { type: 'string' },
    description: NULLABLE_STRING_SCHEMA,
    isSystem: { type: 'boolean' },
    status: { type: 'string' },
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA
  }
} as const;


/** Final Administration readback shape for one explicit Project access scope. */
export const USER_PROJECT_SCOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'projectId', 'roleCode', 'status'],
  properties: {
    id: UUID_SCHEMA,
    projectId: UUID_SCHEMA,
    roleCode: NULLABLE_STRING_SCHEMA,
    status: { type: 'string' }
  }
} as const;


/** Final Administration readback shape for one Department. */
export const DEPARTMENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'status', 'createdAt', 'updatedAt'],
  properties: {
    id: UUID_SCHEMA,
    name: { type: 'string' },
    status: { type: 'string' },
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA
  }
} as const;

/** Organization Profile readback is the trusted Foundation Company master projected through Administration. */
export const ORGANIZATION_PROFILE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'legalName',
    'displayName',
    'status',
    'baseCurrency',
    'timeZone',
    'locale',
    'fiscalSettings',
    'createdAt',
    'updatedAt'
  ],
  properties: {
    id: UUID_SCHEMA,
    legalName: { type: 'string' },
    displayName: { type: 'string' },
    status: { type: 'string' },
    baseCurrency: { type: 'string', minLength: 3, maxLength: 3 },
    timeZone: { type: 'string' },
    locale: { type: 'string' },
    fiscalSettings: { type: 'object', additionalProperties: true },
    createdAt: DATE_TIME_SCHEMA,
    updatedAt: DATE_TIME_SCHEMA
  }
} as const;

export const ADMIN_USER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...USER_SCHEMA.required, 'roleIds', 'projectScopes'],
  properties: {
    ...USER_SCHEMA.properties,
    roleIds: { type: 'array', items: UUID_SCHEMA },
    projectScopes: { type: 'array', items: USER_PROJECT_SCOPE_SCHEMA }
  }
} as const;

export const ADMIN_ROLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...ROLE_SCHEMA.required, 'permissionCodes'],
  properties: {
    ...ROLE_SCHEMA.properties,
    permissionCodes: { type: 'array', items: { type: 'string' } }
  }
} as const;

const ERROR_ENVELOPE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'message', 'requestId'],
      properties: {
        code: { type: 'string' },
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

export const COMMON_ERROR_RESPONSES = {
  400: ERROR_ENVELOPE_SCHEMA,
  401: ERROR_ENVELOPE_SCHEMA,
  403: ERROR_ENVELOPE_SCHEMA,
  404: ERROR_ENVELOPE_SCHEMA,
  409: ERROR_ENVELOPE_SCHEMA,
  500: ERROR_ENVELOPE_SCHEMA
} as const;

export const BEARER_SECURITY = [{ bearerAuth: [] }] as const;
export const USER_ID_PARAMS_OPENAPI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: UUID_SCHEMA }
} as const;
export const EMPTY_BODY_OPENAPI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  maxProperties: 0
} as const;

export const AUTH_RESULT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['user', 'session', 'accessToken', 'refreshToken', 'permissions', 'projectScope'],
  properties: {
    user: USER_SCHEMA,
    session: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'accessExpiresAt', 'expiresAt'],
      properties: {
        id: UUID_SCHEMA,
        accessExpiresAt: DATE_TIME_SCHEMA,
        expiresAt: DATE_TIME_SCHEMA
      }
    },
    accessToken: { type: 'string' },
    refreshToken: { type: 'string' },
    permissions: { type: 'array', items: { type: 'string' } },
    projectScope: RESOLVED_PROJECT_SCOPE_SCHEMA
  }
} as const;

export const CURRENT_IDENTITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['user', 'permissions', 'projectScope'],
  properties: {
    user: USER_SCHEMA,
    permissions: { type: 'array', items: { type: 'string' } },
    projectScope: RESOLVED_PROJECT_SCOPE_SCHEMA
  }
} as const;

export const USERS_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: ADMIN_USER_SCHEMA },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;


export const DEPARTMENTS_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: DEPARTMENT_SCHEMA },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

export const ROLES_PAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items', 'availablePermissionCodes', 'total', 'page', 'pageSize'],
  properties: {
    items: { type: 'array', items: ADMIN_ROLE_SCHEMA },
    availablePermissionCodes: { type: 'array', uniqueItems: true, items: { type: 'string' } },
    total: { type: 'integer', minimum: 0 },
    page: { type: 'integer', minimum: 1 },
    pageSize: { type: 'integer', minimum: 1, maximum: 100 }
  }
} as const;

/**
 * Wrap a response data schema in the API's stable success envelope.
 */
export function dataEnvelopeSchema(dataSchema: object) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['data'],
    properties: { data: dataSchema }
  } as const;
}

const ADMINISTRATION_ERROR_MESSAGES: Readonly<Record<AdministrationErrorCode, string>> = Object.freeze({
  AUTH_INVALID_CREDENTIALS: 'The supplied credentials are invalid.',
  AUTH_SESSION_EXPIRED: 'The authentication session has expired.',
  USER_NOT_FOUND: 'The requested user was not found.',
  DUPLICATE_USER_EMAIL: 'A user with this email already exists.',
  ROLE_NOT_FOUND: 'The requested role was not found.',
  FORBIDDEN: 'You are not allowed to perform this action.',
  PROJECT_SCOPE_INVALID: 'The requested Project scope is invalid.',
  CROSS_COMPANY_FORBIDDEN: 'The requested resource is outside the active company.'
});

/** Include an optional internal cause without exposing it in the public error message. */
function withCause(cause: unknown): Readonly<{ cause?: unknown }> {
  return cause === undefined ? {} : { cause };
}

/**
 * Centralizes the stable Administration error-code -> HTTP/category mapping before
 * routes exist. Later repository/service passes should call this factory rather
 * than inventing alternate public codes for the documented conflicts.
 */
export function createAdministrationError(code: AdministrationErrorCode, cause?: unknown): AppError {
  const message = ADMINISTRATION_ERROR_MESSAGES[code];
  const causeOptions = withCause(cause);

  switch (code) {
    case 'AUTH_INVALID_CREDENTIALS':
    case 'AUTH_SESSION_EXPIRED':
      return new AuthenticationError({ code, message, ...causeOptions });
    case 'USER_NOT_FOUND':
    case 'ROLE_NOT_FOUND':
      return new NotFoundError({ code, message, ...causeOptions });
    case 'FORBIDDEN':
    case 'CROSS_COMPANY_FORBIDDEN':
      return new AuthorizationError({ code, message, ...causeOptions });
    case 'DUPLICATE_USER_EMAIL':
    case 'PROJECT_SCOPE_INVALID':
      return new ConflictError({ code, message, ...causeOptions });
  }
}

