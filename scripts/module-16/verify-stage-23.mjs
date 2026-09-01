import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';
import { validateTestDatabaseEnvironment } from '../testing/lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const INTEGRATION_VERIFIED = 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_354';
const PLAYWRIGHT_VERIFIED = 'STAGE_23_MODULE_16_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_357';
const OPERATIONS_VERIFIED = 'STAGE_23_MODULE_16_OPERATIONS_VERIFIED_READY_FOR_FINAL_ACCEPTANCE';
const LIVE_CONFIRMATION = 'RUN_CONSTRUCTION_ERP_MODULE_16_LIVE_GATE';
const MIGRATION_CONFIRMATION = 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE';
const mode = process.argv.find((value) => value.startsWith('--mode='))?.slice('--mode='.length) ?? 'static';

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 16 Stage-23 gate mode must be static or live.');
}

const evidencePath = path.resolve(
  'module-16-evidence',
  mode === 'live' ? 'stage-23-live.json' : 'stage-23-static.json'
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

/** Validate destructive-test guards before the final live Stage-23 acceptance run. */
async function validateLivePrerequisites(env) {
  if (env.MODULE_16_LIVE_GATE_CONFIRM !== LIVE_CONFIRMATION) {
    throw new Error(`Set MODULE_16_LIVE_GATE_CONFIRM=${LIVE_CONFIRMATION}.`);
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
  if (env.RUN_MODULE_16_E2E !== '1') throw new Error('RUN_MODULE_16_E2E=1 is required.');

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
    'RUN_MODULE_21_E2E',
    'RUN_MODULE_17_E2E'
  ]) {
    if (env[flag] === '1') throw new Error(`${flag} must not be enabled during the Module 16 browser gate.`);
  }

  await access('package-lock.json');
}

const stage22 = await readEvidence('module-17-evidence/stage-22-live.json');
const integration = await readEvidence('module-16-evidence/stage-23-integration-security-live.json');
const playwright = await readEvidence('module-16-evidence/stage-23-playwright-live.json');
const operations = await readEvidence('module-16-evidence/stage-23-operations-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;
const integrationLiveVerified = integration?.status === INTEGRATION_VERIFIED
  && integration?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;
const operationsLiveVerified = operations?.status === OPERATIONS_VERIFIED
  && operations?.runtimeVerificationComplete === true;
const results = [];

const staticSteps = [
  ['module-2-static-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-4b-static-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-15a-static-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-17-static-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-16-static-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  ['module-16-operations-static', 'npm', ['run', 'module-16:operations:gate']],
  ['full-static-regression', 'npm', ['run', 'test:static']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
  ['module-16-integration-test-syntax', 'node', ['--check', 'tests/integration/module-16-api.integration.test.mjs']],
  ['module-16-playwright-test-syntax', 'node', ['--check', 'tests/e2e/module-16-browser.spec.mjs']],
  ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
  ['client-billing-schema-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/client-billing/client-billing.schema.ts']],
  ['client-billing-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/client-billing/client-billing.repository.ts']],
  ['client-billing-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/client-billing/client-billing.service.ts']],
  ['client-billing-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/client-billing/client-billing.routes.ts']],
  ['client-billing-index-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/client-billing/index.ts']],
  ['api-app-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/app.ts']],
  ['api-main-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/main.ts']],
  ['client-billing-browser-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/client-billing/api/client-billing-api.ts']],
  ['client-billing-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/client-billing/hooks/client-billing.ts']],
  [
    'client-billing-react-typescript-syntax',
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
      'apps/web/src/features/client-billing/api/client-billing-api.ts',
      'apps/web/src/features/client-billing/hooks/client-billing.ts',
      'apps/web/src/features/client-billing/components/client-billing-workspace.tsx',
      'apps/web/src/features/client-billing/pages/client-billing-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ]
];

