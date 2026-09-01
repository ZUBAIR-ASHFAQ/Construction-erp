import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-persistence.json');

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
  ['module-7-contract', 'npm', ['run', 'module-7:contract:gate']],
  ['module-7-persistence-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
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
      ? 'STAGE_12_MODULE_7_PERSISTENCE_READY_FOR_PASS_214'
      : 'STAGE_12_MODULE_7_PERSISTENCE_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-budgeting-job-costing-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 213,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  migration: '20260824000200_module_7_budgets_job_costing_core',
  ownedTables: [
    'project_budgets',
    'budget_lines',
    'cost_commitments',
    'cost_actuals',
    'forecast_lines',
  ],
  statusEnumsInvented: false,
  currentBudgetColumnInvented: false,
  budgetSourceLinkInvented: false,
  costStructureTarget: 'project_cost_codes.id',
  sourceKey: ['company_id', 'project_id', 'source_type', 'source_id', 'source_line_id'],
  publicSourceIngestionRoutes: 0,
  databaseIntegrity: [
    'Project budgets stay inside one Company and Project and use unique positive Project version numbers.',
    'Budget lines use one posting-enabled Module-6 ProjectCostCode combination without adding an undocumented mapping column.',
    'Commitment and actual cost structures stay inside their selected Project.',
    'Commitment and actual source identities are idempotent inside Company + Project scope.',
    'Forecast rows stay inside the Project that owns their budget line.',
  ],
  apiGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage11LiveAccepted,
  nextPass: passed
    ? 'Pass 214 - Module 7 Zod request/response schema boundary for the seven reviewed Stage-12 operations.'
    : 'Repair the failed Pass-213 persistence check before generating Module-7 API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
