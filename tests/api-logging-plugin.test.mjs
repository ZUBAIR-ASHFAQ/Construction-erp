import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

test('Fastify disables uncontrolled automatic request logging and registers Foundation lifecycle logging', async () => {
  const app = await source('apps/api/src/app.ts');
  assert.equal(app.includes('disableRequestLogging: true'), true);
  assert.equal(app.includes('createStructuredLoggerOptions'), true);
  assert.equal(app.includes('registerRequestContext(app);'), true);
  assert.equal(app.includes('registerStructuredRequestLogging(app);'), true);
  assert.equal(app.indexOf('registerRequestContext(app);') < app.indexOf('registerStructuredRequestLogging(app);'), true);
});

test('request lifecycle logs avoid raw bodies, query values and headers', async () => {
  const logging = await source('apps/api/src/plugins/logging.ts');
  assert.equal(logging.includes("'request.started'"), true);
  assert.equal(logging.includes("'request.completed'"), true);
  assert.equal(logging.includes("'request.aborted'"), true);
  assert.equal(logging.includes('requestLogBindings(request.requestContext)'), true);
  assert.equal(logging.includes('request.body'), false);
  assert.equal(logging.includes('request.query'), false);
  assert.equal(logging.includes('request.headers'), false);
});

test('error logging uses safe metadata rather than raw exception serialization', async () => {
  const errors = await source('apps/api/src/plugins/errors.ts');
  assert.equal(errors.includes('toSafeErrorLog(appError)'), true);
  assert.equal(errors.includes('requestLogBindings(request.requestContext)'), true);
  assert.equal(errors.includes('err: error'), false);
  assert.equal(errors.includes("'request.failed'"), true);
  assert.equal(errors.includes("'request.rejected'"), true);
});


test('custom logging redaction catches secret-bearing aliases and safe error fields are allow-listed', async () => {
  const redaction = await source('packages/logging/src/redaction.ts');
  const safeError = await source('packages/logging/src/safe-error.ts');

  assert.match(redaction, /SENSITIVE_KEY_MARKERS/);
  for (const marker of ['credential', 'privatekey', 'passcode', 'recoverycode', 'securityanswer', 'connectionstring']) {
    assert.equal(redaction.includes(`'${marker}'`), true, marker);
  }
  assert.match(redaction, /normalized\.includes\(marker\)/);
  assert.match(safeError, /SAFE_ERROR_NAME/);
  assert.match(safeError, /SAFE_CATEGORIES/);
  assert.match(safeError, /SAFE_CATEGORIES\.has\(rawCategory\)/);
});


test('background workers use the shared Pino logger instead of console logging', async () => {
  const loggingPackage = JSON.parse(await source('packages/logging/package.json'));
  const loggerSource = await source('packages/logging/src/logger.ts');
  const authWorker = await source('apps/api/src/workers/auth-notification.worker.ts');
  const approvalWorker = await source('apps/api/src/workers/approval-timing.worker.ts');

  assert.equal(loggingPackage.dependencies.pino, '^9.0.0');
  assert.match(loggerSource, /pino\(createStructuredLoggerOptions\(input\)\)/);
  for (const worker of [authWorker, approvalWorker]) {
    assert.match(worker, /createStructuredLogger/);
    assert.equal(worker.includes('console.info'), false);
    assert.equal(worker.includes('console.error'), false);
  }
});
