import type { BootstrapIdentityProvisioner } from '@construction-erp/bootstrap';
import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { ConflictError, ValidationError } from '@construction-erp/errors';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { enqueueJob, enqueueUnauthenticatedJob } from '@construction-erp/queue';
import {
  bindRequestSecurityContext,
  createRequestContext,
  hasPermission,
  requireActorUserId,
  requireRequestSecurityContext,
  runWithRequestContext
} from '@construction-erp/request-context';
import {
  createAccessToken,
  createAuthActionNonce,
  createRefreshToken,
  hashAccessToken,
  hashPassword,
  hashRefreshToken,
  verifyAuthActionToken,
  verifyPassword
} from '../../plugins/authentication.js';
import { AdministrationRepository } from './administration.repository.js';
import {
  createAdministrationError,
  type AcceptInvitationBody,
  type CompletePasswordResetBody,
  type CreateRoleBody,
  type CreateDepartmentBody,
  type ListDepartmentsQuery,
  type CreateUserBody,
  type ListRolesQuery,
  type ListUsersQuery,
  ADMINISTRATION_PERMISSION_CODES,
  type AdministrationPermissionCode,
  type ReplaceRolePermissionsBody,
  type ReplaceAdminUserRolesBody,
  type ReplaceAdminUserProjectScopesBody,
  type RequestPasswordResetBody,
  type SignInBody,
  type AdminUpdateUserBody,
  type UpdateOrganizationProfileBody
} from './administration.schema.js';

const USER_ACTIVE = 'ACTIVE';
const USER_INACTIVE = 'INACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const ASSIGNMENT_ACTIVE = 'ACTIVE';
const PROJECT_SCOPE_ACTIVE = 'ACTIVE';
const DEPARTMENT_ACTIVE = 'ACTIVE';
const DEFAULT_PAGE_SIZE = 25;
const ACCESS_SESSION_TTL_MS = 15 * 60 * 1000;
const REFRESH_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVITATION_TTL_MS = 48 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;
const AUTH_NOTIFICATION_QUEUE = 'auth-notifications';
const AUTH_INVITATION_JOB = 'auth.invitation';
const AUTH_PASSWORD_RESET_JOB = 'auth.password-reset';

export type SessionClientInfo = Readonly<{
  ip: string;
  userAgent: string;
}>;

/** Convert validated pagination input into a Prisma page window. */
function pageWindow(query: { page?: number | undefined; pageSize?: number | undefined }) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize } as const;
}

/** Calculate the expiry time for the short-lived access token. */
function accessExpiry(now: Date): Date {
  return new Date(now.getTime() + ACCESS_SESSION_TTL_MS);
}

/** Calculate the expiry time for the longer-lived refresh session. */
function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + REFRESH_SESSION_TTL_MS);
}

/** Queue one invitation delivery without storing the signed invitation token. */
async function enqueueInvitationDelivery(
  tx: TransactionClient,
  userId: string,
  actionNonce: string
): Promise<void> {
  await enqueueJob(tx, {
    queueName: AUTH_NOTIFICATION_QUEUE,
    jobType: AUTH_INVITATION_JOB,
    payload: { userId, actionNonce }
  });
}

/** Queue one anonymous password-reset delivery for the trusted company user. */
async function enqueuePasswordResetDelivery(
  tx: TransactionClient,
  companyId: string,
  userId: string,
  actionNonce: string
): Promise<void> {
  await enqueueUnauthenticatedJob(tx, companyId, {
    queueName: AUTH_NOTIFICATION_QUEUE,
    jobType: AUTH_PASSWORD_RESET_JOB,
    payload: { userId, actionNonce }
  });
}

/** Create one invitation action and queue its delivery in the same transaction. */
async function issueInvitation(
  repository: AdministrationRepository,
  tx: TransactionClient,
  userId: string,
  now = new Date()
): Promise<Date> {
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
  const nonce = createAuthActionNonce();
  await repository.setUserAuthAction({
    userId,
    purpose: 'INVITATION',
    nonce,
    expiresAt
  });
  await recordOutboxEvent(tx, {
    eventType: 'auth.invitation_requested',
    resourceType: 'user',
    resourceId: userId,
    payload: { delivery: 'ASYNC', expiresAt },
    occurredAt: now
  });
  await enqueueInvitationDelivery(tx, userId, nonce);
  return expiresAt;
}

/** Return the public user fields that are safe to expose outside the service. */
function safeUser(user: {
  id: string;
  companyId: string;
  email: string;
  phone: string | null;
  name: string;
  status: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: user.id,
    companyId: user.companyId,
    email: user.email,
    phone: user.phone,
    name: user.name,
    status: user.status,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  } as const;
}


/** Return only the Foundation Company fields exposed by the Administration Organization Profile. */
function safeOrganizationProfile(company: {
  id: string;
  legalName: string;
  displayName: string;
  status: string;
  baseCurrency: string;
  timeZone: string;
  locale: string;
  fiscalSettings: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: company.id,
    legalName: company.legalName,
    displayName: company.displayName,
    status: company.status,
    baseCurrency: company.baseCurrency,
    timeZone: company.timeZone,
    locale: company.locale,
    fiscalSettings: company.fiscalSettings,
    createdAt: company.createdAt,
    updatedAt: company.updatedAt
  };
}

