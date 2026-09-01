-- Stage 7 / Module 5: create the company-owned Project master and lifecycle history.
-- Project membership remains deferred to Module 24B after the projects table exists.

CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "client_id" UUID NOT NULL,
    "tender_id" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "currency" CHAR(3) NOT NULL,
    "start_date" DATE NOT NULL,
    "planned_end_date" DATE NOT NULL,
    "project_manager_user_id" UUID NOT NULL,
    "location" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "projects_project_code_not_blank" CHECK (btrim("project_code") <> ''),
    CONSTRAINT "projects_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "projects_location_not_blank" CHECK (btrim("location") <> ''),
    CONSTRAINT "projects_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$'),
    CONSTRAINT "projects_dates_valid" CHECK ("planned_end_date" >= "start_date"),
    CONSTRAINT "projects_status_allowed" CHECK ("status" IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED'))
);

CREATE TABLE "project_status_history" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "from_status" VARCHAR(32),
    "to_status" VARCHAR(32) NOT NULL,
    "changed_by" UUID NOT NULL,
    "reason" TEXT,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_status_history_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "project_status_history_from_status_allowed" CHECK (
        "from_status" IS NULL OR "from_status" IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED')
    ),
    CONSTRAINT "project_status_history_to_status_allowed" CHECK (
        "to_status" IN ('DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED')
    ),
    CONSTRAINT "project_status_history_status_changed" CHECK (
        "from_status" IS NULL OR "from_status" <> "to_status"
    )
);

CREATE UNIQUE INDEX "projects_company_project_code_uq"
    ON "projects"("company_id", "project_code");
CREATE UNIQUE INDEX "projects_id_company_uq"
    ON "projects"("id", "company_id");
CREATE INDEX "projects_company_status_planned_end_idx"
    ON "projects"("company_id", "status", "planned_end_date");
CREATE INDEX "projects_company_client_status_idx"
    ON "projects"("company_id", "client_id", "status");
CREATE INDEX "projects_company_tender_idx"
    ON "projects"("company_id", "tender_id");
CREATE INDEX "projects_company_manager_status_idx"
    ON "projects"("company_id", "project_manager_user_id", "status");

CREATE INDEX "project_status_history_project_changed_idx"
    ON "project_status_history"("project_id", "changed_at");
CREATE INDEX "project_status_history_changed_by_changed_idx"
    ON "project_status_history"("changed_by", "changed_at");

ALTER TABLE "projects"
    ADD CONSTRAINT "projects_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "projects_client_company_fkey"
        FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "projects_tender_company_fkey"
        FOREIGN KEY ("tender_id", "company_id") REFERENCES "tenders"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "projects_manager_company_fkey"
        FOREIGN KEY ("project_manager_user_id", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "project_status_history"
    ADD CONSTRAINT "project_status_history_project_id_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "project_status_history_changed_by_fkey"
        FOREIGN KEY ("changed_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
