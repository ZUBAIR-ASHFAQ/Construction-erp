import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-react.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage21 = await readJson('module-21-evidence/stage-21-live.json');
const stage21LiveAccepted = stage21?.status === STAGE_21_ACCEPTED
  && stage21?.runtimeVerificationComplete === true;

const reactDataEvidence = await readJson('module-17-evidence/stage-22-react-data.json');
const reactDataPrepared = reactDataEvidence?.pass === 342
  && [
    'STAGE_22_MODULE_17_REACT_DATA_READY_FOR_PASS_343',
    'STAGE_22_MODULE_17_REACT_DATA_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'
  ].includes(reactDataEvidence?.status)
  && Array.isArray(reactDataEvidence?.checks)
  && reactDataEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-17-react-data-evidence',
  status: reactDataPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: reactDataPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-17-react-data-regression', 'npm', ['run', 'module-17:react-data:gate']],
  ['module-17-react-workspace-static-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-react-workspace-typescript-syntax',
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
      'apps/web/src/features/change-orders/api/change-orders-api.ts',
      'apps/web/src/features/change-orders/hooks/change-orders.ts',
      'apps/web/src/features/change-orders/components/change-orders-workspace.tsx',
      'apps/web/src/features/change-orders/pages/change-orders-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-18-regression', 'node', ['--test', 'tests/module-18-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (reactDataPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = reactDataPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_REACT_WORKSPACE_READY_FOR_PASS_344'
      : 'STAGE_22_MODULE_17_REACT_WORKSPACE_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-react-workspace-evidence',
  generatedAt: new Date().toISOString(),
  pass: 343,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  reactDataPrepared,
  workspaceCoverage: [
    'permission-aware Change Orders navigation and Stage-22 workspace',
    'bounded Change register with no invented search, status, Project or date filters',
    'Project-backed Change Request create form using only reviewed browser business fields',
    'DRAFT-only complete cost/revenue estimate-line replacement with exact decimal strings and optional WBS, Cost Code, Cost Type and BOQ item identifiers',
    'submit command plus compact lifecycle/approval-state display while detailed approver actions remain in Module 22',
    'approved/rejected decision synchronization with approval requiring changes.approve and changes.apply visibility',
    'supporting-document handoff to Module 18 without inventing a Module-17 attachment endpoint',
    'formal Change Order snapshot and server-created applied-impact summary',
    'Schedule-day input intentionally omitted because the reviewed Stage-27 Schedule target adapter is not generated'
  ],
  intentionallyAbsent: [
    'No new backend route, service, repository, Prisma model or migration is generated.',
    'No generic detail, PATCH, DELETE, withdraw, standalone apply or reopen browser operation is generated.',
    'No fake Module-22 approval timeline endpoint or Module-18 attachment mutation is generated.',
    'No Schedule, Subcontract or Client Billing target adapter is generated.',
    'No browser-owned Company, actor, numbering, lifecycle, approved total or target-application authority is introduced.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicRoutesAdded: 0,
  newReactFiles: 2,
  reactComponentsAdded: 1,
  reactPagesAdded: 1,
  navigationIntegrated: true,
  permissionAwareCommands: true,
  approvalTimelineInvented: false,
  attachmentMutationInvented: false,
  scheduleAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 344 - Module 17 Playwright main workflow and permission-negative browser verification.'
    : 'Repair the failed Pass-343 React workspace check before generating Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 React workspace evidence written to ${written}`);
if (!passed) process.exitCode = 1;