/** Return the public fields for one explicit final Administration Project scope. */
function safeUserProjectScope(scope: {
  id: string;
  projectId: string;
  roleCode: string | null;
  status: string;
}) {
  return {
    id: scope.id,
    projectId: scope.projectId,
    roleCode: scope.roleCode,
    status: scope.status
  } as const;
}

/**
 * Final Module 2 Administration business service.
 *
 * The service owns transactions. Audit records and durable outbox events are
 * written in the same transaction as the business change. Protected requests
 * bind trusted Project access from explicit Administration scope records, while
 * the company-owned system-admin role keeps company-wide Project access.
 */
export class AdministrationService {
  private readonly repository: AdministrationRepository;

  /** Create the service with the database client used by this request lifecycle. */
  constructor(
    private readonly db: DatabaseClient,
    private readonly authActionTokenSecret: string
  ) {
    this.repository = new AdministrationRepository(db);
  }

  /** Require one effective permission from the trusted request context. */
  private requirePermission(permission: AdministrationPermissionCode): void {
    if (!hasPermission(permission)) throw createAdministrationError('FORBIDDEN');
  }

  /** Require one Project to be inside the actor's already-resolved Project scope. */
  private requireActorProjectScope(projectId: string): void {
    const scope = requireRequestSecurityContext().projectScope;
    if (scope.kind === 'all') return;
    if (scope.kind === 'restricted' && scope.projectIds.includes(projectId)) return;
    throw createAdministrationError('PROJECT_SCOPE_INVALID');
  }

  /** Run a multi-write business operation in one database transaction. */
  private async inTransaction<T>(
    work: (repository: AdministrationRepository, tx: TransactionClient) => Promise<T>
  ): Promise<T> {
    return withTransaction(this.db, async (tx) => work(new AdministrationRepository(tx), tx));
  }

