-- Stage 23 / Module 16 - Client Billing core persistence.
-- Creates exactly the five reviewed Client Billing resources with Company, Project, Client and optional BOQ integrity.
-- Number formats, lifecycle vocabularies, claim valuation policy, payment writes and the Stage-26 AR adapter remain intentionally deferred.

CREATE TABLE "client_contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "contract_no" VARCHAR(100) NOT NULL,
    "contract_value" DECIMAL(18,2) NOT NULL,
    "revised_value" DECIMAL(18,2) NOT NULL,
    "billing_method" VARCHAR(64) NOT NULL,
    "retention_percent" DECIMAL(7,4) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "client_contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_contracts_contract_no_not_blank" CHECK (length(btrim("contract_no")) > 0),
    CONSTRAINT "client_contracts_billing_method_not_blank" CHECK (length(btrim("billing_method")) > 0),
    CONSTRAINT "client_contracts_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "client_contracts_currency_iso_shape" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "client_contracts_contract_value_nonnegative" CHECK ("contract_value" >= 0),
    CONSTRAINT "client_contracts_revised_value_nonnegative" CHECK ("revised_value" >= 0),
    CONSTRAINT "client_contracts_retention_percent_range" CHECK ("retention_percent" >= 0 AND "retention_percent" <= 100)
);

CREATE TABLE "progress_claims" (
    "id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "claim_no" VARCHAR(100) NOT NULL,
    "period_end" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "gross_value" DECIMAL(18,2) NOT NULL,
    "previous_value" DECIMAL(18,2) NOT NULL,
    "current_value" DECIMAL(18,2) NOT NULL,
    "retention_amount" DECIMAL(18,2) NOT NULL,
    "deduction_amount" DECIMAL(18,2) NOT NULL,
    "certified_value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "progress_claims_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "progress_claims_claim_no_not_blank" CHECK (length(btrim("claim_no")) > 0),
    CONSTRAINT "progress_claims_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "progress_claims_gross_value_nonnegative" CHECK ("gross_value" >= 0),
    CONSTRAINT "progress_claims_previous_value_nonnegative" CHECK ("previous_value" >= 0),
    CONSTRAINT "progress_claims_current_value_nonnegative" CHECK ("current_value" >= 0),
    CONSTRAINT "progress_claims_retention_amount_nonnegative" CHECK ("retention_amount" >= 0),
    CONSTRAINT "progress_claims_deduction_amount_nonnegative" CHECK ("deduction_amount" >= 0),
    CONSTRAINT "progress_claims_certified_value_nonnegative" CHECK ("certified_value" >= 0)
);

CREATE TABLE "progress_claim_lines" (
    "id" UUID NOT NULL,
    "claim_id" UUID NOT NULL,
    "boq_item_id" UUID,
    "description" TEXT NOT NULL,
    "contract_qty" DECIMAL(18,4),
    "cumulative_qty" DECIMAL(18,4),
    "current_qty" DECIMAL(18,4),
    "rate" DECIMAL(18,4),
    "current_value" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "progress_claim_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "progress_claim_lines_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "progress_claim_lines_contract_qty_nonnegative" CHECK ("contract_qty" IS NULL OR "contract_qty" >= 0),
    CONSTRAINT "progress_claim_lines_cumulative_qty_nonnegative" CHECK ("cumulative_qty" IS NULL OR "cumulative_qty" >= 0),
    CONSTRAINT "progress_claim_lines_current_qty_nonnegative" CHECK ("current_qty" IS NULL OR "current_qty" >= 0),
    CONSTRAINT "progress_claim_lines_rate_nonnegative" CHECK ("rate" IS NULL OR "rate" >= 0),
    CONSTRAINT "progress_claim_lines_current_value_nonnegative" CHECK ("current_value" >= 0)
);

CREATE TABLE "client_invoices" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "contract_id" UUID NOT NULL,
    "claim_id" UUID,
    "invoice_no" VARCHAR(100) NOT NULL,
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "gross_amount" DECIMAL(18,2) NOT NULL,
    "retention_amount" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL,
    "total_receivable" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "client_invoices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_invoices_invoice_no_not_blank" CHECK (length(btrim("invoice_no")) > 0),
    CONSTRAINT "client_invoices_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "client_invoices_due_date_order" CHECK ("due_date" >= "invoice_date"),
    CONSTRAINT "client_invoices_gross_amount_nonnegative" CHECK ("gross_amount" >= 0),
    CONSTRAINT "client_invoices_retention_amount_nonnegative" CHECK ("retention_amount" >= 0),
    CONSTRAINT "client_invoices_tax_amount_nonnegative" CHECK ("tax_amount" >= 0),
    CONSTRAINT "client_invoices_total_receivable_nonnegative" CHECK ("total_receivable" >= 0)
);

