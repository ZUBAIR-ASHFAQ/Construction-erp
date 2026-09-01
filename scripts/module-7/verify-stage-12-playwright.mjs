import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-7-evidence',
  mode === 'live' ? 'stage-12-playwright-live.json' : 'stage-12-playwright.json'
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
async function writeBlockedEvidence(reason, stage11LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 220,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status: 'BLOCKED',
    stage11LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-7:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 7 Playwright gate mode must be static or live.');
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage11LiveAccepted) {
  await writeBlockedEvidence('STAGE_11_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_7_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_7_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-7-evidence/stage-12-react.json');
  const reactPrepared = reactEvidence?.pass === 219
    && [
      'STAGE_12_MODULE_7_REACT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING',
      'STAGE_12_MODULE_7_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const results = [{
    name: 'module-7-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    code: reactPrepared ? 0 : 1,
    signal: null
  }];
  const steps = [
    ['module-7-react-regression', 'npm', ['run', 'module-7:react:gate']],
    ['module-7-playwright-contract', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-7-browser-syntax', 'node', ['--check', 'tests/e2e/module-7-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-7-browser-workflow', 'npm', ['run', 'test:e2e:module-7']]);
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
        ? 'STAGE_12_MODULE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_221'
        : (stage11LiveAccepted
            ? 'STAGE_12_MODULE_7_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_12_MODULE_7_PLAYWRIGHT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-12-module-7-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 220,
    stage: 12,
    module: '7 - Budgeting & Job Costing',
    mode,
    status,
    stage11LiveAccepted,
    browserFile: 'tests/e2e/module-7-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open the permission-aware Budgeting & Job Costing workspace',
      'select one authorized Project through the existing Project register read contract',
      'create one server-numbered DRAFT budget using budgetType only',
      'replace one complete exact-decimal budget line set using existing Module-6 WBS, Cost Code and Cost Type assignment IDs',
      'freeze the DRAFT through the reviewed bodyless command and read the current frozen budget',
      'read source-derived commitment and actual rows without browser write controls',
      'save dated ETC and forecast comments while final cost, revenue, EAC, variance and margin remain server-calculated',
      'open the cost-code drilldown and match source ledger rows through the existing Project cost structure',
      'verify Module-7 browser writes do not send Company, actor, Project scope, lifecycle, totals, calculated forecast or source-history authority',
      'verify a read-only Module-7 user does not receive create/forecast controls and receives HTTP 403 on direct write attempts'
    ],
    intentionallyAbsent: [
      'No commitment or actual create/update/delete browser workflow because those rows remain source-derived.',
      'No budget approval, reopen, reconciliation or generic CRUD browser workflow because those operations are not defined.',
      'No DRAFT reload-after-navigation workflow because the reviewed API has no draft list/detail route.',
      'No Cost Type master workflow because Module 6 does not define a Cost Type read/create endpoint.',
      'Project-scope and cross-Company security remain additionally covered by the Pass-218 API integration/security suite.'
    ],
    productionRuntimeChanges: 0,
    databaseChanges: 0,
    newMigrations: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage11LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage11LiveAccepted,
    nextPass: passed
      ? 'Pass 221 - Module 7 operational, migration and concurrency verification.'
      : 'Repair the failed Pass-220 Playwright check before preparing Stage-12 operations verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 7 Stage-12 Playwright evidence written to ${written}`);

  if (!passed) process.exitCode = 1;
}
