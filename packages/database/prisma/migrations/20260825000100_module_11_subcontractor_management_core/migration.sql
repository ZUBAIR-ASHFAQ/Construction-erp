-- Stage 16 / Module 11 - Subcontractor Management core persistence.
-- Creates exactly the five reviewed Module-11 resources plus the corrected nullable Vendor link.
-- Approval workflow records remain owned by Module 22, commitments by Module 7, and AP/Finance adapters by Module 15B.
-- No revision, deduction, retention-ledger, approval, Finance or Change Order table is invented here.

CREATE TABLE "subcontractors" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "vendor_id" UUID,
    "code" VARCHAR(100) NOT NULL,
    "legal_name" VARCHAR(300) NOT NULL,
    "tax_no" VARCHAR(100),
    "status" VARCHAR(32) NOT NULL,
    "contact_json" JSONB NOT NULL,
    "compliance_status" VARCHAR(32) NOT NULL,

    CONSTRAINT "subcontractors_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontractors_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "subcontractors_legal_name_not_blank" CHECK (length(btrim("legal_name")) > 0),
    CONSTRAINT "subcontractors_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "subcontractors_compliance_status_not_blank" CHECK (length(btrim("compliance_status")) > 0)
);

CREATE TABLE "subcontracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "subcontract_no" VARCHAR(100) NOT NULL,
    "subcontractor_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "original_value" DECIMAL(18,2) NOT NULL,
    "revised_value" DECIMAL(18,2) NOT NULL,
    "retention_percent" DECIMAL(7,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,

    CONSTRAINT "subcontracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontracts_no_not_blank" CHECK (length(btrim("subcontract_no")) > 0),
    CONSTRAINT "subcontracts_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "subcontracts_date_order" CHECK ("end_date" IS NULL OR "end_date" >= "start_date"),
    CONSTRAINT "subcontracts_original_value_nonnegative" CHECK ("original_value" >= 0),
    CONSTRAINT "subcontracts_revised_value_nonnegative" CHECK ("revised_value" >= 0),
    CONSTRAINT "subcontracts_retention_percent_range" CHECK ("retention_percent" >= 0 AND "retention_percent" <= 100),
    CONSTRAINT "subcontracts_currency_three_chars" CHECK (char_length(btrim("currency")) = 3)
);

CREATE TABLE "subcontract_items" (
    "id" UUID NOT NULL,
    "subcontract_id" UUID NOT NULL,
    "boq_item_id" UUID,
    "description" VARCHAR(1000) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,

    CONSTRAINT "subcontract_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontract_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "subcontract_items_unit_not_blank" CHECK (length(btrim("unit")) > 0)
);

CREATE TABLE "subcontract_payment_applications" (
    "id" UUID NOT NULL,
    "subcontract_id" UUID NOT NULL,
    "application_no" VARCHAR(100) NOT NULL,
    "period_from" DATE NOT NULL,
    "period_to" DATE NOT NULL,
    "claimed_amount" DECIMAL(18,2) NOT NULL,
    "certified_amount" DECIMAL(18,2) NOT NULL,
    "retention_amount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "subcontract_payment_applications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontract_payment_applications_no_not_blank" CHECK (length(btrim("application_no")) > 0),
    CONSTRAINT "subcontract_payment_applications_period_order" CHECK ("period_to" >= "period_from"),
    CONSTRAINT "subcontract_payment_applications_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "subcontract_payment_lines" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "subcontract_item_id" UUID NOT NULL,
    "previous_qty" DECIMAL(18,4) NOT NULL,
    "current_qty" DECIMAL(18,4) NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "certified_value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "subcontract_payment_lines_pkey" PRIMARY KEY ("id")
);

-- The source says subcontract numbers are unique inside Company/Project policy without choosing the database shape.
-- Stage 16 uses Company + Project + subcontract number as the narrow persistence convention.
CREATE UNIQUE INDEX "subcontractors_id_company_uq" ON "subcontractors"("id", "company_id");
CREATE INDEX "subcontractors_company_code_idx" ON "subcontractors"("company_id", "code");
CREATE INDEX "subcontractors_company_vendor_idx" ON "subcontractors"("company_id", "vendor_id");
CREATE INDEX "subcontractors_company_status_compliance_idx" ON "subcontractors"("company_id", "status", "compliance_status");

CREATE UNIQUE INDEX "subcontracts_company_project_no_uq" ON "subcontracts"("company_id", "project_id", "subcontract_no");
CREATE INDEX "subcontracts_company_project_status_idx" ON "subcontracts"("company_id", "project_id", "status");
CREATE INDEX "subcontracts_subcontractor_status_idx" ON "subcontracts"("subcontractor_id", "status");

CREATE INDEX "subcontract_items_subcontract_idx" ON "subcontract_items"("subcontract_id");
CREATE INDEX "subcontract_items_boq_item_idx" ON "subcontract_items"("boq_item_id");
CREATE INDEX "subcontract_items_cost_structure_idx" ON "subcontract_items"("wbs_node_id", "cost_code_id", "cost_type_id");

-- The source requires concurrency-safe application numbering but does not state its scope.
-- Stage 16 uses one application number per subcontract as the narrow persistence convention.
CREATE UNIQUE INDEX "subcontract_payment_applications_subcontract_no_uq"
    ON "subcontract_payment_applications"("subcontract_id", "application_no");
