import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-contract.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage14 = await readJson('module-9-evidence/stage-14-live.json');
const stage14LiveAccepted = stage14?.status === STAGE_14_ACCEPTED
  && stage14?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-5-static-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-prerequisite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-7-static-prerequisite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-9-static-prerequisite', 'node', ['--test', 'tests/module-9-static.test.mjs']],
  ['module-10-contract-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_CONTRACT_FROZEN_READY_FOR_PASS_246'
      : 'STAGE_15_MODULE_10_CONTRACT_FROZEN_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 245,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  contractOnly: true,
  stage14LiveAccepted,
  ownedTables: [
    'inventory_items',
    'warehouses',
    'inventory_balances',
    'goods_receipts',
    'goods_receipt_items',
    'stock_transactions',
  ],
  reviewedRouteCount: 8,
  reviewedRoutes: [
    'GET /api/v1/inventory/items',
    'POST /api/v1/inventory/items',
    'GET /api/v1/inventory/balances',
    'POST /api/v1/inventory/receipts',
    'POST /api/v1/inventory/transfers',
    'POST /api/v1/inventory/issues',
    'POST /api/v1/inventory/returns',
    'POST /api/v1/inventory/adjustments',
  ],
  reviewedPermissions: [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.adjust',
  ],
  reviewedErrors: [
    'ITEM_NOT_FOUND',
    'WAREHOUSE_NOT_FOUND',
    'INSUFFICIENT_STOCK',
    'RECEIPT_EXCEEDS_PO',
    'INVALID_UNIT_CONVERSION',
    'STOCK_PERIOD_LOCKED',
  ],
  reviewedEvents: [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted',
  ],
  hardPrerequisites: [
    '9 - Purchase Orders',
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
  ],
  purchaseOrderOwner: '9 - Purchase Orders',
  costActualOwner: '7 - Budgeting & Job Costing',
  projectCostStructureOwner: '6 - WBS & Cost Codes',
  projectScopeOwner: '24B - Project Scope Activation',
  stockLedgerAppendOnly: true,
  balanceMaintainedTransactionallyFromLedger: true,
  receiptUpdatesPoConsumptionAtomically: true,
  issueCreatesJobCostActualIdempotently: true,
  negativeStockDefaultFailClosed: true,
  overReceiptToleranceDefaultFailClosed: true,
  financeAdapterDeferredToModule15B: true,
  purchaseOrderItemInventoryForeignKeyNowReviewable: true,
  warehouseApiGapRecorded: true,
  stockLedgerReadApiGapRecorded: true,
  lowStockContractGapRecorded: true,
  returnPermissionAndSemanticsGapRecorded: true,
  unitConversionGapRecorded: true,
  valuationPolicyGapRecorded: true,
  stockPeriodOwnershipGapRecorded: true,
  transferIdentityGapRecorded: true,
  deferredItemForeignKeyUpgradeRiskRecorded: true,
  unresolvedSourceAmbiguities: [
    'Warehouse/site-store maintenance is required by workflow, but no warehouse CRUD/read management route or permission is defined.',
    'Item master has list/create routes only; no update/archive lifecycle route is defined.',
    'Stock-ledger and low-stock React views are required, but no dedicated ledger/low-stock read endpoint is defined.',
    'Low-stock thresholds/reorder levels are not represented in the six source tables.',
    'valuation_method exists, but allowed valuation methods, cost-layer behavior and exact rounding are not defined; only average_cost is explicitly stored on balances.',
    'Unit compatibility/conversion is required, but no UOM/conversion master, factor source or rounding rule is defined.',
    'Receipt tolerance is mentioned but no tolerance configuration, dedicated permission or request field is defined.',
    'quantity, accepted_qty and rejected_qty receipt-line reconciliation/disposition rules are not explicitly defined.',
    'Negative stock may be enabled by policy, but no policy/configuration source or permission is defined.',
    'Return direction/semantics are not defined and no dedicated inventory.return permission exists.',
    'Transfers have no header/table or exact source-identity/pairing rule for the two append-only ledger sides.',
    'Inventory-count adjustments are required, but no count-session/table, reason-code master or approval endpoint is defined.',
    'Adjustment approval is policy-dependent, but Module 10 has no hard Module-22 dependency and no Inventory approval command is defined.',
    'STOCK_PERIOD_LOCKED exists, but no Inventory stock-period owner or relation to Finance fiscal periods is defined.',
    'Item/receipt/stock transaction status/type token vocabularies are not enumerated.',
    'The exact Module-7 material actual-cost source_type/source-line encoding is not defined.',
    'The source does not define a dedicated Inventory transaction ledger read route even though the UI requires a stock ledger.',
    'The current Module-8/9 APIs permit non-null deferred item_id UUIDs without an Inventory target; Pass 246 must preflight historical values and must not silently null, rewrite or fabricate Inventory items to satisfy the new foreign keys.',
  ],
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  productionRuntimeActivationAllowed: passed && stage14LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 246 - Module 10 reviewed Prisma models, constraints, indexes and migration. Deployment remains blocked until the Stage-14 live handoff is genuine; deferred item FKs and Inventory source gaps must remain explicit.'
    : 'Repair the failed Pass-245 contract check before preparing Module-10 persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
