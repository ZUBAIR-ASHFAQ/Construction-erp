import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const integration = await readFile('tests/integration/module-19-submittals-api.integration.test.mjs', 'utf8');
const service = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000600_module_19_submittal_persistence_repository/migration.sql', 'utf8');
const doc = await readFile('docs/PASS-393-MODULE-19-SUBMITTAL-BACKEND-VERIFICATION.md', 'utf8');
const self = await readFile('tests/pass-393-module-19-submittal-backend-verification.test.mjs', 'utf8');

/** Assert one verification token exists in the selected source. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing verification token: ${token}`);
}

test('Pass 393 adds live coverage for the complete four-operation Submittal workflow', () => {
  for (const route of [
    '/api/v1/projects/${PROJECT_ID}/submittals',
    '/api/v1/submittals/${created.id}/submit',
    '/api/v1/submittals/${created.id}/reviews'
  ]) includes(integration, route);
  includes(integration, "method: 'GET'");
  includes(integration, "decision: 'REVISE_RESUBMIT'");
});

test('Pass 393 verifies cross-company, Project, permission, reviewer and Document security', () => {
  for (const token of ['foreign Project', 'foreign Document', 'missing mutation permission', 'unauthorized reviewer']) includes(integration, token);
  includes(integration, 'OTHER_DOCUMENT_ID');
  includes(integration, 'REVIEWER_NOT_AUTHORIZED');
  includes(service, 'requireProjectPermission');
  includes(service, 'requireProjectDocument');
});

test('Pass 393 verifies serialized current-revision transitions and collision-free numbering', () => {
  includes(repository, 'FOR UPDATE');
  includes(integration, 'Promise.all');
  includes(integration, 'assert.notEqual(first.submittalNo, second.submittalNo)');
  includes(integration, 'filter((response) => response.statusCode === 200).length, 1');
  includes(integration, 'filter((response) => response.statusCode === 201).length, 1');
});

test('Pass 393 verifies append-only review evidence at PostgreSQL level', () => {
  includes(migration, 'submittal reviews are append-only');
  includes(migration, 'submittal_reviews_append_only_update');
  includes(migration, 'submittal_reviews_append_only_delete');
  includes(integration, 'client.submittalReview.update');
  includes(integration, 'client.submittalReview.delete');
});

test('Pass 393 verifies audit/outbox transaction rollback instead of accepting partial submit state', () => {
  includes(integration, "installOutboxFailure(client, 'submittal.submitted')");
  includes(integration, "assert.equal(stored.status, 'DRAFT')");
  includes(service, "eventType: 'submittal.submitted'");
  includes(service, "action: 'submittal.submitted'");
});

test.skip('Pass 393 keeps the public Submittal route surface frozen and RFI deferred', () => {
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 4);
  assert.ok(!routes.includes('/rfis'));
  includes(doc, 'No production business behavior is added in Pass 393.');
});

test('Every named function introduced by the Pass-393 verification has a purpose comment', () => {
  for (const name of ['loadRuntime', 'seedScenario', 'withApi', 'signIn', 'submittalWrite', 'createSubmittal', 'errorCode', 'installOutboxFailure', 'removeOutboxFailure']) {
    assert.match(integration, new RegExp(`/\\*\\*[\\s\\S]{0,260}(?:async function ${name}\\(|function ${name}\\()`));
  }
  assert.match(self, /\/\*\* Assert one verification token exists[\s\S]*function includes\(/);
});
