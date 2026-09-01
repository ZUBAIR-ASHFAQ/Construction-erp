import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/inventory';
const web = 'apps/web/src/features/inventory';
const migrationPath = 'packages/database/prisma/migrations/20260829001600_final21_inventory_material_management/migration.sql';

/** Extract one Prisma model block for focused Final-21 Inventory assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm Inventory remains the required five-file backend registered after Procurement. */
test('B12 keeps Inventory as one simple five-file backend after Procurement', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'index.ts',
    'inventory.repository.ts',
    'inventory.routes.ts',
    'inventory.schema.ts',
    'inventory.service.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.ok(app.indexOf('registerProcurementRoutes') < app.indexOf('registerInventoryRoutes'));
});

/** Confirm the public Inventory API is exactly the seven routes in the Final-21 contract. */
test('B12 exposes exactly the seven Final-21 Inventory routes', () => {
  const schema = read(`${backend}/inventory.schema.ts`);
  const routes = read(`${backend}/inventory.routes.ts`);
  const expected = [
    "GET', route: '/api/v1/inventory/materials'",
    "POST', route: '/api/v1/inventory/materials'",
    "GET', route: '/api/v1/inventory/stock'",
    "GET', route: '/api/v1/inventory/ledger'",
    "POST', route: '/api/v1/inventory/issues'",
    "POST', route: '/api/v1/inventory/transfers'",
    "POST', route: '/api/v1/inventory/adjustments'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/inventory/g) ?? []).length, 7);
  assert.doesNotMatch(routes, /unit-conversion|stock-period|physical-count|min-stock|low-stock|\/returns|\/balances|\/items/i);
});

/** Confirm Final Module 11 persistence owns only the required material/warehouse/ledger/issue core. */
test('B12 replaces legacy Inventory helper tables with final material and append-only ledger models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const material = prismaModel('Material');
  const warehouse = prismaModel('Warehouse');
  const ledger = prismaModel('StockLedger');
  const issue = prismaModel('MaterialIssue');
  const issueItem = prismaModel('MaterialIssueItem');

  assert.match(material, /@@map\("materials"\)/);
  assert.match(material, /@@unique\(\[companyId, code\]/);
  assert.match(warehouse, /@@map\("warehouses"\)/);
  assert.match(ledger, /@@map\("stock_ledger"\)/);
  assert.match(ledger, /stageId\s+String\?/);
  assert.match(ledger, /ProjectStage\?/);
  assert.match(issue, /@@map\("material_issues"\)/);
  assert.match(issue, /stage\s+ProjectStage\?/);
  assert.match(issueItem, /@@map\("material_issue_items"\)/);

  for (const legacy of ['InventoryBalance', 'StockTransaction', 'InventoryItemUnitConversion', 'InventoryCount', 'InventoryCountLine', 'InventoryStockPeriod']) {
    assert.doesNotMatch(prisma, new RegExp(`model ${legacy} \\{`), `${legacy} must not remain active`);
  }
});

/** Confirm WBS/Cost Code/Cost Type complexity is absent from active Inventory code. */
test('B12 Inventory no longer depends on WBS Cost Codes Cost Types or cost structures', () => {
  const sources = [
    `${backend}/inventory.schema.ts`,
    `${backend}/inventory.repository.ts`,
    `${backend}/inventory.service.ts`,
    `${backend}/inventory.routes.ts`,
    `${web}/api/inventory-api.ts`,
    `${web}/hooks/inventory.ts`,
    `${web}/components/inventory-workspace.tsx`,
    `${web}/pages/inventory-page.tsx`
  ];
  for (const path of sources) {
    const source = read(path);
    assert.doesNotMatch(source, /wbsNodeId|costCodeId|costTypeId|costStructureId|ProjectCostCode/i, `${path} contains legacy cost structure`);
  }
});

/** Confirm stock balance is derived from immutable ledger history and protected against races. */
test('B12 derives stock from an append-only ledger and serializes stock-key writes', () => {
  const repository = read(`${backend}/inventory.repository.ts`);
  const service = read(`${backend}/inventory.service.ts`);
  const migration = read(migrationPath);
  assert.match(repository, /SUM\(quantity\)/);
  assert.match(repository, /SUM\(quantity \* unit_cost\)/);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(service, /lockStockKey/);
  assert.match(service, /INSUFFICIENT_STOCK/);
  assert.match(migration, /stock_ledger_append_only_integrity/);
  assert.match(migration, /Stock ledger is append-only; write a compensating movement instead/);
  assert.doesNotMatch(repository, /inventoryBalance|quantityOnHand:\s*\{\s*(?:increment|decrement)/i);
});

/** Confirm Material Issue creates Project/Stage stock history and one source-derived actual-cost line per issue line. */
test('B12 material issue posts Project Stage material actual cost with stable source keys', () => {
  const repository = read(`${backend}/inventory.repository.ts`);
  const service = read(`${backend}/inventory.service.ts`);
  assert.match(service, /findStage\(input\.projectId, input\.stageId\)/);
  assert.match(service, /movementType: 'ISSUE'/);
  assert.match(service, /sourceType: 'material_issue'/);
  assert.match(service, /sourceKey: `inventory_issue:\$\{issue\.id\}:\$\{issueItem\.id\}`/);
  assert.match(repository, /category: 'material'/);
  assert.match(repository, /sourceType: 'inventory_issue'/);
  assert.match(repository, /this\.db\.costActual\.create/);
});

/** Confirm Procurement Goods Receipt and stock posting stay atomic and stage-aware after material rename. */
test('B12 preserves atomic Procurement receipt integration into stock', () => {
  const procurementRepository = read('apps/api/src/modules/procurement/procurement.repository.ts');
  const procurementService = read('apps/api/src/modules/procurement/procurement.service.ts');
  const inventoryService = read(`${backend}/inventory.service.ts`);
  assert.match(procurementRepository, /this\.db\.material\.findMany/);
  assert.doesNotMatch(procurementRepository, /this\.db\.inventoryItem/);
  assert.match(procurementService, /new InventoryService\(this\.db\)\.receiveInventory/);
  assert.match(inventoryService, /operation: 'goods_receipts\.create'/);
  assert.match(inventoryService, /movementType: 'RECEIPT'/);
  assert.match(inventoryService, /stageId: item\.stageId \?\? null/);
  assert.match(inventoryService, /addPurchaseOrderReceivedQuantity\(item\.poItemId, scale4ToDecimal\(accepted\)\)/);
  assert.match(inventoryService, /A Purchase Order line may appear only once in one Goods Receipt/);
});

/** Confirm Final Module 11 permissions and React UX use Material terminology and Project Stage selectors. */
test('B12 aligns Inventory permissions and React workspace with Final-21', () => {
  const schema = read(`${backend}/inventory.schema.ts`);
  const service = read(`${backend}/inventory.service.ts`);
  const page = read(`${web}/pages/inventory-page.tsx`);
  const workspace = read(`${web}/components/inventory-workspace.tsx`);
  const adminShell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const permission of ['inventory.read', 'materials.manage', 'inventory.issue', 'inventory.transfer', 'inventory.adjust']) {
    assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  }
  assert.match(service, /requireCompanyPermission\(users, 'materials\.manage'/);
  assert.match(page, /usePermission\('materials\.manage'\)/);
  assert.match(adminShell, /'materials\.manage'/);
  assert.doesNotMatch(adminShell, /'inventory\.item\.manage'/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /Issue material to project \/ stage/);
  assert.match(workspace, /Append-only stock ledger/);
});

/** Confirm every public Inventory write is idempotent and produces audit/outbox evidence. */
test('B12 keeps Inventory write commands idempotent audited and evented', () => {
  const routes = read(`${backend}/inventory.routes.ts`);
  const service = read(`${backend}/inventory.service.ts`);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 4);
  for (const operation of ['inventory.material.create', 'inventory.issue', 'inventory.transfer', 'inventory.adjust']) {
    assert.ok(service.includes(`operation: '${operation}'`), `missing ${operation}`);
  }
  for (const event of ['inventory.material_issued', 'inventory.transferred', 'inventory.adjusted', 'inventory.receipt_posted']) {
    assert.ok(service.includes(event), `missing ${event}`);
  }
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
});

/** Confirm the forward migration preserves stock then retires only obsolete active Inventory structures. */
test('B12 forward migration preserves quantity and converts legacy Inventory to Final Module 11', () => {
  const migration = read(migrationPath);
  assert.match(migration, /b12_balance_reconciliation/);
  assert.match(migration, /ALTER TABLE "inventory_items" RENAME TO "materials"/);
  assert.match(migration, /ALTER TABLE "stock_transactions" RENAME TO "stock_ledger"/);
  assert.match(migration, /DROP TABLE IF EXISTS "inventory_balances"/);
  assert.match(migration, /DROP TABLE IF EXISTS "inventory_item_unit_conversions"/);
  assert.match(migration, /DROP TABLE IF EXISTS "inventory_counts"/);
  assert.match(migration, /DROP TABLE IF EXISTS "inventory_stock_periods"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "material_issues"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "material_issue_items"/);
  assert.match(migration, /stock_ledger_stage_requires_project_ck/);
  assert.match(migration, /'materials\.manage'/);
});

/** Confirm changed B12 functions and methods have nearby short purpose comments. */
test('B12 keeps changed Inventory functions junior-readable with purpose comments', () => {
  const paths = [
    `${backend}/inventory.schema.ts`,
    `${backend}/inventory.repository.ts`,
    `${backend}/inventory.service.ts`,
    `${backend}/inventory.routes.ts`,
    `${web}/api/inventory-api.ts`,
    `${web}/hooks/inventory.ts`,
    `${web}/components/inventory-workspace.tsx`,
    `${web}/pages/inventory-page.tsx`
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});
