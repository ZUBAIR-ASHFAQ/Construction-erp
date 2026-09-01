import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-11-evidence',
  mode === 'live' ? 'stage-16-playwright-live.json' : 'stage-16-playwright.json'
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
async function writeBlockedEvidence(reason, stage15LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 264,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status: 'BLOCKED',
    stage15LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-11:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 11 Playwright gate mode must be static or live.');
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage15LiveAccepted) {
  await writeBlockedEvidence('STAGE_15_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_11_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_11_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-11-evidence/stage-16-react.json');
  const reactPrepared = reactEvidence?.pass === 263
    && [
      'STAGE_16_MODULE_11_REACT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING',
      'STAGE_16_MODULE_11_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-11-react-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-11-react-regression', 'npm', ['run', 'module-11:react:gate']],
    ['module-11-playwright-contract', 'node', ['--test', 'tests/module-11-static.test.mjs']],
    ['module-11-browser-syntax', 'node', ['--check', 'tests/e2e/module-11-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-11-browser-composition-typescript-syntax',
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
        'apps/web/src/features/subcontracts/components/subcontracts-workspace.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx'
      ]
    ],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
    ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
    ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
    ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-11-browser-workflow', 'npm', ['run', 'test:e2e:module-11']]);
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
        ? 'STAGE_16_MODULE_11_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_265'
        : (stage15LiveAccepted
            ? 'STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-16-module-11-subcontractor-management-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 264,
    stage: 16,
    module: '11 - Subcontractor Management',
    mode,
    status,
    stage15LiveAccepted,
    browserFile: 'tests/e2e/module-11-browser.spec.mjs',
    browserCoverage: [
      'sign in through the real Module-24A browser flow and open the permission-aware Subcontractor Management workspace',
      'create one subcontractor linked to the existing same-Company Module-8 Vendor master and verify the persistent register',
      'create one server-numbered Project-scoped DRAFT subcontract with one valid Module-6 cost-coded scope line and server-owned header totals',
      'exercise the reviewed DRAFT PATCH without changing Project identity or lifecycle authority',
      'attempt execution to create/replay the Module-22 approval request, approve it through the real Approval inbox, then execute the subcontract',
      'verify execution exposes one read-only Module-7 subcontract commitment without any browser-side commitment mutation',
      'create one server-numbered progress application, certify its full line value with server-calculated zero retention, and close the eligible final account',
      'verify execution/application/certification/close outbox events, audit-backed persistence, one Module-7 commitment and no Stage-16 Finance journal/cost-actual posting',
      'inspect browser requests to prove the exact eight-operation contract, Idempotency-Key on every write and absence of server-owned lifecycle/totals/approval/Finance state',
      'verify a read-only Module-11 user sees the register but no write controls and receives HTTP 403 on direct create/execute attempts'
    ],
    intentionallyAbsent: [
      'No subcontract list/detail GET, payment-application history GET or retention-ledger GET route is added for browser convenience.',
      'No submit/approve, variation/revision or retention-release Module-11 command is invented.',
      'No Vendor-list/write route is duplicated; Module 8 remains the supplier/vendor master owner.',
      'No Finance/AP/GL posting or Module-7 cost-actual posting is added; formal subcontract payable adapters remain deferred to Module 15B / Stage 26.',
      'Cross-Company database isolation, cumulative-overrun, immutable-certification and late-outbox rollback remain additionally covered by the Pass-262 PostgreSQL/Fastify integration-security suite.'
    ],
    productionRuntimeFilesChanged: 0,
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    newBrowserFiles: 1,
    runtimeVerificationComplete: passed && mode === 'live' && stage15LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage15LiveAccepted,
    nextPass: passed
      ? 'Pass 265 - Module 11 operational, migration and concurrency verification.'
      : 'Repair the failed Pass-264 Playwright check before preparing Stage-16 operational verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 11 Stage-16 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
