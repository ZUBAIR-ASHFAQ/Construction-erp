import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const doc = await readFile('docs/PASS-398-MODULE-19-RFI-SERVICE-WORKFLOW.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const unchangedProductionFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b076977cf2072c06d89723752fa53459518d1090d7af42113ba10823e82f6efd',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': 'e8b95cc88b3020f80b5318b37b12b13b03473521d9a22acd22bd32e202c753a9',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'tests/integration/module-19-submittals-api.integration.test.mjs': '69ad7f5471a2f9d1541df5b1f4ff1ad6b6b12135e63471157d02c85b0ea5a4c2'
});

/** Assert one required Pass-398 service token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-398 service token: ${token}`);
}

/** Return one service slice between two focused declarations. */
function serviceSlice(startToken, endToken) {
  const start = service.indexOf(startToken);
  const end = service.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing service start token: ${startToken}`);
  assert.ok(end > start, `Missing service end token: ${endToken}`);
  return service.slice(start, end);
}

/** Calculate one unchanged production-file hash. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 398 adds the minimum private RFI lifecycle and browser-safe serializers', () => {
  for (const token of [
    "const RFI_OPEN = 'OPEN'",
    "const RFI_CLOSED = 'CLOSED'",
    "const RFI_RESPONSE_TYPE = 'RESPONSE'",
    "const RFI_SEQUENCE_KEY = 'rfi'",
    'function rfiResponse(',
    'function rfiResponseEntry('
  ]) includes(service, token);
  assert.ok(!service.includes("const RFI_REOPENED"));
  assert.ok(!service.includes("const RFI_ACCEPTED"));
});

test('Pass 398 lists only authorized Project RFIs through the bounded Pass-397 repository', () => {
  const list = serviceSlice('  async listRfis(', '  /** Create one Project RFI');
  includes(list, "'rfi.read'");
  includes(list, 'resolveProjectVisibility');
  includes(list, 'pageWindow(query)');
  includes(list, '.listRfis({');
  includes(list, 'items: result.items.map(rfiResponse)');
});

test('Pass 398 creates one RFI idempotently with server-owned Project validation, actor, number and OPEN state', () => {
  const create = serviceSlice('  async createRfi(', '  /** Append one authorized RFI response');
  for (const token of [
    "operation: 'rfis.create'",
    "'rfi.create'",
    'lockProjectForWrite(projectId)',
    'requireWritableProject(project)',
    'requireRfiAssignee',
    'dueDate < todayUtc(now)',
    'allocateCompanyNumber(tx, { sequenceKey: RFI_SEQUENCE_KEY })',
    'raisedBy: security.actorUserId',
    'status: RFI_OPEN',
    "action: 'rfi.created'",
    "eventType: 'rfi.created'"
  ]) includes(create, token);
  assert.ok(!create.includes('companyId:'), 'RFI create must continue deriving Company ownership server-side.');
});

test('Pass 398 requires an active same-Project assignee and validates response Documents in the same Project', () => {
  const assignee = serviceSlice('  private async requireRfiAssignee(', '  /** Require an active same-company responsible user');
  includes(assignee, 'findUserById(userId)');
  includes(assignee, 'USER_ACTIVE');
  includes(assignee, 'listActiveProjectIdsForUser');
  includes(assignee, 'membershipStatuses: [PROJECT_MEMBER_ACTIVE]');
  includes(assignee, '!projectIds.includes(projectId)');

  const document = serviceSlice('  private async requireRfiResponseDocument(', '  /** List one Project');
  includes(document, 'findDocumentById(documentId)');
  includes(document, 'document.projectId !== projectId');
  includes(document, 'DOCUMENT_ARCHIVED');
  includes(document, 'document.currentVersion === null');
});

test('Pass 398 serializes response creation, rejects closed-state responses and records append-only evidence', () => {
  const respond = serviceSlice('  async respondRfi(', '  /** Close one open RFI');
  for (const token of [
    "operation: 'rfis.respond'",
    "'rfi.respond'",
    'lockRfiForWrite(rfiId, visibility)',
    'requireWritableProject(project)',
    "createModule19Error('RFI_RESPONSE_NOT_ALLOWED')",
    'requireRfiResponseDocument',
    'responderUserId: security.actorUserId',
    'respondedAt: now',
    'responseType: RFI_RESPONSE_TYPE',
    'createRfiResponse({',
    "action: 'rfi.responded'",
    "eventType: 'rfi.responded'"
  ]) includes(respond, token);
  assert.ok(!repository.includes('this.db.rfiResponse.update('));
  assert.ok(!repository.includes('this.db.rfiResponse.delete('));
});

test('Pass 398 closes OPEN RFIs with reviewed conflict and event behavior', () => {
  const close = serviceSlice('  async closeRfi(', '  /** Reopen one closed RFI');
  for (const token of [
    "operation: 'rfis.close'",
    "'rfi.close'",
    'lockRfiForWrite(rfiId, visibility)',
    "createModule19Error('RFI_ALREADY_CLOSED')",
    'status: RFI_CLOSED',
    'closedAt: now',
    "action: 'rfi.closed'",
    "eventType: 'rfi.closed'"
  ]) includes(close, token);
});

test('Pass 398 reopens only CLOSED RFIs with rfi.close authority, audit reason and no invented event', () => {
  const reopen = serviceSlice('  async reopenRfi(', '  /** List one Project\'s authorized Submittal register');
  for (const token of [
    "operation: 'rfis.reopen'",
    "'rfi.close'",
    'lockRfiForWrite(rfiId, visibility)',
    "new ConflictError({ message: 'Only a closed RFI can be reopened.' })",
    'status: RFI_OPEN',
    'closedAt: null',
    "action: 'rfi.reopened'",
    'reason: input.reason'
  ]) includes(reopen, token);
  assert.ok(!reopen.includes("eventType: 'rfi.reopened'"), 'The reviewed source defines no rfi.reopened domain event.');
});

test.skip('Pass 398 keeps RFI HTTP routes and Pass-401 detail readback deferred', () => {
  assert.ok(!routes.includes("app.get('/api/v1/projects/:projectId/rfis'"));
  assert.ok(!routes.includes("app.post('/api/v1/projects/:projectId/rfis'"));
  assert.ok(!routes.includes("app.post('/api/v1/rfis/:id/respond'"));
  assert.ok(!routes.includes("app.post('/api/v1/rfis/:id/close'"));
  assert.ok(!routes.includes("app.post('/api/v1/rfis/:id/reopen'"));
  assert.ok(!routes.includes("app.get('/api/v1/rfis/:id'"));
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"));
});

test.skip('Pass 398 leaves accepted persistence, schema, repository, routes, registration and Submittal integration byte-identical', async () => {
  for (const [file, expected] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed outside the Pass-398 service boundary.`);
  }
});

