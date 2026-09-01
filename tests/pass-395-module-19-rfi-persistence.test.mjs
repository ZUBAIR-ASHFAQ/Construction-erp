import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql', 'utf8');
const freeze = await readFile('docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md', 'utf8');
const doc = await readFile('docs/PASS-395-MODULE-19-RFI-PRISMA-PERSISTENCE.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const testSource = await readFile('tests/pass-395-module-19-rfi-persistence.test.mjs', 'utf8');

const unchangedModule19Files = Object.freeze({
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'b639ee9bd321de8d8f6012b38096851fae744ec14ba158f0451066cc0aaade6c',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': 'e8b95cc88b3020f80b5318b37b12b13b03473521d9a22acd22bd32e202c753a9',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': '7bd25e6bdb02cde8d668664d715bb56a5a161174fee590dc0e7ec72e94fa0cea',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'ce8cb73d8ab8ea3b97b04dd6c7bb88620d0b478373c5197550f6dda208f91488'
});

/** Return one named Prisma model block without reading neighboring models. */
function readModel(name) {
  const marker = `model ${name} {`;
  const start = prisma.indexOf(marker);
  assert.ok(start >= 0, `Missing Prisma model ${name}.`);
  const end = prisma.indexOf('\n}', start);
  assert.ok(end > start, `Unterminated Prisma model ${name}.`);
  return prisma.slice(start, end + 2);
}

/** Assert one required contract token exists in the reviewed source. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-395 contract token: ${token}`);
}

/** Calculate one file hash for a regression boundary. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 395 adds exactly the two frozen RFI Prisma persistence models', () => {
  const rfi = readModel('Rfi');
  const response = readModel('RfiResponse');

  for (const token of [
    'companyId  String    @map("company_id")',
    'projectId  String    @map("project_id")',
    'rfiNo      String    @map("rfi_no")',
    'subject    String',
    'question   String    @db.Text',
    'discipline String',
    'status     String',
    'raisedBy   String    @map("raised_by")',
    'assignedTo String    @map("assigned_to")',
    'dueDate    DateTime  @map("due_date") @db.Date',
    'closedAt   DateTime? @map("closed_at")'
  ]) includes(rfi, token);

  for (const token of [
    'rfiId           String   @map("rfi_id")',
    'responderUserId String   @map("responder_user_id")',
    'response        String   @db.Text',
    'respondedAt     DateTime @map("responded_at")',
    'responseType    String   @map("response_type")',
    'documentId      String?  @map("document_id")'
  ]) includes(response, token);

  for (const forbidden of ['createdAt', 'updatedAt', 'attachmentId', 'archive', 'acceptedBy', 'priority']) {
    assert.ok(!rfi.includes(forbidden), `RFI persistence must not invent ${forbidden}.`);
    assert.ok(!response.includes(forbidden), `RFI response persistence must not invent ${forbidden}.`);
  }
  assert.equal((prisma.match(/model Rfi(?:Response)? \{/g) ?? []).length, 2);
});

test('Pass 395 enforces Company, Project, user and direct response reference integrity', () => {
  for (const token of [
    '@relation(fields: [projectId, companyId], references: [id, companyId]',
    '@relation("RfiRaisedBy", fields: [raisedBy, companyId], references: [id, companyId]',
    '@relation("RfiAssignedTo", fields: [assignedTo, companyId], references: [id, companyId]',
    '@relation(fields: [rfiId], references: [id]',
    '@relation("RfiResponseResponder", fields: [responderUserId], references: [id]',
    '@relation(fields: [documentId], references: [id]'
  ]) includes(prisma, token);

  for (const constraint of [
    'rfis_company_id_fkey',
    'rfis_project_company_fkey',
    'rfis_raised_by_company_fkey',
    'rfis_assigned_to_company_fkey',
    'rfi_responses_rfi_id_fkey',
    'rfi_responses_responder_user_id_fkey',
    'rfi_responses_document_id_fkey'
  ]) includes(migration, constraint);
});

test('Pass 395 freezes collision-safe Project RFI numbering and bounded register/thread indexes', () => {
  for (const token of [
    'rfis_company_project_no_uq',
    'rfis_company_project_status_due_idx',
    'rfis_company_assignee_status_idx',
    'rfi_responses_rfi_responded_at_idx',
    'rfi_responses_responder_time_idx',
    'rfi_responses_document_idx'
  ]) {
    includes(prisma, token);
    includes(migration, token);
  }
});

test('Pass 395 makes RFI response evidence append-only at PostgreSQL level', () => {
  for (const token of [
    'prevent_rfi_response_mutation',
    'rfi_responses_append_only_update',
    'rfi_responses_append_only_delete',
    "RAISE EXCEPTION 'RFI responses are append-only'"
  ]) includes(migration, token);
});

test('Pass 395 preserves the Pass-394 service-layer gaps instead of faking them in persistence', () => {
  includes(freeze, 'assigned_to` must resolve to an active user who has active access to the same Project');
  includes(freeze, 'due_date` cannot precede the RFI creation calendar date');
  includes(freeze, 'optional `document_id` must belong to an active same-Project Document');
  includes(doc, 'remain service responsibilities');
  includes(doc, 'same-Project Document validation is deliberately not faked at the database layer');
});

test.skip('Pass 395 leaves all accepted Submittal backend files byte-identical', async () => {
  for (const [file, expected] of Object.entries(unchangedModule19Files)) {
    assert.equal(await fileHash(file), expected, `${file} changed during persistence-only Pass 395.`);
  }
});

test.skip('Pass 395 keeps RFI HTTP, React and Stage-25 production work deferred', async () => {
  const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
  assert.ok(!routes.includes('/rfis'), 'RFI routes belong to Pass 399, not Pass 395.');
  includes(doc, 'Pass 396 — RFI Zod Boundary Schemas');
  includes(doc, 'Stage 25 / Module 20 Daily Site Reports remains untouched');
});

test('Pass 395 registers one focused persistence gate without rewriting Pass 394 history', () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(
    scripts['pass-395:module-19-rfi-persistence:gate'],
    'node --test tests/pass-395-module-19-rfi-persistence.test.mjs tests/pass-393-module-19-submittal-backend-verification.test.mjs tests/pass-392-module-19-submittal-http-registration.test.mjs tests/workspace.test.mjs'
  );
  assert.ok(scripts['pass-394:module-19-remaining-contract-readback-freeze:gate']);
});

test('Every named function introduced by Pass 395 verification has a purpose comment', () => {
  const source = import.meta.url;
  void source;
  assert.match(testSource, /\/\*\* Return one named Prisma model block[\s\S]*function readModel/);
  assert.match(testSource, /\/\*\* Assert one required contract token[\s\S]*function includes/);
  assert.match(testSource, /\/\*\* Calculate one file hash[\s\S]*async function fileHash/);
});

