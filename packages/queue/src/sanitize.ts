import type { QueueJsonObject, QueueJsonValue, QueuePayloadInput } from './types.js';

export const QUEUE_REDACTED = '[REDACTED]' as const;
export const QUEUE_BINARY_OMITTED = '[BINARY_OMITTED]' as const;

const MAX_DEPTH = 16;
const MAX_KEYS = 5000;
const SENSITIVE_KEY_MARKERS = [
  'password',
  'token',
  'secret',
  'credential',
  'apikey',
  'privatekey',
  'passcode',
  'recoverycode',
  'securityanswer',
  'authorization',
  'cookie',
  'databaseurl',
  'connectionstring'
];

/** Normalize one key before secret matching. */
function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Check whether a queue field name can contain secret material. */
export function isSensitiveQueueKey(key: string): boolean {
  const normalized = normalizedKey(key);
  return normalized === 'otp'
    || SENSITIVE_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

/** Sanitize value. */
function sanitizeValue(value: unknown, seen: Set<object>, depth: number, budget: { keys: number }): QueueJsonValue {
  if (depth > MAX_DEPTH) throw new Error('Queue payload exceeds maximum nesting depth.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Queue payload contains a non-finite number.');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error('Queue payload contains an invalid Date.');
    return value.toISOString();
  }
  if (value instanceof Error) return { name: value.name || 'Error' };
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return QUEUE_BINARY_OMITTED;
  if (Array.isArray(value)) {
    if (seen.has(value)) throw new Error('Queue payload contains circular references.');
    seen.add(value);
    const result = value.map((item) => sanitizeValue(item, seen, depth + 1, budget));
    seen.delete(value);
    return result;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) throw new Error('Queue payload contains circular references.');
    seen.add(value);
    const result: QueueJsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      budget.keys += 1;
      if (budget.keys > MAX_KEYS) throw new Error('Queue payload contains too many fields.');
      result[key] = isSensitiveQueueKey(key)
        ? QUEUE_REDACTED
        : sanitizeValue(entry, seen, depth + 1, budget);
    }
    seen.delete(value);
    return result;
  }
  throw new Error(`Queue payload contains unsupported value type: ${typeof value}.`);
}

/** Sanitize queue payload. */
export function sanitizeQueuePayload(input: QueuePayloadInput | null | undefined): QueueJsonObject {
  if (!input) return {};
  return sanitizeValue(input, new Set<object>(), 0, { keys: 0 }) as QueueJsonObject;
}
