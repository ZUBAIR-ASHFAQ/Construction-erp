import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const PLAYWRIGHT_VERIFIED = 'STAGE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_188';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-6-evidence',
  mode === 'live' ? 'stage-9-operations-live.json' : 'stage-9-operations.json'
);

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write blocked live evidence without touching the database or starting runtime verification. */
async function writeBlockedEvidence(reason, module6LiveHandoffAccepted, playwrightLiveVerified) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 188,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status: 'BLOCKED',
    module6LiveHandoffAccepted,
    playwrightLiveVerified,
    reason,
    runtimeVerificationComplete: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    nextPass: 'Resolve the live prerequisite and rerun module-6:operations:gate:live before claiming operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 operational evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 operational gate mode must be static or live.');
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const playwright = await readJson('module-6-evidence/stage-9-playwright-live.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;
const playwrightLiveVerified = playwright?.status === PLAYWRIGHT_VERIFIED
  && playwright?.runtimeVerificationComplete === true;

if (mode === 'live' && !module6LiveHandoffAccepted) {
  await writeBlockedEvidence('STAGE_8_LIVE_HANDOFF_REQUIRED', false, playwrightLiveVerified);
  process.exitCode = 1;
} else if (mode === 'live' && !playwrightLiveVerified) {
  await writeBlockedEvidence('STAGE_9_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED', true, false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true, true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-6-playwright-contract', 'npm', ['run', 'module-6:playwright:gate']],
    ['module-6-operational-contract', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['full-static-regression', 'npm', ['run', 'test:static']],
    ['module-6-integration-syntax', 'node', ['--check', 'tests/integration/module-6-api.integration.test.mjs']],
    ['module-6-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts']],
    ['module-6-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(
      ['clean-and-previous-migrations', 'npm', ['run', 'db:migrations:verify']],
      ['module-6-operational-postgresql', 'npm', ['run', 'test:operations:module-6']]
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
        ? 'STAGE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_189'
        : (module6LiveHandoffAccepted
            ? 'STAGE_9_OPERATIONS_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_9_OPERATIONS_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-operations-evidence',
    generatedAt: new Date().toISOString(),
    pass: 188,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status,
    module6LiveHandoffAccepted,
    playwrightLiveVerified,
    operationalCoverage: [
      'concurrent duplicate WBS creation leaves one node and one complete audit/outbox side-effect set',
      'concurrent duplicate Company Cost Code creation leaves one code and one complete audit/outbox side-effect set',
      'concurrent whole-set Project mapping replacement serializes on the Project row and never leaves mixed mapping state',
      'WBS Project/parent listing can use wbs_nodes_project_parent_sort_idx',
      'Project mapping listing can use project_cost_codes_combination_uq',
      'Company Cost Code listing can use cost_codes_company_code_uq'
    ],
    migrationCoverage: [
      'clean database migration deployment',
      'upgrade from immediately previous supported schema',
      'Module 6 introduces no Pass-188 migration because existing constraints and indexes already support the reviewed workflows'
    ],
    rollbackCoverage: [
      'losing duplicate WBS creation leaves no partial audit or outbox residue',
      'losing duplicate Cost Code creation leaves no partial audit or outbox residue',
      'whole-set mapping replacement commits one complete serialized set per successful request'
    ],
    deploymentReadiness: [
      'full dependency-free regression remains green before live execution',
      'service, repository and integration test syntax remain valid',
      'migration policy remains valid before clean/previous-schema live verification'
    ],
    unresolvedSourceContract: [
      'The reviewed freeze command still has no durable freeze-state field or reopen command, so Pass 188 does not claim concurrent freeze idempotency or persistent freeze enforcement.',
      'The reviewed API still has no Cost Type CRUD or archive command, so operational verification does not invent either workflow.'
    ],
    hardDurationThresholds: false,
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted && playwrightLiveVerified,
    nextPass: passed && mode === 'live'
      ? 'Pass 189 - Module 6 final Stage-9 acceptance gate.'
      : 'Run the guarded live operational gate after genuine Stage-8 handoff and Pass-187 live browser verification; Pass 189 may be prepared but cannot claim Stage-9 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 operational evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
