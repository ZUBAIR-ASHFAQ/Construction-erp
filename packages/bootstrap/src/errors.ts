import { AppError, ConflictError, ValidationError } from '@construction-erp/errors';

/** Return invalid bootstrap input. */
export function invalidBootstrapInput(cause?: unknown): ValidationError {
  return new ValidationError({
    code: 'INVALID_INITIAL_BOOTSTRAP_INPUT',
    message: 'The initial bootstrap input is invalid.',
    cause
  });
}

/** Return bootstrap key reused. */
export function bootstrapKeyReused(): ConflictError {
  return new ConflictError({
    code: 'INITIAL_BOOTSTRAP_KEY_REUSED',
    message: 'The bootstrap key was already used with different provisioning input.'
  });
}


/** Return bootstrap already initialized. */
export function bootstrapAlreadyInitialized(): ConflictError {
  return new ConflictError({
    code: 'INITIAL_BOOTSTRAP_ALREADY_INITIALIZED',
    message: 'Initial provisioning can only begin against an unprovisioned company master.'
  });
}

/** Return bootstrap identity result invalid. */
export function bootstrapIdentityResultInvalid(cause?: unknown): AppError {
  return new AppError({
    code: 'INITIAL_BOOTSTRAP_IDENTITY_RESULT_INVALID',
    message: 'The identity bootstrap adapter returned an invalid result.',
    statusCode: 500,
    category: 'internal',
    exposeMessage: false,
    cause
  });
}

/** Return bootstrap record invalid. */
export function bootstrapRecordInvalid(cause?: unknown): AppError {
  return new AppError({
    code: 'INITIAL_BOOTSTRAP_RECORD_INVALID',
    message: 'The persisted initial bootstrap state is invalid.',
    statusCode: 500,
    category: 'internal',
    exposeMessage: false,
    cause
  });
}
