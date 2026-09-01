import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const app = await readFile('apps/api/src/app.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/procurement/procurement.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/procurement/procurement.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/procurement/procurement.routes.ts', 'utf8');
const inventoryRoutes = await readFile('apps/api/src/modules/inventory/inventory.routes.ts', 'utf8');
const inventoryService = await readFile('apps/api/src/modules/inventory/inventory.service.ts', 'utf8');
const rbacSchema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const cleanupMigration = await readFile('packages/database/prisma/migrations/20260829000500_final21_safe_legacy_database_cleanup/migration.sql', 'utf8');
const webShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webProcurement = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');
const webInventory = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829000300_final21_procurement_without_rfq/migration.sql', 'utf8');

const FINAL_ROUTES = [
  ['GET', '/api/v1/procurement/requisitions'],
  ['POST', '/api/v1/procurement/requisitions'],
  ['POST', '/api/v1/procurement/requisitions/:id/approve'],
  ['GET', '/api/v1/procurement/purchase-orders'],
  ['POST', '/api/v1/procurement/purchase-orders'],
  ['GET', '/api/v1/procurement/purchase-orders/:id'],
  ['POST', '/api/v1/procurement/purchase-orders/:id/issue'],
  ['POST', '/api/v1/procurement/purchase-orders/:id/cancel'],
  ['POST', '/api/v1/procurement/goods-receipts'],
  ['GET', '/api/v1/procurement/goods-receipts/:id']
];

/** Return whether one repository path exists without requiring project dependencies. */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Extract one Prisma model body for focused transition assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('Procurement owns the final material requirement -> PO -> goods receipt route surface', () => {
  for (const [method, route] of FINAL_ROUTES) {
    assert.match(schema, new RegExp(`method: '${method}', route: '${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
    assert.ok(routes.includes(route.replace('/:id', '/:id')), `${method} ${route} is not registered.`);
  }

  assert.doesNotMatch(routes, /\/api\/v1\/procurement\/rfqs|quotation-comparison|quotations\/|select-quotation/);
  assert.doesNotMatch(schema, /procurement\.quotation\.|procurement\.rfq\./);
});

test('standalone Purchase Orders backend and frontend modules are removed', async () => {
  assert.equal(await pathExists('apps/api/src/modules/purchase-orders'), false);
  assert.equal(await pathExists('apps/web/src/features/purchase-orders'), false);
  assert.doesNotMatch(app, /registerPurchaseOrdersRoutes|modules\/purchase-orders/);
  assert.doesNotMatch(webShell, /PurchaseOrdersPage|activeView === 'purchase-orders'|setView\('purchase-orders'\)/);
  assert.match(app, /registerProcurementRoutes/);
});

test('active Procurement permissions use the Final-21 vocabulary and block legacy RFQ/PO aliases', () => {
  for (const permission of [
    'procurement.read',
    'requisitions.create',
    'requisitions.approve',
    'purchase_orders.create',
    'purchase_orders.issue',
    'goods_receipts.create'
  ]) {
    assert.match(schema, new RegExp(`'${permission.replace('.', '\\.')}'`));
  }

  for (const legacyPermission of [
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
    'purchase_orders.read',
    'purchase_orders.edit',
    'purchase_orders.submit',
    'purchase_orders.revise',
    'purchase_orders.direct_purchase',
    'inventory.receive'
  ]) {
    assert.doesNotMatch(rbacSchema, new RegExp(`'${legacyPermission.replaceAll('.', '\\.')}'`));
    assert.match(cleanupMigration, new RegExp(`'${legacyPermission.replaceAll('.', '\\.')}'`));
  }
});

test('Procurement source uses requirement lines, material/stage dimensions and correct commitment fields', () => {
  const requisitionItem = prismaModel('PurchaseRequisitionItem');
  const purchaseOrder = prismaModel('PurchaseOrder');
  const purchaseOrderItem = prismaModel('PurchaseOrderItem');
  const goodsReceipt = prismaModel('GoodsReceipt');
  const goodsReceiptItem = prismaModel('GoodsReceiptItem');

  assert.match(requisitionItem, /itemId\s+String\?/);
  assert.match(requisitionItem, /stageId\s+String\?/);
  assert.doesNotMatch(requisitionItem, /wbsNodeId|costCodeId|costTypeId/);
  assert.match(purchaseOrder, /requisitionId\s+String\?/);
  assert.match(purchaseOrder, /@relation\(fields: \[requisitionId, companyId, projectId\], references: \[id, companyId, projectId\]/);
  assert.match(purchaseOrderItem, /requisitionItemId\s+String\?/);
  assert.match(purchaseOrderItem, /stageId\s+String\?/);
  assert.doesNotMatch(purchaseOrderItem, /wbsNodeId|costCodeId|costTypeId/);
  assert.match(goodsReceipt, /vendorId\s+String\s+@map\("vendor_id"\)/);
  assert.match(goodsReceiptItem, /stageId\s+String\?/);

  assert.match(schema, /purchaseRequisitionItemInputSchema = z\.object\(\{[\s\S]*materialId: uuidSchema,/);
  assert.match(service, /Every Purchase Order line requires a material from the approved requirement/);
  assert.match(repository, /sourceKey: input\.sourceKey/);
  assert.match(repository, /amount: input\.amount/);
  assert.doesNotMatch(repository, /sourceLineId: input\.sourceLineId|originalAmount: input\.amount|remainingAmount: input\.amount/);
  assert.ok(service.indexOf('lockPurchaseRequisitionForWrite') < service.indexOf('listOrderedQuantities'), 'PO quantity control must lock the requirement before re-reading ordered quantities.');
  assert.match(service, /lockedPurchaseOrder\.items\.some[\s\S]*received material cannot be cancelled/);
});

test('Goods Receipt is a Procurement command while Inventory performs the atomic stock effect internally', () => {
  assert.match(routes, /\/api\/v1\/procurement\/goods-receipts/);
  assert.doesNotMatch(inventoryRoutes, /\/api\/v1\/inventory\/receipts/);
  assert.match(service, /new InventoryService\(this\.db\)\.receiveInventory/);
  assert.match(inventoryService, /operation: 'goods_receipts\.create'/);
  assert.match(inventoryService, /eventType: 'goods_receipt\.posted'/);
  assert.match(inventoryService, /eventType: 'inventory\.receipt_posted'/);
  assert.doesNotMatch(webInventory, /ReceiptForm|useReceiveInventory|PO receipt/);
  assert.match(webProcurement, /Goods Receipt/);
  assert.match(webProcurement, /useForm/);
  assert.match(webProcurement, /zodResolver/);
});

test('A9 forward migration removes active RFQ/cost-structure coupling without deleting historical migration files', () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "requisition_id" UUID/);
  assert.match(migration, /FOREIGN KEY \("requisition_id", "company_id", "project_id"\)[\s\S]*REFERENCES "purchase_requisitions"\("id", "company_id", "project_id"\)/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "requisition_item_id" UUID/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "stage_id" UUID/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "vendor_id" UUID/);
  assert.match(migration, /DROP TRIGGER IF EXISTS "purchase_orders_quotation_scope_integrity"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "wbs_node_id"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "cost_code_id"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "cost_type_id"/);
  assert.match(migration, /'procurement\.rfq\.manage', 'requisitions\.approve'/);
  assert.doesNotMatch(migration, /DROP TABLE\s+"?(rfqs|supplier_quotations)"?/i);
});
