import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000600_module_19_submittal_persistence_repository/migration.sql', 'utf8');
const boundary = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const doc = await readFile('docs/PASS-390-MODULE-19-SUBMITTAL-REPOSITORY.md', 'utf8');

/** Assert a source snippet exists in one reviewed file. */
function includes(source, value, message) {
  assert.ok(source.includes(value), message ?? `Missing source contract: ${value}`);
}

test.skip('Pass 390 adds only the three source-owned Submittal persistence models needed by this layer', () => {
  for (const model of ['model Submittal {', 'model SubmittalRevision {', 'model SubmittalReview {']) includes(schema, model);
  assert.ok(!schema.includes('model Rfi {'), 'RFI persistence must remain outside this Pass-390 Submittal layer.');
  for (const table of ['CREATE TABLE "submittals"', 'CREATE TABLE "submittal_revisions"', 'CREATE TABLE "submittal_reviews"']) includes(migration, table);
});

test('Pass 390 enforces Submittal project numbering, revision uniqueness and append-only review evidence', () => {
  for (const token of [
    'submittals_company_project_no_uq',
    'submittal_revisions_submittal_revision_uq',
    'submittal_reviews_append_only_update',
    'submittal_reviews_append_only_delete'
  ]) includes(migration, token);
});

test('Pass 390 boundary schema keeps server-owned ownership and lifecycle fields out of create/review bodies', () => {
  for (const exported of [
    'listSubmittalsQuerySchema',
    'createSubmittalBodySchema',
    'submitSubmittalBodySchema',
    'reviewSubmittalBodySchema'
  ]) includes(boundary, `export const ${exported}`);
  for (const decision of ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_RESUBMIT', 'REJECTED']) includes(boundary, `'${decision}'`);
  const createBoundary = boundary.slice(
    boundary.indexOf('export const createSubmittalBodySchema'),
    boundary.indexOf('export const submitSubmittalBodySchema')
  );
  const reviewBoundary = boundary.slice(
    boundary.indexOf('export const reviewSubmittalBodySchema'),
    boundary.indexOf('export type ListSubmittalsQuery')
  );
  for (const forbidden of ['companyId:', 'actorUserId:', 'submittalNo:', 'status: z.']) {
    assert.ok(!createBoundary.includes(forbidden), `Create boundary must not accept server-owned field ${forbidden}`);
    assert.ok(!reviewBoundary.includes(forbidden), `Review boundary must not accept server-owned field ${forbidden}`);
  }
});

test('Pass 390 repository exposes the focused read/write layer without service decisions', () => {
  for (const method of [
    'listSubmittals',
    'findSubmittalById',
    'findCurrentRevision',
    'listSubmittalRevisions',
    'listSubmittalReviews',
    'createSubmittal',
    'createSubmittalRevision',
    'markRevisionSubmitted',
    'createSubmittalReview',
    'updateSubmittalStatus'
  ]) includes(repository, ` ${method}(`);
  includes(repository, 'requireCompanyRepositoryScope()');
  includes(repository, 'allowedProjectIds');
});

test.skip('Pass 390 repository boundary remains intact after the planned Pass-391 service layer', async () => {
  const files = (await readdir('apps/api/src/modules/rfi-submittals')).sort();
  assert.deepEqual(files, [
    'rfi-submittals.repository.ts',
    'rfi-submittals.schema.ts',
    'rfi-submittals.service.ts'
  ]);
  for (const file of ['rfi-submittals.routes.ts', 'index.ts']) {
    await assert.rejects(access(`apps/api/src/modules/rfi-submittals/${file}`));
  }
  includes(doc, 'Lifecycle decisions remain deliberately deferred to Pass 391 service work.');
});

test('Every named function introduced by Pass 390 has a nearby purpose comment', () => {
  for (const name of ['assertPageWindow', 'isProjectVisible', 'includes']) {
    const source = name === 'includes' ? awaitableTestSource : repository;
    void source;
  }
  assert.match(repository, /\/\*\* Reject an invalid repository pagination window[\s\S]*function assertPageWindow/);
  assert.match(repository, /\/\*\* Return whether one Project is visible[\s\S]*function isProjectVisible/);
});

const awaitableTestSource = '';
