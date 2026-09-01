import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const ACCEPTED_STAGE_4 = 'STAGE_4_ACCEPTED_READY_FOR_STAGE_5';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_3_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 3 Stage-5 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-3-evidence', `stage-5-${mode}.json`);

/** Read prerequisite Module 2 live evidence without changing its result. */
async function readStage4LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-2-evidence/stage-4-live.json', 'utf8'));
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

/** Validate disposable databases and isolated Module 3 browser execution before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_3_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_3_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_3_E2E !== '1') throw new Error('RUN_MODULE_3_E2E=1 is required.');
  if (env.RUN_MODULE_24A_E2E === '1') throw new Error('RUN_MODULE_24A_E2E must not be enabled during the Module 3 browser gate.');
  if (env.RUN_MODULE_18_E2E === '1') throw new Error('RUN_MODULE_18_E2E must not be enabled during the Module 3 browser gate.');
  if (env.RUN_MODULE_22_E2E === '1') throw new Error('RUN_MODULE_22_E2E must not be enabled during the Module 3 browser gate.');
  if (env.RUN_MODULE_2_E2E === '1') throw new Error('RUN_MODULE_2_E2E must not be enabled during the Module 3 browser gate.');
  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage4 = await readStage4LiveAcceptance();
const stage4LiveAccepted = stage4?.status === ACCEPTED_STAGE_4;
const results = [];

if (mode === 'live' && !stage4LiveAccepted) {
  results.push(localResult('stage-4-live-prerequisite', 'failed', 'STAGE_4_LIVE_ACCEPTANCE_REQUIRED'));
} else {
  const staticSteps = [
    ['module-2-static-regression', 'npm', ['run', 'module-2:gate']],
    ['module-3-static-suite', 'node', ['--test', 'tests/module-3-static.test.mjs']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-3-integration-test-syntax', 'node', ['--check', 'tests/integration/module-3-api.integration.test.mjs']],
    ['module-3-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-3-browser.spec.mjs']],
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
      RUN_MODULE_3_E2E: '1'
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
      ['module-3-backend-security-operational-integration', 'npm', ['run', 'test:integration:module-3']],
      ['module-3-browser-workflow', 'npm', ['run', 'test:e2e:module-3']]
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
  kind: `construction-erp-module-3-stage-5-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6'
        : (stage4LiveAccepted
            ? 'STAGE_5_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
            : 'STAGE_5_STATIC_GATE_PASSED_STAGE_4_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  module: '3 - Tendering & Estimation',
  stage4LiveAccepted,
  activation: passed && mode === 'live'
    ? 'STAGE_5_ACCEPTED'
    : (stage4LiveAccepted
        ? 'LIVE_STAGE_5_GATE_REQUIRED'
        : 'DO_NOT_DEPLOY_STAGE_5_UNTIL_STAGE_4_LIVE_ACCEPTED'),
  ownedTables: ['tenders', 'estimate_versions', 'estimate_items', 'tender_submissions'],
  projectScope: 'deferred-until-project-management-and-module-24b',
  deferredRelationships: ['boq-project-mapping', 'project-award-conversion', 'budget-baseline', 'reports-dashboard'],
  nextStage: passed && mode === 'live'
    ? 'Module 4A - BOQ Commercial Core'
    : (stage4LiveAccepted ? 'Complete the Module 3 live Stage-5 gate' : 'Complete Module 2 live Stage-4 acceptance'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 3 Stage-5 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 3 Stage 5 accepted. The next dependency-aware stage is Module 4A BOQ Commercial Core.'
    : 'Module 3 static Stage-5 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
