import { randomUUID } from 'node:crypto';

const SAFE_CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;

/** Create request id. */
export function createRequestId(): string {
  return randomUUID();
}

/**
 * Correlation IDs are telemetry only. Invalid/unbounded client values are
 * discarded so they cannot pollute logs or response headers.
 */
export function normalizeCorrelationId(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return SAFE_CORRELATION_ID.test(trimmed) ? trimmed : undefined;
}
