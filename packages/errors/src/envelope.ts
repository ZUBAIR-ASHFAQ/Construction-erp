import { AppError } from './app-error.js';
import { InternalError } from './errors.js';
import type { ApiErrorEnvelope } from './types.js';

/** Normalize app error. */
export function normalizeAppError(error: unknown): AppError {
  return error instanceof AppError ? error : new InternalError(error);
}

/** Convert one application error to the public API error envelope. */
export function toApiErrorEnvelope(error: AppError, requestId: string): ApiErrorEnvelope {
  const base = {
    code: error.exposeMessage ? error.code : 'INTERNAL_SERVER_ERROR',
    message: error.exposeMessage ? error.message : 'An unexpected error occurred.',
    requestId
  };

  const fieldErrors = error.exposeMessage ? error.fieldErrors : undefined;

  return {
    error: fieldErrors?.length
      ? { ...base, fieldErrors }
      : base
  };
}