  /** Authenticate an active user and create separate access and refresh credentials. */
  async signIn(input: SignInBody, client: SessionClientInfo) {
    const now = new Date();
    const user = await this.repository.findUserForAuthenticationByEmail(input.email);

    if (!user || user.status !== USER_ACTIVE) {
      throw createAdministrationError('AUTH_INVALID_CREDENTIALS');
    }

    const passwordMatches = user.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    if (!passwordMatches) {
      throw createAdministrationError('AUTH_INVALID_CREDENTIALS');
    }

    const permissions = await this.repository.findEffectivePermissionCodesForAuthentication({
      userId: user.id,
      asOf: now,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    const projectScope = await this.repository.resolveProjectScopeForAuthentication({
      userId: user.id,
      asOf: now,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE],
      projectScopeStatuses: [PROJECT_SCOPE_ACTIVE]
    });
    bindRequestSecurityContext({
      actorUserId: user.id,
      companyId: user.companyId,
      permissions,
      projectScope
    });

    const accessToken = createAccessToken();
    const refreshToken = createRefreshToken();
    const accessTokenHash = hashAccessToken(accessToken);
    const refreshTokenHash = hashRefreshToken(refreshToken);
    const accessExpiresAt = accessExpiry(now);
    const expiresAt = sessionExpiry(now);

    const session = await this.inTransaction(async (repository) => {
      const created = await repository.createSession({
        userId: user.id,
        accessTokenHash,
        accessExpiresAt,
        refreshTokenHash,
        expiresAt,
        ip: client.ip,
        userAgent: client.userAgent
      });
      if (!created) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      const updatedUser = await repository.setUserLastLoginAt(user.id, now);
      if (!updatedUser) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');
      return created;
    });

    return {
      user: safeUser({ ...user, lastLoginAt: now }),
      session: {
        id: session.id,
        accessExpiresAt: session.accessExpiresAt,
        expiresAt: session.expiresAt
      },
      accessToken,
      refreshToken,
      permissions,
      projectScope
    };
  }

  /** Rotate a valid refresh session and return the renewed identity state. */
  async refreshSession(refreshToken: string | undefined) {
    if (!refreshToken) throw createAdministrationError('AUTH_SESSION_EXPIRED');

    const now = new Date();
    const currentHash = hashRefreshToken(refreshToken);
    const session = await this.repository.findSessionForAuthenticationByRefreshTokenHash(currentHash);

    if (
      !session
      || session.revokedAt
      || session.expiresAt <= now
      || session.user.status !== USER_ACTIVE
    ) {
      throw createAdministrationError('AUTH_SESSION_EXPIRED');
    }

    const permissions = await this.repository.findEffectivePermissionCodesForAuthentication({
      userId: session.userId,
      asOf: now,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    const projectScope = await this.repository.resolveProjectScopeForAuthentication({
      userId: session.userId,
      asOf: now,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE],
      projectScopeStatuses: [PROJECT_SCOPE_ACTIVE]
    });
    bindRequestSecurityContext({
      actorUserId: session.userId,
      companyId: session.user.companyId,
      permissions,
      projectScope
    });

    const nextAccessToken = createAccessToken();
    const nextRefreshToken = createRefreshToken();
    const nextAccessHash = hashAccessToken(nextAccessToken);
    const nextHash = hashRefreshToken(nextRefreshToken);
    const accessExpiresAt = accessExpiry(now);
    const expiresAt = sessionExpiry(now);

    const rotated = await this.inTransaction((repository) => repository.rotateSession({
      sessionId: session.id,
      currentRefreshTokenHash: currentHash,
      accessTokenHash: nextAccessHash,
      accessExpiresAt,
      refreshTokenHash: nextHash,
      expiresAt
    }));

    // The old hash must still match during the update. If another refresh won
    // first, this request is treated as an expired/replayed session.
    if (!rotated) throw createAdministrationError('AUTH_SESSION_EXPIRED');

    return {
      user: safeUser(session.user),
      session: {
        id: rotated.id,
        accessExpiresAt: rotated.accessExpiresAt,
        expiresAt: rotated.expiresAt
      },
      accessToken: nextAccessToken,
      refreshToken: nextRefreshToken,
      permissions,
      projectScope
    };
  }

  /** Accept a valid invitation, set the first password, and activate the user. */
  async acceptInvitation(input: AcceptInvitationBody) {
    const now = new Date();
    const token = verifyAuthActionToken(input.token, this.authActionTokenSecret, now);
    if (!token || token.purpose !== 'INVITATION') throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

    const user = await this.repository.findUserForAuthActionById(token.userId);
    if (
      !user
      || (user.status !== USER_INACTIVE && user.status !== USER_ACTIVE)
      || user.passwordHash
      || user.authActionPurpose !== token.purpose
      || user.authActionNonce !== token.nonce
      || !user.authActionExpiresAt
      || user.authActionExpiresAt.getTime() !== token.expiresAt.getTime()
    ) {
      throw createAdministrationError('AUTH_INVALID_CREDENTIALS');
    }

    bindRequestSecurityContext({
      actorUserId: user.id,
      companyId: user.companyId,
      permissions: [],
      projectScope: { kind: 'not-resolved' }
    });

    const passwordHash = await hashPassword(input.password);
    return this.inTransaction(async (repository, tx) => {
      const consumed = await repository.consumeUserAuthAction({
        userId: user.id,
        purpose: token.purpose,
        nonce: token.nonce,
        expiresAt: token.expiresAt,
        now
      });
      if (!consumed) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      const passwordOwner = await repository.setUserPassword({
        userId: user.id,
        passwordHash,
        passwordChangedAt: now
      });
      if (!passwordOwner) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      const activated = await repository.updateUser(user.id, { status: USER_ACTIVE });
      if (!activated) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      await recordAudit(tx, {
        action: 'auth.invitation_accepted',
        entityType: 'user',
        entityId: user.id,
        before: { status: user.status },
        after: { status: activated.status }
      });

      if (user.status !== USER_ACTIVE) {
        await recordOutboxEvent(tx, {
          eventType: 'user.status_changed',
          resourceType: 'user',
          resourceId: user.id,
          payload: { status: activated.status },
          occurredAt: now
        });
      }

      return { completed: true } as const;
    });
  }

  /** Start a password-reset action without revealing whether the email exists. */
  async requestPasswordReset(input: RequestPasswordResetBody) {
    const user = await this.repository.findUserForAuthenticationByEmail(input.email);
    if (!user || user.status !== USER_ACTIVE || !user.passwordHash) {
      return { accepted: true } as const;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
    const actionNonce = createAuthActionNonce();

    await withTransaction(this.db, async (tx) => {
      const repository = new AdministrationRepository(tx);
      const updated = await repository.setUserAuthActionForAuthentication(user.companyId, {
        userId: user.id,
        purpose: 'PASSWORD_RESET',
        nonce: actionNonce,
        expiresAt
      });
      if (!updated) return;

      await enqueuePasswordResetDelivery(tx, user.companyId, user.id, actionNonce);
    });

    return { accepted: true } as const;
  }

  /** Complete a signed password reset and revoke every existing user session. */
  async completePasswordReset(input: CompletePasswordResetBody) {
    const now = new Date();
    const token = verifyAuthActionToken(input.token, this.authActionTokenSecret, now);
    if (!token || token.purpose !== 'PASSWORD_RESET') throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

    const user = await this.repository.findUserForAuthActionById(token.userId);
    if (
      !user
      || user.status !== USER_ACTIVE
      || !user.passwordHash
      || user.authActionPurpose !== token.purpose
      || user.authActionNonce !== token.nonce
      || !user.authActionExpiresAt
      || user.authActionExpiresAt.getTime() !== token.expiresAt.getTime()
    ) {
      throw createAdministrationError('AUTH_INVALID_CREDENTIALS');
    }

    bindRequestSecurityContext({
      actorUserId: user.id,
      companyId: user.companyId,
      permissions: [],
      projectScope: { kind: 'not-resolved' }
    });

    const passwordHash = await hashPassword(input.password);
    return this.inTransaction(async (repository, tx) => {
      const consumed = await repository.consumeUserAuthAction({
        userId: user.id,
        purpose: token.purpose,
        nonce: token.nonce,
        expiresAt: token.expiresAt,
        now
      });
      if (!consumed) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      const sessions = (await repository.listUserSessions(user.id)).filter((session) => !session.revokedAt);
      const updated = await repository.setUserPassword({
        userId: user.id,
        passwordHash,
        passwordChangedAt: now
      });
      if (!updated) throw createAdministrationError('AUTH_INVALID_CREDENTIALS');

      await repository.revokeAllUserSessions(user.id, now);
      await recordAudit(tx, {
        action: 'auth.password_reset_completed',
        entityType: 'user',
        entityId: user.id,
        after: { revokedSessionCount: sessions.length }
      });

      for (const session of sessions) {
        await recordOutboxEvent(tx, {
          eventType: 'auth.session_revoked',
          resourceType: 'auth_session',
          resourceId: session.id,
          payload: { userId: user.id, reason: 'PASSWORD_RESET' },
          occurredAt: now
        });
      }

      return { completed: true } as const;
    });
  }

  /** Revoke the session identified by the authenticated access token. */
  async signOut(accessToken: string | undefined) {
    if (!accessToken) return { revoked: false } as const;

    const accessTokenHash = hashAccessToken(accessToken);
    const now = new Date();

    return this.inTransaction(async (repository, tx) => {
      const session = await repository.findSessionByAccessTokenHash(accessTokenHash);
      if (!session || session.revokedAt) return { revoked: false } as const;

      const revoked = await repository.revokeSession(session.id, now);
      if (!revoked) return { revoked: false } as const;

      await recordAudit(tx, {
        action: 'auth.session_revoked',
        entityType: 'auth_session',
        entityId: session.id,
        before: { userId: session.userId, revokedAt: session.revokedAt },
        after: { userId: session.userId, revokedAt: now, reason: 'SIGN_OUT' }
      });

      await recordOutboxEvent(tx, {
        eventType: 'auth.session_revoked',
        resourceType: 'auth_session',
        resourceId: session.id,
        payload: { userId: session.userId, reason: 'SIGN_OUT' },
        occurredAt: now
      });

      return { revoked: true } as const;
    });
  }

  /** Return the current authenticated user and effective permissions. */
  async getCurrentIdentity() {
    const userId = requireActorUserId();
    const user = await this.repository.findUserById(userId);
    if (!user) throw createAdministrationError('USER_NOT_FOUND');

    const permissions = await this.resolveEffectivePermissions(user.id);
    return {
      user: safeUser(user),
      permissions,
      projectScope: requireRequestSecurityContext().projectScope
    };
  }

  /** Read the authenticated company's Organization Profile from the Foundation Company master. */
  async getOrganizationProfile() {
    this.requirePermission('admin.users.read');
    const company = await this.repository.getOrganizationProfile();
    if (!company) {
      throw new ConflictError({
        code: 'COMPANY_CONTEXT_INVALID',
        message: 'The authenticated company context is unavailable.'
      });
    }
    return safeOrganizationProfile(company);
  }

  /** Update only non-financial Organization Profile fields and audit the company-master change. */
  async updateOrganizationProfile(input: UpdateOrganizationProfileBody) {
    this.requirePermission('admin.users.manage');

    return this.inTransaction(async (repository, tx) => {
      const before = await repository.getOrganizationProfile();
      if (!before) {
        throw new ConflictError({
          code: 'COMPANY_CONTEXT_INVALID',
          message: 'The authenticated company context is unavailable.'
        });
      }

      const updated = await repository.updateOrganizationProfile(input);
      const beforeProfile = safeOrganizationProfile(before);
      const profile = safeOrganizationProfile(updated);

      await recordAudit(tx, {
        action: 'company.organization_profile_updated',
        entityType: 'company',
        entityId: updated.id,
        before: beforeProfile,
        after: profile
      });

      await recordOutboxEvent(tx, {
        eventType: 'company.organization_profile_updated',
        resourceType: 'company',
        resourceId: updated.id,
        payload: {
          legalName: updated.legalName,
          displayName: updated.displayName,
          timeZone: updated.timeZone,
          locale: updated.locale
        }
      });

      return profile;
    });
  }

  /** List company users with company roles and explicit Project access scopes. */
  async listUsers(query: ListUsersQuery) {
    this.requirePermission('admin.users.read');
    const page = pageWindow(query);
    const result = await this.repository.listUsers({
      skip: page.skip,
      take: page.take,
      ...(query.search ? { search: query.search } : {})
    });

    const items = result.items.map((row) => ({
      ...safeUser(row),
      roleIds: [...new Set(row.roleAssignments
        .filter((assignment) => assignment.status === ASSIGNMENT_ACTIVE)
        .map((assignment) => assignment.roleId))].sort(),
      projectScopes: row.projectScopes
        .filter((scope) => scope.status === PROJECT_SCOPE_ACTIVE)
        .map(safeUserProjectScope)
    }));

    return {
      items,
      total: result.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /** Create an inactive company user that can be onboarded later. */
  async createUser(input: CreateUserBody) {
    this.requirePermission('admin.users.manage');

    if (await this.repository.findUserByEmail(input.email)) {
      throw createAdministrationError('DUPLICATE_USER_EMAIL');
    }

    try {
      return await this.inTransaction(async (repository, tx) => {
        const created = await repository.createUser({
          email: input.email,
          ...(input.phone === undefined ? {} : { phone: input.phone }),
          name: input.name,
          status: USER_INACTIVE
        });
        const user = safeUser(created);
        await issueInvitation(repository, tx, user.id);

        await recordAudit(tx, {
          action: 'user.created',
          entityType: 'user',
          entityId: user.id,
          after: user
        });

        await recordOutboxEvent(tx, {
          eventType: 'user.created',
          resourceType: 'user',
          resourceId: user.id,
          payload: { status: user.status }
        });


        return user;
      });
    } catch (error) {
      if (await this.repository.findUserByEmail(input.email)) {
        throw createAdministrationError('DUPLICATE_USER_EMAIL', error);
      }
      throw error;
    }
  }

  /** Update permitted user profile/status fields and keep authentication state consistent. */
  async updateUser(userId: string, input: AdminUpdateUserBody) {
    this.requirePermission('admin.users.manage');

    if (input.email) {
      const existing = await this.repository.findUserByEmail(input.email);
      if (existing && existing.id !== userId) {
        throw createAdministrationError('DUPLICATE_USER_EMAIL');
      }
    }

    const now = new Date();
    return this.inTransaction(async (repository, tx) => {
      const before = await repository.findUserById(userId);
      if (!before) throw createAdministrationError('USER_NOT_FOUND');

      const emailChanged = input.email !== undefined && input.email !== before.email;
      const statusChanged = input.status !== undefined && input.status !== before.status;
      const sessionsToRevoke = input.status === USER_INACTIVE
        ? (await repository.listUserSessions(userId)).filter((session) => !session.revokedAt)
        : [];

      if (emailChanged || input.status === USER_INACTIVE) {
        await repository.clearUserAuthAction(userId);
      }

      const updated = await repository.updateUser(userId, input);
      if (!updated) throw createAdministrationError('USER_NOT_FOUND');

      let revokedSessionCount = 0;
      if (statusChanged && updated.status === USER_INACTIVE) {
        revokedSessionCount = await repository.revokeAllUserSessions(userId, now) ?? 0;
      }

      if ((emailChanged || (statusChanged && updated.status === USER_ACTIVE)) && !updated.passwordHash) {
        await issueInvitation(repository, tx, userId, now);
      }

      const user = safeUser(updated);
      await recordAudit(tx, {
        action: 'user.updated',
        entityType: 'user',
        entityId: userId,
        before: safeUser(before),
        after: { ...user, ...(revokedSessionCount > 0 ? { revokedSessionCount } : {}) }
      });

      if (statusChanged) {
        await recordOutboxEvent(tx, {
          eventType: 'user.status_changed',
          resourceType: 'user',
          resourceId: userId,
          payload: { fromStatus: before.status, toStatus: updated.status, revokedSessionCount },
          occurredAt: now
        });
      }

      for (const session of sessionsToRevoke) {
        await recordAudit(tx, {
          action: 'auth.session_revoked',
          entityType: 'auth_session',
          entityId: session.id,
          before: { userId, revokedAt: session.revokedAt },
          after: { userId, revokedAt: now, reason: 'USER_DEACTIVATED' }
        });
      }

      return user;
    });
  }

  /** List company Departments for Administration screens. */
  async listDepartments(query: ListDepartmentsQuery) {
    this.requirePermission('admin.departments.manage');
    const page = pageWindow(query);
    const result = await this.repository.listDepartments({ skip: page.skip, take: page.take });

    return {
      items: result.items,
      total: result.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /** Create one active company Department and audit the privileged change. */
  async createDepartment(input: CreateDepartmentBody) {
    this.requirePermission('admin.departments.manage');

    if (await this.repository.findDepartmentByName(input.name)) {
      throw new ConflictError({
        code: 'DUPLICATE_DEPARTMENT_NAME',
        message: 'A department with this name already exists.'
      });
    }

    return this.inTransaction(async (repository, tx) => {
      const department = await repository.createDepartment({
        name: input.name,
        status: DEPARTMENT_ACTIVE
      });

      await recordAudit(tx, {
        action: 'department.created',
        entityType: 'department',
        entityId: department.id,
        after: { name: department.name, status: department.status }
      });

      return department;
    });
  }

  /** List visible roles with their current permission codes for the role editor. */
  async listRoles(query: ListRolesQuery) {
    this.requirePermission('admin.roles.read');
    const page = pageWindow(query);
    const result = await this.repository.listRoles({ skip: page.skip, take: page.take });

    const items = result.items.map((role) => {
      const { rolePermissions, ...roleData } = role;
      return {
        ...roleData,
        permissionCodes: rolePermissions.map((row) => row.permissionCode)
      };
    });

    return {
      items,
      availablePermissionCodes: await this.repository.listPermissionCodes(),
      total: result.total,
      page: page.page,
      pageSize: page.pageSize
    };
  }

  /** Create one custom company role. */
  async createRole(input: CreateRoleBody) {
    this.requirePermission('admin.roles.manage');

    if (await this.repository.findRoleByCode(input.code)) {
      throw new ConflictError({
        code: 'ROLE_CODE_ALREADY_EXISTS',
        message: 'A role with this code already exists.'
      });
    }

    return this.inTransaction(async (repository, tx) => {
      const role = await repository.createCompanyRole({
        code: input.code,
        name: input.name,
        ...(input.description === undefined ? {} : { description: input.description }),
        isSystem: false,
        status: ROLE_ACTIVE
      });

      await recordAudit(tx, {
        action: 'role.created',
        entityType: 'role',
        entityId: role.id,
        after: role
      });
      await recordOutboxEvent(tx, {
        eventType: 'role.updated',
        resourceType: 'role',
        resourceId: role.id,
        payload: { action: 'CREATED', code: role.code, status: role.status }
      });

      return role;
    });
  }

  /** Replace a company role's permissions without allowing privilege escalation. */
  async replaceRolePermissions(roleId: string, input: ReplaceRolePermissionsBody) {
    this.requirePermission('admin.roles.manage');

    return this.inTransaction(async (repository, tx) => {
      const visibleRole = await repository.findRoleById(roleId);
      if (!visibleRole) throw createAdministrationError('ROLE_NOT_FOUND');

      const companyRole = await repository.findCompanyRoleById(roleId);
      if (!companyRole || companyRole.isSystem) throw createAdministrationError('FORBIDDEN');

      const permissions = await repository.findPermissionsByCodes(input.permissionCodes);
      if (permissions.length !== input.permissionCodes.length) {
        throw new ValidationError({
          code: 'INVALID_PERMISSION_CODE',
          message: 'One or more permission codes are not available.'
        });
      }

      // A role manager may only grant permissions already held by that manager.
      if (input.permissionCodes.some((code) => !hasPermission(code))) {
        throw createAdministrationError('FORBIDDEN');
      }

      const beforePermissionCodes = await repository.listRolePermissionCodes(roleId) ?? [];

      await repository.deleteCompanyRolePermissions(roleId);
      await repository.createCompanyRolePermissions(
        roleId,
        permissions.map((permission) => permission.code)
      );

      const afterPermissionCodes = await repository.listRolePermissionCodes(roleId) ?? [];

      await recordAudit(tx, {
        action: 'role.permissions_changed',
        entityType: 'role',
        entityId: roleId,
        before: { permissionCodes: beforePermissionCodes },
        after: { permissionCodes: afterPermissionCodes }
      });
      await recordOutboxEvent(tx, {
        eventType: 'role.updated',
        resourceType: 'role',
        resourceId: roleId,
        payload: { action: 'PERMISSIONS_REPLACED', permissionCodes: afterPermissionCodes }
      });

      return afterPermissionCodes;
    });
  }

  /** Replace only the final Administration company-level role set for one user. */
  async replaceAdminUserRoles(userId: string, input: ReplaceAdminUserRolesBody) {
    this.requirePermission('admin.users.manage');
    return this.inTransaction(async (repository, tx) => {
      const lockedUser = await repository.lockUserForRoleAssignmentWrite(userId);
      if (!lockedUser) throw createAdministrationError('USER_NOT_FOUND');

      const roleIds = [...new Set(input.roleIds)];
      const roles = await repository.findVisibleRolesByIds(roleIds);
      if (roles.length !== roleIds.length) throw createAdministrationError('ROLE_NOT_FOUND');

      for (const role of roles) {
        if (role.rolePermissions.some((row) => !hasPermission(row.permissionCode))) {
          throw createAdministrationError('FORBIDDEN');
        }
      }

      const beforeAssignments = await repository.listUserRoles(userId);
      await repository.deleteUserRoles(userId);

      for (const roleId of roleIds) {
        const created = await repository.createUserRole({
          userId,
          roleId,
          status: ASSIGNMENT_ACTIVE
        });
        if (!created) throw createAdministrationError('ROLE_NOT_FOUND');
      }

      const afterAssignments = await repository.listUserRoles(userId);
      const beforeRoleIds = [...new Set(beforeAssignments.map((assignment) => assignment.roleId))].sort();
      const afterRoleIds = [...new Set(afterAssignments.map((assignment) => assignment.roleId))].sort();

      await recordAudit(tx, {
        action: 'user.roles_changed',
        entityType: 'user',
        entityId: userId,
        before: { roleIds: beforeRoleIds },
        after: { roleIds: afterRoleIds }
      });

      await recordOutboxEvent(tx, {
        eventType: 'user.roles_changed',
        resourceType: 'user',
        resourceId: userId,
        payload: { roleIds: afterRoleIds }
      });

      return afterRoleIds;
    });
  }

  /** Replace one user's explicit final Administration Project access scopes. */
  async replaceAdminUserProjectScopes(userId: string, input: ReplaceAdminUserProjectScopesBody) {
    this.requirePermission('admin.project_scopes.manage');

    return this.inTransaction(async (repository, tx) => {
      const lockedUser = await repository.lockUserForRoleAssignmentWrite(userId);
      if (!lockedUser) throw createAdministrationError('USER_NOT_FOUND');

      const projectScopes = [...input.projectScopes]
        .sort((left, right) => left.projectId.localeCompare(right.projectId));
      const projectIds = [...new Set(projectScopes.map((scope) => scope.projectId))];
      if (projectIds.length !== projectScopes.length) {
        throw createAdministrationError('PROJECT_SCOPE_INVALID');
      }

      const projects = await repository.findCompanyProjectsByIds(projectIds);
      if (projects.length !== projectIds.length) throw createAdministrationError('PROJECT_SCOPE_INVALID');

      const beforeScopes = await repository.listUserProjectScopes(userId);
      for (const scope of beforeScopes) this.requireActorProjectScope(scope.projectId);
      for (const projectId of projectIds) this.requireActorProjectScope(projectId);

      const beforeValues = beforeScopes
        .map((scope) => ({ projectId: scope.projectId, roleCode: scope.roleCode }))
        .sort((left, right) => left.projectId.localeCompare(right.projectId));
      const nextValues = projectScopes.map((scope) => ({
        projectId: scope.projectId,
        roleCode: scope.roleCode ?? null
      }));
      if (JSON.stringify(beforeValues) === JSON.stringify(nextValues)) {
        return beforeScopes.map(safeUserProjectScope);
      }

      await repository.deleteUserProjectScopes(userId);
      await repository.createUserProjectScopes(userId, projectScopes, PROJECT_SCOPE_ACTIVE);

      const afterScopes = await repository.listUserProjectScopes(userId);
      const afterValues = afterScopes
        .map((scope) => ({ projectId: scope.projectId, roleCode: scope.roleCode }))
        .sort((left, right) => left.projectId.localeCompare(right.projectId));

      await recordAudit(tx, {
        action: 'user.project_scope_changed',
        entityType: 'user',
        entityId: userId,
        before: { projectScopes: beforeValues },
        after: { projectScopes: afterValues }
      });
      await recordOutboxEvent(tx, {
        eventType: 'user.project_scope_changed',
        resourceType: 'user',
        resourceId: userId,
        payload: { projectScopes: afterValues }
      });

      return afterScopes.map(safeUserProjectScope);
    });
  }

  /** Resolve the active company-level permissions for one user. */
  async resolveEffectivePermissions(userId: string, asOf = new Date()) {
    const permissions = await this.repository.findEffectivePermissionCodes({
      userId,
      asOf,
      assignmentStatuses: [ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    return permissions;
  }
}


/**
 * Complete the Foundation identity handoff with Administration-owned identity tables.
 *
 * The administrator password is supplied only at runtime. Foundation never
 * stores it in the bootstrap JSON or bootstrap-run record.
 */
export function createAdministrationBootstrapIdentityProvisioner(
  administratorPassword: string
): BootstrapIdentityProvisioner {
  if (!administratorPassword) {
    throw new Error('The initial administrator password is required.');
  }

  return async (tx, context) => {
    const requestContext = createRequestContext({
      requestId: context.requestId,
      correlationId: context.correlationId
    });

    return runWithRequestContext(requestContext, async () => {
      const systemRoleIdsByCode: Record<string, string> = {};
      const createdRoles: Array<{ id: string; code: string; name: string }> = [];

      for (const definition of context.systemRoles) {
        const existingRole = await tx.role.findUnique({
          where: {
            companyId_code: {
              companyId: context.companyId,
              code: definition.code
            }
          }
        });

        const role = existingRole
          ? await tx.role.update({
              where: { id: existingRole.id },
              data: {
                name: definition.name,
                description: definition.description ?? null,
                isSystem: true,
                status: ROLE_ACTIVE
              }
            })
          : await tx.role.create({
              data: {
                companyId: context.companyId,
                code: definition.code,
                name: definition.name,
                description: definition.description ?? null,
                isSystem: true,
                status: ROLE_ACTIVE
              }
            });

        systemRoleIdsByCode[definition.code] = role.id;
        if (!existingRole) createdRoles.push({ id: role.id, code: role.code, name: role.name });
      }

      // Keep the required Administration permissions present, then give the system administrator
      // every active permission already registered by installed Final-21 modules.
      for (const code of ADMINISTRATION_PERMISSION_CODES) {
        await tx.permission.upsert({
          where: { code },
          create: { code, description: code, domain: code.split('.')[0] ?? 'platform' },
          update: { domain: code.split('.')[0] ?? 'platform' }
        });
      }
      const permissionRows = await tx.permission.findMany({
        select: { code: true },
        orderBy: { code: 'asc' }
      });
      const activePermissionCodes = permissionRows.map((row) => row.code);

      // One administrator role receives the full current Administration/RBAC permission set. Prefer
      // the conventional system-admin code while keeping custom bootstrap input usable.
      const administratorPermissionRoleCode = context.administrator.roleCodes.includes('system-admin')
        ? 'system-admin'
        : context.administrator.roleCodes[0]!;
      const administratorPermissionRoleId = systemRoleIdsByCode[administratorPermissionRoleCode];
      if (!administratorPermissionRoleId) {
        throw new Error(`Bootstrap role was not reconciled: ${administratorPermissionRoleCode}`);
      }

      const beforePermissionRows = await tx.rolePermission.findMany({
        where: { roleId: administratorPermissionRoleId },
        select: { permissionCode: true }
      });
      const beforePermissionCodes = beforePermissionRows.map((row) => row.permissionCode).sort();
      const permissionResult = await tx.rolePermission.createMany({
        data: activePermissionCodes.map((permissionCode) => ({
          roleId: administratorPermissionRoleId,
          permissionCode
        })),
        skipDuplicates: true
      });
      const permissionChange = permissionResult.count > 0
        ? {
            roleId: administratorPermissionRoleId,
            beforePermissionCodes,
            afterPermissionCodes: [...new Set([
              ...beforePermissionCodes,
              ...activePermissionCodes
            ])].sort()
          }
        : null;

      const existingUser = await tx.user.findUnique({
        where: {
          companyId_email: {
            companyId: context.companyId,
            email: context.administrator.email
          }
        }
      });

      const administrator = existingUser
        ? await tx.user.update({
            where: { id: existingUser.id },
            data: {
              name: context.administrator.name,
              status: USER_ACTIVE
            }
          })
        : await tx.user.create({
            data: {
              companyId: context.companyId,
              email: context.administrator.email,
              name: context.administrator.name,
              status: USER_ACTIVE
            }
          });

      // Audit/outbox helpers require trusted identity context. At bootstrap the
      // newly reconciled administrator is the only valid actor available.
      bindRequestSecurityContext({
        actorUserId: administrator.id,
        companyId: context.companyId,
        permissions: activePermissionCodes,
        projectScope: { kind: 'not-resolved' }
      });

      const now = new Date();
      const passwordHash = await hashPassword(administratorPassword);
      const hadPassword = Boolean(administrator.passwordHash);
      await tx.user.update({
        where: { id: administrator.id },
        data: { passwordHash, passwordChangedAt: now }
      });

      let rolesChanged = false;

      for (const roleCode of context.administrator.roleCodes) {
        const roleId = systemRoleIdsByCode[roleCode];
        if (!roleId) throw new Error(`Bootstrap role was not reconciled: ${roleCode}`);

        const existingAssignment = await tx.userRole.findFirst({
          where: {
            companyId: context.companyId,
            userId: administrator.id,
            roleId
          }
        });

        if (!existingAssignment || existingAssignment.status !== ASSIGNMENT_ACTIVE) {
          rolesChanged = true;
        }

        if (existingAssignment) {
          await tx.userRole.update({
            where: { id: existingAssignment.id },
            data: { status: ASSIGNMENT_ACTIVE }
          });
        } else {
          await tx.userRole.create({
            data: {
              companyId: context.companyId,
              userId: administrator.id,
              roleId,
              status: ASSIGNMENT_ACTIVE
            }
          });
        }
      }

      if (permissionChange) {
        await recordAudit(tx, {
          action: 'role.permissions_changed',
          entityType: 'role',
          entityId: permissionChange.roleId,
          before: { permissionCodes: permissionChange.beforePermissionCodes },
          after: { permissionCodes: permissionChange.afterPermissionCodes }
        });
        await recordOutboxEvent(tx, {
          eventType: 'role.updated',
          resourceType: 'role',
          resourceId: permissionChange.roleId,
          payload: { action: 'PERMISSIONS_RECONCILED' },
          occurredAt: now
        });
      }

      for (const role of createdRoles) {
        await recordAudit(tx, {
          action: 'role.created',
          entityType: 'role',
          entityId: role.id,
          after: {
            code: role.code,
            name: role.name,
            isSystem: true,
            status: ROLE_ACTIVE
          }
        });
        await recordOutboxEvent(tx, {
          eventType: 'role.updated',
          resourceType: 'role',
          resourceId: role.id,
          payload: { action: 'CREATED', code: role.code, status: ROLE_ACTIVE },
          occurredAt: now
        });
      }

      if (!existingUser) {
        await recordAudit(tx, {
          action: 'user.created',
          entityType: 'user',
          entityId: administrator.id,
          after: {
            email: administrator.email,
            name: administrator.name,
            status: administrator.status
          }
        });

        await recordOutboxEvent(tx, {
          eventType: 'user.created',
          resourceType: 'user',
          resourceId: administrator.id,
          payload: { status: administrator.status },
          occurredAt: now
        });
      } else if (existingUser.status !== USER_ACTIVE) {
        await recordAudit(tx, {
          action: 'user.activated',
          entityType: 'user',
          entityId: administrator.id,
          before: { status: existingUser.status },
          after: { status: USER_ACTIVE }
        });

        await recordOutboxEvent(tx, {
          eventType: 'user.status_changed',
          resourceType: 'user',
          resourceId: administrator.id,
          payload: { status: USER_ACTIVE },
          occurredAt: now
        });
      }

      await recordAudit(tx, {
        action: 'auth.password_provisioned',
        entityType: 'user',
        entityId: administrator.id,
        after: { passwordAction: hadPassword ? 'RESET' : 'CREATED' }
      });

      if (rolesChanged) {
        const roleIds = context.administrator.roleCodes.map((code) => systemRoleIdsByCode[code]!);

        await recordAudit(tx, {
          action: 'user.roles_changed',
          entityType: 'user',
          entityId: administrator.id,
          after: { roleIds }
        });

        await recordOutboxEvent(tx, {
          eventType: 'user.roles_changed',
          resourceType: 'user',
          resourceId: administrator.id,
          payload: { roleIds },
          occurredAt: now
        });
      }

      return {
        administratorUserId: administrator.id,
        systemRoleIdsByCode
      };
    });
  };
}
