import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/inventory/STAGE-15-MODULE-10-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-10/verify-stage-15-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-10/verify-stage-15-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-10/verify-stage-15-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-10/verify-stage-15-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-10/verify-stage-15-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-10/verify-stage-15-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-10/verify-stage-15-integration-security.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-10/verify-stage-15-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-10/verify-stage-15.mjs', 'utf8');
const integrationTest = await readFile('tests/integration/module-10-api.integration.test.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/inventory/inventory.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/inventory/inventory.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/inventory/inventory.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/inventory/inventory.routes.ts', 'utf8');
const index = await readFile('apps/api/src/modules/inventory/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260824000500_module_10_inventory_materials_core/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

// Freeze the corrected Stage-15 position after Purchase Orders and before Subcontractors.
test('Pass 245 freezes Stage 15 after Purchase Orders and before Subcontractors', () => {
  assert.match(contract, /Stage 14  Module 9 - Purchase Orders/);
  assert.match(contract, /Stage 15  Module 10 - Inventory & Materials/);
  assert.match(contract, /Stage 16  Module 11 - Subcontractor Management/);
  assert.match(contractGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
});

// Freeze only the six source-defined Inventory persistence resources.
test('Pass 245 freezes exactly six reviewed Module 10 tables', () => {
  for (const table of [
    'inventory_items',
    'warehouses',
    'inventory_balances',
    'goods_receipts',
    'goods_receipt_items',
    'stock_transactions',
  ]) assert.match(contract, new RegExp(`\\b${table}\\b`));
  assert.match(contract, /Module 10 owns exactly these six reviewed persistence resources/);
  assert.match(contractGate, /ownedTables: \[/);
});

// Keep the corrected hard dependencies exactly on Modules 9, 5, 6 and 7.
test('Pass 245 freezes the corrected Module 10 hard prerequisites', () => {
  for (const dependency of [
    'Module 9  Purchase Orders',
    'Module 5  Project Management',
    'Module 6  WBS & Cost Codes',
    'Module 7  Budgeting & Job Costing',
  ]) assert.ok(contract.includes(dependency), `Missing dependency: ${dependency}`);
  for (const prerequisite of [
    '9 - Purchase Orders',
    '5 - Project Management',
    '6 - WBS & Cost Codes',
    '7 - Budgeting & Job Costing',
  ]) assert.match(contractGate, new RegExp(prerequisite.replaceAll('&', '\\&')));
});

// Activate review of the nullable Module-9 item relationship only now that Inventory owns the target.
test('Pass 245 freezes the deferred Purchase Order item relationship handoff', () => {
  assert.match(contract, /purchase_order_items\.item_id -> inventory_items\.id/);
  assert.match(contract, /The relationship remains nullable/);
  assert.match(contract, /Existing description-only PO lines must stay valid/);
  assert.match(contractGate, /purchaseOrderItemInventoryForeignKeyNowReviewable: true/);
});

// Record the real previous-schema risk from non-null deferred item UUIDs before activating FKs.
test('Pass 245 records deferred item FK upgrade preflight', () => {
  assert.match(contract, /current Stage-13\/14 API boundaries permit a non-null optional item UUID/);
  assert.match(contract, /must inspect existing non-null values before adding either deferred FK/);
  assert.match(contract, /must not silently null, rewrite or fabricate Inventory items/);
  assert.match(contractGate, /deferredItemForeignKeyUpgradeRiskRecorded: true/);
});

// Freeze all and only the eight public operations supplied by the Inventory route table.
test('Pass 245 freezes exactly eight reviewed Module 10 public operations', () => {
  for (const route of [
    'GET  /api/v1/inventory/items',
    'POST /api/v1/inventory/items',
    'GET  /api/v1/inventory/balances',
    'POST /api/v1/inventory/receipts',
    'POST /api/v1/inventory/transfers',
    'POST /api/v1/inventory/issues',
    'POST /api/v1/inventory/returns',
    'POST /api/v1/inventory/adjustments',
  ]) assert.ok(contract.includes(route), `Missing route: ${route}`);
  assert.match(contractGate, /reviewedRouteCount: 8/);
});

// Do not invent generic Warehouse, item, ledger, count or approval APIs.
test('Pass 245 rejects generic or source-unsupported Inventory APIs', () => {
  for (const routePattern of [
    /GET\/POST\/PATCH\/DELETE \/api\/v1\/inventory\/warehouses/,
    /PATCH \/api\/v1\/inventory\/items\/:id/,
    /DELETE \/api\/v1\/inventory\/items\/:id/,
    /GET \/api\/v1\/inventory\/transactions/,
    /POST \/api\/v1\/inventory\/counts/,
    /POST \/api\/v1\/inventory\/adjustments\/:id\/approve/,
    /POST \/api\/v1\/inventory\/returns\/:id\/approve/,
  ]) assert.match(contract, routePattern);
  assert.match(contract, /Do not add generic CRUD routes automatically/);
});

// Preserve the Warehouse-management source gap instead of hiding it with new routes.
test('Pass 245 records the Warehouse API gap', () => {
  assert.match(contract, /no warehouse create\/update\/list management endpoint/);
  assert.match(contractGate, /warehouseApiGapRecorded: true/);
});

// Preserve the required stock-ledger and low-stock UI without fabricating read APIs.
test('Pass 245 records stock-ledger and low-stock API gaps', () => {
  assert.match(contract, /stock-ledger and low-stock views are required, but no dedicated stock-transaction\/low-stock read endpoint is listed/);
  assert.match(contract, /Low-stock thresholds\/reorder levels are not represented/);
  assert.match(contractGate, /stockLedgerReadApiGapRecorded: true/);
  assert.match(contractGate, /lowStockContractGapRecorded: true/);
});

// Freeze the append-only ledger and transactionally maintained balance invariants.
test('Pass 245 freezes stock ledger and balance invariants', () => {
  assert.match(contract, /stock ledger is append-only/);
  assert.match(contract, /corrections use reversing transactions/);
  assert.match(contract, /Inventory balance is transactionally derived\/maintained from stock ledger/);
  assert.match(contractGate, /stockLedgerAppendOnly: true/);
  assert.match(contractGate, /balanceMaintainedTransactionallyFromLedger: true/);
});

// Receipt must synchronize Inventory and Purchase Order consumption atomically.
test('Pass 245 freezes atomic PO receipt consumption', () => {
  assert.match(contract, /Receipt must update the stock balance and the referenced Purchase Order received quantity \*\*atomically\*\*/);
  assert.match(contract, /purchase_order_items\.received_qty/);
  assert.match(contract, /duplicate\/retried receipt commands must not duplicate physical stock or PO received quantity/);
  assert.match(contractGate, /receiptUpdatesPoConsumptionAtomically: true/);
});

// Without a source-defined tolerance contract, over-receipt must fail closed.
test('Pass 245 freezes fail-closed receipt tolerance behavior', () => {
  assert.match(contract, /Stage-15 default is fail-closed: do not over-receive/);
  assert.match(contractGate, /overReceiptToleranceDefaultFailClosed: true/);
});

// Without a source-defined negative-stock policy, issue/transfer must fail closed.
test('Pass 245 freezes fail-closed negative-stock behavior', () => {
  assert.match(contract, /default implementation posture is fail-closed/);
  assert.match(contractGate, /negativeStockDefaultFailClosed: true/);
});

// Material issues must create Module-7 actual cost once and atomically with stock movement.
test('Pass 245 freezes Module 7 actual-cost integration', () => {
  assert.match(contract, /create one idempotent Module-7 cost_actual source/);
  assert.match(contract, /stock mutation and Module-7 actual-cost creation must be atomic\/idempotent/);
  assert.match(contract, /one stock issue source may post to job cost at most once/);
  assert.match(contractGate, /issueCreatesJobCostActualIdempotently: true/);
});

// Keep formal accounting outside Stage 15.
test('Pass 245 defers Inventory Finance adapters to Module 15B', () => {
  assert.match(contract, /Part I defers source-specific Finance adapters to \*\*Module 15B\*\*/);
  for (const forbidden of ['supplier AP invoice', 'supplier payment', 'Finance journal', 'inventory accounting adapter']) {
    assert.match(contract, new RegExp(forbidden, 'i'));
  }
  assert.match(contractGate, /financeAdapterDeferredToModule15B: true/);
});

// Preserve valuation and UOM gaps rather than inventing unsupported configuration masters.
test('Pass 245 records valuation and unit-conversion gaps', () => {
  assert.match(contract, /does not define the exact valuation algorithm/);
  assert.match(contract, /no unit-of-measure master, conversion table, conversion API or exact rounding rule/);
  assert.match(contract, /must not invent a UOM master or arbitrary browser-provided conversion factor/);
  assert.match(contractGate, /valuationPolicyGapRecorded: true/);
  assert.match(contractGate, /unitConversionGapRecorded: true/);
});

// Return semantics and permission remain explicit source gaps.
test('Pass 245 records return semantics and permission gap', () => {
  assert.match(contract, /does not specify whether a return means Project\/site issue return-to-stock, return-to-vendor, warehouse return/);
  assert.match(contract, /no dedicated `inventory\.return` permission/);
  assert.match(contractGate, /returnPermissionAndSemanticsGapRecorded: true/);
});

// Transfer persistence must not invent a seventh Inventory business table.
test('Pass 245 records transfer pairing identity gap without adding a table', () => {
  assert.match(contract, /no `inventory_transfers` header\/table/);
  assert.match(contract, /instead of inventing a seventh Inventory table/);
  assert.match(contractGate, /transferIdentityGapRecorded: true/);
});

// Preserve stock-count/adjustment approval gaps without creating an extra business module.
test('Pass 245 freezes adjustment and stock-count scope', () => {
  assert.match(contract, /does \*\*not\*\* define a stock-count session\/header\/table/);
  assert.match(contract, /must use the reviewed adjustment command/);
  assert.match(contract, /must not silently introduce a separate stock-count business module/);
});

// Preserve the undefined owner behind STOCK_PERIOD_LOCKED.
test('Pass 245 records stock-period ownership gap', () => {
  assert.match(contract, /`STOCK_PERIOD_LOCKED` is a reviewed Inventory error/);
  assert.match(contract, /must not silently equate Inventory periods with Module-15 Finance periods/);
  assert.match(contractGate, /stockPeriodOwnershipGapRecorded: true/);
});

// Freeze the exact six source permission codes without inventing return/warehouse/count permissions.
test('Pass 245 freezes the reviewed Inventory permission vocabulary', () => {
  for (const permission of [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.adjust',
  ]) assert.match(contract, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(contract, /There is no source-defined `inventory\.return`, `inventory\.warehouse\.manage`, `inventory\.count` or `inventory\.valuation\.manage` permission/);
});

// Freeze the six stable Inventory business conflicts.
test('Pass 245 freezes the reviewed Inventory error codes', () => {
  for (const code of [
    'ITEM_NOT_FOUND',
    'WAREHOUSE_NOT_FOUND',
    'INSUFFICIENT_STOCK',
    'RECEIPT_EXCEEDS_PO',
    'INVALID_UNIT_CONVERSION',
    'STOCK_PERIOD_LOCKED',
  ]) assert.match(contract, new RegExp(`\\b${code}\\b`));
});

// Freeze the five source-defined Inventory events.
test('Pass 245 freezes the reviewed Inventory domain events', () => {
  for (const event of [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted',
  ]) assert.match(contract, new RegExp(event.replaceAll('.', '\\.')));
});

// Ensure browser authority cannot directly mutate calculated stock, PO consumption or job-cost values.
test('Pass 245 freezes server-owned Inventory authority', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'allowedProjectIds',
    'receiptNo',
    'receivedBy',
    'quantityOnHand',
    'averageCost',
    'calculatedActualCost',
    'purchaseOrderReceivedQty',
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
  assert.match(contract, /browser directly writes stock balances, PO received quantities or Module-7 actual-cost rows/);
});

// Pass 245 remains historically contract-only while later reviewed layers are appended.
test('Pass 246 preserves the contract-only Pass 245 boundary while later layers are appended', async () => {
  assert.match(contract, /Pass 245 is contract-only/);
  assert.match(contractGate, /contractOnly: true/);
  assert.match(contractGate, /productionFilesGenerated: false/);
  assert.match(contractGate, /databaseMigrationGenerated: false/);
  await access('packages/database/prisma/migrations/20260824000500_module_10_inventory_materials_core/migration.sql');
  await access('apps/api/src/modules/inventory/inventory.schema.ts');
  await access('apps/api/src/modules/inventory/inventory.repository.ts');
  await access('apps/api/src/modules/inventory/inventory.service.ts');
  await access('apps/api/src/modules/inventory/inventory.routes.ts');
  await access('apps/api/src/modules/inventory/index.ts');
});

// Register the dedicated contract gate and preserve the reviewed Pass-246 handoff.
test('Pass 245 registers its gate and next reviewed pass', () => {
  assert.equal(rootPackage.scripts['module-10:contract:gate'], 'node scripts/module-10/verify-stage-15-contract.mjs');
  assert.match(contract, /Pass 246 — Module 10 reviewed Prisma models, constraints, indexes and migration/);
  assert.match(contractGate, /STAGE_15_MODULE_10_CONTRACT_FROZEN_READY_FOR_PASS_246/);
});

// Pass 246 creates exactly the six reviewed Inventory models and no extra business persistence.
test('Pass 246 creates exactly the six reviewed Inventory Prisma models', () => {
  for (const model of [
    'InventoryItem',
    'Warehouse',
    'InventoryBalance',
    'GoodsReceipt',
    'GoodsReceiptItem',
    'StockTransaction',
  ]) assert.match(prisma, new RegExp(`model\\s+${model}\\s*\\{`));
  assert.doesNotMatch(prisma, /model\s+InventoryTransfer\s*\{/);
  // Pass 369 later adds a durable InventoryCount and a narrowly named per-Item conversion model.
  assert.match(prisma, /model\s+InventoryCount\s*\{/);
  assert.match(prisma, /model\s+InventoryItemUnitConversion\s*\{/);
});

// Preserve the exact source-defined table names in the Stage-15 migration.
test('Pass 246 creates exactly the six reviewed Inventory tables', () => {
  for (const table of [
    'inventory_items',
    'warehouses',
    'inventory_balances',
    'goods_receipts',
    'goods_receipt_items',
    'stock_transactions',
  ]) assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  assert.doesNotMatch(migration, /CREATE TABLE "inventory_transfers"/);
  assert.doesNotMatch(migration, /CREATE TABLE "inventory_counts"/);
  assert.doesNotMatch(migration, /CREATE TABLE "unit_conversions"/);
});

// Quantities and unit costs remain decimal-safe without introducing unsupported valuation enums.
test('Pass 246 freezes decimal-safe Inventory persistence without inventing enums', () => {
  assert.match(prisma, /quantityOnHand\s+Decimal[\s\S]*?@db\.Decimal\(18, 4\)/);
  assert.match(prisma, /averageCost\s+Decimal[\s\S]*?@db\.Decimal\(18, 4\)/);
  assert.match(prisma, /unitCost\s+Decimal[\s\S]*?@db\.Decimal\(18, 4\)/);
  assert.match(prisma, /valuationMethod\s+String/);
  assert.doesNotMatch(prisma, /enum\s+InventoryValuationMethod/);
  assert.doesNotMatch(prisma, /enum\s+InventoryTransactionType/);
});

// Item/warehouse/receipt business codes are indexed but no source-unsupported uniqueness scope is invented.
test('Pass 246 does not invent item, warehouse or receipt number uniqueness', () => {
  assert.match(migration, /inventory_items_company_code_idx/);
  assert.match(migration, /warehouses_company_code_idx/);
  assert.match(migration, /goods_receipts_company_receipt_no_idx/);
  assert.doesNotMatch(migration, /UNIQUE INDEX "inventory_items_company_code/);
  assert.doesNotMatch(migration, /UNIQUE INDEX "warehouses_company_code/);
  assert.doesNotMatch(migration, /UNIQUE INDEX "goods_receipts_company_receipt_no/);
  assert.match(persistenceGate, /itemCodeUniquenessInvented: false/);
  assert.match(persistenceGate, /warehouseCodeUniquenessInvented: false/);
  assert.match(persistenceGate, /receiptNumberUniquenessInvented: false/);
});

// Fail-closed stock persistence keeps on-hand quantities non-negative and one balance per warehouse/item.
test('Pass 246 persists fail-closed stock balance constraints', () => {
  assert.match(migration, /inventory_balances_warehouse_item_uq/);
  assert.match(migration, /quantity_on_hand_nonnegative/);
  assert.match(migration, /reserved_quantity_nonnegative/);
  assert.match(migration, /average_cost_nonnegative/);
  assert.match(persistenceGate, /balanceNegativeStockDefaultEnforced: true/);
});

// Goods receipts are constrained to the same Company/Project PO, same-Company warehouse and same-Company receiver.
test('Pass 246 enforces goods receipt Company and Project scope', () => {
  assert.match(migration, /goods_receipts_project_company_fkey/);
  assert.match(migration, /goods_receipts_warehouse_company_fkey/);
  assert.match(migration, /goods_receipts_purchase_order_scope_fkey/);
  assert.match(migration, /goods_receipts_received_by_company_fkey/);
  assert.match(migration, /goods_receipts_warehouse_project_scope_integrity/);
  assert.match(persistenceGate, /goodsReceiptPurchaseOrderCompanyProjectScopeEnforced: true/);
});

// Goods receipt lines must belong to the header PO and their Inventory item must belong to the receipt Company.
test('Pass 246 enforces receipt-line PO and item scope', () => {
  assert.match(migration, /goods_receipt_items_po_item_fkey/);
  assert.match(migration, /goods_receipt_items_item_fkey/);
  assert.match(migration, /Goods receipt item must reference a line on the receipt Purchase Order/);
  assert.match(migration, /Goods receipt item must belong to the receipt Company/);
});

// The stock ledger has a database-level append-only guard and scoped cost-structure validation.
test('Pass 246 enforces append-only stock transactions and Project cost scope', () => {
  assert.match(migration, /stock_transactions_append_only_integrity/);
  assert.match(migration, /BEFORE UPDATE OR DELETE/);
  assert.match(migration, /write a reversing or adjustment transaction instead/);
  assert.match(migration, /stock_transactions_cost_structure_fkey/);
  assert.match(migration, /Stock transaction cost structure must belong to the transaction Project/);
  assert.match(persistenceGate, /stockLedgerAppendOnlyDatabaseGuard: true/);
});

// Activate the two nullable later-target item FKs only after an explicit historical preflight.
test('Pass 246 preflights and activates deferred Procurement and PO item FKs', () => {
  assert.match(migration, /Stage 15 deferred Inventory item FK preflight failed/);
  assert.match(migration, /will not null, rewrite or fabricate Inventory items/);
  assert.match(migration, /purchase_requisition_items_inventory_item_fkey/);
  assert.match(migration, /purchase_order_items_inventory_item_fkey/);
  assert.match(prisma, /model PurchaseRequisitionItem[\s\S]*?inventoryItem\s+InventoryItem\?/);
  assert.match(prisma, /model PurchaseOrderItem[\s\S]*?inventoryItem\s+InventoryItem\?/);
  assert.match(persistenceGate, /deferredItemHistoricalValuePreflight: true/);
  assert.match(persistenceGate, /deferredItemHistoricalValuesRewritten: false/);
  assert.match(persistenceGate, /inventoryItemsFabricatedForMigration: false/);
});

// Future non-null deferred item references must also remain in the parent header Company.
test('Pass 246 enforces same-Company deferred item references', () => {
  assert.match(migration, /purchase_requisition_items_inventory_company_scope_integrity/);
  assert.match(migration, /Purchase requisition item Inventory reference must belong to the requisition Company/);
  assert.match(migration, /purchase_order_items_inventory_company_scope_integrity/);
  assert.match(migration, /Purchase Order item Inventory reference must belong to the PO Company/);
});

// Preserve the registered Stage-15 persistence gate after later stages append their migrations.
test('Pass 246 keeps the Stage-15 migration gate and persistence command registered', () => {
  const stage15 = migrationGates.gates.find((entry) => entry.gate === 'module-10-inventory-materials-core-persistence');
  assert.equal(stage15?.stage, 15);
  assert.deepEqual(stage15?.migrations, ['20260824000500_module_10_inventory_materials_core']);
  assert.equal(rootPackage.scripts['module-10:persistence:gate'], 'node scripts/module-10/verify-stage-15-persistence.mjs');
  assert.match(persistenceGate, /STAGE_15_MODULE_10_PERSISTENCE_READY_FOR_PASS_247/);
});



// Pass 247 freezes the strict Zod boundary before repository/service generation.
test('Pass 247 exports exactly the eight reviewed Inventory routes and six permissions', () => {
  for (const route of [
    '/api/v1/inventory/items',
    '/api/v1/inventory/balances',
    '/api/v1/inventory/receipts',
    '/api/v1/inventory/transfers',
    '/api/v1/inventory/issues',
    '/api/v1/inventory/returns',
    '/api/v1/inventory/adjustments',
  ]) assert.match(schema, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  for (const permission of [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.adjust',
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  const permissions = schema.match(/export const MODULE_10_PERMISSION_CODES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.doesNotMatch(permissions, /inventory\.return(?:'|\")|inventory\.warehouse\.manage|inventory\.count/);
  assert.match(schemaGate, /reviewedRouteCount: 8/);
  assert.match(schemaGate, /reviewedPermissionCount: 6/);
});

// GET boundaries stay narrow because the source supplies no business filter vocabulary.
test('Pass 247 keeps Item and balance queries to bounded pagination only', () => {
  const itemQuery = schema.match(/export const listInventoryItemsQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const balanceQuery = schema.match(/export const listInventoryBalancesQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const query of [itemQuery, balanceQuery]) {
    assert.match(query, /\.\.\.paginationQueryShape/);
    assert.doesNotMatch(query, /projectId|warehouseId|itemId|status|category|search/);
  }
  assert.match(schema, /MODULE_10_MAX_PAGE_SIZE = 100/);
  assert.match(schemaGate, /listFiltersInvented: false/);
});

// Item creation accepts source-owned master data but not Company or lifecycle authority.
test('Pass 247 item create schema excludes Company and status authority', () => {
  const body = schema.match(/export const createInventoryItemBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['itemCode', 'name', 'category', 'baseUnit', 'valuationMethod']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['companyId', 'status', 'quantityOnHand', 'averageCost']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(schemaGate, /itemStatusAcceptedFromBrowser: false/);
  assert.match(schemaGate, /valuationMethodEnumInvented: false/);
});

// Receipt input contains only the PO/warehouse choice and quantity-quality checks.
test('Pass 247 receipt schema keeps numbering actor status valuation and PO consumption server-owned', () => {
  const line = schema.match(/export const receiveInventoryItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const body = schema.match(/export const receiveInventoryBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['poItemId', 'itemId', 'quantity', 'acceptedQty', 'rejectedQty']) {
    assert.match(line, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(line, /unitCost|lineTotal|receivedQty|companyId/);
  assert.match(body, /purchaseOrderId:\s*uuidSchema/);
  assert.match(body, /warehouseId:\s*uuidSchema/);
  assert.match(body, /items:\s*z\.array\(receiveInventoryItemInputSchema\)\.min\(1\)/);
  for (const field of ['projectId', 'receiptNo', 'receivedAt', 'receivedBy', 'status', 'unitCost', 'purchaseOrderReceivedQty']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(schemaGate, /receiptUnitCostAcceptedFromBrowser: false/);
  assert.match(schemaGate, /receiptNumberAcceptedFromBrowser: false/);
  assert.match(schemaGate, /receiptAcceptedRejectedEquationInvented: false/);
});

// Transfer input cannot provide calculated cost or Project ownership and cannot transfer to itself.
test('Pass 247 transfer schema stays warehouse based and valuation-safe', () => {
  const body = schema.match(/export const transferInventoryBodySchema =[\s\S]*?destinationWarehouseId[\s\S]*?\}\);/)?.[0] ?? '';
  for (const field of ['sourceWarehouseId', 'destinationWarehouseId', 'itemId', 'quantity']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['projectId', 'unitCost', 'sourceType', 'sourceId', 'transactionType']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(body, /Source and destination warehouses must be different/);
  assert.match(schemaGate, /transferHeaderInvented: false/);
  assert.match(schemaGate, /transferDirectionEnumInvented: false/);
});

// Issue input names the Project and Module-6 cost dimensions, while cost and source linkage stay internal.
test('Pass 247 issue schema keeps valuation and Module-7 actual cost server-owned', () => {
  const body = schema.match(/export const issueInventoryBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['warehouseId', 'projectId', 'itemId', 'quantity', 'wbsNodeId', 'costCodeId', 'costTypeId']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['unitCost', 'costStructureId', 'calculatedActualCost', 'sourceType', 'sourceId']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(schemaGate, /issueCostAcceptedFromBrowser: false/);
  assert.match(schemaGate, /module7ActualSourceTokenExposed: false/);
});

// Return remains direction-neutral by referencing an existing ledger movement rather than inventing a return enum.
test('Pass 247 preserves return-direction ambiguity without an enum or dedicated permission', () => {
  const body = schema.match(/export const returnInventoryBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['sourceTransactionId', 'quantity', 'reason']) assert.match(body, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(body, /direction|returnType|warehouseId|projectId|unitCost/);
  const permissions = schema.match(/export const MODULE_10_PERMISSION_CODES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.doesNotMatch(permissions, /inventory\.return(?:'|\")/);
  assert.match(schemaGate, /returnDirectionEnumInvented: false/);
  assert.match(schemaGate, /returnPermissionInvented: false/);
  assert.match(schemaGate, /returnReferenceConvention: 'existing stock transaction'/);
});

// Adjustment uses a signed business quantity only; resulting balance and cost remain calculated.
test('Pass 247 adjustment schema uses a signed non-zero delta without exposing balance authority', () => {
  const body = schema.match(/export const adjustInventoryBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['warehouseId', 'itemId', 'quantityDelta', 'reason']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['quantityOnHand', 'reservedQuantity', 'averageCost', 'unitCost', 'status', 'approvalResult']) {
    assert.doesNotMatch(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(schema, /quantity delta must be a non-zero exact decimal string/);
  assert.match(schemaGate, /adjustmentDirectionEnumInvented: false/);
  assert.match(schemaGate, /stockCountSessionInvented: false/);
});

// All inventory quantities/costs cross the HTTP boundary as exact strings.
test('Pass 247 uses exact four-decimal strings for Inventory quantities and costs', () => {
  assert.match(schema, /quantity must be a positive exact decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /quantity must be a non-negative exact decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /unit cost must be a non-negative exact decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schemaGate, /exactDecimalStringsUsed: true/);
  assert.match(schemaGate, /decimalScale: 4/);
});

// Response DTOs expose reviewed data while keeping Company and source-token internals out.
test('Pass 247 response schemas expose safe item balance receipt and stock movement readback', () => {
  const item = schema.match(/export const inventoryItemResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const balance = schema.match(/export const inventoryBalanceResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const receipt = schema.match(/export const goodsReceiptResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const stock = schema.match(/export const stockTransactionResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(item, /valuationMethod/);
  assert.match(balance, /quantityOnHand/);
  assert.match(balance, /reservedQuantity/);
  assert.match(balance, /averageCost/);
  assert.match(receipt, /receiptNo/);
  assert.match(receipt, /receivedBy/);
  assert.match(stock, /transactionType/);
  assert.match(stock, /costStructureId/);
  assert.doesNotMatch(`${item}\n${balance}\n${receipt}\n${stock}`, /companyId/);
  assert.doesNotMatch(stock, /sourceType|sourceId|calculatedActualCost/);
  assert.match(schemaGate, /stockSourceTokensExposedInResponse: false/);
});

// Transfer response represents the two ledger sides without inventing a seventh persistence resource.
test('Pass 247 transfer response returns exactly two stock movements without a transfer header model', () => {
  const response = schema.match(/export const transferInventoryResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(response, /z\.array\(stockTransactionResponseSchema\)\.length\(2\)/);
  assert.doesNotMatch(schema, /transferId|transferNo|transferStatus/);
  assert.match(schemaGate, /transferHeaderInvented: false/);
});

// Freeze all six stable business errors at this boundary without expanding the public vocabulary.
test('Pass 247 exposes only the reviewed Inventory error vocabulary', () => {
  for (const code of [
    'ITEM_NOT_FOUND', 'WAREHOUSE_NOT_FOUND', 'INSUFFICIENT_STOCK',
    'RECEIPT_EXCEEDS_PO', 'INVALID_UNIT_CONVERSION', 'STOCK_PERIOD_LOCKED',
  ]) assert.match(schema, new RegExp(`'${code}'`));
  assert.match(schema, /export function createModule10Error\(code: Module10ErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ConflictError/);
  assert.doesNotMatch(schema, /RETURN_NOT_ALLOWED|VALUATION_METHOD_UNSUPPORTED|WAREHOUSE_SCOPE_FORBIDDEN/);
  assert.match(schemaGate, /reviewedErrorCount: 6/);
});

// Keep the five source-defined events visible without emitting runtime audit/outbox behavior in the schema pass.
test('Pass 247 freezes the five Inventory events without runtime emission', () => {
  for (const event of [
    'inventory.received', 'inventory.transferred', 'inventory.issued', 'inventory.returned', 'inventory.adjusted',
  ]) assert.match(schema, new RegExp(event.replaceAll('.', '\\.')));
  assert.doesNotMatch(schema, /outbox\.|audit\.|repository\.|prisma\./);
  assert.match(schemaGate, /reviewedEventCount: 5/);
});

// Server-owned Inventory authority is exported centrally and not accepted by normal bodies.
test('Pass 247 freezes server-owned Inventory request authority', () => {
  for (const field of [
    'companyId', 'actorUserId', 'allowedProjectIds', 'receiptNo', 'receivedAt', 'receivedBy', 'status',
    'quantityOnHand', 'reservedQuantity', 'averageCost', 'unitCost', 'transactionType', 'sourceType', 'sourceId',
    'costStructureId', 'occurredAt', 'calculatedActualCost', 'purchaseOrderReceivedQty',
  ]) assert.match(schema, new RegExp(`'${field}'`));
  assert.match(schemaGate, /calculatedBalancesAcceptedFromBrowser: false/);
  assert.match(schemaGate, /calculatedCostsAcceptedFromBrowser: false/);
  assert.match(schemaGate, /poConsumptionAcceptedFromBrowser: false/);
});

// Pass 247 remains the reviewed schema checkpoint after Pass 248 appends persistence access.
test('Pass 247 schema boundary remains intact after repository generation', async () => {
  assert.equal(rootPackage.scripts['module-10:schema:gate'], 'node scripts/module-10/verify-stage-15-schema.mjs');
  assert.match(schemaGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(schemaGate, /STAGE_15_MODULE_10_SCHEMA_READY_FOR_PASS_248/);
  assert.match(schemaGate, /STAGE_15_MODULE_10_SCHEMA_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage14LiveAccepted/);
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
  assert.match(schemaGate, /Pass 248 - Module 10 Company\/Project-scoped repository/);
  await access('apps/api/src/modules/inventory/inventory.schema.ts');
  await access('apps/api/src/modules/inventory/inventory.repository.ts');
  await access('apps/api/src/modules/inventory/inventory.service.ts');
  await access('apps/api/src/modules/inventory/inventory.routes.ts');
  await access('apps/api/src/modules/inventory/index.ts');
});

// Pass 248 introduces only the reviewed repository layer and keeps service/HTTP/UI generation deferred.
test('Pass 248 adds the transaction-capable Inventory repository only', async () => {
  assert.match(repository, /export class InventoryRepository/);
  assert.match(repository, /DatabaseClient \| TransactionClient/);
  assert.match(repository, /constructor\(private readonly db: RepositoryClient\)/);
  await access('apps/api/src/modules/inventory/inventory.repository.ts');
  await access('apps/api/src/modules/inventory/inventory.service.ts');
  await access('apps/api/src/modules/inventory/inventory.routes.ts');
  await access('apps/api/src/modules/inventory/index.ts');
});

// Company ownership is mandatory and mixed company/project Warehouse reads accept explicit Module-24B visibility.
test('Pass 248 scopes Inventory item Warehouse balance and stock reads by trusted Company and Project visibility', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /InventoryProjectVisibilityRepositoryInput/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /includeCompanyWideWarehouses: boolean/);
  assert.match(repository, /buildWarehouseVisibilityWhere/);
  assert.match(repository, /buildStockTransactionVisibilityWhere/);
  for (const method of ['listInventoryItems', 'findInventoryItemById', 'findWarehouseById', 'listInventoryBalances', 'findInventoryBalance', 'findStockTransactionById']) {
    assert.match(repository, new RegExp(`async ${method}`));
  }
  assert.match(repositoryGate, /companyOwnershipFromTrustedRequestContext: true/);
  assert.match(repositoryGate, /projectVisibilityRequiredForWarehouseScopedReads: true/);
});

// List reads remain bounded and do not invent business search/filter fields absent from the source API contract.
test('Pass 248 keeps Inventory item and balance repository pagination bounded without invented filters', () => {
  assert.match(repository, /MODULE_10_MAX_PAGE_SIZE/);
  assert.match(repository, /assertPageWindow/);
  assert.match(repository, /async listInventoryItems/);
  assert.match(repository, /async listInventoryBalances/);
  assert.doesNotMatch(repository, /contains:|mode: 'insensitive'|search:/);
  assert.match(repositoryGate, /paginationBounded: true/);
  assert.match(repositoryGate, /businessListFiltersInvented: false/);
});

// Item persistence accepts server-reviewed status/valuation values but does not invent update/delete/uniqueness policy.
test('Pass 248 prepares Company-owned item create persistence without inventing item lifecycle rules', () => {
  assert.match(repository, /async createInventoryItem/);
  assert.match(repository, /data: scope\.createData/);
  for (const field of ['itemCode', 'name', 'category', 'baseUnit', 'status', 'valuationMethod']) {
    assert.match(repository, new RegExp(`${field}: input\.${field}`));
  }
  assert.doesNotMatch(repository, /inventoryItem\.(update|delete|upsert)/);
  assert.match(repositoryGate, /itemUpdateDeleteMethodsGenerated: false/);
  assert.match(repositoryGate, /itemCodeUniquenessInvented: false/);
});

// Balance writes expose a lock plus service-calculated update primitive; valuation and negative-stock policy stay above the repository.
test('Pass 248 prepares concurrency-safe balance primitives without deciding valuation or stock policy', () => {
  assert.match(repository, /async ensureAndLockInventoryBalance/);
  assert.match(repository, /inventoryBalance\.upsert/);
  assert.match(repository, /FOR UPDATE OF balance/);
  assert.match(repository, /async updateInventoryBalance/);
  assert.match(repository, /quantityOnHand: input\.quantityOnHand/);
  assert.match(repository, /averageCost: input\.averageCost/);
  assert.doesNotMatch(repository, /calculateAverage|weightedAverage|valuationMethod ===|INSUFFICIENT_STOCK|negative stock/i);
  assert.match(repositoryGate, /balanceWriteLockPrepared: true/);
  assert.match(repositoryGate, /valuationPolicyDecidedInRepository: false/);
  assert.match(repositoryGate, /negativeStockPolicyDecidedInRepository: false/);
});

// Receipt primitives lock both the PO and PO lines so later service transactions can enforce open quantity atomically.
test('Pass 248 prepares atomic PO receipt persistence and consumption locks', () => {
  assert.match(repository, /async findPurchaseOrderForReceipt/);
  assert.match(repository, /async lockPurchaseOrderForReceipt/);
  assert.match(repository, /async lockPurchaseOrderItemsForReceipt/);
  assert.match(repository, /FOR UPDATE OF line/);
  assert.match(repository, /async incrementPurchaseOrderItemReceivedQty/);
  assert.match(repository, /receivedQty: \{ increment: receivedQtyDelta \}/);
  assert.match(repository, /async createGoodsReceipt/);
  assert.match(repository, /this\.db\.goodsReceipt\.create/);
  assert.match(repository, /items: \{[\s\S]*create: input\.items\.map/);
  assert.match(repositoryGate, /purchaseOrderReceiptLockPrepared: true/);
  assert.match(repositoryGate, /purchaseOrderLineReceiptLocksPrepared: true/);
  assert.match(repositoryGate, /poReceivedQuantityUpdatePrimitivePrepared: true/);
});

// Receipt business equations, tolerance, status and valuation remain service responsibilities.
test('Pass 248 does not decide receipt quantity quality valuation or lifecycle policy', () => {
  assert.doesNotMatch(repository, /acceptedQty \+ rejectedQty|RECEIPT_EXCEEDS_PO|tolerance|receipt status transition/i);
  assert.doesNotMatch(repository, /unitRate.*acceptedQty|calculate.*unitCost|valuationMethod ===/i);
  assert.match(repositoryGate, /receiptToleranceDecidedInRepository: false/);
  assert.match(repositoryGate, /receiptQualityEquationInvented: false/);
  assert.match(repositoryGate, /receiptValuationDecidedInRepository: false/);
  assert.match(repositoryGate, /receiptLifecycleDecidedInRepository: false/);
});

// Stock history is append-only in this repository: it can read or create movements but never mutate existing rows.
test('Pass 248 prepares append-only stock movement primitives with no update or delete capability', () => {
  assert.match(repository, /async findStockTransactionById/);
  assert.match(repository, /async listStockTransactionsBySource/);
  assert.match(repository, /async createStockTransaction/);
  assert.match(repository, /this\.db\.stockTransaction\.create/);
  assert.doesNotMatch(repository, /stockTransaction\.(update|updateMany|delete|deleteMany|upsert)/);
  assert.doesNotMatch(repository, /const\s+(TRANSFER|ISSUE|RETURN|ADJUST|RECEIPT)_/);
  assert.match(repositoryGate, /stockLedgerAppendOnlyRepository: true/);
  assert.match(repositoryGate, /stockTransactionTypeVocabularyInvented: false/);
  assert.match(repositoryGate, /stockSourceTokenVocabularyInvented: false/);
});

// Module-6 cost mappings are read-only validated before stock or job-cost source writes.
test('Pass 248 prepares posting-enabled Module 6 cost-structure lookup without mutating Module 6', () => {
  assert.match(repository, /async findPostingCostStructure/);
  assert.match(repository, /this\.db\.projectCostCode\.findFirst/);
  assert.match(repository, /isPostingAllowed: true/);
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId']) assert.match(repository, new RegExp(field));
  assert.doesNotMatch(repository, /projectCostCode\.(create|update|delete|upsert)/);
  assert.match(repositoryGate, /module6CostStructureReadPrepared: true/);
});

// Module-7 actual cost integration is an append-only source primitive with exact source vocabulary left to the service.
test('Pass 248 prepares idempotency-readable Module 7 actual-cost primitives without inventing source tokens', () => {
  assert.match(repository, /async findCostActualBySourceKey/);
  assert.match(repository, /companyId_projectId_sourceType_sourceId_sourceLineId/);
  assert.match(repository, /async createCostActual/);
  assert.match(repository, /this\.db\.costActual\.create/);
  assert.doesNotMatch(repository, /costActual\.(update|updateMany|delete|deleteMany|upsert)/);
  assert.doesNotMatch(repository, /const\s+INVENTORY_ACTUAL_SOURCE_TYPE/);
  assert.match(repositoryGate, /module7ActualReadPrimitivePrepared: true/);
  assert.match(repositoryGate, /module7ActualCreatePrimitivePrepared: true/);
  assert.match(repositoryGate, /actualSourceTypeInvented: false/);
});

// Pass 368 deliberately amends the old Warehouse/low-stock gap while preserving the remaining source boundaries.
test('Pass 248 source gaps remain historical while Pass 368 adds only the reviewed Warehouse/low-stock repair', () => {
  assert.match(repository, /async createWarehouse\(/);
  assert.match(repository, /async updateWarehouse\(/);
  assert.match(repository, /async listStockLedger\(/);
  assert.match(repository, /async listLowStockBalances\(/);
  assert.doesNotMatch(repository, /deleteWarehouse|inventoryTransfer|stockCount|unitConversion|reorderLevel/);
  assert.doesNotMatch(repository, /journal\.(create|update|upsert)|apInvoice\.(create|update|upsert)|payment\.(create|update|upsert)/);
  assert.match(repositoryGate, /warehouseWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /transferHeaderPersistenceInvented: false/);
  assert.match(repositoryGate, /stockCountPersistenceInvented: false/);
  assert.match(repositoryGate, /unitConversionPersistenceInvented: false/);
  assert.match(repositoryGate, /financeWriteMethodsGenerated: false/);
});

// Register the fail-honest repository gate while the previous Stage-14 live handoff remains authoritative.
test('Pass 248 registers the Stage-15 repository gate', () => {
  assert.equal(rootPackage.scripts['module-10:repository:gate'], 'node scripts/module-10/verify-stage-15-repository.mjs');
  assert.match(repositoryGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(repositoryGate, /STAGE_15_MODULE_10_REPOSITORY_READY_FOR_PASS_249/);
  assert.match(repositoryGate, /STAGE_15_MODULE_10_REPOSITORY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage14LiveAccepted/);
  assert.match(repositoryGate, /serviceGenerated: false/);
  assert.match(repositoryGate, /routesGenerated: false/);
  assert.match(repositoryGate, /reactGenerated: false/);
});


// Pass 249 introduces the reviewed service layer while keeping HTTP registration and UI deferred.
test('Pass 249 adds only the Inventory service layer on top of the reviewed repository', async () => {
  assert.match(service, /export class InventoryService/);
  assert.match(service, /constructor\(private readonly db: DatabaseClient\)/);
  await access('apps/api/src/modules/inventory/inventory.service.ts');
  await access('apps/api/src/modules/inventory/inventory.routes.ts');
  await access('apps/api/src/modules/inventory/index.ts');
});

// The original eight service operations remain intact and Pass 368 adds only its six reviewed repair operations.
test('Pass 249 source service operations remain intact after the narrow Pass 368 repair', () => {
  for (const method of [
    'listInventoryItems', 'createInventoryItem', 'listInventoryBalances', 'receiveInventory',
    'transferInventory', 'issueInventory', 'returnInventory', 'adjustInventory',
    'listWarehouses', 'createWarehouse', 'updateWarehouse', 'listStockLedger', 'setMinimumStock', 'listLowStock',
  ]) assert.match(service, new RegExp(`async ${method}\\(`));
  assert.doesNotMatch(service, /deleteWarehouse|createStockCount|updateStockTransaction|deleteStockTransaction/);
});

// Persisted RBAC plus Module-24B Project scope are revalidated in the service instead of trusting route role names.
test('Pass 249 revalidates Company Project and Warehouse resource policy', () => {
  assert.match(service, /AdministrationRepository/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /requireProjectPermission/);
  assert.match(service, /requireWarehousePermission/);
  assert.match(service, /projectScope\.kind === 'not-resolved'/);
  assert.match(service, /projectScope\.kind !== 'all'/);
  assert.doesNotMatch(service, /roleName|role\.name/);
});

// Retry-sensitive stock commands use the Foundation idempotency transaction instead of ad-hoc duplicate checks.
test('Pass 249 makes all five stock mutation commands idempotent', () => {
  assert.match(service, /executeIdempotentCommand/);
  for (const operation of [
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.return',
    'inventory.adjust',
  ]) assert.match(service, new RegExp(`operation: '${operation.replaceAll('.', '\\.')}'`));
  assert.match(serviceGate, /idempotentStockCommands: 5/);
});

// Receipt uses issued PO locks, rejects conversion/overreceipt and synchronizes stock and PO received quantity in one transaction.
test('Pass 249 implements fail-closed atomic PO receipt orchestration', () => {
  assert.match(service, /lockPurchaseOrderForReceipt/);
  assert.match(service, /lockPurchaseOrderItemsForReceipt/);
  assert.match(service, /PO_ISSUED = 'ISSUED'/);
  // Pass 369 replaces the historical fail-closed same-unit helper with approved factor-to-base lookup.
  assert.match(service, /resolveConversionFactor/);
  assert.match(service, /INVALID_UNIT_CONVERSION/);
  assert.match(service, /requireReceiptQualitySplit/);
  assert.match(service, /RECEIPT_EXCEEDS_PO/);
  assert.match(service, /createGoodsReceipt/);
  assert.match(service, /ensureAndLockInventoryBalance/);
  assert.match(service, /createStockTransaction/);
  assert.match(service, /incrementPurchaseOrderItemReceivedQty/);
  assert.match(serviceGate, /receiptPoBalanceLedgerAtomic: true/);
});

// The unresolved receipt quality fields are narrowed at runtime without changing the public request schema.
test('Pass 249 freezes a documented receipt accepted/rejected runtime convention', () => {
  assert.match(service, /Receipt quantity must equal accepted quantity plus rejected quantity/);
  assert.match(service, /acceptedQty === 0n/);
  assert.match(service, /incrementPurchaseOrderItemReceivedQty[\s\S]*?scale4ToDecimal\(acceptedQty\)/);
  assert.match(serviceGate, /receiptQualityConvention: 'quantity = acceptedQty \+ rejectedQty; acceptedQty alone enters stock and PO received_qty'/);
});

// Valuation remains server-owned and uses the already persisted average_cost field without inventing a browser valuation enum.
test('Pass 249 keeps valuation server-owned with an explicit average-cost implementation convention', () => {
  assert.match(service, /weightedAverageCost/);
  assert.match(service, /sourceBalance\.averageCost/);
  assert.match(service, /balance\.averageCost/);
  assert.doesNotMatch(service, /input\.unitCost|input\.averageCost|input\.calculatedActualCost/);
  assert.doesNotMatch(service, /switch\s*\(.*valuationMethod|valuationMethod\s*===/);
  assert.match(serviceGate, /valuationPublicEnumInvented: false/);
  assert.match(serviceGate, /valuationImplementationConvention: 'inventory_balances.average_cost weighted by accepted server-costed inflows'/);
});

// Transfer is a balanced two-sided append-only movement and cannot consume reserved stock or go negative.
test('Pass 249 implements atomic balanced transfer with deterministic balance locks', () => {
  assert.match(service, /STOCK_TRANSFER_OUT = 'TRANSFER_OUT'/);
  assert.match(service, /STOCK_TRANSFER_IN = 'TRANSFER_IN'/);
  assert.match(service, /availableQuantity\(sourceBalance\)/);
  assert.match(service, /INSUFFICIENT_STOCK/);
  assert.match(service, /\[sourceWarehouse\.id, destinationWarehouse\.id\]\.sort\(\)/);
  assert.match(service, /quantity: scale4ToDecimal\(-quantity\)/);
  assert.match(service, /quantity: scale4ToDecimal\(quantity\)/);
  assert.match(serviceGate, /transferQuantityConserved: true/);
});

// Project issues validate Module-6 posting scope and append exactly one Module-7 actual source in the same transaction.
test('Pass 249 implements issue to Project cost structure plus Module 7 actual cost', () => {
  assert.match(service, /findPostingCostStructure/);
  assert.match(service, /STOCK_ISSUE = 'ISSUE'/);
  assert.match(service, /findCostActualBySourceKey/);
  assert.match(service, /createCostActual/);
  assert.match(service, /JOB_COST_SOURCE_INVENTORY_ISSUE/);
  assert.match(service, /quantityCostToMoney/);
  assert.match(serviceGate, /issueJobCostAtomic: true/);
  assert.match(serviceGate, /module7ActualUpdateDeleteGenerated: false/);
});

// The undefined return route fails closed to one conservative interpretation and does not invent inventory.return permission.
test('Pass 249 keeps return semantics narrow and permission vocabulary unchanged', () => {
  assert.match(service, /supports returns only as reversals of a prior Project Inventory issue/);
  assert.match(service, /'inventory\.issue'/);
  assert.match(service, /'inventory\.adjust'/);
  assert.match(service, /JOB_COST_SOURCE_INVENTORY_RETURN/);
  assert.match(service, /amount: quantityCostToMoney\(-requestedQuantity, sourceUnitCost\)/);
  assert.doesNotMatch(service, /'inventory\.return'\s*,\s*now\)|inventory\.return(?:'|")\s+permission/);
  assert.match(serviceGate, /returnPermissionInvented: false/);
  assert.match(serviceGate, /returnImplementationConvention: 'prior Project ISSUE reversal requiring both inventory.issue and inventory.adjust'/);
});

// Adjustment stays a reasoned signed ledger movement rather than inventing count sessions or approval persistence.
test('Pass 249 direct adjustment remains intact after Pass 369 adds a separate count repair', () => {
  const directAdjustment = service.slice(service.indexOf('private async adjustInventoryOnce('), service.indexOf('\n  }', service.indexOf('private async adjustInventoryOnce(')) + 4);
  assert.match(directAdjustment, /quantityDelta/);
  assert.match(service, /STOCK_ADJUSTMENT = 'ADJUSTMENT'/);
  assert.match(directAdjustment, /reason: input\.reason/);
  assert.doesNotMatch(directAdjustment, /approvalRequest|approvalDefinition/);
  assert.match(serviceGate, /inventoryApprovalWorkflowInvented: false/);
});

// Every reviewed stock event is emitted through the Foundation outbox and sensitive writes are audited in the same transaction.
test('Pass 249 writes audit and exactly the five reviewed Inventory domain events', () => {
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  for (const event of [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted',
  ]) assert.match(service, new RegExp(`eventType: '${event.replaceAll('.', '\\.')}'`));
  assert.doesNotMatch(service, /eventType: 'inventory\.item/);
  assert.match(serviceGate, /reviewedOutboxEventCount: 5/);
});

// Stage 15 still does not invent a Finance stock adapter or equate stock locks with Finance fiscal periods.
test('Pass 249 Finance boundary remains intact while Pass 369 gives stock periods an Inventory owner', () => {
  assert.doesNotMatch(service, /FinanceRepository|JournalRepository|ApInvoice|paymentAllocation|glAccount/);
  assert.doesNotMatch(service, /fiscalPeriod|accountingPeriod/);
  assert.match(service, /createModule10Error\('STOCK_PERIOD_LOCKED'\)/);
  assert.match(service, /findLockedInventoryStockPeriodForDate/);
  assert.match(serviceGate, /financeWriteGenerated: false/);
});

// Register the fail-honest service gate while the previous Stage-14 live handoff remains authoritative.
test('Pass 249 registers the Stage-15 service gate and Pass-250 handoff', () => {
  assert.equal(rootPackage.scripts['module-10:service:gate'], 'node scripts/module-10/verify-stage-15-service.mjs');
  assert.match(serviceGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(serviceGate, /STAGE_15_MODULE_10_SERVICE_READY_FOR_PASS_250/);
  assert.match(serviceGate, /STAGE_15_MODULE_10_SERVICE_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /routesGenerated: false/);
  assert.match(serviceGate, /indexGenerated: false/);
  assert.match(serviceGate, /reactGenerated: false/);
  assert.match(serviceGate, /Pass 250 - Module 10 Fastify routes, authentication\/RBAC, OpenAPI and module registration/);
});

// Pass 250 introduces only the reviewed HTTP/module registration layer after service completion.
test('Pass 250 adds Inventory Fastify routes and the five-file module index', async () => {
  await access('apps/api/src/modules/inventory/inventory.routes.ts');
  await access('apps/api/src/modules/inventory/index.ts');
  assert.match(routes, /export async function registerInventoryRoutes/);
  assert.match(index, /registerInventoryRoutes/);
  assert.match(index, /InventoryService/);
  assert.match(index, /InventoryRepository/);
});

// The original eight routes remain first-class while Pass 368 appends only six reviewed repair operations.
test('Pass 250 source routes remain unchanged and Pass 368 appends exactly six repair routes', () => {
  const routeCalls = [...routes.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.deepEqual(routeCalls, [
    'GET /api/v1/inventory/items',
    'POST /api/v1/inventory/items',
    'GET /api/v1/inventory/items/:id/unit-conversions',
    'PUT /api/v1/inventory/items/:id/unit-conversions',
    'POST /api/v1/inventory/counts',
    'GET /api/v1/inventory/counts/:id',
    'POST /api/v1/inventory/counts/:id/reconcile',
    'GET /api/v1/inventory/stock-periods',
    'POST /api/v1/inventory/stock-periods',
    'POST /api/v1/inventory/stock-periods/:id/lock',
    'GET /api/v1/inventory/balances',
    'GET /api/v1/inventory/warehouses',
    'POST /api/v1/inventory/warehouses',
    'PATCH /api/v1/inventory/warehouses/:id',
    'GET /api/v1/inventory/stock-ledger',
    'PUT /api/v1/inventory/balances/minimum-stock',
    'GET /api/v1/inventory/low-stock',
    'POST /api/v1/inventory/receipts',
    'POST /api/v1/inventory/transfers',
    'POST /api/v1/inventory/issues',
    'POST /api/v1/inventory/returns',
    'POST /api/v1/inventory/adjustments',
  ]);
  assert.match(httpGate, /exactReviewedRouteCount: 8/);
});

// Every route must authenticate before entering service/resource-policy evaluation.
test('Pass 250 requires active authentication for every Inventory route', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 22);
  assert.match(routes, /security: BEARER_SECURITY/g);
  assert.match(httpGate, /authenticationRequiredForAllRoutes: true/);
  assert.match(httpGate, /serviceResourcePolicyRemainsAuthoritative: true/);
});

// Route boundaries must parse with the already-frozen Zod schemas and validate responses again.
test('Pass 250 keeps Zod request and response schemas authoritative', () => {
  for (const requestSchema of [
    'listInventoryItemsQuerySchema',
    'createInventoryItemBodySchema',
    'listInventoryBalancesQuerySchema',
    'receiveInventoryBodySchema',
    'transferInventoryBodySchema',
    'issueInventoryBodySchema',
    'returnInventoryBodySchema',
    'adjustInventoryBodySchema',
  ]) assert.match(routes, new RegExp(`parseRequest\\(${requestSchema}`));
  for (const responseSchema of [
    'listInventoryItemsResponseSchema',
    'createInventoryItemResponseSchema',
    'listInventoryBalancesResponseSchema',
    'receiveInventoryResponseSchema',
    'transferInventoryResponseSchema',
    'issueInventoryResponseSchema',
    'returnInventoryResponseSchema',
    'adjustInventoryResponseSchema',
  ]) assert.match(routes, new RegExp(`${responseSchema}\\.parse`));
  assert.match(httpGate, /strictZodBoundaryRetained: true/);
  assert.match(httpGate, /responseZodValidationRetained: true/);
});

// Retry-sensitive stock commands require a bounded Idempotency-Key while item creation remains unchanged.
test('Pass 250 exposes Foundation idempotency only on the five stock commands', () => {
  assert.match(routes, /const IDEMPOTENCY_HEADERS_JSON_SCHEMA/);
  assert.match(routes, /required: \['idempotency-key'\]/);
  assert.match(routes, /function readIdempotencyKey/);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 7);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 7);
  assert.match(httpGate, /idempotentCommandRouteCount: 5/);
});

// OpenAPI must describe exact-decimal strings instead of lossy JSON numbers for stock quantity/cost fields.
test('Pass 250 keeps Inventory decimals exact in OpenAPI', () => {
  assert.match(routes, /const POSITIVE_DECIMAL_JSON_SCHEMA/);
  assert.match(routes, /const NON_NEGATIVE_DECIMAL_JSON_SCHEMA/);
  assert.match(routes, /const NON_ZERO_SIGNED_DECIMAL_JSON_SCHEMA/);
  assert.doesNotMatch(routes, /quantity:\s*\{\s*type: 'number'/);
  assert.doesNotMatch(routes, /unitCost:\s*\{\s*type: 'number'/);
  assert.doesNotMatch(routes, /averageCost:\s*\{\s*type: 'number'/);
  assert.match(httpGate, /exactDecimalOpenApiSerialization: true/);
});

// Server-owned fields must stay absent from HTTP request bodies.
test('Pass 250 does not expose server-owned stock or ownership fields as request authority', () => {
  const forbidden = [
    'companyId', 'actorUserId', 'allowedProjectIds', 'receiptNo', 'receivedAt', 'receivedBy',
    'status', 'quantityOnHand', 'reservedQuantity', 'averageCost', 'unitCost', 'transactionType',
    'sourceType', 'sourceId', 'costStructureId', 'occurredAt', 'calculatedActualCost', 'purchaseOrderReceivedQty',
  ];
  const bodyRegion = routes.slice(routes.indexOf("app.post('/api/v1/inventory/items'"));
  for (const field of forbidden) {
    assert.doesNotMatch(bodyRegion, new RegExp(`\\b${field}:\\s*[^,]+JSON_SCHEMA`));
  }
  assert.match(httpGate, /serverOwnedRequestAuthorityExposed: false/);
});

// Stable error codes are documented without leaking implementation-only conflicts.
test('Pass 250 documents reviewed Inventory and shared Foundation errors', () => {
  for (const code of [
    'ITEM_NOT_FOUND',
    'WAREHOUSE_NOT_FOUND',
    'INSUFFICIENT_STOCK',
    'RECEIPT_EXCEEDS_PO',
    'INVALID_UNIT_CONVERSION',
    'STOCK_PERIOD_LOCKED',
  ]) assert.match(routes, new RegExp(`'${code}'`));
  assert.match(routes, /AUTH_SESSION_EXPIRED/);
  assert.match(routes, /FORBIDDEN/);
  assert.match(routes, /INVALID_REQUEST/);
  assert.doesNotMatch(routes, /RETURN_NOT_ALLOWED|VALUATION_METHOD_UNSUPPORTED|WAREHOUSE_SCOPE_FORBIDDEN/);
  assert.match(httpGate, /reviewedErrorCount: 6/);
});

// Module registration must be automatic whenever buildApp receives the database dependency.
test('Pass 250 registers Inventory in the Fastify application exactly once', () => {
  assert.match(app, /import \{ registerInventoryRoutes \} from '\.\/modules\/inventory\/index\.js';/);
  assert.equal((app.match(/app\.register\(registerInventoryRoutes/g) ?? []).length, 1);
  assert.match(app, /app\.register\(registerInventoryRoutes, \{ database: options\.database \}\);/);
  assert.match(httpGate, /appRegistrationPrepared: true/);
});

// Pass 368 resolves only Warehouse/list-ledger/low-stock gaps; count, valuation and Finance APIs remain absent.
test('Pass 250 historical HTTP boundary is narrowly amended by Pass 368', () => {
  for (const repairRoute of [
    '/api/v1/inventory/warehouses',
    '/api/v1/inventory/stock-ledger',
    '/api/v1/inventory/balances/minimum-stock',
    '/api/v1/inventory/low-stock',
  ]) assert.match(routes, new RegExp(repairRoute.replaceAll('/', '\\/')));
  for (const forbiddenRoute of [
    '/api/v1/inventory/stock-counts',
    '/api/v1/inventory/valuation',
    '/api/v1/inventory/finance',
  ]) assert.doesNotMatch(routes, new RegExp(forbiddenRoute.replaceAll('/', '\\/')));
  assert.doesNotMatch(routes, /app\.delete\('\/api\/v1\/inventory\/warehouses/);
  assert.doesNotMatch(routes, /FinanceRepository|JournalRepository|ApInvoice|glAccount/);
  assert.match(httpGate, /warehouseCrudRoutesAdded: 0/);
  assert.match(httpGate, /stockLedgerReadRoutesAdded: 0/);
  assert.match(httpGate, /stockCountRoutesAdded: 0/);
  assert.match(httpGate, /financeRoutesAdded: 0/);
});

// Register the fail-honest HTTP/OpenAPI gate and the Pass-251 integration/security handoff.
test('Pass 250 registers the Stage-15 HTTP gate and Pass-251 handoff', () => {
  assert.equal(rootPackage.scripts['module-10:http:gate'], 'node scripts/module-10/verify-stage-15-http.mjs');
  assert.match(httpGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(httpGate, /STAGE_15_MODULE_10_HTTP_READY_FOR_PASS_251/);
  assert.match(httpGate, /STAGE_15_MODULE_10_HTTP_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage14LiveAccepted/);
  assert.match(httpGate, /Pass 251 - Module 10 PostgreSQL\/Fastify integration, generated OpenAPI and security verification/);
});


// Pass 251 adds live-capable integration/security verification without changing production runtime code.
test('Pass 251 adds the Module 10 PostgreSQL/Fastify integration-security harness only', async () => {
  await access('tests/integration/module-10-api.integration.test.mjs');
  await access('scripts/module-10/verify-stage-15-integration-security.mjs');
  assert.equal(rootPackage.scripts['module-10:integration-security:gate'], 'node scripts/module-10/verify-stage-15-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-10:integration-security:gate:live'], 'node scripts/module-10/verify-stage-15-integration-security.mjs --mode=live');
  assert.match(rootPackage.scripts['test:integration:module-10'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:integration:module-10'], /tests\/integration\/module-10-api\.integration\.test\.mjs/);
});

// The integration workflow must exercise every reviewed Inventory HTTP operation through the real application boundary.
test('Pass 251 integration coverage exercises all eight reviewed Module 10 operations', () => {
  for (const path of [
    '/api/v1/inventory/items',
    '/api/v1/inventory/balances',
    '/api/v1/inventory/receipts',
    '/api/v1/inventory/transfers',
    '/api/v1/inventory/issues',
    '/api/v1/inventory/returns',
    '/api/v1/inventory/adjustments',
  ]) assert.match(integrationTest, new RegExp(path.replaceAll('/', '\\/')));
  assert.match(integrationTest, /method: 'POST'[\s\S]*?url: '\/api\/v1\/inventory\/items'/);
  assert.match(integrationSecurityGate, /reviewedRouteCount: 8/);
});

// Receipt integration must prove idempotent PO consumption, balance and append-only ledger synchronization.
test('Pass 251 verifies idempotent PO receipt and stock synchronization', () => {
  assert.match(integrationTest, /module10-receipt-main/);
  assert.match(integrationTest, /replay\.json\(\)\.data\.id, received\.id/);
  assert.match(integrationTest, /goodsReceipt\.count/);
  assert.match(integrationTest, /transactionType: 'RECEIPT'/);
  assert.match(integrationTest, /poLine\.receivedQty\.toString\(\), '4'/);
  assert.match(integrationTest, /balance\.quantityOnHand\.toString\(\), '4'/);
  assert.match(integrationSecurityGate, /issued PO receipt updates Goods Receipt, append-only stock ledger, Inventory balance and PO received_qty atomically/);
});

// Project material issues and returns must prove one-time Module-7 actual-cost linkage without Finance posting.
test('Pass 251 verifies Inventory issue and return integration with Module 7 actual cost', () => {
  assert.match(integrationTest, /sourceType: 'inventory_issue'/);
  assert.match(integrationTest, /issueActual\.amount\.toString\(\), '25'/);
  assert.match(integrationTest, /sourceType: 'inventory_return'/);
  assert.match(integrationTest, /returnActual\.amount\.toString\(\), '-12\.5'/);
  assert.match(integrationSecurityGate, /module7IssueAndReturnActualsVerified/);
  assert.match(integrationSecurityGate, /financePostingWritesAdded: 0/);
});

// Security coverage must fail closed for unauthenticated, under-permissioned, restricted and foreign-company callers.
test('Pass 251 verifies authentication, RBAC, Project scope and cross-Company isolation', () => {
  assert.match(integrationTest, /statusCode, 401/);
  assert.match(integrationTest, /module10-reader@example\.test/);
  assert.match(integrationTest, /statusCode, 403/);
  assert.match(integrationTest, /data\.total, 1/);
  assert.match(integrationTest, /FOREIGN_ITEM_ID/);
  assert.match(integrationTest, /module10-foreign-receipt/);
  assert.match(integrationTest, /module10-cross-company-warehouse/);
  assert.match(integrationSecurityGate, /negativeAuthorizationVerified/);
  assert.match(integrationSecurityGate, /crossCompanyIsolationVerified/);
});

// Browser-owned fields and missing idempotency must stay rejected at the generated HTTP boundary.
test('Pass 251 verifies strict request authority and Idempotency-Key enforcement', () => {
  assert.match(integrationTest, /companyId: COMPANY_B_ID/);
  assert.match(integrationTest, /status: 'INACTIVE'/);
  assert.match(integrationTest, /errorCode\(response\), 'INVALID_REQUEST'/);
  assert.match(integrationTest, /module10-reader-adjust/);
  assert.match(integrationTest, /'idempotency-key': key/);
  assert.match(integrationTest, /stockCommand\(app, adminToken, '\/api\/v1\/inventory\/receipts', receiptPayload\(\), ''\)/);
});

// Business validation must retain fail-closed PO quantity, unit, stock and closed-Project behavior.
test('Pass 251 verifies core server-owned Inventory validation failures', () => {
  assert.match(integrationTest, /module10-bad-quality-split/);
  assert.match(integrationTest, /module10-unit-mismatch/);
  assert.match(integrationTest, /INVALID_UNIT_CONVERSION/);
  assert.match(integrationTest, /module10-over-receipt/);
  assert.match(integrationTest, /RECEIPT_EXCEEDS_PO/);
  assert.match(integrationTest, /module10-insufficient-transfer/);
  assert.match(integrationTest, /INSUFFICIENT_STOCK/);
  assert.match(integrationTest, /module10-closed-project-adjust/);
});

// Database-level security must backstop application policy and preserve immutable stock history.
test('Pass 251 verifies database Company/Project integrity and append-only stock transactions', () => {
  assert.match(integrationTest, /client\.inventoryBalance\.create/);
  assert.match(integrationTest, /same Company\|23514/);
  assert.match(integrationTest, /project-scoped warehouse\|23514/);
  assert.match(integrationTest, /client\.stockTransaction\.update/);
  assert.match(integrationTest, /client\.stockTransaction\.delete/);
  assert.match(integrationTest, /append-only\|55000/);
  assert.match(integrationSecurityGate, /appendOnlyLedgerDatabaseProtectionVerified/);
});

// Late failures must prove no partial receipt, PO consumption, stock, numbering or job-cost state can commit.
test('Pass 251 prepares transaction rollback verification for receipt and issue outbox failures', () => {
  assert.match(integrationTest, /installOutboxFailure\(client, 'inventory\.received'\)/);
  assert.match(integrationTest, /goodsReceipt\.count[\s\S]*?, 0/);
  assert.match(integrationTest, /line\.receivedQty\.toString\(\), '0'/);
  assert.match(integrationTest, /sequence\.nextValue, 1n/);
  assert.match(integrationTest, /installOutboxFailure\(client, 'inventory\.issued'\)/);
  assert.match(integrationTest, /costActual\.count[\s\S]*?sourceType: 'inventory_issue'/);
  assert.match(integrationSecurityGate, /transactionRollbackVerified/);
});

// Generated OpenAPI must remain exactly the reviewed route surface with bearer auth and five idempotent command headers.
test('Pass 251 prepares live OpenAPI verification without inventing Inventory routes', () => {
  assert.match(integrationTest, /document\.openapi, '3\.0\.3'/);
  assert.match(integrationTest, /module10ListInventoryItems/);
  assert.match(integrationTest, /module10AdjustInventory/);
  assert.match(integrationTest, /idempotency-key/);
  assert.match(integrationTest, /forbiddenPath/);
  assert.match(integrationTest, /\/api\/v1\/inventory\/warehouses/);
  assert.match(integrationTest, /\/api\/v1\/inventory\/ledger/);
  assert.match(integrationSecurityGate, /generatedOpenApiVerified/);
});

// Live verification must remain fail-honest until the preceding Stage-14 acceptance handoff is genuine.
test('Pass 251 integration-security gate honors the Stage-14 live handoff', () => {
  assert.match(integrationSecurityGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(integrationSecurityGate, /STAGE_14_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252/);
  assert.match(integrationSecurityGate, /STAGE_15_MODULE_10_INTEGRATION_SECURITY_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage14LiveAccepted/);
  assert.match(integrationSecurityGate, /Pass 252 - Module 10 React Inventory typed API client/);
});

// Pass 252 generates the React feature only after the reviewed integration/security boundary.
test('Pass 252 adds the four-file Inventory React feature and Stage-15 React gate', async () => {
  for (const relativePath of [
    'apps/web/src/features/inventory/api/inventory-api.ts',
    'apps/web/src/features/inventory/hooks/inventory.ts',
    'apps/web/src/features/inventory/components/inventory-workspace.tsx',
    'apps/web/src/features/inventory/pages/inventory-page.tsx',
    'scripts/module-10/verify-stage-15-react.mjs',
  ]) await access(relativePath);
  const gate = await readFile('scripts/module-10/verify-stage-15-react.mjs', 'utf8');
  assert.match(gate, /pass: 252/);
  assert.match(gate, /module-10-integration-security-regression/);
  assert.match(gate, /STAGE_15_MODULE_10_REACT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
});

// The browser client keeps the eight source operations and consumes exactly the six Pass-368 repair operations.
test('Pass 252 browser API preserves source operations and adds only the reviewed Pass 368 repair surface', async () => {
  const browserApi = await readFile('apps/web/src/features/inventory/api/inventory-api.ts', 'utf8');
  for (const route of [
    'inventory/items', 'inventory/balances', 'inventory/receipts', 'inventory/transfers',
    'inventory/issues', 'inventory/returns', 'inventory/adjustments', 'inventory/warehouses',
    'inventory/stock-ledger', 'inventory/balances/minimum-stock', 'inventory/low-stock',
  ]) assert.match(browserApi, new RegExp(route.replaceAll('/', '\\/')));
  assert.equal((browserApi.match(/authenticatedRequest</g) ?? []).length, 22);
  for (const forbidden of ['inventory/stock-counts', 'inventory/valuation', 'inventory/finance']) {
    assert.doesNotMatch(browserApi, new RegExp(forbidden.replaceAll('/', '\\/')));
  }
});

// Retry-sensitive stock commands must carry idempotency while item creation stays a normal POST.
test('Pass 252 generates retry keys for exactly the five stock commands', async () => {
  const browserApi = await readFile('apps/web/src/features/inventory/api/inventory-api.ts', 'utf8');
  const hooks = await readFile('apps/web/src/features/inventory/hooks/inventory.ts', 'utf8');
  assert.equal((browserApi.match(/headers: stockCommandHeaders\(idempotencyKey\)/g) ?? []).length, 7);
  assert.equal((hooks.match(/newIdempotencyKey\(\)/g) ?? []).length, 8);
  assert.match(hooks, /function newIdempotencyKey\(\): string \{[\s\S]*?crypto\.randomUUID\(\)/);
  assert.doesNotMatch(browserApi.slice(browserApi.indexOf('export function createInventoryItem'), browserApi.indexOf('export function listInventoryBalances')), /Idempotency-Key|stockCommandHeaders/);
});

// TanStack Query must own Inventory reads and invalidate only directly coupled source reads after writes.
test('Pass 252 hooks refresh Inventory, PO receipt progress and Module-7 actual cost readback', async () => {
  const hooks = await readFile('apps/web/src/features/inventory/hooks/inventory.ts', 'utf8');
  assert.match(hooks, /useQuery\(/);
  assert.match(hooks, /useMutation\(/);
  assert.match(hooks, /\['module-10', 'inventory'\]/);
  assert.match(hooks, /\['module-9', 'purchase-orders'\]/);
  assert.match(hooks, /\['module-7', 'budgets-job-cost'\]/);
  assert.match(hooks, /useReceiveInventory[\s\S]*?MODULE_9_QUERY_KEY/);
  assert.match(hooks, /useIssueInventory[\s\S]*?MODULE_7_QUERY_KEY/);
  assert.match(hooks, /useReturnInventory[\s\S]*?MODULE_7_QUERY_KEY/);
});

// React forms must use RHF plus Zod and preserve exact decimal strings instead of browser floating-point authority.
test('Pass 252 Inventory forms use React Hook Form and Zod exact-decimal validation', async () => {
  const workspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm</);
  assert.match(workspace, /useFieldArray/);
  assert.match(workspace, /function decimalScale4/);
  assert.match(workspace, /10_000n/);
  assert.match(workspace, /accepted \+ rejected !== quantity/);
  assert.doesNotMatch(workspace, /parseFloat\(|Number\(item\.quantity\)/);
});

// Pass 368 turns the previously explicit Warehouse/ledger/low-stock UI gaps into server-backed workflows.
test('Pass 252 Inventory UI remains intact and Pass 368 adds Warehouse ledger and low-stock workflows', async () => {
  const workspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
  for (const label of [
    'Item master', 'Warehouse / site-store master', 'Warehouse balances', 'Minimum stock policy',
    'PO receipt', 'Transfer stock', 'Issue material to Project', 'Return issued material',
    'Direct stock adjustment', 'Physical inventory count', 'Stock ledger', 'Low-stock view',
  ]) assert.match(workspace, new RegExp(label.replace('/', '\\/')));
  assert.match(workspace, /useWarehouses/);
  assert.match(workspace, /useStockLedger/);
  assert.match(workspace, /useSetMinimumStock/);
  assert.match(workspace, /useLowStock/);
  assert.doesNotMatch(workspace, /does not fabricate durable ledger history/i);
  assert.doesNotMatch(workspace, /does not guess a threshold/i);
});

// Client forms must not acquire ownership, lifecycle, valuation or calculated-cost authority.
test('Pass 252 does not send server-owned Inventory authority from React', async () => {
  const browserApi = await readFile('apps/web/src/features/inventory/api/inventory-api.ts', 'utf8');
  const inputRegion = browserApi.slice(browserApi.indexOf('export type CreateInventoryItemInput'), browserApi.indexOf('/** Build the only documented Inventory list query'));
  for (const forbidden of [
    'companyId', 'actorUserId', 'allowedProjectIds', 'receiptNo', 'receivedAt', 'receivedBy',
    'status', 'quantityOnHand', 'reservedQuantity', 'averageCost', 'unitCost', 'transactionType',
    'sourceType', 'sourceId', 'costStructureId', 'occurredAt', 'calculatedActualCost', 'purchaseOrderReceivedQty',
  ]) assert.doesNotMatch(inputRegion, new RegExp(`\\b${forbidden}\\b`));
});

// Return visibility must keep the service's conservative issue+adjust authority instead of inventing inventory.return.
test('Pass 252 preserves the frozen return permission convention', async () => {
  const page = await readFile('apps/web/src/features/inventory/pages/inventory-page.tsx', 'utf8');
  const workspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
  assert.doesNotMatch(page, /inventory\.return/);
  assert.doesNotMatch(workspace, /inventory\.return/);
  assert.match(workspace, /const canReturn = props\.canIssue && props\.canAdjust/);
  assert.match(workspace, /prior-ISSUE reversal convention/);
});

// Existing shell navigation must expose Module 10 only through approved permissions/project scope.
test('Pass 252 registers Inventory in the permission-aware admin shell', async () => {
  const shell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
  assert.match(shell, /import \{ InventoryPage \}/);
  for (const permission of ['inventory.read', 'inventory.item.manage', 'inventory.receive', 'inventory.transfer', 'inventory.issue', 'inventory.adjust']) {
    assert.match(shell, new RegExp(permission.replace('.', '\\.')));
  }
  assert.match(shell, /canUseModule10/);
  assert.match(shell, /setView\('inventory'\)/);
  assert.match(shell, /<InventoryPage \/>/);
});

// The React gate must remain fail-honest about absent Stage-14 live handoff and dependency-backed browser build.
test('Pass 252 registers the Stage-15 React gate without claiming live runtime completion', async () => {
  const gate = await readFile('scripts/module-10/verify-stage-15-react.mjs', 'utf8');
  assert.equal(rootPackage.scripts['module-10:react:gate'], 'node scripts/module-10/verify-stage-15-react.mjs');
  assert.match(gate, /dependencyBackedWebBuildRequired: true/);
  assert.match(gate, /runtimeVerificationComplete: false/);
  assert.match(gate, /productionBackendChanges: 0/);
  assert.match(gate, /databaseChanges: 0/);
  assert.match(gate, /publicRoutesAdded: 0/);
  assert.match(gate, /Pass 253 - Module 10 Playwright browser workflow verification/);
});

// Pass 253 adds only browser verification infrastructure after the prepared React boundary.
test('Pass 253 adds the Module 10 Playwright workflow and guarded Stage-15 gate', async () => {
  await access('tests/e2e/module-10-browser.spec.mjs');
  await access('scripts/module-10/verify-stage-15-playwright.mjs');
  assert.equal(rootPackage.scripts['test:e2e:module-10'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-10:playwright:gate'], 'node scripts/module-10/verify-stage-15-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-10:playwright:gate:live'], 'node scripts/module-10/verify-stage-15-playwright.mjs --mode=live');
});

// The shared Playwright configuration must isolate Module 10 exactly like earlier module browser gates.
test('Pass 253 registers isolated Module 10 Playwright selection', async () => {
  const config = await readFile('playwright.config.mjs', 'utf8');
  assert.match(config, /RUN_MODULE_10_E2E/);
  assert.match(config, /runModule10/);
  assert.match(config, /module-10-browser\.spec\.mjs/);
  assert.match(config, /enabledModuleCount !== 1/);
});

// Browser workflow must cover the complete supported Inventory movement chain rather than only page rendering.
test('Pass 253 browser covers Item, receipt, transfer, issue, return and adjustment workflows', async () => {
  const browser = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
  for (const marker of [
    'Create item',
    'PO receipt',
    'Transfer stock',
    'Issue material to Project',
    'Return issued material',
    'Inventory count adjustments',
    'GR-0001',
    'TRANSFER_OUT',
    'TRANSFER_IN',
    'ISSUE',
    'RETURN',
    'ADJUSTMENT',
  ]) assert.match(browser, new RegExp(marker));
});

// Browser traffic must remain inside the frozen eight-route contract and use idempotency for the five stock commands.
test('Pass 253 verifies browser route and Idempotency-Key authority boundaries', async () => {
  const browser = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
  assert.match(browser, /function isAllowedModule10Path/);
  assert.match(browser, /function assertModule10AuthorityBoundary/);
  assert.match(browser, /idempotencyKey: request\.headers\(\)\['idempotency-key'\]/);
  assert.match(browser, /expectedBodyKeys = new Map/);
  assert.match(browser, /receiptNo/);
  assert.match(browser, /purchaseOrderReceivedQty/);
  assert.match(browser, /expect\(createItem\?\.idempotencyKey\)\.toBeNull\(\)/);
  assert.match(browser, /toMatch\(\/\^\[0-9a-f-\]\{36\}\$\/i\)/);
});

// Browser verification must prove the resulting server state, source integration and five audited domain events.
test('Pass 253 verifies Inventory persistence, Module 7 actual cost and event reconciliation', async () => {
  const browser = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
  assert.match(browser, /poLine\.receivedQty\.toString\(\)\)\.toBe\('4'\)/);
  assert.match(browser, /issueActual\.amount\.toString\(\)\)\.toBe\('25'\)/);
  assert.match(browser, /returnActual\.amount\.toString\(\)\)\.toBe\('-12\.5'\)/);
  assert.match(browser, /projectBalance\.quantityOnHand\.toString\(\)\)\.toBe\('1\.5'\)/);
  assert.match(browser, /centralBalance\.quantityOnHand\.toString\(\)\)\.toBe\('1'\)/);
  for (const eventType of ['inventory.received', 'inventory.transferred', 'inventory.issued', 'inventory.returned', 'inventory.adjusted']) {
    assert.match(browser, new RegExp(eventType.replace('.', '\\.')));
  }
  assert.match(browser, /database\.journal\.count/);
});

// Permission-aware browser checks must hide mutation controls and independently verify direct API denial.
test('Pass 253 covers restricted Project reader UI and API denial', async () => {
  const browser = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
  assert.match(browser, /READER_EMAIL/);
  assert.match(browser, /PROJECT_WAREHOUSE_ID/);
  assert.match(browser, /CENTRAL_WAREHOUSE_ID/);
  assert.match(browser, /expect\(readerPage\.getByRole\('button', \{ name: 'Create item' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browser, /expect\(readerPage\.getByRole\('heading', \{ name: 'PO receipt' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browser, /deniedItem\.status\(\)\)\.toBe\(403\)/);
  assert.match(browser, /deniedIssue\.status\(\)\)\.toBe\(403\)/);
});

// Pass 368 resolves Warehouse/ledger/low-stock gaps while later Inventory/Finance browser APIs remain absent.
test('Pass 253 historical browser boundary is narrowly amended by Pass 368', async () => {
  const browser = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
  for (const repairPath of ['/inventory/warehouses', '/inventory/stock-ledger', '/inventory/low-stock']) {
    assert.match(browser, new RegExp(repairPath.replaceAll('/', '\\/')));
  }
  for (const forbidden of ['/inventory/stock-counts', '/inventory/valuation', '/inventory/finance']) {
    assert.doesNotMatch(browser, new RegExp(forbidden.replaceAll('/', '\\/')));
  }
  const gate = await readFile('scripts/module-10/verify-stage-15-playwright.mjs', 'utf8');
  assert.match(gate, /productionRuntimeFilesChanged: 0/);
  assert.match(gate, /databaseChanges: 0/);
  assert.match(gate, /newMigrations: 0/);
  assert.match(gate, /publicRoutesAdded: 0/);
});

// Live browser verification must remain blocked until the genuine Stage-14 handoff and explicit test guards exist.
test('Pass 253 Playwright gate remains fail-honest about Stage-14 live acceptance', async () => {
  const gate = await readFile('scripts/module-10/verify-stage-15-playwright.mjs', 'utf8');
  assert.match(gate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(gate, /STAGE_14_LIVE_HANDOFF_REQUIRED/);
  assert.match(gate, /RUN_MODULE_10_E2E_REQUIRED/);
  assert.match(gate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(gate, /STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254/);
  assert.match(gate, /STAGE_15_MODULE_10_PLAYWRIGHT_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(gate, /runtimeVerificationComplete: passed && mode === 'live' && stage14LiveAccepted/);
  assert.match(gate, /Pass 254 - Module 10 operational, migration and concurrency verification/);
});


// Pass 254 adds verification-only operational coverage over the existing Module-10 runtime and persistence boundary.
test('Pass 254 registers isolated Module 10 operational verification without production changes', () => {
  assert.equal(rootPackage.scripts['test:operations:module-10'].includes('--test-name-pattern="^Module 10 operational"'), true);
  assert.equal(rootPackage.scripts['module-10:operations:gate'], 'node scripts/module-10/verify-stage-15-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-10:operations:gate:live'], 'node scripts/module-10/verify-stage-15-operations.mjs --mode=live');
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
  assert.match(operationsGate, /financeWritesAdded: 0/);
});

// Concurrent receipt and issue requests must serialize so ordered/open quantity and available stock cannot be over-consumed.
test('Pass 254 prepares PO receipt and Project issue concurrency verification', () => {
  assert.match(integrationTest, /Module 10 operational concurrency prevents PO over-receipt and negative Project stock/);
  assert.match(integrationTest, /module10-ops-receipt-a/);
  assert.match(integrationTest, /module10-ops-receipt-b/);
  assert.match(integrationTest, /RECEIPT_EXCEEDS_PO/);
  assert.match(integrationTest, /receivedLine\.receivedQty\.toString\(\), '6'/);
  assert.match(integrationTest, /receiptSequence\.nextValue, 2n/);
  assert.match(integrationTest, /module10-ops-issue-a/);
  assert.match(integrationTest, /module10-ops-issue-b/);
  assert.match(integrationTest, /INSUFFICIENT_STOCK/);
  assert.match(integrationTest, /balance\.quantityOnHand\.toString\(\), '2'/);
  assert.match(integrationTest, /sourceType: 'inventory_issue'/);
});

// Opposing transfers must use the deterministic lock order already implemented by the service and preserve quantity.
test('Pass 254 prepares opposing transfer locking and ledger reconciliation verification', () => {
  assert.match(integrationTest, /Module 10 operational opposing transfers conserve stock and reviewed query plans use Stage-15 indexes/);
  assert.match(integrationTest, /module10-ops-transfer-a/);
  assert.match(integrationTest, /module10-ops-transfer-b/);
  assert.match(integrationTest, /sourceType: 'inventory_transfer'/);
  assert.match(integrationTest, /projectLedger\._sum\.quantity\?\.toString\(\), '0'/);
  assert.match(integrationTest, /otherLedger\._sum\.quantity\?\.toString\(\), '0'/);
  assert.match(service, /for \(const warehouseId of \[sourceWarehouse\.id, destinationWarehouse\.id\]\.sort\(\)\)/);
  assert.match(operationsGate, /deterministic Warehouse-ID order/);
});

// Reviewed Stage-15 indexes are verified through EXPLAIN without inventing unstable latency thresholds.
test('Pass 254 prepares Inventory query-plan verification without duration claims', () => {
  for (const index of [
    'inventory_items_company_code_idx',
    'warehouses_company_project_status_idx',
    'inventory_balances_warehouse_item_uq',
    'goods_receipts_po_status_idx',
    'stock_transactions_company_warehouse_item_occurred_idx',
    'stock_transactions_company_source_idx',
  ]) assert.match(integrationTest, new RegExp(index));
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
  assert.doesNotMatch(integrationTest, /performance\.now\(|Date\.now\(\)[\s\S]{0,100}(?:<|>)\s*\d+\s*(?:ms|milliseconds)/);
});

// Live operations cannot bypass Stage 14 or the Module-10 backend/browser live handoffs and must verify both migration paths first.
test('Pass 254 operations gate is fail-honest and verifies both supported migration paths before concurrency work', () => {
  assert.match(operationsGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(operationsGate, /STAGE_14_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252/);
  assert.match(operationsGate, /STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254/);
  assert.match(operationsGate, /STAGE_15_MODULE_10_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_15_MODULE_10_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-10/);
});

// Pass 254 is the final operational preparation step before the dedicated Stage-15 acceptance gate.
test('Pass 254 points only to Pass 255 final Stage-15 acceptance', () => {
  assert.match(operationsGate, /STAGE_15_MODULE_10_OPERATIONS_VERIFIED_READY_FOR_PASS_255/);
  assert.match(operationsGate, /STAGE_15_MODULE_10_OPERATIONS_PREPARED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /Pass 255 - Module 10 final Stage-15 acceptance gate/);
});


// Pass 255 closes Stage 15 with one final static/live acceptance boundary and no product behavior changes.
test('Pass 255 registers the final Module 10 Stage-15 acceptance scripts only', () => {
  assert.equal(rootPackage.scripts['module-10:gate'], 'node scripts/module-10/verify-stage-15.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-10:gate:live'], 'node scripts/module-10/verify-stage-15.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-10:acceptance:live'], 'node scripts/module-10/verify-stage-15.mjs --mode=live');
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
  assert.match(finalGate, /publicApiChanges: 0/);
});

// The final live acceptance cannot bypass Stage 14 or any prepared Stage-15 live proof.
test('Pass 255 preserves every required live handoff before Stage-15 acceptance', () => {
  assert.match(finalGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(finalGate, /STAGE_15_MODULE_10_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_252/);
  assert.match(finalGate, /STAGE_15_MODULE_10_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_254/);
  assert.match(finalGate, /STAGE_15_MODULE_10_OPERATIONS_VERIFIED_READY_FOR_PASS_255/);
  assert.match(finalGate, /STAGE_14_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_15_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_15_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_15_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
});

// The final static gate rechecks all hard prerequisites, Project scope, Module 10, workspace, migrations and syntax.
test('Pass 255 reruns the complete Stage-15 static acceptance surface', () => {
  for (const check of [
    'module-5-static-regression',
    'module-6-static-regression',
    'module-7-static-regression',
    'module-9-static-regression',
    'module-24b-static-regression',
    'module-10-static-suite',
    'full-static-regression',
    'workspace-contract',
    'migration-policy',
    'module-10-integration-test-syntax',
    'module-10-playwright-test-syntax',
    'playwright-config-syntax',
    'inventory-schema-syntax',
    'inventory-repository-syntax',
    'inventory-service-syntax',
    'inventory-routes-syntax',
    'api-app-syntax',
  ]) assert.match(finalGate, new RegExp(check));
});

// Genuine live acceptance installs dependencies and runs the DB/browser/operations chain plus reviewed prerequisite regressions.
test('Pass 255 prepares the guarded dependency-backed Stage-15 live acceptance chain', () => {
  for (const check of [
    'clean-install',
    'typecheck',
    'lint',
    'prisma-validate',
    'prisma-generate',
    'clean-and-previous-migrations',
    'build',
    'prepare-integration-database',
    'module-10-backend-security-integration',
    'module-10-browser-workflow',
    'module-10-operational-verification',
    'module-9-operational-regression',
    'module-7-operational-regression',
    'module-6-operational-regression',
    'module-5-operational-regression',
  ]) assert.match(finalGate, new RegExp(check));
  assert.match(finalGate, /MODULE_10_LIVE_GATE_CONFIRM/);
  assert.match(finalGate, /MIGRATION_TEST_CONFIRM/);
  assert.match(finalGate, /RUN_MODULE_10_E2E/);
});

// Freeze the final reviewed Inventory ownership and deferred-integration boundaries exactly.
test('Pass 255 freezes final Module 10 ownership routes permissions events and source gaps', () => {
  for (const table of [
    'inventory_items', 'warehouses', 'inventory_balances',
    'goods_receipts', 'goods_receipt_items', 'stock_transactions',
  ]) assert.match(finalGate, new RegExp(`'${table}'`));
  assert.match(finalGate, /routeCount: 8/);
  for (const permission of [
    'inventory.read',
    'inventory.item.manage',
    'inventory.receive',
    'inventory.transfer',
    'inventory.issue',
    'inventory.adjust',
  ]) assert.match(finalGate, new RegExp(permission.replaceAll('.', '\\.')));
  for (const event of [
    'inventory.received',
    'inventory.transferred',
    'inventory.issued',
    'inventory.returned',
    'inventory.adjusted',
  ]) assert.match(finalGate, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(finalGate, /stockLedgerAppendOnly: true/);
  assert.match(finalGate, /receiptUpdatesPoConsumptionAtomically: true/);
  assert.match(finalGate, /issueCreatesProjectActualIdempotently: true/);
  assert.match(finalGate, /financeSourceAdapterDeferredToStage26: true/);
  assert.match(finalGate, /no Warehouse management public API/);
  assert.match(finalGate, /no dedicated stock-ledger read route/);
});

// Only genuine live acceptance can advance to Stage 16; static preparation remains fail-honest while Stage 14 is blocked.
test('Pass 255 advances only genuine acceptance to Stage 16 Module 11', () => {
  assert.match(finalGate, /STAGE_15_ACCEPTED_READY_FOR_STAGE_16/);
  assert.match(finalGate, /STAGE_15_STATIC_GATE_PASSED_STAGE_14_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /Stage 16 - Module 11 Subcontractor Management/);
  assert.match(contract, /Pass 255 final Stage-15 acceptance boundary/);
  assert.match(contract, /Pass 256 - Stage 16 \/ Module 11 Subcontractor Management contract freeze/);
});
