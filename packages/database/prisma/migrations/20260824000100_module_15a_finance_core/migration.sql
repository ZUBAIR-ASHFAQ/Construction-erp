-- Pass 202 / Stage 11: create the reviewed Module 15A Finance Core persistence.
-- AP, AR, payments and source adapters remain deferred to Module 15B.
-- Public Finance status/source vocabularies remain string-backed because the source does not enumerate them.

CREATE TABLE "gl_accounts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "account_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "account_type" VARCHAR(64) NOT NULL,
    "parent_id" UUID,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "gl_accounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gl_accounts_account_code_not_blank" CHECK (length(btrim("account_code")) > 0),
    CONSTRAINT "gl_accounts_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "gl_accounts_account_type_not_blank" CHECK (length(btrim("account_type")) > 0),
    CONSTRAINT "gl_accounts_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "gl_accounts_not_own_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE TABLE "fiscal_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "fiscal_year" INTEGER NOT NULL,
    "period_no" INTEGER NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fiscal_periods_period_no_positive" CHECK ("period_no" > 0),
    CONSTRAINT "fiscal_periods_dates_valid" CHECK ("end_date" >= "start_date"),
    CONSTRAINT "fiscal_periods_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "journals" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "journal_no" VARCHAR(100) NOT NULL,
    "source_type" VARCHAR(100) NOT NULL,
    "source_id" VARCHAR(200),
    "posting_date" DATE NOT NULL,
    "period_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "total_debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total_credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "journals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "journals_journal_no_not_blank" CHECK (length(btrim("journal_no")) > 0),
    CONSTRAINT "journals_source_type_not_blank" CHECK (length(btrim("source_type")) > 0),
    CONSTRAINT "journals_source_id_not_blank" CHECK ("source_id" IS NULL OR length(btrim("source_id")) > 0),
    CONSTRAINT "journals_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "journal_lines" (
    "id" UUID NOT NULL,
    "journal_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "project_id" UUID,
    "cost_structure_id" UUID,
    "debit" DECIMAL(18,2) NOT NULL,
    "credit" DECIMAL(18,2) NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gl_accounts_company_account_code_uq"
    ON "gl_accounts"("company_id", "account_code");
CREATE UNIQUE INDEX "gl_accounts_id_company_uq"
    ON "gl_accounts"("id", "company_id");
CREATE INDEX "gl_accounts_company_status_type_idx"
    ON "gl_accounts"("company_id", "status", "account_type");
CREATE INDEX "gl_accounts_parent_idx"
    ON "gl_accounts"("parent_id");

CREATE UNIQUE INDEX "fiscal_periods_company_year_period_uq"
    ON "fiscal_periods"("company_id", "fiscal_year", "period_no");
CREATE UNIQUE INDEX "fiscal_periods_id_company_uq"
    ON "fiscal_periods"("id", "company_id");
CREATE INDEX "fiscal_periods_company_status_dates_idx"
    ON "fiscal_periods"("company_id", "status", "start_date", "end_date");

CREATE UNIQUE INDEX "journals_company_journal_no_uq"
    ON "journals"("company_id", "journal_no");
CREATE UNIQUE INDEX "journals_id_company_uq"
    ON "journals"("id", "company_id");
CREATE INDEX "journals_company_posting_status_idx"
    ON "journals"("company_id", "posting_date", "status");
CREATE INDEX "journals_company_period_status_idx"
    ON "journals"("company_id", "period_id", "status");
CREATE INDEX "journals_company_source_idx"
    ON "journals"("company_id", "source_type", "source_id");

-- Non-manual source documents must not create two journal headers for the same stable source identity.
CREATE UNIQUE INDEX "journals_company_source_uq"
    ON "journals"("company_id", "source_type", "source_id")
    WHERE "source_id" IS NOT NULL;

CREATE INDEX "journal_lines_journal_idx"
    ON "journal_lines"("journal_id");
CREATE INDEX "journal_lines_account_idx"
    ON "journal_lines"("account_id");
CREATE INDEX "journal_lines_project_idx"
    ON "journal_lines"("project_id");
CREATE INDEX "journal_lines_cost_structure_idx"
    ON "journal_lines"("cost_structure_id");