CREATE TABLE "retention_ledger" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" UUID NOT NULL,
    "direction" VARCHAR(32) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "released_amount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "retention_ledger_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "retention_ledger_source_type_not_blank" CHECK (length(btrim("source_type")) > 0),
    CONSTRAINT "retention_ledger_direction_not_blank" CHECK (length(btrim("direction")) > 0),
    CONSTRAINT "retention_ledger_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "retention_ledger_amount_nonnegative" CHECK ("amount" >= 0),
    CONSTRAINT "retention_ledger_released_amount_range" CHECK ("released_amount" >= 0 AND "released_amount" <= "amount")
);

-- Number scope is intentionally not invented. Foundation sequence usage is frozen later in service code.
CREATE INDEX "client_contracts_company_contract_no_idx"
    ON "client_contracts"("company_id", "contract_no");
CREATE INDEX "client_contracts_company_client_status_idx"
    ON "client_contracts"("company_id", "client_id", "status");
CREATE INDEX "client_contracts_project_status_idx"
    ON "client_contracts"("project_id", "status");
CREATE UNIQUE INDEX "client_contracts_id_company_project_uq"
    ON "client_contracts"("id", "company_id", "project_id");

CREATE INDEX "progress_claims_contract_claim_no_idx"
    ON "progress_claims"("contract_id", "claim_no");
CREATE INDEX "progress_claims_contract_status_period_idx"
    ON "progress_claims"("contract_id", "status", "period_end");

CREATE INDEX "progress_claim_lines_claim_idx"
    ON "progress_claim_lines"("claim_id");
CREATE INDEX "progress_claim_lines_boq_item_idx"
    ON "progress_claim_lines"("boq_item_id");

-- One Claim can create at most one Client Invoice; multiple NULL claim_id values remain allowed by PostgreSQL.
CREATE UNIQUE INDEX "client_invoices_claim_uq"
    ON "client_invoices"("claim_id");
CREATE INDEX "client_invoices_company_invoice_no_idx"
    ON "client_invoices"("company_id", "invoice_no");
CREATE INDEX "client_invoices_project_status_date_idx"
    ON "client_invoices"("project_id", "status", "invoice_date");
CREATE INDEX "client_invoices_contract_date_idx"
    ON "client_invoices"("contract_id", "invoice_date");

CREATE INDEX "retention_ledger_company_project_status_idx"
    ON "retention_ledger"("company_id", "project_id", "status");
CREATE INDEX "retention_ledger_source_idx"
    ON "retention_ledger"("source_type", "source_id");

