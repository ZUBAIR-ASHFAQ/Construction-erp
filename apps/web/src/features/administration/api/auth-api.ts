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
  refreshToken: string;
}>;

type ApiEnvelope<T> = Readonly<{ data: T }>;
type ErrorEnvelope = Readonly<{ error?: Readonly<{ code?: string; message?: string }> }>;
type RequestError = Error & Readonly<{ status?: number }>;

const ACCESS_TOKEN_KEY = 'construction-erp-access-token';
const REFRESH_TOKEN_KEY = 'construction-erp-refresh-token';
let refreshPromise: Promise<AuthSessionResult> | null = null;

/** Save the separate access and refresh credentials for this browser tab only. */
export function saveSessionTokens(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

/** Read the short-lived Bearer access token for protected API calls. */
export function readAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Read the refresh token used only by the public refresh command. */
export function readRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Remove both local credentials after sign-out or failed refresh. */
export function clearSessionTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
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

  const response = await fetch(apiUrl(path), { ...init, headers });
  const payload = await response.json() as ApiEnvelope<T> | ErrorEnvelope;

  if (!response.ok) {
    const serverError = (payload as ErrorEnvelope).error;
    const error = new Error(serverError?.message ?? 'The request could not be completed.') as RequestError;
    Object.defineProperty(error, 'status', { value: response.status, enumerable: true });
    throw error;
  }

  return (payload as ApiEnvelope<T>).data;
}

/** Rotate the stored refresh token once and save the replacement credentials. */
async function refreshStoredSession(): Promise<AuthSessionResult> {
  const refreshToken = readRefreshToken();
  if (!refreshToken) throw new Error('Your session has expired. Please sign in again.');

  if (!refreshPromise) {
    refreshPromise = request<AuthSessionResult>('auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken })
    }).then((result) => {
      saveSessionTokens(result.accessToken, result.refreshToken);
      return result;
    }).finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

/** Call a protected route and retry once with a freshly rotated access token on 401. */
export async function authenticatedRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = readAccessToken();
  if (!accessToken) throw new Error('Your session has expired. Please sign in again.');

  try {
    return await request<T>(path, init, accessToken);
  } catch (error) {
    if ((error as RequestError).status !== 401) throw error;

    try {
      const refreshed = await refreshStoredSession();
      return await request<T>(path, init, refreshed.accessToken);
    } catch (refreshError) {
      clearSessionTokens();
      throw refreshError;
    }
  }
}

/** Sign in with email/password and return separate access and refresh credentials. */
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
