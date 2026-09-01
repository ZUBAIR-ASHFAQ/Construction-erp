import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const INTEGRATION_VERIFIED = 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_354';
const PLAYWRIGHT_VERIFIED = 'STAGE_23_MODULE_16_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_357';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-16-evidence',
  mode === 'live' ? 'stage-23-operations-live.json' : 'stage-23-operations.json'
);

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write fail-honest blocked evidence before PostgreSQL operational checks can start. */
async function writeBlockedEvidence(reason, stage22LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 357,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status: 'BLOCKED',
    stage22LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    nextStep: 'Resolve the live prerequisite and rerun module-16:operations:gate:live before claiming Stage-23 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 16 operations gate mode must be static or live.');
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const integrationLive = await readJson('module-16-evidence/stage-23-integration-security-live.json');
const playwrightLive = await readJson('module-16-evidence/stage-23-playwright-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage22LiveAccepted) {
  await writeBlockedEvidence('STAGE_22_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_23_MODULE_16_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_23_MODULE_16_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-16-evidence/stage-23-integration-security.json');
  const playwrightStatic = await readJson('module-16-evidence/stage-23-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 353
    && [
      'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING',
      'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 356
    && [
      'STAGE_23_MODULE_16_PLAYWRIGHT_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING',
      'STAGE_23_MODULE_16_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-16-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-16-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-16-playwright-regression', 'npm', ['run', 'module-16:playwright:gate']],
    ['module-16-operational-contract', 'node', ['--test', 'tests/module-16-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-16-integration-syntax', 'node', ['--check', 'tests/integration/module-16-api.integration.test.mjs']],
    [
      'module-16-runtime-typescript-syntax',
      'tsc',
      [
        '--noEmit',
        '--noCheck',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'apps/api/src/modules/client-billing/client-billing.schema.ts',
        'apps/api/src/modules/client-billing/client-billing.repository.ts',
        'apps/api/src/modules/client-billing/client-billing.service.ts',
        'apps/api/src/modules/client-billing/client-billing.routes.ts',
        'apps/api/src/modules/client-billing/index.ts'
      ]
    ],
    ['module-2-static-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
    ['module-4b-static-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-15a-static-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-17-static-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-16-operational-postgresql', 'npm', ['run', 'test:operations:module-16']]
    );
  }

  if (integrationPrepared && playwrightPrepared) {
    const liveEnvironment = { ...process.env, RUN_FOUNDATION_DB_TESTS: '1' };
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args, { env: mode === 'live' ? liveEnvironment : process.env });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = integrationPrepared
    && playwrightPrepared
    && results.length === steps.length + 2
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_23_MODULE_16_OPERATIONS_VERIFIED_READY_FOR_FINAL_ACCEPTANCE'
        : (stage22LiveAccepted
            ? 'STAGE_23_MODULE_16_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_23_MODULE_16_OPERATIONS_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 357,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status,
    stage22LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent same-key Client Contract creation leaves one Contract, one audit/outbox result, one number allocation and one completed idempotency record',
      'concurrent different Client Contract creates across two Projects allocate distinct Foundation Contract numbers without collision',
      'concurrent different Invoice keys for one certified Claim leave exactly one immutable Client Invoice and one Retention Ledger source',
      'concurrent full Retention releases with different keys converge on one released balance and one release audit/outbox event',
      'direct PostgreSQL writes cannot bypass BOQ Project scope, Invoice Claim-to-Contract scope, issued-Invoice immutability or Retention history guards',
      'a forced client_retention.released outbox failure rolls back released amount, lifecycle status, audit and idempotency state together',
      'all reviewed Stage-23 Client Contract, Claim, Claim-line, Invoice and Retention indexes are inspected directly without timing-based performance claims'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 357 adds no migration because Pass 347 owns the reviewed Stage-23 persistence change'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    reviewedRouteCount: 7,
    reviewedWriteCount: 6,
    reviewedPermissionCount: 6,
    financeArAdapterGenerated: false,
    approvedChangeContractAdapterGenerated: false,
    stage26FinanceAdapterStillRequired: true,
    stage27IntegrationProofStillRequired: true,
    runtimeVerificationComplete: passed && mode === 'live' && stage22LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage22LiveAccepted,
    nextStep: passed
      ? 'Run the final Stage-23 acceptance gate in static mode now; run live mode only after the full Stage-22/Stage-23 live prerequisite chain is verified.'
      : 'Repair the failed operational check before final Stage-23 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
