import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const PLAYWRIGHT_VERIFIED = 'STAGE_10_MODULE_4B_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_199';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-4b-evidence',
  mode === 'live' ? 'stage-10-operations-live.json' : 'stage-10-operations.json'
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

/** Write blocked live evidence before migration, PostgreSQL, or concurrency checks can run. */
async function writeBlockedEvidence(reason, stage9LiveAccepted, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 199,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status: 'BLOCKED',
    stage9LiveAccepted,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-4b:operations:gate:live before claiming operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4B operations gate mode must be static or live.');
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const playwrightLive = await readJson('module-4b-evidence/stage-10-playwright-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage9LiveAccepted) {
  await writeBlockedEvidence('STAGE_9_LIVE_HANDOFF_REQUIRED', false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_10_MODULE_4B_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true);
  process.exitCode = 1;
} else {
  const playwrightStatic = await readJson('module-4b-evidence/stage-10-playwright.json');
  const playwrightPrepared = playwrightStatic?.pass === 198
    && [
      'STAGE_10_MODULE_4B_PLAYWRIGHT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING',
      'STAGE_10_MODULE_4B_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-4b-playwright-evidence',
    status: playwrightPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: playwrightPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-4b-playwright-regression', 'npm', ['run', 'module-4b:playwright:gate']],
    ['module-4b-operational-contract', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-4a-static-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-4b-integration-syntax', 'node', ['--check', 'tests/integration/module-4b-api.integration.test.mjs']],
    ['boq-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.service.ts']],
    ['boq-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/boq/boq.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-4b-operational-postgresql', 'npm', ['run', 'test:operations:module-4b']],
      ['module-4a-operational-regression', 'npm', ['run', 'test:operations:module-4a']]
    );
  }

  if (playwrightPrepared) {
    const liveEnvironment = { ...process.env, RUN_FOUNDATION_DB_TESTS: '1' };
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args, { env: mode === 'live' ? liveEnvironment : process.env });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = playwrightPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_10_MODULE_4B_OPERATIONS_VERIFIED_READY_FOR_PASS_200'
        : (stage9LiveAccepted
            ? 'STAGE_10_MODULE_4B_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_10_MODULE_4B_OPERATIONS_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 199,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status,
    stage9LiveAccepted,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent duplicate Project BOQ creation leaves one BOQ and one complete audit/outbox side-effect set',
      'concurrent whole-set mapped item replacement serializes on the BOQ/revision locks and never leaves a mixed item set',
      'Project-scoped BOQ register reads can use boqs_company_project_created_idx',
      'WBS mapping lookups can use boq_items_wbs_node_idx',
      'Cost Code mapping lookups can use boq_items_cost_code_idx'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 199 adds no migration because the Stage-10 foreign keys, trigger and indexes already support the reviewed workflow'
    ],
    rollbackCoverage: [
      'the losing duplicate BOQ create transaction leaves no extra audit or outbox rows',
      'concurrent mapping replacements each commit one complete set and cannot expose a mixed partial set'
    ],
    deploymentReadiness: [
      'full dependency-free regression remains green before live execution',
      'Module 4A operational verification remains a live regression because Stage 10 changes the same BOQ tables',
      'migration policy remains valid before clean and previous-schema live verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage9LiveAccepted && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage9LiveAccepted && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 200 - Module 4B final Stage-10 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-9 handoff and Pass-198 live browser verification; Pass 200 may be prepared but cannot claim Stage-10 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 operations evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
