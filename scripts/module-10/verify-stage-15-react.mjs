import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-10-evidence/stage-15-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 251
  && [
    'STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252',
    'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-10-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-10-integration-security-regression', 'npm', ['run', 'module-10:integration-security:gate']],
  ['module-10-react-static-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
  [
    'module-10-react-typescript-syntax',
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
      'apps/web/src/features/inventory/api/inventory-api.ts',
      'apps/web/src/features/inventory/hooks/inventory.ts',
      'apps/web/src/features/inventory/components/inventory-workspace.tsx',
      'apps/web/src/features/inventory/pages/inventory-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-7-static-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-9-static-regression', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_15_MODULE_10_REACT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 252,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  reactCoverage: [
    'typed browser API for exactly the eight reviewed Inventory operations',
    'TanStack Query owns Item and authorized Warehouse-balance server state and invalidates Purchase Order/Module-7 reads after directly related stock commands',
    'React Hook Form plus Zod validates Item, PO receipt, transfer, Project issue, return and signed adjustment command fields using exact decimal strings',
    'five retry-sensitive stock commands send browser-generated Idempotency-Key headers while Company, actor, status, valuation and cost remain server-owned',
    'permission-aware Item master, Warehouse balances, PO receipt, transfer, Project issue, return and Inventory-count adjustment controls are registered in the existing admin shell',
    'receipt UI preserves the reviewed accepted plus rejected equals quantity convention and sends no unit-cost or PO-consumption authority',
    'return UI follows the frozen prior-Project-ISSUE reversal convention without inventing a return direction or permission token',
    'stock-ledger and low-stock sections explicitly expose the frozen API gap instead of inventing persistence, thresholds or read routes'
  ],
  intentionallyAbsent: [
    'No Warehouse CRUD or Warehouse lookup endpoint is added; Warehouse identifiers remain explicit where the reviewed API requires them.',
    'No stock-ledger read endpoint is added, so the React feature does not claim durable ledger-history rendering.',
    'No reorder threshold or low-stock API is invented; the UI does not classify balances using guessed thresholds.',
    'No unit-conversion master, valuation-policy editor, stock-count session, Inventory approval route or Finance/AP/GL mutation is added.',
    'No new Project, WBS, Purchase Order or cost-code lookup endpoint is added solely for Inventory forms.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  newReactFiles: 4,
  adminShellIntegrationChanged: true,
  styleSheetChanged: true,
  publicRoutesAdded: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 253 - Module 10 Playwright browser workflow verification for the reviewed Inventory UI and permission-negative cases.'
    : 'Repair the failed Pass-252 React check before adding Stage-15 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 React evidence written to ${written}`);
if (!passed) process.exitCode = 1;
