import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const ACCEPTED_STAGE_3 = 'STAGE_3_ACCEPTED_READY_FOR_STAGE_4';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_2_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 2 Stage-4 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-2-evidence', `stage-4-${mode}.json`);

/** Read the prerequisite Module 22 live evidence without changing its result. */
async function readStage3LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-22-evidence/stage-3-live.json', 'utf8'));
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

/** Validate only explicitly disposable databases and the isolated Module 2 browser mode. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_2_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_2_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_2_E2E !== '1') throw new Error('RUN_MODULE_2_E2E=1 is required.');
  if (env.RUN_MODULE_24A_E2E === '1') throw new Error('RUN_MODULE_24A_E2E must not be enabled during the Module 2 browser gate.');
  if (env.RUN_MODULE_18_E2E === '1') throw new Error('RUN_MODULE_18_E2E must not be enabled during the Module 2 browser gate.');
  if (env.RUN_MODULE_22_E2E === '1') throw new Error('RUN_MODULE_22_E2E must not be enabled during the Module 2 browser gate.');
  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage3 = await readStage3LiveAcceptance();
const stage3LiveAccepted = stage3?.status === ACCEPTED_STAGE_3;
const results = [];

if (mode === 'live' && !stage3LiveAccepted) {
  results.push(localResult('stage-3-live-prerequisite', 'failed', 'STAGE_3_LIVE_ACCEPTANCE_REQUIRED'));
} else {
  const staticSteps = [
    ['stage-0-3-static-regression', 'npm', ['run', 'stages-0-3:gate']],
    ['module-2-static-suite', 'node', ['--test', 'tests/module-2-static.test.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-2-integration-test-syntax', 'node', ['--check', 'tests/integration/module-2-api.integration.test.mjs']],
    ['module-2-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-2-browser.spec.mjs']],
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
      RUN_MODULE_2_E2E: '1'
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
      ['module-2-repository-service-api-integration', 'npm', ['run', 'test:integration:module-2']],
      ['module-2-browser-workflow', 'npm', ['run', 'test:e2e:module-2']]
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 17 : 6;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-2-stage-4-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_4_ACCEPTED_READY_FOR_STAGE_5'
        : (stage3LiveAccepted
            ? 'STAGE_4_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
            : 'STAGE_4_STATIC_GATE_PASSED_STAGE_3_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  module: '2 - CRM & Client Management',
  stage3LiveAccepted,
  activation: passed && mode === 'live'
    ? 'STAGE_4_ACCEPTED'
    : (stage3LiveAccepted
        ? 'LIVE_STAGE_4_GATE_REQUIRED'
        : 'DO_NOT_DEPLOY_STAGE_4_UNTIL_STAGE_3_LIVE_ACCEPTED'),
  ownedTables: ['clients', 'client_contacts', 'opportunities', 'opportunity_notes'],
  projectScope: 'deferred-until-project-management-and-module-24b',
  deferredRelationships: ['tender', 'project', 'client-billing', 'finance'],
  nextStage: passed && mode === 'live'
    ? 'Module 3 - Tendering & Estimation'
    : (stage3LiveAccepted ? 'Complete the Module 2 live Stage-4 gate' : 'Complete Module 22 live Stage-3 acceptance'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 2 Stage-4 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 2 Stage 4 accepted. The next dependency-aware stage is Module 3 Tendering & Estimation.'
    : 'Module 2 static Stage-4 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
