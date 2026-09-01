-- Pass 368 adds only the minimum per-Warehouse/Item threshold needed for a truthful low-stock read.
-- Existing balances remain unmonitored until an authorized user explicitly configures a threshold.
ALTER TABLE "inventory_balances"
  ADD COLUMN "minimum_stock_quantity" DECIMAL(18,4);

ALTER TABLE "inventory_balances"
  ADD CONSTRAINT "inventory_balances_minimum_stock_quantity_nonnegative_ck"
  CHECK ("minimum_stock_quantity" IS NULL OR "minimum_stock_quantity" >= 0);

-- Keep threshold-enabled balance scans bounded to the reviewed Warehouse/Item balance identity.
CREATE INDEX "inventory_balances_low_stock_threshold_idx"
  ON "inventory_balances" ("warehouse_id", "item_id")
  WHERE "minimum_stock_quantity" IS NOT NULL;
