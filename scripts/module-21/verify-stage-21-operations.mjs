import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const INTEGRATION_VERIFIED = 'STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329';
const PLAYWRIGHT_VERIFIED = 'STAGE_21_MODULE_21_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_332';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-21-evidence',
  mode === 'live' ? 'stage-21-operations-live.json' : 'stage-21-operations.json'
);

/** Read one optional JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write fail-honest blocked evidence before PostgreSQL operational checks can start. */
async function writeBlockedEvidence(reason, stage20LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 332,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status: 'BLOCKED',
    stage20LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    newPermissionsAdded: 0,
    advancedCpmAdded: false,
    externalSchedulerSyncAdded: false,
    changeOrderIntegrationAdded: false,
    dailyReportIntegrationAdded: false,
    nextPass: 'Resolve the live prerequisite and rerun module-21:operations:gate:live before claiming Stage-21 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 21 operations gate mode must be static or live.');
}

const stage20 = await readJson('module-14b-evidence/stage-20-live.json');
const integrationLive = await readJson('module-21-evidence/stage-21-integration-security-live.json');
const playwrightLive = await readJson('module-21-evidence/stage-21-playwright-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage20LiveAccepted) {
  await writeBlockedEvidence('STAGE_20_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_21_MODULE_21_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_21_MODULE_21_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-21-evidence/stage-21-integration-security.json');
  const playwrightStatic = await readJson('module-21-evidence/stage-21-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 328
    && [
      'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING',
      'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 331
    && [
      'STAGE_21_MODULE_21_PLAYWRIGHT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING',
      'STAGE_21_MODULE_21_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-21-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-21-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-21-playwright-regression', 'npm', ['run', 'module-21:playwright:gate']],
    ['module-21-operational-contract', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-21-integration-syntax', 'node', ['--check', 'tests/integration/module-21-api.integration.test.mjs']],
    [
      'module-21-runtime-typescript-syntax',
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
        'apps/api/src/modules/scheduling/scheduling.schema.ts',
        'apps/api/src/modules/scheduling/scheduling.repository.ts',
        'apps/api/src/modules/scheduling/scheduling.service.ts',
        'apps/api/src/modules/scheduling/scheduling.routes.ts',
        'apps/api/src/modules/scheduling/index.ts'
      ]
    ],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-21-operational-postgresql', 'npm', ['run', 'test:operations:module-21']]
    );
  }

  if (integrationPrepared && playwrightPrepared) {
    const liveEnvironment = { ...process.env, RUN_FOUNDATION_DB_TESTS: '1' };
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args, { env: mode === 'live' ? liveEnvironment : process.env });
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = integrationPrepared
    && playwrightPrepared
    && results.length === steps.length + 2
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_21_MODULE_21_OPERATIONS_VERIFIED_READY_FOR_PASS_333'
        : (stage20LiveAccepted
            ? 'STAGE_21_MODULE_21_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_21_MODULE_21_OPERATIONS_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 332,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status,
    stage20LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent same-key Schedule creation leaves one current Schedule, one audit/outbox result and one completed idempotency record while replay returns the original response',
      'different-key concurrent Schedule creation is serialized on the Project so exactly one current Schedule can commit',
      'concurrent baseline commands serialize on the current Schedule and allocate unique increasing server-owned baseline numbers',
      'concurrent same-key progress commands leave one append-only progress row, one current Activity update and one audit/outbox result',
      'concurrent direct dependency inserts serialize on the Schedule so a two-edge cycle cannot commit below the service layer',
      'Stage-21 PostgreSQL scope, dependency, percentage, actor and immutable-history constraints are exercised below the service layer',
      'a forced schedule.progress_updated outbox failure rolls back Activity progress, progress history, audit/outbox and idempotency state together',
      'Stage-21 Schedule, Activity, dependency, baseline and progress indexes are inspected directly without timing-based performance claims'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 332 adds no migration because Pass 323 owns the reviewed Stage-21 persistence change'
    ],
    rollbackCoverage: [
      'forced progress outbox failure proves current Activity state, append-only progress history, audit/outbox and idempotency share one rollback boundary',
      'same-key concurrent Schedule and progress commands prove durable replay protection without duplicate business state',
      'different-key Schedule creation and baseline commands prove Project/Schedule row locks remain the final race authority',
      'database-level dependency locking prevents concurrent direct inserts from bypassing cycle protection'
    ],
    deploymentReadiness: [
      'dependency-independent static regression remains green before live execution',
      'Stage-20 acceptance plus Module-21 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    newPermissionsAdded: 0,
    advancedCpmAdded: false,
    externalSchedulerSyncAdded: false,
    changeOrderIntegrationAdded: false,
    dailyReportIntegrationAdded: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage20LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage20LiveAccepted,
    nextPass: passed
      ? 'Pass 333 - Module 21 final Stage-21 acceptance and regression gate.'
      : 'Repair the failed Pass-332 operational check before final Stage-21 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
