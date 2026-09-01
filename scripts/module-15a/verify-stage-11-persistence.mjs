import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const evidencePath = path.resolve('module-15a-evidence', 'stage-11-persistence.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-15a-contract', 'npm', ['run', 'module-15a:contract:gate']],
  ['module-15a-persistence-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
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
  ? (stage10LiveAccepted
      ? 'STAGE_11_MODULE_15A_PERSISTENCE_READY_FOR_PASS_203'
      : 'STAGE_11_MODULE_15A_PERSISTENCE_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-11-module-15a-finance-core-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 202,
  stage: 11,
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  status,
  stage10LiveAccepted,
  migration: '20260824000100_module_15a_finance_core',
  ownedTables: ['gl_accounts', 'fiscal_periods', 'journals', 'journal_lines'],
  deferred15BTables: ['ap_invoices', 'ar_invoices', 'payments', 'payment_allocations'],
  statusEnumsInvented: false,
  sourceTypeEnumInvented: false,
  reversalLinkageInvented: false,
  costStructureTarget: 'project_cost_codes.id',
  costStructureResolutionIsExplicit: true,
  databaseIntegrity: [
    'GL account parent stays inside the owning Company without inventing account-tree cycle semantics.',
    'Journal fiscal period belongs to the Journal Company and contains the posting date.',
    'Journal line account belongs to the Journal Company.',
    'Journal line Project belongs to the Journal Company when supplied.',
    'Journal line cost structure references Module 6 project_cost_codes and stays inside the Journal Company and selected Project.',
    'Stable non-null source identity is unique per Company/source type/source ID.',
  ],
  apiGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage10LiveAccepted,
  nextPass: passed
    ? 'Pass 203 - Module 15A Finance Core Zod request/response schema boundary for the six reviewed Stage-11 operations.'
    : 'Repair the failed Pass-202 persistence check before generating Finance Core API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
