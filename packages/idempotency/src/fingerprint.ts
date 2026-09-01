import { createHash } from 'node:crypto';

const MAX_DEPTH = 30;
const SECRET_KEY_MARKERS = [
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
  'connectionstring',
  'authorization',
];

/** Return canonical key. */
function canonicalKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Check whether sensitive fingerprint key. */
export function isSensitiveFingerprintKey(key: string): boolean {
  const normalized = canonicalKey(key);
  return normalized === 'otp' || SECRET_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

/** Encode one fingerprint value deterministically. */
function encode(value: unknown, seen: WeakSet<object>, depth: number): string {
  if (depth > MAX_DEPTH) throw new TypeError('Idempotency fingerprint input exceeds maximum nesting depth.');
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) throw new TypeError('Idempotency fingerprint input contains a non-finite number.');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'bigint':
      return `{"$bigint":${JSON.stringify(value.toString())}}`;
    case 'undefined':
    case 'function':
    case 'symbol':
      throw new TypeError('Idempotency fingerprint input must be JSON-like and fully defined.');
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('Idempotency fingerprint input contains an invalid Date.');
    return `{"$date":${JSON.stringify(value.toISOString())}}`;
  }

  if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
    throw new TypeError('Binary data must not be included in an idempotency fingerprint.');
  }
  if (value instanceof Error) {
    throw new TypeError('Error objects must not be included in an idempotency fingerprint.');
  }

  if (seen.has(value)) throw new TypeError('Idempotency fingerprint input must not contain circular references.');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => encode(item, seen, depth + 1)).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Idempotency fingerprint input must contain only plain objects, arrays and JSON-like values.');
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    for (const [key] of entries) {
      if (isSensitiveFingerprintKey(key)) {
        throw new TypeError(`Sensitive field ${key} must not be included in an idempotency fingerprint.`);
      }
    }

    return `{${entries
      .map(([key, child]) => `${JSON.stringify(key)}:${encode(child, seen, depth + 1)}`)
      .join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

/**
 * Produces a deterministic SHA-256 digest without persisting the original
 * command input. Object property order does not affect the result.
 */
export function fingerprintRequest(input: unknown): string {
  return createHash('sha256').update(encode(input, new WeakSet<object>(), 0), 'utf8').digest('hex');
}
