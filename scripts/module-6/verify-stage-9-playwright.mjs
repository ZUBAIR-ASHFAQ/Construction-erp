import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-6-evidence',
  mode === 'live' ? 'stage-9-playwright-live.json' : 'stage-9-playwright.json'
);

/** Read one JSON evidence file and return null when the evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a blocked live Playwright record without starting browsers or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, module6LiveHandoffAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 187,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status: 'BLOCKED',
    module6LiveHandoffAccepted,
    reason,
    runtimeVerificationComplete: false,
    nextPass: 'Resolve the live prerequisite and rerun module-6:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 6 Playwright gate mode must be static or live.');
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;

if (mode === 'live' && !module6LiveHandoffAccepted) {
  await writeBlockedEvidence('STAGE_8_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_6_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_6_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['module-6-react-workflow', 'npm', ['run', 'module-6:react-workflow:gate']],
    ['module-6-playwright-contract', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-6-browser-syntax', 'node', ['--check', 'tests/e2e/module-6-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-6-browser-workflow', 'npm', ['run', 'test:e2e:module-6']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_188'
        : (module6LiveHandoffAccepted
            ? 'STAGE_9_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_9_PLAYWRIGHT_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-6-stage-9-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 187,
    stage: 9,
    module: '6 - WBS & Cost Codes',
    mode,
    status,
    module6LiveHandoffAccepted,
    browserFile: 'tests/e2e/module-6-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module 24A browser flow',
      'open the permission-aware WBS & Cost Codes workspace',
      'select one existing active Project through the Project register contract',
      'create one Company Cost Code using reviewed business fields only',
      'create root and child WBS nodes while level remains server-derived',
      'reject a browser-attempted WBS hierarchy cycle through the authoritative API',
      'replace the complete Project WBS, Cost Code and Cost Type mapping set',
      'run the reviewed bodyless freeze command without inventing durable freeze state',
      'verify Module 6 audit and reviewed outbox events are durable',
      'verify read-only controls stay hidden and a direct denied write still returns HTTP 403',
      'verify browser writes never send Company, actor, permission, Project scope or WBS level authority'
    ],
    unresolvedBrowserContract: [
      'Cost Type master CRUD remains absent because the reviewed API defines no Cost Type list/create route.',
      'Archive controls remain absent because the reviewed API defines no archive command.',
      'Persistent freeze status and reopen/revision controls remain absent because the reviewed contract defines no durable freeze-state or reopen API.'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && module6LiveHandoffAccepted,
    nextPass: passed && mode === 'live'
      ? 'Pass 188 - Module 6 Stage-9 operations, migration, concurrency and deployment-readiness verification.'
      : 'Run the live Playwright gate after genuine Stage-8 handoff; Pass 188 may be prepared but cannot claim live Stage-9 browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 6 Stage-9 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
