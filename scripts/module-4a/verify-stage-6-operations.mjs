import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const VERIFIED_PLAYWRIGHT = 'STAGE_6_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_135';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('module-4a-evidence', mode === 'live' ? 'stage-6-operations-live.json' : 'stage-6-operations.json');

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a blocked live evidence record without running destructive migration or database checks. */
async function writeBlockedEvidence(reason, stage5LiveAccepted, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-operations-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '4A - BOQ Commercial Core',
    pass: 135,
    mode,
    stage5LiveAccepted,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    productionRuntimeChanges: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-4a:operations:gate:live before claiming operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 operational evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4A operational gate mode must be static or live.');
}

const stage5 = await readEvidence('module-3-evidence/stage-5-live.json');
const playwright = await readEvidence('module-4a-evidence/stage-6-playwright-live.json');
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;
const playwrightLiveVerified = playwright?.status === VERIFIED_PLAYWRIGHT;

if (mode === 'live' && !stage5LiveAccepted) {
  await writeBlockedEvidence('STAGE_5_LIVE_ACCEPTANCE_REQUIRED', false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_6_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, false);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-4a-playwright-contract', 'npm', ['run', 'module-4a:playwright:gate']],
    ['module-4a-operational-contract', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['module-4a-integration-syntax', 'node', ['--check', 'tests/integration/module-4a-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-4a-operational-postgresql', 'npm', ['run', 'test:operations:module-4a']]
    );
  }

  const liveEnvironment = { ...process.env, RUN_FOUNDATION_DB_TESTS: '1' };
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args, { env: mode === 'live' ? liveEnvironment : process.env });
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_6_OPERATIONS_VERIFIED_READY_FOR_PASS_136'
        : (stage5LiveAccepted
            ? 'STAGE_6_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_6_OPERATIONS_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-4a-stage-6-operations-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '4A - BOQ Commercial Core',
    pass: 135,
    mode,
    stage5LiveAccepted,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent revision creation keeps unique sequential revision numbers',
      'concurrent complete item replacement never leaves a mixed partial item set',
      'concurrent freeze retries create one audit record and one outbox event',
      'BOQ register query plan uses boqs_company_tender_created_idx',
      'revision lookup query plan uses boq_revisions_boq_status_revision_idx',
      'failed overflowing item replacement rolls back without partial writes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
    runtimeVerificationComplete: passed && mode === 'live' && stage5LiveAccepted && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 136 - Module 4A final Stage-6 acceptance gate.'
      : 'Run the guarded live operational gate after Stage-5 and Pass-134 live verification; Pass 136 may be prepared but cannot claim Stage-6 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4A Stage-6 operational evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
