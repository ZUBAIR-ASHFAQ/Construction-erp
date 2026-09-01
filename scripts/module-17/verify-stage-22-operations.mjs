import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const INTEGRATION_VERIFIED = 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_342';
const PLAYWRIGHT_VERIFIED = 'STAGE_22_MODULE_17_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_345';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-17-evidence',
  mode === 'live' ? 'stage-22-operations-live.json' : 'stage-22-operations.json'
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
async function writeBlockedEvidence(reason, stage21LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 345,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status: 'BLOCKED',
    stage21LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    nextStep: 'Resolve the live prerequisite and rerun module-17:operations:gate:live before claiming Stage-22 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 17 operations gate mode must be static or live.');
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const integrationLive = await readJson('module-17-evidence/stage-22-integration-security-live.json');
const playwrightLive = await readJson('module-17-evidence/stage-22-playwright-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage21LiveAccepted) {
  await writeBlockedEvidence('STAGE_21_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_22_MODULE_17_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_22_MODULE_17_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-17-evidence/stage-22-integration-security.json');
  const playwrightStatic = await readJson('module-17-evidence/stage-22-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 341
    && [
      'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING',
      'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 344
    && [
      'STAGE_22_MODULE_17_PLAYWRIGHT_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING',
      'STAGE_22_MODULE_17_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-17-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-17-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-17-playwright-regression', 'npm', ['run', 'module-17:playwright:gate']],
    ['module-17-operational-contract', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-17-integration-syntax', 'node', ['--check', 'tests/integration/module-17-api.integration.test.mjs']],
    [
      'module-17-runtime-typescript-syntax',
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
        'apps/api/src/modules/change-orders/change-orders.schema.ts',
        'apps/api/src/modules/change-orders/change-orders.repository.ts',
        'apps/api/src/modules/change-orders/change-orders.service.ts',
        'apps/api/src/modules/change-orders/change-orders.routes.ts',
        'apps/api/src/modules/change-orders/index.ts'
      ]
    ],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-21-static-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-17-operational-postgresql', 'npm', ['run', 'test:operations:module-17']]
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
        ? 'STAGE_22_MODULE_17_OPERATIONS_VERIFIED_READY_FOR_FINAL_ACCEPTANCE'
        : (stage21LiveAccepted
            ? 'STAGE_22_MODULE_17_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_22_MODULE_17_OPERATIONS_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 345,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status,
    stage21LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent same-key Change Request creation leaves one request, one audit/outbox result and one completed idempotency record',
      'concurrent different approval keys for one submitted request leave one immutable formal Change Order and one mandatory Budget revision',
      'concurrent approvals for different requests on one Project serialize and allocate increasing Budget versions without lost updates',
      'direct PostgreSQL writes cannot bypass Change Request line Project scope or immutable approved Change Order and applied-impact history',
      'a forced change_order.impact_applied outbox failure rolls back formal approval, Budget, Forecast, impact, audit and idempotency state together',
      'all reviewed Stage-22 Change Request, line, Change Order and impact indexes are inspected directly without timing-based performance claims'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 345 adds no migration because Pass 335 owns the reviewed Stage-22 persistence change'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    reviewedRouteCount: 7,
    reviewedWriteCount: 5,
    reviewedPermissionCount: 6,
    scheduleAdapterGenerated: false,
    clientBillingAdapterGenerated: false,
    subcontractAdapterGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage21LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage21LiveAccepted,
    nextStep: passed
      ? 'Run the final Stage-22 acceptance gate in this pass; Stage 23 remains Module 16 Client Billing.'
      : 'Repair the failed operational check before final Stage-22 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
