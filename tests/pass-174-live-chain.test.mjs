import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();

/** Read one UTF-8 repository file used by the Pass-174 contract checks. */
async function read(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

/** Read and parse one repository JSON file. */
async function readJson(relativePath) {
  return JSON.parse(await read(relativePath));
}

test('Pass 174 never clears the Stage-8 repair hold and leaves final acceptance to Pass 175', async () => {
  const runner = await read('scripts/acceptance/verify-pass-174-live-chain.mjs');
  const hold = await readJson('module-24b-evidence/stage-8-repair-hold.json');

  assert.equal(hold.openedByPass, 165);
  assert.ok(['STAGE_8_REPAIR_HOLD_ACTIVE', 'STAGE_8_REPAIR_HOLD_CLEARED'].includes(hold.status));
  assert.match(runner, /repairHoldCleared: false/);
  assert.match(runner, /module6Allowed: false/);
  assert.match(runner, /Pass 175 owns final re-audit, hold release and Stage-8 handoff/);
  assert.doesNotMatch(runner, /\['module-24b-final-stage-8[^\n]*module-24b:gate:live/);
});

test('Pass 174 requires a synchronized lockfile before dependency-backed work', async () => {
  const runner = await read('scripts/acceptance/verify-pass-174-live-chain.mjs');

  assert.match(runner, /package-lock\.json/);
  assert.match(runner, /lockfileVersion/);
  assert.match(runner, /PACKAGE_LOCK_REQUIRED/);
  assert.match(runner, /npm run module-24a:lockfile/);
  assert.match(runner, /\['clean-install', 'npm', \['ci', '--ignore-scripts', '--no-audit', '--no-fund'\]\]/);
});

test('Pass 174 validates protected databases, recovery and authentication prerequisites before live execution', async () => {
  const runner = await read('scripts/acceptance/verify-pass-174-live-chain.mjs');

  for (const required of [
    'DATABASE_URL',
    'MIGRATION_TEST_DATABASE_URL',
    'TEST_DATABASE_URL',
    'RESTORE_DATABASE_URL',
    'STORAGE_ENDPOINT',
    'STORAGE_BUCKET',
    'RESTORE_STORAGE_ENDPOINT',
    'RESTORE_STORAGE_BUCKET',
    'AUTH_ACTION_TOKEN_SECRET'
  ]) {
    assert.match(runner, new RegExp(`requireEnv\\('${required}'\\)`));
  }

  assert.match(runner, /validateTestDatabaseEnvironment/);
  assert.match(runner, /RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE/);
  assert.match(runner, /RESET_CONSTRUCTION_ERP_TEST_DATABASE/);
  assert.match(runner, /RUN_CONSTRUCTION_ERP_RECOVERY_DRILL/);
  assert.match(runner, /RESTORE_CONSTRUCTION_ERP_DATA/);
});

test('Pass 174 runs dependency-backed quality and Stage 0 through Stage 7 acceptance in order', async () => {
  const runner = await read('scripts/acceptance/verify-pass-174-live-chain.mjs');
  const expected = [
    "['typecheck', 'npm', ['run', 'typecheck']]",
    "['lint', 'npm', ['run', 'lint']]",
    "['prisma-validate', 'npm', ['run', 'db:validate']]",
    "['prisma-generate', 'npm', ['run', 'db:generate']]",
    "['full-build', 'npm', ['run', 'build']]",
    "['clean-and-previous-schema-migrations', 'npm', ['run', 'db:migrations:verify']]",
    "['stages-0-3-live-acceptance', 'npm', ['run', 'stages-0-3:acceptance:live']]",
    "['module-2-live-acceptance', 'npm', ['run', 'module-2:acceptance:live']]",
    "['module-3-live-acceptance', 'npm', ['run', 'module-3:acceptance:live']]",
    "['module-4a-live-acceptance', 'npm', ['run', 'module-4a:acceptance:live']]",
    "['module-5-live-acceptance', 'npm', ['run', 'module-5:acceptance:live']]"
  ];

  let last = -1;
  for (const text of expected) {
    const index = runner.indexOf(text);
    assert.ok(index > last, `${text} must appear after the previous live step.`);
    last = index;
  }
});

test('Pass 174 covers Module 24B runtime and repaired Module 18 Project workflows', async () => {
  const runner = await read('scripts/acceptance/verify-pass-174-live-chain.mjs');

  for (const script of [
    'module-24b:integration:gate:live',
    'module-24b:security:gate:live',
    'module-24b:api-contract:gate:live',
    'module-24b:playwright:gate:live',
    'module-24b:operations:gate:live',
    'module-24b:readback:gate:live',
    'module-24b:react-readback:gate:live',
    'module-18:project-persistence:gate:live',
    'module-18:project-security:gate:live',
    'module-18:project-completion:gate:live'
  ]) {
    assert.match(runner, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(runner, /RUN_MODULE_24B_E2E = '1'/);
  assert.match(runner, /RUN_MODULE_18_E2E = '1'/);
});

test('Pass 174 package scripts expose static preparation and guarded live execution', async () => {
  const rootPackage = await readJson('package.json');

  assert.equal(rootPackage.scripts['audit-repair:live-chain:gate'], 'node scripts/acceptance/verify-pass-174-live-chain.mjs --mode=static');
  assert.equal(rootPackage.scripts['audit-repair:live-chain:gate:live'], 'node scripts/acceptance/verify-pass-174-live-chain.mjs --mode=live');
});
