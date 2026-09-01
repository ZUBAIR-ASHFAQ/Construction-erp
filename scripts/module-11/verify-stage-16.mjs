import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const INTEGRATION_VERIFIED = 'STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263';
const PLAYWRIGHT_VERIFIED = 'STAGE_16_MODULE_11_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_265';
const OPERATIONS_VERIFIED = 'STAGE_16_MODULE_11_OPERATIONS_VERIFIED_READY_FOR_PASS_266';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_11_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 11 Stage-16 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-11-evidence',
  mode === 'live' ? 'stage-16-live.json' : 'stage-16-static.json',
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

/** Create one local result using the same shape as child-process gate results. */
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

/** Validate destructive-test guards before the final live Stage-16 acceptance run. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_11_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_11_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_11_E2E !== '1') throw new Error('RUN_MODULE_11_E2E=1 is required.');

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
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 11 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage15 = await readEvidence('module-10-evidence/stage-15-live.json');
const integration = await readEvidence('module-11-evidence/stage-16-integration-security-live.json');
const playwright = await readEvidence('module-11-evidence/stage-16-playwright-live.json');
const operations = await readEvidence('module-11-evidence/stage-16-operations-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage15LiveAccepted) {
  console.error('BLOCKED\nSTAGE_15_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-15-live-handoff-prerequisite', 'failed', 'STAGE_15_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_16_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-16-integration-security-live-prerequisite', 'failed', 'STAGE_16_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_16_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-16-playwright-live-prerequisite', 'failed', 'STAGE_16_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_16_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-16-operations-live-prerequisite', 'failed', 'STAGE_16_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-9-static-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-10-static-regression', 'node', ['--test', 'tests/module-10-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-11-static-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-11-integration-test-syntax', 'node', ['--check', 'tests/integration/module-11-api.integration.test.mjs']],
    ['module-11-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-11-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['subcontracts-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.schema.ts']],
    ['subcontracts-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.repository.ts']],
    ['subcontracts-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.service.ts']],
    ['subcontracts-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.routes.ts']],
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
      RUN_MODULE_10_E2E: '0',
      RUN_MODULE_11_E2E: '1',
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
      ['module-11-backend-security-integration', 'npm', ['run', 'test:integration:module-11']],
      ['module-11-browser-workflow', 'npm', ['run', 'test:e2e:module-11']],
      ['module-11-operational-verification', 'npm', ['run', 'test:operations:module-11']],
      ['module-10-operational-regression', 'npm', ['run', 'test:operations:module-10']],
      ['module-9-operational-regression', 'npm', ['run', 'test:operations:module-9']],
      ['module-8-operational-regression', 'npm', ['run', 'test:operations:module-8']],
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

const expectedChecks = mode === 'live' ? 37 : 19;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-11-stage-16-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_16_ACCEPTED_READY_FOR_STAGE_17'
        : (stage15LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_16_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_16_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_16_STATIC_GATE_PASSED_STAGE_15_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '11 - Subcontractor Management',
  pass: 266,
  stage: 16,
  stage15LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_16_MODULE_11_ACCEPTED'
    : (!stage15LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_16_UNTIL_STAGE_15_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_16_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_16_GATE_REQUIRED')),
  ownedTables: [
    'subcontractors',
    'subcontracts',
    'subcontract_items',
    'subcontract_payment_applications',
    'subcontract_payment_lines',
  ],
  routeCount: 8,
  activePermissions: [
    'subcontractors.read',
    'subcontractors.manage',
    'subcontracts.read',
    'subcontracts.create',
    'subcontracts.execute',
    'subcontracts.certify',
    'subcontracts.close',
  ],
  activeEvents: [
    'subcontract.executed',
    'subcontract.revised',
    'subcontract.payment_application_submitted',
    'subcontract.payment_certified',
    'subcontract.closed',
  ],
  hardDependencies: [
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
    '8 - Procurement & RFQ supplier/vendor master',
    '22 - Approval Workflows',
  ],
  optionalDependencies: ['4 - BOQ Management'],
  projectScopeAuthority: 'Module 24B - Project Scope Activation',
  supplierVendorAuthority: 'Module 8 - Procurement & RFQ',
  approvalAuthority: 'Module 22 - Approval Workflows',
  commitmentAuthority: 'Module 7 - Budgeting & Job Costing',
  financeSourceAdapterDeferredToStage26: true,
  executionCreatesCommitmentAtomically: true,
  certificationSnapshotImmutable: true,
  retentionServerOwned: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'The reviewed route table has no subcontract list/detail, payment-application history or retention-ledger readback route even though the React requirement names those views.',
    'The source defines subcontract.revised and approved variation/revision behavior without a revision route, table or permission.',
    'The source defines retention release behavior without a retention-release route, exact cap/release formula or permission.',
    'The draft PATCH and payment-application creation operations have no dedicated edit/application permission; Stage 16 uses subcontracts.create as the narrowest reviewed authority.',
    'Formal subcontract AP posting remains deferred to Module 15B / Stage 26.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage15LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage15LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 17 - Module 12 Equipment Management'
    : 'Complete the genuine Stage-15/Stage-16 live chain and rerun module-11:acceptance:live before starting Stage 17 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 11 Stage 16 accepted. The next dependency-aware stage is Module 12 Equipment Management.'
    : 'Module 11 static Stage-16 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
