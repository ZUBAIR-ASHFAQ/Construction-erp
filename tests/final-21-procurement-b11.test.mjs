import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/procurement';
const web = 'apps/web/src/features/procurement';
const migrationPath = 'packages/database/prisma/migrations/20260829001500_final21_procurement_hardening/migration.sql';

/** Extract one Prisma model block for focused B11 persistence checks. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm Module 10 stays one simple five-file backend after Module 9. */
test('B11 keeps Procurement as a five-file backend registered after Budget and Cost', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'index.ts',
    'procurement.repository.ts',
    'procurement.routes.ts',
    'procurement.schema.ts',
    'procurement.service.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.ok(app.indexOf('registerBudgetsJobCostRoutes') < app.indexOf('registerProcurementRoutes'));
});

/** Confirm the public Procurement catalog remains the exact ten-route Final-21 surface. */
test('B11 exposes exactly the ten Final-21 Procurement routes without RFQ endpoints', () => {
  const schema = read(`${backend}/procurement.schema.ts`);
  const routes = read(`${backend}/procurement.routes.ts`);
  const expected = [
    "GET', route: '/api/v1/procurement/requisitions'",
    "POST', route: '/api/v1/procurement/requisitions'",
    "POST', route: '/api/v1/procurement/requisitions/:id/approve'",
    "GET', route: '/api/v1/procurement/purchase-orders'",
    "POST', route: '/api/v1/procurement/purchase-orders'",
    "GET', route: '/api/v1/procurement/purchase-orders/:id'",
    "POST', route: '/api/v1/procurement/purchase-orders/:id/issue'",
    "POST', route: '/api/v1/procurement/purchase-orders/:id/cancel'",
    "POST', route: '/api/v1/procurement/goods-receipts'",
    "GET', route: '/api/v1/procurement/goods-receipts/:id'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/procurement/g) ?? []).length, 10);
  assert.doesNotMatch(routes, /rfq|quotation-comparison|select-quotation/i);
});

/** Confirm every Procurement write command is retry-safe and exposes stable business error codes. */
test('B11 requires Foundation idempotency for every Procurement write and uses stable errors', () => {
  const routes = read(`${backend}/procurement.routes.ts`);
  const service = read(`${backend}/procurement.service.ts`);
  const schema = read(`${backend}/procurement.schema.ts`);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 6);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 6);
  for (const operation of [
    'procurement.requisition.create',
    'procurement.requisition.approve',
    'procurement.purchase_order.create',
    'procurement.purchase_order.issue',
    'procurement.purchase_order.cancel'
  ]) assert.ok(service.includes(`operation: '${operation}'`), `missing ${operation}`);
  assert.match(service, /receiveInventory\([\s\S]*idempotencyKey/);
  for (const code of ['REQUISITION_NOT_FOUND', 'PO_NOT_FOUND', 'PO_NOT_RECEIVABLE', 'OVER_RECEIPT_NOT_ALLOWED', 'VENDOR_NOT_ACTIVE']) {
    assert.match(schema, new RegExp(`code: '${code}'`));
  }
});

/** Confirm Project Stage attribution is a real relation and service-level same-Project invariant. */
test('B11 gives Procurement header and lines real Project Stage integrity', () => {
  const requisition = prismaModel('PurchaseRequisition');
  const requisitionItem = prismaModel('PurchaseRequisitionItem');
  const poItem = prismaModel('PurchaseOrderItem');
  const receiptItem = prismaModel('GoodsReceiptItem');
  const service = read(`${backend}/procurement.service.ts`);
  assert.match(requisition, /stageId\s+String\?/);
  assert.match(requisition, /PurchaseRequisitionStage/);
  assert.match(requisitionItem, /PurchaseRequisitionItemStage/);
  assert.match(poItem, /PurchaseOrderItemStage/);
  assert.match(receiptItem, /GoodsReceiptItemStage/);
  assert.match(service, /requireProjectStages/);
  assert.match(service, /INVALID_PROCUREMENT_STAGE/);
});

