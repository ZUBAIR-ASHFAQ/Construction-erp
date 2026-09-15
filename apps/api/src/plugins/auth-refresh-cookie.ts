const REFRESH_COOKIE_NAME = 'construction-erp-refresh-token';
const REFRESH_COOKIE_PATH = '/api/v1/auth';

/** Read the opaque refresh credential from the request Cookie header. */
export function readRefreshTokenCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  for (const segment of cookieHeader.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;

    const name = segment.slice(0, separator).trim();
    if (name !== REFRESH_COOKIE_NAME) continue;

    const value = segment.slice(separator + 1).trim();
    if (!value) return undefined;

    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return undefined;
}

/** Build the HttpOnly refresh cookie that mirrors the server session expiry. */
export function createRefreshTokenCookie(
  refreshToken: string,
  expiresAt: Date,
  secure: boolean
): string {
  const attributes = [
    `${REFRESH_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`,
    `Path=${REFRESH_COOKIE_PATH}`,
    `Expires=${expiresAt.toUTCString()}`,
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}

/** Expire the browser refresh cookie without exposing its value to JavaScript. */
export function clearRefreshTokenCookie(secure: boolean): string {
  const attributes = [
    `${REFRESH_COOKIE_NAME}=`,
    `Path=${REFRESH_COOKIE_PATH}`,
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict'
  ];
  if (secure) attributes.push('Secure');
  return attributes.join('; ');
}
