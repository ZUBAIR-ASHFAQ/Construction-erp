import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000100_module_10_uom_count_stock_period_repair/migration.sql', 'utf8');
const gates = await readFile('packages/database/prisma/migration-gates.json', 'utf8');
const schema = await readFile('apps/api/src/modules/inventory/inventory.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/inventory/inventory.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/inventory/inventory.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/inventory/inventory.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/inventory/index.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/inventory/api/inventory-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/inventory/hooks/inventory.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
const repairContract = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');

/** Extract one exported frozen HTTP table so route-count checks do not bleed across later constants. */
function frozenRouteSection(source, name, nextName) {
  return source.slice(source.indexOf(name), source.indexOf(nextName));
}

test('Pass 369 closes exactly M10-03 through M10-05 and keeps Finance deferred', () => {
  for (const heading of ['M10-03 — UOM conversion', 'M10-04 — Inventory count/reconciliation sessions', 'M10-05 — Return permission/semantics and stock-period ownership']) {
    const start = repairContract.indexOf(heading);
    const end = repairContract.indexOf('\n### ', start + 4);
    assert.match(repairContract.slice(start, end === -1 ? undefined : end), /IMPLEMENTED_PASS_369/);
  }
  assert.match(repairContract, /M10-06 — Formal Inventory accounting adapter[\s\S]*DEFER_STAGE_26/);
});

test('Pass 369 migration adds only the reviewed Module-10 repair persistence', () => {
  for (const table of ['inventory_item_unit_conversions', 'inventory_counts', 'inventory_count_lines', 'inventory_stock_periods']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /ADD COLUMN "source_unit"/);
  assert.match(migration, /ADD COLUMN "conversion_factor" DECIMAL\(18,4\)/);
  assert.match(migration, /inventory_count_lines_variance_ck/);
  assert.match(migration, /inventory_stock_periods_lock_state_ck/);
  assert.doesNotMatch(migration, /journals|journal_lines|ap_invoices|ar_invoices/);
  assert.match(gates, /20260827000100_module_10_uom_count_stock_period_repair/);
});

test('Pass 369 Prisma relationships preserve Company Item Warehouse User and stock-transaction integrity', () => {
  for (const model of ['InventoryItemUnitConversion', 'InventoryCount', 'InventoryCountLine', 'InventoryStockPeriod']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  assert.match(prisma, /item\s+InventoryItem\s+@relation\(fields: \[itemId, companyId\]/);
  assert.match(prisma, /warehouse\s+Warehouse\s+@relation\(fields: \[warehouseId, companyId\]/);
  assert.match(prisma, /adjustmentTransaction\s+StockTransaction\?/);
  assert.match(prisma, /inventoryCountLine InventoryCountLine\? @relation\("InventoryCountAdjustment"\)/);
});

test('Pass 369 freezes exactly eight new repair routes and no new permission token', () => {
  const section = frozenRouteSection(schema, 'MODULE_10_PASS_369_HTTP_ROUTES', 'MODULE_10_SERVER_OWNED_REQUEST_FIELDS');
  assert.equal((section.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
  for (const path of ['/items/:id/unit-conversions', '/counts', '/counts/:id/reconcile', '/stock-periods', '/stock-periods/:id/lock']) {
    assert.ok(section.includes(path), path);
  }
  assert.match(schema, /MODULE_10_RETURN_AUTHORITY = Object\.freeze\(\['inventory\.issue', 'inventory\.adjust'\] as const\)/);
  assert.doesNotMatch(schema, /inventory\.return['"]/);
});

test('Pass 369 UOM service keeps base unit authoritative and rejects invented rounding', () => {
  assert.match(service, /resolveConversionFactor/);
  assert.match(service, /normalizeUnit\(item\.baseUnit\)/);
  assert.match(service, /multiplyScale4Exact/);
  assert.match(service, /divideScale4Exact/);
  assert.match(service, /INVALID_UNIT_CONVERSION/);
  assert.match(service, /sourceUnitCost/);
  assert.match(service, /acceptedBaseQty/);
  assert.match(repository, /replaceInventoryUnitConversions/);
  assert.match(repository, /findInventoryUnitConversion/);
});

test('Pass 369 physical counts snapshot then reconcile through append-only adjustment evidence', () => {
  for (const method of ['createInventoryCount', 'findInventoryCountById', 'lockInventoryCount', 'setInventoryCountLineAdjustment', 'markInventoryCountReconciled']) {
    assert.match(repository, new RegExp(`async ${method}\\(`));
  }
  assert.match(service, /operation: 'inventory\.count\.create'/);
  assert.match(service, /operation: 'inventory\.count\.reconcile'/);
  assert.match(service, /Stock changed after this physical count was captured/);
  assert.match(service, /sourceType: SOURCE_INVENTORY_COUNT/);
  assert.match(service, /transactionType: STOCK_ADJUSTMENT/);
  assert.match(service, /eventType: 'inventory\.adjusted'/);
  assert.doesNotMatch(service, /inventory\.count_approved|approvalRequest/);
});

test('Pass 369 gives STOCK_PERIOD_LOCKED an Inventory-owned source without Finance coupling', () => {
  for (const method of ['listInventoryStockPeriods', 'createInventoryStockPeriod', 'lockInventoryStockPeriod', 'findLockedInventoryStockPeriodForDate']) {
    assert.match(repository, new RegExp(`async ${method}\\(`));
  }
  assert.match(service, /requireStockPeriodOpen/);
  assert.match(service, /createModule10Error\('STOCK_PERIOD_LOCKED'\)/);
  assert.match(service, /findLockedInventoryStockPeriodForDate/);
  assert.doesNotMatch(service, /FiscalPeriod|FinanceRepository|JournalRepository/);
});

test('Pass 369 Fastify endpoints remain authenticated Zod-validated and idempotent where retry-sensitive', () => {
  for (const operationId of ['module10GetItemUnitConversions', 'module10ReplaceItemUnitConversions', 'module10CreateInventoryCount', 'module10GetInventoryCount', 'module10ReconcileInventoryCount', 'module10ListInventoryStockPeriods', 'module10CreateInventoryStockPeriod', 'module10LockInventoryStockPeriod']) {
    assert.ok(routes.includes(`operationId: '${operationId}'`), operationId);
  }
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 22);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 7);
  assert.match(moduleIndex, /MODULE_10_PASS_369_HTTP_ROUTES/);
});

test('Pass 369 browser API and hooks match every new backend route', () => {
  for (const method of ['getInventoryUnitConversions', 'replaceInventoryUnitConversions', 'createInventoryCount', 'getInventoryCount', 'reconcileInventoryCount', 'listInventoryStockPeriods', 'createInventoryStockPeriod', 'lockInventoryStockPeriod']) {
    assert.match(webApi, new RegExp(`function ${method}\\(`));
  }
  for (const hook of ['useInventoryUnitConversions', 'useReplaceInventoryUnitConversions', 'useCreateInventoryCount', 'useInventoryCount', 'useReconcileInventoryCount', 'useInventoryStockPeriods', 'useCreateInventoryStockPeriod', 'useLockInventoryStockPeriod']) {
    assert.match(hooks, new RegExp(`function ${hook}\\(`));
  }
  assert.equal((webApi.match(/headers: stockCommandHeaders\(idempotencyKey\)/g) ?? []).length, 7);
});

test('Pass 369 React UI exposes conversion count and stock-period workflows without extra feature files', () => {
  for (const heading of ['Approved unit conversions', 'Physical inventory count', 'Inventory stock periods', 'Direct stock adjustment']) {
    assert.ok(workspace.includes(heading), heading);
  }
  assert.match(workspace, /UNIT=FACTOR/);
  assert.match(workspace, /Reconcile count/);
  assert.match(workspace, /does not close a Finance fiscal period/);
  assert.doesNotMatch(workspace, /inventory\.return/);
});

test('Pass 369 keeps the backend five-file module structure and six stable errors/five source events', () => {
  const permissionSection = schema.slice(schema.indexOf('MODULE_10_PERMISSION_CODES'), schema.indexOf('MODULE_10_ERROR_CODES'));
  const errorSection = schema.slice(schema.indexOf('MODULE_10_ERROR_CODES'), schema.indexOf('MODULE_10_EVENT_TYPES'));
  const eventSection = schema.slice(schema.indexOf('MODULE_10_EVENT_TYPES'), schema.indexOf('MODULE_10_HTTP_ROUTES'));
  assert.equal((permissionSection.match(/'inventory\./g) ?? []).length, 6);
  assert.equal((errorSection.match(/'/g) ?? []).length / 2, 6);
  assert.equal((eventSection.match(/'inventory\./g) ?? []).length, 5);
  assert.doesNotMatch(service, /FinanceRepository|JournalRepository/);
});
