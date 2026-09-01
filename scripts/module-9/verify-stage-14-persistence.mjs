import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-persistence.json');

/** Read one JSON evidence file and return null when it does not exist. */
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
const results = [];
const steps = [
  ['module-9-contract', 'npm', ['run', 'module-9:contract:gate']],
  ['module-9-persistence-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_PERSISTENCE_READY_FOR_PASS_236'
      : 'STAGE_14_MODULE_9_PERSISTENCE_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 235,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  stage13LiveAccepted,
  migration: '20260824000400_module_9_purchase_orders_core',
  sourceOwnedTables: [
    'purchase_orders',
    'purchase_order_items',
    'purchase_order_revisions',
  ],
  inferredTablesAdded: [],
  companyProjectScopeEnforced: true,
  vendorMasterForeignKeyEnforced: true,
  quotationForeignKeyEnforced: true,
  quotationVendorCompanyProjectScopeEnforced: true,
  selectedQuotationStateDuplicated: false,
  purchaseOrderCostStructurePostingCombinationEnforced: true,
  revisionCreatorCompanyScopeEnforced: true,
  revisionNumberScopedUniquenessEnforced: true,
  inventoryItemForeignKeyDeferredUntilModule10: true,
  receivedAndInvoicedConsumptionServerOwned: true,
  receivedAndInvoicedConsumptionInitializedToZero: true,
  statusEnumsInvented: false,
  taxFormulaInvented: false,
  directPurchaseFieldsInvented: false,
  cancellationReasonColumnInvented: false,
  revisionLineHistoryTableInvented: false,
  commitmentPersistenceChanged: false,
  financePersistenceChanged: false,
  publicRoutesGenerated: false,
  apiGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage13LiveAccepted,
  nextPass: passed
    ? 'Pass 236 - Module 9 Zod request/response boundary for exactly the eight reviewed Purchase Order operations; preserve permission, status, tax/currency and direct-purchase gaps explicitly.'
    : 'Repair the failed Pass-235 persistence check before generating Module-9 API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
