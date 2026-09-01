import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-21-evidence',
  mode === 'live' ? 'stage-21-playwright-live.json' : 'stage-21-playwright.json'
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

/** Write one fail-honest blocked live record before starting browsers or resetting PostgreSQL. */
async function writeBlockedEvidence(reason, stage20LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 331,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status: 'BLOCKED',
    stage20LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-21:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 21 Playwright gate mode must be static or live.');
}

const stage20 = await readJson('module-14b-evidence/stage-20-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage20LiveAccepted) {
  await writeBlockedEvidence('STAGE_20_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_21_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_21_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-21-evidence/stage-21-react.json');
  const reactPrepared = reactEvidence?.pass === 330
    && [
      'STAGE_21_MODULE_21_REACT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING',
      'STAGE_21_MODULE_21_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-21-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-21-react-regression', 'npm', ['run', 'module-21:react:gate']],
    ['module-21-playwright-contract', 'node', ['--test', 'tests/module-21-static.test.mjs']],
    ['module-21-browser-syntax', 'node', ['--check', 'tests/e2e/module-21-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-21-browser-composition-typescript-syntax',
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
        'apps/web/src/features/scheduling/api/scheduling-api.ts',
        'apps/web/src/features/scheduling/hooks/scheduling.ts',
        'apps/web/src/features/scheduling/components/scheduling-workspace.tsx',
        'apps/web/src/features/scheduling/pages/scheduling-page.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx'
      ]
    ],
    ['module-21-integration-security-regression', 'npm', ['run', 'module-21:integration-security:gate']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-21-browser-workflow', 'npm', ['run', 'test:e2e:module-21']]);
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
        ? 'STAGE_21_MODULE_21_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_332'
        : (stage20LiveAccepted
            ? 'STAGE_21_MODULE_21_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_21_MODULE_21_PLAYWRIGHT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-21-module-21-project-scheduling-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 331,
    stage: 21,
    module: '21 - Project Scheduling',
    mode,
    status,
    stage20LiveAccepted,
    browserFile: 'tests/e2e/module-21-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open Project Scheduling through the existing permission-aware admin shell',
      'discover and select the Project through the maintained Module-5 Project register instead of inventing a Scheduling Project lookup',
      'create the one current Project Schedule with server-owned lifecycle and a reviewed data date',
      'create two Activities with planned dates, hierarchy and optional same-Project Module-6 WBS mapping',
      'replace the complete dependency graph with the guaranteed FS dependency type and whole nonnegative lag',
      'freeze one immutable baseline snapshot before later planning/progress changes',
      'edit reviewed Activity planning fields after baseline and verify baseline dates remain historical while current dates change',
      'append one exact-decimal progress update and verify current Activity progress plus append-only progress history',
      'verify the lightweight Gantt-style planned-date view and queryless source-bounded two-week look-ahead without CPM/P6 behavior',
      'inspect browser requests to prove all eight reviewed operations, Idempotency-Key on all six writes, bodyless baseline creation and no look-ahead query fields',
      'verify the browser never authors Company, actor, Project authorization, lifecycle, baseline numbering/snapshot, audit identity, Activity progress-through-PATCH or advanced scheduling fields',
      'verify Scheduling audit/outbox evidence and immutable baseline state against the disposable PostgreSQL database',
      'verify a schedule.read-only user sees maintained Schedule read surfaces, no manage/baseline/progress controls and HTTP 403 for direct Activity, baseline and progress writes'
    ],
    intentionallyAbsent: [
      'No Schedule or Activity delete/reopen route, baseline revision command or unsupported dependency type is added for Playwright convenience.',
      'No CPM, critical-path, float, resource-loading, resource-leveling, P6 parity or external scheduler synchronization behavior is introduced.',
      'No Change Order or Daily Site Report integration is pulled forward into Stage 21.',
      'Cross-Company, restricted cross-Project, invalid WBS, hierarchy cycle, dependency cycle and strict schema failures remain additionally covered by the Pass-328 PostgreSQL/Fastify integration-security suite.'
    ],
    productionRuntimeFilesChanged: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    newPermissions: 0,
    newBrowserFiles: 1,
    reviewedRouteCount: 8,
    reviewedWriteCount: 6,
    onlyGuaranteedDependencyType: 'FS',
    baselineBodyless: true,
    lookaheadQueryFields: 0,
    advancedCpmAdded: false,
    externalSchedulerSyncAdded: false,
    changeOrderIntegrationAdded: false,
    dailyReportIntegrationAdded: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage20LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage20LiveAccepted,
    nextPass: passed
      ? 'Pass 332 - Module 21 PostgreSQL migration, concurrency, idempotency, audit/outbox and operational verification.'
      : 'Repair the failed Pass-331 Playwright check before preparing Stage-21 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 21 Stage-21 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
