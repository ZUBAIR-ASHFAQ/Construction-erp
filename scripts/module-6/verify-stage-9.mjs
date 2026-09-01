import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const OPERATIONS_VERIFIED = 'STAGE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_189';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_6_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 Stage-9 gate mode must be static or live.');
}

const evidencePath = path.resolve('module-6-evidence', mode === 'live' ? 'stage-9-live.json' : 'stage-9-static.json');

/** Read one optional JSON evidence file without changing its result. */
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
    ...(errorCode ? { errorCode } : {})
  };
}

/** Validate disposable databases and isolate the Module 6 browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_6_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_6_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_6_E2E !== '1') throw new Error('RUN_MODULE_6_E2E=1 is required.');

  for (const flag of [
    'RUN_MODULE_24A_E2E',
    'RUN_MODULE_18_E2E',
    'RUN_MODULE_22_E2E',
    'RUN_MODULE_2_E2E',
    'RUN_MODULE_3_E2E',
    'RUN_MODULE_4A_E2E',
    'RUN_MODULE_5_E2E',
    'RUN_MODULE_24B_E2E'
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 6 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const pass175 = await readEvidence('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readEvidence('module-24b-evidence/stage-8-live.json');
const repairHold = await readEvidence('module-24b-evidence/stage-8-repair-hold.json');
const operations = await readEvidence('module-6-evidence/stage-9-operations-live.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !module6LiveHandoffAccepted) {
  results.push(localResult('stage-8-live-handoff-prerequisite', 'failed', 'STAGE_8_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  results.push(localResult('stage-9-operations-live-prerequisite', 'failed', 'STAGE_9_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['stage-8-final-handoff-contract', 'node', ['--test', 'tests/pass-175-final-repair-audit.test.mjs']],
    ['module-6-operations-static-regression', 'npm', ['run', 'module-6:operations:gate']],
    ['module-6-static-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-6-integration-test-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
    ['module-6-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-6-browser.spec.mjs']],
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
      RUN_MODULE_4A_E2E: '0',
      RUN_MODULE_5_E2E: '0',
      RUN_MODULE_24B_E2E: '0',
      RUN_MODULE_6_E2E: '1'
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
      ['module-6-backend-security-api-operational-integration', 'npm', ['run', 'test:integration:module-6']],
      ['module-6-browser-workflow', 'npm', ['run', 'test:e2e:module-6']]
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 19 : 8;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-6-stage-9-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10'
        : (module6LiveHandoffAccepted
            ? (operationsLiveVerified
                ? 'STAGE_9_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_9_STATIC_GATE_PASSED_OPERATIONS_LIVE_PENDING')
            : 'STAGE_9_STATIC_GATE_PASSED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '6 - WBS & Cost Codes',
  pass: 189,
  stage: 9,
  module6LiveHandoffAccepted,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_9_ACCEPTED'
    : (!module6LiveHandoffAccepted
        ? 'DO_NOT_DEPLOY_STAGE_9_UNTIL_STAGE_8_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_PASS_188_LIVE_OPERATIONS_BEFORE_STAGE_9_ACCEPTANCE'
            : 'LIVE_STAGE_9_GATE_REQUIRED')),
  ownedTables: ['wbs_nodes', 'cost_codes', 'cost_types', 'project_cost_codes'],
  routeCount: 7,
  activePermissions: ['wbs.read', 'wbs.manage', 'cost_codes.read', 'cost_codes.manage', 'wbs.freeze'],
  activeEvents: ['wbs.node_created', 'wbs.updated', 'cost_code.created', 'project.cost_structure_frozen'],
  unresolvedSourceContract: [
    'The source requires a Cost Type master UI but defines no reviewed Cost Type HTTP CRUD operations.',
    'The source mentions archive behavior but defines no reviewed WBS or Cost Code archive command.',
    'The source requires controlled frozen-baseline revision or reopen but defines no durable freeze-state field or reviewed reopen command.'
  ],
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  productionRuntimeChanges: 0,
  runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Module 4B - BOQ Project Mapping'
    : (!module6LiveHandoffAccepted
        ? 'Complete the genuine Stage-8 live handoff before Stage-9 live acceptance.'
        : (!operationsLiveVerified
            ? 'Complete Pass 188 live operational verification before Stage-9 live acceptance.'
            : 'Run the guarded Module 6 Stage-9 live acceptance gate.')),
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 6 Stage 9 accepted. The next dependency-aware stage is Module 4B BOQ Project Mapping.'
    : 'Module 6 static Stage-9 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
