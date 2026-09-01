import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-11-evidence',
  mode === 'live' ? 'stage-16-integration-security-live.json' : 'stage-16-integration-security.json'
);

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live record before any PostgreSQL command can run. */
async function writeBlockedEvidence(reason, stage15LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 262,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status: 'BLOCKED',
    stage15LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the Stage-15 live prerequisite, then rerun module-11:integration-security:gate:live before claiming Stage-16 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 11 integration/security gate mode must be static or live.');
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage15LiveAccepted) {
  await writeBlockedEvidence('STAGE_15_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-11-evidence/stage-16-http.json');
  const httpPrepared = httpEvidence?.pass === 261
    && [
      'STAGE_16_MODULE_11_HTTP_READY_FOR_PASS_262',
      'STAGE_16_MODULE_11_HTTP_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-11-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-11-http-regression', 'npm', ['run', 'module-11:http:gate']],
    ['module-11-static-contract', 'node', ['--test', 'tests/module-11-static.test.mjs']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-11-integration-test-syntax', 'node', ['--check', 'tests/integration/module-11-api.integration.test.mjs']],
    [
      'module-11-runtime-typescript-syntax',
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
        'apps/api/src/modules/subcontracts/subcontracts.repository.ts',
        'apps/api/src/modules/subcontracts/subcontracts.service.ts',
        'apps/api/src/modules/subcontracts/subcontracts.routes.ts',
        'apps/api/src/modules/subcontracts/index.ts'
      ]
    ],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-11-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-11']]);
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
        ? 'STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263'
        : (stage15LiveAccepted
            ? 'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 262,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status,
    stage15LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-11-api.integration.test.mjs',
    coverage: [
      'all eight reviewed Subcontractor Management operations run through real Fastify, service, repository and PostgreSQL boundaries',
      'same-Company Module-8 Vendor linkage is accepted while cross-Company Vendor linkage is rejected without duplicating the supplier master',
      'Module-22 execution approval is required and an approved subcontract creates Module-7 commitments exactly once under idempotent replay',
      'progress applications derive server-owned numbering and prior certified progress before immutable certification',
      'certification enforces per-line and whole-contract cumulative limits while calculating retention on the server',
      'missing authentication/permission, restricted Project scope, cross-Company resources and browser-owned authority are rejected',
      'database constraints reject cross-Company Vendor and Project persistence outside the service boundary',
      'late outbox failures roll back execution status, commitments, audit and certification state without partial commits',
      'generated OpenAPI exposes exactly eight reviewed operations with bearer security and Idempotency-Key on seven writes',
      'Finance/AP posting, Change Order revisions, retention release and unsupported subcontract/application readback routes remain absent'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    reviewedRouteCount: 8,
    reviewedPermissionCount: 7,
    reviewedErrorCount: 5,
    reviewedEventCount: 5,
    vendorLinkAndIsolationVerified: mode === 'live' && passed,
    module22ApprovalVerified: mode === 'live' && passed,
    module7CommitmentAtomicityVerified: mode === 'live' && passed,
    paymentApplicationCertificationVerified: mode === 'live' && passed,
    cumulativeCertificationLimitVerified: mode === 'live' && passed,
    serverOwnedRetentionVerified: mode === 'live' && passed,
    negativeAuthorizationVerified: mode === 'live' && passed,
    projectScopeIsolationVerified: mode === 'live' && passed,
    crossCompanyIsolationVerified: mode === 'live' && passed,
    generatedOpenApiVerified: mode === 'live' && passed,
    transactionRollbackVerified: mode === 'live' && passed,
    financeApWritesAdded: 0,
    changeOrderWritesAdded: 0,
    retentionReleaseRoutesAdded: 0,
    subcontractReadbackRoutesAdded: 0,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage15LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage15LiveAccepted,
    nextPass: passed
      ? 'Pass 263 - Module 11 React typed API, TanStack Query hooks and the reviewed Subcontractor register, subcontract workflow, commitment, application/certification and retention UI without inventing missing readback APIs.'
      : 'Repair the failed Pass-262 integration/security check before generating the Stage-16 React workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
