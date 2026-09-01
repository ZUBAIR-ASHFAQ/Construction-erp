-- Pass 369 closes the reviewed Module-10 UOM conversion, stock-count evidence and Inventory-owned period-lock gaps.
-- It does not add a Finance adapter, negative-stock policy, receipt-tolerance policy or new permission code.

ALTER TABLE "goods_receipt_items"
  ADD COLUMN "source_unit" VARCHAR(64),
  ADD COLUMN "conversion_factor" DECIMAL(18,4),
  ADD COLUMN "source_unit_cost" DECIMAL(18,4),
  ADD COLUMN "base_quantity" DECIMAL(18,4),
  ADD COLUMN "accepted_base_qty" DECIMAL(18,4),
  ADD COLUMN "rejected_base_qty" DECIMAL(18,4);

UPDATE "goods_receipt_items" gri
SET
  "source_unit" = ii."base_unit",
  "conversion_factor" = 1,
  "source_unit_cost" = gri."unit_cost",
  "base_quantity" = gri."quantity",
  "accepted_base_qty" = gri."accepted_qty",
  "rejected_base_qty" = gri."rejected_qty"
FROM "inventory_items" ii
WHERE ii."id" = gri."item_id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "goods_receipt_items"
    WHERE "source_unit" IS NULL
       OR "conversion_factor" IS NULL
       OR "source_unit_cost" IS NULL
       OR "base_quantity" IS NULL
       OR "accepted_base_qty" IS NULL
       OR "rejected_base_qty" IS NULL
  ) THEN
    RAISE EXCEPTION 'Pass 369 could not backfill Goods Receipt conversion snapshots; repair orphan Inventory item references first.';
  END IF;
END $$;

ALTER TABLE "goods_receipt_items"
  ALTER COLUMN "source_unit" SET NOT NULL,
  ALTER COLUMN "conversion_factor" SET NOT NULL,
  ALTER COLUMN "source_unit_cost" SET NOT NULL,
  ALTER COLUMN "base_quantity" SET NOT NULL,
  ALTER COLUMN "accepted_base_qty" SET NOT NULL,
  ALTER COLUMN "rejected_base_qty" SET NOT NULL,
  ADD CONSTRAINT "goods_receipt_items_conversion_factor_positive_ck" CHECK ("conversion_factor" > 0),
  ADD CONSTRAINT "goods_receipt_items_base_quantity_nonnegative_ck" CHECK ("base_quantity" >= 0),
  ADD CONSTRAINT "goods_receipt_items_accepted_base_qty_nonnegative_ck" CHECK ("accepted_base_qty" >= 0),
  ADD CONSTRAINT "goods_receipt_items_rejected_base_qty_nonnegative_ck" CHECK ("rejected_base_qty" >= 0);

CREATE TABLE "inventory_item_unit_conversions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "unit" VARCHAR(64) NOT NULL,
  "factor_to_base" DECIMAL(18,4) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_item_unit_conversions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_item_unit_conversions_factor_positive_ck" CHECK ("factor_to_base" > 0),
  CONSTRAINT "inventory_item_unit_conversions_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_item_unit_conversions_item_company_fk" FOREIGN KEY ("item_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "inventory_item_unit_conversions_creator_company_fk" FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "inventory_item_unit_conversions_company_item_unit_uq" ON "inventory_item_unit_conversions"("company_id", "item_id", "unit");
CREATE INDEX "inventory_item_unit_conversions_company_item_idx" ON "inventory_item_unit_conversions"("company_id", "item_id");

CREATE TABLE "inventory_counts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "warehouse_id" UUID NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "counted_at" TIMESTAMPTZ(6) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reconciled_at" TIMESTAMPTZ(6),
  "reconciled_by" UUID,
  CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_counts_id_company_uq" UNIQUE ("id", "company_id"),
  CONSTRAINT "inventory_counts_status_ck" CHECK ("status" IN ('DRAFT', 'RECONCILED')),
  CONSTRAINT "inventory_counts_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_counts_warehouse_company_fk" FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "inventory_counts_creator_company_fk" FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "inventory_counts_reconciler_company_fk" FOREIGN KEY ("reconciled_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "inventory_counts_company_warehouse_status_counted_idx" ON "inventory_counts"("company_id", "warehouse_id", "status", "counted_at");

CREATE TABLE "inventory_count_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "inventory_count_id" UUID NOT NULL,
  "item_id" UUID NOT NULL,
  "expected_qty" DECIMAL(18,4) NOT NULL,
  "counted_qty" DECIMAL(18,4) NOT NULL,
  "variance_qty" DECIMAL(18,4) NOT NULL,
  "adjustment_transaction_id" UUID,
  CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_count_lines_expected_nonnegative_ck" CHECK ("expected_qty" >= 0),
  CONSTRAINT "inventory_count_lines_counted_nonnegative_ck" CHECK ("counted_qty" >= 0),
  CONSTRAINT "inventory_count_lines_variance_ck" CHECK ("variance_qty" = "counted_qty" - "expected_qty"),
  CONSTRAINT "inventory_count_lines_count_company_fk" FOREIGN KEY ("inventory_count_id", "company_id") REFERENCES "inventory_counts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "inventory_count_lines_item_company_fk" FOREIGN KEY ("item_id", "company_id") REFERENCES "inventory_items"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "inventory_count_lines_adjustment_transaction_fk" FOREIGN KEY ("adjustment_transaction_id") REFERENCES "stock_transactions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "inventory_count_lines_count_item_uq" ON "inventory_count_lines"("inventory_count_id", "item_id");
CREATE UNIQUE INDEX "inventory_count_lines_adjustment_transaction_uq" ON "inventory_count_lines"("adjustment_transaction_id") WHERE "adjustment_transaction_id" IS NOT NULL;
CREATE INDEX "inventory_count_lines_company_item_idx" ON "inventory_count_lines"("company_id", "item_id");

CREATE TABLE "inventory_stock_periods" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
  "locked_at" TIMESTAMPTZ(6),
  "locked_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "inventory_stock_periods_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inventory_stock_periods_dates_ck" CHECK ("end_date" >= "start_date"),
  CONSTRAINT "inventory_stock_periods_status_ck" CHECK ("status" IN ('OPEN', 'LOCKED')),
  CONSTRAINT "inventory_stock_periods_lock_state_ck" CHECK (("status" = 'OPEN' AND "locked_at" IS NULL AND "locked_by" IS NULL) OR ("status" = 'LOCKED' AND "locked_at" IS NOT NULL AND "locked_by" IS NOT NULL)),
  CONSTRAINT "inventory_stock_periods_company_fk" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "inventory_stock_periods_locker_company_fk" FOREIGN KEY ("locked_by", "company_id") REFERENCES "users"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX "inventory_stock_periods_company_dates_uq" ON "inventory_stock_periods"("company_id", "start_date", "end_date");
CREATE INDEX "inventory_stock_periods_company_status_dates_idx" ON "inventory_stock_periods"("company_id", "status", "start_date", "end_date");
