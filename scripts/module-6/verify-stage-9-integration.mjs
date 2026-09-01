import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-6-evidence',
  mode === 'live' ? 'stage-9-integration-live.json' : 'stage-9-integration.json'
);

/** Read one JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write blocked live evidence without starting destructive PostgreSQL integration work. */
async function writeBlockedEvidence(reason, module6LiveHandoffAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-integration-evidence',
    generatedAt: new Date().toISOString(),
    pass: 182,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status: 'BLOCKED',
    module6LiveHandoffAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite and rerun module-6:integration:gate:live before claiming Pass 182 live verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 integration evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 integration gate mode must be static or live.');
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;

const httpEvidence = await readJson('module-6-evidence/stage-9-http.json');
const httpPrepared = httpEvidence?.pass === 181
  && [
    'STAGE_9_HTTP_READY_FOR_PASS_182',
    'STAGE_9_HTTP_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'
  ].includes(httpEvidence?.status)
  && Array.isArray(httpEvidence?.checks)
  && httpEvidence.checks.every((check) => check.status === 'passed');

if (mode === 'live' && !module6LiveHandoffAccepted) {
  await writeBlockedEvidence('STAGE_8_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [{
    name: 'module-6-http-evidence',
    status: httpPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: httpPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-6-http', 'npm', ['run', 'module-6:http:gate']],
    ['module-6-integration-contract', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-6-integration-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-6-postgresql-fastify-workflow', 'npm', ['run', 'test:integration:module-6']]);
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
        ? 'STAGE_9_INTEGRATION_VERIFIED_READY_FOR_PASS_183'
        : (module6LiveHandoffAccepted
            ? 'STAGE_9_INTEGRATION_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_9_INTEGRATION_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-integration-evidence',
    generatedAt: new Date().toISOString(),
    pass: 182,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status,
    module6LiveHandoffAccepted,
    integrationFile: 'tests/integration/module-6-api.integration.test.mjs',
    workflowCoverage: [
      'read empty Project WBS',
      'create root, child and grandchild WBS nodes',
      'move a branch and preserve descendant hierarchy levels',
      'create and list Company Cost Codes',
      'replace and read back Project cost-code mappings',
      'freeze the reviewed Project cost-structure command',
      'verify audit and reviewed outbox events'
    ],
    negativeCoverage: [
      'duplicate sibling WBS code',
      'WBS hierarchy cycle',
      'cross-Project WBS mapping input',
      'inactive Cost Type mapping input',
      'replacement transaction rollback after database uniqueness failure',
      'invalid UUID',
      'client-owned authority fields',
      'missing Project permission',
      'foreign-company Project read hidden as not found'
    ],
    deferredToPass183: [
      'complete Module 6 permission matrix',
      'all cross-company repository/service attacks',
      'all cross-Project membership/resource-policy attacks',
      'direct database constraint attack matrix'
    ],
    runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 183 - Module 6 dedicated security and scope verification.'
      : 'Pass 183 may be prepared next, but Pass 182 live verification remains blocked until the genuine Stage-8 live handoff is available.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 integration evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
