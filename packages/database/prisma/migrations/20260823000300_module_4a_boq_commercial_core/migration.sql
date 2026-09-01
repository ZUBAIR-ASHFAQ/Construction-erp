-- Stage 6 / Module 4A: create the tender-linked BOQ Commercial Core persistence.
-- Project, WBS and cost-code columns remain deferred to Module 4B after their owning tables exist.

CREATE TABLE "boqs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "current_revision_id" UUID,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boqs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "boqs_currency_format" CHECK ("currency" ~ '^[A-Z]{3}$')
);

CREATE TABLE "boq_revisions" (
    "id" UUID NOT NULL,
    "boq_id" UUID NOT NULL,
    "revision_no" INTEGER NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boq_revisions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "boq_revisions_revision_positive" CHECK ("revision_no" > 0),
    CONSTRAINT "boq_revisions_status_allowed" CHECK ("status" IN ('DRAFT', 'FROZEN'))
);

CREATE TABLE "boq_items" (
    "id" UUID NOT NULL,
    "boq_revision_id" UUID NOT NULL,
    "parent_id" UUID,
    "item_code" VARCHAR(100) NOT NULL,
    "description" VARCHAR(1000) NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "rate" DECIMAL(18,4) NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boq_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "boq_items_quantity_nonnegative" CHECK ("quantity" >= 0),
    CONSTRAINT "boq_items_rate_nonnegative" CHECK ("rate" >= 0),
    CONSTRAINT "boq_items_amount_nonnegative" CHECK ("amount" >= 0),
    CONSTRAINT "boq_items_parent_not_self" CHECK ("parent_id" IS NULL OR "parent_id" <> "id")
);

CREATE UNIQUE INDEX "boqs_company_code_uq"
    ON "boqs"("company_id", "code");
CREATE UNIQUE INDEX "boqs_id_company_uq"
    ON "boqs"("id", "company_id");
CREATE UNIQUE INDEX "boqs_current_revision_uq"
    ON "boqs"("current_revision_id");
CREATE INDEX "boqs_company_tender_created_idx"
    ON "boqs"("company_id", "tender_id", "created_at");
CREATE INDEX "boqs_company_status_created_idx"
    ON "boqs"("company_id", "status", "created_at");

CREATE UNIQUE INDEX "boq_revisions_boq_revision_uq"
    ON "boq_revisions"("boq_id", "revision_no");
CREATE UNIQUE INDEX "boq_revisions_id_boq_uq"
    ON "boq_revisions"("id", "boq_id");
CREATE INDEX "boq_revisions_boq_status_revision_idx"
    ON "boq_revisions"("boq_id", "status", "revision_no");
CREATE INDEX "boq_revisions_approver_updated_idx"
    ON "boq_revisions"("approved_by", "updated_at");

CREATE UNIQUE INDEX "boq_items_id_revision_uq"
    ON "boq_items"("id", "boq_revision_id");
CREATE INDEX "boq_items_revision_parent_idx"
    ON "boq_items"("boq_revision_id", "parent_id");
CREATE INDEX "boq_items_revision_code_idx"
    ON "boq_items"("boq_revision_id", "item_code");

ALTER TABLE "boqs"
    ADD CONSTRAINT "boqs_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "boqs_tender_company_fkey"
        FOREIGN KEY ("tender_id", "company_id") REFERENCES "tenders"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "boq_revisions"
    ADD CONSTRAINT "boq_revisions_boq_id_fkey"
        FOREIGN KEY ("boq_id") REFERENCES "boqs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "boq_revisions_approved_by_fkey"
        FOREIGN KEY ("approved_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "boq_items"
    ADD CONSTRAINT "boq_items_boq_revision_id_fkey"
        FOREIGN KEY ("boq_revision_id") REFERENCES "boq_revisions"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "boq_items_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "boq_items"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "boq_items_parent_same_revision_fkey"
        FOREIGN KEY ("parent_id", "boq_revision_id")
        REFERENCES "boq_items"("id", "boq_revision_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;

-- current_revision_id is nullable during initial BOQ creation, but when set it must
-- reference a revision that belongs to this exact BOQ.
ALTER TABLE "boqs"
    ADD CONSTRAINT "boqs_current_revision_id_fkey"
        FOREIGN KEY ("current_revision_id") REFERENCES "boq_revisions"("id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "boqs_current_revision_belongs_to_boq_fkey"
        FOREIGN KEY ("current_revision_id", "id")
        REFERENCES "boq_revisions"("id", "boq_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;
