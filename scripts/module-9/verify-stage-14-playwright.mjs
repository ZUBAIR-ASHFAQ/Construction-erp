import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-9-evidence',
  mode === 'live' ? 'stage-14-playwright-live.json' : 'stage-14-playwright.json'
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
async function writeBlockedEvidence(reason, stage13LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 242,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status: 'BLOCKED',
    stage13LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-9:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 9 Playwright gate mode must be static or live.');
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage13LiveAccepted) {
  await writeBlockedEvidence('STAGE_13_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_9_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_9_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-9-evidence/stage-14-react.json');
  const reactPrepared = reactEvidence?.pass === 241
    && [
      'STAGE_14_MODULE_9_REACT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING',
      'STAGE_14_MODULE_9_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-9-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-9-react-regression', 'npm', ['run', 'module-9:react:gate']],
    ['module-9-playwright-contract', 'node', ['--test', 'tests/module-9-static.test.mjs']],
    ['module-9-browser-syntax', 'node', ['--check', 'tests/e2e/module-9-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-9-browser-composition-typescript-syntax',
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
        'apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx'
      ]
    ],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-9-browser-workflow', 'npm', ['run', 'test:e2e:module-9']]);
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
        ? 'STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243'
        : (stage13LiveAccepted
            ? 'STAGE_14_MODULE_9_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_14_MODULE_9_PLAYWRIGHT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-14-module-9-purchase-orders-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 242,
    stage: 14,
    module: '9 - Purchase Orders',
    mode,
    status,
    stage13LiveAccepted,
    browserFile: 'tests/e2e/module-9-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open the permission-aware Purchase Orders workspace',
      'select one authorized Project and create one quotation-backed server-numbered draft PO using an active Module-6 cost structure',
      'verify server-calculated PO totals match the selected Module-8 quotation and browser requests never send numbering, lifecycle, totals or downstream consumption authority',
      'submit the PO through the reviewed bodyless command and verify the existing Module-22 approval timeline appears',
      'approve the same PO through the real Module-22 browser inbox rather than a fabricated PO approval endpoint',
      'refresh the owning PO approval state through the replay-safe existing submit command, then issue the approved PO',
      'verify issued PO state and read-only Module-7 commitment visibility from the existing job-cost ledger',
      'create one safe controlled header revision and verify immutable revision history',
      'cancel remaining commitment with a reason and verify historical issuance remains while Module-7 remaining commitment reaches zero',
      'verify a read-only Purchase Order user receives no create/submit/issue/revise/cancel controls and receives HTTP 403 on direct create/cancel attempts'
    ],
    repairedBrowserBlockers: [
      'production startup now reads and passes PURCHASE_ORDER_APPROVAL_DEFINITION_CODE into the existing Purchase Orders service composition',
      'PENDING_APPROVAL Purchase Orders expose a permission-aware Refresh approval status action that reuses the existing replay-safe submit command before issue',
      'a pre-existing Module-24B OpenAPI description string with an unescaped apostrophe is corrected because production API startup compilation is required by the browser workflow'
    ],
    intentionallyAbsent: [
      'No new Purchase Order public API route is added.',
      'No dedicated cancel permission is invented; cancellation continues to use purchase_orders.revise.',
      'No direct-purchase browser path is enabled while its permission/persistence contract remains unresolved.',
      'No Inventory receipt, supplier AP/invoice, Finance journal or direct Module-7 commitment mutation UI is added.',
      'Project-scope and cross-Company security remain additionally covered by the Pass-240 PostgreSQL/Fastify integration-security suite.'
    ],
    productionRuntimeFilesChanged: 4,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    runtimeVerificationComplete: passed && mode === 'live' && stage13LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage13LiveAccepted,
    nextPass: passed
      ? 'Pass 243 - Module 9 operational, migration and concurrency verification.'
      : 'Repair the failed Pass-242 Playwright check before preparing Stage-14 operations verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 9 Stage-14 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
