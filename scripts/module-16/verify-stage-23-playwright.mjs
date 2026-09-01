import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-16-evidence',
  mode === 'live' ? 'stage-23-playwright-live.json' : 'stage-23-playwright.json'
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

/** Write one blocked live record before Playwright can reset or connect to PostgreSQL. */
async function writeBlockedEvidence(reason, stage22LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 356,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status: 'BLOCKED',
    stage22LiveAccepted,
    reason,
    runtimeVerificationComplete: false,
    runtimeDeploymentAllowed: false,
    nextPass: 'Resolve the live prerequisite and rerun module-16:playwright:gate:live before claiming browser verification.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 Playwright evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 16 Playwright gate mode must be static or live.');
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;

if (mode === 'live' && !stage22LiveAccepted) {
  await writeBlockedEvidence('STAGE_22_LIVE_HANDOFF_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_MODULE_16_E2E !== '1') {
  await writeBlockedEvidence('RUN_MODULE_16_E2E_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.RUN_FOUNDATION_DB_TESTS !== '1') {
  await writeBlockedEvidence('RUN_FOUNDATION_DB_TESTS_REQUIRED', true);
  process.exitCode = 1;
} else {
  const reactEvidence = await readJson('module-16-evidence/stage-23-react.json');
  const reactPrepared = reactEvidence?.pass === 355
    && [
      'STAGE_23_MODULE_16_REACT_WORKSPACE_READY_FOR_PASS_356',
      'STAGE_23_MODULE_16_REACT_WORKSPACE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'
    ].includes(reactEvidence?.status)
    && Array.isArray(reactEvidence?.checks)
    && reactEvidence.checks.every((check) => check.status === 'passed');

  const now = new Date().toISOString();
  const results = [{
    name: 'module-16-react-workspace-evidence',
    status: reactPrepared ? 'passed' : 'failed',
    startedAt: now,
    finishedAt: now,
    code: reactPrepared ? 0 : 1,
    signal: null
  }];

  const steps = [
    ['module-16-react-workspace-regression', 'npm', ['run', 'module-16:react-workspace:gate']],
    ['module-16-playwright-contract', 'node', ['--test', 'tests/module-16-static.test.mjs']],
    ['module-16-browser-syntax', 'node', ['--check', 'tests/e2e/module-16-browser.spec.mjs']],
    ['playwright-config-syntax', 'node', ['--check', 'playwright.config.mjs']],
    [
      'module-16-browser-composition-typescript-syntax',
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
        'apps/web/src/features/client-billing/api/client-billing-api.ts',
        'apps/web/src/features/client-billing/hooks/client-billing.ts',
        'apps/web/src/features/client-billing/components/client-billing-workspace.tsx',
        'apps/web/src/features/client-billing/pages/client-billing-page.tsx',
        'apps/web/src/features/administration/components/admin-shell.tsx'
      ]
    ],
    ['module-16-integration-security-regression', 'npm', ['run', 'module-16:integration-security:gate']],
    ['module-2-static-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
    ['module-4b-static-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
    ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
    ['module-15a-static-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
    ['module-17-static-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
    ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['module-16-browser-workflow', 'npm', ['run', 'test:e2e:module-16']]);
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
        ? 'STAGE_23_MODULE_16_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_357'
        : (stage22LiveAccepted
            ? 'STAGE_23_MODULE_16_PLAYWRIGHT_PREPARED_FOR_LIVE_RUN'
            : 'STAGE_23_MODULE_16_PLAYWRIGHT_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'))
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-stage-23-module-16-client-billing-playwright-evidence',
    generatedAt: new Date().toISOString(),
    pass: 356,
    stage: 23,
    module: '16 - Client Billing',
    mode,
    status,
    stage22LiveAccepted,
    browserFile: 'tests/e2e/module-16-browser.spec.mjs',
    browserCoverage: [
      'sign in through Module 24A and open Client Billing through the existing permission-aware admin shell',
      'create one Project/Client-scoped Contract through reviewed browser fields while Contract numbering, revised value and lifecycle stay server-owned',
      'create one Progress Claim and replace its complete DRAFT worksheet with one Project BOQ-backed exact-decimal line',
      'certify the Claim using certifiedValue only and verify previous/current/gross, retention, deductions and certified totals are server-calculated',
      'issue one Client Invoice using invoiceDate/dueDate only and verify immutable gross, retention, tax and total-receivable readback',
      'verify one HELD Retention Ledger row and release its complete balance through the reviewed bodyless command',
      'verify Client Billing audit/outbox workflow evidence plus the stable client-invoice:<id> Stage-26 AR source key',
      'capture browser traffic and prove all seven reviewed Module-16 operations are used with Idempotency-Key on all six writes',
      'prove browser request bodies never author Company, actor, numbering, revised value, lifecycle, Claim totals, Invoice totals, release totals or Finance posting authority',
      'verify the Contract register remains page/pageSize-only and no browser-only filter/query surface is introduced',
      'verify a Project-scoped client_billing.read-only user sees authorized billing history, no mutation controls and HTTP 403 for all six reviewed write commands'
    ],
    intentionallyAbsent: [
      'No Contract detail/update/delete, Claim submit/detail, standalone Invoice, payment, AR or generic CRUD route is added for Playwright convenience.',
      'No browser-owned Company, actor, Project authorization, numbering, revised Contract value, cumulative Claim totals, retention/deduction totals, Invoice totals or Finance posting state is introduced.',
      'No partial Retention release payload is introduced; the reviewed command remains bodyless full release.',
      'No BOQ Item lookup endpoint is invented; the workflow uses one already-known Project BOQ Item UUID from the seeded reviewed source.',
      'No Stage-26 Client Invoice to AR adapter is generated.',
      'No approved Change to Client Contract target adapter is generated before its reviewed integration completion proof.',
      'Cross-Company, cross-Project, cumulative-history, duplicate-Invoice, rollback and direct-PostgreSQL mutation cases remain additionally covered by the Pass-353 integration-security suite.'
    ],
    productionRuntimeFilesChanged: 0,
    testInfrastructureFilesChanged: 1,
    testInfrastructureChangeReason: 'Shared Playwright selector only; Module-16 application runtime behavior is unchanged.',
    databaseChanges: 0,
    newMigrations: 0,
    publicRoutesAdded: 0,
    newPermissions: 0,
    newBrowserFiles: 1,
    reviewedRouteCount: 7,
    reviewedWriteCount: 6,
    mainWorkflowIncludesRetentionRelease: true,
    negativePermissionWritesVerified: 6,
    paymentMutationInvented: false,
    partialRetentionReleaseInvented: false,
    financeArAdapterGenerated: false,
    approvedChangeContractAdapterGenerated: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage22LiveAccepted,
    runtimeDeploymentAllowed: passed && mode === 'live' && stage22LiveAccepted,
    nextPass: passed
      ? 'Pass 357 - Module 16 operational verification and final Stage-23 acceptance/regression gate.'
      : 'Repair the failed Pass-356 Playwright check before preparing final Stage-23 acceptance.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 16 Stage-23 Playwright evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
