import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const VERIFIED_PLAYWRIGHT = 'STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve('module-5-evidence', mode === 'live' ? 'stage-7-operations-live.json' : 'stage-7-operations.json');

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readEvidence(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write blocked live evidence without starting migration or PostgreSQL verification. */
async function writeBlockedEvidence(reason, stage6LiveAccepted, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-operations-evidence',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    module: '5 - Project Management',
    pass: 149,
    mode,
    stage6LiveAccepted,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    productionRuntimeChanges: 0,
    membershipDeferredToModule24B: true,
    nextPass: 'Resolve the live prerequisite and rerun module-5:operations:gate:live before claiming operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 operational evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 5 operational gate mode must be static or live.');
}

const stage6 = await readEvidence('module-4a-evidence/stage-6-live.json');
const playwright = await readEvidence('module-5-evidence/stage-7-playwright-live.json');
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;
const playwrightLiveVerified = playwright?.status === VERIFIED_PLAYWRIGHT;

if (mode === 'live' && !stage6LiveAccepted) {
  await writeBlockedEvidence('STAGE_6_LIVE_ACCEPTANCE_REQUIRED', false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_7_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, false);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-5-playwright-contract', 'npm', ['run', 'module-5:playwright:gate']],
    ['module-5-operational-contract', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-5-integration-syntax', 'node', ['--check', 'tests/integration/module-5-api.integration.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-5-operational-postgresql', 'npm', ['run', 'test:operations:module-5']]
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
        ? 'STAGE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_150'
        : (stage6LiveAccepted
            ? 'STAGE_7_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_7_OPERATIONS_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-5-stage-7-operations-evidence',
    generatedAt: new Date().toISOString(),
    status,
    module: '5 - Project Management',
    pass: 149,
    mode,
    stage6LiveAccepted,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent duplicate Project-code creation leaves one Project and one complete side-effect set',
      'concurrent one-primary-Project Tender conversion allows only one Project link',
      'concurrent activation retries create one lifecycle transition, audit record and outbox event',
      'concurrent completion retries create one lifecycle transition, audit record and outbox event',
      'concurrent close retries create one lifecycle transition, audit record and outbox event',
      'Project register query plan uses projects_company_status_planned_end_idx',
      'Project lifecycle-history query plan uses project_status_history_project_changed_idx'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema'
    ],
    rollbackCoverage: [
      'losing concurrent duplicate Project creation leaves no status-history, audit or outbox residue',
      'losing concurrent Tender conversion leaves no partial Project state'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    membershipDeferredToModule24B: true,
    runtimeVerificationComplete: passed && mode === 'live' && stage6LiveAccepted && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 150 - Module 5 final Stage-7 acceptance gate.'
      : 'Run the guarded live operational gate after Stage-6 and Pass-148 live verification; Pass 150 may be prepared but cannot claim Stage-7 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 5 Stage-7 operational evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
