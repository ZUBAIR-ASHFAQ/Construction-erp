import type { SafeErrorLog } from './types.js';

const STABLE_CODE = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;
const SAFE_ERROR_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/;
const SAFE_CATEGORIES = new Set([
  'validation',
  'authentication',
  'authorization',
  'not_found',
  'conflict',
  'infrastructure',
  'internal'
]);

/** Read string. */
function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Read number. */
function readNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Converts an exception into intentionally narrow operational metadata. Error
 * messages and stacks are deliberately excluded because they may contain SQL,
 * credentials, tokens, or user-provided secrets.
 */
export function toSafeErrorLog(error: unknown): SafeErrorLog {
  if (!error || typeof error !== 'object') {
    return Object.freeze({ name: 'UnknownError' });
  }

  const record = error as Record<string, unknown>;
  const rawName = readString(record, 'name');
  const name = rawName && SAFE_ERROR_NAME.test(rawName) ? rawName : 'Error';
  const code = readString(record, 'code');
  const rawCategory = readString(record, 'category');
  const category = rawCategory && SAFE_CATEGORIES.has(rawCategory) ? rawCategory : undefined;
  const statusCode = readNumber(record, 'statusCode');
  const retryable = typeof record.retryable === 'boolean' ? record.retryable : undefined;

  return Object.freeze({
    name,
    ...(code && STABLE_CODE.test(code) ? { code } : {}),
    ...(category ? { category } : {}),
    ...(statusCode && statusCode >= 400 && statusCode <= 599 ? { statusCode } : {}),
    ...(retryable !== undefined ? { retryable } : {})
  });
}
