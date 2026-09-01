import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-react-data.json');

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

const integrationEvidence = await readJson('module-17-evidence/stage-22-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 341
  && [
    'STAGE_22_MODULE_17_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_342',
    'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_22_MODULE_17_INTEGRATION_SECURITY_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-17-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-17-integration-security-regression', 'npm', ['run', 'module-17:integration-security:gate']],
  ['module-17-react-data-static-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-react-data-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/web/src/features/change-orders/api/change-orders-api.ts',
      'apps/web/src/features/change-orders/hooks/change-orders.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (integrationPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = integrationPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_REACT_DATA_READY_FOR_PASS_343'
      : 'STAGE_22_MODULE_17_REACT_DATA_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-react-data-evidence',
  generatedAt: new Date().toISOString(),
  pass: 342,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  integrationPrepared,
  reactDataCoverage: [
    'typed browser API maps exactly to the seven reviewed Change Orders operations',
    'Change register query accepts only bounded page and pageSize fields',
    'all five Change Order writes send a browser-generated Idempotency-Key while Company, actor, Project scope, numbering, lifecycle, approval and impact authority remain server-owned',
    'Change Request, formal Change Order and applied-impact money values remain exact decimal strings in browser types',
    'submit and reject stay bodyless because the source defines no browser payload for either command',
    'approval sends only effectiveDate plus optional approvedDays and does not expose approved totals or impact targets',
    'TanStack Query owns Change register and applied-impact server state',
    'successful Change Request lifecycle mutations refresh the Change register and approval also refreshes the resulting Change Order impact query'
  ],
  intentionallyAbsent: [
    'No Change Orders component, page, navigation or CSS is generated in this data-layer pass.',
    'No generic Change Request detail, PATCH, DELETE, withdraw, apply or reopen browser operation is generated.',
    'No rejection reason payload is invented because the reviewed API defines reject as bodyless.',
    'No Schedule, Subcontract or Client Billing adapter is generated.',
    'No browser-owned Company, actor, permissions, Project authorization, status, numbering, approved totals, impact target or applied state is accepted.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicRoutesAdded: 0,
  newReactFiles: 2,
  reactComponentsAdded: 0,
  reactPagesAdded: 0,
  reviewedRouteCount: 7,
  reviewedWriteCount: 5,
  reviewedReadCount: 2,
  bodylessCommandCount: 2,
  listBrowserQueryFields: 2,
  exactDecimalBrowserTypes: true,
  scheduleAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 343 - Module 17 accessible permission-aware React Change Orders workspace using only the reviewed Stage-22 data layer.'
    : 'Repair the failed Pass-342 React data-layer check before generating the Change Orders workspace.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 React data evidence written to ${written}`);
if (!passed) process.exitCode = 1;
