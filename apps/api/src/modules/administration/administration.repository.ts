import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { ADMINISTRATION_MAX_PAGE_SIZE } from './administration.schema.js';
import type { AuthActionPurpose } from '../../plugins/authentication.js';

/**
 * Final Module 2 Administration repository boundary.
 *
 * Every company-owned read/write derives tenant authority from the active
 * RequestSecurityContext through requireCompanyRepositoryScope(). Callers do
 * not pass companyId. Final Administration keeps explicit Project access in
 * user_project_scopes as the single explicit Project-access source.
 *
 * The same repository may be bound to a PrismaClient or to a service-owned
 * transaction client. Multi-step business operations (role replacement,
 * lifecycle commands, audit/outbox, etc.) are intentionally orchestrated by
 * the service layer.
 */

type RepositoryClient = DatabaseClient | TransactionClient;

// TEMPORARY: keep authentication/company isolation, but bypass role permissions and Project scope authorization.
const TEMPORARY_AUTHORIZATION_BYPASS = true;

export type RepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListUsersRepositoryInput = RepositoryPageWindow & Readonly<{
  search?: string;
}>;

export type CreateUserRepositoryInput = Readonly<{
  email: string;
  phone?: string | null;
  name: string;
  status: string;
}>;

export type UpdateUserRepositoryInput = Readonly<{
  email?: string | undefined;
  phone?: string | null | undefined;
  name?: string | undefined;
  status?: string | undefined;
}>;

export type SetUserPasswordRepositoryInput = Readonly<{
  userId: string;
  passwordHash: string;
  passwordChangedAt: Date;
}>;

export type SetUserAuthActionRepositoryInput = Readonly<{
  userId: string;
  purpose: AuthActionPurpose;
  nonce: string;
  expiresAt: Date;
}>;

export type ConsumeUserAuthActionRepositoryInput = SetUserAuthActionRepositoryInput & Readonly<{
  now: Date;
}>;

export type CreateSessionRepositoryInput = Readonly<{
  userId: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  expiresAt: Date;
  ip: string;
  userAgent: string;
}>;

export type RotateSessionRepositoryInput = Readonly<{
  sessionId: string;
  currentRefreshTokenHash: string;
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  expiresAt: Date;
}>;

export type CreateDepartmentRepositoryInput = Readonly<{
  name: string;
  status: string;
}>;

export type UpdateOrganizationProfileRepositoryInput = Readonly<{
  legalName?: string | undefined;
  displayName?: string | undefined;
  timeZone?: string | undefined;
  locale?: string | undefined;
}>;

export type CreateRoleRepositoryInput = Readonly<{
  code: string;
  name: string;
  description?: string | null;
  isSystem: boolean;
  status: string;
}>;

export type CreateUserRoleRepositoryInput = Readonly<{
  userId: string;
  roleId: string;
  status: string;
}>;

export type CreateUserProjectScopeRepositoryInput = Readonly<{
  projectId: string;
  roleCode?: string | null | undefined;
}>;


export type EffectivePermissionLookupInput = Readonly<{
  userId: string;
  asOf: Date;
  assignmentStatuses: readonly string[];
  roleStatuses: readonly string[];
}>;

export type AuthenticationProjectScopeLookupInput = EffectivePermissionLookupInput & Readonly<{
  projectScopeStatuses: readonly string[];
}>;