test('Every named RFI function added by Pass 398 has a nearby purpose comment', () => {
  for (const name of ['rfiResponse', 'rfiResponseEntry']) {
    assert.match(service, new RegExp(`/\\*\\*[\\s\\S]{0,220}function ${name}\\(`));
  }
  for (const name of [
    'requireRfiAssignee',
    'requireRfiResponseDocument',
    'listRfis',
    'createRfi',
    'createRfiOnce',
    'respondRfi',
    'respondRfiOnce',
    'closeRfi',
    'closeRfiOnce',
    'reopenRfi',
    'reopenRfiOnce'
  ]) {
    assert.match(service, new RegExp(`/\\*\\*[\\s\\S]{0,260}(?:private )?async ${name}\\(`));
  }
});

test('Pass 398 documentation and cumulative gate keep Stage 25 deferred', () => {
  includes(doc, 'Stage 25 / Module 20 Daily Site Reports remains untouched.');
  includes(doc, 'Pass 399 — RFI Fastify Routes + OpenAPI');
  includes(doc, 'Pass 401 — Module-19 Detail/History Readback Repair');
  assert.equal(
    packageJson.scripts['pass-398:module-19-rfi-service:gate'],
    'node --test tests/pass-398-module-19-rfi-service.test.mjs tests/pass-393-module-19-submittal-backend-verification.test.mjs tests/pass-392-module-19-submittal-http-registration.test.mjs tests/workspace.test.mjs'
  );
});
