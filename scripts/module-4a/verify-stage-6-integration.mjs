import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('module-4a-evidence', mode === 'live' ? 'stage-6-integration-live.json' : 'stage-6-integration.json');

/** Read genuine Module 3 live acceptance before any Stage-6 live verification is allowed. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked live evidence record without running destructive integration work. */
async function writeBlockedEvidence(reason, stage5LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-integration-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '4A - BOQ Commercial Core',
    pass: 129,
    mode,
    stage5LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite, then rerun module-4a:integration:gate:live before Pass 130.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 integration evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A integration gate mode must be static or live.');
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;

if (mode === 'live' && !stage5LiveAccepted) {
  await writeBlockedEvidence('STAGE_5_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-4a-http', 'npm', ['run', 'module-4a:http:gate']],
    ['module-4a-integration-contract', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4a-integration-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-4a-postgresql-fastify-workflow', 'npm', ['run', 'test:integration:module-4a']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_6_INTEGRATION_VERIFIED_READY_FOR_PASS_130'
        : (stage5LiveAccepted
            ? 'STAGE_6_INTEGRATION_TESTS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_6_INTEGRATION_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-integration-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '4A - BOQ Commercial Core',
    pass: 129,
    mode,
    stage5LiveAccepted,
    integrationFile: 'tests/integration/module-4a-api.integration.test.mjs',
    workflow: [
      'create tender-linked BOQ',
      'create server-numbered revision',
      'replace hierarchical DRAFT item set',
      'verify exact server-calculated amounts',
      'freeze and set current revision',
      'verify retry-safe freeze and frozen immutability',
      'export authorized CSV',
      'preserve prior frozen revision when a later revision is created'
    ],
    persistenceEvidence: [
      'BOQ/revision/item rows',
      'same-revision item hierarchy',
      'audit rows',
      'exactly the three reviewed outbox events'
    ],
    deferredToPass130: [
      'negative RBAC matrix',
      'cross-company HTTP/repository/service isolation',
      'direct database constraint attack tests'
    ],
    deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
    runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 130 - Module 4A security, company isolation and database-integrity verification'
      : 'Run the live integration gate after genuine Stage-5 acceptance; Pass 130 may be prepared but cannot claim live Stage-6 verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 integration evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
