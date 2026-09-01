import pino, { type Logger } from 'pino';
import { createStructuredLoggerOptions } from './options.js';
import type { StructuredLoggerOptionsInput } from './types.js';

/** Create a Pino logger using the shared Foundation redaction and metadata rules. */
export function createStructuredLogger(input: StructuredLoggerOptionsInput): Logger {
  return pino(createStructuredLoggerOptions(input));
}
