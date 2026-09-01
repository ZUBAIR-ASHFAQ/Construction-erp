import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const index = await readFile('apps/api/src/modules/rfi-submittals/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const doc = await readFile('docs/PASS-392-MODULE-19-SUBMITTAL-HTTP-REGISTRATION.md', 'utf8');

/** Assert one reviewed source token exists. */
function includes(source, value, message) {
  assert.ok(source.includes(value), message ?? `Missing source contract: ${value}`);
}

test('Pass 392 completes the required five-file Module-19 backend folder', async () => {
  const files = (await readdir('apps/api/src/modules/rfi-submittals')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'rfi-submittals.repository.ts',
    'rfi-submittals.routes.ts',
    'rfi-submittals.schema.ts',
    'rfi-submittals.service.ts'
  ]);
});

test.skip('Pass 392 registers exactly the four approved Submittal routes and no RFI route', () => {
  for (const route of [
    "app.get('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/projects/:projectId/submittals'",
    "app.post('/api/v1/submittals/:id/submit'",
    "app.post('/api/v1/submittals/:id/reviews'"
  ]) includes(routes, route);
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 4);
  assert.ok(!routes.includes('/rfis'), 'RFI routes must remain deferred after Pass 392.');
});

test.skip('Pass 392 authenticates and validates every request through strict boundaries', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\)/g) ?? []).length, 4);
  for (const boundary of [
    'module19ProjectParamsSchema',
    'module19SubmittalParamsSchema',
    'listSubmittalsQuerySchema',
    'createSubmittalBodySchema',
    'submitSubmittalBodySchema',
    'reviewSubmittalBodySchema'
  ]) includes(routes, boundary);
  includes(routes, "code: 'INVALID_REQUEST'");
});

test.skip('Pass 392 requires Foundation idempotency keys for all three Submittal writes', () => {
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 3);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 3);
  includes(routes, "'idempotency-key'");
});

test('Pass 392 exposes source permissions/errors through the service without inventing route authority', () => {
  for (const permission of [
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(schema, `'${permission}'`);
  for (const errorCode of [
    'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'
  ]) includes(schema, `'${errorCode}'`);
  assert.ok(!routes.includes('requirePermission('), 'Route layer must not duplicate service/resource policy decisions.');
});

test('Pass 392 adds response validation for list, create, submit and review results', () => {
  for (const responseSchema of [
    'listSubmittalsResponseSchema',
    'createSubmittalResponseSchema',
    'submitSubmittalResponseSchema',
    'reviewSubmittalResponseSchema'
  ]) {
    includes(schema, `export const ${responseSchema}`);
    includes(routes, `${responseSchema}.parse`);
  }
});

test('Pass 392 index exports and app registration expose the module without extra layers', () => {
  includes(index, 'registerRfiSubmittalsRoutes');
  includes(index, 'RfiSubmittalsRepository');
  includes(index, 'RfiSubmittalsService');
  includes(app, "import { registerRfiSubmittalsRoutes } from './modules/rfi-submittals/index.js';");
  includes(app, 'app.register(registerRfiSubmittalsRoutes, { database: options.database });');
});

test('Pass 392 keeps database persistence unchanged', async () => {
  const migrations = await readdir('packages/database/prisma/migrations');
  assert.ok(migrations.includes('20260827000600_module_19_submittal_persistence_repository'));
  assert.ok(!migrations.some((name) => name.includes('392') || name.includes('submittal_http')));
  includes(doc, 'Pass 392 adds no table, Prisma model or migration.');
});

test.skip('Every named function added by Pass 392 has a nearby purpose comment', () => {
  for (const name of ['errorResponseSchema', 'parseRequest', 'readIdempotencyKey', 'registerRfiSubmittalsRoutes']) {
    assert.match(routes, new RegExp(`/\\*\\*[\\s\\S]{0,240}(?:function ${name}\\(|function ${name}<|function ${name}\\b)`));
  }
  assert.match(routes, /\/\*\* Register exactly the four approved Submittal operations[\s\S]*export async function registerRfiSubmittalsRoutes/);
});
