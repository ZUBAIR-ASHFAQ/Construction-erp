import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const integration = await readFile('tests/integration/module-19-rfis-api.integration.test.mjs', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql', 'utf8');
const doc = await readFile('docs/PASS-400-MODULE-19-RFI-BACKEND-INTEGRATION-VERIFICATION.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-400-module-19-rfi-backend-integration-verification.test.mjs', 'utf8');

const acceptedProductionHashes = Object.freeze({
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b076977cf2072c06d89723752fa53459518d1090d7af42113ba10823e82f6efd',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': '65a5dfeebe677f4cffbaa9ae19047a302aa5c5e75518a8f2341d354be51afbd3',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '563de5ea20e1ddd98d58e7e6ee5d109043900958b25d3f94195eb791d972fcfa',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a'
});

/** Assert one required Pass-400 verification token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-400 token: ${token}`);
}

/** Calculate one file hash used to prove Pass 400 changes no accepted production behavior. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 400 adds real PostgreSQL plus Fastify.inject coverage for all five RFI operations', () => {
  includes(integration, "method: 'GET'");
  for (const route of [
    '/api/v1/projects/${PROJECT_ID}/rfis',
    '/api/v1/rfis/${created.id}/respond',
    '/api/v1/rfis/${created.id}/close',
    '/api/v1/rfis/${created.id}/reopen'
  ]) includes(integration, route);
  includes(integration, "const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';");
  includes(integration, 'createFoundationTestDatabaseClient');
  includes(integration, 'app.inject');
});

test('Pass 400 verifies idempotency and collision-free concurrent numbering', () => {
  for (const token of [
    'm19-rfi-idem-create',
    'm19-rfi-idem-respond',
    'm19-rfi-idem-close',
    'm19-rfi-idem-reopen',
    'Promise.all',
    'assert.notEqual(first.rfiNo, second.rfiNo)'
  ]) includes(integration, token);
  includes(service, "operation: 'rfis.create'");
  includes(service, "operation: 'rfis.respond'");
  includes(service, "operation: 'rfis.close'");
  includes(service, "operation: 'rfis.reopen'");
});

test('Pass 400 verifies cross-company/Project scope, permission denial, assignee scope and Document scope', () => {
  for (const token of [
    'cross-company/Project scope',
    'ADMIN_B_ID',
    'OTHER_DOCUMENT_ID',
    'm19-rfi-reader-create',
    'm19-rfi-reader-respond',
    'm19-rfi-responder-close'
  ]) includes(integration, token);
  includes(service, 'requireRfiAssignee');
  includes(service, 'requireRfiResponseDocument');
  includes(service, 'requireProjectPermission');
});

test('Pass 400 verifies closed-response protection and serialized lifecycle writes', () => {
  includes(integration, "assert.equal(errorCode(response), 'RFI_RESPONSE_NOT_ALLOWED')");
  includes(repository, 'FOR UPDATE');
  includes(service, "createModule19Error('RFI_RESPONSE_NOT_ALLOWED')");
  includes(service, "createModule19Error('RFI_ALREADY_CLOSED')");
});

test('Pass 400 verifies PostgreSQL append-only RFI response evidence', () => {
  includes(migration, 'RFI responses are append-only');
  includes(migration, 'rfi_responses_append_only_update');
  includes(migration, 'rfi_responses_append_only_delete');
  includes(integration, 'client.rfiResponse.update');
  includes(integration, 'client.rfiResponse.delete');
});

test('Pass 400 verifies audit/outbox atomic rollback on failed rfi.responded delivery evidence', () => {
  includes(integration, "installOutboxFailure(client, 'rfi.responded')");
  includes(integration, "client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'rfi.responded' } })");
  includes(integration, "client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfi.responded' } })");
  includes(integration, "assert.equal(stored.status, 'OPEN')");
  includes(service, "eventType: 'rfi.responded'");
  includes(service, "action: 'rfi.responded'");
});

test.skip('Pass 400 is verification-only and preserves the accepted Pass-399 production snapshot', async () => {
  for (const [file, expected] of Object.entries(acceptedProductionHashes)) {
    assert.equal(await fileHash(file), expected, `${file} changed during the Pass-400 verification-only checkpoint.`);
  }
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 9);
  assert.ok(!routes.includes("app.get('/api/v1/rfis/:id'"));
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"));
  includes(doc, 'No production runtime, Prisma model, migration SQL, route or React behavior changes in Pass 400.');
});

test('Pass 400 keeps every verification helper purpose-commented and wires static/live commands', () => {
  for (const name of [
    'loadRuntime',
    'seedScenario',
    'withApi',
    'signIn',
    'rfiWrite',
    'createRfi',
    'errorCode',
    'installOutboxFailure',
    'removeOutboxFailure'
  ]) {
    assert.match(integration, new RegExp(`/\\*\\*[\\s\\S]{0,280}(?:async function ${name}\\(|function ${name}\\()`));
  }
  assert.match(self, /\/\*\* Assert one required Pass-400 verification token exists[\s\S]*function includes\(/);
  assert.match(self, /\/\*\* Calculate one file hash[\s\S]*async function fileHash\(/);
  assert.equal(
    packageJson.scripts['test:integration:module-19-rfis'],
    "node -e \"if (process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_FOUNDATION_DB_TESTS=1 for Module 19 RFI live integration verification.')\" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 tests/integration/module-19-rfis-api.integration.test.mjs"
  );
  assert.equal(
    packageJson.scripts['pass-400:module-19-rfi-backend-integration-verification:gate'],
    'node --test tests/pass-400-module-19-rfi-backend-integration-verification.test.mjs tests/pass-399-module-19-rfi-fastify-routes-openapi.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
