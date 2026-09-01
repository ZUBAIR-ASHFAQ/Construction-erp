import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const INTEGRATION_VERIFIED = 'STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241';
const PLAYWRIGHT_VERIFIED = 'STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-9-evidence',
  mode === 'live' ? 'stage-14-operations-live.json' : 'stage-14-operations.json'
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

/** Write fail-honest blocked evidence before migration, PostgreSQL concurrency or rollback work can start. */
async function writeBlockedEvidence(reason, stage13LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 243,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status: 'BLOCKED',
    stage13LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-9:operations:gate:live before claiming Stage-14 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 9 operations gate mode must be static or live.');
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const integrationLive = await readJson('module-9-evidence/stage-14-integration-security-live.json');
const playwrightLive = await readJson('module-9-evidence/stage-14-playwright-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage13LiveAccepted) {
  await writeBlockedEvidence('STAGE_13_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_14_MODULE_9_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_14_MODULE_9_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-9-evidence/stage-14-integration-security.json');
  const playwrightStatic = await readJson('module-9-evidence/stage-14-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 240
    && [
      'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING',
      'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 242
    && [
      'STAGE_14_MODULE_9_PLAYWRIGHT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING',
      'STAGE_14_MODULE_9_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-9-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-9-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];

  const steps = [
    ['module-9-playwright-regression', 'npm', ['run', 'module-9:playwright:gate']],
    ['module-9-operational-contract', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-9-integration-syntax', 'node', ['--check', 'tests/integration/module-9-api.integration.test.mjs']],
    ['module-9-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/purchase-orders/purchase-orders.service.ts']],
    ['module-9-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/purchase-orders/purchase-orders.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-9-operational-postgresql', 'npm', ['run', 'test:operations:module-9']]
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
        ? 'STAGE_14_MODULE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_244'
        : (stage13LiveAccepted
            ? 'STAGE_14_MODULE_9_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_14_MODULE_9_OPERATIONS_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 243,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status,
    stage13LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent quotation-backed draft creation serializes on the Company-owned Project row while Foundation numbering allocates unique monotonic PO numbers',
      'duplicate concurrent issue retries serialize through reviewed Project/PO locks and create one issued transition, one audit/outbox event and one Module-7 source-keyed commitment set',
      'concurrent controlled header revisions serialize on the Purchase Order and allocate unique monotonic revision numbers without changing downstream line identities',
      'duplicate concurrent cancellation retries preserve historical issuance and reduce every current Module-7 PO commitment remaining amount to zero exactly once',
      'forced outbox failures after issue, revision and cancellation writes prove transaction rollback removes partial PO state, commitment, revision and audit mutations',
      'reviewed Purchase Order register/vendor/detail-item/revision and Module-7 source-key read shapes have supporting Stage-14 indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 243 adds no migration because Pass 235 owns the complete reviewed Module-9 persistence change'
    ],
    rollbackCoverage: [
      'forced purchase_order.issued outbox failure rolls back owner status synchronization, issued state, Module-7 commitments and issue audit state',
      'forced purchase_order.revised outbox failure rolls back edited commercial header, revision row and revision audit state',
      'forced purchase_order.cancelled outbox failure rolls back cancellation status plus remaining-commitment reduction and cancellation audit state'
    ],
    deploymentReadiness: [
      'the complete dependency-free static regression remains green before live execution',
      'Stage-13 acceptance plus Module-9 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financeWritesAdded: 0,
    inventoryWritesAdded: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage13LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage13LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 244 - Module 9 final Stage-14 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-13, Pass-240 integration/security and Pass-242 browser handoffs; Pass 244 may be prepared statically but cannot claim live Stage-14 acceptance before that chain passes.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 operations evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
