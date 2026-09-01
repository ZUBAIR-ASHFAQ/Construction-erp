import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_22_ACCEPTED = 'STAGE_22_ACCEPTED_READY_FOR_STAGE_23';
const evidencePath = path.resolve('module-16-evidence', 'stage-23-react-data.json');

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

const integrationEvidence = await readJson('module-16-evidence/stage-23-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 353
  && [
    'STAGE_23_MODULE_16_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_354',
    'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_23_MODULE_16_INTEGRATION_SECURITY_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-16-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-16-integration-security-regression', 'npm', ['run', 'module-16:integration-security:gate']],
  ['module-16-react-data-static-suite', 'node', ['--test', 'tests/module-16-static.test.mjs']],
  [
    'module-16-react-data-typescript-syntax',
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
      'apps/web/src/features/client-billing/api/client-billing-api.ts',
      'apps/web/src/features/client-billing/hooks/client-billing.ts'
    ]
  ],
  ['module-2-regression', 'node', ['--test', 'tests/module-2-static.test.mjs']],
  ['module-4b-regression', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-17-regression', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
  ? (stage22LiveAccepted
      ? 'STAGE_23_MODULE_16_REACT_DATA_READY_FOR_PASS_355'
      : 'STAGE_23_MODULE_16_REACT_DATA_PREPARED_STAGE_22_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-23-module-16-client-billing-react-data-evidence',
  generatedAt: new Date().toISOString(),
  pass: 354,
  stage: 23,
  module: '16 - Client Billing',
  status,
  stage22LiveAccepted,
  integrationPrepared,
  reactDataCoverage: [
    'typed browser API maps exactly to the seven reviewed Client Billing operations',
    'Client Contract register query accepts only bounded page and pageSize fields',
    'all six Client Billing writes send a browser-generated Idempotency-Key while Company, actor, Project scope, numbering, lifecycle, totals, retention policy and later AR state remain server-owned',
    'Contract, Claim, Claim-line, Invoice and Retention financial/quantity values remain exact decimal strings in browser types',
    'Retention release stays bodyless because the reviewed source defines no partial-release payload',
    'Claim lines stay one complete PUT replacement instead of browser-side line CRUD',
    'TanStack Query owns the aggregate Client Contract register server state',
    'successful Contract, Claim, certification, Invoice and Retention mutations invalidate only the Module-16 Contract register aggregate'
  ],
  intentionallyAbsent: [
    'No Client Billing component, page, navigation or CSS is generated in this data-layer pass.',
    'No Contract detail/update/delete, Claim submit/detail, standalone Invoice, payment or AR browser operation is generated.',
    'No partial Retention release amount is invented.',
    'No approved Change -> Client Contract target adapter is generated.',
    'No Stage-26 Client Invoice -> AR adapter is generated.',
    'No browser-owned Company, actor, permissions, Project authorization, numbering, lifecycle, Claim totals, retention calculations, Invoice totals or AR posting state is accepted.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicRoutesAdded: 0,
  newReactFiles: 2,
  reactComponentsAdded: 0,
  reactPagesAdded: 0,
  reviewedRouteCount: 7,
  reviewedWriteCount: 6,
  reviewedReadCount: 1,
  bodylessCommandCount: 1,
  listBrowserQueryFields: 2,
  exactDecimalBrowserTypes: true,
  financeArAdapterGenerated: false,
  approvedChangeContractAdapterGenerated: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 355 - Module 16 accessible permission-aware React Client Billing workspace using only the reviewed Stage-23 data layer.'
    : 'Repair the failed Pass-354 React data-layer check before generating the Client Billing workspace.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 16 Stage-23 React data evidence written to ${written}`);
if (!passed) process.exitCode = 1;
