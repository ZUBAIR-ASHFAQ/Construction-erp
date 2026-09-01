import { AppError } from './app-error.js';
import type { FieldError } from './types.js';

type PublicErrorOptions = Readonly<{
  code?: string;
  message?: string;
  cause?: unknown;
}>;

export class ValidationError extends AppError {
  /** Create a new ValidationError instance. */
  constructor(options: PublicErrorOptions & Readonly<{ fieldErrors?: readonly FieldError[] }> = {}) {
    super({
      code: options.code ?? 'INVALID_REQUEST',
      message: options.message ?? 'The request is invalid.',
      statusCode: 400,
      category: 'validation',
      fieldErrors: options.fieldErrors,
      cause: options.cause
    });
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  /** Create a new AuthenticationError instance. */
  constructor(options: PublicErrorOptions = {}) {
    super({
      code: options.code ?? 'AUTHENTICATION_REQUIRED',
      message: options.message ?? 'Authentication is required.',
      statusCode: 401,
      category: 'authentication',
      cause: options.cause
    });
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  /** Create a new AuthorizationError instance. */
  constructor(options: PublicErrorOptions = {}) {
    super({
      code: options.code ?? 'FORBIDDEN',
      message: options.message ?? 'You are not allowed to perform this action.',
      statusCode: 403,
      category: 'authorization',
      cause: options.cause
    });
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends AppError {
  /** Create a new NotFoundError instance. */
  constructor(options: PublicErrorOptions = {}) {
    super({
      code: options.code ?? 'RESOURCE_NOT_FOUND',
      message: options.message ?? 'The requested resource was not found.',
      statusCode: 404,
      category: 'not_found',
      cause: options.cause
    });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  /** Create a new ConflictError instance. */
  constructor(options: PublicErrorOptions = {}) {
    super({
      code: options.code ?? 'BUSINESS_CONFLICT',
      message: options.message ?? 'The request conflicts with the current resource state.',
      statusCode: 409,
      category: 'conflict',
      cause: options.cause
    });
    this.name = 'ConflictError';
  }
}

export class InfrastructureError extends AppError {
  /** Create a new InfrastructureError instance. */
  constructor(options: Omit<PublicErrorOptions, 'message'> & Readonly<{ message?: string; retryable?: boolean }> = {}) {
    super({
      code: options.code ?? 'SERVICE_UNAVAILABLE',
      message: options.message ?? 'A required service is temporarily unavailable.',
      statusCode: 503,
      category: 'infrastructure',
      retryable: options.retryable ?? true,
      exposeMessage: true,
      cause: options.cause
    });
    this.name = 'InfrastructureError';
  }
}

export class InternalError extends AppError {
  /** Create a new InternalError instance. */
  constructor(cause?: unknown) {
    super({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred.',
      statusCode: 500,
      category: 'internal',
      exposeMessage: false,
      cause
    });
    this.name = 'InternalError';
  }
}
