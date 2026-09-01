import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_4A_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A Stage-6 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-4a-evidence', `stage-6-${mode}.json`);

/** Read genuine Module 3 live acceptance without changing its result. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Create one local gate result using the same shape as command results. */
function localResult(name, status, errorCode = null) {
  const now = new Date().toISOString();
  return {
    name,
    status,
    startedAt: now,
    finishedAt: now,
    code: status === 'passed' ? 0 : 1,
    signal: null,
    ...(errorCode ? { errorCode } : {})
  };
}

/** Validate disposable databases and isolated Module 4A browser execution before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_4A_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_4A_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
  }

  validateTestDatabaseEnvironment(env);

  if (env.MIGRATION_TEST_CONFIRM !== MIGRATION_CONFIRMATION) {
    throw new Error(`Set MIGRATION_TEST_CONFIRM=${MIGRATION_CONFIRMATION}.`);
  }
  if (!env.MIGRATION_TEST_DATABASE_URL) throw new Error('MIGRATION_TEST_DATABASE_URL is required.');

  const migrationUrl = new URL(env.MIGRATION_TEST_DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(migrationUrl.protocol)) {
    throw new Error('MIGRATION_TEST_DATABASE_URL must use PostgreSQL.');
  }

  const migrationDatabase = decodeURIComponent(migrationUrl.pathname.replace(/^\//, '')).toLowerCase();
  if (!/(migration[_-]?test|migrate[_-]?test)/.test(migrationDatabase)) {
    throw new Error('MIGRATION_TEST_DATABASE_URL must point to a visibly disposable migration-test database.');
  }
  if (['postgres', 'template0', 'template1', 'construction_erp'].includes(migrationDatabase)) {
    throw new Error(`Refusing protected migration database: ${migrationDatabase}`);
  }

  if (env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('RUN_FOUNDATION_DB_TESTS=1 is required.');
  if (env.RUN_MODULE_4A_E2E !== '1') throw new Error('RUN_MODULE_4A_E2E=1 is required.');

  for (const flag of ['RUN_MODULE_24A_E2E', 'RUN_MODULE_18_E2E', 'RUN_MODULE_22_E2E', 'RUN_MODULE_2_E2E', 'RUN_MODULE_3_E2E']) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 4A browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;
const results = [];

if (mode === 'live' && !stage5LiveAccepted) {
  results.push(localResult('stage-5-live-prerequisite', 'failed', 'STAGE_5_LIVE_ACCEPTANCE_REQUIRED'));
} else {
  const staticSteps = [
    ['module-3-static-regression', 'npm', ['run', 'module-3:gate']],
    ['module-4a-static-suite', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-4a-integration-test-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['module-4a-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-4a-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']]
  ];

  for (const [name, command, args] of staticSteps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  if (mode === 'live' && results.every((result) => result.status === 'passed')) {
    try {
      await validateLivePrerequisites(process.env);
      results.push(localResult('live-prerequisites', 'passed'));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      results.push(localResult('live-prerequisites', 'failed', 'LIVE_PREREQUISITES_INVALID'));
    }
  }

  if (mode === 'live' && results.every((result) => result.status === 'passed')) {
    const liveEnvironment = {
      ...process.env,
      RUN_FOUNDATION_DB_TESTS: '1',
      RUN_MODULE_24A_E2E: '0',
      RUN_MODULE_18_E2E: '0',
      RUN_MODULE_22_E2E: '0',
      RUN_MODULE_2_E2E: '0',
      RUN_MODULE_3_E2E: '0',
      RUN_MODULE_4A_E2E: '1'
    };

    const liveSteps = [
      ['clean-install', 'npm', ['ci']],
      ['typecheck', 'npm', ['run', 'typecheck']],
      ['lint', 'npm', ['run', 'lint']],
      ['prisma-validate', 'npm', ['run', 'db:validate']],
      ['prisma-generate', 'npm', ['run', 'db:generate']],
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['build', 'npm', ['run', 'build']],
      ['prepare-integration-database', 'npm', ['run', 'test:db:prepare']],
      ['module-4a-backend-security-api-operational-integration', 'npm', ['run', 'test:integration:module-4a']],
      ['module-4a-browser-workflow', 'npm', ['run', 'test:e2e:module-4a']]
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 18 : 7;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-4a-stage-6-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7'
        : (stage5LiveAccepted
            ? 'STAGE_6_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
            : 'STAGE_6_STATIC_GATE_PASSED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  module: '4A - BOQ Commercial Core',
  businessModule: '4 - BOQ Management',
  stage5LiveAccepted,
  activation: passed && mode === 'live'
    ? 'STAGE_6_ACCEPTED'
    : (stage5LiveAccepted
        ? 'LIVE_STAGE_6_GATE_REQUIRED'
        : 'DO_NOT_DEPLOY_STAGE_6_UNTIL_STAGE_5_LIVE_ACCEPTED'),
  ownedTables: ['boqs', 'boq_revisions', 'boq_items'],
  routeCount: 6,
  permissions: ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'],
  deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
  nextStage: passed && mode === 'live'
    ? 'Module 5 - Project Management'
    : (stage5LiveAccepted ? 'Complete the Module 4A live Stage-6 gate' : 'Complete Module 3 live Stage-5 acceptance'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4A Stage-6 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 4A Stage 6 accepted. The next dependency-aware stage is Module 5 Project Management.'
    : 'Module 4A static Stage-6 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
