import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AppError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  InfrastructureError,
  InternalError,
  NotFoundError,
  ValidationError,
  normalizeAppError,
  toApiErrorEnvelope
} from '../packages/errors/dist/index.js';

test('validation errors expose stable code, field errors, and request ID', () => {
  const error = new ValidationError({
    code: 'INVALID_EMAIL',
    message: 'Email is invalid.',
    fieldErrors: [{ field: 'email', message: 'Invalid email format.' }]
  });
  const body = toApiErrorEnvelope(error, 'req-123');

  assert.equal(error.statusCode, 400);
  assert.equal(error.category, 'validation');
  assert.deepEqual(body, {
    error: {
      code: 'INVALID_EMAIL',
      message: 'Email is invalid.',
      requestId: 'req-123',
      fieldErrors: [{ field: 'email', message: 'Invalid email format.' }]
    }
  });
});

test('standard Foundation categories use expected HTTP statuses', () => {
  assert.equal(new AuthenticationError().statusCode, 401);
  assert.equal(new AuthorizationError().statusCode, 403);
  assert.equal(new NotFoundError().statusCode, 404);
  assert.equal(new ConflictError().statusCode, 409);
  assert.equal(new InfrastructureError().statusCode, 503);
  assert.equal(new InternalError().statusCode, 500);
});

test('unknown exceptions are normalized without exposing their message or stack', () => {
  const secret = new Error('postgres password=super-secret stack detail');
  const normalized = normalizeAppError(secret);
  const body = toApiErrorEnvelope(normalized, 'req-safe');
  const serialized = JSON.stringify(body);

  assert.equal(normalized instanceof InternalError, true);
  assert.equal(normalized.cause, secret);
  assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(body.error.message, 'An unexpected error occurred.');
  assert.equal(serialized.includes('super-secret'), false);
  assert.equal(serialized.includes('stack'), false);
});

test('raw 5xx AppError messages are redacted unless explicitly marked public', () => {
  const error = new AppError({
    code: 'DATABASE_QUERY_FAILED',
    message: 'SELECT * FROM secrets WHERE token=abc',
    statusCode: 500,
    category: 'internal'
  });
  const body = toApiErrorEnvelope(error, 'req-redacted');

  assert.equal(body.error.code, 'INTERNAL_SERVER_ERROR');
  assert.equal(body.error.message, 'An unexpected error occurred.');
  assert.equal(JSON.stringify(body).includes('SELECT'), false);
});



test('hidden 5xx errors also hide field-level details', () => {
  const error = new AppError({
    code: 'DATABASE_QUERY_FAILED',
    message: 'Internal database failure.',
    statusCode: 500,
    category: 'internal',
    fieldErrors: [{ field: 'query', message: 'SELECT secret FROM credentials' }]
  });
  const body = toApiErrorEnvelope(error, 'req-hidden-fields');

  assert.equal('fieldErrors' in body.error, false);
  assert.equal(JSON.stringify(body).includes('SELECT secret'), false);
});

test('infrastructure errors expose only their intentionally public service message', () => {
  const internal = new Error('S3 secret endpoint detail');
  const error = new InfrastructureError({ cause: internal });
  const body = toApiErrorEnvelope(error, 'req-infra');

  assert.equal(error.retryable, true);
  assert.equal(body.error.code, 'SERVICE_UNAVAILABLE');
  assert.equal(body.error.message, 'A required service is temporarily unavailable.');
  assert.equal(JSON.stringify(body).includes('S3 secret'), false);
});

test('stable error codes are enforced as UPPER_SNAKE_CASE', () => {
  assert.throws(
    () => new AppError({ code: 'bad-code', message: 'bad', statusCode: 400, category: 'validation' }),
    /UPPER_SNAKE_CASE/
  );
});

test('error HTTP status must be in 400-599 range', () => {
  assert.throws(
    () => new AppError({ code: 'BAD_STATUS', message: 'bad', statusCode: 200, category: 'validation' }),
    /HTTP error status/
  );
});
