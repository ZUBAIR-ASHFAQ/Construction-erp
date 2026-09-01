import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const INTEGRATION_VERIFIED = 'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_208';
const PLAYWRIGHT_VERIFIED = 'STAGE_11_MODULE_15A_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_210';
const OPERATIONS_VERIFIED = 'STAGE_11_MODULE_15A_OPERATIONS_VERIFIED_READY_FOR_PASS_211';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_15A_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 15A Stage-11 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-15a-evidence',
  mode === 'live' ? 'stage-11-live.json' : 'stage-11-static.json',
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

/** Validate disposable databases and isolate the Module 15A browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_15A_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_15A_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_15A_E2E !== '1') throw new Error('RUN_MODULE_15A_E2E=1 is required.');

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
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 15A browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage10 = await readEvidence('module-4b-evidence/stage-10-live.json');
const integration = await readEvidence('module-15a-evidence/stage-11-integration-security-live.json');
const playwright = await readEvidence('module-15a-evidence/stage-11-playwright-live.json');
const operations = await readEvidence('module-15a-evidence/stage-11-operations-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage10LiveAccepted) {
  console.error('BLOCKED\nSTAGE_10_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-10-live-handoff-prerequisite', 'failed', 'STAGE_10_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_11_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-11-integration-security-live-prerequisite', 'failed', 'STAGE_11_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_11_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-11-playwright-live-prerequisite', 'failed', 'STAGE_11_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_11_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-11-operations-live-prerequisite', 'failed', 'STAGE_11_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-4b-static-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-15a-static-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-15a-integration-test-syntax', 'node', ['--check', 'tests/integration/module-15a-api.integration.test.mjs']],
    ['module-15a-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-15a-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['finance-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.service.ts']],
    ['finance-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.repository.ts']],
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
      RUN_MODULE_15A_E2E: '1',
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
      ['module-15a-backend-security-integration', 'npm', ['run', 'test:integration:module-15a']],
      ['module-15a-browser-workflow', 'npm', ['run', 'test:e2e:module-15a']],
      ['module-15a-operational-verification', 'npm', ['run', 'test:operations:module-15a']],
      ['module-4b-operational-regression', 'npm', ['run', 'test:operations:module-4b']],
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
  kind: `construction-erp-module-15a-stage-11-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12'
        : (stage10LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_11_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_11_STATIC_GATE_PASSED_OPERATIONS_LIVE_PENDING')
            : 'STAGE_11_STATIC_GATE_PASSED_STAGE_10_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  pass: 211,
  stage: 11,
  stage10LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_11_FINANCE_CORE_ACCEPTED'
    : (!stage10LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_11_UNTIL_STAGE_10_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_11_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_11_GATE_REQUIRED')),
  ownedTables: ['gl_accounts', 'fiscal_periods', 'journals', 'journal_lines'],
  routeCount: 6,
  activePermissions: [
    'finance.accounts.read',
    'finance.journals.read',
    'finance.journals.create',
    'finance.journals.post',
    'finance.periods.close',
    'finance.reports.read',
  ],
  activeEvents: ['journal.posted', 'journal.reversed', 'accounting_period.closed'],
  deferredToModule15b: [
    'ap_invoices',
    'ar_invoices',
    'payments',
    'payment_allocations',
    'supplier/PO/subcontract/payroll/client-billing source adapters',
  ],
  financeComplete: false,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'The reviewed Stage-11 API defines no account create/update command even though the broader workflow describes account setup.',
    'The reviewed Stage-11 API defines no fiscal-period list/setup or reopen command.',
    'The source names journal_lines.cost_structure_id without directly naming its foreign-key target; Stage 11 records the reviewed project_cost_codes interpretation explicitly.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage10LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage10LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 12 - Module 7 Budgeting & Job Costing'
    : 'Complete the genuine Stage-10/Stage-11 live chain and rerun module-15a:acceptance:live before starting Stage 12 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 15A Stage 11 accepted. The next dependency-aware stage is Module 7 Budgeting & Job Costing.'
    : 'Module 15A static Stage-11 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