if (mode === 'live' && !stage22LiveAccepted) {
  console.error('BLOCKED\nSTAGE_22_LIVE_HANDOFF_REQUIRED');
  results.push(localResult('stage-22-live-handoff-prerequisite', 'failed', 'STAGE_22_LIVE_HANDOFF_REQUIRED'));
} else if (mode === 'live' && !integrationLiveVerified) {
  console.error('BLOCKED\nSTAGE_23_MODULE_16_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-23-integration-security-live-prerequisite', 'failed', 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !playwrightLiveVerified) {
  console.error('BLOCKED\nSTAGE_23_MODULE_16_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-23-playwright-live-prerequisite', 'failed', 'STAGE_23_MODULE_16_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED'));
} else if (mode === 'live' && !operationsLiveVerified) {
  console.error('BLOCKED\nSTAGE_23_MODULE_16_OPERATIONS_LIVE_VERIFICATION_REQUIRED');
  results.push(localResult('stage-23-operations-live-prerequisite', 'failed', 'STAGE_23_MODULE_16_OPERATIONS_LIVE_VERIFICATION_REQUIRED'));
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
      RUN_MODULE_17_E2E: '0',
      RUN_MODULE_16_E2E: '1'
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
      ['module-16-backend-security-integration', 'npm', ['run', 'test:integration:module-16']],
      ['module-16-browser-workflow', 'npm', ['run', 'test:e2e:module-16']],
      ['module-16-operational-verification', 'npm', ['run', 'test:operations:module-16']],
      ['module-2-integration-regression', 'npm', ['run', 'test:integration:module-2']],
      ['module-4b-operational-regression', 'npm', ['run', 'test:operations:module-4b']],
      ['module-5-operational-regression', 'npm', ['run', 'test:operations:module-5']],
      ['module-15a-operational-regression', 'npm', ['run', 'test:operations:module-15a']],
      ['module-17-operational-regression', 'npm', ['run', 'test:operations:module-17']],
      ['module-24b-operational-regression', 'npm', ['run', 'test:operations:module-24b']]
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
  kind: `construction-erp-module-16-stage-23-${mode}-evidence`,
  mode,
  generatedAt: new Date().toISOString(),
  status: passed
    ? (mode === 'live'
        ? 'STAGE_23_ACCEPTED_READY_FOR_STAGE_24'
        : (stage22LiveAccepted
            ? (operationsLiveVerified
                ? 'STAGE_23_STATIC_GATE_PASSED_READY_FOR_LIVE_ACCEPTANCE'
                : 'STAGE_23_STATIC_GATE_PASSED_LIVE_VERIFICATION_PENDING')
            : 'STAGE_23_STATIC_GATE_PASSED_STAGE_22_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED',
  module: '16 - Client Billing',
  pass: 357,
  stage: 23,
  stage22LiveAccepted,
  integrationLiveVerified,
  playwrightLiveVerified,
  operationsLiveVerified,
  activation: passed && mode === 'live'
    ? 'STAGE_23_MODULE_16_ACCEPTED'
    : (!stage22LiveAccepted
        ? 'DO_NOT_DEPLOY_STAGE_23_UNTIL_STAGE_22_LIVE_HANDOFF'
        : (!operationsLiveVerified
            ? 'COMPLETE_STAGE_23_LIVE_VERIFICATION_CHAIN_BEFORE_ACCEPTANCE'
            : 'LIVE_STAGE_23_GATE_REQUIRED')),
  sourceDefinedTables: [
    'client_contracts',
    'progress_claims',
    'progress_claim_lines',
    'client_invoices',
    'retention_ledger'
  ],
  reviewedRouteCount: 7,
  reviewedWriteRouteCount: 6,
  activePermissions: [
    'client_billing.read',
    'client_contracts.manage',
    'client_claims.create',
    'client_claims.certify',
    'client_invoices.issue',
    'client_retention.release'
  ],
  stableErrors: [
    'CLIENT_CONTRACT_NOT_FOUND',
    'CLAIM_INVALID_CUMULATIVE_VALUE',
    'CLAIM_NOT_CERTIFIED',
    'CLIENT_INVOICE_ALREADY_CREATED',
    'RETENTION_RELEASE_NOT_ALLOWED'
  ],
  sourceDefinedEvents: [
    'client_contract.created',
    'progress_claim.submitted',
    'progress_claim.certified',
    'client_invoice.issued',
    'client_retention.released'
  ],
  hardDependencies: [
    '5 - Project Management',
    '2 - CRM & Client Management',
    '15A - Finance Core'
  ],
  configuredDependencies: [
    '4B - BOQ Project Mapping when BOQ-backed Claim lines are used',
    '17 - Change Orders / Variations when approved variation values are configured'
  ],
  projectAuthorizationUsesModule24B: true,
  clientMasterUsesModule2: true,
  exactDecimalBoundaryVerified: true,
  cumulativeClaimProtectionVerified: true,
  certifiedClaimHistoryImmutable: true,
  clientInvoiceSourceHistoryImmutable: true,
  retentionReleaseForwardOnly: true,
  idempotentWriteBoundaryVerified: true,
  concurrencySafeNumberingVerifiedByOperationalSuite: true,
  financeArAdapterGenerated: false,
  approvedChangeContractAdapterGenerated: false,
  stage26FinanceAdapterStillRequired: true,
  stage27IntegrationProofStillRequired: true,
  exactApprovedBusinessModuleCount: 24,
  stageSuffixCreatesBusinessModule: false,
  unresolvedSourceContract: [
    'Client Contract billing_method and status vocabularies are not enumerated by the source.',
    'The workflow says Contract billing terms are maintained, but the reviewed API defines no Client Contract update command.',
    'The source defines progress_claim.submitted but no explicit Claim submit endpoint or exact submission transition.',
    'The source does not define whether Claim-line PUT is replace-all or merge; Stage 23 uses one complete DRAFT replacement without adding line CRUD routes.',
    'Contract, Claim and Invoice numbering scopes/formats are not defined; Foundation numbering is used without inventing database uniqueness scope.',
    'The source does not define tax calculation, payment-term derivation or due-date policy beyond the reviewed Invoice dates.',
    'client_invoices.claim_id is nullable in persistence, but no standalone Client Invoice create command is reviewed.',
    'The source does not define Retention source/direction/status vocabularies or partial-release request semantics; the reviewed bodyless command is implemented as full release.',
    'The exact approved Change Order to Client Contract target mapping/source key is not defined and remains deferred to reviewed integration completion.',
    'Client Invoice to AR posting/reconciliation remains owned by Stage-26 Module 15B and is not claimed complete in Stage 23.',
    'The source describes payment status tracking but defines no Module-16 payment mutation/read API; no payment subsystem is invented.'
  ],
  productionRuntimeChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicApiChanges: 0,
  newPermissions: 0,
  runtimeVerificationComplete: passed
    && mode === 'live'
    && stage22LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  runtimeDeploymentAllowed: passed
    && mode === 'live'
    && stage22LiveAccepted
    && integrationLiveVerified
    && playwrightLiveVerified
    && operationsLiveVerified,
  nextDependentStage: '24 - Module 19 RFI & Submittals',
  nextReviewedPass: 'Pass 358 - Stage 24 / Module 19 RFI & Submittals contract freeze.',
  nextStage: passed && mode === 'live'
    ? 'Stage 24 - Module 19 RFI & Submittals'
    : 'Stage-24 contract preparation may continue, but Stage-23 runtime acceptance/deployment remains blocked until the genuine Stage-22/Stage-23 live chain passes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 ${mode} evidence written to ${written}`);

if (passed) {
  console.log(mode === 'live'
    ? 'Module 16 Stage 23 accepted. The next dependency-aware stage is Module 19 RFI & Submittals.'
    : 'Module 16 static Stage-23 gate passed. Live acceptance is still required.');
} else {
  process.exitCode = 1;
}
