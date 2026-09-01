import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const doc = await readFile('docs/PASS-397-MODULE-19-RFI-REPOSITORY-LAYER.md', 'utf8');
const freeze = await readFile('docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-397-module-19-rfi-repository.test.mjs', 'utf8');

const unchangedProductionFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b076977cf2072c06d89723752fa53459518d1090d7af42113ba10823e82f6efd',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'ce8cb73d8ab8ea3b97b04dd6c7bb88620d0b478373c5197550f6dda208f91488',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': 'e8b95cc88b3020f80b5318b37b12b13b03473521d9a22acd22bd32e202c753a9',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd'
});

/** Assert one required Pass-397 repository token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-397 repository token: ${token}`);
}

/** Return one repository slice between two focused declarations. */
function repositorySlice(startToken, endToken) {
  const start = repository.indexOf(startToken);
  const end = repository.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing repository start token: ${startToken}`);
  assert.ok(end > start, `Missing repository end token: ${endToken}`);
  return repository.slice(start, end);
}

/** Calculate one unchanged production-file hash. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 397 adds only the focused typed RFI repository inputs needed by the service layer', () => {
  for (const name of [
    'ListRfisRepositoryInput',
    'CreateRfiRepositoryInput',
    'CreateRfiResponseRepositoryInput',
    'UpdateRfiLifecycleRepositoryInput'
  ]) includes(repository, `export type ${name}`);

  const createInput = repositorySlice('export type CreateRfiRepositoryInput', 'export type CreateRfiResponseRepositoryInput');
  for (const token of ['projectId:', 'rfiNo:', 'subject:', 'question:', 'discipline:', 'status:', 'raisedBy:', 'assignedTo:', 'dueDate:', 'visibility:']) {
    includes(createInput, token);
  }
  assert.ok(!createInput.includes('companyId:'), 'RFI repository create input must derive Company scope server-side.');
});

test('Pass 397 implements bounded Company/Project-scoped RFI list and find operations', () => {
  for (const method of ['listRfis', 'findRfiById']) includes(repository, ` ${method}(`);
  const list = repositorySlice('  async listRfis(', '  /** Find one Company/Project-scoped RFI');
  includes(list, 'assertPageWindow(input.page)');
  includes(list, 'companyId: scope.companyId');
  includes(list, 'projectId: input.projectId');
  includes(list, "...(input.status ? { status: input.status } : {})");
  includes(list, "orderBy: [{ dueDate: 'asc' }, { rfiNo: 'asc' }, { id: 'asc' }]");
  includes(list, 'this.db.rfi.count({ where })');

  const find = repositorySlice('  async findRfiById(', '  /** Create one server-numbered RFI');
  includes(find, 'where: { id: rfiId, companyId: scope.companyId }');
  includes(find, 'isProjectVisible(rfi.projectId, visibility)');
});

test('Pass 397 creates RFI headers with repository-derived Company and no lifecycle decision', () => {
  const create = repositorySlice('  async createRfi(', '  /** Lock one visible RFI');
  for (const token of [
    'companyId: scope.companyId',
    'projectId: input.projectId',
    'rfiNo: input.rfiNo',
    'subject: input.subject',
    'question: input.question',
    'discipline: input.discipline',
    'status: input.status',
    'raisedBy: input.raisedBy',
    'assignedTo: input.assignedTo',
    'dueDate: input.dueDate',
    'closedAt: null'
  ]) includes(create, token);
  for (const forbidden of ['allocateCompanyNumber', 'recordAudit', 'recordOutboxEvent', "status: 'OPEN'", "status: 'CLOSED'"]) {
    assert.ok(!create.includes(forbidden), `Repository create must not own service decision ${forbidden}.`);
  }
});

test('Pass 397 serializes RFI commands with a Company-scoped row lock and Project visibility check', () => {
  const lock = repositorySlice('  async lockRfiForWrite(', '  /** Append one immutable response');
  includes(lock, 'FROM rfis');
  includes(lock, 'WHERE id = ${rfiId}::uuid');
  includes(lock, 'AND company_id = ${scope.companyId}::uuid');
  includes(lock, 'FOR UPDATE');
  includes(lock, 'isProjectVisible(rfi.projectId, visibility)');
});

test('Pass 397 appends RFI responses and exposes only ordered repository history', () => {
  const create = repositorySlice('  async createRfiResponse(', '  /** List append-only response history');
  includes(create, 'await this.findRfiById(input.rfiId, input.visibility)');
  includes(create, 'this.db.rfiResponse.create({');
  for (const token of ['rfiId:', 'responderUserId:', 'response:', 'respondedAt:', 'responseType:', 'documentId:']) includes(create, token);

  const history = repositorySlice('  async listRfiResponses(', '  /** Persist only the RFI status/closed timestamp');
  includes(history, 'await this.findRfiById(rfiId, visibility)');
  includes(history, 'this.db.rfiResponse.findMany({');
  includes(history, "orderBy: [{ respondedAt: 'asc' }, { id: 'asc' }]");

  assert.ok(!repository.includes('this.db.rfiResponse.update('), 'RFI response history must not expose update persistence.');
  assert.ok(!repository.includes('this.db.rfiResponse.delete('), 'RFI response history must not expose delete persistence.');
  assert.ok(!repository.includes('this.db.rfiResponse.deleteMany('), 'RFI response history must not expose bulk deletion.');
});

test('Pass 397 lifecycle persistence updates only status and closedAt chosen by the service', () => {
  const lifecycle = repositorySlice('  async updateRfiLifecycle(', '  /** List Project-scoped Submittals');
  includes(lifecycle, 'await this.findRfiById(input.rfiId, input.visibility)');
  includes(lifecycle, 'data: { status: input.status, closedAt: input.closedAt }');
  for (const forbidden of ['OPEN', 'CLOSED', 'RFI_ALREADY_CLOSED', 'RFI_RESPONSE_NOT_ALLOWED']) {
    assert.ok(!lifecycle.includes(forbidden), `Repository must not decide lifecycle token ${forbidden}.`);
  }
});

test.skip('Pass 397 does not expose Pass-398 service behavior or Pass-399/401 HTTP work early', () => {
  assert.ok(!service.includes('async listRfis('));
  assert.ok(!service.includes('async createRfi('));
  assert.ok(!routes.includes('/rfis'));
  assert.ok(!routes.includes("app.get('/api/v1/submittals/:id'"));
  includes(freeze, 'No Pass before 401 may silently add the two readback amendments.');
  includes(doc, 'Pass 397 does not register either route');
});

test.skip('Pass 397 preserves accepted Prisma, schema, service, routes and registration byte-identically', async () => {
  for (const [file, expected] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed during repository-only Pass 397.`);
  }
});

