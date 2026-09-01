-- Stage 13 / Module 8 - Procurement & RFQ core persistence.
-- Part I makes Module 8 the supplier/vendor master owner. This migration creates the eight reviewed
-- source/Part-I persistence resources without adding HTTP CRUD, approval state duplication, PO commitments,
-- Module-10 inventory ownership or an undocumented rfq_items table.
-- supplier_quotation_items.rfq_item_id remains an explicit required UUID scalar with no FK because the
-- controlling source defines the field but no target table; this is recorded as a source gap, not hidden.

CREATE TABLE "vendors" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "display_name" VARCHAR(300) NOT NULL,
    "tax_no" VARCHAR(100),
    "payment_terms_days" INTEGER,
    "currency" CHAR(3),
    "status" VARCHAR(32) NOT NULL,
    "qualification_status" VARCHAR(32),

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendors_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "vendors_legal_name_not_blank" CHECK (length(btrim("legal_name")) > 0),
    CONSTRAINT "vendors_display_name_not_blank" CHECK (length(btrim("display_name")) > 0),
    CONSTRAINT "vendors_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "vendors_payment_terms_nonnegative" CHECK ("payment_terms_days" IS NULL OR "payment_terms_days" >= 0)
);

CREATE TABLE "vendor_contacts" (
    "id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "role" VARCHAR(120) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "vendor_contacts_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "vendor_contacts_email_not_blank" CHECK (length(btrim("email")) > 0),
    CONSTRAINT "vendor_contacts_phone_not_blank" CHECK (length(btrim("phone")) > 0),
    CONSTRAINT "vendor_contacts_role_not_blank" CHECK (length(btrim("role")) > 0),
    CONSTRAINT "vendor_contacts_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "purchase_requisitions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "pr_no" VARCHAR(100) NOT NULL,
    "requested_by" UUID NOT NULL,
    "required_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "purpose" TEXT NOT NULL,

    CONSTRAINT "purchase_requisitions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_requisitions_pr_no_not_blank" CHECK (length(btrim("pr_no")) > 0),
    CONSTRAINT "purchase_requisitions_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "purchase_requisitions_purpose_not_blank" CHECK (length(btrim("purpose")) > 0)
);

CREATE TABLE "purchase_requisition_items" (
    "id" UUID NOT NULL,
    "requisition_id" UUID NOT NULL,
    "item_id" UUID,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(64) NOT NULL,
    "estimated_rate" DECIMAL(18,4),
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,

    CONSTRAINT "purchase_requisition_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "purchase_requisition_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "purchase_requisition_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "purchase_requisition_items_unit_not_blank" CHECK (length(btrim("unit")) > 0),
    CONSTRAINT "purchase_requisition_items_estimated_rate_nonnegative" CHECK ("estimated_rate" IS NULL OR "estimated_rate" >= 0)
);

CREATE TABLE "rfqs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "rfq_no" VARCHAR(100) NOT NULL,
    "requisition_id" UUID,
    "issue_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "buyer_user_id" UUID NOT NULL,

    CONSTRAINT "rfqs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rfqs_rfq_no_not_blank" CHECK (length(btrim("rfq_no")) > 0),
    CONSTRAINT "rfqs_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "rfq_vendors" (
    "rfq_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "invited_at" TIMESTAMPTZ(6) NOT NULL,
    "response_status" VARCHAR(32) NOT NULL,

    CONSTRAINT "rfq_vendors_pkey" PRIMARY KEY ("rfq_id", "vendor_id"),
    CONSTRAINT "rfq_vendors_response_status_not_blank" CHECK (length(btrim("response_status")) > 0)
);

CREATE TABLE "supplier_quotations" (
    "id" UUID NOT NULL,
    "rfq_id" UUID NOT NULL,
    "vendor_id" UUID NOT NULL,
    "quote_no" VARCHAR(120) NOT NULL,
    "quote_date" DATE NOT NULL,
    "valid_until" DATE NOT NULL,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "lead_time_days" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "supplier_quotations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_quotations_quote_no_not_blank" CHECK (length(btrim("quote_no")) > 0),
    CONSTRAINT "supplier_quotations_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "supplier_quotations_subtotal_nonnegative" CHECK ("subtotal" >= 0),
    CONSTRAINT "supplier_quotations_tax_nonnegative" CHECK ("tax" >= 0),
    CONSTRAINT "supplier_quotations_total_nonnegative" CHECK ("total" >= 0),
    CONSTRAINT "supplier_quotations_lead_time_nonnegative" CHECK ("lead_time_days" >= 0)
);

