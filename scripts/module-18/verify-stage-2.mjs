import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const ACCEPTED_STAGE_1 = 'STAGE_1_ACCEPTED_READY_FOR_STAGE_2';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_18_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const STORAGE_CONFIRMATION = 'USE_CONSTRUCTION_ERP_MODULE_18_TEST_STORAGE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 18 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-18-evidence', `stage-2-${mode}.json`);

/** Read prerequisite Stage 1 live evidence when it exists. */
async function readStage1LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-24a-evidence/stage-1-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Make one local preflight result in the same shape as command results. */
function localResult(name, status, errorCode = null) {
  const now = new Date().toISOString();
  return { name, status, startedAt: now, finishedAt: now, code: status === 'passed' ? 0 : 1, signal: null, ...(errorCode ? { errorCode } : {}) };
}

/** Validate the destructive live-gate environment without exposing secrets or URLs. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_18_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_18_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_18_E2E !== '1') throw new Error('RUN_MODULE_18_E2E=1 is required.');
  if (env.RUN_MODULE_18_S3_TESTS !== '1') throw new Error('RUN_MODULE_18_S3_TESTS=1 is required.');
  if (env.MODULE_18_STORAGE_CONFIRM !== STORAGE_CONFIRMATION) {
    throw new Error(`Set MODULE_18_STORAGE_CONFIRM=${STORAGE_CONFIRMATION}.`);
  }

  const storageBucket = env.STORAGE_BUCKET?.trim().toLowerCase() ?? '';
  if (!storageBucket || !/(test|integration|acceptance)/.test(storageBucket)) {
    throw new Error('STORAGE_BUCKET must be an explicitly disposable test/integration/acceptance bucket.');
  }
  if (storageBucket === 'construction-erp' || storageBucket === 'construction-erp-production') {
    throw new Error(`Refusing protected storage bucket: ${storageBucket}`);
  }
  if ((env.STORAGE_ACCESS_KEY_ID?.trim() ? 1 : 0) !== (env.STORAGE_SECRET_ACCESS_KEY?.trim() ? 1 : 0)) {
    throw new Error('STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY must be set together when explicit credentials are used.');
  }
  if (env.STORAGE_ENDPOINT?.trim()) {
    const storageUrl = new URL(env.STORAGE_ENDPOINT);
    if (!['http:', 'https:'].includes(storageUrl.protocol)) throw new Error('STORAGE_ENDPOINT must use HTTP or HTTPS.');
  }
  if (env.RUN_MODULE_24A_E2E === '1') throw new Error('RUN_MODULE_24A_E2E must not be enabled during the Module 18 browser gate.');
  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }
  await access('package-lock.json');
}

const stage1 = await readStage1LiveAcceptance();
const stage1LiveAccepted = stage1?.status === ACCEPTED_STAGE_1;
const results = [];

if (mode === 'live' && !stage1LiveAccepted) {
  results.push(localResult('stage-1-live-prerequisite', 'failed', 'STAGE_1_LIVE_ACCEPTANCE_REQUIRED'));
} else {
  const staticSteps = [
    ['foundation-and-workspace-regression', 'npm', ['run', 'foundation:gate']],
    ['integration-test-syntax', 'node', ['--check', 'tests/integration/module-18-api.integration.test.mjs']],
    ['playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-18-browser.spec.mjs']],
    ['playwright-storage-server-syntax', 'node', ['--check', 'tests/e2e/module-18-test-api-server.mjs']]
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
      RUN_MODULE_18_E2E: '1',
      RUN_MODULE_18_S3_TESTS: '1'
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
      ['foundation-module24a-module18-integration', 'npm', ['run', 'test:integration']],
      ['module-18-browser-workflow', 'npm', ['run', 'test:e2e:module-18']]
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 15 : 4;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-18-stage-2-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_2_ACCEPTED_READY_FOR_STAGE_3'
        : (stage1LiveAccepted
            ? 'STAGE_2_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
            : 'STAGE_2_STATIC_GATE_PASSED_STAGE_1_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED',
  module: '18 - Document Management',
  stage1LiveAccepted,
  activation: passed && mode === 'live'
    ? 'STAGE_2_ACCEPTED'
    : (stage1LiveAccepted
        ? 'LIVE_STAGE_2_GATE_REQUIRED'
        : 'DO_NOT_DEPLOY_STAGE_2_UNTIL_STAGE_1_LIVE_ACCEPTED'),
  projectScope: 'deferred-until-project-management-and-module-24b',
  nextStage: passed && mode === 'live'
    ? 'Module 22 - Approval Workflows'
    : (stage1LiveAccepted ? 'Complete the Module 18 live Stage-2 gate' : 'Complete Module 24A live Stage-1 acceptance'),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 18 Stage-2 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 18 Stage 2 accepted. The next dependency-aware stage is Module 22 Approval Workflows.'
    : 'Module 18 static Stage-2 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
