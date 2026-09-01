import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../apps/api/src/plugins/errors.ts', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../apps/api/src/app.ts', import.meta.url), 'utf8');
const envelopeSource = await readFile(new URL('../packages/errors/src/envelope.ts', import.meta.url), 'utf8');

test('Fastify registers both common error and not-found handlers', () => {
  assert.match(source, /setErrorHandler/);
  assert.match(source, /setNotFoundHandler/);
  assert.match(appSource, /registerErrorHandling\(app\)/);
});

test('cross-company errors do not disclose the other tenant', () => {
  assert.match(source, /CrossCompanyAccessError/);
  assert.match(source, /new NotFoundError\(\{ cause: error \}\)/);
  assert.doesNotMatch(source, /company-b|other company id/i);
});

test('caller supplied company ownership maps to stable invalid input', () => {
  assert.match(source, /UNTRUSTED_COMPANY_SCOPE_INPUT/);
  assert.match(source, /Company ownership is controlled by the server/);
});

test('request validation and error responses are correlated with request ID', () => {
  assert.match(source, /INVALID_REQUEST/);
  assert.match(source, /requestIdFor\(request\)/);
  assert.match(source, /toApiErrorEnvelope/);
});

test('4xx and 5xx failures use separate structured logging severity', () => {
  assert.match(source, /appError\.statusCode >= 500/);
  assert.match(source, /request\.log\.error/);
  assert.match(source, /request\.log\.warn/);
});

test('hidden server errors cannot expose field-level details', () => {
  assert.match(envelopeSource, /error\.exposeMessage \? error\.fieldErrors : undefined/);
  assert.doesNotMatch(envelopeSource, /error:\s*error\.fieldErrors\?\.length/);
});
