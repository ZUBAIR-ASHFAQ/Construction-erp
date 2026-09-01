import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-5-evidence',
  mode === 'live' ? 'stage-7-integration-live.json' : 'stage-7-integration.json'
);

/** Read genuine Module 4A live acceptance before any Stage-7 live integration work is allowed. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live evidence record without running destructive Project integration work. */
async function writeBlockedEvidence(reason, stage6LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-integration-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '5 - Project Management',
    pass: 143,
    mode,
    stage6LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-5:integration:gate:live before Pass 144.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 integration evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 5 integration gate mode must be static or live.');
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;

if (mode === 'live' && !stage6LiveAccepted) {
  await writeBlockedEvidence('STAGE_6_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-5-http', 'npm', ['run', 'module-5:http:gate']],
    ['module-5-integration-contract', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-5-integration-syntax', 'node', ['--check', 'tests/integration/module-5-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-5-postgresql-fastify-workflow', 'npm', ['run', 'test:integration:module-5']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_7_INTEGRATION_VERIFIED_READY_FOR_PASS_144'
        : (stage6LiveAccepted
            ? 'STAGE_7_INTEGRATION_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_7_INTEGRATION_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-integration-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '5 - Project Management',
    pass: 143,
    mode,
    stage6LiveAccepted,
    integrationFile: 'tests/integration/module-5-api.integration.test.mjs',
    workflow: [
      'create Project from active Client and won Tender',
      'list and get Project with initial lifecycle history',
      'update editable Project master data',
      'activate DRAFT Project',
      'complete ACTIVE Project',
      'close COMPLETED Project with reason',
      'prove lifecycle retries do not duplicate history/audit/outbox',
      'prove closed Project rejects normal master update',
      'prove one won Tender cannot create a second primary Project'
    ],
    persistenceEvidence: [
      'projects row',
      'append-only project_status_history rows',
      'Project audit rows',
      'exactly four approved Stage-7 Project outbox events'
    ],
    deferredToPass144: [
      'negative permission matrix',
      'cross-company HTTP/repository/service isolation',
      'direct PostgreSQL foreign-key/check/index attack tests'
    ],
    membershipDeferredToModule24B: true,
    runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 144 - Module 5 security, company isolation and database-integrity verification'
      : 'Run the live integration gate after genuine Stage-6 acceptance; Pass 144 may be prepared but cannot claim live Stage-7 verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 integration evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
