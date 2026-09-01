import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-4b-evidence',
  mode === 'live' ? 'stage-10-playwright-live.json' : 'stage-10-playwright.json'
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

/** Write a blocked live record before starting browsers or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, stage9LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 198,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status: 'BLOCKED',
    stage9LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-4b:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 4B Playwright gate mode must be static or live.');
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage9LiveAccepted) {
  await writeBlockedEvidence('STAGE_9_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_4B_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_4B_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-4b-evidence/stage-10-react.json');
  const reactPrepared = reactEvidence?.pass === 197
    && [
      'STAGE_10_MODULE_4B_REACT_READY_FOR_PASS_198',
      'STAGE_10_MODULE_4B_REACT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING',
      'STAGE_10_MODULE_4B_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-4b-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: reactPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-4b-react-regression', 'npm', ['run', 'module-4b:react:gate']],
    ['module-4b-playwright-contract', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-4b-browser-syntax', 'node', ['--check', 'tests/e2e/module-4b-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-4b-browser-workflow', 'npm', ['run', 'test:e2e:module-4b']]);
  }

  if (reactPrepared) {
    for (const [name, command, args] of steps) {
      const result = await runStep(name, command, args);
      results.push(result);
      if (result.status !== 'passed') break;
    }
  }

  const passed = reactPrepared
    && results.length === steps.length + 1
    && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'STAGE_10_MODULE_4B_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_199'
        : (stage9LiveAccepted
            ? 'STAGE_10_MODULE_4B_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_10_MODULE_4B_PLAYWRIGHT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-10-module-4b-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 198,
    stage: 10,
    module: '4B - BOQ Project Mapping',
    businessModule: '4 - BOQ Management',
    mode,
    status,
    stage9LiveAccepted,
    browserFile: 'tests/e2e/module-4b-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module 24A browser flow',
      'create a Project-only BOQ through the existing POST /boqs operation',
      'create a DRAFT BOQ revision and map one item to the Project WBS and Company Cost Code',
      'verify server-calculated amount plus persisted WBS/Cost Code relationship readback',
      'freeze the mapped revision and verify the browser no longer exposes item editing',
      'create a tender-only BOQ and keep WBS/Cost Code mapping controls unavailable',
      'reuse the existing Project, Module 6 WBS and Cost Code read APIs instead of adding lookup routes',
      'verify browser writes never send Company, actor, permission, Cost Type or calculated amount authority',
      'verify a Project-scoped read-only user can read the authorized BOQ but cannot create/edit it',
      'verify a direct denied Project BOQ write returns HTTP 403'
    ],
    intentionallyAbsent: [
      'No new BOQ mapping route or Project-attachment command.',
      'No Cost Type relationship on BOQ items.',
      'No browser attempt to infer exact per-Project write permissions from the current auth response.',
      'No cross-session revision history because the reviewed Module-4 API defines no revision-history read operation.'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage9LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage9LiveAccepted,
    nextPass: passed
      ? 'Pass 199 - Module 4B operational, migration and concurrency verification.'
      : 'Repair the failed Pass-198 Playwright check before preparing Stage-10 operations verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 4B Stage-10 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
