import {
  ConflictError,
  InfrastructureError,
  NotFoundError,
  ValidationError
} from '@construction-erp/errors';

/** Return invalid storage key. */
export function invalidStorageKey(message = 'The object-storage key is invalid.'): ValidationError {
  return new ValidationError({ code: 'INVALID_STORAGE_KEY', message });
}

/** Return storage object not found. */
export function storageObjectNotFound(cause?: unknown): NotFoundError {
  return new NotFoundError({
    code: 'STORAGE_OBJECT_NOT_FOUND',
    message: 'The stored object was not found.',
    cause
  });
}

/** Return storage object already exists. */
export function storageObjectAlreadyExists(cause?: unknown): ConflictError {
  return new ConflictError({
    code: 'STORAGE_OBJECT_ALREADY_EXISTS',
    message: 'The storage key is already in use.',
    cause
  });
}

/** Return storage unavailable. */
export function storageUnavailable(cause?: unknown): InfrastructureError {
  return new InfrastructureError({
    code: 'STORAGE_UNAVAILABLE',
    message: 'Object storage is temporarily unavailable.',
    retryable: true,
    cause
  });
}

/** Return storage operation failed. */
export function storageOperationFailed(cause?: unknown): InfrastructureError {
  return new InfrastructureError({
    code: 'STORAGE_OPERATION_FAILED',
    message: 'The object-storage operation could not be completed.',
    retryable: true,
    cause
  });
}
