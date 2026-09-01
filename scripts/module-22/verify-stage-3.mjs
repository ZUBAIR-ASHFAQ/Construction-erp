import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const ACCEPTED_STAGE_2 = 'STAGE_2_ACCEPTED_READY_FOR_STAGE_3';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_22_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 22 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-22-evidence', `stage-3-${mode}.json`);

/** Read prerequisite Stage 2 live evidence without changing its result. */
async function readStage2LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-18-evidence/stage-2-live.json', 'utf8'));
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

/** Validate only explicitly disposable databases and the Module 22 browser mode. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_22_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_22_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_24A_AUDIT_GUARD !== '1') throw new Error('RUN_MODULE_24A_AUDIT_GUARD=1 is required.');
  if (env.RUN_MODULE_22_E2E !== '1') throw new Error('RUN_MODULE_22_E2E=1 is required.');
  if (env.RUN_MODULE_24A_E2E === '1') throw new Error('RUN_MODULE_24A_E2E must not be enabled during the Module 22 browser gate.');
  if (env.RUN_MODULE_18_E2E === '1') throw new Error('RUN_MODULE_18_E2E must not be enabled during the Module 22 browser gate.');
  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage2 = await readStage2LiveAcceptance();
const stage2LiveAccepted = stage2?.status === ACCEPTED_STAGE_2;
const results = [];

if (mode === 'live' && !stage2LiveAccepted) {
  results.push(localResult('stage-2-live-prerequisite', 'failed', 'STAGE_2_LIVE_ACCEPTANCE_REQUIRED'));
} else {
  const staticSteps = [
    ['module-22-static-suite', 'npm', ['run', 'test:static']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-24a-static-regression', 'npm', ['run', 'module-24a:gate']],
    ['module-18-static-regression', 'npm', ['run', 'module-18:gate']],
    ['module-22-integration-test-syntax', 'node', ['--check', 'tests/integration/module-22-api.integration.test.mjs']],
    ['module-22-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-22-browser.spec.mjs']],
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
      RUN_MODULE_24A_AUDIT_GUARD: '1',
      RUN_MODULE_24A_E2E: '0',
      RUN_MODULE_18_E2E: '0',
      RUN_MODULE_22_E2E: '1'
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
      ['foundation-module24a-module18-module22-integration', 'npm', ['run', 'test:integration']],
      ['module-22-browser-workflow', 'npm', ['run', 'test:e2e:module-22']]
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
  kind: `construction-erp-module-22-stage-3-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_3_ACCEPTED_READY_FOR_STAGE_4'
        : (stage2LiveAccepted
            ? 'STAGE_3_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
            : 'STAGE_3_STATIC_GATE_PASSED_STAGE_2_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  module: '22 - Approval Workflows',
  stage2LiveAccepted,
  activation: passed && mode === 'live'
    ? 'STAGE_3_ACCEPTED'
    : (stage2LiveAccepted
        ? 'LIVE_STAGE_3_GATE_REQUIRED'
        : 'DO_NOT_DEPLOY_STAGE_3_UNTIL_STAGE_2_LIVE_ACCEPTED'),
  projectScope: 'deferred-until-project-management-and-module-24b',
  publicApprovalRequestCreationAdded: false,
  nextStage: passed && mode === 'live'
    ? 'Module 2 - CRM & Client Management'
    : (stage2LiveAccepted ? 'Complete the Module 22 live Stage-3 gate' : 'Complete Module 18 live Stage-2 acceptance'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 22 Stage-3 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 22 Stage 3 accepted. The next dependency-aware stage is Module 2 CRM & Client Management.'
    : 'Module 22 static Stage-3 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