test('Pass 397 registers one focused cumulative repository gate', () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(
    scripts['pass-397:module-19-rfi-repository:gate'],
    'node --test tests/pass-397-module-19-rfi-repository.test.mjs tests/pass-393-module-19-submittal-backend-verification.test.mjs tests/pass-392-module-19-submittal-http-registration.test.mjs tests/workspace.test.mjs'
  );
  assert.ok(scripts['pass-396:module-19-rfi-schema:gate']);
});

test('Every named repository operation introduced by Pass 397 has a nearby purpose comment', () => {
  for (const method of [
    ['listRfis', 'List Project-scoped RFIs'],
    ['findRfiById', 'Find one Company/Project-scoped RFI'],
    ['createRfi', 'Create one server-numbered RFI'],
    ['lockRfiForWrite', 'Lock one visible RFI'],
    ['createRfiResponse', 'Append one immutable response'],
    ['listRfiResponses', 'List append-only response history'],
    ['updateRfiLifecycle', 'Persist only the RFI status/closed timestamp']
  ]) {
    const [name, purpose] = method;
    assert.match(repository, new RegExp(`/\\*\\* ${purpose}[\\s\\S]{0,240}async ${name}\\(`));
  }
  assert.match(self, /\/\*\* Assert one required Pass-397 repository token[\s\S]*function includes/);
  assert.match(self, /\/\*\* Return one repository slice[\s\S]*function repositorySlice/);
  assert.match(self, /\/\*\* Calculate one unchanged production-file hash[\s\S]*async function fileHash/);
});
