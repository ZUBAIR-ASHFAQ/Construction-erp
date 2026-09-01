import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const doc = await readFile('docs/PASS-391-MODULE-19-SUBMITTAL-SERVICE.md', 'utf8');

/** Assert one reviewed source token exists. */
function includes(source, value, message) {
  assert.ok(source.includes(value), message ?? `Missing source contract: ${value}`);
}

test.skip('Pass 391 adds the Submittal service without pulling routes or registration forward', async () => {
  const files = (await readdir('apps/api/src/modules/rfi-submittals')).sort();
  assert.deepEqual(files, [
    'rfi-submittals.repository.ts',
    'rfi-submittals.schema.ts',
    'rfi-submittals.service.ts'
  ]);
  await assert.rejects(access('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts'));
  await assert.rejects(access('apps/api/src/modules/rfi-submittals/index.ts'));
});

test('Pass 391 freezes the reviewed Module-19 permissions, errors and events for service enforcement', () => {
  for (const permission of [
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(schema, `'${permission}'`);
  for (const code of [
    'SUBMITTAL_NOT_FOUND', 'SUBMITTAL_REVISION_NOT_SUBMITTED', 'REVIEWER_NOT_AUTHORIZED'
  ]) includes(schema, `'${code}'`);
  for (const event of ['submittal.submitted', 'submittal.reviewed']) includes(schema, `'${event}'`);
});

test('Pass 391 service validates Project, responsible user, due date and same-Project versioned Document', () => {
  includes(service, 'requireResponsibleProjectUser');
  includes(service, 'listActiveProjectIdsForUser');
  includes(service, 'dueDate < todayUtc(now)');
  includes(service, 'requireProjectDocument');
  includes(service, 'document.projectId !== projectId');
  includes(service, 'document.currentVersion === null');
});

test('Pass 391 creates Submittal and first revision atomically with server authority', () => {
  includes(service, "operation: 'submittals.create'");
  includes(service, 'allocateCompanyNumber');
  includes(service, 'status: SUBMITTAL_DRAFT');
  includes(service, 'revisionNo: 1');
  includes(service, "action: 'submittal.created'");
  assert.ok(!service.includes("eventType: 'submittal.created'"), 'Source event vocabulary does not define submittal.created.');
});

test('Pass 391 serializes current-revision submission and records audit/outbox atomically', () => {
  includes(repository, 'lockSubmittalForWrite');
  includes(repository, 'FOR UPDATE');
  includes(service, "operation: 'submittals.submit'");
  includes(service, "'submittals.submit'");
  includes(service, 'markRevisionSubmitted');
  includes(service, "eventType: 'submittal.submitted'");
  includes(service, "action: 'submittal.submitted'");
});

test('Pass 391 review accepts only current submitted revision and preserves revision history', () => {
  includes(service, "operation: 'submittals.review'");
  includes(service, "'submittals.review'");
  includes(service, "createModule19Error('SUBMITTAL_REVISION_NOT_SUBMITTED')");
  includes(service, 'createSubmittalReview');
  includes(repository, 'updateSubmittalRevisionStatus');
  includes(service, "eventType: 'submittal.reviewed'");
  includes(service, "input.decision === SUBMITTAL_REVISE_RESUBMIT");
  includes(service, 'revisionNo: revision.revisionNo + 1');
  includes(service, 'status: SUBMITTAL_DRAFT');
});

test('Pass 391 keeps review evidence append-only and does not add a migration', async () => {
  const migrations = await readdir('packages/database/prisma/migrations');
  assert.ok(migrations.includes('20260827000600_module_19_submittal_persistence_repository'));
  assert.ok(!migrations.some((name) => name.includes('pass_391') || name.includes('module_19_submittal_service')));
  includes(doc, 'No new database table or migration is required by Pass 391.');
});

test('Every named function added by Pass 391 has a nearby purpose comment', () => {
  for (const name of [
    'hasStatus', 'inputDate', 'dateOnly', 'todayUtc', 'pageWindow', 'requireWritableProject',
    'submittalResponse', 'revisionResponse', 'reviewResponse'
  ]) {
    assert.match(service, new RegExp(`/\\*\\*[\\s\\S]{0,220}function ${name}\\(`));
  }
  for (const name of ['lockSubmittalForWrite', 'updateSubmittalRevisionStatus']) {
    assert.match(repository, new RegExp(`/\\*\\*[\\s\\S]{0,220}async ${name}\\(`));
  }
});
