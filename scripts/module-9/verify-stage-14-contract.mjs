import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_13_ACCEPTED = 'STAGE_13_ACCEPTED_READY_FOR_STAGE_14';
const evidencePath = path.resolve('module-9-evidence', 'stage-14-contract.json');

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
  ['module-7-static-prerequisite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-8-static-prerequisite', 'node', ['--test', 'tests/module-8-static.test.mjs']],
  ['module-22-static-prerequisite', 'node', ['--test', 'tests/module-22-static.test.mjs']],
  ['module-9-contract-suite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
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
  ? (stage13LiveAccepted
      ? 'STAGE_14_MODULE_9_CONTRACT_FROZEN_READY_FOR_PASS_235'
      : 'STAGE_14_MODULE_9_CONTRACT_FROZEN_STAGE_13_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-14-module-9-purchase-orders-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 234,
  stage: 14,
  module: '9 - Purchase Orders',
  status,
  contractOnly: true,
  stage13LiveAccepted,
  ownedTables: [
    'purchase_orders',
    'purchase_order_items',
    'purchase_order_revisions',
  ],
  reviewedRouteCount: 8,
  reviewedRoutes: [
    'GET /api/v1/purchase-orders',
    'POST /api/v1/purchase-orders',
    'GET /api/v1/purchase-orders/:id',
    'PATCH /api/v1/purchase-orders/:id',
    'POST /api/v1/purchase-orders/:id/submit',
    'POST /api/v1/purchase-orders/:id/issue',
    'POST /api/v1/purchase-orders/:id/revise',
    'POST /api/v1/purchase-orders/:id/cancel',
  ],
  reviewedPermissions: [
    'purchase_orders.read',
    'purchase_orders.create',
    'purchase_orders.edit',
    'purchase_orders.submit',
    'purchase_orders.issue',
    'purchase_orders.revise',
  ],
  reviewedErrors: [
    'PO_NOT_FOUND',
    'PO_NOT_APPROVED',
    'PO_ALREADY_ISSUED',
    'PO_REVISION_BELOW_CONSUMED_VALUE',
    'PO_BUDGET_BLOCK',
  ],
  reviewedEvents: [
    'purchase_order.created',
    'purchase_order.submitted',
    'purchase_order.issued',
    'purchase_order.revised',
    'purchase_order.cancelled',
  ],
  hardPrerequisites: [
    '8 - Procurement & RFQ',
    '7 - Budgeting & Job Costing',
    '22 - Approval Workflows',
  ],
  vendorMasterOwner: '8 - Procurement & RFQ',
  quotationMasterOwner: '8 - Procurement & RFQ',
  commitmentOwner: '7 - Budgeting & Job Costing',
  issueCreatesOrUpdatesJobCostCommitment: true,
  revisionAndCancellationUpdateCommitmentAtomically: true,
  financeAdapterDeferredToModule15B: true,
  inventoryReceiptsDeferredToModule10: true,
  inventoryItemForeignKeyDeferredUntilModule10: true,
  browserCanWriteCommitmentsDirectly: false,
  browserCanWriteReceivedOrInvoicedConsumption: false,
  cancelPermissionGapRecorded: true,
  directPurchasePermissionGapRecorded: true,
  directPurchasePersistenceGapRecorded: true,
  revisionLineHistoryGapRecorded: true,
  cancellationReasonStorageGapRecorded: true,
  unresolvedSourceAmbiguities: [
    'Purchase Order lifecycle status tokens are not enumerated.',
    'The cancel route exists but the source names no dedicated cancellation permission or explicit mapping to an existing permission.',
    'Direct-purchase bypass requires explicit permission and reason, but the permission token, request shape, approval contract and persistence location are not defined.',
    'quotation_id is nullable while the source schema does not define a dedicated selected-quotation pointer; Module 9 must reuse authoritative Module-8 selection state rather than duplicate it.',
    'The exact PO line/header tax and rounding formula is not defined.',
    'The source requires approved currency but defines no currency master or direct quotation-currency contract.',
    'purchase_order_items.item_id points toward later Module-10 inventory ownership and must not receive a premature required foreign key.',
    'received_qty and invoiced_amount are server-owned downstream consumption fields whose writers arrive in later Module-10/Module-15B integrations.',
    'The reviewed three-table design has no revision-line snapshot table although controlled line/rate revision history is required.',
    'Cancellation requires a reason but the source defines no cancellation-reason persistence field.',
    'Module-7 commitment source_type/source-line key tokens and exact internal ingestion function shape are not defined.',
    'The source does not state whether every PO revision requires a fresh Module-22 approval before commitment adjustment.',
  ],
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  productionRuntimeActivationAllowed: passed && stage13LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 235 - Module 9 reviewed Prisma models, constraints, indexes and migration. Deployment remains blocked until the Stage-13 live handoff is genuine; future Inventory item references and contract gaps must remain explicit.'
    : 'Repair the failed Pass-234 contract check before preparing Module-9 persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 9 Stage-14 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