/** Confirm supplier qualification and receipt identity are no longer weak optional hints. */
test('B11 validates purchasable vendors and hardens Goods Receipt supplier identity', () => {
  const repository = read(`${backend}/procurement.repository.ts`);
  const service = read(`${backend}/procurement.service.ts`);
  const goodsReceipt = prismaModel('GoodsReceipt');
  assert.match(repository, /qualificationStatus: true/);
  assert.match(service, /isPurchasableVendor/);
  assert.match(service, /VENDOR_PENDING/);
  assert.match(goodsReceipt, /vendorId\s+String\s+@map\("vendor_id"\)/);
  assert.match(goodsReceipt, /@@unique\(\[companyId, receiptNo\]/);
});

/** Confirm receipt lines preserve stage and optional batch trace while over-receipt stays controlled. */
test('B11 keeps Goods Receipt atomic with Inventory and maps over-receipt to the Procurement contract', () => {
  const schema = read(`${backend}/procurement.schema.ts`);
  const service = read(`${backend}/procurement.service.ts`);
  const inventoryRepository = read('apps/api/src/modules/inventory/inventory.repository.ts');
  assert.match(schema, /batchNo: z\.string\(\).*max\(120\)/);
  assert.match(service, /PO_NOT_RECEIVABLE/);
  assert.match(service, /RECEIPT_EXCEEDS_PO/);
  assert.match(service, /OVER_RECEIPT_NOT_ALLOWED/);
  assert.match(service, /new InventoryService\(this\.db\)\.receiveInventory/);
  assert.match(inventoryRepository, /batchNo: item\.batchNo \?\? null/);
});

/** Confirm the browser sends retry keys, filters unavailable vendors and displays open quantity. */
test('B11 React Procurement keeps retry-safe commands qualified suppliers and open quantity visible', () => {
  const api = read(`${web}/api/procurement-api.ts`);
  const workspace = read(`${web}/components/procurement-workspace.tsx`);
  assert.match(api, /function writeHeaders\(\)/);
  assert.equal((api.match(/headers: writeHeaders\(\)/g) ?? []).length, 6);
  assert.match(api, /qualificationStatus: 'QUALIFIED' \| 'PENDING' \| null/);
  assert.match(workspace, /qualificationStatus !== 'PENDING'/);
  assert.match(workspace, /<th>Open<\/th>/);
  assert.match(workspace, /const open = item\.items\.reduce/);
});

/** Confirm the new migration hardens only active Final-21 Procurement structures. */
test('B11 forward migration adds Stage receipt and supplier invariants without deleting Procurement history', () => {
  const migration = read(migrationPath);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "stage_id" UUID/);
  assert.match(migration, /purchase_requisitions_stage_fkey/);
  assert.match(migration, /purchase_requisition_items_stage_fkey/);
  assert.match(migration, /purchase_order_items_stage_fkey/);
  assert.match(migration, /goods_receipt_items_stage_fkey/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "batch_no" VARCHAR\(120\)/);
  assert.match(migration, /ALTER COLUMN "vendor_id" SET NOT NULL/);
  assert.match(migration, /goods_receipts_company_receipt_no_uq/);
  assert.match(migration, /purchase_requisitions_stage_scope_integrity/);
  assert.match(migration, /goods_receipts_purchase_order_scope_integrity/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"?(purchase_requisitions|purchase_orders|goods_receipts)"?/i);
});

/** Confirm changed B11 functions and methods stay junior-readable with nearby purpose comments. */
test('B11 keeps changed Procurement functions documented with short purpose comments', () => {
  const paths = [
    `${backend}/procurement.schema.ts`,
    `${backend}/procurement.repository.ts`,
    `${backend}/procurement.service.ts`,
    `${backend}/procurement.routes.ts`,
    `${web}/api/procurement-api.ts`,
    `${web}/hooks/procurement.ts`,
    `${web}/components/procurement-workspace.tsx`
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