CREATE INDEX "subcontract_payment_applications_subcontract_status_period_idx"
    ON "subcontract_payment_applications"("subcontract_id", "status", "period_to");

CREATE INDEX "subcontract_payment_lines_application_item_idx"
    ON "subcontract_payment_lines"("application_id", "subcontract_item_id");
CREATE INDEX "subcontract_payment_lines_item_idx" ON "subcontract_payment_lines"("subcontract_item_id");

ALTER TABLE "subcontractors"
    ADD CONSTRAINT "subcontractors_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontractors_vendor_company_fkey"
        FOREIGN KEY ("vendor_id", "company_id") REFERENCES "vendors"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "subcontracts"
    ADD CONSTRAINT "subcontracts_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontracts_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "subcontracts_subcontractor_company_fkey"
        FOREIGN KEY ("subcontractor_id", "company_id") REFERENCES "subcontractors"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "subcontract_items"
    ADD CONSTRAINT "subcontract_items_subcontract_fkey"
        FOREIGN KEY ("subcontract_id") REFERENCES "subcontracts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_items_boq_item_fkey"
        FOREIGN KEY ("boq_item_id") REFERENCES "boq_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_items_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_items_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_items_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subcontract_payment_applications"
    ADD CONSTRAINT "subcontract_payment_applications_subcontract_fkey"
        FOREIGN KEY ("subcontract_id") REFERENCES "subcontracts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "subcontract_payment_lines"
    ADD CONSTRAINT "subcontract_payment_lines_application_fkey"
        FOREIGN KEY ("application_id") REFERENCES "subcontract_payment_applications"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_payment_lines_subcontract_item_fkey"
        FOREIGN KEY ("subcontract_item_id") REFERENCES "subcontract_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- A subcontract scope line must use cost classification from the subcontract Project and Company.
-- If a BOQ item is linked, it must belong to a Project-mapped BOQ for that same Project.
CREATE FUNCTION "module_11_validate_subcontract_item_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    subcontract_company_id UUID;
    subcontract_project_id UUID;
    wbs_company_id UUID;
    wbs_project_id UUID;
    cost_code_company_id UUID;
    cost_type_company_id UUID;
    boq_company_id UUID;
    boq_project_id UUID;
BEGIN
    SELECT "company_id", "project_id"
      INTO subcontract_company_id, subcontract_project_id
      FROM "subcontracts"
     WHERE "id" = NEW."subcontract_id";

    SELECT "company_id", "project_id"
      INTO wbs_company_id, wbs_project_id
      FROM "wbs_nodes"
     WHERE "id" = NEW."wbs_node_id";

    SELECT "company_id" INTO cost_code_company_id
      FROM "cost_codes"
     WHERE "id" = NEW."cost_code_id";

    SELECT "company_id" INTO cost_type_company_id
      FROM "cost_types"
     WHERE "id" = NEW."cost_type_id";

    IF wbs_company_id IS DISTINCT FROM subcontract_company_id
       OR wbs_project_id IS DISTINCT FROM subcontract_project_id
       OR cost_code_company_id IS DISTINCT FROM subcontract_company_id
       OR cost_type_company_id IS DISTINCT FROM subcontract_company_id THEN
        RAISE EXCEPTION 'Subcontract item cost coding must belong to the subcontract Company and Project'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM "project_cost_codes" mapping
         WHERE mapping."project_id" = subcontract_project_id
           AND mapping."wbs_node_id" = NEW."wbs_node_id"
           AND mapping."cost_code_id" = NEW."cost_code_id"
           AND mapping."cost_type_id" = NEW."cost_type_id"
           AND mapping."is_posting_allowed" = TRUE
    ) THEN
        RAISE EXCEPTION 'Subcontract item must use a posting-enabled Project cost-code combination'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."boq_item_id" IS NOT NULL THEN
        SELECT boq."company_id", boq."project_id"
          INTO boq_company_id, boq_project_id
          FROM "boq_items" item
          JOIN "boq_revisions" revision ON revision."id" = item."boq_revision_id"
          JOIN "boqs" boq ON boq."id" = revision."boq_id"
         WHERE item."id" = NEW."boq_item_id";

        IF boq_company_id IS DISTINCT FROM subcontract_company_id
           OR boq_project_id IS DISTINCT FROM subcontract_project_id THEN
            RAISE EXCEPTION 'Subcontract BOQ item must belong to the subcontract Company and Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "subcontract_items_scope_integrity"
BEFORE INSERT OR UPDATE OF "subcontract_id", "boq_item_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "subcontract_items"
FOR EACH ROW
EXECUTE FUNCTION "module_11_validate_subcontract_item_scope"();

-- A payment line may only reference an item from the same subcontract as its application.
CREATE FUNCTION "module_11_validate_payment_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    application_subcontract_id UUID;
    item_subcontract_id UUID;
BEGIN
    SELECT "subcontract_id" INTO application_subcontract_id
      FROM "subcontract_payment_applications"
     WHERE "id" = NEW."application_id";

    SELECT "subcontract_id" INTO item_subcontract_id
      FROM "subcontract_items"
     WHERE "id" = NEW."subcontract_item_id";

    IF application_subcontract_id IS DISTINCT FROM item_subcontract_id THEN
        RAISE EXCEPTION 'Payment application line item must belong to the application subcontract'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "subcontract_payment_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "application_id", "subcontract_item_id"
ON "subcontract_payment_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_11_validate_payment_line_scope"();