type AuthenticationPermissionLookupInput = EffectivePermissionLookupInput;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: RepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > ADMINISTRATION_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${ADMINISTRATION_MAX_PAGE_SIZE}.`);
  }
}

/** Trim an optional search value and treat empty text as absent. */
function optionalSearch(search: string | undefined): string | undefined {
  const value = search?.trim();
  return value ? value : undefined;
}

/** Build the company-owned role visibility predicate used by role reads. */
function visibleRoleWhere<T extends Record<string, unknown>>(
  companyId: string,
  extra: T = {} as T
) {
  return { ...extra, companyId };
}

export class AdministrationRepository {
  /** Bind repository reads and writes to a Prisma client or active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /**
   * Authentication entry point. Email is looked up without request tenant
   * context because sign-in happens before identity is known. The lookup fails
   * closed if more than one company has the same email.
   */
  async findUserForAuthenticationByEmail(email: string) {
    const users = await this.db.user.findMany({
      where: { email },
      orderBy: { id: 'asc' },
      take: 2
    });
    return users.length === 1 ? users[0] : null;
  }

  /** Find the user named by a verified signed invitation/reset token. */
  async findUserForAuthActionById(userId: string) {
    return this.db.user.findUnique({
      where: { id: userId },
    });
  }

  /** Set reset state for the resolved active credential user before authenticated context exists. */
  async setUserAuthActionForAuthentication(
    companyId: string,
    input: SetUserAuthActionRepositoryInput
  ) {
    const updated = await this.db.user.updateMany({
      where: {
        id: input.userId,
        companyId,
        status: 'ACTIVE',
        passwordHash: { not: null }
      },
      data: {
        authActionPurpose: input.purpose,
        authActionNonce: input.nonce,
        authActionExpiresAt: input.expiresAt
      }
    });
    return updated.count > 0;
  }

  /** Find one session by access hash before request company context exists. */
  async findSessionForAuthenticationByAccessTokenHash(accessTokenHash: string) {
    return this.db.authSession.findUnique({
      where: { accessTokenHash },
      include: { user: true }
    });
  }

  /** Find one session by refresh hash before request company context exists. */
  async findSessionForAuthenticationByRefreshTokenHash(refreshTokenHash: string) {
    return this.db.authSession.findUnique({
      where: { refreshTokenHash },
      include: { user: true }
    });
  }

  /** Find one user inside the trusted company scope. */
  async findUserById(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.user.findFirst({
      where: scope.where({ id })
    });
  }

  /** Read the trusted Foundation Company row for the active authenticated company. */
  async getOrganizationProfile() {
    const scope = requireCompanyRepositoryScope();
    return this.db.company.findUnique({ where: { id: scope.companyId } });
  }

  /** Update only the narrow editable Organization Profile fields on the active Foundation Company. */
  async updateOrganizationProfile(input: UpdateOrganizationProfileRepositoryInput) {
    const scope = requireCompanyRepositoryScope();

    return this.db.company.update({
      where: { id: scope.companyId },
      data: {
        ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
        ...(input.locale === undefined ? {} : { locale: input.locale })
      }
    });
  }

  /** Find one company user by normalized email. */
  async findUserByEmail(email: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.user.findFirst({
      where: scope.where({ email })
    });
  }

  /** List company users with final company roles and explicit Project scopes in one paged query. */
  async listUsers(input: ListUsersRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = optionalSearch(input.search);
    const where = scope.where({
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.user.findMany({
        where,
        include: {
          roleAssignments: {
            where: { companyId: scope.companyId },
            orderBy: { roleId: 'asc' }
          },
          projectScopes: {
            where: { companyId: scope.companyId },
            orderBy: { projectId: 'asc' }
          }
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.user.count({ where })
    ]);

    return { items, total, skip: input.skip, take: input.take } as const;
  }

  /** Create one user owned by the trusted company. */
  async createUser(input: CreateUserRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.user.create({
      data: scope.createData({
        email: input.email,
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        name: input.name,
        status: input.status
      })
    });
  }

  /** Store one pending invitation/reset action without persisting the signed bearer token. */
  async setUserAuthAction(input: SetUserAuthActionRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.user.updateMany({
      where: scope.where({ id: input.userId }),
      data: {
        authActionPurpose: input.purpose,
        authActionNonce: input.nonce,
        authActionExpiresAt: input.expiresAt
      }
    });
    return updated.count > 0;
  }

  /** Clear any pending invitation/reset action for one company user. */
  async clearUserAuthAction(userId: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.user.updateMany({
      where: scope.where({ id: userId }),
      data: {
        authActionPurpose: null,
        authActionNonce: null,
        authActionExpiresAt: null
      }
    });
    return updated.count > 0;
  }

  /** Consume one matching, unexpired action exactly once and clear its server-owned state. */
  async consumeUserAuthAction(input: ConsumeUserAuthActionRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.user.updateMany({
      where: scope.where({
        id: input.userId,
        authActionPurpose: input.purpose,
        authActionNonce: input.nonce,
        authActionExpiresAt: { equals: input.expiresAt, gt: input.now }
      }),
      data: {
        authActionPurpose: null,
        authActionNonce: null,
        authActionExpiresAt: null
      }
    });
    return updated.count > 0;
  }

  /** Update editable profile and lifecycle fields for one company user. */
  async updateUser(id: string, input: UpdateUserRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const data = {
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.status === undefined ? {} : { status: input.status })
    };

    const updated = await this.db.user.updateMany({ where: scope.where({ id }), data });
    if (updated.count === 0) return null;
    return this.db.user.findFirst({ where: scope.where({ id }) });
  }

  /** Record the latest successful sign-in time for one company user. */
  async setUserLastLoginAt(id: string, lastLoginAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.user.updateMany({
      where: scope.where({ id }),
      data: { lastLoginAt }
    });
    if (updated.count === 0) return null;
    return this.db.user.findFirst({ where: scope.where({ id }) });
  }

  /** Set the password hash directly on the final Administration user record. */
  async setUserPassword(input: SetUserPasswordRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.user.updateMany({
      where: scope.where({ id: input.userId }),
      data: {
        passwordHash: input.passwordHash,
        passwordChangedAt: input.passwordChangedAt
      }
    });
    if (updated.count === 0) return null;
    return this.db.user.findFirst({ where: scope.where({ id: input.userId }) });
  }

  /** Create one company-owned session with separate access and refresh hashes. */
  async createSession(input: CreateSessionRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const user = await this.db.user.findFirst({
      where: scope.where({ id: input.userId }),
      select: { id: true }
    });
    if (!user) return null;

    return this.db.authSession.create({
      data: {
        userId: input.userId,
        accessTokenHash: input.accessTokenHash,
        accessExpiresAt: input.accessExpiresAt,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt,
        ip: input.ip,
        userAgent: input.userAgent
      }
    });
  }

  /** Find one company-scoped session by hashed access token. */
  async findSessionByAccessTokenHash(accessTokenHash: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.authSession.findFirst({
      where: {
        accessTokenHash,
        user: { companyId: scope.companyId }
      },
      include: { user: true }
    });
  }

  /** List all sessions owned by one company user. */
  async listUserSessions(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.authSession.findMany({
      where: {
        userId,
        user: { companyId: scope.companyId }
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });
  }

  /** Rotate both session credentials only when the current refresh hash still matches. */
  async rotateSession(input: RotateSessionRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.authSession.updateMany({
      where: {
        id: input.sessionId,
        refreshTokenHash: input.currentRefreshTokenHash,
        revokedAt: null,
        user: { companyId: scope.companyId }
      },
      data: {
        accessTokenHash: input.accessTokenHash,
        accessExpiresAt: input.accessExpiresAt,
        refreshTokenHash: input.refreshTokenHash,
        expiresAt: input.expiresAt
      }
    });
    if (updated.count === 0) return null;
    return this.db.authSession.findFirst({
      where: {
        id: input.sessionId,
        user: { companyId: scope.companyId }
      }
    });
  }

  /** Revoke one company-scoped session. */
  async revokeSession(sessionId: string, revokedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.authSession.updateMany({
      where: {
        id: sessionId,
        user: { companyId: scope.companyId }
      },
      data: { revokedAt }
    });
    return updated.count > 0;
  }

  /** Revoke every active session for one company user. */
  async revokeAllUserSessions(userId: string, revokedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const user = await this.db.user.findFirst({
      where: scope.where({ id: userId }),
      select: { id: true }
    });
    if (!user) return null;

    const result = await this.db.authSession.updateMany({
      where: {
        userId,
        revokedAt: null,
        user: { companyId: scope.companyId }
      },
      data: { revokedAt }
    });
    return result.count;
  }

  /** Find one role visible to the trusted company. */
  async findRoleById(roleId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.role.findFirst({
      where: visibleRoleWhere(scope.companyId, { id: roleId })
    });
  }

  /** Find one role code owned by the trusted company for company-scoped uniqueness checks. */
  async findRoleByCode(code: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.role.findFirst({
      where: { code, companyId: scope.companyId }
    });
  }

  /** Find one role owned directly by the trusted company. */
  async findCompanyRoleById(roleId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.role.findFirst({
      where: scope.where({ id: roleId })
    });
  }

  /** List visible roles and permission codes in one paged query. */
  async listRoles(input: RepositoryPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = visibleRoleWhere(scope.companyId);

    const [items, total] = await Promise.all([
      this.db.role.findMany({
        where,
        include: {
          rolePermissions: {
            select: { permissionCode: true },
            orderBy: { permissionCode: 'asc' }
          }
        },
        orderBy: [{ isSystem: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.role.count({ where })
    ]);

    return { items, total, skip: input.skip, take: input.take } as const;
  }

  /** Find one Department by name inside the authenticated company. */
  async findDepartmentByName(name: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.department.findFirst({
      where: scope.where({ name: { equals: name, mode: 'insensitive' as const } })
    });
  }

  /** List company-owned Departments with bounded pagination. */
  async listDepartments(input: RepositoryPageWindow) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({});

    const [items, total] = await Promise.all([
      this.db.department.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.department.count({ where })
    ]);

    return { items, total, skip: input.skip, take: input.take } as const;
  }

  /** Create one Department owned by the trusted company. */
  async createDepartment(input: CreateDepartmentRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.department.create({
      data: scope.createData({
        name: input.name,
        status: input.status
      })
    });
  }

  /** Create one custom role owned by the trusted company. */
  async createCompanyRole(input: CreateRoleRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.role.create({
      data: scope.createData({
        code: input.code,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        isSystem: input.isSystem,
        status: input.status
      })
    });
  }

  /** Load visible roles and permission codes for assignment checks. */
  async findVisibleRolesByIds(roleIds: readonly string[]) {
    if (roleIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.role.findMany({
      where: visibleRoleWhere(scope.companyId, {
        id: { in: [...new Set(roleIds)] }
      }),
      include: {
        rolePermissions: {
          select: { permissionCode: true },
          orderBy: { permissionCode: 'asc' }
        }
      },
      orderBy: { id: 'asc' }
    });
  }

  /** Resolve stable permission rows from allow-listed codes. */
  async findPermissionsByCodes(codes: readonly string[]) {
    if (codes.length === 0) return [];
    return this.db.permission.findMany({
      where: { code: { in: [...new Set(codes)] } },
      orderBy: { code: 'asc' }
    });
  }

  /** List the full permission catalog in stable code order. */
  async listPermissionCodes() {
    const rows = await this.db.permission.findMany({
      select: { code: true },
      orderBy: { code: 'asc' }
    });
    return rows.map((row) => row.code);
  }

  /** List the permission codes currently assigned to one visible role. */
  async listRolePermissionCodes(roleId: string) {
    const role = await this.findRoleById(roleId);
    if (!role) return null;

    const rows = await this.db.rolePermission.findMany({
      where: { roleId },
      select: { permissionCode: true },
      orderBy: { permissionCode: 'asc' }
    });
    return rows.map((row) => row.permissionCode);
  }

  /**
   * Primitive for a service-owned replacement transaction. Only a role owned
   * by the active company may be mutated; a global role is visible but cannot
   * be modified through a tenant-scoped repository command.
   */
  async deleteCompanyRolePermissions(roleId: string) {
    const role = await this.findCompanyRoleById(roleId);
    if (!role) return null;
    const result = await this.db.rolePermission.deleteMany({ where: { roleId } });
    return result.count;
  }

  /** Create role grants from validated stable permission codes inside the service-owned replacement transaction. */
  async createCompanyRolePermissions(roleId: string, permissionCodes: readonly string[]) {
    const role = await this.findCompanyRoleById(roleId);
    if (!role) return null;
    if (permissionCodes.length === 0) return 0;

    const uniqueCodes = [...new Set(permissionCodes)];
    const result = await this.db.rolePermission.createMany({
      data: uniqueCodes.map((permissionCode) => ({ roleId, permissionCode })),
      skipDuplicates: true
    });
    return result.count;
  }

  /** Lock one same-company User before replacing the complete role-assignment set. */
  async lockUserForRoleAssignmentWrite(userId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM users
      WHERE id = ${userId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  /** List the company roles assigned to one same-company user. */
  async listUserRoles(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.userRole.findMany({
      where: scope.where({ userId }),
      include: { role: true },
      orderBy: { roleId: 'asc' }
    });
  }

  /** Delete one user's company roles; explicit Project access remains separate. */
  async deleteUserRoles(userId: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.userRole.deleteMany({
      where: scope.where({ userId })
    });
    return result.count;
  }

  /** Resolve candidate Project scopes only inside the authenticated company. */
  async findCompanyProjectsByIds(projectIds: readonly string[]) {
    if (projectIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findMany({
      where: scope.where({ id: { in: [...new Set(projectIds)] } }),
      orderBy: { id: 'asc' }
    });
  }

  /** List explicit final Administration Project scopes for one same-company user. */
  async listUserProjectScopes(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.userProjectScope.findMany({
      where: scope.where({
        userId,
        user: { companyId: scope.companyId },
        project: { companyId: scope.companyId }
      }),
      orderBy: { projectId: 'asc' }
    });
  }

  /** Delete explicit Project scopes only for one same-company user. */
  async deleteUserProjectScopes(userId: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.userProjectScope.deleteMany({
      where: scope.where({ userId })
    });
    return result.count;
  }

  /** Create the validated replacement Project scopes inside the trusted company. */
  async createUserProjectScopes(
    userId: string,
    projectScopes: readonly CreateUserProjectScopeRepositoryInput[],
    status: string
  ) {
    if (projectScopes.length === 0) return 0;
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.userProjectScope.createMany({
      data: projectScopes.map((projectScope) => scope.createData({
        userId,
        projectId: projectScope.projectId,
        roleCode: projectScope.roleCode ?? null,
        status
      })),
      skipDuplicates: true
    });
    return result.count;
  }


  /** Resolve the trusted Administration Project scope before request security is bound. */
  async resolveProjectScopeForAuthentication(input: AuthenticationProjectScopeLookupInput) {
    const user = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { companyId: true }
    });
    if (!user) return { kind: 'restricted' as const, projectIds: [] as string[] };

    // TEMPORARY: set TEMPORARY_AUTHORIZATION_BYPASS to false to restore role/project-scope enforcement.
    if (TEMPORARY_AUTHORIZATION_BYPASS) return { kind: 'all' as const };

    const allProjectAssignment = await this.db.userRole.findFirst({
      where: {
        companyId: user.companyId,
        userId: input.userId,
        status: { in: [...new Set(input.assignmentStatuses)] },
        role: {
          code: 'system-admin',
          isSystem: true,
          status: { in: [...new Set(input.roleStatuses)] },
          companyId: user.companyId
        }
      },
      select: { id: true }
    });
    if (allProjectAssignment) return { kind: 'all' as const };

    if (input.projectScopeStatuses.length === 0) {
      return { kind: 'restricted' as const, projectIds: [] as string[] };
    }

    const projectScopes = await this.db.userProjectScope.findMany({
      where: {
        companyId: user.companyId,
        userId: input.userId,
        user: { companyId: user.companyId },
        project: { companyId: user.companyId },
        status: { in: [...new Set(input.projectScopeStatuses)] }
      },
      select: { projectId: true },
      distinct: ['projectId'],
      orderBy: { projectId: 'asc' }
    });

    return { kind: 'restricted' as const, projectIds: projectScopes.map((row) => row.projectId) };
  }

  /** Return candidate Projects where the user has both final Project access and the requested company permission. */
  async listProjectIdsWithPermission(
    permissionCode: string,
    projectIds: readonly string[] | null,
    input: EffectivePermissionLookupInput
  ) {
    if (projectIds !== null && projectIds.length === 0) return [];
    const scope = requireCompanyRepositoryScope();
    const permissions = await this.findPermissionCodesForScope(scope.companyId, input);
    if (!permissions.includes(permissionCode)) return [];

    const projectScope = await this.resolveProjectScopeForAuthentication({
      ...input,
      projectScopeStatuses: ['ACTIVE']
    });

    if (projectScope.kind === 'all') {
      const rows = await this.db.project.findMany({
        where: scope.where(projectIds === null ? {} : { id: { in: [...new Set(projectIds)] } }),
        select: { id: true },
        orderBy: { id: 'asc' }
      });
      return rows.map((row) => row.id);
    }

    const allowed = new Set(projectScope.projectIds);
    const candidates = projectIds === null ? projectScope.projectIds : [...new Set(projectIds)];
    return candidates.filter((projectId) => allowed.has(projectId)).sort();
  }

  /** Create one validated company role assignment inside the authenticated company. */
  async createUserRole(input: CreateUserRoleRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const user = await this.db.user.findFirst({
      where: scope.where({ id: input.userId }),
      select: { id: true }
    });
    const role = await this.db.role.findFirst({
      where: visibleRoleWhere(scope.companyId, { id: input.roleId }),
      select: { id: true }
    });
    if (!user || !role) return null;

    return this.db.userRole.create({
      data: scope.createData({
        userId: input.userId,
        roleId: input.roleId,
        status: input.status
      })
    });
  }

  /** Resolve active company-level permission codes inside a trusted company. */
  private async findPermissionCodesForScope(
    companyId: string,
    input: EffectivePermissionLookupInput
  ) {
    // TEMPORARY: keep the real catalog for responses, but bypass permission membership checks used by services.
    if (TEMPORARY_AUTHORIZATION_BYPASS) {
      const permissions = await this.listPermissionCodes();
      Object.defineProperty(permissions, 'includes', {
        value: () => true,
        enumerable: false
      });
      return permissions;
    }

    if (input.assignmentStatuses.length === 0 || input.roleStatuses.length === 0) return [];

    const assignments = await this.db.userRole.findMany({
      where: {
        companyId,
        userId: input.userId,
        user: { companyId },
        status: { in: [...new Set(input.assignmentStatuses)] },
        role: {
          status: { in: [...new Set(input.roleStatuses)] },
          companyId
        }
      },
      select: {
        role: {
          select: {
            rolePermissions: {
              select: { permissionCode: true }
            }
          }
        }
      }
    });

    const codes = new Set<string>();
    for (const assignment of assignments) {
      for (const rolePermission of assignment.role.rolePermissions) {
        codes.add(rolePermission.permissionCode);
      }
    }
    return [...codes].sort();
  }

  /** Resolve company-wide permissions before request scope exists by deriving company ownership from the trusted User row. */
  async findEffectivePermissionCodesForAuthentication(input: AuthenticationPermissionLookupInput) {
    const user = await this.db.user.findUnique({
      where: { id: input.userId },
      select: { companyId: true }
    });
    if (!user) return [];
    return this.findPermissionCodesForScope(user.companyId, input);
  }

  /** Resolve company-wide permissions after trusted company scope has already been bound. */
  async findEffectivePermissionCodes(input: EffectivePermissionLookupInput) {
    const scope = requireCompanyRepositoryScope();
    return this.findPermissionCodesForScope(scope.companyId, input);
  }

  /** Resolve company permissions only when the user may access the requested same-company Project. */
  async findEffectivePermissionCodesForProject(projectId: string, input: EffectivePermissionLookupInput) {
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: { id: true }
    });
    if (!project) return null;

    const projectScope = await this.resolveProjectScopeForAuthentication({
      ...input,
      projectScopeStatuses: ['ACTIVE']
    });
    const canAccessProject = projectScope.kind === 'all'
      || projectScope.projectIds.includes(projectId);
    if (!canAccessProject) return [];

    return this.findPermissionCodesForScope(scope.companyId, input);
  }

}

