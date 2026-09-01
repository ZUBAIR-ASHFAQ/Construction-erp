-- Stage 14 / Module 9 - Purchase Orders core persistence.
-- Creates exactly the three source-defined Purchase Order tables and reuses Module-8 Vendor/quotation,
-- Module-6 cost structure and Module-24A user authority. It does not create Inventory, Finance, approval,
-- direct-purchase-exception, cancellation-reason or revision-line-history tables/columns that the source does not define.
-- purchase_order_items.item_id remains a nullable UUID scalar until Module 10 owns the item master.

CREATE TABLE "purchase_orders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "po_no" VARCHAR(100) NOT NULL,
    "vendor_id" UUID NOT NULL,
    "quotation_id" UUID,
    "order_date" DATE NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "delivery_address" TEXT NOT NULL,
    "terms" TEXT NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_orders_po_no_not_blank" CHECK (length(btrim("po_no")) > 0),
    CONSTRAINT "purchase_orders_currency_not_blank" CHECK (length(btrim("currency")) > 0),
    CONSTRAINT "purchase_orders_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "purchase_orders_subtotal_nonnegative" CHECK ("subtotal" >= 0),
    CONSTRAINT "purchase_orders_tax_nonnegative" CHECK ("tax" >= 0),
    CONSTRAINT "purchase_orders_total_nonnegative" CHECK ("total" >= 0),
    CONSTRAINT "purchase_orders_delivery_address_not_blank" CHECK (length(btrim("delivery_address")) > 0),
    CONSTRAINT "purchase_orders_terms_not_blank" CHECK (length(btrim("terms")) > 0)
);

CREATE TABLE "purchase_order_items" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(64) NOT NULL,
    "unit_rate" DECIMAL(18,4) NOT NULL,
    "tax_rate" DECIMAL(18,4) NOT NULL,
    "line_total" DECIMAL(18,2) NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "received_qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "invoiced_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "purchase_order_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "purchase_order_items_unit_not_blank" CHECK (length(btrim("unit")) > 0),
    CONSTRAINT "purchase_order_items_unit_rate_nonnegative" CHECK ("unit_rate" >= 0),
    CONSTRAINT "purchase_order_items_tax_rate_nonnegative" CHECK ("tax_rate" >= 0),
    CONSTRAINT "purchase_order_items_line_total_nonnegative" CHECK ("line_total" >= 0),
    CONSTRAINT "purchase_order_items_received_qty_nonnegative" CHECK ("received_qty" >= 0),
    CONSTRAINT "purchase_order_items_invoiced_amount_nonnegative" CHECK ("invoiced_amount" >= 0)
);

CREATE TABLE "purchase_order_revisions" (
    "id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "total_before" DECIMAL(18,2) NOT NULL,
    "total_after" DECIMAL(18,2) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "created_by" UUID NOT NULL,

    CONSTRAINT "purchase_order_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_order_revisions_revision_positive" CHECK ("revision_no" > 0),
    CONSTRAINT "purchase_order_revisions_reason_not_blank" CHECK (length(btrim("reason")) > 0),
    CONSTRAINT "purchase_order_revisions_total_before_nonnegative" CHECK ("total_before" >= 0),
    CONSTRAINT "purchase_order_revisions_total_after_nonnegative" CHECK ("total_after" >= 0)
);

CREATE UNIQUE INDEX "purchase_orders_company_po_no_uq"
    ON "purchase_orders"("company_id", "po_no");
CREATE UNIQUE INDEX "purchase_orders_id_company_project_uq"
    ON "purchase_orders"("id", "company_id", "project_id");
CREATE INDEX "purchase_orders_company_project_status_order_idx"
    ON "purchase_orders"("company_id", "project_id", "status", "order_date");
CREATE INDEX "purchase_orders_company_vendor_status_idx"
    ON "purchase_orders"("company_id", "vendor_id", "status");
CREATE INDEX "purchase_orders_quotation_idx"
    ON "purchase_orders"("quotation_id");

CREATE INDEX "purchase_order_items_po_cost_structure_idx"
    ON "purchase_order_items"("purchase_order_id", "wbs_node_id", "cost_code_id", "cost_type_id");
