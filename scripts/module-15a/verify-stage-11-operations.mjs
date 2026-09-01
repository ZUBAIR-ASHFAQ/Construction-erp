import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const INTEGRATION_VERIFIED = 'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_208';
const PLAYWRIGHT_VERIFIED = 'STAGE_11_MODULE_15A_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_210';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-15a-evidence',
  mode === 'live' ? 'stage-11-operations-live.json' : 'stage-11-operations.json'
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

/** Write blocked live evidence before migrations, PostgreSQL concurrency checks, or deployment work can start. */
async function writeBlockedEvidence(reason, stage10LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 210,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status: 'BLOCKED',
    stage10LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-15a:operations:gate:live before claiming Stage-11 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 15A operations gate mode must be static or live.');
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const integrationLive = await readJson('module-15a-evidence/stage-11-integration-security-live.json');
const playwrightLive = await readJson('module-15a-evidence/stage-11-playwright-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage10LiveAccepted) {
  await writeBlockedEvidence('STAGE_10_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_11_MODULE_15A_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_11_MODULE_15A_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const playwrightStatic = await readJson('module-15a-evidence/stage-11-playwright.json');
  const playwrightPrepared = playwrightStatic?.pass === 209
    && [
      'STAGE_11_MODULE_15A_PLAYWRIGHT_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING',
      'STAGE_11_MODULE_15A_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-15a-playwright-evidence',
    status: playwrightPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: playwrightPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-15a-playwright-regression', 'npm', ['run', 'module-15a:playwright:gate']],
    ['module-15a-operational-contract', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-15a-integration-syntax', 'node', ['--check', 'tests/integration/module-15a-api.integration.test.mjs']],
    ['finance-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.service.ts']],
    ['finance-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/finance/finance.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-15a-operational-postgresql', 'npm', ['run', 'test:operations:module-15a']]
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
        ? 'STAGE_11_MODULE_15A_OPERATIONS_VERIFIED_READY_FOR_PASS_211'
        : (stage10LiveAccepted
            ? 'STAGE_11_MODULE_15A_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_11_MODULE_15A_OPERATIONS_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 210,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status,
    stage10LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent manual-journal creation serializes on the Foundation number sequence and produces unique Company journal numbers',
      'concurrent posting of one DRAFT journal produces one durable POSTED transition and one audit/outbox side-effect set',
      'concurrent reversal of one POSTED journal produces one opposite journal and one journal.reversed audit/outbox side-effect set',
      'period close and journal posting serialize through the fiscal-period row lock so posting either commits before close or fails without partial posting state',
      'a journal failure after number allocation rolls back the journal, line set and Foundation sequence allocation together',
      'Chart of Accounts, journal period/status, reversal-source and journal-line lookups can use reviewed Finance Core indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 210 adds no migration because Pass 202 already owns the complete reviewed Finance Core persistence change'
    ],
    rollbackCoverage: [
      'duplicate journal-number failure after Foundation number allocation leaves no partial journal or journal lines',
      'the failed transaction restores number_sequences.next_value because numbering and journal persistence share one database transaction',
      'a post losing the period-close race leaves no journal.posted audit or outbox row'
    ],
    deploymentReadiness: [
      'full dependency-free regression remains green before live execution',
      'Stage-11 integration/security and Playwright live verification must already be genuine before operational live execution',
      'migration policy remains valid before clean and previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage10LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage10LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 211 - Module 15A final Stage-11 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-10, Pass-207 integration/security and Pass-209 browser handoffs; Pass 211 may be prepared but cannot claim Stage-11 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 operations evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
