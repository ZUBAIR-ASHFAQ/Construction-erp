import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const INTEGRATION_VERIFIED = 'STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230';
const PLAYWRIGHT_VERIFIED = 'STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232';
const OPERATIONS_VERIFIED = 'STAGE_13_MODULE_8_OPERATIONS_VERIFIED_READY_FOR_PASS_233';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_8_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 8 Stage-13 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-8-evidence',
  mode === 'live' ? 'stage-13-live.json' : 'stage-13-static.json',
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

/** Validate disposable databases and isolate the Module 8 browser run before live acceptance. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_8_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_8_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_8_E2E !== '1') throw new Error('RUN_MODULE_8_E2E=1 is required.');

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
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 8 browser gate.`);
  }

  if (!env.AUTH_ACTION_TOKEN_SECRET || env.AUTH_ACTION_TOKEN_SECRET.length < 32) {
    throw new Error('AUTH_ACTION_TOKEN_SECRET must contain at least 32 characters.');
  }

  await access('package-lock.json');
}

const stage12 = await readEvidence('module-7-evidence/stage-12-live.json');
const integration = await readEvidence('module-8-evidence/stage-13-integration-security-live.json');
const playwright = await readEvidence('module-8-evidence/stage-13-playwright-live.json');
const operations = await readEvidence('module-8-evidence/stage-13-operations-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

if (mode === 'live' && !stage12LiveAccepted) {
  console.error('BLOCKED\nSTAGE_12_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-12-live-handoff-prerequisite', 'failed', 'STAGE_12_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_13_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-13-integration-security-live-prerequisite', 'failed', 'STAGE_13_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_13_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-13-playwright-live-prerequisite', 'failed', 'STAGE_13_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_13_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-13-operations-live-prerequisite', 'failed', 'STAGE_13_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
} else {
  const staticSteps = [
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-8-static-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['module-8-integration-test-syntax', 'node', ['--check', 'tests/integration/module-8-api.integration.test.mjs']],
    ['module-8-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-8-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['procurement-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/procurement/procurement.service.ts']],
    ['procurement-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/procurement/procurement.repository.ts']],
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
      RUN_MODULE_8_E2E: '1',
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
      ['module-8-backend-security-integration', 'npm', ['run', 'test:integration:module-8']],
      ['module-8-browser-workflow', 'npm', ['run', 'test:e2e:module-8']],
      ['module-8-operational-verification', 'npm', ['run', 'test:operations:module-8']],
      ['module-7-operational-regression', 'npm', ['run', 'test:operations:module-7']],
    ];

    for (const [name, command, args] of liveSteps) {
      const result = await runStep(name, command, args, { env: liveEnvironment });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }
}

const expectedChecks = mode === 'live' ? 27 : 14;
const passed = results.length === expectedChecks && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: `construction-erp-module-8-stage-13-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14'
        : (stage12LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_13_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_13_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_13_STATIC_GATE_PASSED_STAGE_12_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '8 - Procurement & RFQ',
  pass: 233,
  stage: 13,
  stage12LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_13_MODULE_8_ACCEPTED'
    : (!stage12LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_13_UNTIL_STAGE_12_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_13_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_13_GATE_REQUIRED')),
  ownedTables: [
    'vendors',
    'vendor_contacts',
    'purchase_requisitions',
    'purchase_requisition_items',
    'rfqs',
    'rfq_vendors',
    'supplier_quotations',
    'supplier_quotation_items',
  ],
  routeCount: 8,
  activePermissions: [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ],
  activeEvents: [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ],
  vendorMasterOwner: true,
  quotationSelectionCreatesFinancialCommitment: false,
  purchaseOrderCommitmentDeferredToStage14: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  pass362RfqItemIntegrityRepair: true,
  unresolvedSourceContract: [
    'Part I requires Module 8 to own vendors and vendor_contacts, but Appendix A defines no Vendor-master public management API.',
    'Submitted/approved requisitions are described as revision/return-to-draft controlled, but the reviewed route table defines no revision or return-to-draft command.',
    'RFQ comparison requires normalized quantity/currency/tax assumptions, but the source does not define an FX or evaluation-scoring contract.',
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage12LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage12LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextStage: passed && mode === 'live'
    ? 'Stage 14 - Module 9 Purchase Orders'
    : 'Complete the genuine Stage-12/Stage-13 live chain and rerun module-8:acceptance:live before starting Stage 14 runtime deployment.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 8 Stage 13 accepted. The next dependency-aware stage is Module 9 Purchase Orders.'
    : 'Module 8 static Stage-13 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
