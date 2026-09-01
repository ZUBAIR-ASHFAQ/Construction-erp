import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-contract.json');

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
  ['module-15a-static-prerequisite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-7-contract-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage11LiveAccepted
      ? 'STAGE_12_MODULE_7_CONTRACT_FROZEN_READY_FOR_PASS_213'
      : 'STAGE_12_MODULE_7_CONTRACT_FROZEN_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 212,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  contractOnly: true,
  stage11LiveAccepted,
  ownedTables: [
    'project_budgets',
    'budget_lines',
    'cost_commitments',
    'cost_actuals',
    'forecast_lines',
  ],
  reviewedRouteCount: 7,
  reviewedRoutes: [
    'GET /api/v1/projects/:projectId/budgets/current',
    'POST /api/v1/projects/:projectId/budgets',
    'PUT /api/v1/projects/:projectId/budgets/:id/lines',
    'POST /api/v1/projects/:projectId/budgets/:id/freeze',
    'GET /api/v1/projects/:projectId/job-cost',
    'PUT /api/v1/projects/:projectId/forecast',
    'GET /api/v1/projects/:projectId/job-cost/ledger',
  ],
  reviewedPermissions: [
    'budgets.read',
    'budgets.create',
    'budgets.edit',
    'budgets.freeze',
    'job_cost.read',
    'forecast.update',
  ],
  reviewedErrors: [
    'BUDGET_NOT_FOUND',
    'BUDGET_VERSION_LOCKED',
    'INVALID_COST_STRUCTURE',
    'FORECAST_PERIOD_LOCKED',
    'JOB_COST_RECONCILIATION_ERROR',
  ],
  reviewedEvents: [
    'budget.created',
    'budget.frozen',
    'budget.revised',
    'forecast.updated',
    'job_cost.source_posted',
  ],
  sourceDerivedTables: ['cost_commitments', 'cost_actuals'],
  publicSourceIngestionRoutes: 0,
  sourceAdaptersDeferred: true,
  jobCostSourcePostedDeferredUntilSourceAdapter: true,
  reusesProjectScope: true,
  reusesModule6CostStructure: true,
  reusesFinanceCorePeriods: true,
  reusesFoundationAuditOutboxIdempotency: true,
  unresolvedSourceAmbiguities: [
    'Budget type/status tokens and the exact representation of the one current approved version are not enumerated.',
    'Estimate/BOQ baseline creation is described but no source-link field or import route is defined.',
    'Budget-line amount input/calculation and rounding semantics are not defined.',
    'Commitment/actual cost_structure_id does not explicitly identify its foreign-key target.',
    'The exact commitment/actual source-key uniqueness constraint is not stated.',
    'Source-derived commitment/actual public write routes do not exist and must not be invented.',
    'Job-cost summary and ledger response shapes and ledger business filters are not enumerated.',
    'Approval is conditional but no Module-7 submit/approve/reopen route is defined.',
    'Forecast input fields versus calculated outputs are not enumerated.',
    'The exact forecast locked-period date boundary is not defined.',
    'The precise budget.revised transition is not stated.',
    'job_cost.source_posted depends on source adapters generated later.',
  ],
  productionRuntimeActivationAllowed: passed && stage11LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 213 - Module 7 reviewed Prisma models, constraints, indexes and migration. Deployment remains blocked until the Stage-11 live handoff is genuine.'
    : 'Repair the failed Pass-212 contract check before preparing Module-7 persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
