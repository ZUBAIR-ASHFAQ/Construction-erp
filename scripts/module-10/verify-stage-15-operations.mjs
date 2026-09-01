import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const INTEGRATION_VERIFIED = 'STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252';
const PLAYWRIGHT_VERIFIED = 'STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-10-evidence',
  mode === 'live' ? 'stage-15-operations-live.json' : 'stage-15-operations.json'
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
async function writeBlockedEvidence(reason, stage14LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 254,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status: 'BLOCKED',
    stage14LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financeWritesAdded: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-10:operations:gate:live before claiming Stage-15 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 10 operations gate mode must be static or live.');
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const integrationLive = await readJson('module-10-evidence/stage-15-integration-security-live.json');
const playwrightLive = await readJson('module-10-evidence/stage-15-playwright-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage14LiveAccepted) {
  await writeBlockedEvidence('STAGE_14_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_15_MODULE_10_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_15_MODULE_10_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-10-evidence/stage-15-integration-security.json');
  const playwrightStatic = await readJson('module-10-evidence/stage-15-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 251
    && [
      'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING',
      'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 253
    && [
      'STAGE_15_MODULE_10_PLAYWRIGHT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING',
      'STAGE_15_MODULE_10_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-10-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-10-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-10-playwright-regression', 'npm', ['run', 'module-10:playwright:gate']],
    ['module-10-operational-contract', 'node', ['--test', 'tests/module-10-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-10-integration-syntax', 'node', ['--check', 'tests/integration/module-10-api.integration.test.mjs']],
    ['module-10-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.service.ts']],
    ['module-10-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/inventory/inventory.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-10-operational-postgresql', 'npm', ['run', 'test:operations:module-10']]
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
        ? 'STAGE_15_MODULE_10_OPERATIONS_VERIFIED_READY_FOR_PASS_255'
        : (stage14LiveAccepted
            ? 'STAGE_15_MODULE_10_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_15_MODULE_10_OPERATIONS_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 254,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status,
    stage14LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent receipts against one PO line serialize on reviewed PO/line locks so open quantity cannot be over-received',
      'concurrent Project issues against one Warehouse/Item balance serialize on the stock-balance row so unavailable stock cannot become negative',
      'opposing Warehouse transfers lock both balances in deterministic Warehouse-ID order and conserve total quantity without deadlock-prone lock inversion',
      'receipt numbering stays rollback-safe because failed over-receipt transactions do not consume a Goods Receipt number',
      'Inventory balance quantity reconciles to the append-only stock ledger for the exercised receipt, issue and transfer movements',
      'Project issue actual cost remains source-keyed and one-to-one with the successful issue movement',
      'reviewed Item, Warehouse, Goods Receipt and Stock Transaction read shapes have supporting Stage-15 indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 254 adds no migration because Pass 246 owns the complete reviewed Module-10 persistence change'
    ],
    rollbackCoverage: [
      'Pass 251 already proves late inventory.received outbox failure rolls back Goods Receipt, stock ledger, balance, PO received_qty, audit and numbering',
      'Pass 251 already proves late inventory.issued outbox failure rolls back balance, stock ledger, Module-7 actual cost, audit and outbox state',
      'Pass 254 reuses those verified rollback fixtures and adds concurrency/reconciliation coverage without changing runtime behavior'
    ],
    deploymentReadiness: [
      'the complete dependency-free static regression remains green before live execution',
      'Stage-14 acceptance plus Module-10 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financeWritesAdded: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage14LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage14LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed
      ? 'Pass 255 - Module 10 final Stage-15 acceptance gate.'
      : 'Repair the failed Pass-254 operational check before preparing the final Stage-15 acceptance gate.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
