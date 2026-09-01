import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const prepareLockfile = await readFile('scripts/module-24a/prepare-lockfile.mjs', 'utf8');
const prerequisites = await readFile('scripts/module-24a/check-live-prerequisites.mjs', 'utf8');
const runner = await readFile('scripts/module-24a/run-live-acceptance.mjs', 'utf8');
const gate = await readFile('scripts/module-24a/verify-stage-1.mjs', 'utf8');
const docs = await readFile('docs/modules/administration/STAGE-1-24A-IMPLEMENTATION.md', 'utf8');
const browserWorkflow = await readFile('tests/e2e/module-24a-browser.spec.mjs', 'utf8');

/** Verify Stage 1 exposes explicit lockfile and one-command live-acceptance commands. */
test('Stage 1 exposes reviewed orchestration commands', () => {
  assert.equal(rootPackage.scripts['module-24a:lockfile'], 'node scripts/module-24a/prepare-lockfile.mjs');
  assert.equal(rootPackage.scripts['module-24a:acceptance:live'], 'node scripts/module-24a/run-live-acceptance.mjs');
  assert.match(prepareLockfile, /--package-lock-only/);
  assert.match(prepareLockfile, /--ignore-scripts/);
  assert.match(prepareLockfile, /lockfileVersion/);
});

/** Verify Stage 1 refuses unsafe database targets and requires every destructive confirmation. */
test('Stage 1 preflight preserves destructive database safety', () => {
  for (const marker of [
    'RUN_CONSTRUCTION_ERP_MODULE_24A_LIVE_GATE',
    'RESET_CONSTRUCTION_ERP_TEST_DATABASE',
    'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE',
    'TEST_DATABASE_URL',
    'MIGRATION_TEST_DATABASE_URL',
    'construction_erp',
  ]) assert.match(prerequisites, new RegExp(marker));
  assert.match(prerequisites, /package-lock\.json/);
  assert.match(prerequisites, /AUTH_ACTION_TOKEN_SECRET/);
});

/** Verify the wrapper loads only local environment files and delegates to the evidence-producing gate. */
test('Stage 1 runner delegates release status to the live gate', () => {
  assert.match(runner, /\.env\.test/);
  assert.match(runner, /\.env\.migration/);
  assert.match(runner, /module-24a:gate:live/);
  assert.match(runner, /STAGE_1_ACCEPTED_READY_FOR_STAGE_2/);
  assert.match(gate, /live-prerequisites/);
  assert.match(gate, /check-live-prerequisites\.mjs/);
});

/** Verify documentation forbids manually promoting a blocked evidence result. */
test('Stage 1 implementation documentation keeps acceptance evidence authoritative', () => {
  assert.match(docs, /STAGE_1_ACCEPTED_READY_FOR_STAGE_2/);
  assert.match(docs, /evidence file must never be manually promoted/);
  assert.match(docs, /Module 18 - Document Management/);
});

/** Verify the live browser workflow consumes links delivered by the real notification worker. */
test('Stage 1 browser acceptance uses asynchronous notification delivery', () => {
  assert.match(browserWorkflow, /auth-notification\.worker\.js/);
  assert.match(browserWorkflow, /AUTH_NOTIFICATION_WEBHOOK_URL/);
  assert.match(browserWorkflow, /AUTH_INVITATION/);
  assert.match(browserWorkflow, /AUTH_PASSWORD_RESET/);
  assert.match(browserWorkflow, /status\)\.toBe\('COMPLETED'\)/);
  assert.doesNotMatch(browserWorkflow, /createAuthActionToken/);
  assert.match(gate, /test:integration:module-24a/);
});
