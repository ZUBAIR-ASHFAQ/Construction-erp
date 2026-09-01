import type { OutboxJsonObject, OutboxJsonValue, OutboxPayloadInput } from './types.js';

export const OUTBOX_REDACTED = '[REDACTED]';
export const OUTBOX_BINARY_OMITTED = '[BINARY_OMITTED]';

const MAX_DEPTH = 20;

/** Return canonical key. */
function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Check whether sensitive outbox key. */
export function isSensitiveOutboxKey(key: string): boolean {
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

/** Sanitize value. */
function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): OutboxJsonValue | undefined {
  if (depth > MAX_DEPTH) throw new Error('Outbox payload exceeds maximum nesting depth.');
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Outbox payload contains a non-finite number.');
      return value;
    case 'bigint':
      return value.toString();
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Outbox payload contains an invalid Date.');
    return value.toISOString();
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return OUTBOX_BINARY_OMITTED;

  if (value instanceof Error) {
    // Never persist exception messages/stacks in an integration payload.
    return { name: value.name || 'Error' };
  }

  if (seen.has(value)) throw new Error('Outbox payload must not contain circular references.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen, depth + 1) ?? null);
    }

    const output: OutboxJsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveOutboxKey(key)) {
        output[key] = OUTBOX_REDACTED;
        continue;
      }
      const safe = sanitizeValue(child, seen, depth + 1);
      if (safe !== undefined) output[key] = safe;
    }
    return output;
  } finally {
    seen.delete(value);
  }
}

/** Sanitize outbox payload. */
export function sanitizeOutboxPayload(input: OutboxPayloadInput): OutboxJsonObject {
  const sanitized = sanitizeValue(input, new WeakSet<object>(), 0);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    throw new Error('Outbox payload must be a JSON object.');
  }
  return sanitized as OutboxJsonObject;
}
