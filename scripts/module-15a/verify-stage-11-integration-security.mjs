import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-15a-evidence',
  mode === 'live' ? 'stage-11-integration-security-live.json' : 'stage-11-integration-security.json'
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
async function writeBlockedEvidence(reason, stage10LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 207,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status: 'BLOCKED',
    stage10LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-15a:integration-security:gate:live before claiming Stage-11 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 15A integration/security gate mode must be static or live.');
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage10LiveAccepted) {
  await writeBlockedEvidence('STAGE_10_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-15a-evidence/stage-11-http.json');
  const httpPrepared = httpEvidence?.pass === 206
    && [
      'STAGE_11_MODULE_15A_HTTP_READY_FOR_PASS_207',
      'STAGE_11_MODULE_15A_HTTP_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-15a-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: httpPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-15a-http-regression', 'npm', ['run', 'module-15a:http:gate']],
    ['module-15a-static-contract', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-4b-static-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-15a-integration-test-syntax', 'node', ['--check', 'tests/integration/module-15a-api.integration.test.mjs']],
    ['finance-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.repository.ts']],
    ['finance-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.service.ts']],
    ['finance-routes-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.routes.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-15a-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-15a']]);
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
        ? 'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_208'
        : (stage10LiveAccepted
            ? 'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 207,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status,
    stage10LiveAccepted,
    integrationFile: 'tests/integration/module-15a-api.integration.test.mjs',
    coverage: [
      'authenticated Chart of Accounts listing remains Company isolated',
      'manual journals derive number and open period server-side and preserve decimal strings',
      'unbalanced drafts are allowed but cannot be posted',
      'posting is idempotent and emits journal.posted once',
      'reversal creates one opposite journal and keeps the original posted accounting history reportable',
      'trial balance includes POSTED and REVERSED source journals while respecting Project visibility',
      'period close is idempotent and blocks later normal posting through that period',
      'Project membership without Finance permission is rejected',
      'Company-wide journal lines require Company Finance authority',
      'foreign Company accounts, Projects, periods and cost structures cannot cross tenant boundaries',
      'inactive or cross-Project Module-6 posting mappings are rejected',
      'database triggers reject direct cross-Company and cross-Project Finance writes',
      'generated OpenAPI exposes only the six reviewed Stage-11 Finance Core operations',
      'browser authority fields and undocumented AP/AR/payment routes remain absent'
    ],
    runtimeFixes: [
      'Trial balance now includes REVERSED source journals together with POSTED journals so an immutable original posting and its reversal both remain in accounting history.'
    ],
    intentionallyAbsent: [
      'No AP invoice routes or persistence.',
      'No AR invoice routes or persistence.',
      'No payment or payment-allocation workflow.',
      'No Finance source-module adapters.',
      'No account CRUD or period setup/reopen API.',
      'No React Finance UI; that remains a later pass.'
    ],
    runtimeVerificationComplete: passed && mode === 'live' && stage10LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage10LiveAccepted,
    nextPass: passed
      ? 'Pass 208 - Module 15A React Finance Core API, hooks and workflow UI preparation.'
      : 'Repair the failed Pass-207 integration/security check before generating the Stage-11 React Finance workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 integration/security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
