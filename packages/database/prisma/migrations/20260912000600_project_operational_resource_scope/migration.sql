-- Make Materials Project-owned for Site Manager isolation and grant only Project-safe operational permissions.
-- Existing Materials are backfilled only when their historical usage identifies exactly one Project.

ALTER TABLE "materials"
  ADD COLUMN "project_id" UUID;

WITH material_project_usage AS (
  SELECT pri."item_id" AS "material_id", pr."project_id"
  FROM "purchase_requisition_items" pri
  JOIN "purchase_requisitions" pr ON pr."id" = pri."requisition_id"
  WHERE pri."item_id" IS NOT NULL
  UNION
  SELECT poi."item_id" AS "material_id", po."project_id"
  FROM "purchase_order_items" poi
  JOIN "purchase_orders" po ON po."id" = poi."purchase_order_id"
  WHERE poi."item_id" IS NOT NULL
  UNION
  SELECT gri."item_id" AS "material_id", gr."project_id"
  FROM "goods_receipt_items" gri
  JOIN "goods_receipts" gr ON gr."id" = gri."goods_receipt_id"
  UNION
  SELECT sl."material_id" AS "material_id", sl."project_id"
  FROM "stock_ledger" sl
  WHERE sl."project_id" IS NOT NULL
  UNION
  SELECT mii."material_id" AS "material_id", mi."project_id"
  FROM "material_issue_items" mii
  JOIN "material_issues" mi ON mi."id" = mii."issue_id"
), single_project_material AS (
  SELECT "material_id", MIN("project_id"::text)::uuid AS "project_id"
  FROM material_project_usage
  GROUP BY "material_id"
  HAVING COUNT(DISTINCT "project_id") = 1
)
UPDATE "materials" material
SET "project_id" = usage."project_id"
FROM single_project_material usage
WHERE material."id" = usage."material_id";

ALTER TABLE "materials"
  ADD CONSTRAINT "materials_project_company_fkey"
  FOREIGN KEY ("project_id", "company_id")
  REFERENCES "projects"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

DROP INDEX "materials_company_code_uq";
DROP INDEX "materials_company_status_category_idx";

CREATE UNIQUE INDEX "materials_company_project_code_uq"
  ON "materials"("company_id", "project_id", "code");

CREATE INDEX "materials_company_project_status_category_idx"
  ON "materials"("company_id", "project_id", "status", "category");

-- Site Managers get Project-scoped operating authority only. Project scope is still enforced in services/repositories.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'requisitions.approve',
  'purchase_orders.issue',
  'supplier_payables.read',
  'supplier_invoices.create',
  'supplier_invoices.post',
  'supplier_payments.create',
  'supplier_payments.allocate',
  'client_invoices.create',
  'client_invoices.read',
  'client_receipts.read',
  'client_receipts.create',
  'client_receipts.allocate',
  'employees.compensation.manage'
)
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
