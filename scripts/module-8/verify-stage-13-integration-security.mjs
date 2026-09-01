import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-8-evidence',
  mode === 'live' ? 'stage-13-integration-security-live.json' : 'stage-13-integration-security.json'
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
async function writeBlockedEvidence(reason, stage12LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-procurement-rfq-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 229,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status: 'BLOCKED',
    stage12LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-8:integration-security:gate:live before claiming Stage-13 runtime verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 integration/security evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 8 integration/security gate mode must be static or live.');
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage12LiveAccepted) {
  await writeBlockedEvidence('STAGE_12_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const httpEvidence = await readJson('module-8-evidence/stage-13-http.json');
  const httpPrepared = httpEvidence?.pass === 228
    && [
      'STAGE_13_MODULE_8_HTTP_READY_FOR_PASS_229',
      'STAGE_13_MODULE_8_HTTP_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'
    ].includes(httpEvidence?.status)
    && Array.isArray(httpEvidence?.checks)
    && httpEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-8-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-8-http-regression', 'npm', ['run', 'module-8:http:gate']],
    ['module-8-static-contract', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-8-integration-test-syntax', 'node', ['--check', 'tests/integration/module-8-api.integration.test.mjs']],
    [
      'module-8-runtime-typescript-syntax',
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
        'apps/api/src/modules/procurement/procurement.repository.ts',
        'apps/api/src/modules/procurement/procurement.service.ts',
        'apps/api/src/modules/procurement/procurement.routes.ts'
      ]
    ],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-8-postgresql-fastify-openapi-security', 'npm', ['run', 'test:integration:module-8']]);
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
        ? 'STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230'
        : (stage12LiveAccepted
            ? 'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-procurement-rfq-integration-security-evidence',
    generatedAt: new Date().toISOString(),
    pass: 229,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status,
    stage12LiveAccepted,
    httpPrepared,
    integrationFile: 'tests/integration/module-8-api.integration.test.mjs',
    coverage: [
      'requisition list/create/submit runs through real Fastify, service, repository and PostgreSQL boundaries',
      'optional Module-22 requisition approval creates one replay-safe approval request when configured',
      'RFQ create/issue enforces frozen Module-7 budget readiness and ACTIVE + QUALIFIED same-Company Vendors',
      'supplier quotation totals are server-calculated with exact decimal responses and browser totals remain non-authoritative',
      'quotation comparison remains conservative, rejects unsupported cross-currency FX and preserves comparable item quantities',
      'non-lowest quotation selection can require documented rationale and remains pre-commitment',
      'audit/outbox rows are emitted atomically for the four reviewed procurement events with no cost commitment or Finance journal',
      'missing permission, restricted Project scope, closed Project, browser authority and cross-Company access are rejected',
      'database triggers protect requisition cost structure, RFQ/requisition Project scope, RFQ/Vendor Company scope and quotation invitation origin',
      'generated OpenAPI exposes exactly eight reviewed Module-8 operations with bearer security and strict request authority',
      'Vendor CRUD, RFQ-item CRUD, Purchase Order conversion, commitment writes and undocumented requisition revision routes remain absent; Pass 362 resolves RFQ-item identity through the existing RFQ route only'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicVendorMasterRoutesAdded: 0,
    financialCommitmentWritesAdded: 0,
    reactGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage12LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage12LiveAccepted,
    nextPass: passed
      ? 'Pass 230 - Module 8 React Procurement API, hooks, requisition/RFQ/quotation comparison and selection UI preparation.'
      : 'Repair the failed Pass-229 integration/security check before generating the Stage-13 React workflow.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 integration/security evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
