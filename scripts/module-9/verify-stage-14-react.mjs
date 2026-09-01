import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage13 = await readJson('module-8-evidence/stage-13-live.json');
const stage13LiveAccepted = stage13?.status === STAGE_13_ACCEPTED
  && stage13?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-9-evidence/stage-14-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 240
  && [
    'STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241',
    'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-9-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-9-integration-security-regression', 'npm', ['run', 'module-9:integration-security:gate']],
  ['module-9-react-static-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  [
    'module-9-react-typescript-syntax',
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
      'apps/web/src/features/purchase-orders/api/purchase-orders-api.ts',
      'apps/web/src/features/purchase-orders/hooks/purchase-orders.ts',
      'apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx',
      'apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-static-regression', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-static-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_14_MODULE_9_REACT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 241,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  reactCoverage: [
    'typed browser API for exactly the eight reviewed Purchase Order operations',
    'TanStack Query owns the PO register/detail plus direct read-only Module-22 approval and Module-7 commitment integrations',
    'React Hook Form plus Zod validates quotation-backed draft create/edit, controlled header revision and cancellation reason inputs',
    'Project selector reuses the existing Project register while Project authorization stays server-authoritative',
    'PO lines reuse posting-enabled Module-6 cost structures without creating a new lookup route',
    'approval timeline reuses the existing current-user Module-22 inbox and never invents a PO-specific approval lookup endpoint',
    'printable PO preview uses browser print over server readback and adds no document-generation API',
    'receipt/invoice progress is read-only from server-owned PO line consumption fields',
    'commitment status is read-only from existing Module-7 job-cost ledger rows sourced by purchase_order',
    'issue, revision and cancellation controls never send Company, status, totals, consumption or commitment authority from the browser'
  ],
  intentionallyAbsent: [
    'No Vendor or quotation list/CRUD API is added; the draft editor accepts the selected Module-8 Vendor and quotation UUIDs explicitly.',
    'No direct-purchase browser path is enabled because the source still lacks its dedicated permission and persistence contract.',
    'No dedicated cancel permission is invented; cancellation visibility follows the existing purchase_orders.revise implementation authority.',
    'No receipt, supplier invoice/AP, stock, Finance journal or direct commitment mutation control is added.',
    'No issued-currency-change UI is added while the approved currency/FX contract remains unresolved.',
    'No consumed-line replacement UI is added because Stage 14 has no stable line-remapping contract for downstream consumption.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  newReactFiles: 4,
  publicRoutesAdded: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 242 - Module 9 Playwright Purchase Order workflow verification.'
    : 'Repair the failed Pass-241 React check before adding Stage-14 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 React evidence written to ${written}`);
if (!passed) process.exitCode = 1;
