-- Final-21 Pass B12: simplify Inventory around Material, Warehouse, append-only stock ledger and Material Issues.
-- Historical migrations stay immutable; this forward migration preserves stock quantity before retiring legacy helper tables.

-- Retire triggers/functions that reference the legacy Inventory table/column names before renaming them.
DROP TRIGGER IF EXISTS "inventory_balances_company_scope_integrity" ON "inventory_balances";
DROP FUNCTION IF EXISTS "module_10_validate_inventory_balance_scope"();
DROP TRIGGER IF EXISTS "goods_receipt_items_scope_integrity" ON "goods_receipt_items";
DROP FUNCTION IF EXISTS "module_10_validate_goods_receipt_item_scope"();
DROP TRIGGER IF EXISTS "stock_transactions_scope_integrity" ON "stock_transactions";
DROP FUNCTION IF EXISTS "module_10_validate_stock_transaction_scope"();
DROP TRIGGER IF EXISTS "stock_transactions_append_only_integrity" ON "stock_transactions";
DROP FUNCTION IF EXISTS "module_10_reject_stock_transaction_mutation"();

-- Preserve any balance-table quantity that is not already represented by the append-only stock history.
INSERT INTO "stock_transactions" (
  "id", "company_id", "item_id", "warehouse_id", "project_id", "transaction_type",
  "quantity", "unit_cost", "source_type", "source_id", "cost_structure_id", "occurred_at"
)
SELECT
  gen_random_uuid(),
  w."company_id",
  b."item_id",
  b."warehouse_id",
  w."project_id",
  'ADJUSTMENT',
  b."quantity_on_hand" - COALESCE(l."ledger_qty", 0),
  b."average_cost",
  'b12_balance_reconciliation',
  b."id"::text,
  NULL,
  now()
FROM "inventory_balances" b
JOIN "warehouses" w ON w."id" = b."warehouse_id"
LEFT JOIN (
  SELECT "warehouse_id", "item_id", SUM("quantity") AS "ledger_qty"
  FROM "stock_transactions"
  GROUP BY "warehouse_id", "item_id"
) l ON l."warehouse_id" = b."warehouse_id" AND l."item_id" = b."item_id"
WHERE b."quantity_on_hand" - COALESCE(l."ledger_qty", 0) <> 0;

-- Final Module 11 does not own UOM conversion, physical-count or stock-period submodules.
DROP TABLE IF EXISTS "inventory_count_lines" CASCADE;
DROP TABLE IF EXISTS "inventory_counts" CASCADE;
DROP TABLE IF EXISTS "inventory_item_unit_conversions" CASCADE;
DROP TABLE IF EXISTS "inventory_stock_periods" CASCADE;
DROP TABLE IF EXISTS "inventory_balances" CASCADE;

-- Rename the legacy item master into the Final-21 material master.
ALTER TABLE "inventory_items" RENAME TO "materials";
ALTER TABLE "materials" RENAME COLUMN "item_code" TO "code";
ALTER TABLE "materials" RENAME COLUMN "base_unit" TO "unit";
ALTER TABLE "materials" DROP COLUMN IF EXISTS "valuation_method";
ALTER TABLE "materials" ALTER COLUMN "category" DROP NOT NULL;

-- Make material codes deterministic before enforcing the final Company-scoped uniqueness rule.
WITH ranked AS (
  SELECT "id", "company_id", "code",
         row_number() OVER (PARTITION BY "company_id", "code" ORDER BY "id") AS rn
  FROM "materials"
)
UPDATE "materials" m
SET "code" = left(m."code", 88) || '-' || substr(m."id"::text, 1, 8)
FROM ranked r
WHERE r."id" = m."id" AND r.rn > 1;

DROP INDEX IF EXISTS "inventory_items_company_code_idx";
DROP INDEX IF EXISTS "inventory_items_company_status_category_idx";
ALTER INDEX IF EXISTS "inventory_items_id_company_uq" RENAME TO "materials_id_company_uq";
CREATE UNIQUE INDEX IF NOT EXISTS "materials_company_code_uq" ON "materials"("company_id", "code");
CREATE INDEX IF NOT EXISTS "materials_company_status_category_idx" ON "materials"("company_id", "status", "category");

-- Warehouse codes are also Company-scoped final master identifiers.
WITH ranked AS (
  SELECT "id", "company_id", "code",
         row_number() OVER (PARTITION BY "company_id", "code" ORDER BY "id") AS rn
  FROM "warehouses"
)
UPDATE "warehouses" w
SET "code" = left(w."code", 88) || '-' || substr(w."id"::text, 1, 8)
FROM ranked r
WHERE r."id" = w."id" AND r.rn > 1;
DROP INDEX IF EXISTS "warehouses_company_code_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "warehouses_company_code_uq" ON "warehouses"("company_id", "code");
ALTER TABLE "warehouses" ALTER COLUMN "location" DROP NOT NULL;

