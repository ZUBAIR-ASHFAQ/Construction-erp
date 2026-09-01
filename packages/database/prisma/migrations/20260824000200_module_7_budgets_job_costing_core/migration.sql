-- Pass 213 / Stage 12: create the reviewed Module 7 Budgeting & Job Costing persistence.
-- Public source-ingestion routes remain absent; later source modules write through reviewed internal adapters.
-- Budget/source/status vocabularies remain string-backed because the source does not enumerate their public values.

CREATE TABLE "project_budgets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "budget_type" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "total_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_revenue" DECIMAL(18,2),

    CONSTRAINT "project_budgets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_budgets_version_positive" CHECK ("version_no" > 0),
    CONSTRAINT "project_budgets_budget_type_not_blank" CHECK (length(btrim("budget_type")) > 0),
    CONSTRAINT "project_budgets_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "budget_lines" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "quantity" DECIMAL(18,4),
    "unit_rate" DECIMAL(18,4),
    "amount" DECIMAL(18,2) NOT NULL,
    "revenue_amount" DECIMAL(18,2),

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cost_commitments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(200) NOT NULL,
    "source_line_id" VARCHAR(200) NOT NULL,
    "cost_structure_id" UUID NOT NULL,
    "original_amount" DECIMAL(18,2) NOT NULL,
    "remaining_amount" DECIMAL(18,2) NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "cost_commitments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_commitments_source_type_not_blank" CHECK (length(btrim("source_type")) > 0),
    CONSTRAINT "cost_commitments_source_id_not_blank" CHECK (length(btrim("source_id")) > 0),
    CONSTRAINT "cost_commitments_source_line_id_not_blank" CHECK (length(btrim("source_line_id")) > 0),
    CONSTRAINT "cost_commitments_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "cost_actuals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(200) NOT NULL,
    "source_line_id" VARCHAR(200) NOT NULL,
    "posting_date" DATE NOT NULL,
    "cost_structure_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "cost_actuals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cost_actuals_source_type_not_blank" CHECK (length(btrim("source_type")) > 0),
    CONSTRAINT "cost_actuals_source_id_not_blank" CHECK (length(btrim("source_id")) > 0),
    CONSTRAINT "cost_actuals_source_line_id_not_blank" CHECK (length(btrim("source_line_id")) > 0)
);

CREATE TABLE "forecast_lines" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "budget_line_id" UUID NOT NULL,
    "as_of_date" DATE NOT NULL,
    "estimate_to_complete" DECIMAL(18,2) NOT NULL,
    "forecast_final_cost" DECIMAL(18,2) NOT NULL,
    "forecast_final_revenue" DECIMAL(18,2),
    "notes" TEXT NOT NULL,

    CONSTRAINT "forecast_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_budgets_project_version_uq"
    ON "project_budgets"("project_id", "version_no");
CREATE UNIQUE INDEX "project_budgets_id_project_uq"
    ON "project_budgets"("id", "project_id");
CREATE UNIQUE INDEX "project_budgets_id_company_uq"
    ON "project_budgets"("id", "company_id");
CREATE INDEX "project_budgets_company_project_status_version_idx"
    ON "project_budgets"("company_id", "project_id", "status", "version_no");

CREATE UNIQUE INDEX "budget_lines_id_budget_uq"
    ON "budget_lines"("id", "budget_id");
CREATE INDEX "budget_lines_budget_cost_structure_idx"
    ON "budget_lines"("budget_id", "wbs_node_id", "cost_code_id", "cost_type_id");
CREATE INDEX "budget_lines_wbs_node_idx" ON "budget_lines"("wbs_node_id");
CREATE INDEX "budget_lines_cost_code_idx" ON "budget_lines"("cost_code_id");
CREATE INDEX "budget_lines_cost_type_idx" ON "budget_lines"("cost_type_id");

-- Source-key idempotency is scoped to the owning Company + Project and the complete source identity.
CREATE UNIQUE INDEX "cost_commitments_source_key_uq"
    ON "cost_commitments"("company_id", "project_id", "source_type", "source_id", "source_line_id");
CREATE INDEX "cost_commitments_project_status_idx"
    ON "cost_commitments"("project_id", "status");
CREATE INDEX "cost_commitments_cost_structure_idx"
    ON "cost_commitments"("cost_structure_id");

