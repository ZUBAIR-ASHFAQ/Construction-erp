import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import type { DatabaseClient } from '@construction-erp/database';
import { bindRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../modules/administration/administration.repository.js';
import { createAdministrationError } from '../modules/administration/administration.schema.js';

const PASSWORD_HASH_PREFIX = 'scrypt-v1';
const PASSWORD_SALT_BYTES = 16;
const PASSWORD_KEY_BYTES = 64;
const MAX_PASSWORD_LENGTH = 4096;
const ACCESS_TOKEN_BYTES = 32;
const REFRESH_TOKEN_BYTES = 32;

export type AuthActionPurpose = 'INVITATION' | 'PASSWORD_RESET';

export type AuthActionTokenPayload = Readonly<{
  userId: string;
  purpose: AuthActionPurpose;
  nonce: string;
  expiresAt: Date;
}>;

const AUTH_ACTION_NONCE_BYTES = 24;

/** Create the public nonce stored with one pending invitation or password reset. */
export function createAuthActionNonce(): string {
  return randomBytes(AUTH_ACTION_NONCE_BYTES).toString('base64url');
}

/** Build a signed action token without storing the bearer token itself in PostgreSQL. */
export function createAuthActionToken(payload: AuthActionTokenPayload, secret: string): string {
  if (secret.length < 32) throw new RangeError('Auth action token secret must contain at least 32 characters.');

  const expiresAtMs = payload.expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs)) throw new RangeError('Auth action token expiry must be a valid date.');

  const message = [payload.userId, payload.purpose, payload.nonce, String(expiresAtMs)].join('.');
  const signature = createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
  return `${message}.${signature}`;
}

/** Verify one signed invitation/reset token and return its non-secret claims. */
export function verifyAuthActionToken(
  token: string,
  secret: string,
  now = new Date()
): AuthActionTokenPayload | null {
  if (!token || secret.length < 32) return null;

  const [userId, purposeText, nonce, expiresText, signature, extra] = token.split('.');
  if (!userId || !nonce || !expiresText || !signature || extra !== undefined) return null;
  if (purposeText !== 'INVITATION' && purposeText !== 'PASSWORD_RESET') return null;

  const expiresAtMs = Number(expiresText);
  if (!Number.isSafeInteger(expiresAtMs)) return null;

  const message = [userId, purposeText, nonce, expiresText].join('.');
  const expected = createHmac('sha256', secret).update(message, 'utf8').digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  const expiresAt = new Date(expiresAtMs);
  if (expiresAt <= now) return null;
  return { userId, purpose: purposeText, nonce, expiresAt };
}

/** Derive the fixed-length scrypt key used by password hashing and verification. */
function derivePasswordKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, PASSWORD_KEY_BYTES, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

/**
 * Hash a password with a random salt. The plaintext password is never stored.
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Password must contain 1-${MAX_PASSWORD_LENGTH} characters.`);
  }

  const salt = randomBytes(PASSWORD_SALT_BYTES);
  const key = await derivePasswordKey(password, salt);

  return [
    PASSWORD_HASH_PREFIX,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join(':');
}

/**
 * Verify a password without exposing why verification failed.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash || password.length > MAX_PASSWORD_LENGTH) return false;

  const [prefix, saltText, keyText, extra] = storedHash.split(':');
  if (prefix !== PASSWORD_HASH_PREFIX || !saltText || !keyText || extra !== undefined) return false;

  try {
    const salt = Buffer.from(saltText, 'base64url');
    const expectedKey = Buffer.from(keyText, 'base64url');

    if (salt.length !== PASSWORD_SALT_BYTES || expectedKey.length !== PASSWORD_KEY_BYTES) return false;

    const actualKey = await derivePasswordKey(password, salt);
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}


/** Create the short-lived opaque token used only as the Bearer access credential. */
export function createAccessToken(): string {
  return randomBytes(ACCESS_TOKEN_BYTES).toString('base64url');
}

/** Hash an access token before it is written to auth_sessions. */
export function hashAccessToken(accessToken: string): string {
  if (!accessToken) throw new RangeError('Access token is required.');
  return createHash('sha256').update(accessToken, 'utf8').digest('hex');
}

/**
 * Create the opaque refresh token that is returned to the authenticated client.
 */
export function createRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
}

/**
 * Store only this deterministic hash in auth_sessions.refresh_token_hash.
 */
export function hashRefreshToken(refreshToken: string): string {
  if (!refreshToken) throw new RangeError('Refresh token is required.');
  return createHash('sha256').update(refreshToken, 'utf8').digest('hex');
}

const ACTIVE = 'ACTIVE';
const ACTIVE_PROJECT_SCOPE_STATUSES = [ACTIVE] as const;

/**
 * Protected Administration requests use the short-lived opaque access token as the
 * Bearer credential. Refresh tokens are accepted only by the refresh endpoint.
 */
export function readBearerToken(request: FastifyRequest): string | undefined {
  const header = request.headers.authorization;
  if (!header) return undefined;

  const parts = header.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') return undefined;

  return parts[1] || undefined;
}

/**
 * Validate the current session, derive company/permissions/Project scope from
 * server-owned database records, then bind trusted request security once.
 */
export async function authenticateRequest(
  request: FastifyRequest,
  db: DatabaseClient
): Promise<void> {
  const token = readBearerToken(request);
  if (!token) throw createAdministrationError('AUTH_SESSION_EXPIRED');

  const repository = new AdministrationRepository(db);
  const session = await repository.findSessionForAuthenticationByAccessTokenHash(
    hashAccessToken(token)
  );
  const now = new Date();

  if (
    !session
    || session.revokedAt
    || session.accessExpiresAt <= now
    || session.expiresAt <= now
    || session.user.status !== ACTIVE
  ) {
    throw createAdministrationError('AUTH_SESSION_EXPIRED');
  }

  const permissions = await repository.findEffectivePermissionCodesForAuthentication({
    userId: session.userId,
    asOf: now,
    assignmentStatuses: [ACTIVE],
    roleStatuses: [ACTIVE]
  });
  const projectScope = await repository.resolveProjectScopeForAuthentication({
    userId: session.userId,
    asOf: now,
    assignmentStatuses: [ACTIVE],
    roleStatuses: [ACTIVE],
    projectScopeStatuses: ACTIVE_PROJECT_SCOPE_STATUSES
  });

  bindRequestSecurityContext({
    actorUserId: session.userId,
    companyId: session.user.companyId,
    permissions,
    projectScope
  });
}
