import { DEFAULT_REDACT_PATHS, LOG_REDACTION_CENSOR } from './redaction.js';
import type { StructuredLoggerOptionsInput } from './types.js';

/** Validate and return non-empty text. */
function nonEmpty(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be a non-empty string.`);
  return normalized;
}

/** Check whether o timestamp. */
function isoTimestamp(): string {
  return `,"timestamp":"${new Date().toISOString()}"`;
}

/**
 * Returns a plain Pino-compatible logger options object without importing Pino,
 * keeping Foundation logging configuration reusable and dependency-light.
 */
export function createStructuredLoggerOptions(input: StructuredLoggerOptionsInput) {
  return {
    level: nonEmpty(input.level, 'level'),
    base: {
      service: nonEmpty(input.service, 'service'),
      environment: nonEmpty(input.environment, 'environment')
    },
    redact: {
      paths: [...DEFAULT_REDACT_PATHS],
      censor: LOG_REDACTION_CENSOR
    },
    timestamp: isoTimestamp
  };
}
