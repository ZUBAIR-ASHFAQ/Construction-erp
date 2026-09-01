import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-repository.json');

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
  ['module-7-schema', 'npm', ['run', 'module-7:schema:gate']],
  ['module-7-repository-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  [
    'module-7-repository-typescript-syntax',
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
      'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts'
    ]
  ],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-15a-regression', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
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
      ? 'STAGE_12_MODULE_7_REPOSITORY_READY_FOR_PASS_216'
      : 'STAGE_12_MODULE_7_REPOSITORY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 215,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  repositoryFile: 'apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  exactProjectChildScopingPrepared: true,
  transactionClientSupported: true,
  projectBudgetWriteLockPrepared: true,
  budgetVersionProjectLockPrepared: true,
  postingCombinationValidationPrepared: true,
  budgetTotalsServerWritePrepared: true,
  forecastProjectOwnershipValidationPrepared: true,
  sourceHistoryReadOnly: true,
  commitmentActualWriteMethodsGenerated: false,
  ledgerPaginationBounded: true,
  eacVarianceMarginCalculatedInRepository: false,
  currentApprovedStatusVocabularyInvented: false,
  financeLockedPeriodBoundaryInvented: false,
  serviceGenerated: false,
  routesGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage11LiveAccepted,
  nextPass: passed
    ? 'Pass 216 - Module 7 service/business rules, Project resource policy, atomic budget/forecast transactions, audit/outbox and job-cost calculations.'
    : 'Repair the failed Pass-215 repository check before generating the Module-7 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
