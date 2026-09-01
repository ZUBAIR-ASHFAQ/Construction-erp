import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const [
  repairContract,
  passDoc,
  moduleContract,
  prisma,
  migration,
  schema,
  repository,
  service,
  routes,
  moduleIndex,
  webApi,
  webHooks,
  webWorkspace,
  integration,
  e2e,
  migrationGates
] = await Promise.all([
  read('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md'),
  read('docs/PASS-368-MODULE-10-WAREHOUSE-LEDGER-LOW-STOCK.md'),
  read('docs/modules/inventory/STAGE-15-MODULE-10-CONTRACT.md'),
  read('packages/database/prisma/schema.prisma'),
  read('packages/database/prisma/migrations/20260826000800_module_10_warehouse_ledger_low_stock_repair/migration.sql'),
  read('apps/api/src/modules/inventory/inventory.schema.ts'),
  read('apps/api/src/modules/inventory/inventory.repository.ts'),
  read('apps/api/src/modules/inventory/inventory.service.ts'),
  read('apps/api/src/modules/inventory/inventory.routes.ts'),
  read('apps/api/src/modules/inventory/index.ts'),
  read('apps/web/src/features/inventory/api/inventory-api.ts'),
  read('apps/web/src/features/inventory/hooks/inventory.ts'),
  read('apps/web/src/features/inventory/components/inventory-workspace.tsx'),
  read('tests/integration/module-10-api.integration.test.mjs'),
  read('tests/e2e/module-10-browser.spec.mjs'),
  read('packages/database/prisma/migration-gates.json')
]);

// Close only the two frozen Pass-368 repair items.
test('Pass 368 closes M10-01 and M10-02 without widening later Inventory policy', () => {
  assert.match(repairContract, /M10-01 — Warehouse\/site-store management/);
  assert.match(repairContract, /M10-02 — Stock-ledger read and low-stock view/);
  assert.equal((repairContract.match(/Decision: `IMPLEMENTED_PASS_368`/g) ?? []).length >= 2, true);
  assert.match(repairContract, /M10-03 — UOM conversion[\s\S]*IMPLEMENTED_PASS_369/);
  assert.match(repairContract, /M10-04 — Inventory count\/reconciliation sessions[\s\S]*IMPLEMENTED_PASS_369/);
  assert.match(repairContract, /M10-06 — Formal Inventory accounting adapter[\s\S]*DEFER_STAGE_26/);
});

