export { AppError } from './app-error.js';
export {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InfrastructureError,
  InternalError,
  NotFoundError,
  ValidationError
} from './errors.js';
export { normalizeAppError, toApiErrorEnvelope } from './envelope.js';
export type {
  ApiErrorBody,
  ApiErrorEnvelope,
  AppErrorOptions,
  ErrorCategory,
  FieldError
} from './types.js';
