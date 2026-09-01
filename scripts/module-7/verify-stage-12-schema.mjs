import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-schema.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-7-persistence', 'npm', ['run', 'module-7:persistence:gate']],
  ['module-7-schema-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  [
    'module-7-schema-typescript-syntax',
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
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts'
    ]
  ],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage11LiveAccepted
      ? 'STAGE_12_MODULE_7_SCHEMA_READY_FOR_PASS_215'
      : 'STAGE_12_MODULE_7_SCHEMA_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 214,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  schemaFile: 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts',
  sourceReviewedRouteCount: 7,
  pass361DraftRecoveryRoutesAdded: 1,
  activeRouteCount: 8,
  publicSourceIngestionRoutes: 0,
  createBudgetBrowserFields: ['budgetType'],
  budgetLineBrowserFields: [
    'wbsNodeId',
    'costCodeId',
    'costTypeId',
    'quantity',
    'unitRate',
    'amount',
    'revenueAmount'
  ],
  budgetLineAmountAuthority: 'explicit-draft-input; authoritative-budget-totals-server-calculated',
  budgetLineFormulaInvented: false,
  forecastBrowserFields: ['asOfDate', 'budgetLineId', 'estimateToComplete', 'notes'],
  forecastFinalCostBrowserOwned: false,
  forecastFinalRevenueBrowserOwned: false,
  forecastLockedPeriodBoundaryInvented: false,
  currentBudgetBusinessFilters: 0,
  jobCostBusinessFilters: 0,
  ledgerFilters: ['page', 'pageSize'],
  statusEnumsInvented: false,
  budgetTypeEnumInvented: false,
  sourceTypeEnumInvented: false,
  commitmentActualWriteSchemasGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage11LiveAccepted,
  nextPass: passed
    ? 'Pass 215 - Module 7 Company/Project-scoped repository for budgets, forecasts and read-only job-cost aggregation.'
    : 'Repair the failed Pass-214 schema check before generating the Module-7 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
