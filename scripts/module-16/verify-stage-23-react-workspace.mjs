import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-react.json');

/** Read one optional JSON evidence file and return null when it is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage22 = await readJson('module-17-evidence/stage-22-live.json');
const stage22LiveAccepted = stage22?.status === STAGE_22_ACCEPTED
  && stage22?.runtimeVerificationComplete === true;

const reactDataEvidence = await readJson('module-16-evidence/stage-23-react-data.json');
const reactDataPrepared = reactDataEvidence?.pass === 354
  && [
    'STAGE_23_MODULE_16_REACT_DATA_READY_FOR_PASS_355',
    'STAGE_23_MODULE_16_REACT_DATA_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'
  ].includes(reactDataEvidence?.status)
  && Array.isArray(reactDataEvidence?.checks)
  && reactDataEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-16-react-data-evidence',
  status: reactDataPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: reactDataPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-16-react-data-regression', 'npm', ['run', 'module-16:react-data:gate']],
  ['module-16-react-workspace-static-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-react-workspace-typescript-syntax',
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
      'apps/web/src/features/client-billing/api/client-billing-api.ts',
      'apps/web/src/features/client-billing/hooks/client-billing.ts',
      'apps/web/src/features/client-billing/components/client-billing-workspace.tsx',
      'apps/web/src/features/client-billing/pages/client-billing-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_REACT_WORKSPACE_READY_FOR_PASS_356'
      : 'STAGE_23_MODULE_16_REACT_WORKSPACE_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-react-workspace-evidence',
  generatedAt: new Date().toISOString(),
  pass: 355,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  reactDataPrepared,
  workspaceCoverage: [
    'permission-aware Client Billing navigation and Stage-23 workspace',
    'bounded Client Contract register with no invented Project, Client, status, billing-method or search filters',
    'Project and Client backed Contract create form using only reviewed business fields while Contract number, revised value and lifecycle remain server-owned',
    'Progress Claim creation plus complete DRAFT line worksheet replacement with optional BOQ Item UUID and exact decimal-string inputs',
    'server-owned cumulative valuation summary showing previous, current, gross, retention, deductions and certified values',
    'certification command accepts certifiedValue only while cumulative totals and Contract retention remain server-calculated',
    'Client Invoice issue uses only invoiceDate and dueDate and displays the immutable server-created receivable source snapshot',
    'Retention Ledger status and bodyless full-release command are shown without inventing partial release or payment mutations',
    'Stage-26 payment/AR state and Stage-27 approved-Change Contract target integration remain visibly deferred'
  ],
  intentionallyAbsent: [
    'No backend route, service, repository, Prisma model or migration is changed.',
    'No Contract detail/update/delete, Claim submit/detail, standalone Invoice, payment or generic CRUD browser operation is generated.',
    'No BOQ Item lookup endpoint is invented; the existing BOQ browser contract does not expose item-detail reads.',
    'No partial Retention release amount, Client payment state or AR settlement control is invented.',
    'No approved Change -> Client Contract target adapter is generated.',
    'No Stage-26 Client Invoice -> AR adapter is generated.',
    'No browser-owned Company, actor, Project authorization, numbering, revised Contract value, Claim header totals, retention/deduction totals, Invoice totals or finance posting state is introduced.'
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
  paymentMutationInvented: false,
  partialRetentionReleaseInvented: false,
  boqItemLookupInvented: false,
  financeArAdapterGenerated: false,
  approvedChangeContractAdapterGenerated: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 356 - Module 16 Playwright main Client Billing workflow and permission-negative browser verification.'
    : 'Repair the failed Pass-355 React workspace check before generating Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 React workspace evidence written to ${written}`);
if (!passed) process.exitCode = 1;
