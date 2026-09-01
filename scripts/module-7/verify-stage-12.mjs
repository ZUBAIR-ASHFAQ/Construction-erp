import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const INTEGRATION_VERIFIED = 'STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219';
const PLAYWRIGHT_VERIFIED = 'STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221';
const OPERATIONS_VERIFIED = 'STAGE_12_MODULE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_222';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_7_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 7 Stage-12 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-7-evidence',
  mode === 'live' ? 'stage-12-live.json' : 'stage-12-static.json',
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

/** Validate disposable databases and isolate the Module 7 browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_7_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_7_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_7_E2E !== '1') throw new Error('RUN_MODULE_7_E2E=1 is required.');

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
    'RUN_MODULE_4B_E2E',
    'RUN_MODULE_15A_E2E',
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 7 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage11 = await readEvidence('module-15a-evidence/stage-11-live.json');
const integration = await readEvidence('module-7-evidence/stage-12-integration-security-live.json');
const playwright = await readEvidence('module-7-evidence/stage-12-playwright-live.json');
const operations = await readEvidence('module-7-evidence/stage-12-operations-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage11LiveAccepted) {
  console.error('BLOCKED\nSTAGE_11_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-11-live-handoff-prerequisite', 'failed', 'STAGE_11_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_12_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-12-integration-security-live-prerequisite', 'failed', 'STAGE_12_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_12_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-12-playwright-live-prerequisite', 'failed', 'STAGE_12_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_12_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-12-operations-live-prerequisite', 'failed', 'STAGE_12_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-15a-static-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-7-static-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-7-integration-test-syntax', 'node', ['--check', 'tests/integration/module-7-api.integration.test.mjs']],
    ['module-7-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-7-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['module-7-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts']],
    ['module-7-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts']],
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
      RUN_MODULE_4B_E2E: '0',
      RUN_MODULE_15A_E2E: '0',
      RUN_MODULE_7_E2E: '1',
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
      ['module-7-backend-security-integration', 'npm', ['run', 'test:integration:module-7']],
      ['module-7-browser-workflow', 'npm', ['run', 'test:e2e:module-7']],
      ['module-7-operational-verification', 'npm', ['run', 'test:operations:module-7']],
      ['module-15a-operational-regression', 'npm', ['run', 'test:operations:module-15a']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 25 : 12;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-7-stage-12-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13'
        : (stage11LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_12_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_12_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_12_STATIC_GATE_PASSED_STAGE_11_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '7 - Budgeting & Job Costing',
  pass: 222,
  stage: 12,
  stage11LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_12_MODULE_7_ACCEPTED'
    : (!stage11LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_12_UNTIL_STAGE_11_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_12_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_12_GATE_REQUIRED')),
  ownedTables: [
    'project_budgets',
    'budget_lines',
    'cost_commitments',
    'cost_actuals',
    'forecast_lines',
  ],
  sourceRouteCount: 7,
  pass361DraftRecoveryRoutesAdded: 1,
  routeCount: 8,
  activePermissions: [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ],
  activeEvents: [
    'budget.created',
    'budget.frozen',
    'budget.revised',
    'forecast.updated',
  ],
  sourceDerivedEventDeferred: 'job_cost.source_posted',
  sourceAdaptersDeferred: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'Pass 361 adds one bounded latest-DRAFT recovery read; generic budget-list/history CRUD remains outside the repair contract.',
    'The reviewed public API defines no explicit Module-7 submit/approve/reopen command even though approval is described as conditional in the broader workflow.',
    'The source names cost_commitments.cost_structure_id and cost_actuals.cost_structure_id without explicitly naming the foreign-key target; Stage 12 preserves the reviewed Module-6 Project cost-structure interpretation.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage11LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage11LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 13 - Module 8 Procurement & RFQ'
    : 'Complete the genuine Stage-11/Stage-12 live chain and rerun module-7:acceptance:live before starting Stage 13 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 7 Stage 12 accepted. The next dependency-aware stage is Module 8 Procurement & RFQ.'
    : 'Module 7 static Stage-12 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
