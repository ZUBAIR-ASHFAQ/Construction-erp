import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-10-evidence',
  mode === 'live' ? 'stage-15-playwright-live.json' : 'stage-15-playwright.json'
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
async function writeBlockedEvidence(reason, stage14LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 253,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status: 'BLOCKED',
    stage14LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-10:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 10 Playwright gate mode must be static or live.');
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage14LiveAccepted) {
  await writeBlockedEvidence('STAGE_14_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_10_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_10_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-10-evidence/stage-15-react.json');
  const reactPrepared = reactEvidence?.pass === 252
    && [
      'STAGE_15_MODULE_10_REACT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING',
      'STAGE_15_MODULE_10_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-10-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-10-react-regression', 'npm', ['run', 'module-10:react:gate']],
    ['module-10-playwright-contract', 'node', ['--test', 'tests/module-10-static.test.mjs']],
    ['module-10-browser-syntax', 'node', ['--check', 'tests/e2e/module-10-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-10-browser-composition-typescript-syntax',
      'tsc',
      [
        '--noEmit',
        '--noCheck',
        '--jsx',
        'react-jsx',
        '--target',
        'ES2022',
        '--module',
        'NodeNext',
        '--moduleResolution',
        'NodeNext',
        'packages/config/src/server.ts',
        'apps/api/src/main.ts',
        'apps/web/src/features/inventory/components/inventory-workspace.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx'
      ]
    ],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-9-static-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-10-browser-workflow', 'npm', ['run', 'test:e2e:module-10']]);
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
        ? 'STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254'
        : (stage14LiveAccepted
            ? 'STAGE_15_MODULE_10_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_15_MODULE_10_PLAYWRIGHT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-15-module-10-inventory-materials-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 253,
    stage: 15,
    module: '10 - Inventory & Material Management',
    mode,
    status,
    stage14LiveAccepted,
    browserFile: 'tests/e2e/module-10-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open the permission-aware Inventory & Materials workspace',
      'create one Company Item through the reviewed POST /inventory/items boundary while lifecycle and Company ownership remain server-owned',
      'receive one issued PO line with accepted/rejected quantities and verify Goods Receipt, PO received quantity, stock balance and average cost persistence',
      'transfer stock atomically between an authorized Project Warehouse and Company-wide Warehouse and verify two ledger sides',
      'issue material to one Project/WBS/cost-code/cost-type combination and verify the append-only ISSUE plus one Module-7 actual-cost source',
      'return part of the prior ISSUE and verify the append-only RETURN plus negative Module-7 actual-cost correction',
      'post one reasoned signed Inventory-count adjustment and verify the resulting balance',
      'verify all five reviewed Inventory outbox events and matching audit actions while Finance journals remain untouched',
      'inspect browser requests to prove the exact eight-route contract, five Idempotency-Key headers and absence of server-owned state',
      'verify a restricted Project reader sees only its authorized Warehouse balance, receives no mutation controls, and receives HTTP 403 for direct item/issue writes'
    ],
    intentionallyAbsent: [
      'No Warehouse CRUD, Warehouse lookup, stock-ledger read, low-stock read, stock-count session, valuation configuration or unit-conversion route is added.',
      'No new return permission is invented; the UI continues to require the existing issue plus adjust convention.',
      'No Finance/AP/GL mutation is added or exercised by the Inventory browser workflow.',
      'Cross-Company database isolation, rollback and malformed-request cases remain additionally covered by the Pass-251 PostgreSQL/Fastify integration-security suite.'
    ],
    productionRuntimeFilesChanged: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    newBrowserFiles: 1,
    runtimeVerificationComplete: passed && mode === 'live' && stage14LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage14LiveAccepted,
    nextPass: passed
      ? 'Pass 254 - Module 10 operational, migration and concurrency verification.'
      : 'Repair the failed Pass-253 Playwright check before preparing Stage-15 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 10 Stage-15 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
