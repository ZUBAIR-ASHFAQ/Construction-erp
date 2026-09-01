import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const INTEGRATION_VERIFIED = 'STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230';
const PLAYWRIGHT_VERIFIED = 'STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-8-evidence',
  mode === 'live' ? 'stage-13-operations-live.json' : 'stage-13-operations.json'
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

/** Write fail-honest blocked evidence before migration, PostgreSQL concurrency or query-plan work can start. */
async function writeBlockedEvidence(reason, stage12LiveAccepted, integrationLiveVerified, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 232,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status: 'BLOCKED',
    stage12LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-8:operations:gate:live before claiming Stage-13 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 operations evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 8 operations gate mode must be static or live.');
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const integrationLive = await readJson('module-8-evidence/stage-13-integration-security-live.json');
const playwrightLive = await readJson('module-8-evidence/stage-13-playwright-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const integrationLiveVerified = integrationLive?.status === INTEGRATION_VERIFIED
  && integrationLive?.runtimeVerificationComplete === true;
const playwrightLiveVerified = playwrightLive?.status === PLAYWRIGHT_VERIFIED
  && playwrightLive?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage12LiveAccepted) {
  await writeBlockedEvidence('STAGE_12_LIVE_HANDOFF_REQUIRED', false, integrationLiveVerified, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !integrationLiveVerified) {
  await writeBlockedEvidence('STAGE_13_MODULE_8_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED', true, false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_13_MODULE_8_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true, true);
  process.exitCode = 1;
} else {
  const integrationStatic = await readJson('module-8-evidence/stage-13-integration-security.json');
  const playwrightStatic = await readJson('module-8-evidence/stage-13-playwright.json');
  const integrationPrepared = integrationStatic?.pass === 229
    && [
      'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING',
      'STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN'
    ].includes(integrationStatic?.status)
    && Array.isArray(integrationStatic?.checks)
    && integrationStatic.checks.every((check) => check.status === 'passed');
  const playwrightPrepared = playwrightStatic?.pass === 231
    && [
      'STAGE_13_MODULE_8_PLAYWRIGHT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING',
      'STAGE_13_MODULE_8_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
    ].includes(playwrightStatic?.status)
    && Array.isArray(playwrightStatic?.checks)
    && playwrightStatic.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [
    {
      name: 'module-8-integration-security-evidence',
      status: integrationPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: integrationPrepared ? 0 : 1,
      signal: null
    },
    {
      name: 'module-8-playwright-evidence',
      status: playwrightPrepared ? 'passed' : 'failed',
      startedAt: now,
      finishedAt: now,
      code: playwrightPrepared ? 0 : 1,
      signal: null
    }
  ];
  const steps = [
    ['module-8-playwright-regression', 'npm', ['run', 'module-8:playwright:gate']],
    ['module-8-operational-contract', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-8-integration-syntax', 'node', ['--check', 'tests/integration/module-8-api.integration.test.mjs']],
    ['module-8-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/procurement/procurement.service.ts']],
    ['module-8-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/procurement/procurement.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-8-operational-postgresql', 'npm', ['run', 'test:operations:module-8']]
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
        ? 'STAGE_13_MODULE_8_OPERATIONS_VERIFIED_READY_FOR_PASS_233'
        : (stage12LiveAccepted
            ? 'STAGE_13_MODULE_8_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_13_MODULE_8_OPERATIONS_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-13-module-8-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 232,
    stage: 13,
    module: '8 - Procurement & RFQ',
    mode,
    status,
    stage12LiveAccepted,
    integrationLiveVerified,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent purchase-requisition creation serializes on the Company-owned Project row while Foundation numbering allocates unique monotonic PR numbers',
      'concurrent RFQ creation uses the same guarded Project/numbering boundary and produces unique monotonic RFQ numbers',
      'requisition submit, RFQ issue and quotation selection retries serialize through reviewed row locks and emit each reviewed audit/outbox transition once',
      'RFQ issue retry preserves one invitation row per requested Vendor and rejects no duplicate side effects',
      'quotation selection remains pre-commitment under retry and leaves Module-7 commitments plus Finance journals untouched',
      'invalid calculated quotation ranges leave no quotation, invitation-response, audit or outbox partial state',
      'a rejected non-lowest selection without required rationale leaves RFQ and quotation lifecycle state unchanged',
      'reviewed Vendor, requisition, RFQ, invitation, quotation and quotation-item read shapes have supporting Stage-13 indexes'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Pass 232 adds no migration because Pass 224 owns the complete reviewed Module-8 persistence change'
    ],
    rollbackCoverage: [
      'quotation range validation occurs inside the service transaction and no durable quotation or event state is left after rejection',
      'policy rejection before quotation selection leaves RFQ/quotation states and selection audit/outbox rows unchanged',
      'retry-safe requisition submission, RFQ issue and quotation selection do not duplicate their reviewed outbox events'
    ],
    deploymentReadiness: [
      'the complete dependency-free static regression remains green before live execution',
      'Stage-12 acceptance plus Module-8 integration/security and Playwright live handoffs must be genuine before operational live execution',
      'migration policy remains valid before clean and immediately-previous-schema verification'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicApiChanges: 0,
    financialCommitmentWritesAdded: 0,
    runtimeVerificationComplete: passed
      && mode === 'live'
      && stage12LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    runtimeDeploymentAllowed: passed
      && mode === 'live'
      && stage12LiveAccepted
      && integrationLiveVerified
      && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 233 - Module 8 final Stage-13 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-12, Pass-229 integration/security and Pass-231 browser handoffs; Pass 233 may be prepared statically but cannot claim live Stage-13 acceptance before that chain passes.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 8 Stage-13 operations evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