CREATE UNIQUE INDEX "cost_actuals_source_key_uq"
    ON "cost_actuals"("company_id", "project_id", "source_type", "source_id", "source_line_id");
CREATE INDEX "cost_actuals_project_posting_date_idx"
    ON "cost_actuals"("project_id", "posting_date");
CREATE INDEX "cost_actuals_cost_structure_idx"
    ON "cost_actuals"("cost_structure_id");

CREATE INDEX "forecast_lines_project_as_of_date_idx"
    ON "forecast_lines"("project_id", "as_of_date");
CREATE INDEX "forecast_lines_budget_line_as_of_date_idx"
    ON "forecast_lines"("budget_line_id", "as_of_date");

ALTER TABLE "project_budgets"
    ADD CONSTRAINT "project_budgets_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_budgets_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "budget_lines"
    ADD CONSTRAINT "budget_lines_budget_fkey"
        FOREIGN KEY ("budget_id") REFERENCES "project_budgets"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "budget_lines_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "budget_lines_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "budget_lines_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_commitments"
    ADD CONSTRAINT "cost_commitments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "cost_commitments_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "cost_commitments_cost_structure_fkey"
        FOREIGN KEY ("cost_structure_id") REFERENCES "project_cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "cost_actuals"
    ADD CONSTRAINT "cost_actuals_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "cost_actuals_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "cost_actuals_cost_structure_fkey"
        FOREIGN KEY ("cost_structure_id") REFERENCES "project_cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "forecast_lines"
    ADD CONSTRAINT "forecast_lines_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "forecast_lines_budget_line_fkey"
        FOREIGN KEY ("budget_line_id") REFERENCES "budget_lines"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Validate that the three component IDs stored on a budget line resolve to one posting-enabled
-- Module-6 project_cost_codes row inside the owning budget Project.
CREATE FUNCTION "module_7_validate_budget_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    budget_project_id UUID;
    valid_mapping_id UUID;
BEGIN
    SELECT "project_id"
      INTO budget_project_id
      FROM "project_budgets"
     WHERE "id" = NEW."budget_id";

    SELECT mapping."id"
      INTO valid_mapping_id
      FROM "project_cost_codes" mapping
     WHERE mapping."project_id" = budget_project_id
       AND mapping."wbs_node_id" = NEW."wbs_node_id"
       AND mapping."cost_code_id" = NEW."cost_code_id"
       AND mapping."cost_type_id" = NEW."cost_type_id"
       AND mapping."is_posting_allowed" = TRUE;

    IF valid_mapping_id IS NULL THEN
        RAISE EXCEPTION 'Budget line must use one posting-enabled cost structure in the Budget Project and Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "budget_lines_cost_structure_integrity"
BEFORE INSERT OR UPDATE OF "budget_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "budget_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_7_validate_budget_line_scope"();

-- Validate the shared ProjectCostCode dimension used by source-derived commitments and actuals.
CREATE FUNCTION "module_7_validate_source_cost_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    mapping_project_id UUID;
BEGIN
    SELECT mapping."project_id"
      INTO mapping_project_id
      FROM "project_cost_codes" mapping
     WHERE mapping."id" = NEW."cost_structure_id";

    IF mapping_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Source cost structure must belong to the selected Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "cost_commitments_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "cost_structure_id"
ON "cost_commitments"
FOR EACH ROW
EXECUTE FUNCTION "module_7_validate_source_cost_scope"();

CREATE TRIGGER "cost_actuals_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "cost_structure_id"
ON "cost_actuals"
FOR EACH ROW
EXECUTE FUNCTION "module_7_validate_source_cost_scope"();

-- Keep each forecast row inside the Project that owns its budget line.
CREATE FUNCTION "module_7_validate_forecast_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    budget_project_id UUID;
BEGIN
    SELECT budget."project_id"
      INTO budget_project_id
      FROM "budget_lines" line
      JOIN "project_budgets" budget ON budget."id" = line."budget_id"
     WHERE line."id" = NEW."budget_line_id";

    IF budget_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Forecast line must belong to the same Project as its Budget line'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "forecast_lines_project_integrity"
BEFORE INSERT OR UPDATE OF "project_id", "budget_line_id"
ON "forecast_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_7_validate_forecast_scope"();