CREATE TABLE "supplier_quotation_items" (
    "id" UUID NOT NULL,
    "quotation_id" UUID NOT NULL,
    "rfq_item_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_rate" DECIMAL(18,4) NOT NULL,
    "discount" DECIMAL(18,2) NOT NULL,
    "tax" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "supplier_quotation_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "supplier_quotation_items_quantity_positive" CHECK ("quantity" > 0),
    CONSTRAINT "supplier_quotation_items_unit_rate_nonnegative" CHECK ("unit_rate" >= 0),
    CONSTRAINT "supplier_quotation_items_discount_nonnegative" CHECK ("discount" >= 0),
    CONSTRAINT "supplier_quotation_items_tax_nonnegative" CHECK ("tax" >= 0),
    CONSTRAINT "supplier_quotation_items_total_nonnegative" CHECK ("total" >= 0)
);

CREATE UNIQUE INDEX "vendors_id_company_uq" ON "vendors"("id", "company_id");
CREATE INDEX "vendors_company_code_idx" ON "vendors"("company_id", "code");
CREATE INDEX "vendors_company_status_qualification_idx" ON "vendors"("company_id", "status", "qualification_status");

CREATE INDEX "vendor_contacts_vendor_status_idx" ON "vendor_contacts"("vendor_id", "status");
CREATE INDEX "vendor_contacts_vendor_email_idx" ON "vendor_contacts"("vendor_id", "email");

CREATE UNIQUE INDEX "purchase_requisitions_company_pr_no_uq" ON "purchase_requisitions"("company_id", "pr_no");
CREATE UNIQUE INDEX "purchase_requisitions_id_company_project_uq" ON "purchase_requisitions"("id", "company_id", "project_id");
CREATE INDEX "purchase_requisitions_company_project_status_required_idx" ON "purchase_requisitions"("company_id", "project_id", "status", "required_date");
CREATE INDEX "purchase_requisitions_requester_required_idx" ON "purchase_requisitions"("requested_by", "required_date");

CREATE INDEX "purchase_requisition_items_requisition_cost_structure_idx" ON "purchase_requisition_items"("requisition_id", "wbs_node_id", "cost_code_id", "cost_type_id");
CREATE INDEX "purchase_requisition_items_future_item_idx" ON "purchase_requisition_items"("item_id");

CREATE UNIQUE INDEX "rfqs_company_rfq_no_uq" ON "rfqs"("company_id", "rfq_no");
CREATE UNIQUE INDEX "rfqs_id_company_project_uq" ON "rfqs"("id", "company_id", "project_id");
CREATE INDEX "rfqs_company_project_status_due_idx" ON "rfqs"("company_id", "project_id", "status", "due_date");
CREATE INDEX "rfqs_requisition_idx" ON "rfqs"("requisition_id");
CREATE INDEX "rfqs_buyer_due_idx" ON "rfqs"("buyer_user_id", "due_date");

CREATE INDEX "rfq_vendors_vendor_response_idx" ON "rfq_vendors"("vendor_id", "response_status");
CREATE INDEX "rfq_vendors_rfq_response_idx" ON "rfq_vendors"("rfq_id", "response_status");

CREATE INDEX "supplier_quotations_rfq_status_total_idx" ON "supplier_quotations"("rfq_id", "status", "total");
CREATE INDEX "supplier_quotations_vendor_quote_date_idx" ON "supplier_quotations"("vendor_id", "quote_date");
CREATE INDEX "supplier_quotations_rfq_vendor_idx" ON "supplier_quotations"("rfq_id", "vendor_id");

CREATE INDEX "supplier_quotation_items_quotation_idx" ON "supplier_quotation_items"("quotation_id");
CREATE INDEX "supplier_quotation_items_unresolved_rfq_item_idx" ON "supplier_quotation_items"("rfq_item_id");