ALTER TABLE "gl_accounts"
    ADD CONSTRAINT "gl_accounts_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "gl_accounts_parent_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "gl_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "fiscal_periods"
    ADD CONSTRAINT "fiscal_periods_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journals"
    ADD CONSTRAINT "journals_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "journals_period_fkey"
        FOREIGN KEY ("period_id") REFERENCES "fiscal_periods"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "journal_lines"
    ADD CONSTRAINT "journal_lines_journal_fkey"
        FOREIGN KEY ("journal_id") REFERENCES "journals"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "journal_lines_account_fkey"
        FOREIGN KEY ("account_id") REFERENCES "gl_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "journal_lines_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "journal_lines_cost_structure_fkey"
        FOREIGN KEY ("cost_structure_id") REFERENCES "project_cost_codes"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- The source requires a Company-owned account tree but does not define cycle semantics.
-- Enforce only the reviewed same-Company ownership rule here; cycle policy stays deferred.
CREATE FUNCTION "module_15a_validate_gl_account_parent"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    parent_company_id UUID;
BEGIN
    IF NEW."parent_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "company_id"
      INTO parent_company_id
      FROM "gl_accounts"
     WHERE "id" = NEW."parent_id";

    IF parent_company_id IS DISTINCT FROM NEW."company_id" THEN
        RAISE EXCEPTION 'GL account parent must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "gl_accounts_parent_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "parent_id"
ON "gl_accounts"
FOR EACH ROW
EXECUTE FUNCTION "module_15a_validate_gl_account_parent"();

-- Resolve period ownership and date range from persisted Finance configuration.
-- Exact OPEN/CLOSED status tokens remain service-level until the source vocabulary is defined.
CREATE FUNCTION "module_15a_validate_journal_period"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    period_company_id UUID;
    period_start DATE;
    period_end DATE;
BEGIN
    SELECT "company_id", "start_date", "end_date"
      INTO period_company_id, period_start, period_end
      FROM "fiscal_periods"
     WHERE "id" = NEW."period_id";

    IF period_company_id IS DISTINCT FROM NEW."company_id" THEN
        RAISE EXCEPTION 'Journal period must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."posting_date" < period_start OR NEW."posting_date" > period_end THEN
        RAISE EXCEPTION 'Journal posting date must fall inside the selected fiscal period'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "journals_period_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "period_id", "posting_date"
ON "journals"
FOR EACH ROW
EXECUTE FUNCTION "module_15a_validate_journal_period"();

-- journal_lines intentionally carries no company_id. Resolve Company through the journal and
-- keep account, Project and ProjectCostCode dimensions inside that trusted owner.
CREATE FUNCTION "module_15a_validate_journal_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    journal_company_id UUID;
    account_company_id UUID;
    project_company_id UUID;
    cost_structure_project_id UUID;
    cost_structure_company_id UUID;
BEGIN
    SELECT "company_id"
      INTO journal_company_id
      FROM "journals"
     WHERE "id" = NEW."journal_id";

    SELECT "company_id"
      INTO account_company_id
      FROM "gl_accounts"
     WHERE "id" = NEW."account_id";

    IF account_company_id IS DISTINCT FROM journal_company_id THEN
        RAISE EXCEPTION 'Journal line account must belong to the Journal Company'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."project_id" IS NOT NULL THEN
        SELECT "company_id"
          INTO project_company_id
          FROM "projects"
         WHERE "id" = NEW."project_id";

        IF project_company_id IS DISTINCT FROM journal_company_id THEN
            RAISE EXCEPTION 'Journal line Project must belong to the Journal Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."cost_structure_id" IS NOT NULL THEN
        SELECT mapping."project_id", project."company_id"
          INTO cost_structure_project_id, cost_structure_company_id
          FROM "project_cost_codes" mapping
          JOIN "projects" project ON project."id" = mapping."project_id"
         WHERE mapping."id" = NEW."cost_structure_id";

        IF cost_structure_company_id IS DISTINCT FROM journal_company_id THEN
            RAISE EXCEPTION 'Journal line cost structure must belong to the Journal Company'
                USING ERRCODE = '23514';
        END IF;

        IF NEW."project_id" IS NOT NULL
           AND cost_structure_project_id IS DISTINCT FROM NEW."project_id" THEN
            RAISE EXCEPTION 'Journal line cost structure must belong to the selected Project'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "journal_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "journal_id", "account_id", "project_id", "cost_structure_id"
ON "journal_lines"
FOR EACH ROW
EXECUTE FUNCTION "module_15a_validate_journal_line_scope"();