ALTER TABLE "client_contracts"
    ADD CONSTRAINT "client_contracts_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "client_contracts_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "client_contracts_client_company_fkey"
        FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "progress_claims"
    ADD CONSTRAINT "progress_claims_contract_fkey"
        FOREIGN KEY ("contract_id") REFERENCES "client_contracts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "progress_claim_lines"
    ADD CONSTRAINT "progress_claim_lines_claim_fkey"
        FOREIGN KEY ("claim_id") REFERENCES "progress_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "progress_claim_lines_boq_item_fkey"
        FOREIGN KEY ("boq_item_id") REFERENCES "boq_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_invoices"
    ADD CONSTRAINT "client_invoices_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "client_invoices_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "client_invoices_contract_company_project_fkey"
        FOREIGN KEY ("contract_id", "company_id", "project_id") REFERENCES "client_contracts"("id", "company_id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "client_invoices_claim_fkey"
        FOREIGN KEY ("claim_id") REFERENCES "progress_claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "retention_ledger"
    ADD CONSTRAINT "retention_ledger_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "retention_ledger_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Purpose: keep optional BOQ claim lines inside the billing Contract Project and Company.
CREATE FUNCTION "module_16_validate_progress_claim_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    contract_company_id UUID;
    contract_project_id UUID;
    boq_company_id UUID;
    boq_project_id UUID;
BEGIN
    IF NEW."boq_item_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT contract."company_id", contract."project_id"
      INTO contract_company_id, contract_project_id
      FROM "progress_claims" claim
      JOIN "client_contracts" contract ON contract."id" = claim."contract_id"
     WHERE claim."id" = NEW."claim_id";

    SELECT boq."company_id", boq."project_id"
      INTO boq_company_id, boq_project_id
      FROM "boq_items" item
      JOIN "boq_revisions" revision ON revision."id" = item."boq_revision_id"
      JOIN "boqs" boq ON boq."id" = revision."boq_id"
     WHERE item."id" = NEW."boq_item_id";

    IF boq_company_id IS DISTINCT FROM contract_company_id
       OR boq_project_id IS DISTINCT FROM contract_project_id THEN
        RAISE EXCEPTION 'Progress Claim BOQ item must belong to a Project-mapped BOQ for the Client Contract Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "progress_claim_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "claim_id", "boq_item_id"
ON "progress_claim_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_16_validate_progress_claim_line_scope"();

-- Purpose: ensure an optional Invoice claim belongs to the same Client Contract as the Invoice.
CREATE FUNCTION "module_16_validate_client_invoice_claim_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    claim_contract_id UUID;
BEGIN
    IF NEW."claim_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "contract_id"
      INTO claim_contract_id
      FROM "progress_claims"
     WHERE "id" = NEW."claim_id";

    IF claim_contract_id IS DISTINCT FROM NEW."contract_id" THEN
        RAISE EXCEPTION 'Client Invoice claim must belong to the same Client Contract'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "client_invoices_claim_scope_integrity"
BEFORE INSERT OR UPDATE OF "contract_id", "claim_id"
ON "client_invoices"
FOR EACH ROW
EXECUTE FUNCTION "module_16_validate_client_invoice_claim_scope"();

-- Purpose: preserve Client Invoice identity and financial values while allowing later lifecycle status updates.
CREATE FUNCTION "module_16_validate_client_invoice_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Client Invoice source history cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."company_id" IS DISTINCT FROM OLD."company_id"
       OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."contract_id" IS DISTINCT FROM OLD."contract_id"
       OR NEW."claim_id" IS DISTINCT FROM OLD."claim_id"
       OR NEW."invoice_no" IS DISTINCT FROM OLD."invoice_no"
       OR NEW."invoice_date" IS DISTINCT FROM OLD."invoice_date"
       OR NEW."due_date" IS DISTINCT FROM OLD."due_date"
       OR NEW."gross_amount" IS DISTINCT FROM OLD."gross_amount"
       OR NEW."retention_amount" IS DISTINCT FROM OLD."retention_amount"
       OR NEW."tax_amount" IS DISTINCT FROM OLD."tax_amount"
       OR NEW."total_receivable" IS DISTINCT FROM OLD."total_receivable" THEN
        RAISE EXCEPTION 'Client Invoice identity and financial values are immutable'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "client_invoices_history_integrity"
BEFORE UPDATE OR DELETE ON "client_invoices"
FOR EACH ROW
EXECUTE FUNCTION "module_16_validate_client_invoice_update"();

-- Purpose: stop an invoiced Claim or its lines from rewriting the issued billing source history.
CREATE FUNCTION "module_16_reject_invoiced_claim_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    protected_claim_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'progress_claims' THEN
        protected_claim_id := OLD."id";
    ELSE
        protected_claim_id := (to_jsonb(OLD)->>'claim_id')::UUID;
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "client_invoices"
         WHERE "claim_id" = protected_claim_id
    ) THEN
        RAISE EXCEPTION 'Invoiced Progress Claim history is immutable'
            USING ERRCODE = '23514';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "progress_claims_invoiced_history_integrity"
BEFORE UPDATE OR DELETE ON "progress_claims"
FOR EACH ROW
EXECUTE FUNCTION "module_16_reject_invoiced_claim_mutation"();

CREATE TRIGGER "progress_claim_lines_invoiced_history_integrity"
BEFORE UPDATE OR DELETE ON "progress_claim_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_16_reject_invoiced_claim_mutation"();

-- Purpose: keep retention source identity/value fixed while allowing released_amount to move forward only.
CREATE FUNCTION "module_16_validate_retention_ledger_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Retention ledger history cannot be deleted'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."company_id" IS DISTINCT FROM OLD."company_id"
       OR NEW."project_id" IS DISTINCT FROM OLD."project_id"
       OR NEW."source_type" IS DISTINCT FROM OLD."source_type"
       OR NEW."source_id" IS DISTINCT FROM OLD."source_id"
       OR NEW."direction" IS DISTINCT FROM OLD."direction"
       OR NEW."amount" IS DISTINCT FROM OLD."amount" THEN
        RAISE EXCEPTION 'Retention ledger source identity and retained amount are immutable'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."released_amount" < OLD."released_amount" THEN
        RAISE EXCEPTION 'Retention released amount cannot move backwards'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "retention_ledger_history_integrity"
BEFORE UPDATE OR DELETE ON "retention_ledger"
FOR EACH ROW
EXECUTE FUNCTION "module_16_validate_retention_ledger_update"();
