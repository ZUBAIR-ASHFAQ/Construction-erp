import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-persistence.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage12 = await readJson('module-7-evidence/stage-12-live.json');
const stage12LiveAccepted = stage12?.status === STAGE_12_ACCEPTED
  && stage12?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-8-contract', 'npm', ['run', 'module-8:contract:gate']],
  ['module-8-persistence-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
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
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_PERSISTENCE_READY_FOR_PASS_225'
      : 'STAGE_13_MODULE_8_PERSISTENCE_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 224,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  stage12LiveAccepted,
  migration: '20260824000300_module_8_procurement_rfq_core',
  sourceOwnedTables: [
    'vendors',
    'vendor_contacts',
    'purchase_requisitions',
    'purchase_requisition_items',
    'rfqs',
    'rfq_vendors',
    'supplier_quotations',
    'supplier_quotation_items',
  ],
  inferredTablesAdded: ['rfq_items'],
  vendorMasterForeignKeysEnforced: true,
  purchaseRequisitionProjectCompanyScopeEnforced: true,
  requestedByCompanyScopeEnforced: true,
  buyerCompanyScopeEnforced: true,
  requisitionCostStructurePostingCombinationEnforced: true,
  rfqRequisitionCompanyProjectScopeEnforced: true,
  rfqVendorCompanyScopeEnforced: true,
  quotationVendorInvitationScopeEnforced: true,
  inventoryItemForeignKeyDeferredUntilModule10: true,
  rfqItemRelationshipGapRecorded: true,
  rfqItemRelationshipResolvedByPass362: true,
  rfqItemForeignKeyEnforced: true,
  rfqItemPersistenceDecision: 'Pass 362 adds one minimal RFQ-line snapshot table, safely maps historical opaque quotation line ids, and enforces supplier_quotation_items.rfq_item_id as a real foreign key without adding an RFQ-item CRUD subsystem.',
  vendorCodeUniquenessInvented: false,
  statusEnumsInvented: false,
  quotationTotalsTrustedFromBrowser: false,
  selectionCreatesFinancialCommitment: false,
  publicRoutesGenerated: false,
  apiGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage12LiveAccepted,
  nextPass: passed
    ? 'Pass 225 - Module 8 Zod request/response schema boundary for the eight reviewed procurement operations; Pass 362 later resolves RFQ-item identity through the existing RFQ create/readback contract while the Vendor-master API gap remains explicit.'
    : 'Repair the failed Pass-224 persistence check before generating Module-8 API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
