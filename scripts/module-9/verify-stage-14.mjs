import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const INTEGRATION_VERIFIED = 'STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241';
const PLAYWRIGHT_VERIFIED = 'STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243';
const OPERATIONS_VERIFIED = 'STAGE_14_MODULE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_244';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_9_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 9 Stage-14 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-9-evidence',
  mode === 'live' ? 'stage-14-live.json' : 'stage-14-static.json',
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

/** Validate disposable databases and isolate the Module 9 browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_9_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_9_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_9_E2E !== '1') throw new Error('RUN_MODULE_9_E2E=1 is required.');

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
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 9 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }
  if (!env.PURCHASE_ORDER_APPROVAL_DEFINITION_CODE?.trim()) {
    throw new Error('PURCHASE_ORDER_APPROVAL_DEFINITION_CODE is required for the Module 9 live gate.');
  }

  await access('package-lock.json');
}

const stage13 = await readEvidence('module-8-evidence/stage-13-live.json');
const integration = await readEvidence('module-9-evidence/stage-14-integration-security-live.json');
const playwright = await readEvidence('module-9-evidence/stage-14-playwright-live.json');
const operations = await readEvidence('module-9-evidence/stage-14-operations-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage13LiveAccepted) {
  console.error('BLOCKED\nSTAGE_13_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-13-live-handoff-prerequisite', 'failed', 'STAGE_13_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_14_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-14-integration-security-live-prerequisite', 'failed', 'STAGE_14_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_14_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-14-playwright-live-prerequisite', 'failed', 'STAGE_14_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_14_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-14-operations-live-prerequisite', 'failed', 'STAGE_14_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-9-static-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-9-integration-test-syntax', 'node', ['--check', 'tests/integration/module-9-api.integration.test.mjs']],
    ['module-9-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-9-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['purchase-orders-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/purchase-orders/purchase-orders.service.ts']],
    ['purchase-orders-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts']],
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
      RUN_MODULE_9_E2E: '1',
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
      ['module-9-backend-security-integration', 'npm', ['run', 'test:integration:module-9']],
      ['module-9-browser-workflow', 'npm', ['run', 'test:e2e:module-9']],
      ['module-9-operational-verification', 'npm', ['run', 'test:operations:module-9']],
      ['module-8-operational-regression', 'npm', ['run', 'test:operations:module-8']],
      ['module-7-operational-regression', 'npm', ['run', 'test:operations:module-7']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 28 : 14;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-9-stage-14-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15'
        : (stage13LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_14_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_14_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_14_STATIC_GATE_PASSED_STAGE_13_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '9 - Purchase Orders',
  pass: 244,
  stage: 14,
  stage13LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_14_MODULE_9_ACCEPTED'
    : (!stage13LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_14_UNTIL_STAGE_13_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_14_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_14_GATE_REQUIRED')),
  ownedTables: [
    'purchase_orders',
    'purchase_order_items',
    'purchase_order_revisions',
  ],
  routeCount: 8,
  activePermissions: [
    'purchase_orders.read',
    'purchase_orders.create',
    'purchase_orders.edit',
    'purchase_orders.submit',
    'purchase_orders.issue',
    'purchase_orders.revise',
  ],
  activeEvents: [
    'purchase_order.created',
    'purchase_order.submitted',
    'purchase_order.issued',
    'purchase_order.revised',
    'purchase_order.cancelled',
  ],
  vendorAndQuotationAuthority: 'Module 8 - Procurement & RFQ',
  costCommitmentAuthority: 'Module 7 - Budgeting & Job Costing',
  approvalAuthority: 'Module 22 - Approval Workflows',
  projectScopeAuthority: 'Module 24B - Project Scope Activation',
  inventoryReceiptWritesDeferredToStage15: true,
  financeSourceAdapterDeferredToStage26: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'The source allows a direct-purchase exception but defines no public bypass route, body field, reason field or dedicated permission, so the normal Stage-14 create flow remains quotation-backed.',
    'The source defines a cancellation command with reason but no dedicated cancel permission or persistent cancellation-reason column; Stage 14 uses purchase_orders.revise and preserves the reason in audit/outbox evidence.',
    'The source does not define an exact PO tax/rounding formula; Stage 14 records its percentage and half-up money convention explicitly rather than presenting it as source text.',
    'The source defines nullable purchase_order_items.item_id before Module 10 owns inventory_items; the Inventory foreign key remains deferred until Stage 15.',
    'The source does not define an issued-PO FX/repricing contract, so issued currency changes remain blocked rather than silently revalued.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage13LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage13LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 15 - Module 10 Inventory & Materials'
    : 'Complete the genuine Stage-13/Stage-14 live chain and rerun module-9:acceptance:live before starting Stage 15 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 9 Stage 14 accepted. The next dependency-aware stage is Module 10 Inventory & Materials.'
    : 'Module 9 static Stage-14 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
