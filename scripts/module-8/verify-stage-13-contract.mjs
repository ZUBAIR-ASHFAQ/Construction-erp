import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_12_ACCEPTED = 'STAGE_12_ACCEPTED_READY_FOR_STAGE_13';
const evidencePath = path.resolve('module-8-evidence', 'stage-13-contract.json');

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
  ['module-5-static-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-prerequisite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-static-prerequisite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-22-static-prerequisite', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-24b-static-prerequisite', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-8-contract-suite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
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
  ? (stage12LiveAccepted
      ? 'STAGE_13_MODULE_8_CONTRACT_FROZEN_READY_FOR_PASS_224'
      : 'STAGE_13_MODULE_8_CONTRACT_FROZEN_STAGE_12_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-13-module-8-procurement-rfq-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 223,
  stage: 13,
  module: '8 - Procurement & RFQ',
  status,
  contractOnly: true,
  stage12LiveAccepted,
  ownedTables: [
    'vendors',
    'vendor_contacts',
    'purchase_requisitions',
    'purchase_requisition_items',
    'rfqs',
    'rfq_vendors',
    'supplier_quotations',
    'supplier_quotation_items',
  ],
  reviewedRouteCount: 8,
  reviewedRoutes: [
    'GET /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions/:id/submit',
    'POST /api/v1/procurement/rfqs',
    'POST /api/v1/procurement/rfqs/:id/issue',
    'POST /api/v1/procurement/rfqs/:id/quotations',
    'GET /api/v1/procurement/rfqs/:id/comparison',
    'POST /api/v1/procurement/rfqs/:id/select-quotation',
  ],
  publicVendorMasterRouteCount: 0,
  reviewedPermissions: [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ],
  reviewedErrors: [
    'REQUISITION_NOT_FOUND',
    'RFQ_NOT_FOUND',
    'RFQ_CLOSED',
    'QUOTATION_INVALID',
    'PROCUREMENT_BUDGET_BLOCK',
    'INVALID_VENDOR_SELECTION',
  ],
  reviewedEvents: [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ],
  hardPrerequisites: [
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
    '22 - Approval Workflows',
    '24B - Project Scope Activation',
  ],
  ownsSupplierVendorMaster: true,
  selectionCreatesFinancialCommitment: false,
  inventoryItemForeignKeyDeferredUntilModule10: true,
  vendorMasterPublicApiGapRecorded: true,
  rfqItemRelationshipGapRecorded: true,
  rfqItemRelationshipResolvedByPass362: true,
  rfqItemRepairDecision: 'Pass 362 adds one minimal RFQ-line snapshot table and a real quotation-line foreign key without adding a public RFQ-item CRUD surface.',
  unresolvedSourceAmbiguities: [
    'Part I owns vendors/vendor_contacts in Module 8, but the reviewed Module-8 route table exposes no vendor-master CRUD/read/contact endpoint.',
    'purchase_requisition_items.item_id points toward later Module-10 inventory ownership and must not receive a premature foreign key.',
    'Requisition, RFQ, RFQ-vendor-response, vendor qualification and quotation status token vocabularies are not enumerated.',
    'Submitted/approved requisition revision or return-to-draft is required by a business rule, but no reviewed route exists for either command.',
    'The exact budget-block threshold/tolerance policy behind PROCUREMENT_BUDGET_BLOCK is not defined.',
    'Non-lowest-offer selection requires documented rationale when policy requires, but the policy source and exact request field names are not defined.',
    'Quotation comparison currency, exchange-rate, unit-conversion, tax-normalization and ranking formulas are not defined.',
    'Quotation import is required in the React UI description, but no dedicated import endpoint is defined.',
  ],
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  productionRuntimeActivationAllowed: passed && stage12LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 224 - Module 8 reviewed Prisma models, constraints, indexes and migration. Pass 362 later resolves the frozen RFQ-item integrity gap through one reviewed support table; Stage-12 live-handoff honesty remains unchanged.'
    : 'Repair the failed Pass-223 contract check before preparing Module-8 persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 8 Stage-13 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
