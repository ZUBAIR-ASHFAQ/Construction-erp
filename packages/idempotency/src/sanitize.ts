import type { ReplayJsonObject, ReplayJsonValue } from './json.js';

export const IDEMPOTENCY_REPLAY_REDACTED = '[REDACTED]';
export const IDEMPOTENCY_REPLAY_BINARY_OMITTED = '[BINARY_OMITTED]';
const MAX_DEPTH = 20;

/** Return canonical key. */
function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Check whether sensitive replay key. */
export function isSensitiveReplayKey(key: string): boolean {
  const normalized = canonicalKey(key);
  return (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('apikey') ||
    normalized.includes('privatekey') ||
    normalized.includes('passcode') ||
    normalized.includes('recoverycode') ||
    normalized.includes('securityanswer') ||
    normalized.includes('cookie') ||
    normalized.includes('databaseurl') ||
    normalized.includes('connectionstring') ||
    normalized === 'otp' ||
    normalized === 'authorization'
  );
}

/** Sanitize one value recursively before persistence or logging. */
function sanitize(value: unknown, seen: WeakSet<object>, depth: number): ReplayJsonValue | undefined {
  if (depth > MAX_DEPTH) throw new TypeError('Idempotency replay body exceeds maximum nesting depth.');
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Idempotency replay body contains a non-finite number.');
      return value;
    case 'bigint':
      return value.toString();
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Idempotency replay body contains an invalid Date.');
    return value.toISOString();
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return IDEMPOTENCY_REPLAY_BINARY_OMITTED;
  if (value instanceof Error) return { name: value.name || 'Error' };

  if (seen.has(value)) throw new TypeError('Idempotency replay body must not contain circular references.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitize(item, seen, depth + 1) ?? null);
    }

    const output: ReplayJsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveReplayKey(key)) {
        output[key] = IDEMPOTENCY_REPLAY_REDACTED;
        continue;
      }
      const safe = sanitize(child, seen, depth + 1);
      if (safe !== undefined) output[key] = safe;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

/**
 * The sanitized body is returned for the first execution AND persisted for
 * replay, so retries receive the same safe representation.
 */
export function sanitizeReplayBody(value: unknown): ReplayJsonValue {
  return sanitize(value, new WeakSet<object>(), 0) ?? null;
}
