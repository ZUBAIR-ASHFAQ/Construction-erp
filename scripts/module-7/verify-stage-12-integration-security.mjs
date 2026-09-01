import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-7-evidence',
  mode === 'live' ? 'stage-12-integration-security-live.json' : 'stage-12-integration-security.json'
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
async function writeBlockedEvidence(reason, stage11LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 218,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status: 'BLOCKED',
    stage11LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-7:integration-security:gate:live before claiming Stage-12 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 7 integration/security gate mode must be static or live.');
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage11LiveAccepted) {
  await writeBlockedEvidence('STAGE_11_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-7-evidence/stage-12-http.json');
  const httpPrepared = httpEvidence?.pass === 217
    && [
      'STAGE_12_MODULE_7_HTTP_READY_FOR_PASS_218',
      'STAGE_12_MODULE_7_HTTP_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-7-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-7-http-regression', 'npm', ['run', 'module-7:http:gate']],
    ['module-7-static-contract', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-15a-static-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-7-integration-test-syntax', 'node', ['--check', 'tests/integration/module-7-api.integration.test.mjs']],
    ['module-7-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts']],
    ['module-7-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts']],
    ['module-7-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.routes.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-7-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-7']]);
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
        ? 'STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219'
        : (stage11LiveAccepted
            ? 'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 218,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status,
    stage11LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-7-api.integration.test.mjs',
    coverage: [
      'current-budget read returns only the latest frozen Project budget',
      'budget create, complete line replacement and freeze execute through the real Fastify/PostgreSQL chain',
      'budget totals, commitment totals, actual totals, ETC, EAC, variance, revenue and margin preserve exact decimal strings',
      'freeze retries are idempotent and budget.revised is emitted only when a later frozen version supersedes the previous current version',
      'forecast replacement accepts only authorized assumptions, calculates final values server-side and rejects closed Finance periods',
      'job-cost ledger exposes read-only source-derived commitments and actuals with bounded pagination',
      'audit and outbox rows are written for reviewed Module-7 commands while job_cost.source_posted remains absent',
      'Project-only permission, missing permission and cross-Company access are denied without trusting browser authority fields',
      'locked budget versions and inactive or cross-Project cost structures are rejected',
      'database triggers protect budget-line, source-cost and forecast Project scope',
      'source-derived commitment keys remain idempotent at the database boundary',
      'generated OpenAPI exposes the seven source operations plus the Pass-361 latest-DRAFT read with bearer security and strict request shapes',
      'configured budget freeze approval reuses Module 22 without custom Module-7 approval/reopen routes; source-ingestion/reconciliation routes remain absent'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    sourceIngestionRoutesAdded: 0,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage11LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage11LiveAccepted,
    nextPass: passed
      ? 'Pass 219 - Module 7 React Budgeting & Job Costing API, hooks and workflow UI preparation.'
      : 'Repair the failed Pass-218 integration/security check before generating the Stage-12 React workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 integration/security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
