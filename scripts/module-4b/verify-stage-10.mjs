import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const OPERATIONS_VERIFIED = 'STAGE_10_MODULE_4B_OPERATIONS_VERIFIED_READY_FOR_PASS_200';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_4B_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4B Stage-10 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-4b-evidence',
  mode === 'live' ? 'stage-10-live.json' : 'stage-10-static.json',
);

/** Read one optional JSON evidence file and return null when it is absent. */
async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
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
    ...(errorCode ? { errorCode } : {}),
  };
}

/** Validate disposable databases and isolate the Module 4B browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_4B_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_4B_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_4B_E2E !== '1') throw new Error('RUN_MODULE_4B_E2E=1 is required.');

  for (const flag of [
    'RUN_MODULE_24A_E2E',
    'RUN_MODULE_18_E2E',
    'RUN_MODULE_22_E2E',
    'RUN_MODULE_2_E2E',
    'RUN_MODULE_3_E2E',
    'RUN_MODULE_4A_E2E',
    'RUN_MODULE_5_E2E',
    'RUN_MODULE_24B_E2E',
    'RUN_MODULE_6_E2E',
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 4B browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage9 = await readEvidence('module-6-evidence/stage-9-live.json');
const operations = await readEvidence('module-4b-evidence/stage-10-operations-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage9LiveAccepted) {
  console.error('BLOCKED\nSTAGE_9_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-9-live-handoff-prerequisite', 'failed', 'STAGE_9_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_10_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-10-operations-live-prerequisite', 'failed', 'STAGE_10_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['stage-9-static-prerequisite', 'npm', ['run', 'module-6:gate']],
    ['module-4a-static-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4b-operations-static-regression', 'npm', ['run', 'module-4b:operations:gate']],
    ['module-4b-static-suite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-4b-integration-test-syntax', 'node', ['--check', 'tests/integration/module-4b-api.integration.test.mjs']],
    ['module-4b-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-4b-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
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
      RUN_MODULE_4A_E2E: '0',
      RUN_MODULE_5_E2E: '0',
      RUN_MODULE_24B_E2E: '0',
      RUN_MODULE_6_E2E: '0',
      RUN_MODULE_4B_E2E: '1',
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
      ['module-4b-backend-security-integration', 'npm', ['run', 'test:integration:module-4b']],
      ['module-4b-browser-workflow', 'npm', ['run', 'test:e2e:module-4b']],
      ['module-4b-operational-verification', 'npm', ['run', 'test:operations:module-4b']],
      ['module-4a-operational-regression', 'npm', ['run', 'test:operations:module-4a']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 23 : 10;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-4b-stage-10-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11'
        : (stage9LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_10_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_10_STATIC_GATE_PASSED_OPERATIONS_LIVE_PENDING')
            : 'STAGE_10_STATIC_GATE_PASSED_STAGE_9_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  pass: 200,
  stage: 10,
  stage9LiveAccepted,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_10_ACCEPTED'
    : (!stage9LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_10_UNTIL_STAGE_9_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_PASS_199_LIVE_OPERATIONS_BEFORE_STAGE_10_ACCEPTANCE'
            : 'LIVE_STAGE_10_GATE_REQUIRED')),
  extendedTables: ['boqs', 'boq_items'],
  activatedRelationships: ['boqs.project_id', 'boq_items.wbs_node_id', 'boq_items.cost_code_id'],
  routeCount: 6,
  activePermissions: ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'],
  activeEvents: ['boq.created', 'boq.revision_created', 'boq.revision_frozen'],
  existingTenderBoqsRemainValid: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'The source defines no dedicated command for attaching a Project to an already-existing tender-only BOQ.',
    'The source defines nullable WBS and Cost Code mappings but no Cost Type relationship on BOQ items.',
    'The source does not require the nullable WBS and Cost Code mapping fields to always be supplied together.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  runtimeVerificationComplete: passed && mode === 'live' && stage9LiveAccepted && operationsLiveVerified,
  runtimeDeploymentAllowed: passed && mode === 'live' && stage9LiveAccepted && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Module 15A - Finance Core'
    : (!stage9LiveAccepted
        ? 'Complete the genuine Stage-9 live handoff before Stage-10 live acceptance.'
        : (!operationsLiveVerified
            ? 'Complete Pass 199 live operational verification before Stage-10 live acceptance.'
            : 'Run the guarded Module 4B Stage-10 live acceptance gate.')),
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 4B Stage 10 accepted. The next dependency-aware stage is Module 15A Finance Core.'
    : 'Module 4B static Stage-10 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
