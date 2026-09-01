import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const boundary = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const freeze = await readFile('docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md', 'utf8');
const doc = await readFile('docs/PASS-396-MODULE-19-RFI-ZOD-BOUNDARY-SCHEMAS.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-396-module-19-rfi-schema.test.mjs', 'utf8');

const unchangedProductionFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'b639ee9bd321de8d8f6012b38096851fae744ec14ba158f0451066cc0aaade6c',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'ce8cb73d8ab8ea3b97b04dd6c7bb88620d0b478373c5197550f6dda208f91488',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': 'e8b95cc88b3020f80b5318b37b12b13b03473521d9a22acd22bd32e202c753a9',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd'
});

/** Assert one required Pass-396 contract token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-396 contract token: ${token}`);
}

/** Return one source slice between two exported boundary declarations. */
function boundarySlice(startToken, endToken) {
  const start = boundary.indexOf(startToken);
  const end = boundary.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing boundary start token: ${startToken}`);
  assert.ok(end > start, `Missing boundary end token: ${endToken}`);
  return boundary.slice(start, end);
}

/** Calculate one regression hash without changing the reviewed file. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 396 freezes only the minimum OPEN/CLOSED RFI lifecycle vocabulary', () => {
  const statusBlock = boundarySlice('export const MODULE_19_RFI_STATUSES', 'const uuidSchema');
  for (const status of ["'OPEN'", "'CLOSED'"]) includes(statusBlock, status);
  for (const forbidden of ['ACCEPTED', 'REJECTED', 'ESCALATED', 'ARCHIVED', 'PENDING_RESPONSE']) {
    assert.ok(!statusBlock.includes(forbidden), `RFI schema must not invent lifecycle status ${forbidden}.`);
  }
});

test('Pass 396 adds strict list/create/respond/close/reopen RFI request boundaries', () => {
  for (const exported of [
    'module19RfiParamsSchema',
    'listRfisQuerySchema',
    'createRfiBodySchema',
    'respondRfiBodySchema',
    'closeRfiBodySchema',
    'reopenRfiBodySchema'
  ]) includes(boundary, `export const ${exported}`);

  const create = boundarySlice('export const createRfiBodySchema', 'export const respondRfiBodySchema');
  for (const token of ['subject:', 'question:', 'discipline:', 'assignedTo:', 'dueDate:']) includes(create, token);
  for (const forbidden of ['companyId:', 'projectId:', 'rfiNo:', 'raisedBy:', 'status:', 'closedAt:', 'actorUserId:']) {
    assert.ok(!create.includes(forbidden), `Create RFI body must not accept server-owned field ${forbidden}`);
  }

  const respond = boundarySlice('export const respondRfiBodySchema', 'export const closeRfiBodySchema');
  includes(respond, 'response: longTextSchema');
  includes(respond, 'documentId: uuidSchema.nullable().optional()');
  for (const forbidden of ['responderUserId:', 'respondedAt:', 'responseType:', 'status:']) {
    assert.ok(!respond.includes(forbidden), `Respond RFI body must not accept server-owned field ${forbidden}`);
  }

  const reopen = boundarySlice('export const reopenRfiBodySchema', 'export type ListRfisQuery');
  includes(reopen, 'reason:');
  for (const forbidden of ['status:', 'closedAt:', 'actorUserId:', 'eventType:']) {
    assert.ok(!reopen.includes(forbidden), `Reopen RFI body must not accept server-owned field ${forbidden}`);
  }

  includes(boundary, 'z.object({}).strict().default({})');
});

test('Pass 396 keeps RFI pagination bounded and Project ownership outside the list query', () => {
  const query = boundarySlice('export const listRfisQuerySchema', 'export const createRfiBodySchema');
  includes(query, 'page: z.coerce.number().int().min(1).optional()');
  includes(query, 'pageSize: z.coerce.number().int().min(1).max(MODULE_19_MAX_PAGE_SIZE).optional()');
  includes(query, 'status: z.enum(MODULE_19_RFI_STATUSES).optional()');
  for (const forbidden of ['projectId:', 'companyId:', 'assignedTo:', 'raisedBy:']) {
    assert.ok(!query.includes(forbidden), `RFI list query must not accept ownership field ${forbidden}`);
  }
});

test('Pass 396 freezes browser-safe RFI header and append-only response output shapes', () => {
  for (const exported of [
    'rfiResponseSchema',
    'rfiResponseEntrySchema',
    'listRfisResponseSchema',
    'createRfiResponseSchema',
    'respondRfiResponseSchema',
    'rfiLifecycleResponseSchema'
  ]) includes(boundary, `export const ${exported}`);

  const header = boundarySlice('export const rfiResponseSchema', 'export const rfiResponseEntrySchema');
  for (const token of ['id:', 'projectId:', 'rfiNo:', 'subject:', 'question:', 'discipline:', 'status:', 'raisedBy:', 'assignedTo:', 'dueDate:', 'closedAt:']) {
    includes(header, token);
  }
  assert.ok(!header.includes('companyId:'), 'Browser-safe RFI header must not expose Company ownership authority.');

  const response = boundarySlice('export const rfiResponseEntrySchema', 'export const listRfisResponseSchema');
  for (const token of ['rfiId:', 'responderUserId:', 'response:', 'respondedAt:', 'responseType:', 'documentId:']) includes(response, token);
});

test.skip('Pass 396 does not implement the Pass-401 RFI detail-thread amendment early', () => {
  assert.ok(!boundary.includes('rfiDetailResponseSchema'));
  assert.ok(!boundary.includes('responses: z.array(rfiResponseEntrySchema)'));
  includes(freeze, 'No Pass before 401 may silently add the two readback amendments.');
  includes(doc, 'Pass 396 does not add a `responses[]` detail payload.');
});

test.skip('Pass 396 preserves accepted RFI persistence and Submittal repository/service/routes/index byte-identically', async () => {
  for (const [file, expected] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed during schema-only Pass 396.`);
  }
});

test.skip('Pass 396 keeps the public Module-19 route surface at the accepted four Submittal routes', async () => {
  const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 4);
  assert.ok(!routes.includes('/rfis'), 'RFI HTTP registration belongs to Pass 399.');
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"), 'Detail/history readback belongs to Pass 401.');
});

test('Pass 396 adds no permission, stable error or event token', () => {
  const expectedPermissions = ['rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close', 'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'];
  const expectedErrors = ['RFI_NOT_FOUND', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED', 'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'];
  const expectedEvents = ['rfi.created', 'rfi.responded', 'rfi.closed', 'submittal.submitted', 'submittal.reviewed'];
  for (const token of [...expectedPermissions, ...expectedErrors, ...expectedEvents]) includes(boundary, `'${token}'`);
  includes(doc, 'Stage 25 / Module 20 remains untouched.');
});

test('Pass 396 registers one focused schema gate', () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(
    scripts['pass-396:module-19-rfi-schema:gate'],
    'node --test tests/pass-396-module-19-rfi-schema.test.mjs tests/pass-393-module-19-submittal-backend-verification.test.mjs tests/pass-392-module-19-submittal-http-registration.test.mjs tests/workspace.test.mjs'
  );
});

test('Every named function introduced by Pass 396 verification has a purpose comment', () => {
  assert.match(self, /\/\*\* Assert one required Pass-396 contract token[\s\S]*function includes/);
  assert.match(self, /\/\*\* Return one source slice[\s\S]*function boundarySlice/);
  assert.match(self, /\/\*\* Calculate one regression hash[\s\S]*async function fileHash/);
});
