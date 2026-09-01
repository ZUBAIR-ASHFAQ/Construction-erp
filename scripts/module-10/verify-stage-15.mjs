import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const INTEGRATION_VERIFIED = 'STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252';
const PLAYWRIGHT_VERIFIED = 'STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254';
const OPERATIONS_VERIFIED = 'STAGE_15_MODULE_10_OPERATIONS_VERIFIED_READY_FOR_PASS_255';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_10_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 10 Stage-15 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-10-evidence',
  mode === 'live' ? 'stage-15-live.json' : 'stage-15-static.json',
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

/** Validate disposable databases and isolate the Module 10 browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_10_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_10_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_10_E2E !== '1') throw new Error('RUN_MODULE_10_E2E=1 is required.');

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
    'RUN_MODULE_7_E2E',
    'RUN_MODULE_8_E2E',
    'RUN_MODULE_9_E2E',
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 10 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage14 = await readEvidence('module-9-evidence/stage-14-live.json');
const integration = await readEvidence('module-10-evidence/stage-15-integration-security-live.json');
const playwright = await readEvidence('module-10-evidence/stage-15-playwright-live.json');
const operations = await readEvidence('module-10-evidence/stage-15-operations-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage14LiveAccepted) {
  console.error('BLOCKED\nSTAGE_14_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-14-live-handoff-prerequisite', 'failed', 'STAGE_14_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_15_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-15-integration-security-live-prerequisite', 'failed', 'STAGE_15_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_15_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-15-playwright-live-prerequisite', 'failed', 'STAGE_15_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_15_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-15-operations-live-prerequisite', 'failed', 'STAGE_15_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-9-static-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-10-static-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-10-integration-test-syntax', 'node', ['--check', 'tests/integration/module-10-api.integration.test.mjs']],
    ['module-10-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-10-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['inventory-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.schema.ts']],
    ['inventory-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.repository.ts']],
    ['inventory-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.service.ts']],
    ['inventory-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.routes.ts']],
    ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
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
      RUN_MODULE_7_E2E: '0',
      RUN_MODULE_8_E2E: '0',
      RUN_MODULE_9_E2E: '0',
      RUN_MODULE_10_E2E: '1',
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
      ['module-10-backend-security-integration', 'npm', ['run', 'test:integration:module-10']],
      ['module-10-browser-workflow', 'npm', ['run', 'test:e2e:module-10']],
      ['module-10-operational-verification', 'npm', ['run', 'test:operations:module-10']],
      ['module-9-operational-regression', 'npm', ['run', 'test:operations:module-9']],
      ['module-7-operational-regression', 'npm', ['run', 'test:operations:module-7']],
      ['module-6-operational-regression', 'npm', ['run', 'test:operations:module-6']],
      ['module-5-operational-regression', 'npm', ['run', 'test:operations:module-5']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 33 : 17;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-10-stage-15-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16'
        : (stage14LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_15_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_15_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_15_STATIC_GATE_PASSED_STAGE_14_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '10 - Inventory & Material Management',
  pass: 255,
  stage: 15,
  stage14LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_15_MODULE_10_ACCEPTED'
    : (!stage14LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_15_UNTIL_STAGE_14_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_15_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_15_GATE_REQUIRED')),
  ownedTables: [
    'inventory_items',
    'warehouses',
    'inventory_balances',
    'goods_receipts',
    'goods_receipt_items',
    'stock_transactions',
  ],
  routeCount: 8,
  activePermissions: [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.adjust',
  ],
  activeEvents: [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted',
  ],
  hardDependencies: [
    '9 - Purchase Orders',
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
  ],
  projectScopeAuthority: 'Module 24B - Project Scope Activation',
  purchaseOrderAuthority: 'Module 9 - Purchase Orders',
  projectActualCostAuthority: 'Module 7 - Budgeting & Job Costing',
  stockLedgerAppendOnly: true,
  inventoryBalanceMaintainedTransactionally: true,
  receiptUpdatesPoConsumptionAtomically: true,
  issueCreatesProjectActualIdempotently: true,
  financeSourceAdapterDeferredToStage26: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'The source requires Warehouse/site-store management but defines no Warehouse management public API; Stage 15 therefore does not invent Warehouse CRUD.',
    'The source requires stock-ledger and low-stock UI views but defines no dedicated stock-ledger read route, reorder threshold fields or low-stock API.',
    'The source defines valuation_method and approved unit conversion rules without an exact valuation algorithm, UOM master, conversion table or conversion API.',
    'The source defines a return command without a dedicated inventory.return permission; Stage 15 preserves the frozen issue-plus-adjust authorization convention.',
    'The source defines STOCK_PERIOD_LOCKED without assigning Inventory a stock-period model; Stage 15 does not borrow Module-15 fiscal-period authority.',
    'Formal Inventory accounting/source adapters remain deferred to Module 15B / Stage 26.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage14LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage14LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 16 - Module 11 Subcontractor Management'
    : 'Complete the genuine Stage-14/Stage-15 live chain and rerun module-10:acceptance:live before starting Stage 16 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 10 Stage 15 accepted. The next dependency-aware stage is Module 11 Subcontractor Management.'
    : 'Module 10 static Stage-15 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
