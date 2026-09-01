-- Final-21 Pass B11: harden Procurement/Purchase stage, supplier and receipt integrity.
-- Historical migrations remain unchanged; this forward migration only tightens the active Final-21 model.

-- Material Requirement header may carry one optional Project Stage.
ALTER TABLE "purchase_requisitions"
  ADD COLUMN IF NOT EXISTS "stage_id" UUID;

UPDATE "purchase_requisitions" pr
SET "stage_id" = source."stage_id"
FROM (
  SELECT "requisition_id", MIN("stage_id"::text)::uuid AS "stage_id"
  FROM "purchase_requisition_items"
  WHERE "stage_id" IS NOT NULL
  GROUP BY "requisition_id"
  HAVING COUNT(DISTINCT "stage_id") = 1
) source
WHERE source."requisition_id" = pr."id"
  AND pr."stage_id" IS NULL;

ALTER TABLE "purchase_requisitions"
  DROP CONSTRAINT IF EXISTS "purchase_requisitions_stage_fkey",
  ADD CONSTRAINT "purchase_requisitions_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "purchase_requisitions_stage_idx" ON "purchase_requisitions"("stage_id");

-- Every line-level Stage is now a real ProjectStage foreign key.
ALTER TABLE "purchase_requisition_items"
  DROP CONSTRAINT IF EXISTS "purchase_requisition_items_stage_fkey",
  ADD CONSTRAINT "purchase_requisition_items_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items"
  DROP CONSTRAINT IF EXISTS "purchase_order_items_stage_fkey",
  ADD CONSTRAINT "purchase_order_items_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipt_items"
  ADD COLUMN IF NOT EXISTS "batch_no" VARCHAR(120),
  DROP CONSTRAINT IF EXISTS "goods_receipt_items_stage_fkey",
  ADD CONSTRAINT "goods_receipt_items_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Goods Receipt supplier identity is mandatory and copied from its Purchase Order.
UPDATE "goods_receipts" receipt
SET "vendor_id" = po."vendor_id"
FROM "purchase_orders" po
WHERE po."id" = receipt."purchase_order_id"
  AND receipt."vendor_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "goods_receipts" WHERE "vendor_id" IS NULL) THEN
    RAISE EXCEPTION 'Cannot harden goods_receipts.vendor_id while legacy null suppliers remain';
  END IF;
END
$$;

ALTER TABLE "goods_receipts" ALTER COLUMN "vendor_id" SET NOT NULL;
DROP INDEX IF EXISTS "goods_receipts_company_receipt_no_idx";
CREATE UNIQUE INDEX IF NOT EXISTS "goods_receipts_company_receipt_no_uq"
  ON "goods_receipts"("company_id", "receipt_no");

-- Header Stage must belong to the same Company and Project as the Material Requirement.
CREATE OR REPLACE FUNCTION "final21_validate_purchase_requisition_stage_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."stage_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "project_stages" stage
    WHERE stage."id" = NEW."stage_id"
      AND stage."company_id" = NEW."company_id"
      AND stage."project_id" = NEW."project_id"
  ) THEN
    RAISE EXCEPTION 'Purchase Requisition Stage must belong to the same Company and Project';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "purchase_requisitions_stage_scope_integrity" ON "purchase_requisitions";
CREATE TRIGGER "purchase_requisitions_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "stage_id" ON "purchase_requisitions"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_purchase_requisition_stage_scope"();

-- Requirement-line Stage must belong to its header Project and Company.
CREATE OR REPLACE FUNCTION "final21_validate_purchase_requisition_item_stage_scope"()
RETURNS TRIGGER AS $$
DECLARE
  header_company UUID;
  header_project UUID;
BEGIN
  IF NEW."stage_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "company_id", "project_id" INTO header_company, header_project
  FROM "purchase_requisitions" WHERE "id" = NEW."requisition_id";
  IF header_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM "project_stages" stage
    WHERE stage."id" = NEW."stage_id"
      AND stage."company_id" = header_company
      AND stage."project_id" = header_project
  ) THEN
    RAISE EXCEPTION 'Purchase Requisition Item Stage must belong to the header Project and Company';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "purchase_requisition_items_stage_scope_integrity" ON "purchase_requisition_items";
CREATE TRIGGER "purchase_requisition_items_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "requisition_id", "stage_id" ON "purchase_requisition_items"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_purchase_requisition_item_stage_scope"();

-- PO-line Stage must belong to its Purchase Order Project and Company.
CREATE OR REPLACE FUNCTION "final21_validate_purchase_order_item_stage_scope"()
RETURNS TRIGGER AS $$
DECLARE
  header_company UUID;
  header_project UUID;
BEGIN
  IF NEW."stage_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "company_id", "project_id" INTO header_company, header_project
  FROM "purchase_orders" WHERE "id" = NEW."purchase_order_id";
  IF header_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM "project_stages" stage
    WHERE stage."id" = NEW."stage_id"
      AND stage."company_id" = header_company
      AND stage."project_id" = header_project
  ) THEN
    RAISE EXCEPTION 'Purchase Order Item Stage must belong to the header Project and Company';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "purchase_order_items_stage_scope_integrity" ON "purchase_order_items";
CREATE TRIGGER "purchase_order_items_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "purchase_order_id", "stage_id" ON "purchase_order_items"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_purchase_order_item_stage_scope"();

-- Receipt-line Stage must belong to its Goods Receipt Project and Company.
CREATE OR REPLACE FUNCTION "final21_validate_goods_receipt_item_stage_scope"()
RETURNS TRIGGER AS $$
DECLARE
  header_company UUID;
  header_project UUID;
BEGIN
  IF NEW."stage_id" IS NULL THEN RETURN NEW; END IF;
  SELECT "company_id", "project_id" INTO header_company, header_project
  FROM "goods_receipts" WHERE "id" = NEW."goods_receipt_id";
  IF header_company IS NULL OR NOT EXISTS (
    SELECT 1 FROM "project_stages" stage
    WHERE stage."id" = NEW."stage_id"
      AND stage."company_id" = header_company
      AND stage."project_id" = header_project
  ) THEN
    RAISE EXCEPTION 'Goods Receipt Item Stage must belong to the header Project and Company';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "goods_receipt_items_stage_scope_integrity" ON "goods_receipt_items";
CREATE TRIGGER "goods_receipt_items_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "goods_receipt_id", "stage_id" ON "goods_receipt_items"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_goods_receipt_item_stage_scope"();

-- Receipt vendor must always match its scoped Purchase Order vendor.
CREATE OR REPLACE FUNCTION "final21_validate_goods_receipt_purchase_order_scope"()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "purchase_orders" po
    WHERE po."id" = NEW."purchase_order_id"
      AND po."company_id" = NEW."company_id"
      AND po."project_id" = NEW."project_id"
      AND po."vendor_id" = NEW."vendor_id"
  ) THEN
    RAISE EXCEPTION 'Goods Receipt vendor/project must match its Purchase Order';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "goods_receipts_purchase_order_scope_integrity" ON "goods_receipts";
CREATE TRIGGER "goods_receipts_purchase_order_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "vendor_id", "purchase_order_id" ON "goods_receipts"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_goods_receipt_purchase_order_scope"();
