-- Stage 15 / Module 10 - Inventory & Material Management core persistence.
-- Creates exactly the six reviewed Inventory resources. Public route/schema/service behavior remains deferred.
-- Deferred Module-8/9 item references are activated only after an explicit historical-value preflight.
-- The migration never nulls, rewrites or fabricates Inventory items to satisfy those relationships.

CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "item_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "category" VARCHAR(120) NOT NULL,
    "base_unit" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "valuation_method" VARCHAR(64) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_items_code_not_blank" CHECK (length(btrim("item_code")) > 0),
    CONSTRAINT "inventory_items_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "inventory_items_category_not_blank" CHECK (length(btrim("category")) > 0),
    CONSTRAINT "inventory_items_base_unit_not_blank" CHECK (length(btrim("base_unit")) > 0),
    CONSTRAINT "inventory_items_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "inventory_items_valuation_method_not_blank" CHECK (length(btrim("valuation_method")) > 0)
);

CREATE TABLE "warehouses" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "location" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "warehouses_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "warehouses_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "warehouses_location_not_blank" CHECK (length(btrim("location")) > 0),
    CONSTRAINT "warehouses_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "inventory_balances" (
    "id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity_on_hand" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reserved_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "average_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "inventory_balances_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inventory_balances_quantity_on_hand_nonnegative" CHECK ("quantity_on_hand" >= 0),
    CONSTRAINT "inventory_balances_reserved_quantity_nonnegative" CHECK ("reserved_quantity" >= 0),
    CONSTRAINT "inventory_balances_average_cost_nonnegative" CHECK ("average_cost" >= 0)
);

CREATE TABLE "goods_receipts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "receipt_no" VARCHAR(100) NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "received_by" UUID NOT NULL,

    CONSTRAINT "goods_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipts_receipt_no_not_blank" CHECK (length(btrim("receipt_no")) > 0),
    CONSTRAINT "goods_receipts_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "goods_receipt_items" (
    "id" UUID NOT NULL,
    "goods_receipt_id" UUID NOT NULL,
    "po_item_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "accepted_qty" DECIMAL(18,4) NOT NULL,
    "rejected_qty" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "goods_receipt_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "goods_receipt_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "goods_receipt_items_unit_cost_nonnegative" CHECK ("unit_cost" >= 0),
    CONSTRAINT "goods_receipt_items_accepted_qty_nonnegative" CHECK ("accepted_qty" >= 0),
    CONSTRAINT "goods_receipt_items_rejected_qty_nonnegative" CHECK ("rejected_qty" >= 0)
);

CREATE TABLE "stock_transactions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "project_id" UUID,
    "transaction_type" VARCHAR(64) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost" DECIMAL(18,4) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(200) NOT NULL,
    "cost_structure_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "stock_transactions_type_not_blank" CHECK (length(btrim("transaction_type")) > 0),
    CONSTRAINT "stock_transactions_quantity_nonzero" CHECK ("quantity" <> 0),
    CONSTRAINT "stock_transactions_unit_cost_nonnegative" CHECK ("unit_cost" >= 0),
    CONSTRAINT "stock_transactions_source_type_not_blank" CHECK (length(btrim("source_type")) > 0),
    CONSTRAINT "stock_transactions_source_id_not_blank" CHECK (length(btrim("source_id")) > 0)
);

-- Item/warehouse business codes are indexed but intentionally not declared unique because the source does not define that rule.
CREATE UNIQUE INDEX "inventory_items_id_company_uq" ON "inventory_items"("id", "company_id");
CREATE INDEX "inventory_items_company_code_idx" ON "inventory_items"("company_id", "item_code");
CREATE INDEX "inventory_items_company_status_category_idx" ON "inventory_items"("company_id", "status", "category");

CREATE UNIQUE INDEX "warehouses_id_company_uq" ON "warehouses"("id", "company_id");
CREATE INDEX "warehouses_company_code_idx" ON "warehouses"("company_id", "code");
CREATE INDEX "warehouses_company_project_status_idx" ON "warehouses"("company_id", "project_id", "status");

CREATE UNIQUE INDEX "inventory_balances_warehouse_item_uq" ON "inventory_balances"("warehouse_id", "item_id");
CREATE INDEX "inventory_balances_item_idx" ON "inventory_balances"("item_id");

-- Receipt number scope is not source-defined yet, so it is indexed without inventing a uniqueness scope.
CREATE INDEX "goods_receipts_company_receipt_no_idx" ON "goods_receipts"("company_id", "receipt_no");
CREATE INDEX "goods_receipts_company_project_received_idx" ON "goods_receipts"("company_id", "project_id", "received_at");
CREATE INDEX "goods_receipts_po_status_idx" ON "goods_receipts"("purchase_order_id", "status");
CREATE INDEX "goods_receipts_warehouse_received_idx" ON "goods_receipts"("warehouse_id", "received_at");
CREATE INDEX "goods_receipts_receiver_received_idx" ON "goods_receipts"("received_by", "received_at");

