import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-10-evidence',
  mode === 'live' ? 'stage-15-integration-security-live.json' : 'stage-15-integration-security.json'
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
async function writeBlockedEvidence(reason, stage14LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 251,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status: 'BLOCKED',
    stage14LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the Stage-14 live prerequisite, then rerun module-10:integration-security:gate:live before claiming Stage-15 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 10 integration/security gate mode must be static or live.');
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage14LiveAccepted) {
  await writeBlockedEvidence('STAGE_14_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-10-evidence/stage-15-http.json');
  const httpPrepared = httpEvidence?.pass === 250
    && [
      'STAGE_15_MODULE_10_HTTP_READY_FOR_PASS_251',
      'STAGE_15_MODULE_10_HTTP_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-10-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-10-http-regression', 'npm', ['run', 'module-10:http:gate']],
    ['module-10-static-contract', 'node', ['--test', 'tests/module-10-static.test.mjs']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-9-static-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-10-integration-test-syntax', 'node', ['--check', 'tests/integration/module-10-api.integration.test.mjs']],
    [
      'module-10-runtime-typescript-syntax',
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
        'apps/api/src/modules/inventory/inventory.repository.ts',
        'apps/api/src/modules/inventory/inventory.service.ts',
        'apps/api/src/modules/inventory/inventory.routes.ts',
        'apps/api/src/modules/inventory/index.ts'
      ]
    ],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-10-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-10']]);
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
        ? 'STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252'
        : (stage14LiveAccepted
            ? 'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 251,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status,
    stage14LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-10-api.integration.test.mjs',
    coverage: [
      'Item master and Project-authorized balance reads run through real Fastify, service, repository and PostgreSQL boundaries',
      'issued PO receipt updates Goods Receipt, append-only stock ledger, Inventory balance and PO received_qty atomically and replay-safely',
      'transfer conserves quantity and issue creates exactly one Module-7 source-derived actual cost using server-owned valuation',
      'supported Project issue return appends stock and a negative Module-7 actual correction without mutating history',
      'controlled adjustment records a signed append-only movement and reasoned audit/outbox history',
      'receipt quality split, unit compatibility, PO open quantity, available stock and closed Project state remain server-authoritative',
      'missing authentication/permission, restricted Project scope, cross-Company resources and browser-owned fields are rejected',
      'database constraints reject cross-Company balances and Project/warehouse mismatch while stock transactions remain append-only',
      'late outbox failures roll back receipt/PO/balance/numbering and issue/balance/job-cost/audit state without partial commits',
      'generated OpenAPI exposes exactly eight reviewed Inventory operations, bearer security and Idempotency-Key on five stock commands',
      'Warehouse CRUD, ledger/count/low-stock/valuation routes and Finance posting remain absent'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    reviewedRouteCount: 8,
    reviewedPermissionCount: 6,
    reviewedEventCount: 5,
    stockCommandIdempotencyVerified: mode === 'live' && passed,
    poReceiptAtomicityVerified: mode === 'live' && passed,
    module7IssueAndReturnActualsVerified: mode === 'live' && passed,
    negativeAuthorizationVerified: mode === 'live' && passed,
    crossCompanyIsolationVerified: mode === 'live' && passed,
    generatedOpenApiVerified: mode === 'live' && passed,
    transactionRollbackVerified: mode === 'live' && passed,
    appendOnlyLedgerDatabaseProtectionVerified: mode === 'live' && passed,
    financePostingWritesAdded: 0,
    warehouseCrudRoutesAdded: 0,
    stockLedgerReadRoutesAdded: 0,
    stockCountRoutesAdded: 0,
    lowStockRoutesAdded: 0,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage14LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage14LiveAccepted,
    nextPass: passed
      ? 'Pass 252 - Module 10 React Inventory typed API client, TanStack Query hooks and the reviewed Item/balance/receipt/transfer/issue/adjustment UI preparation without inventing missing Warehouse/ledger/low-stock APIs.'
      : 'Repair the failed Pass-251 integration/security check before generating the Stage-15 React workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
