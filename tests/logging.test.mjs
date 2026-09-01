import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_REDACT_PATHS,
  captureCorrelationMetadata,
  createStructuredLoggerOptions,
  isSensitiveLogKey,
  requestLogBindings,
  sanitizeLogValue,
  toSafeErrorLog
} from '../packages/logging/dist/index.js';

test('structured logger options include service/environment and secret redaction paths', () => {
  const options = createStructuredLoggerOptions({
    level: 'info',
    service: 'Construction ERP',
    environment: 'test'
  });

  assert.equal(options.level, 'info');
  assert.deepEqual(options.base, { service: 'Construction ERP', environment: 'test' });
  assert.equal(options.redact.censor, '[REDACTED]');
  assert.equal(DEFAULT_REDACT_PATHS.includes('req.headers.authorization'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('body.password'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('refreshToken'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('DATABASE_URL'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('AUTH_ACTION_TOKEN_SECRET'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('AUTH_NOTIFICATION_WEBHOOK_TOKEN'), true);
  assert.equal(DEFAULT_REDACT_PATHS.includes('APPROVAL_NOTIFICATION_WEBHOOK_TOKEN'), true);
  assert.match(options.timestamp(), /^,"timestamp":"\d{4}-\d{2}-\d{2}T/);
});

test('sensitive key recognition covers credentials without treating normal identifiers as secrets', () => {
  assert.equal(isSensitiveLogKey('password_hash'), true);
  assert.equal(isSensitiveLogKey('accessTokenHash'), true);
  assert.equal(isSensitiveLogKey('refreshToken'), true);
  assert.equal(isSensitiveLogKey('x-api-key'), true);
  assert.equal(isSensitiveLogKey('authActionTokenSecret'), true);
  assert.equal(isSensitiveLogKey('smtpPassword'), true);
  assert.equal(isSensitiveLogKey('clientCredential'), true);
  assert.equal(isSensitiveLogKey('privateKeyPem'), true);
  assert.equal(isSensitiveLogKey('connectionString'), true);
  assert.equal(isSensitiveLogKey('companyId'), false);
  assert.equal(isSensitiveLogKey('requestId'), false);
});

test('custom log sanitizer recursively censors secret-bearing fields', () => {
  const input = {
    companyId: 'company-1',
    auth: {
      password: 'super-secret-password',
      refresh_token: 'refresh-secret',
      nested: [{ apiKey: 'abc123', safe: 'kept' }]
    },
    databaseUrl: 'postgresql://user:password@db/erp'
  };

  const sanitized = sanitizeLogValue(input);
  const serialized = JSON.stringify(sanitized);
  assert.equal(serialized.includes('super-secret-password'), false);
  assert.equal(serialized.includes('refresh-secret'), false);
  assert.equal(serialized.includes('abc123'), false);
  assert.equal(serialized.includes('postgresql://'), false);
  assert.equal(serialized.includes('company-1'), true);
  assert.equal(serialized.includes('kept'), true);
});

test('safe error metadata excludes exception message and stack', () => {
  const error = new Error('password=super-secret SELECT * FROM credentials');
  error.stack = 'stack includes bearer-token-secret';

  const safe = toSafeErrorLog(error);
  const serialized = JSON.stringify(safe);

  assert.deepEqual(safe, { name: 'Error' });
  assert.equal(serialized.includes('super-secret'), false);
  assert.equal(serialized.includes('SELECT'), false);
  assert.equal(serialized.includes('bearer-token-secret'), false);
});

test('safe error metadata preserves only stable operational fields', () => {
  const error = Object.assign(new Error('do-not-log-me'), {
    code: 'SERVICE_UNAVAILABLE',
    category: 'infrastructure',
    statusCode: 503,
    retryable: true,
    token: 'never-log-me'
  });

  assert.deepEqual(toSafeErrorLog(error), {
    name: 'Error',
    code: 'SERVICE_UNAVAILABLE',
    category: 'infrastructure',
    statusCode: 503,
    retryable: true
  });
});

test('request bindings carry server request/correlation IDs before authentication', () => {
  const context = {
    requestId: 'req-1',
    correlationId: 'corr-1',
    startedAt: new Date(),
    security: null
  };

  assert.deepEqual(requestLogBindings(context), {
    requestId: 'req-1',
    correlationId: 'corr-1'
  });
});

test('request bindings add only trusted identity and compact project-scope metadata', () => {
  const context = {
    requestId: 'req-2',
    correlationId: 'corr-2',
    startedAt: new Date(),
    security: {
      actorUserId: 'user-1',
      companyId: 'company-1',
      projectScope: { kind: 'restricted', projectIds: ['p1', 'p2', 'p3'] }
    }
  };

  assert.deepEqual(requestLogBindings(context), {
    requestId: 'req-2',
    correlationId: 'corr-2',
    companyId: 'company-1',
    actorUserId: 'user-1',
    projectScopeKind: 'restricted',
    projectScopeCount: 3
  });
});

test('correlation metadata is suitable for future audit/outbox/queue propagation', () => {
  const context = {
    requestId: 'req-3',
    correlationId: 'corr-3',
    startedAt: new Date(),
    security: {
      actorUserId: 'user-3',
      companyId: 'company-3',
      projectScope: { kind: 'not-resolved' }
    }
  };

  assert.deepEqual(captureCorrelationMetadata(context), {
    requestId: 'req-3',
    correlationId: 'corr-3',
    companyId: 'company-3',
    actorUserId: 'user-3',
    projectScopeKind: 'not-resolved'
  });
});


test('safe error metadata drops arbitrary provider-controlled names and categories', () => {
  const safe = toSafeErrorLog({
    name: 'password=leak',
    category: 'token=leak',
    code: 'UPSTREAM_FAILED',
    statusCode: 502,
    retryable: true
  });

  assert.deepEqual(safe, {
    name: 'Error',
    code: 'UPSTREAM_FAILED',
    statusCode: 502,
    retryable: true
  });
});
