import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-15a-evidence',
  mode === 'live' ? 'stage-11-playwright-live.json' : 'stage-11-playwright.json'
);

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write a truthful blocked live record before starting browsers or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, stage10LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 209,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status: 'BLOCKED',
    stage10LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-15a:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 15A Playwright gate mode must be static or live.');
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage10LiveAccepted) {
  await writeBlockedEvidence('STAGE_10_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_15A_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_15A_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-15a-evidence/stage-11-react.json');
  const reactPrepared = reactEvidence?.pass === 208
    && [
      'STAGE_11_MODULE_15A_REACT_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING',
      'STAGE_11_MODULE_15A_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-15a-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: reactPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-15a-react-regression', 'npm', ['run', 'module-15a:react:gate']],
    ['module-15a-playwright-contract', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-15a-browser-syntax', 'node', ['--check', 'tests/e2e/module-15a-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-15a-browser-workflow', 'npm', ['run', 'test:e2e:module-15a']]);
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
        ? 'STAGE_11_MODULE_15A_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_210'
        : (stage10LiveAccepted
            ? 'STAGE_11_MODULE_15A_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_11_MODULE_15A_PLAYWRIGHT_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-11-module-15a-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 209,
    stage: 11,
    module: '15A - Finance Core',
    businessModule: '15 - Finance & Accounting',
    mode,
    status,
    stage10LiveAccepted,
    browserFile: 'tests/e2e/module-15a-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module 24A browser flow and open the permission-aware Finance Core workspace',
      'read the Company Chart of Accounts through the reviewed bounded account route',
      'create one exact-decimal balanced manual DRAFT journal while period, number, status and totals remain server-owned',
      'post the journal through the reviewed bodyless command and verify the server readback',
      'run the period-scoped trial balance and verify exact debit/credit values',
      'reverse the posted journal through the reviewed bodyless command and preserve immutable accounting history',
      'close the fiscal period through the reviewed bodyless command',
      'verify Finance browser writes do not send Company, actor, permission, source, status or total authority',
      'verify a read/report-only Finance user does not receive journal or period-close controls and receives HTTP 403 on a direct journal create attempt',
      'verify the browser never calls deferred AP, AR or payment endpoints'
    ],
    intentionallyAbsent: [
      'No AP invoice, AR invoice, payment, allocation, aging or source-adapter browser workflow before Module 15B.',
      'No account setup workflow because the reviewed Stage-11 API has no account create/update command.',
      'No fiscal-period list/setup/reopen workflow because those operations are not defined.',
      'No journal register/detail workflow because the reviewed API has no journal list/detail route.',
      'Project-specific Finance authorization remains covered by the Pass-207 API integration/security suite; Pass 209 stays focused on browser behavior.'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage10LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage10LiveAccepted,
    nextPass: passed
      ? 'Pass 210 - Module 15A operational, migration and concurrency verification.'
      : 'Repair the failed Pass-209 Playwright check before preparing Stage-11 operations verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 15A Stage-11 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
