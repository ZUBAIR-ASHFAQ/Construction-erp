import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const INTEGRATION_VERIFIED = 'STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219';
const PLAYWRIGHT_VERIFIED = 'STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-7-evidence',
  mode === 'live' ? 'stage-12-operations-live.json' : 'stage-12-operations.json'
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

/** Write fail-honest blocked evidence before destructive migration or PostgreSQL concurrency work can start. */
async function writeBlockedEvidence(reason, stage11LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 221,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status: 'BLOCKED',
    stage11LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-7:operations:gate:live before claiming Stage-12 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 7 operations gate mode must be static or live.');
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const integrationLive = await readJson('module-7-evidence/stage-12-integration-security-live.json');
const playwrightLive = await readJson('module-7-evidence/stage-12-playwright-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage11LiveAccepted) {
  await writeBlockedEvidence('STAGE_11_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_12_MODULE_7_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_12_MODULE_7_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-7-evidence/stage-12-integration-security.json');
  const playwrightStatic = await readJson('module-7-evidence/stage-12-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 218
    && [
      'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING',
      'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 220
    && [
      'STAGE_12_MODULE_7_PLAYWRIGHT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING',
      'STAGE_12_MODULE_7_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-7-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-7-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];
  const steps = [
    ['module-7-playwright-regression', 'npm', ['run', 'module-7:playwright:gate']],
    ['module-7-operational-contract', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-7-integration-syntax', 'node', ['--check', 'tests/integration/module-7-api.integration.test.mjs']],
    ['module-7-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts']],
    ['module-7-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-7-operational-postgresql', 'npm', ['run', 'test:operations:module-7']]
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
        ? 'STAGE_12_MODULE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_222'
        : (stage11LiveAccepted
            ? 'STAGE_12_MODULE_7_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_12_MODULE_7_OPERATIONS_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 221,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status,
    stage11LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent budget creation serializes on the Company-owned Project row and allocates unique monotonic Project version numbers',
      'concurrent freeze retries for one DRAFT budget produce one durable FROZEN transition and one budget.frozen audit/outbox side-effect set',
      'the highest-version FROZEN budget remains the single current approved Project read model while historical frozen versions remain immutable',
      'concurrent same-date forecast replacement serializes on the Project row and leaves one row per supplied budget line rather than duplicate snapshots',
      'scoped source-key unique indexes reject concurrent duplicate commitment and actual fixtures without adding source-ingestion APIs',
      'reviewed current-budget, budget-line, source-cost and forecast read paths have supporting Stage-12 indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 221 adds no migration because Pass 213 already owns the complete reviewed Module-7 persistence change'
    ],
    rollbackCoverage: [
      'a valid replace-all request whose aggregate total exceeds DECIMAL(18,2) rolls back inserted replacement lines and authoritative budget totals together',
      'the failed replacement does not create a second budget.lines_replaced audit record',
      'concurrent lifecycle retry does not duplicate budget.frozen audit/outbox rows'
    ],
    deploymentReadiness: [
      'the complete dependency-free static regression remains green before live execution',
      'Stage-11 acceptance plus Module-7 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage11LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage11LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 222 - Module 7 final Stage-12 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-11, Pass-218 integration/security and Pass-220 browser handoffs; Pass 222 may be prepared but cannot claim Stage-12 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 operations evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
