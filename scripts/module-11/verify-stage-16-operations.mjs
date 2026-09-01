import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const INTEGRATION_VERIFIED = 'STAGE_16_MODULE_11_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_263';
const PLAYWRIGHT_VERIFIED = 'STAGE_16_MODULE_11_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_265';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-11-evidence',
  mode === 'live' ? 'stage-16-operations-live.json' : 'stage-16-operations.json'
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

/** Write fail-honest blocked evidence before migrations, PostgreSQL locks or concurrency tests can start. */
async function writeBlockedEvidence(reason, stage15LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 265,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status: 'BLOCKED',
    stage15LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financeApWritesAdded: 0,
    changeOrderWritesAdded: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-11:operations:gate:live before claiming Stage-16 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 11 operations gate mode must be static or live.');
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const integrationLive = await readJson('module-11-evidence/stage-16-integration-security-live.json');
const playwrightLive = await readJson('module-11-evidence/stage-16-playwright-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage15LiveAccepted) {
  await writeBlockedEvidence('STAGE_15_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_16_MODULE_11_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_16_MODULE_11_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-11-evidence/stage-16-integration-security.json');
  const playwrightStatic = await readJson('module-11-evidence/stage-16-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 262
    && [
      'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING',
      'STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 264
    && [
      'STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING',
      'STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-11-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-11-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-11-playwright-regression', 'npm', ['run', 'module-11:playwright:gate']],
    ['module-11-operational-contract', 'node', ['--test', 'tests/module-11-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-11-integration-syntax', 'node', ['--check', 'tests/integration/module-11-api.integration.test.mjs']],
    ['module-11-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.service.ts']],
    ['module-11-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/subcontracts/subcontracts.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-11-operational-postgresql', 'npm', ['run', 'test:operations:module-11']]
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
        ? 'STAGE_16_MODULE_11_OPERATIONS_VERIFIED_READY_FOR_PASS_266'
        : (stage15LiveAccepted
            ? 'STAGE_16_MODULE_11_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_16_MODULE_11_OPERATIONS_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 265,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status,
    stage15LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent subcontract creation serializes on the Project and Foundation number sequence so unique monotonic subcontract numbers are allocated without duplicate Company/Project numbers',
      'concurrent duplicate execution retries serialize on the Project/subcontract locks and leave one EXECUTED transition, one audit/outbox event and one Module-7 commitment per subcontract source line',
      'failed progress-application outbox persistence rolls back the payment application, audit and company number allocation so the next successful application reuses the unconsumed number',
      'concurrent progress applications allocate unique application numbers and concurrent certifications serialize before cumulative validation',
      'two certifications that would cumulatively exceed the approved subcontract cannot both commit; one remains SUBMITTED and no Finance/AP or Module-7 actual-cost posting is created',
      'executed subcontract commitments reconcile to the server-owned revised subcontract value for the exercised source lines',
      'reviewed subcontractor, subcontract, payment-application, payment-line and Module-7 commitment read shapes have supporting Stage-16/Module-7 indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 265 adds no migration because Pass 257 owns the complete reviewed Module-11 persistence change'
    ],
    rollbackCoverage: [
      'Pass 262 already proves late subcontract.executed outbox failure rolls back lifecycle, Module-7 commitment and audit state',
      'Pass 262 already proves late subcontract.payment_certified outbox failure rolls back the certification snapshot and audit state',
      'Pass 265 additionally proves failed payment-application submission rolls back the application row, audit and Foundation number allocation'
    ],
    deploymentReadiness: [
      'the complete dependency-free static regression remains green before live execution',
      'Stage-15 acceptance plus Module-11 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financeApWritesAdded: 0,
    changeOrderWritesAdded: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage15LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage15LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed
      ? 'Pass 266 - Module 11 final Stage-16 acceptance gate.'
      : 'Repair the failed Pass-265 operational check before preparing the final Stage-16 acceptance gate.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