-- Convert the legacy stock transaction table into the Final-21 append-only stock ledger.
ALTER TABLE "stock_transactions" DROP CONSTRAINT IF EXISTS "stock_transactions_cost_structure_fkey";
DROP INDEX IF EXISTS "stock_transactions_cost_structure_occurred_idx";
ALTER TABLE "stock_transactions" DROP COLUMN IF EXISTS "cost_structure_id";
ALTER TABLE "stock_transactions" RENAME TO "stock_ledger";
ALTER TABLE "stock_ledger" RENAME COLUMN "item_id" TO "material_id";
ALTER TABLE "stock_ledger" RENAME COLUMN "transaction_type" TO "movement_type";
ALTER TABLE "stock_ledger" ADD COLUMN IF NOT EXISTS "stage_id" UUID;
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_ledger_stage_requires_project_ck";
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_stage_requires_project_ck" CHECK ("stage_id" IS NULL OR "project_id" IS NOT NULL);

DROP INDEX IF EXISTS "stock_transactions_company_warehouse_item_occurred_idx";
DROP INDEX IF EXISTS "stock_transactions_company_project_occurred_idx";
DROP INDEX IF EXISTS "stock_transactions_company_source_idx";
CREATE INDEX IF NOT EXISTS "stock_ledger_company_warehouse_material_at_idx" ON "stock_ledger"("company_id", "warehouse_id", "material_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "stock_ledger_company_project_stage_at_idx" ON "stock_ledger"("company_id", "project_id", "stage_id", "occurred_at");
CREATE INDEX IF NOT EXISTS "stock_ledger_company_source_idx" ON "stock_ledger"("company_id", "source_type", "source_id");

-- Replace legacy FK names with final Material/ledger ownership names.
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_transactions_item_company_fkey";
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_transactions_company_fkey";
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_transactions_warehouse_company_fkey";
ALTER TABLE "stock_ledger" DROP CONSTRAINT IF EXISTS "stock_transactions_project_company_fkey";
ALTER TABLE "stock_ledger"
  ADD CONSTRAINT "stock_ledger_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "stock_ledger_material_company_fkey" FOREIGN KEY ("material_id", "company_id") REFERENCES "materials"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "stock_ledger_warehouse_company_fkey" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "stock_ledger_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "stock_ledger_stage_project_fkey" FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Rebuild Goods Receipt item scope validation against the renamed Material table.
CREATE FUNCTION "final21_validate_goods_receipt_material_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  receipt_purchase_order_id UUID;
  receipt_company_id UUID;
  line_purchase_order_id UUID;
  material_company_id UUID;
BEGIN
  SELECT "purchase_order_id", "company_id" INTO receipt_purchase_order_id, receipt_company_id
  FROM "goods_receipts" WHERE "id" = NEW."goods_receipt_id";
  SELECT "purchase_order_id" INTO line_purchase_order_id FROM "purchase_order_items" WHERE "id" = NEW."po_item_id";
  SELECT "company_id" INTO material_company_id FROM "materials" WHERE "id" = NEW."item_id";
  IF line_purchase_order_id IS DISTINCT FROM receipt_purchase_order_id THEN
    RAISE EXCEPTION 'Goods receipt item must reference its receipt Purchase Order' USING ERRCODE = '23514';
  END IF;
  IF material_company_id IS DISTINCT FROM receipt_company_id THEN
    RAISE EXCEPTION 'Goods receipt material must belong to the receipt Company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "goods_receipt_items_scope_integrity"
BEFORE INSERT OR UPDATE OF "goods_receipt_id", "po_item_id", "item_id" ON "goods_receipt_items"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_goods_receipt_material_scope"();

-- Final stock-ledger Project/Stage scope integrity.
CREATE FUNCTION "final21_validate_stock_ledger_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE warehouse_project_id UUID;
BEGIN
  SELECT "project_id" INTO warehouse_project_id FROM "warehouses" WHERE "id" = NEW."warehouse_id";
  IF warehouse_project_id IS NOT NULL AND warehouse_project_id IS DISTINCT FROM NEW."project_id" THEN
    RAISE EXCEPTION 'Stock ledger Project must match a project-scoped warehouse' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "stock_ledger_scope_integrity"
BEFORE INSERT OR UPDATE OF "warehouse_id", "project_id", "stage_id" ON "stock_ledger"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_stock_ledger_scope"();

-- Stock history is append-only. Corrections use compensating movements.
CREATE FUNCTION "final21_reject_stock_ledger_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Stock ledger is append-only; write a compensating movement instead' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER "stock_ledger_append_only_integrity"
BEFORE UPDATE OR DELETE ON "stock_ledger"
FOR EACH ROW EXECUTE FUNCTION "final21_reject_stock_ledger_mutation"();

-- Final Material Issue document tables.
CREATE TABLE IF NOT EXISTS "material_issues" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stage_id" UUID,
  "warehouse_id" UUID NOT NULL,
  "issue_no" VARCHAR(100) NOT NULL,
  "issue_date" DATE NOT NULL,
  "description" VARCHAR(1000),
  "issued_by" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  CONSTRAINT "material_issues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "material_issues_company_issue_no_uq" ON "material_issues"("company_id", "issue_no");
CREATE UNIQUE INDEX IF NOT EXISTS "material_issues_id_company_uq" ON "material_issues"("id", "company_id");
CREATE INDEX IF NOT EXISTS "material_issues_project_stage_date_idx" ON "material_issues"("company_id", "project_id", "stage_id", "issue_date");
ALTER TABLE "material_issues"
  ADD CONSTRAINT "material_issues_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "material_issues_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "material_issues_stage_project_fkey" FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "material_issues_warehouse_company_fkey" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "material_issues_issued_by_company_fkey" FOREIGN KEY ("issued_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS "material_issue_items" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "issue_id" UUID NOT NULL,
  "material_id" UUID NOT NULL,
  "quantity" DECIMAL(18,4) NOT NULL,
  "unit_cost" DECIMAL(18,4) NOT NULL,
  "line_cost" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "material_issue_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "material_issue_items_quantity_positive_ck" CHECK ("quantity" > 0),
  CONSTRAINT "material_issue_items_unit_cost_nonnegative_ck" CHECK ("unit_cost" >= 0),
  CONSTRAINT "material_issue_items_line_cost_nonnegative_ck" CHECK ("line_cost" >= 0),
  CONSTRAINT "material_issue_items_issue_fkey" FOREIGN KEY ("issue_id") REFERENCES "material_issues"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "material_issue_items_material_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX IF NOT EXISTS "material_issue_items_issue_material_idx" ON "material_issue_items"("issue_id", "material_id");

-- Enforce Material Issue warehouse and line Company consistency at the database boundary.
CREATE FUNCTION "final21_validate_material_issue_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE warehouse_project_id UUID;
BEGIN
  SELECT "project_id" INTO warehouse_project_id FROM "warehouses" WHERE "id" = NEW."warehouse_id" AND "company_id" = NEW."company_id";
  IF NOT FOUND THEN RAISE EXCEPTION 'Material Issue warehouse must belong to the same Company' USING ERRCODE = '23514'; END IF;
  IF warehouse_project_id IS NOT NULL AND warehouse_project_id IS DISTINCT FROM NEW."project_id" THEN
    RAISE EXCEPTION 'Material Issue Project must match the project-scoped warehouse' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "material_issues_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "stage_id", "warehouse_id" ON "material_issues"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_material_issue_scope"();

CREATE FUNCTION "final21_validate_material_issue_item_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE issue_company_id UUID; material_company_id UUID;
BEGIN
  SELECT "company_id" INTO issue_company_id FROM "material_issues" WHERE "id" = NEW."issue_id";
  SELECT "company_id" INTO material_company_id FROM "materials" WHERE "id" = NEW."material_id";
  IF issue_company_id IS DISTINCT FROM material_company_id THEN
    RAISE EXCEPTION 'Material Issue line must use a Material from the same Company' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "material_issue_items_scope_integrity"
BEFORE INSERT OR UPDATE OF "issue_id", "material_id" ON "material_issue_items"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_material_issue_item_scope"();

-- Rename the active permission while preserving existing role grants.
INSERT INTO "permissions" ("id", "code", "description", "domain")
SELECT gen_random_uuid(), 'materials.manage', 'Manage material master', 'inventory'
WHERE NOT EXISTS (SELECT 1 FROM "permissions" WHERE "code" = 'materials.manage');

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT rp."role_id", next_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'inventory.item.manage'
CROSS JOIN LATERAL (SELECT "id" FROM "permissions" WHERE "code" = 'materials.manage' LIMIT 1) next_permission
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (SELECT "id" FROM "permissions" WHERE "code" = 'inventory.item.manage');
DELETE FROM "permissions" WHERE "code" = 'inventory.item.manage';
