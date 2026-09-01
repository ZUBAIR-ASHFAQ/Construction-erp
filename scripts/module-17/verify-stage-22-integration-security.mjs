import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-17-evidence',
  mode === 'live' ? 'stage-22-integration-security-live.json' : 'stage-22-integration-security.json'
);

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live result before any PostgreSQL integration command can run. */
async function writeBlockedEvidence(reason, stage21LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 341,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status: 'BLOCKED',
    stage21LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the Stage-21 live prerequisite, then rerun module-17:integration-security:gate:live before claiming Stage-22 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 17 integration/security gate mode must be static or live.');
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage21LiveAccepted) {
  await writeBlockedEvidence('STAGE_21_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-17-evidence/stage-22-http.json');
  const httpPrepared = httpEvidence?.pass === 340
    && [
      'STAGE_22_MODULE_17_HTTP_READY_FOR_PASS_341',
      'STAGE_22_MODULE_17_HTTP_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-17-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-17-static-contract', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['module-17-integration-test-syntax', 'node', ['--check', 'tests/integration/module-17-api.integration.test.mjs']],
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
        'apps/api/src/modules/change-orders/index.ts',
        'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
        'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts'
      ]
    ],
    ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-17-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-17']]);
  }

  if (httpPrepared) {
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args);
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = httpPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_342'
        : (stage21LiveAccepted
            ? 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 341,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status,
    stage21LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-17-api.integration.test.mjs',
    coverage: [
      'live suite covers the seven reviewed Change Orders operations through real Fastify, service, repository and PostgreSQL boundaries',
      'live suite verifies DRAFT estimate replacement, Module-22 submission, terminal approval, immutable formal Change Order creation and mandatory Module-7 Budget/Forecast application',
      'live suite verifies rejected changes remain historical and do not create formal Change Orders or revised Budget state',
      'live suite verifies authentication, six reviewed changes.* permissions, Module-24B Project scope and cross-Company fail-closed behavior',
      'live suite verifies strict server-owned field rejection, same-Project cost references, closed-Project protection and bounded Change-register queries',
      'live suite verifies same-key idempotent replay leaves one Change Request, one formal Change Order and one mandatory impact set',
      'live suite forces change_order.impact_applied outbox failure and verifies Change Order, Budget, Forecast, audit, outbox and idempotency rollback together',
      'live suite verifies generated OpenAPI exposes exactly seven Module-17 operations, bearer security, five idempotent writes and no generic Change CRUD routes',
      'live suite verifies approvedDays remains fail-closed until the reviewed Stage-27 Schedule adapter exists'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    reviewedRouteCount: 7,
    reviewedWriteCount: 5,
    reviewedPermissionCount: 6,
    reviewedErrorCount: 5,
    reviewedEventCount: 5,
    workflowVerified: mode === 'live' && passed,
    module22ApprovalVerified: mode === 'live' && passed,
    mandatoryBudgetImpactVerified: mode === 'live' && passed,
    rejectionHistoryVerified: mode === 'live' && passed,
    idempotencyVerified: mode === 'live' && passed,
    transactionRollbackVerified: mode === 'live' && passed,
    negativeAuthorizationVerified: mode === 'live' && passed,
    crossProjectIsolationVerified: mode === 'live' && passed,
    crossCompanyIsolationVerified: mode === 'live' && passed,
    generatedOpenApiVerified: mode === 'live' && passed,
    scheduleAdapterGenerated: false,
    subcontractAdapterGenerated: false,
    clientBillingAdapterGenerated: false,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage21LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage21LiveAccepted,
    nextPass: passed
      ? 'Pass 342 - Module 17 React typed API client and TanStack Query hooks for exactly the seven reviewed Change Orders operations.'
      : 'Repair the failed Pass-341 integration/security check before generating the Stage-22 React data layer.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