// Preserve the original eight operations and add exactly six reviewed repairs.
test('Pass 368 preserves eight source operations and adds exactly six repair operations', () => {
  const sourceSection = schema.slice(schema.indexOf('MODULE_10_HTTP_ROUTES'), schema.indexOf('/** Pass 368 adds only'));
  const repairSection = schema.slice(schema.indexOf('MODULE_10_PASS_368_HTTP_ROUTES'), schema.indexOf('MODULE_10_PASS_369_HTTP_ROUTES'));
  assert.equal((sourceSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
  assert.equal((repairSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 6);
  for (const path of ['/warehouses', '/stock-ledger', '/balances/minimum-stock', '/low-stock']) assert.ok(repairSection.includes(path), path);
  assert.doesNotMatch(routes, /inventory\/warehouses\/:id['"],?\s*\{[\s\S]*app\.delete/);
});

// Add only the threshold needed for a truthful low-stock result.
test('Pass 368 adds one nullable non-negative minimum-stock field and no new business table', () => {
  assert.match(prisma, /minimumStockQuantity\s+Decimal\?\s+@map\("minimum_stock_quantity"\)\s+@db\.Decimal\(18, 4\)/);
  assert.match(migration, /ADD COLUMN "minimum_stock_quantity" DECIMAL\(18,4\)/);
  assert.match(migration, /minimum_stock_quantity_nonnegative_ck/);
  assert.match(migration, /WHERE "minimum_stock_quantity" IS NOT NULL/);
  assert.doesNotMatch(migration, /CREATE TABLE/);
  assert.match(migrationGates, /20260826000800_module_10_warehouse_ledger_low_stock_repair/);
});

// Keep Warehouse Project ownership and lifecycle status server-owned.
test('Pass 368 Warehouse schemas expose only reviewed editable master fields', () => {
  const createStart = schema.indexOf('createWarehouseBodySchema');
  const create = schema.slice(createStart, schema.indexOf('}).strict();', createStart) + '}).strict();'.length);
  const updateStart = schema.indexOf('updateWarehouseBodySchema');
  const update = schema.slice(updateStart, schema.indexOf('}).strict();', updateStart) + '}).strict();'.length);
  assert.match(create, /projectId: uuidSchema\.optional\(\)/);
  for (const field of ['code', 'name', 'location']) assert.match(create, new RegExp(`${field}:`));
  assert.doesNotMatch(create, /companyId|status|actorUserId/);
  assert.doesNotMatch(update, /projectId|companyId|status|actorUserId/);
  assert.match(service, /status: WAREHOUSE_ACTIVE/);
});

// Repository reads/writes must retain Company/Project visibility and append-only ledger semantics.
test('Pass 368 repository reuses existing resources and scoped visibility', () => {
  for (const method of ['listWarehouses', 'createWarehouse', 'updateWarehouse', 'listStockLedger', 'setMinimumStockQuantity', 'listLowStockBalances']) {
    assert.match(repository, new RegExp(`async ${method}\\(`));
  }
  assert.match(repository, /buildWarehouseVisibilityWhere/);
  assert.match(repository, /buildStockTransactionVisibilityWhere/);
  assert.match(repository, /quantityOnHand: \{ lte: this\.db\.inventoryBalance\.fields\.minimumStockQuantity \}/);
  assert.doesNotMatch(repository, /deleteWarehouse|updateStockTransaction|deleteStockTransaction/);
});

// Services reuse existing RBAC and audit only real master/policy mutations.
test('Pass 368 service reuses inventory.read and inventory.item.manage without new permission vocabulary', () => {
  const warehouseRead = service.slice(service.indexOf('async listWarehouses'), service.indexOf('async createWarehouse'));
  const warehouseCreate = service.slice(service.indexOf('async createWarehouse'), service.indexOf('async updateWarehouse'));
  const ledgerRead = service.slice(service.indexOf('async listStockLedger'), service.indexOf('async setMinimumStock'));
  const threshold = service.slice(service.indexOf('async setMinimumStock'), service.indexOf('async listLowStock'));
  assert.match(warehouseRead, /'inventory\.read'/);
  assert.match(warehouseCreate, /'inventory\.item\.manage'/);
  assert.match(ledgerRead, /'inventory\.read'/);
  assert.match(threshold, /'inventory\.item\.manage'/);
  assert.match(service, /inventory\.warehouse_created/);
  assert.match(service, /inventory\.warehouse_updated/);
  assert.match(service, /inventory\.minimum_stock_updated/);
  assert.doesNotMatch(schema, /inventory\.warehouse\.manage|inventory\.low_stock\.manage/);
});

// Fastify routes stay authenticated, validated and narrowly documented.
test('Pass 368 Fastify repair surface is authenticated and OpenAPI documented', () => {
  for (const operationId of [
    'module10Pass368ListWarehouses', 'module10Pass368CreateWarehouse', 'module10Pass368UpdateWarehouse',
    'module10Pass368ListStockLedger', 'module10Pass368SetMinimumStock', 'module10Pass368ListLowStock'
  ]) assert.ok(routes.includes(`operationId: '${operationId}'`), operationId);
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 22);
  assert.match(moduleIndex, /MODULE_10_PASS_368_HTTP_ROUTES/);
  assert.doesNotMatch(routes, /stock-counts|inventory\/valuation|inventory\/finance/);
});

// React must use TanStack Query and server-backed repair APIs instead of local fabricated data.
test('Pass 368 React Inventory workspace consumes server-backed Warehouse ledger and low-stock data', () => {
  for (const method of ['listWarehouses', 'createWarehouse', 'updateWarehouse', 'listStockLedger', 'setMinimumStock', 'listLowStock']) assert.match(webApi, new RegExp(`function ${method}\\(`));
  for (const hook of ['useWarehouses', 'useCreateWarehouse', 'useUpdateWarehouse', 'useStockLedger', 'useSetMinimumStock', 'useLowStock']) assert.match(webHooks, new RegExp(`function ${hook}\\(`));
  for (const heading of ['Warehouse / site-store master', 'Minimum stock policy', 'Stock ledger', 'Low-stock view']) assert.ok(webWorkspace.includes(heading), heading);
  assert.doesNotMatch(webWorkspace, /does not fabricate durable ledger history|does not guess a threshold/i);
});

// Integration coverage must prove scoped Warehouse reads/writes, thresholds and low-stock behavior.
test('Pass 368 integration coverage includes Warehouse scope, ledger, threshold and negative authorization', () => {
  assert.match(integration, /Pass 368/);
  assert.match(integration, /inventory\/warehouses/);
  assert.match(integration, /inventory\/stock-ledger/);
  assert.match(integration, /inventory\/balances\/minimum-stock/);
  assert.match(integration, /inventory\/low-stock/);
  assert.match(integration, /403/);
  assert.match(integration, /minimumStockQuantity/);
});

// Browser workflow must prove the new views while keeping mutation controls permission-aware.
test('Pass 368 Playwright workflow covers Warehouse management, low stock and stock ledger', () => {
  assert.match(e2e, /Warehouse \/ site-store master/);
  assert.match(e2e, /Minimum stock policy/);
  assert.match(e2e, /Stock ledger/);
  assert.match(e2e, /Low-stock view/);
  assert.match(e2e, /Create Warehouse/);
  assert.match(e2e, /Save minimum stock/);
  assert.match(e2e, /deniedWarehouse\.status\(\)\)\.toBe\(403\)/);
  assert.match(e2e, /deniedThreshold\.status\(\)\)\.toBe\(403\)/);
});

// Keep future inventory policy and Finance integration visibly deferred.
test('Pass 368 remains compatible with Pass 369 while valuation Finance and Warehouse-delete stay deferred', () => {
  for (const text of [schema, repository, service, routes, webApi]) {
    assert.doesNotMatch(text, /createStockCount|unitConversionRepository|inventory\/valuation|inventory\/finance|deleteWarehouse/);
  }
  assert.match(passDoc, /does not implement:[\s\S]*UOM conversion[\s\S]*stock-count\/reconciliation sessions/);
  assert.match(moduleContract, /Pass 368 does \*\*not\*\* resolve UOM conversion/);
});
