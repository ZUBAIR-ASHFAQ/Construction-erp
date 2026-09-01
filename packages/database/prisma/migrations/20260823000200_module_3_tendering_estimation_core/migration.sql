-- Stage 5 / Module 3: create Tendering & Estimation persistence.
-- Project, WBS, BOQ project mapping, Budget and Finance relationships stay deferred to their owning stages.

-- This composite key lets a tender prove that an optional opportunity belongs to the same company and client.
CREATE UNIQUE INDEX "opportunities_id_company_client_uq"
    ON "opportunities"("id", "company_id", "client_id");

CREATE TABLE "tenders" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "opportunity_id" UUID,
    "tender_no" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "due_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "owner_user_id" UUID NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenders_status_allowed" CHECK ("status" IN ('DRAFT', 'SUBMITTED', 'WON', 'LOST', 'CANCELLED')),
    CONSTRAINT "tenders_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "estimate_versions" (
    "id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "direct_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "indirect_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contingency" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "markup" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tender_total" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_versions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "estimate_versions_version_positive" CHECK ("version_no" > 0),
    CONSTRAINT "estimate_versions_status_allowed" CHECK (
        "status" IN ('DRAFT', 'PENDING_APPROVAL', 'FINAL', 'APPROVED', 'REJECTED', 'RETURNED')
    ),
    CONSTRAINT "estimate_versions_direct_cost_nonnegative" CHECK ("direct_cost" >= 0)
);

CREATE TABLE "estimate_items" (
    "id" UUID NOT NULL,
    "estimate_version_id" UUID NOT NULL,
    "parent_id" UUID,
    "description" VARCHAR(1000) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "labor_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "material_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "equipment_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "subcontract_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "other_cost" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "estimate_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "estimate_items_labor_cost_nonnegative" CHECK ("labor_cost" >= 0),
    CONSTRAINT "estimate_items_material_cost_nonnegative" CHECK ("material_cost" >= 0),
    CONSTRAINT "estimate_items_equipment_cost_nonnegative" CHECK ("equipment_cost" >= 0),
    CONSTRAINT "estimate_items_subcontract_cost_nonnegative" CHECK ("subcontract_cost" >= 0),
    CONSTRAINT "estimate_items_other_cost_nonnegative" CHECK ("other_cost" >= 0)
);

CREATE TABLE "tender_submissions" (
    "id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "estimate_version_id" UUID NOT NULL,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_by" UUID NOT NULL,
    "submitted_amount" DECIMAL(18,2) NOT NULL,
    "validity_date" DATE NOT NULL,
    "outcome" VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tender_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tender_submissions_outcome_allowed" CHECK ("outcome" IN ('PENDING', 'WON', 'LOST', 'CANCELLED'))
);

CREATE UNIQUE INDEX "tenders_company_tender_no_uq"
    ON "tenders"("company_id", "tender_no");
CREATE UNIQUE INDEX "tenders_id_company_uq"
    ON "tenders"("id", "company_id");
CREATE INDEX "tenders_company_status_due_idx"
    ON "tenders"("company_id", "status", "due_date");
CREATE INDEX "tenders_company_client_created_idx"
    ON "tenders"("company_id", "client_id", "created_at");
CREATE INDEX "tenders_company_owner_status_idx"
    ON "tenders"("company_id", "owner_user_id", "status");
CREATE INDEX "tenders_company_opportunity_idx"
    ON "tenders"("company_id", "opportunity_id");

CREATE UNIQUE INDEX "estimate_versions_tender_version_uq"
    ON "estimate_versions"("tender_id", "version_no");
CREATE UNIQUE INDEX "estimate_versions_id_tender_uq"
    ON "estimate_versions"("id", "tender_id");
CREATE INDEX "estimate_versions_tender_status_version_idx"
    ON "estimate_versions"("tender_id", "status", "version_no");
CREATE INDEX "estimate_versions_creator_created_idx"
    ON "estimate_versions"("created_by", "created_at");

CREATE UNIQUE INDEX "estimate_items_id_version_uq"
    ON "estimate_items"("id", "estimate_version_id");
CREATE INDEX "estimate_items_version_parent_idx"
    ON "estimate_items"("estimate_version_id", "parent_id");

CREATE UNIQUE INDEX "tender_submissions_tender_uq"
    ON "tender_submissions"("tender_id");
CREATE INDEX "tender_submissions_estimate_version_idx"
    ON "tender_submissions"("estimate_version_id");
CREATE INDEX "tender_submissions_submitter_submitted_idx"
    ON "tender_submissions"("submitted_by", "submitted_at");
CREATE INDEX "tender_submissions_outcome_submitted_idx"
    ON "tender_submissions"("outcome", "submitted_at");

ALTER TABLE "tenders"
    ADD CONSTRAINT "tenders_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tenders_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tenders_client_company_fkey"
        FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "tenders_opportunity_id_fkey"
        FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tenders_opportunity_company_client_fkey"
        FOREIGN KEY ("opportunity_id", "company_id", "client_id")
        REFERENCES "opportunities"("id", "company_id", "client_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "tenders_owner_user_id_fkey"
        FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tenders_owner_company_fkey"
        FOREIGN KEY ("owner_user_id", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "estimate_versions"
    ADD CONSTRAINT "estimate_versions_tender_id_fkey"
        FOREIGN KEY ("tender_id") REFERENCES "tenders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "estimate_versions_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "estimate_items"
    ADD CONSTRAINT "estimate_items_estimate_version_id_fkey"
        FOREIGN KEY ("estimate_version_id") REFERENCES "estimate_versions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "estimate_items_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "estimate_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "estimate_items_parent_same_version_fkey"
        FOREIGN KEY ("parent_id", "estimate_version_id")
        REFERENCES "estimate_items"("id", "estimate_version_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "tender_submissions"
    ADD CONSTRAINT "tender_submissions_tender_id_fkey"
        FOREIGN KEY ("tender_id") REFERENCES "tenders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tender_submissions_estimate_version_id_fkey"
        FOREIGN KEY ("estimate_version_id") REFERENCES "estimate_versions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "tender_submissions_estimate_tender_fkey"
        FOREIGN KEY ("estimate_version_id", "tender_id")
        REFERENCES "estimate_versions"("id", "tender_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "tender_submissions_submitted_by_fkey"
        FOREIGN KEY ("submitted_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
