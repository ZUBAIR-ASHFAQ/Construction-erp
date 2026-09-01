import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-16-evidence',
  mode === 'live' ? 'stage-23-integration-security-live.json' : 'stage-23-integration-security.json'
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
async function writeBlockedEvidence(reason, stage22LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 353,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status: 'BLOCKED',
    stage22LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the Stage-22 live prerequisite, then rerun module-16:integration-security:gate:live before claiming Stage-23 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 16 integration/security gate mode must be static or live.');
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage22LiveAccepted) {
  await writeBlockedEvidence('STAGE_22_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-16-evidence/stage-23-http.json');
  const httpPrepared = httpEvidence?.pass === 352
    && [
      'STAGE_23_MODULE_16_HTTP_READY_FOR_PASS_353',
      'STAGE_23_MODULE_16_HTTP_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-16-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-16-static-contract', 'node', ['--test', 'tests/module-16-static.test.mjs']],
    ['module-16-integration-test-syntax', 'node', ['--check', 'tests/integration/module-16-api.integration.test.mjs']],
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
    ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
    ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-16-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-16']]);
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
        ? 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_354'
        : (stage22LiveAccepted
            ? 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 353,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status,
    stage22LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-16-api.integration.test.mjs',
    coverage: [
      'live suite covers the seven reviewed Client Billing operations through real Fastify, service, repository and PostgreSQL boundaries',
      'live suite verifies Contract -> Claim -> BOQ valuation -> certification -> Client Invoice -> retention release with exact decimal snapshots',
      'live suite verifies cumulative BOQ quantities cannot move behind certified history and total Claim value cannot exceed the revised Contract value',
      'live suite verifies certified Claim edits and duplicate Client Invoice creation fail closed without rewriting approved history',
      'live suite verifies authentication, six reviewed permissions, Module-24B Project scope, read filtering and cross-Company fail-closed behavior',
      'live suite verifies strict server-owned field rejection, bounded list pagination, six mandatory Idempotency-Key headers and same-key replay',
      'live suite forces client_invoice.issued outbox failure and verifies Invoice, retention, audit, outbox, numbering and idempotency rollback together',
      'live suite verifies PostgreSQL issued-Invoice, invoiced-Claim and retention-history triggers reject direct financial rewrites',
      'live suite verifies generated OpenAPI exposes exactly seven Module-16 operations, bearer security, six idempotent writes and no generic billing/payment/AR routes',
      'Stage-26 Client Invoice -> AR posting and Stage-27 approved Change -> Client Contract target integration remain deliberately deferred'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    reviewedRouteCount: 7,
    reviewedWriteCount: 6,
    reviewedPermissionCount: 6,
    reviewedErrorCount: 5,
    reviewedEventCount: 5,
    workflowVerified: mode === 'live' && passed,
    cumulativeValueProtectionVerified: mode === 'live' && passed,
    immutableHistoryVerified: mode === 'live' && passed,
    retentionReleaseVerified: mode === 'live' && passed,
    idempotencyVerified: mode === 'live' && passed,
    transactionRollbackVerified: mode === 'live' && passed,
    negativeAuthorizationVerified: mode === 'live' && passed,
    crossProjectIsolationVerified: mode === 'live' && passed,
    crossCompanyIsolationVerified: mode === 'live' && passed,
    generatedOpenApiVerified: mode === 'live' && passed,
    financeArAdapterGenerated: false,
    approvedChangeContractAdapterGenerated: false,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage22LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage22LiveAccepted,
    nextPass: passed
      ? 'Pass 354 - Module 16 React typed API client and TanStack Query hooks for exactly the seven reviewed Client Billing operations.'
      : 'Repair the failed Pass-353 integration/security check before generating the Stage-23 React data layer.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
