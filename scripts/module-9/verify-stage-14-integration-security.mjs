import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-9-evidence',
  mode === 'live' ? 'stage-14-integration-security-live.json' : 'stage-14-integration-security.json'
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
async function writeBlockedEvidence(reason, stage13LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 240,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status: 'BLOCKED',
    stage13LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-9:integration-security:gate:live before claiming Stage-14 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 9 integration/security gate mode must be static or live.');
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage13LiveAccepted) {
  await writeBlockedEvidence('STAGE_13_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-9-evidence/stage-14-http.json');
  const httpPrepared = httpEvidence?.pass === 239
    && [
      'STAGE_14_MODULE_9_HTTP_READY_FOR_PASS_240',
      'STAGE_14_MODULE_9_HTTP_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-9-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-9-http-regression', 'npm', ['run', 'module-9:http:gate']],
    ['module-9-static-contract', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-9-integration-test-syntax', 'node', ['--check', 'tests/integration/module-9-api.integration.test.mjs']],
    [
      'module-9-runtime-typescript-syntax',
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
        'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts',
        'apps/api/src/modules/purchase-orders/purchase-orders.service.ts',
        'apps/api/src/modules/purchase-orders/purchase-orders.routes.ts'
      ]
    ],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-9-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-9']]);
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
        ? 'STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241'
        : (stage13LiveAccepted
            ? 'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 240,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status,
    stage13LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-9-api.integration.test.mjs',
    coverage: [
      'PO register/create/detail/draft-edit runs through real Fastify, service, repository and PostgreSQL boundaries',
      'Module-22 submission and approval remain replay-safe before the owning PO issues',
      'approved issue creates Module-7 source-keyed commitments atomically with the PO state transition',
      'controlled revision updates commitment values and cancellation reduces remaining commitment to zero without deleting issuance history',
      'server-calculated totals, selected Module-8 Vendor/quotation authority and frozen Module-7 budget readiness remain authoritative',
      'missing permission, restricted Project scope, cross-Company access, closed Project and browser-owned fields are rejected',
      'database triggers protect quotation Vendor/Company/Project scope, PO item cost structure and revision creator Company scope',
      'audit/outbox records cover the five reviewed Purchase Order events while Finance journals and Inventory receipt writes remain absent',
      'generated OpenAPI exposes exactly eight reviewed Module-9 operations with bearer security and strict request authority',
      'direct-purchase, generic approve/delete, receipt, invoice, Finance posting and commitment-management routes remain absent'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    financePostingWritesAdded: 0,
    inventoryReceiptWritesAdded: 0,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage13LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage13LiveAccepted,
    nextPass: passed
      ? 'Pass 241 - Module 9 React Purchase Orders API, hooks, register/editor, approval timeline, preview, progress and commitment UI preparation.'
      : 'Repair the failed Pass-240 integration/security check before generating the Stage-14 React workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 integration/security evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