CREATE INDEX "goods_receipt_items_receipt_po_item_idx" ON "goods_receipt_items"("goods_receipt_id", "po_item_id");
CREATE INDEX "goods_receipt_items_item_idx" ON "goods_receipt_items"("item_id");

CREATE INDEX "stock_transactions_company_warehouse_item_occurred_idx"
    ON "stock_transactions"("company_id", "warehouse_id", "item_id", "occurred_at");
CREATE INDEX "stock_transactions_company_project_occurred_idx"
    ON "stock_transactions"("company_id", "project_id", "occurred_at");
CREATE INDEX "stock_transactions_company_source_idx"
    ON "stock_transactions"("company_id", "source_type", "source_id");
CREATE INDEX "stock_transactions_cost_structure_occurred_idx"
    ON "stock_transactions"("cost_structure_id", "occurred_at");

ALTER TABLE "inventory_items"
    ADD CONSTRAINT "inventory_items_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "warehouses"
    ADD CONSTRAINT "warehouses_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "warehouses_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "inventory_balances"
    ADD CONSTRAINT "inventory_balances_warehouse_fkey"
        FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "inventory_balances_item_fkey"
        FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "goods_receipts"
    ADD CONSTRAINT "goods_receipts_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "goods_receipts_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "goods_receipts_warehouse_company_fkey"
        FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "goods_receipts_purchase_order_scope_fkey"
        FOREIGN KEY ("purchase_order_id", "company_id", "project_id") REFERENCES "purchase_orders"("id", "company_id", "project_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "goods_receipts_received_by_company_fkey"
        FOREIGN KEY ("received_by", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "goods_receipt_items"
    ADD CONSTRAINT "goods_receipt_items_receipt_fkey"
        FOREIGN KEY ("goods_receipt_id") REFERENCES "goods_receipts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "goods_receipt_items_po_item_fkey"
        FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "goods_receipt_items_item_fkey"
        FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "stock_transactions"
    ADD CONSTRAINT "stock_transactions_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "stock_transactions_item_company_fkey"
        FOREIGN KEY ("item_id", "company_id") REFERENCES "inventory_items"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "stock_transactions_warehouse_company_fkey"
        FOREIGN KEY ("warehouse_id", "company_id") REFERENCES "warehouses"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "stock_transactions_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "stock_transactions_cost_structure_fkey"
        FOREIGN KEY ("cost_structure_id") REFERENCES "project_cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- The balance table has no company_id in the source, so enforce warehouse/item Company agreement explicitly.
CREATE FUNCTION "module_10_validate_inventory_balance_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    warehouse_company_id UUID;
    item_company_id UUID;
BEGIN
    SELECT "company_id" INTO warehouse_company_id FROM "warehouses" WHERE "id" = NEW."warehouse_id";
    SELECT "company_id" INTO item_company_id FROM "inventory_items" WHERE "id" = NEW."item_id";

    IF warehouse_company_id IS DISTINCT FROM item_company_id THEN
        RAISE EXCEPTION 'Inventory balance item and warehouse must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "inventory_balances_company_scope_integrity"
BEFORE INSERT OR UPDATE OF "warehouse_id", "item_id"
ON "inventory_balances"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_inventory_balance_scope"();

-- A project/site warehouse may only be used by receipts for its own Project; Company-level warehouses remain valid for any authorized Project.
CREATE FUNCTION "module_10_validate_goods_receipt_warehouse_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    warehouse_project_id UUID;
BEGIN
    SELECT "project_id" INTO warehouse_project_id FROM "warehouses" WHERE "id" = NEW."warehouse_id";

    IF warehouse_project_id IS NOT NULL AND warehouse_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Goods receipt Project must match a project-scoped warehouse'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "goods_receipts_warehouse_project_scope_integrity"
BEFORE INSERT OR UPDATE OF "project_id", "warehouse_id"
ON "goods_receipts"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_goods_receipt_warehouse_scope"();

-- Receipt lines must stay on the receipt Purchase Order and use an Inventory item owned by the receipt Company.
CREATE FUNCTION "module_10_validate_goods_receipt_item_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    receipt_purchase_order_id UUID;
    receipt_company_id UUID;
    line_purchase_order_id UUID;
    item_company_id UUID;
BEGIN
    SELECT "purchase_order_id", "company_id"
      INTO receipt_purchase_order_id, receipt_company_id
      FROM "goods_receipts"
     WHERE "id" = NEW."goods_receipt_id";

    SELECT "purchase_order_id" INTO line_purchase_order_id
      FROM "purchase_order_items"
     WHERE "id" = NEW."po_item_id";

    SELECT "company_id" INTO item_company_id
      FROM "inventory_items"
     WHERE "id" = NEW."item_id";

    IF line_purchase_order_id IS DISTINCT FROM receipt_purchase_order_id THEN
        RAISE EXCEPTION 'Goods receipt item must reference a line on the receipt Purchase Order'
            USING ERRCODE = '23514';
    END IF;

    IF item_company_id IS DISTINCT FROM receipt_company_id THEN
        RAISE EXCEPTION 'Goods receipt item must belong to the receipt Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "goods_receipt_items_scope_integrity"
BEFORE INSERT OR UPDATE OF "goods_receipt_id", "po_item_id", "item_id"
ON "goods_receipt_items"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_goods_receipt_item_scope"();

-- Stock transactions must stay within Company/warehouse/Project scope and any cost structure must belong to the same Project.
CREATE FUNCTION "module_10_validate_stock_transaction_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    warehouse_project_id UUID;
    mapping_project_id UUID;
BEGIN
    SELECT "project_id" INTO warehouse_project_id
      FROM "warehouses"
     WHERE "id" = NEW."warehouse_id";

    IF warehouse_project_id IS NOT NULL AND warehouse_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Stock transaction Project must match a project-scoped warehouse'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."cost_structure_id" IS NOT NULL THEN
        IF NEW."project_id" IS NULL THEN
            RAISE EXCEPTION 'Stock transaction cost structure requires a Project'
                USING ERRCODE = '23514';
        END IF;

        SELECT "project_id" INTO mapping_project_id
          FROM "project_cost_codes"
         WHERE "id" = NEW."cost_structure_id";

        IF mapping_project_id IS DISTINCT FROM NEW."project_id" THEN
            RAISE EXCEPTION 'Stock transaction cost structure must belong to the transaction Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "stock_transactions_scope_integrity"
BEFORE INSERT OR UPDATE OF "warehouse_id", "project_id", "cost_structure_id"
ON "stock_transactions"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_stock_transaction_scope"();

-- The stock ledger is append-only. Corrections must be separate reversing/adjustment rows.
CREATE FUNCTION "module_10_reject_stock_transaction_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'Stock transactions are append-only; write a reversing or adjustment transaction instead'
        USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "stock_transactions_append_only_integrity"
BEFORE UPDATE OR DELETE
ON "stock_transactions"
FOR EACH ROW
EXECUTE FUNCTION "module_10_reject_stock_transaction_mutation"();

-- Stage-13/14 allowed nullable future item UUIDs before Inventory existed. Any unresolved historical value is a migration blocker.
DO $$
DECLARE
    unresolved_pr_items BIGINT;
    unresolved_po_items BIGINT;
BEGIN
    SELECT COUNT(*) INTO unresolved_pr_items
      FROM "purchase_requisition_items" line
      LEFT JOIN "inventory_items" item ON item."id" = line."item_id"
     WHERE line."item_id" IS NOT NULL AND item."id" IS NULL;

    SELECT COUNT(*) INTO unresolved_po_items
      FROM "purchase_order_items" line
      LEFT JOIN "inventory_items" item ON item."id" = line."item_id"
     WHERE line."item_id" IS NOT NULL AND item."id" IS NULL;

    IF unresolved_pr_items > 0 OR unresolved_po_items > 0 THEN
        RAISE EXCEPTION 'Stage 15 deferred Inventory item FK preflight failed: % requisition item(s) and % purchase-order item(s) do not resolve to inventory_items', unresolved_pr_items, unresolved_po_items
            USING ERRCODE = '23503',
                  HINT = 'Provide a reviewed historical item mapping before rerunning this migration. The migration will not null, rewrite or fabricate Inventory items.';
    END IF;
END;
$$;

ALTER TABLE "purchase_requisition_items"
    ADD CONSTRAINT "purchase_requisition_items_inventory_item_fkey"
        FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_inventory_item_fkey"
        FOREIGN KEY ("item_id") REFERENCES "inventory_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once the deferred FKs exist, also prevent future cross-Company item references through the parent business header.
CREATE FUNCTION "module_10_validate_requisition_item_company_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    requisition_company_id UUID;
    item_company_id UUID;
BEGIN
    IF NEW."item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT requisition."company_id", item."company_id"
      INTO requisition_company_id, item_company_id
      FROM "purchase_requisitions" requisition
      CROSS JOIN "inventory_items" item
     WHERE requisition."id" = NEW."requisition_id"
       AND item."id" = NEW."item_id";

    IF requisition_company_id IS DISTINCT FROM item_company_id THEN
        RAISE EXCEPTION 'Purchase requisition item Inventory reference must belong to the requisition Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_requisition_items_inventory_company_scope_integrity"
BEFORE INSERT OR UPDATE OF "requisition_id", "item_id"
ON "purchase_requisition_items"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_requisition_item_company_scope"();

CREATE FUNCTION "module_10_validate_purchase_order_item_company_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    purchase_order_company_id UUID;
    item_company_id UUID;
BEGIN
    IF NEW."item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT po."company_id", item."company_id"
      INTO purchase_order_company_id, item_company_id
      FROM "purchase_orders" po
      CROSS JOIN "inventory_items" item
     WHERE po."id" = NEW."purchase_order_id"
       AND item."id" = NEW."item_id";

    IF purchase_order_company_id IS DISTINCT FROM item_company_id THEN
        RAISE EXCEPTION 'Purchase Order item Inventory reference must belong to the PO Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_items_inventory_company_scope_integrity"
BEFORE INSERT OR UPDATE OF "purchase_order_id", "item_id"
ON "purchase_order_items"
FOR EACH ROW
EXECUTE FUNCTION "module_10_validate_purchase_order_item_company_scope"();
