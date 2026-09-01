import type { AuditJsonObject, AuditJsonValue, AuditSnapshotInput } from './types.js';

export const AUDIT_REDACTED = '[REDACTED]';
export const AUDIT_BINARY_OMITTED = '[BINARY_OMITTED]';

const MAX_DEPTH = 20;

/** Return canonical key. */
function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Defensive deny-list for credentials and secret material. Audit records must
 * never persist the underlying value even when a domain object accidentally
 * contains it in a before/after snapshot.
 */
export function isSensitiveAuditKey(key: string): boolean {
  const normalized = canonicalKey(key);
  return (
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('credential') ||
    normalized.includes('apikey') ||
    normalized.includes('privatekey') ||
    normalized.includes('accesskey') ||
    normalized.includes('signingkey') ||
    normalized.includes('encryptionkey') ||
    normalized.includes('passcode') ||
    normalized.includes('recoverycode') ||
    normalized.includes('securityanswer') ||
    normalized.includes('cookie') ||
    normalized.includes('authorization') ||
    normalized.includes('bearer') ||
    normalized.includes('jwt') ||
    normalized.includes('signedurl') ||
    normalized.includes('presignedurl') ||
    normalized.includes('storagekey') ||
    normalized.includes('databaseurl') ||
    normalized.includes('connectionstring') ||
    normalized === 'otp'
  );
}

/** Sanitize value. */
function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): AuditJsonValue | undefined {
  if (depth > MAX_DEPTH) throw new Error('Audit snapshot exceeds maximum nesting depth.');
  if (value === null) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      if (!Number.isFinite(value)) throw new Error('Audit snapshot contains a non-finite number.');
      return value;
    case 'bigint':
      return value.toString();
    case 'undefined':
    case 'function':
    case 'symbol':
      return undefined;
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Audit snapshot contains an invalid Date.');
    return value.toISOString();
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    return AUDIT_BINARY_OMITTED;
  }

  if (value instanceof Error) {
    // Error messages/stacks may contain SQL, credentials or request data.
    return { name: value.name || 'Error' };
  }

  if (seen.has(value)) throw new Error('Audit snapshot must not contain circular references.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => sanitizeValue(item, seen, depth + 1) ?? null);
    }

    const output: AuditJsonObject = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveAuditKey(key)) {
        output[key] = AUDIT_REDACTED;
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

/** Sanitize audit snapshot. */
export function sanitizeAuditSnapshot(input: AuditSnapshotInput): AuditJsonObject {
  const sanitized = sanitizeValue(input, new WeakSet<object>(), 0);
  if (!sanitized || Array.isArray(sanitized) || typeof sanitized !== 'object') {
    throw new Error('Audit snapshot must be a JSON object.');
  }
  return sanitized as AuditJsonObject;
}
