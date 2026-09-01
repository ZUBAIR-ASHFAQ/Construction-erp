import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-21-evidence',
  mode === 'live' ? 'stage-21-integration-security-live.json' : 'stage-21-integration-security.json'
);

/** Read one JSON evidence file and return null when it is not present. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live record before any PostgreSQL integration command can run. */
async function writeBlockedEvidence(reason, stage20LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 328,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status: 'BLOCKED',
    stage20LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the Stage-20 live prerequisite, then rerun module-21:integration-security:gate:live before claiming Stage-21 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 21 integration/security gate mode must be static or live.');
}

const stage20 = await readJson('module-14b-evidence/stage-20-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage20LiveAccepted) {
  await writeBlockedEvidence('STAGE_20_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-21-evidence/stage-21-http.json');
  const httpPrepared = httpEvidence?.pass === 327
    && [
      'STAGE_21_MODULE_21_HTTP_READY_FOR_PASS_328',
      'STAGE_21_MODULE_21_HTTP_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-21-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-21-static-contract', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['module-21-integration-test-syntax', 'node', ['--check', 'tests/integration/module-21-api.integration.test.mjs']],
    [
      'module-21-runtime-typescript-syntax',
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
        'apps/api/src/modules/scheduling/scheduling.schema.ts',
        'apps/api/src/modules/scheduling/scheduling.repository.ts',
        'apps/api/src/modules/scheduling/scheduling.service.ts',
        'apps/api/src/modules/scheduling/scheduling.routes.ts',
        'apps/api/src/modules/scheduling/index.ts'
      ]
    ],
    ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-14b-regression', 'node', ['--test', 'tests/module-14b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-21-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-21']]);
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
        ? 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329'
        : (stage20LiveAccepted
            ? 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 328,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status,
    stage20LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-21-api.integration.test.mjs',
    coverage: [
      'live suite covers all eight reviewed Scheduling operations through real Fastify, service, repository and PostgreSQL boundaries',
      'live suite verifies one current Schedule, Activity hierarchy and same-Project optional WBS scope without unsupported planning fields',
      'live suite verifies complete FS dependency replacement plus service and PostgreSQL dependency-cycle protection',
      'live suite verifies immutable baseline snapshots remain unchanged after later progress while progress history stays append-only',
      'live suite verifies source-defined audit/outbox evidence for Schedule create, milestone change, baseline and progress transitions',
      'live suite verifies authentication, the four reviewed permissions, Module-24B Project scope and cross-Company fail-closed behavior',
      'live suite verifies mandatory Idempotency-Key replay and strict rejection of browser-owned Company/lifecycle/baseline/audit authority',
      'live suite verifies generated OpenAPI exposes exactly eight Stage-21 operations, bearer security, six idempotent writes and no advanced CPM/P6 routes'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    reviewedRouteCount: 8,
    reviewedWriteCount: 6,
    reviewedPermissionCount: 4,
    reviewedErrorCount: 5,
    reviewedEventCount: 4,
    onlyGuaranteedDependencyType: 'FS',
    scheduleWorkflowVerified: mode === 'live' && passed,
    dependencySecurityVerified: mode === 'live' && passed,
    baselineImmutabilityVerified: mode === 'live' && passed,
    progressAppendOnlyVerified: mode === 'live' && passed,
    negativeAuthorizationVerified: mode === 'live' && passed,
    crossProjectIsolationVerified: mode === 'live' && passed,
    crossCompanyIsolationVerified: mode === 'live' && passed,
    generatedOpenApiVerified: mode === 'live' && passed,
    advancedCpmAdded: false,
    externalSchedulerSyncAdded: false,
    changeOrderIntegrationAdded: false,
    dailyReportIntegrationAdded: false,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage20LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage20LiveAccepted,
    nextPass: passed
      ? 'Pass 329 - Module 21 React typed API client and TanStack Query hooks for exactly the eight reviewed Scheduling operations.'
      : 'Repair the failed Pass-328 integration/security check before generating the Stage-21 React data layer.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
