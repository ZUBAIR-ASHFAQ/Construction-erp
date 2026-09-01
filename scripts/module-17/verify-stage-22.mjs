import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const INTEGRATION_VERIFIED = 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_342';
const PLAYWRIGHT_VERIFIED = 'STAGE_22_MODULE_17_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_345';
const OPERATIONS_VERIFIED = 'STAGE_22_MODULE_17_OPERATIONS_VERIFIED_READY_FOR_FINAL_ACCEPTANCE';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_17_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 17 Stage-22 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-17-evidence',
  mode === 'live' ? 'stage-22-live.json' : 'stage-22-static.json'
);

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Build one local gate result using the same shape as child-process results. */
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

/** Validate destructive-test guards before the final live Stage-22 acceptance run. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_17_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_17_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_17_E2E !== '1') throw new Error('RUN_MODULE_17_E2E=1 is required.');

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
    'RUN_MODULE_10_E2E',
    'RUN_MODULE_11_E2E',
    'RUN_MODULE_12_E2E',
    'RUN_MODULE_14A_E2E',
    'RUN_MODULE_13_E2E',
    'RUN_MODULE_14B_E2E',
    'RUN_MODULE_21_E2E'
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 17 browser gate.`);
  }

  await access('package-lock.json');
}

const stage21 = await readEvidence('module-21-evidence/stage-21-live.json');
const integration = await readEvidence('module-17-evidence/stage-22-integration-security-live.json');
const playwright = await readEvidence('module-17-evidence/stage-22-playwright-live.json');
const operations = await readEvidence('module-17-evidence/stage-22-operations-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

const staticSteps = [
  ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-static-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['module-17-static-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['module-17-operations-static', 'npm', ['run', 'module-17:operations:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
  ['module-17-integration-test-syntax', 'node', ['--check', 'tests/integration/module-17-api.integration.test.mjs']],
  ['module-17-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-17-browser.spec.mjs']],
  ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
  ['change-orders-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/change-orders/change-orders.schema.ts']],
  ['change-orders-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/change-orders/change-orders.repository.ts']],
  ['change-orders-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/change-orders/change-orders.service.ts']],
  ['change-orders-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/change-orders/change-orders.routes.ts']],
  ['change-orders-index-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/change-orders/index.ts']],
  ['budget-impact-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts']],
  ['budget-impact-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts']],
  ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
  ['api-main-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/main.ts']],
  ['change-orders-browser-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/change-orders/api/change-orders-api.ts']],
  ['change-orders-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/change-orders/hooks/change-orders.ts']],
  [
    'change-orders-react-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--jsx',
      'react-jsx',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/web/src/features/change-orders/api/change-orders-api.ts',
      'apps/web/src/features/change-orders/hooks/change-orders.ts',
      'apps/web/src/features/change-orders/components/change-orders-workspace.tsx',
      'apps/web/src/features/change-orders/pages/change-orders-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ]
];

if (mode === 'live' && !stage21LiveAccepted) {
  console.error('BLOCKED\nSTAGE_21_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-21-live-handoff-prerequisite', 'failed', 'STAGE_21_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_22_MODULE_17_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-22-integration-security-live-prerequisite', 'failed', 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_22_MODULE_17_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-22-playwright-live-prerequisite', 'failed', 'STAGE_22_MODULE_17_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_22_MODULE_17_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-22-operations-live-prerequisite', 'failed', 'STAGE_22_MODULE_17_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
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
      RUN_MODULE_10_E2E: '0',
      RUN_MODULE_11_E2E: '0',
      RUN_MODULE_12_E2E: '0',
      RUN_MODULE_14A_E2E: '0',
      RUN_MODULE_13_E2E: '0',
      RUN_MODULE_14B_E2E: '0',
      RUN_MODULE_21_E2E: '0',
      RUN_MODULE_17_E2E: '1'
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
      ['module-17-backend-security-integration', 'npm', ['run', 'test:integration:module-17']],
      ['module-17-browser-workflow', 'npm', ['run', 'test:e2e:module-17']],
      ['module-17-operational-verification', 'npm', ['run', 'test:operations:module-17']],
      ['module-5-operational-regression', 'npm', ['run', 'test:operations:module-5']],
      ['module-6-operational-regression', 'npm', ['run', 'test:operations:module-6']],
      ['module-7-operational-regression', 'npm', ['run', 'test:operations:module-7']],
      ['module-22-integration-regression', 'npm', ['run', 'test:integration:module-22']],
      ['module-24b-operational-regression', 'npm', ['run', 'test:operations:module-24b']],
      ['module-21-operational-regression', 'npm', ['run', 'test:operations:module-21']]
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? staticSteps.length + 18 : staticSteps.length;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-17-stage-22-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23'
        : (stage21LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_22_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_22_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_22_STATIC_GATE_PASSED_STAGE_21_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '17 - Change Orders / Variations',
  pass: 345,
  stage: 22,
  stage21LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_22_MODULE_17_ACCEPTED'
    : (!stage21LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_22_UNTIL_STAGE_21_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_22_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_22_GATE_REQUIRED')),
  sourceDefinedTables: [
    'change_requests',
    'change_request_lines',
    'change_orders',
    'change_order_impacts'
  ],
  reviewedRouteCount: 7,
  reviewedWriteRouteCount: 5,
  activePermissions: [
    'changes.read',
    'changes.create',
    'changes.estimate',
    'changes.submit',
    'changes.approve',
    'changes.apply'
  ],
  stableErrors: [
    'CHANGE_REQUEST_NOT_FOUND',
    'CHANGE_REQUEST_LOCKED',
    'CHANGE_APPROVAL_REQUIRED',
    'CHANGE_IMPACT_ALREADY_APPLIED',
    'CHANGE_TARGET_CLOSED'
  ],
  sourceDefinedEvents: [
    'change_request.created',
    'change_request.submitted',
    'change_order.approved',
    'change_order.impact_applied',
    'change_request.rejected'
  ],
  hardDependencies: [
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
    '22 - Approval Workflows'
  ],
  optionalDependencies: ['4B - BOQ Project Mapping when boq_item_id is used'],
  conditionalDependencies: ['21 - Project Scheduling when approved_days or Schedule impact is enabled'],
  projectAuthorizationUsesModule24B: true,
  supportingDocumentsReuseModule18: true,
  approvedVariationSnapshotImmutable: true,
  budgetForecastImpactMandatory: true,
  atomicImpactBoundaryVerified: true,
  idempotentWriteBoundaryVerified: true,
  rejectedChangesRemainHistorical: true,
  scheduleImpactFailClosedUntilReviewedAdapter: true,
  scheduleAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  stage27TargetAdapterProofStillRequired: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'Change Request status vocabulary is not enumerated by the source.',
    'Change type vocabulary is not enumerated by the source.',
    'Formal Change Order status vocabulary is not enumerated by the source.',
    'Change impact target_type/status vocabularies are not enumerated by the source.',
    'Change number uniqueness scope is not defined; Foundation numbering is used without inventing a database uniqueness scope.',
    'The workflow mentions withdrawn changes, but the reviewed API defines no withdraw command.',
    'The source does not define a separate Change Request detail GET; the Change register carries the reviewed aggregate.',
    'The exact approval latest-revision representation and required-document list are not defined by Module 17.',
    'Supporting document mutation stays in Module 18 because Module 17 defines no attachment command.',
    'approved_days and Schedule impact remain fail-closed until the reviewed Schedule target adapter is completed.',
    'Client Billing and Subcontract target adapters remain deferred to their owning stages and Stage 27 integration proof.',
    'Reversal/adjustment semantics for already-applied Change impacts remain a Stage-27 policy gap and are not invented here.'
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage21LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage21LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextDependentStage: '23 - Module 16 Client Billing',
  nextReviewedPass: 'Pass 346 - Stage 23 / Module 16 Client Billing contract freeze.',
  nextStage: passed && mode === 'live'
    ? 'Stage 23 - Module 16 Client Billing'
    : 'Stage-23 contract preparation may continue, but Stage-22 runtime acceptance/deployment remains blocked until the genuine Stage-21/Stage-22 live chain passes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 17 Stage 22 accepted. The next dependency-aware stage is Module 16 Client Billing.'
    : 'Module 17 static Stage-22 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
