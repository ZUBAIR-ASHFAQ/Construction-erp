import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const rfiIntegration = await readFile('tests/integration/module-19-rfis-api.integration.test.mjs', 'utf8');
const submittalIntegration = await readFile('tests/integration/module-19-submittals-api.integration.test.mjs', 'utf8');
const freeze = await readFile('docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md', 'utf8');
const doc = await readFile('docs/PASS-401-MODULE-19-DETAIL-HISTORY-READBACK.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-401-module-19-detail-history-readback.test.mjs', 'utf8');

const unchangedProductionFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07'
});

/** Assert one required Pass-401 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-401 token: ${token}`);
}

/** Return one source slice between two stable implementation tokens. */
function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing source start token: ${startToken}`);
  assert.ok(end > start, `Missing source end token: ${endToken}`);
  return source.slice(start, end);
}

/** Calculate one regression hash for a production file that Pass 401 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 401 implements exactly the two frozen durable detail/history response shapes', () => {
  includes(freeze, 'GET /api/v1/rfis/:id');
  includes(freeze, 'GET /api/v1/submittals/:id');
  includes(schema, 'export const rfiDetailResponseSchema');
  includes(schema, 'responses: z.array(rfiResponseEntrySchema)');
  includes(schema, 'export const submittalRevisionDetailResponseSchema');
  includes(schema, 'reviews: z.array(submittalReviewResponseSchema)');
  includes(schema, 'export const submittalDetailResponseSchema');
  includes(schema, 'revisions: z.array(submittalRevisionDetailResponseSchema)');
});

test('Pass 401 service readback requires existing read permissions and reuses ordered repository helpers', () => {
  const rfiRead = sourceSlice(service, 'async getRfiDetails(', '/** Create one Project RFI');
  includes(rfiRead, "resolveProjectVisibility(usersRepository, 'rfi.read'");
  includes(rfiRead, "requireProjectPermission(usersRepository, rfi.projectId, 'rfi.read'");
  includes(rfiRead, 'repository.findRfiById');
  includes(rfiRead, 'repository.listRfiResponses');
  includes(rfiRead, "createModule19Error('RFI_NOT_FOUND')");
  assert.ok(!rfiRead.includes('recordAudit('));
  assert.ok(!rfiRead.includes('recordOutboxEvent('));

  const submittalRead = sourceSlice(service, 'async getSubmittalDetails(', '/** Create one Project Submittal');
  includes(submittalRead, "resolveProjectVisibility(usersRepository, 'submittals.read'");
  includes(submittalRead, "requireProjectPermission(usersRepository, submittal.projectId, 'submittals.read'");
  includes(submittalRead, 'repository.findSubmittalById');
  includes(submittalRead, 'repository.listSubmittalRevisions');
  includes(submittalRead, 'repository.listSubmittalReviews');
  includes(submittalRead, "createModule19Error('SUBMITTAL_NOT_FOUND')");
  assert.ok(!submittalRead.includes('recordAudit('));
  assert.ok(!submittalRead.includes('recordOutboxEvent('));

  includes(repository, "orderBy: [{ respondedAt: 'asc' }, { id: 'asc' }]");
  includes(repository, "orderBy: [{ revisionNo: 'asc' }, { id: 'asc' }]");
  includes(repository, "orderBy: [{ reviewedAt: 'asc' }, { id: 'asc' }]");
});

test('Pass 401 registers exactly eleven Module-19 routes with the two readbacks authenticated and documented', () => {
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 11);
  for (const token of [
    "app.get('/api/v1/rfis/:id'",
    "operationId: 'module19GetRfiDetails'",
    'rfiDetailResponseSchema.parse(await service.getRfiDetails(params.id))',
    "app.get('/api/v1/submittals/:id'",
    "operationId: 'module19GetSubmittalDetails'",
    'submittalDetailResponseSchema.parse(await service.getSubmittalDetails(params.id))'
  ]) includes(routes, token);

  const rfiRoute = sourceSlice(routes, "app.get('/api/v1/rfis/:id'", "app.post('/api/v1/projects/:projectId/rfis'");
  const submittalRoute = sourceSlice(routes, "app.get('/api/v1/submittals/:id'", "app.post('/api/v1/projects/:projectId/submittals'");
  for (const readRoute of [rfiRoute, submittalRoute]) {
    includes(readRoute, 'await authenticateRequest(request, options.database)');
    assert.ok(!readRoute.includes('IDEMPOTENCY_HEADERS_JSON_SCHEMA'));
    assert.ok(!readRoute.includes('readIdempotencyKey(request)'));
  }
});

test('Pass 401 extends both disposable PostgreSQL integration suites for durable and isolated detail reads', () => {
  includes(rfiIntegration, 'url: `/api/v1/rfis/${created.id}`');
  includes(rfiIntegration, 'assert.equal(response.json().data.responses.length, 2)');
  includes(rfiIntegration, 'headers: { authorization: `Bearer ${readerToken}` }');
  includes(rfiIntegration, 'headers: { authorization: `Bearer ${foreignToken}` }');

  includes(submittalIntegration, 'url: `/api/v1/submittals/${created.id}`');
  includes(submittalIntegration, 'assert.equal(response.json().data.revisions.length, 2)');
  includes(submittalIntegration, 'assert.equal(response.json().data.revisions[0].reviews.length, 1)');
  includes(submittalIntegration, 'assert.equal(response.json().data.revisions[1].reviews.length, 0)');
});

test.skip('Pass 401 adds no Prisma, migration, repository, registration, permission, error or event surface', async () => {
  for (const [file, expected] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed during the readback-only production repair.`);
  }

  const expectedPermissions = ['rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close', 'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'];
  const expectedErrors = ['RFI_NOT_FOUND', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED', 'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'];
  const expectedEvents = ['rfi.created', 'rfi.responded', 'rfi.closed', 'submittal.submitted', 'submittal.reviewed'];
  for (const token of [...expectedPermissions, ...expectedErrors, ...expectedEvents]) includes(schema, `'${token}'`);

  includes(doc, 'no Prisma model;');
  includes(doc, 'no migration;');
  includes(doc, 'no repository method;');
  includes(doc, 'no Module-20 production code.');
});

test('Pass 401 keeps new named functions purpose-commented and registers the focused gate', () => {
  assert.match(service, /\/\*\* Load one authorized RFI[\s\S]{0,220}async getRfiDetails\(/);
  assert.match(service, /\/\*\* Load one authorized Submittal[\s\S]{0,240}async getSubmittalDetails\(/);
  assert.match(self, /\/\*\* Assert one required Pass-401 source token exists[\s\S]*function includes\(/);
  assert.match(self, /\/\*\* Return one source slice[\s\S]*function sourceSlice\(/);
  assert.match(self, /\/\*\* Calculate one regression hash[\s\S]*async function fileHash\(/);
  assert.equal(
    packageJson.scripts['pass-401:module-19-detail-history-readback:gate'],
    'node --test tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
  includes(doc, 'Pass 402 — Module 19 React Typed API Client');
});
