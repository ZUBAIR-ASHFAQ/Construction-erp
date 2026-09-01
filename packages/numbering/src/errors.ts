import { ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';

/** Return invalid sequence definition. */
export function invalidSequenceDefinition(cause?: unknown): ValidationError {
  return new ValidationError({
    code: 'INVALID_NUMBER_SEQUENCE_DEFINITION',
    message: 'The number sequence definition is invalid.',
    cause
  });
}

/** Return sequence not found. */
export function sequenceNotFound(): NotFoundError {
  return new NotFoundError({
    code: 'NUMBER_SEQUENCE_NOT_FOUND',
    message: 'The requested number sequence was not found.'
  });
}

/** Return sequence inactive. */
export function sequenceInactive(): ConflictError {
  return new ConflictError({
    code: 'NUMBER_SEQUENCE_INACTIVE',
    message: 'The requested number sequence is inactive.'
  });
}

/** Return sequence exhausted. */
export function sequenceExhausted(): ConflictError {
  return new ConflictError({
    code: 'NUMBER_SEQUENCE_EXHAUSTED',
    message: 'The requested number sequence cannot allocate another value.'
  });
}

/** Return sequence definition conflict. */
export function sequenceDefinitionConflict(): ConflictError {
  return new ConflictError({
    code: 'NUMBER_SEQUENCE_DEFINITION_CONFLICT',
    message: 'An existing number sequence uses a different immutable definition.'
  });
}