CREATE INDEX "purchase_order_items_future_item_idx"
    ON "purchase_order_items"("item_id");

CREATE UNIQUE INDEX "purchase_order_revisions_po_revision_uq"
    ON "purchase_order_revisions"("purchase_order_id", "revision_no");
CREATE INDEX "purchase_order_revisions_po_approved_idx"
    ON "purchase_order_revisions"("purchase_order_id", "approved_at");
CREATE INDEX "purchase_order_revisions_creator_idx"
    ON "purchase_order_revisions"("created_by");

ALTER TABLE "purchase_orders"
    ADD CONSTRAINT "purchase_orders_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_orders_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "purchase_orders_vendor_company_fkey"
        FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "purchase_orders_quotation_fkey"
        FOREIGN KEY ("quotation_id") REFERENCES "supplier_quotations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items"
    ADD CONSTRAINT "purchase_order_items_purchase_order_fkey"
        FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_order_items_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_order_items_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_order_items_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_revisions"
    ADD CONSTRAINT "purchase_order_revisions_purchase_order_fkey"
        FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_order_revisions_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- A quotation-backed PO must use the exact quotation Vendor and RFQ Company/Project chain.
-- Selection state itself remains Module-8 service authority because the source defines no selected-quotation FK/column.
CREATE FUNCTION "module_9_validate_po_quotation_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    quotation_vendor_id UUID;
    quotation_company_id UUID;
    quotation_project_id UUID;
BEGIN
    IF NEW."quotation_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT quotation."vendor_id", rfq."company_id", rfq."project_id"
      INTO quotation_vendor_id, quotation_company_id, quotation_project_id
      FROM "supplier_quotations" quotation
      JOIN "rfqs" rfq ON rfq."id" = quotation."rfq_id"
     WHERE quotation."id" = NEW."quotation_id";

    IF quotation_vendor_id IS DISTINCT FROM NEW."vendor_id"
       OR quotation_company_id IS DISTINCT FROM NEW."company_id"
       OR quotation_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Purchase Order quotation must match the PO Vendor, Company and Project procurement chain'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_orders_quotation_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "vendor_id", "quotation_id"
ON "purchase_orders"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_po_quotation_scope"();

-- Every PO line must resolve to one posting-enabled Module-6 cost structure in the PO Project.
CREATE FUNCTION "module_9_validate_po_item_cost_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    po_project_id UUID;
    valid_mapping_id UUID;
BEGIN
    SELECT "project_id"
      INTO po_project_id
      FROM "purchase_orders"
     WHERE "id" = NEW."purchase_order_id";

    SELECT mapping."id"
      INTO valid_mapping_id
      FROM "project_cost_codes" mapping
     WHERE mapping."project_id" = po_project_id
       AND mapping."wbs_node_id" = NEW."wbs_node_id"
       AND mapping."cost_code_id" = NEW."cost_code_id"
       AND mapping."cost_type_id" = NEW."cost_type_id"
       AND mapping."is_posting_allowed" = TRUE;

    IF valid_mapping_id IS NULL THEN
        RAISE EXCEPTION 'Purchase Order item must use one posting-enabled cost structure in the PO Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_items_cost_structure_integrity"
BEFORE INSERT OR UPDATE OF "purchase_order_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "purchase_order_items"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_po_item_cost_scope"();

-- Revision creator must belong to the same Company as the Purchase Order.
CREATE FUNCTION "module_9_validate_po_revision_creator_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    po_company_id UUID;
    creator_company_id UUID;
BEGIN
    SELECT "company_id" INTO po_company_id
      FROM "purchase_orders"
     WHERE "id" = NEW."purchase_order_id";

    SELECT "company_id" INTO creator_company_id
      FROM "users"
     WHERE "id" = NEW."created_by";

    IF po_company_id IS DISTINCT FROM creator_company_id THEN
        RAISE EXCEPTION 'Purchase Order revision creator must belong to the same Company as the PO'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_order_revisions_creator_scope_integrity"
BEFORE INSERT OR UPDATE OF "purchase_order_id", "created_by"
ON "purchase_order_revisions"
FOR EACH ROW
EXECUTE FUNCTION "module_9_validate_po_revision_creator_scope"();
