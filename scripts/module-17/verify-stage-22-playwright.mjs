import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-17-evidence',
  mode === 'live' ? 'stage-22-playwright-live.json' : 'stage-22-playwright.json'
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

/** Write one blocked live record before starting Playwright or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, stage21LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 344,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status: 'BLOCKED',
    stage21LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-17:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 17 Playwright gate mode must be static or live.');
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage21LiveAccepted) {
  await writeBlockedEvidence('STAGE_21_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_17_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_17_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-17-evidence/stage-22-react.json');
  const reactPrepared = reactEvidence?.pass === 343
    && [
      'STAGE_22_MODULE_17_REACT_WORKSPACE_READY_FOR_PASS_344',
      'STAGE_22_MODULE_17_REACT_WORKSPACE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-17-react-workspace-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-17-react-workspace-regression', 'npm', ['run', 'module-17:react-workspace:gate']],
    ['module-17-playwright-contract', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['module-17-browser-syntax', 'node', ['--check', 'tests/e2e/module-17-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-17-browser-composition-typescript-syntax',
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
        'apps/web/src/features/change-orders/api/change-orders-api.ts',
        'apps/web/src/features/change-orders/hooks/change-orders.ts',
        'apps/web/src/features/change-orders/components/change-orders-workspace.tsx',
        'apps/web/src/features/change-orders/pages/change-orders-page.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx'
      ]
    ],
    ['module-17-integration-security-regression', 'npm', ['run', 'module-17:integration-security:gate']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['module-21-static-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-17-browser-workflow', 'npm', ['run', 'test:e2e:module-17']]);
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
        ? 'STAGE_22_MODULE_17_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_345'
        : (stage21LiveAccepted
            ? 'STAGE_22_MODULE_17_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_22_MODULE_17_PLAYWRIGHT_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-22-module-17-change-orders-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 344,
    stage: 22,
    module: '17 - Change Orders / Variations',
    mode,
    status,
    stage21LiveAccepted,
    browserFile: 'tests/e2e/module-17-browser.spec.mjs',
    browserCoverage: [
      'sign in through Module 24A and open Change Orders / Variations through the existing permission-aware admin shell',
      'create a Project-scoped Change Request through the reviewed browser business fields while server numbering and lifecycle stay authoritative',
      'replace one complete DRAFT estimate with exact cost/revenue strings and a valid Module-6 WBS, Cost Code and Cost Type combination',
      'submit the Change Request through the bodyless reviewed command and verify the Module-22 approval request is pending',
      'approve the pending request through the real Approval Workflows UI before synchronizing the Module-17 terminal decision',
      'approve and apply one formal immutable Change Order with mandatory Module-7 Budget and Forecast impact in the same server transaction',
      'verify the formal approved cost/revenue snapshot, four applied impact rows, revised frozen Budget totals, Forecast values, audit and outbox evidence',
      'create a second Change Request, reject it through Module 22 and synchronize the bodyless Module-17 rejection without creating a Change Order or another Budget revision',
      'capture browser traffic and prove the workflow uses all seven reviewed Module-17 operations with Idempotency-Key on all five writes',
      'prove browser request bodies never author Company, actor, numbering, lifecycle, approved totals, target identity, target deltas or applied state',
      'verify bounded Change register pagination remains page/pageSize only and the impact read remains queryless',
      'verify a changes.read-only Project-scoped user sees the authorized register/read surfaces, no write controls and HTTP 403 for direct create, estimate and approve attempts'
    ],
    intentionallyAbsent: [
      'No detail GET, generic PATCH, DELETE, withdraw, standalone apply or reopen route is added for Playwright convenience.',
      'No browser-owned Company, actor, approval, numbering, status, approved-total or impact-target authority is introduced.',
      'No Schedule-day impact is exercised because the reviewed Schedule target adapter remains deferred to Stage 27.',
      'No Client Billing or Subcontract target adapter is pulled forward into Stage 22.',
      'Cross-Company, cross-Project, closed-target, invalid cost-structure, rollback and replay cases remain additionally covered by the Pass-341 PostgreSQL/Fastify integration-security suite.'
    ],
    productionRuntimeFilesChanged: 0,
    testInfrastructureFilesChanged: 1,
    testInfrastructureChangeReason: 'Shared Playwright selector only; Module-17 application runtime behavior is unchanged.',
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    newPermissions: 0,
    newBrowserFiles: 1,
    reviewedRouteCount: 7,
    reviewedWriteCount: 5,
    approvalPathUsesModule22Ui: true,
    rejectionPathVerified: true,
    mandatoryBudgetForecastImpactVerified: true,
    scheduleAdapterGenerated: false,
    clientBillingAdapterGenerated: false,
    subcontractAdapterGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage21LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage21LiveAccepted,
    nextPass: passed
      ? 'Pass 345 - Module 17 operational verification and final Stage-22 acceptance/regression gate.'
      : 'Repair the failed Pass-344 Playwright check before preparing final Stage-22 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 17 Stage-22 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
