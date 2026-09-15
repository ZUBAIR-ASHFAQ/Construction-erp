import { webConfig } from '../../../config.js';

export type AdministrationUser = Readonly<{
  id: string;
  companyId: string;
  email: string;
  phone: string | null;
  name: string;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export type ResolvedProjectScope =
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: string[] }>;

export type CurrentIdentity = Readonly<{
  user: AdministrationUser;
  permissions: string[];
  projectScope: ResolvedProjectScope;
}>;

export type SignInInput = Readonly<{
  email: string;
  password: string;
}>;

export type AuthSessionResult = CurrentIdentity & Readonly<{
  session: Readonly<{
    id: string;
    accessExpiresAt: string;
    expiresAt: string;
  }>;
  accessToken: string;
}>;

type ApiEnvelope<T> = Readonly<{ data: T }>;
type ErrorEnvelope = Readonly<{ error?: Readonly<{ code?: string; message?: string }> }>;
type RequestError = Error & Readonly<{ status?: number }>;

const ACCESS_TOKEN_KEY = 'construction-erp-access-token';
const ACCESS_EXPIRES_AT_KEY = 'construction-erp-access-expires-at';
const LEGACY_REFRESH_TOKEN_KEY = 'construction-erp-refresh-token';
let refreshPromise: Promise<AuthSessionResult> | null = null;

/** Save only the short-lived access credential and its server expiry in this browser tab. */
export function saveAccessToken(accessToken: string, accessExpiresAt?: string): void {
  sessionStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (accessExpiresAt) {
    sessionStorage.setItem(ACCESS_EXPIRES_AT_KEY, accessExpiresAt);
  } else {
    sessionStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
  }
}

/** Read the short-lived Bearer access token for protected API calls. */
export function readAccessToken(): string | null {
  sessionStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Read the stored server expiry for proactive access-token rotation. */
export function readAccessTokenExpiresAt(): number | null {
  const value = sessionStorage.getItem(ACCESS_EXPIRES_AT_KEY);
  if (!value) return null;

  const expiresAt = Date.parse(value);
  return Number.isFinite(expiresAt) ? expiresAt : null;
}

/** Remove the browser-managed access credential after sign-out or an invalid refresh session. */
export function clearSessionTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(ACCESS_EXPIRES_AT_KEY);
  sessionStorage.removeItem(LEGACY_REFRESH_TOKEN_KEY);
}

/** Build one API URL from the configured `/api/v1` base URL. */
function apiUrl(path: string): string {
  return `${webConfig.apiBaseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}

/** Call one API endpoint and expose the HTTP status on safe request errors. */
async function request<T>(path: string, init: RequestInit = {}, accessToken?: string): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(apiUrl(path), { ...init, headers, credentials: 'include' });
  const payload = await response.json() as ApiEnvelope<T> | ErrorEnvelope;

  if (!response.ok) {
    const serverError = (payload as ErrorEnvelope).error;
    const error = new Error(serverError?.message ?? 'The request could not be completed.') as RequestError;
    Object.defineProperty(error, 'status', { value: response.status, enumerable: true });
    throw error;
  }

  return (payload as ApiEnvelope<T>).data;
}

/** Return whether one API failure means the server no longer accepts the authentication session. */
function isAuthenticationFailure(error: unknown): boolean {
  return (error as RequestError).status === 401;
}

/** Rotate the HttpOnly refresh cookie once and save the replacement access credential. */
export async function refreshStoredSession(): Promise<AuthSessionResult> {
  if (!refreshPromise) {
    refreshPromise = request<AuthSessionResult>('auth/refresh', {
      method: 'POST',
      body: JSON.stringify({})
    }).then((result) => {
      saveAccessToken(result.accessToken, result.session.accessExpiresAt);
      return result;
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/** Call a protected route, restoring or rotating the access token through the HttpOnly refresh cookie as needed. */
export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let accessToken = readAccessToken();

  if (!accessToken) {
    try {
      accessToken = (await refreshStoredSession()).accessToken;
    } catch (error) {
      if (isAuthenticationFailure(error)) clearSessionTokens();
      throw error;
    }
  }

  try {
    return await request<T>(path, init, accessToken);
  } catch (error) {
    if (!isAuthenticationFailure(error)) throw error;

    try {
      const refreshed = await refreshStoredSession();
      return await request<T>(path, init, refreshed.accessToken);
    } catch (refreshError) {
      if (isAuthenticationFailure(refreshError)) clearSessionTokens();
      throw refreshError;
    }
  }
}

/** Sign in with email/password; the API stores the refresh credential in an HttpOnly cookie. */
export function signIn(input: SignInInput): Promise<AuthSessionResult> {
  return request<AuthSessionResult>('auth/login', {
    method: 'POST',
    body: JSON.stringify(input)
  });
}

/** Load the current server-derived identity using the protected request helper. */
export function getCurrentIdentity(): Promise<CurrentIdentity> {
  return authenticatedRequest<CurrentIdentity>('auth/me', { method: 'GET' });
}

/** Revoke the session identified by the current access token. */
export function signOut(): Promise<Readonly<{ revoked: boolean }>> {
  return authenticatedRequest<Readonly<{ revoked: boolean }>>('auth/logout', {
    method: 'POST',
    body: JSON.stringify({})
  });
}


/** Accept one signed invitation and set the user's first password. */
export function acceptInvitation(token: string, password: string): Promise<Readonly<{ completed: boolean }>> {
  return request<Readonly<{ completed: boolean }>>('auth/invitations/accept', {
    method: 'POST',
    body: JSON.stringify({ token, password })
  });
}

/** Start password recovery without exposing whether the email exists. */
export function requestPasswordReset(email: string): Promise<Readonly<{ accepted: boolean }>> {
  return request<Readonly<{ accepted: boolean }>>('auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ email })
  });
}

/** Complete one signed password-reset action with the replacement password. */
export function completePasswordReset(token: string, password: string): Promise<Readonly<{ completed: boolean }>> {
  return request<Readonly<{ completed: boolean }>>('auth/password-reset/complete', {
    method: 'POST',
    body: JSON.stringify({ token, password })
  });
}
