-- Final-21 Pass A9: remove active RFQ/quotation and legacy cost-structure coupling from Procurement.
-- Historical RFQ/quotation tables remain until the later forward cleanup pass; application code stops using them now.

-- Material requirements now use optional stage attribution instead of WBS/Cost Code/Cost Type.
DROP TRIGGER IF EXISTS "purchase_requisition_items_cost_structure_integrity" ON "purchase_requisition_items";
DROP FUNCTION IF EXISTS "module_8_validate_pr_item_cost_scope"();
DROP INDEX IF EXISTS "purchase_requisition_items_requisition_cost_structure_idx";
ALTER TABLE "purchase_requisition_items"
  DROP CONSTRAINT IF EXISTS "purchase_requisition_items_wbs_node_fkey",
  DROP CONSTRAINT IF EXISTS "purchase_requisition_items_cost_code_fkey",
  DROP CONSTRAINT IF EXISTS "purchase_requisition_items_cost_type_fkey",
  ADD COLUMN IF NOT EXISTS "stage_id" UUID;
ALTER TABLE "purchase_requisition_items"
  DROP COLUMN IF EXISTS "wbs_node_id",
  DROP COLUMN IF EXISTS "cost_code_id",
  DROP COLUMN IF EXISTS "cost_type_id";
CREATE INDEX IF NOT EXISTS "purchase_requisition_items_requisition_stage_idx"
  ON "purchase_requisition_items"("requisition_id", "stage_id");

-- New Purchase Orders are created directly from an approved material requirement, not a selected quotation.
ALTER TABLE "purchase_orders"
  ADD COLUMN IF NOT EXISTS "requisition_id" UUID;
CREATE INDEX IF NOT EXISTS "purchase_orders_requisition_idx" ON "purchase_orders"("requisition_id");
ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_requisition_fkey"
  FOREIGN KEY ("requisition_id", "company_id", "project_id")
  REFERENCES "purchase_requisitions"("id", "company_id", "project_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP TRIGGER IF EXISTS "purchase_orders_quotation_scope_integrity" ON "purchase_orders";
DROP FUNCTION IF EXISTS "module_9_validate_po_quotation_scope"();
ALTER TABLE "purchase_orders" DROP CONSTRAINT IF EXISTS "purchase_orders_purchase_source_ck";

-- PO lines retain material and optional stage, and link back to the approved requirement line for quantity control.
DROP TRIGGER IF EXISTS "purchase_order_items_cost_structure_integrity" ON "purchase_order_items";
DROP FUNCTION IF EXISTS "module_9_validate_po_item_cost_scope"();
DROP INDEX IF EXISTS "purchase_order_items_po_cost_structure_idx";
ALTER TABLE "purchase_order_items"
  DROP CONSTRAINT IF EXISTS "purchase_order_items_wbs_node_fkey",
  DROP CONSTRAINT IF EXISTS "purchase_order_items_cost_code_fkey",
  DROP CONSTRAINT IF EXISTS "purchase_order_items_cost_type_fkey",
  ADD COLUMN IF NOT EXISTS "requisition_item_id" UUID,
  ADD COLUMN IF NOT EXISTS "stage_id" UUID;
ALTER TABLE "purchase_order_items"
  DROP COLUMN IF EXISTS "wbs_node_id",
  DROP COLUMN IF EXISTS "cost_code_id",
  DROP COLUMN IF EXISTS "cost_type_id";
ALTER TABLE "purchase_order_items"
  ADD CONSTRAINT "purchase_order_items_requisition_item_fkey"
  FOREIGN KEY ("requisition_item_id") REFERENCES "purchase_requisition_items"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "purchase_order_items_po_stage_idx" ON "purchase_order_items"("purchase_order_id", "stage_id");
CREATE INDEX IF NOT EXISTS "purchase_order_items_requisition_item_idx" ON "purchase_order_items"("requisition_item_id");

-- Goods Receipts expose the supplier and stage trace required by the final Procurement contract.
ALTER TABLE "goods_receipts" ADD COLUMN IF NOT EXISTS "vendor_id" UUID;
UPDATE "goods_receipts" receipt
SET "vendor_id" = po."vendor_id"
FROM "purchase_orders" po
WHERE po."id" = receipt."purchase_order_id"
  AND receipt."vendor_id" IS NULL;
ALTER TABLE "goods_receipts"
  ADD CONSTRAINT "goods_receipts_vendor_company_fkey"
  FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "goods_receipt_items" ADD COLUMN IF NOT EXISTS "stage_id" UUID;
UPDATE "goods_receipt_items" receipt_item
SET "stage_id" = po_item."stage_id"
FROM "purchase_order_items" po_item
WHERE po_item."id" = receipt_item."po_item_id"
  AND receipt_item."stage_id" IS NULL;

-- Final Procurement permissions. Existing roles are mapped forward without rewriting historical permissions.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'procurement.read', 'Read Procurement', 'procurement'),
  (gen_random_uuid(), 'requisitions.create', 'Create Material Requirements', 'procurement'),
  (gen_random_uuid(), 'requisitions.approve', 'Approve Material Requirements', 'procurement'),
  (gen_random_uuid(), 'purchase_orders.create', 'Create Purchase Orders', 'procurement'),
  (gen_random_uuid(), 'purchase_orders.issue', 'Issue Purchase Orders', 'procurement'),
  (gen_random_uuid(), 'goods_receipts.create', 'Create Goods Receipts', 'procurement')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", final_permission."id"
FROM "role_permissions" rp
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = rp."permission_id"
JOIN (VALUES
  ('procurement.pr.read', 'procurement.read'),
  ('purchase_orders.read', 'procurement.read'),
  ('procurement.pr.create', 'requisitions.create'),
  ('procurement.rfq.manage', 'requisitions.approve'),
  ('procurement.rfq.manage', 'purchase_orders.create'),
  ('procurement.quotation.select', 'purchase_orders.create'),
  ('purchase_orders.edit', 'purchase_orders.create'),
  ('purchase_orders.direct_purchase', 'purchase_orders.create'),
  ('purchase_orders.submit', 'purchase_orders.issue'),
  ('inventory.receive', 'goods_receipts.create')
) AS mapping("legacy_code", "final_code")
  ON mapping."legacy_code" = legacy_permission."code"
JOIN "permissions" final_permission
  ON final_permission."code" = mapping."final_code"
ON CONFLICT DO NOTHING;
