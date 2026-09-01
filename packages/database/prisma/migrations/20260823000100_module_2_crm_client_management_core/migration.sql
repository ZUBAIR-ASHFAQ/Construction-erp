-- Stage 4 / Module 2: create the CRM client, contact, opportunity and opportunity-note persistence.
-- Tender, Project, Billing and Finance relationships are deliberately deferred to their owning modules.

CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "legal_name" VARCHAR(240) NOT NULL,
    "display_name" VARCHAR(240) NOT NULL,
    "tax_no" VARCHAR(100),
    "billing_address" VARCHAR(1000) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "credit_terms_days" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "clients_status_allowed" CHECK ("status" IN ('ACTIVE', 'ARCHIVED')),
    CONSTRAINT "clients_credit_terms_nonnegative" CHECK ("credit_terms_days" >= 0)
);

CREATE TABLE "client_contacts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "phone" VARCHAR(50) NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_contacts_status_allowed" CHECK ("status" IN ('ACTIVE', 'INACTIVE'))
);

CREATE TABLE "opportunities" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "estimated_value" DECIMAL(18,2) NOT NULL,
    "probability" INTEGER NOT NULL,
    "stage" VARCHAR(32) NOT NULL DEFAULT 'LEAD',
    "source" VARCHAR(120) NOT NULL,
    "owner_user_id" UUID NOT NULL,
    "expected_close_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opportunities_estimated_value_nonnegative" CHECK ("estimated_value" >= 0),
    CONSTRAINT "opportunities_probability_range" CHECK ("probability" BETWEEN 0 AND 100),
    CONSTRAINT "opportunities_stage_allowed" CHECK ("stage" IN ('LEAD', 'QUALIFIED', 'TENDERING', 'WON', 'LOST'))
);

CREATE TABLE "opportunity_notes" (
    "id" UUID NOT NULL,
    "opportunity_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "opportunity_notes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "opportunity_notes_note_not_blank" CHECK (length(btrim("note")) > 0)
);

CREATE UNIQUE INDEX "clients_company_code_uq"
    ON "clients"("company_id", "code");
CREATE UNIQUE INDEX "clients_id_company_uq"
    ON "clients"("id", "company_id");
CREATE INDEX "clients_company_status_idx"
    ON "clients"("company_id", "status");
CREATE INDEX "clients_company_display_name_idx"
    ON "clients"("company_id", "display_name");

CREATE INDEX "client_contacts_company_client_status_idx"
    ON "client_contacts"("company_id", "client_id", "status");
CREATE INDEX "client_contacts_client_primary_status_idx"
    ON "client_contacts"("client_id", "is_primary", "status");

CREATE UNIQUE INDEX "opportunities_id_company_uq"
    ON "opportunities"("id", "company_id");
CREATE INDEX "opportunities_company_client_created_idx"
    ON "opportunities"("company_id", "client_id", "created_at");
CREATE INDEX "opportunities_company_stage_close_idx"
    ON "opportunities"("company_id", "stage", "expected_close_date");
CREATE INDEX "opportunities_company_owner_stage_idx"
    ON "opportunities"("company_id", "owner_user_id", "stage");
CREATE INDEX "opportunities_company_code_idx"
    ON "opportunities"("company_id", "code");

CREATE INDEX "opportunity_notes_opportunity_created_idx"
    ON "opportunity_notes"("opportunity_id", "created_at");
CREATE INDEX "opportunity_notes_author_created_idx"
    ON "opportunity_notes"("author_user_id", "created_at");

ALTER TABLE "clients"
    ADD CONSTRAINT "clients_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "client_contacts"
    ADD CONSTRAINT "client_contacts_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "client_contacts_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "client_contacts_client_company_fkey"
        FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "opportunities"
    ADD CONSTRAINT "opportunities_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "opportunities_client_id_fkey"
        FOREIGN KEY ("client_id") REFERENCES "clients"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "opportunities_client_company_fkey"
        FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "opportunities_owner_user_id_fkey"
        FOREIGN KEY ("owner_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "opportunities_owner_company_fkey"
        FOREIGN KEY ("owner_user_id", "company_id") REFERENCES "users"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "opportunity_notes"
    ADD CONSTRAINT "opportunity_notes_opportunity_id_fkey"
        FOREIGN KEY ("opportunity_id") REFERENCES "opportunities"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "opportunity_notes_author_user_id_fkey"
        FOREIGN KEY ("author_user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
