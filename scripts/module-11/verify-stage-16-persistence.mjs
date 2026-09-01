import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_15_ACCEPTED = 'STAGE_15_ACCEPTED_READY_FOR_STAGE_16';
const evidencePath = path.resolve('module-11-evidence', 'stage-16-persistence.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage15 = await readJson('module-10-evidence/stage-15-live.json');
const stage15LiveAccepted = stage15?.status === STAGE_15_ACCEPTED
  && stage15?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-11-contract', 'npm', ['run', 'module-11:contract:gate']],
  ['module-11-persistence-suite', 'node', ['--test', 'tests/module-11-static.test.mjs']],
  ['migration-system-suite', 'node', ['--test', 'tests/migration-system.test.mjs']],
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
  ? (stage15LiveAccepted
      ? 'STAGE_16_MODULE_11_PERSISTENCE_READY_FOR_PASS_258'
      : 'STAGE_16_MODULE_11_PERSISTENCE_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-16-module-11-subcontractor-management-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 257,
  stage: 16,
  module: '11 - Subcontractor Management',
  status,
  stage15LiveAccepted,
  migration: '20260825000100_module_11_subcontractor_management_core',
  sourceOwnedTables: [
    'subcontractors',
    'subcontracts',
    'subcontract_items',
    'subcontract_payment_applications',
    'subcontract_payment_lines',
  ],
  inferredTablesAdded: [],
  vendorLinkNullable: true,
  vendorSameCompanyEnforced: true,
  vendorMasterDuplicated: false,
  subcontractNumberUniqueness: 'company_id + project_id + subcontract_no',
  paymentApplicationNumberUniqueness: 'subcontract_id + application_no',
  subcontractorCodeUniquenessInvented: false,
  quantityRateScale: 4,
  moneyScale: 2,
  retentionPercentScale: 4,
  retentionPercentRangeEnforced: true,
  companyProjectSubcontractorScopeEnforced: true,
  postingEnabledCostStructureEnforced: true,
  boqCompanyProjectScopeEnforced: true,
  paymentLineSameSubcontractEnforced: true,
  paymentLinePerItemUniquenessInvented: false,
  statusEnumsInvented: false,
  contactJsonSchemaInvented: false,
  amountFormulaInvented: false,
  approvalPersistenceInvented: false,
  commitmentPersistenceChanged: false,
  financePersistenceChanged: false,
  variationPersistenceInvented: false,
  revisionTableInvented: false,
  deductionTableInvented: false,
  retentionLedgerTableInvented: false,
  certificationStatusTokenInvented: false,
  publicRoutesGenerated: false,
  apiSchemaGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage15LiveAccepted,
  nextPass: passed
    ? 'Pass 258 - Module 11 strict Zod request/query/response schemas for exactly the eight reviewed public operations. Preserve approval, readback, revision, retention, numbering-token, deduction and Finance/AP gaps explicitly.'
    : 'Repair the failed Pass-257 persistence check before generating Module-11 API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 11 Stage-16 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
