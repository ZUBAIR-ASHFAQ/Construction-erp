import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_21_ACCEPTED = 'STAGE_21_ACCEPTED_READY_FOR_STAGE_22';
const evidencePath = path.resolve('module-17-evidence', 'stage-22-impact.json');

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
const results = [];
const steps = [
  ['module-17-service', 'npm', ['run', 'module-17:service:gate']],
  ['module-17-impact-suite', 'node', ['--test', 'tests/module-17-static.test.mjs']],
  [
    'module-17-impact-typescript-syntax',
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
      'apps/api/src/modules/change-orders/change-orders.service.ts',
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.service.ts',
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts'
    ]
  ],
  ['module-7-regression', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-regression', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-21-regression', 'node', ['--test', 'tests/module-21-static.test.mjs']],
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
  ? (stage21LiveAccepted
      ? 'STAGE_22_MODULE_17_IMPACT_READY_FOR_PASS_340'
      : 'STAGE_22_MODULE_17_IMPACT_PREPARED_STAGE_21_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-22-module-17-change-orders-impact-evidence',
  generatedAt: new Date().toISOString(),
  pass: 339,
  stage: 22,
  module: '17 - Change Orders / Variations',
  status,
  stage21LiveAccepted,
  mandatoryModule7BudgetRevisionIntegrated: true,
  mandatoryForecastCarryForwardIntegrated: true,
  changesApplyPermissionIntegrated: true,
  approvalAndImpactShareOneTransaction: true,
  impactAppliedEventEmitted: true,
  internalBudgetImpactTypes: [
    'PROJECT_BUDGET_COST',
    'PROJECT_BUDGET_REVENUE',
    'PROJECT_FORECAST_COST',
    'PROJECT_FORECAST_REVENUE'
  ],
  approvedDaysFailClosedUntilReviewedScheduleAdapter: true,
  scheduleAdapterGenerated: false,
  subcontractAdapterGenerated: false,
  clientBillingAdapterGenerated: false,
  stage27CompletionClaimed: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  httpGenerationAllowed: passed,
  runtimeDeploymentAllowed: false,
  runtimeDeploymentReason: 'Pass 340 must still add the reviewed seven-route authenticated HTTP/OpenAPI surface, and Stage-21 live handoff is independently required for runtime acceptance.',
  remainingSourceAmbiguities: [
    'approved_days Schedule mapping remains undefined; Pass 339 fails closed rather than silently ignoring it.',
    'Client/Subcontract/Schedule target adapters and reversal/adjustment policy remain Stage-27 completion work.',
    'No standalone changes.apply route exists; apply authority is enforced inside the reviewed approval orchestration.'
  ],
  nextPass: passed
    ? 'Pass 340 - Module 17 Fastify routes, index registration, authentication/RBAC and OpenAPI for exactly seven reviewed routes.'
    : 'Repair the failed Pass-339 impact check before exposing any Module-17 HTTP route.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 17 Stage-22 impact evidence written to ${written}`);

if (!passed) process.exitCode = 1;
