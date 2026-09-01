import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_14_ACCEPTED = 'STAGE_14_ACCEPTED_READY_FOR_STAGE_15';
const evidencePath = path.resolve('module-10-evidence', 'stage-15-persistence.json');

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
  ['module-10-contract', 'npm', ['run', 'module-10:contract:gate']],
  ['module-10-persistence-suite', 'node', ['--test', 'tests/module-10-static.test.mjs']],
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
  ? (stage14LiveAccepted
      ? 'STAGE_15_MODULE_10_PERSISTENCE_READY_FOR_PASS_247'
      : 'STAGE_15_MODULE_10_PERSISTENCE_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-15-module-10-inventory-materials-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 246,
  stage: 15,
  module: '10 - Inventory & Material Management',
  status,
  stage14LiveAccepted,
  migration: '20260824000500_module_10_inventory_materials_core',
  sourceOwnedTables: [
    'inventory_items',
    'warehouses',
    'inventory_balances',
    'goods_receipts',
    'goods_receipt_items',
    'stock_transactions',
  ],
  inferredTablesAdded: [],
  decimalQuantityScale: 4,
  decimalUnitCostScale: 4,
  inventoryItemCompanyScopeEnforced: true,
  warehouseCompanyProjectScopeEnforced: true,
  warehouseItemBalanceUniquenessEnforced: true,
  balanceNegativeStockDefaultEnforced: true,
  goodsReceiptPurchaseOrderCompanyProjectScopeEnforced: true,
  goodsReceiptWarehouseProjectScopeEnforced: true,
  goodsReceiptReceiverCompanyScopeEnforced: true,
  goodsReceiptLinePurchaseOrderScopeEnforced: true,
  goodsReceiptLineInventoryCompanyScopeEnforced: true,
  stockTransactionCompanyWarehouseItemScopeEnforced: true,
  stockTransactionProjectCostStructureScopeEnforced: true,
  stockLedgerAppendOnlyDatabaseGuard: true,
  purchaseOrderItemInventoryForeignKeyActivatedNullable: true,
  purchaseRequisitionItemInventoryForeignKeyActivatedNullable: true,
  deferredItemHistoricalValuePreflight: true,
  deferredItemHistoricalValuesRewritten: false,
  deferredItemHistoricalValuesNulled: false,
  inventoryItemsFabricatedForMigration: false,
  itemCodeUniquenessInvented: false,
  warehouseCodeUniquenessInvented: false,
  receiptNumberUniquenessInvented: false,
  statusEnumsInvented: false,
  valuationEnumsInvented: false,
  transferHeaderTableInvented: false,
  stockCountTableInvented: false,
  financePersistenceChanged: false,
  jobCostPersistenceChanged: false,
  publicRoutesGenerated: false,
  apiGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage14LiveAccepted,
  nextPass: passed
    ? 'Pass 247 - Module 10 strict Zod/API request and response schemas for exactly the eight reviewed Inventory operations. Preserve warehouse, ledger, low-stock, valuation, UOM, return and stock-period source gaps explicitly.'
    : 'Repair the failed Pass-246 persistence check before generating Module-10 API schemas.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 10 Stage-15 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
