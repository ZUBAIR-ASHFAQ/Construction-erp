import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-service.json');

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
  ['module-7-repository', 'npm', ['run', 'module-7:repository:gate']],
  ['module-7-service-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  [
    'module-7-service-typescript-syntax',
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
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts',
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts'
    ]
  ],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
      ? 'STAGE_12_MODULE_7_SERVICE_READY_FOR_PASS_217'
      : 'STAGE_12_MODULE_7_SERVICE_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 216,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  serviceFile: 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
  exactProjectResourcePolicyPrepared: true,
  closedProjectWritesBlocked: true,
  budgetLifecycleInternalTokens: ['DRAFT', 'FROZEN'],
  publicBudgetStatusEnumAdded: false,
  currentApprovedSelection: 'highest-version FROZEN budget',
  budgetVersionCreationAtomic: true,
  budgetLineReplacementAtomic: true,
  budgetFreezeRetrySafe: true,
  budgetTotalsCalculatedServerSide: true,
  activeCostStructureRevalidation: true,
  committedCostUsesRemainingAmount: true,
  forecastFinalCostFormula: 'actual + remaining commitment + estimate to complete',
  varianceFormula: 'budget - forecast final cost',
  marginFormula: 'forecast final revenue - forecast final cost',
  financePeriodMutationAdded: false,
  financePeriodReadValidationPrepared: true,
  auditPrepared: true,
  reviewedOutboxEventsPrepared: ['budget.created', 'budget.frozen', 'budget.revised', 'forecast.updated'],
  jobCostSourcePostedEmitted: false,
  commitmentActualWriteMethodsGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage11LiveAccepted,
  nextPass: passed
    ? 'Pass 217 - Module 7 Fastify routes, module registration and OpenAPI metadata for the seven source-defined Stage-12 operations before the Pass-361 DRAFT recovery amendment.'
    : 'Repair the failed Pass-216 service check before generating the Module-7 HTTP layer.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
