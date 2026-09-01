import type { FastifyError, FastifyInstance, FastifyRequest } from 'fastify';
import {
  AppError,
  NotFoundError,
  ValidationError,
  normalizeAppError,
  toApiErrorEnvelope,
  type FieldError
} from '@construction-erp/errors';
import { requestLogBindings, toSafeErrorLog } from '@construction-erp/logging';
import {
  CrossCompanyAccessError,
  UntrustedCompanyScopeInputError
} from '@construction-erp/tenant-scope';

/** Request id for. */
function requestIdFor(request: FastifyRequest): string {
  return request.requestContext?.requestId ?? request.id;
}

/** Return fastify validation errors. */
function fastifyValidationErrors(error: FastifyError): readonly FieldError[] | undefined {
  const validation = error.validation;
  if (!Array.isArray(validation) || validation.length === 0) return undefined;

  return validation.map((item) => {
    const instancePath = typeof item.instancePath === 'string' ? item.instancePath : '';
    const field = instancePath.replace(/^\//, '').replaceAll('/', '.') || 'request';
    const message = typeof item.message === 'string' ? item.message : 'Invalid value.';
    return { field, message };
  });
}

/** Normalize request error. */
function normalizeRequestError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  // Client-provided tenant ownership is invalid input. The public response does
  // not echo the supplied company identifier.
  if (error instanceof UntrustedCompanyScopeInputError) {
    return new ValidationError({
      code: 'UNTRUSTED_COMPANY_SCOPE_INPUT',
      message: 'Company ownership is controlled by the server.',
      cause: error
    });
  }

  // Treat a cross-company target as unavailable rather than confirming that a
  // record exists in another tenant.
  if (error instanceof CrossCompanyAccessError) {
    return new NotFoundError({ cause: error });
  }

  if (error instanceof Error && 'validation' in error && Array.isArray((error as FastifyError).validation)) {
    const fieldErrors = fastifyValidationErrors(error as FastifyError);
    return new ValidationError({
      code: 'INVALID_REQUEST',
      message: 'Request validation failed.',
      ...(fieldErrors ? { fieldErrors } : {}),
      cause: error
    });
  }

  return normalizeAppError(error);
}

/** Register error handling. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const error = new NotFoundError({
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested route was not found.'
    });
    return reply.status(error.statusCode).send(toApiErrorEnvelope(error, requestIdFor(request)));
  });

  app.setErrorHandler((error, request, reply) => {
    const appError = normalizeRequestError(error);
    const logContext = {
      ...requestLogBindings(request.requestContext),
      errorCode: appError.code,
      error: toSafeErrorLog(appError)
    };

    // Never log the raw exception here. Its message/stack may contain SQL,
    // credentials, tokens or user-provided secret material.
    if (appError.statusCode >= 500) {
      request.log.error(logContext, 'request.failed');
    } else {
      request.log.warn(logContext, 'request.rejected');
    }

    return reply
      .status(appError.statusCode)
      .send(toApiErrorEnvelope(appError, requestIdFor(request)));
  });
}
