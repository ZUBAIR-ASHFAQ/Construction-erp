const CENSOR = '[REDACTED]';

const SENSITIVE_KEY_MARKERS = [
  'authorization',
  'password',
  'token',
  'secret',
  'credential',
  'apikey',
  'privatekey',
  'passcode',
  'recoverycode',
  'securityanswer',
  'cookie',
  'databaseurl',
  'connectionstring'
];

const SENSITIVE_EXACT_KEYS = new Set([
  'otp',
  'accesskeyid',
  'secretaccesskey',
  'awsaccesskeyid',
  'awssecretaccesskey'
]);

/**
 * Pino/Fastify redaction paths for common HTTP/config shapes. Application code
 * should still avoid logging request bodies and use sanitizeLogValue for any
 * custom structured payload.
 */
export const DEFAULT_REDACT_PATHS = Object.freeze([
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'body.password',
  'body.passwordHash',
  'body.password_hash',
  'body.accessToken',
  'body.access_token',
  'body.refreshToken',
  'body.refresh_token',
  'body.token',
  'body.secret',
  'payload.password',
  'payload.accessToken',
  'payload.refreshToken',
  'payload.token',
  'payload.secret',
  'config.database.url',
  'config.storage.accessKeyId',
  'config.storage.secretAccessKey',
  'config.authActionTokenSecret',
  'config.authNotificationWebhookToken',
  'databaseUrl',
  'DATABASE_URL',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'AUTH_ACTION_TOKEN_SECRET',
  'AUTH_NOTIFICATION_WEBHOOK_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'authorization',
  'cookie',
  'password',
  'passwordHash',
  'password_hash',
  'accessToken',
  'access_token',
  'accessTokenHash',
  'access_token_hash',
  'refreshToken',
  'refresh_token',
  'refreshTokenHash',
  'refresh_token_hash',
  'token',
  'secret',
  'apiKey',
  'api_key'
]);

export const LOG_REDACTION_CENSOR = CENSOR;

/** Normalize one key before secret matching. */
function normalizedKey(key: string): string {
  return key.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

/** Check whether a log field name can contain secret material. */
export function isSensitiveLogKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return SENSITIVE_EXACT_KEYS.has(normalized)
    || SENSITIVE_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

/** Sanitize one value recursively before persistence or logging. */
function sanitize(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
  maxDepth: number
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'symbol' || typeof value === 'function') return String(value);
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) return { name: value.name || 'Error' };
  if (depth >= maxDepth) return '[MaxDepth]';

  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, seen, depth + 1, maxDepth));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
    seen.add(value);

    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = isSensitiveLogKey(key)
        ? CENSOR
        : sanitize(item, seen, depth + 1, maxDepth);
    }
    return output;
  }

  return String(value);
}

/**
 * Defensive sanitizer for custom application log metadata. It complements the
 * transport-level redaction list and is intentionally conservative.
 */
export function sanitizeLogValue(value: unknown, maxDepth = 8): unknown {
  return sanitize(value, new WeakSet<object>(), 0, maxDepth);
}