ALTER TABLE "vendors"
    ADD CONSTRAINT "vendors_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vendor_contacts"
    ADD CONSTRAINT "vendor_contacts_vendor_fkey"
        FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_requisitions"
    ADD CONSTRAINT "purchase_requisitions_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_requisitions_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "purchase_requisitions_requester_company_fkey"
        FOREIGN KEY ("requested_by", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "purchase_requisition_items"
    ADD CONSTRAINT "purchase_requisition_items_requisition_fkey"
        FOREIGN KEY ("requisition_id") REFERENCES "purchase_requisitions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_requisition_items_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_requisition_items_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "purchase_requisition_items_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "rfqs"
    ADD CONSTRAINT "rfqs_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "rfqs_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "rfqs_requisition_fkey"
        FOREIGN KEY ("requisition_id") REFERENCES "purchase_requisitions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "rfqs_buyer_company_fkey"
        FOREIGN KEY ("buyer_user_id", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "rfq_vendors"
    ADD CONSTRAINT "rfq_vendors_rfq_fkey"
        FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "rfq_vendors_vendor_fkey"
        FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_quotations"
    ADD CONSTRAINT "supplier_quotations_rfq_fkey"
        FOREIGN KEY ("rfq_id") REFERENCES "rfqs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "supplier_quotations_vendor_fkey"
        FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "supplier_quotation_items"
    ADD CONSTRAINT "supplier_quotation_items_quotation_fkey"
        FOREIGN KEY ("quotation_id") REFERENCES "supplier_quotations"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate that each requisition item resolves to one posting-enabled Module-6 Project cost combination.
CREATE FUNCTION "module_8_validate_pr_item_cost_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    requisition_project_id UUID;
    valid_mapping_id UUID;
BEGIN
    SELECT "project_id"
      INTO requisition_project_id
      FROM "purchase_requisitions"
     WHERE "id" = NEW."requisition_id";

    SELECT mapping."id"
      INTO valid_mapping_id
      FROM "project_cost_codes" mapping
     WHERE mapping."project_id" = requisition_project_id
       AND mapping."wbs_node_id" = NEW."wbs_node_id"
       AND mapping."cost_code_id" = NEW."cost_code_id"
       AND mapping."cost_type_id" = NEW."cost_type_id"
       AND mapping."is_posting_allowed" = TRUE;

    IF valid_mapping_id IS NULL THEN
        RAISE EXCEPTION 'Purchase requisition item must use one posting-enabled cost structure in the requisition Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "purchase_requisition_items_cost_structure_integrity"
BEFORE INSERT OR UPDATE OF "requisition_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "purchase_requisition_items"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_pr_item_cost_scope"();

-- A nullable source requisition is allowed, but when present it must belong to the exact RFQ Company + Project.
CREATE FUNCTION "module_8_validate_rfq_requisition_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    requisition_company_id UUID;
    requisition_project_id UUID;
BEGIN
    IF NEW."requisition_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "company_id", "project_id"
      INTO requisition_company_id, requisition_project_id
      FROM "purchase_requisitions"
     WHERE "id" = NEW."requisition_id";

    IF requisition_company_id IS DISTINCT FROM NEW."company_id"
       OR requisition_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'RFQ requisition must belong to the same Company and Project as the RFQ'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "rfqs_requisition_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "requisition_id"
ON "rfqs"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_rfq_requisition_scope"();

-- Module 8 owns the vendor master. Every RFQ invitation must resolve inside the RFQ Company.
CREATE FUNCTION "module_8_validate_rfq_vendor_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    rfq_company_id UUID;
    vendor_company_id UUID;
BEGIN
    SELECT "company_id" INTO rfq_company_id FROM "rfqs" WHERE "id" = NEW."rfq_id";
    SELECT "company_id" INTO vendor_company_id FROM "vendors" WHERE "id" = NEW."vendor_id";

    IF rfq_company_id IS DISTINCT FROM vendor_company_id THEN
        RAISE EXCEPTION 'RFQ vendor must belong to the same Company as the RFQ'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "rfq_vendors_company_integrity"
BEFORE INSERT OR UPDATE OF "rfq_id", "vendor_id"
ON "rfq_vendors"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_rfq_vendor_scope"();

-- A supplier quotation must use a vendor already invited to that RFQ and therefore in the same Company scope.
CREATE FUNCTION "module_8_validate_supplier_quotation_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    rfq_company_id UUID;
    vendor_company_id UUID;
    invited BOOLEAN;
BEGIN
    SELECT "company_id" INTO rfq_company_id FROM "rfqs" WHERE "id" = NEW."rfq_id";
    SELECT "company_id" INTO vendor_company_id FROM "vendors" WHERE "id" = NEW."vendor_id";
    SELECT EXISTS (
        SELECT 1
          FROM "rfq_vendors"
         WHERE "rfq_id" = NEW."rfq_id"
           AND "vendor_id" = NEW."vendor_id"
    ) INTO invited;

    IF rfq_company_id IS DISTINCT FROM vendor_company_id OR invited IS NOT TRUE THEN
        RAISE EXCEPTION 'Supplier quotation vendor must be invited to the RFQ inside the same Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "supplier_quotations_scope_integrity"
BEFORE INSERT OR UPDATE OF "rfq_id", "vendor_id"
ON "supplier_quotations"
FOR EACH ROW
EXECUTE FUNCTION "module_8_validate_supplier_quotation_scope"();
