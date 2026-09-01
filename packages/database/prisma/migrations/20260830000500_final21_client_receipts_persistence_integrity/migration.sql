-- Final-21 Pass B18.2: add the Module 16 Client Receipts persistence baseline and ownership integrity.
-- These are new source tables, so no historical receipt data is rewritten or guessed.

-- Supporting uniqueness lets one Client Receipt prove the Project belongs to the same Company and Client.
CREATE UNIQUE INDEX "projects_id_company_client_uq"
  ON "projects"("id", "company_id", "client_id");

CREATE TABLE "client_receipts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stage_id" UUID,
  "receipt_no" VARCHAR(100) NOT NULL,
  "receipt_date" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "payment_method" VARCHAR(64) NOT NULL,
  "cash_bank_account_id" UUID NOT NULL,
  "reference" VARCHAR(200),
  "receipt_type" VARCHAR(32) NOT NULL,
  "status" VARCHAR(32) NOT NULL DEFAULT 'POSTED',
  "created_by" UUID NOT NULL,
  "posted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "client_receipts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_receipts_receipt_no_not_blank" CHECK (length(btrim("receipt_no")) > 0),
  CONSTRAINT "client_receipts_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "client_receipts_payment_method_not_blank" CHECK (length(btrim("payment_method")) > 0),
  CONSTRAINT "client_receipts_receipt_type_not_blank" CHECK (length(btrim("receipt_type")) > 0),
  CONSTRAINT "client_receipts_status_not_blank" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "client_receipts_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_receipts_client_company_fkey"
    FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_receipts_project_owner_fkey"
    FOREIGN KEY ("project_id", "company_id", "client_id") REFERENCES "projects"("id", "company_id", "client_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_receipts_stage_project_fkey"
    FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_receipts_cash_bank_company_fkey"
    FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "client_receipts_created_by_company_fkey"
    FOREIGN KEY ("created_by", "company_id") REFERENCES "users"("id", "company_id")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "client_receipts_company_receipt_no_uq"
  ON "client_receipts"("company_id", "receipt_no");
CREATE UNIQUE INDEX "client_receipts_id_company_uq"
  ON "client_receipts"("id", "company_id");
CREATE INDEX "client_receipts_company_project_status_date_idx"
  ON "client_receipts"("company_id", "project_id", "status", "receipt_date");
CREATE INDEX "client_receipts_company_client_status_date_idx"
  ON "client_receipts"("company_id", "client_id", "status", "receipt_date");
CREATE INDEX "client_receipts_project_stage_date_idx"
  ON "client_receipts"("project_id", "stage_id", "receipt_date");
CREATE INDEX "client_receipts_cash_bank_date_idx"
  ON "client_receipts"("cash_bank_account_id", "receipt_date");
CREATE INDEX "client_receipts_created_by_date_idx"
  ON "client_receipts"("created_by", "receipt_date");

CREATE TABLE "client_receipt_allocations" (
  "id" UUID NOT NULL,
  "receipt_id" UUID NOT NULL,
  "client_invoice_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "allocated_by" UUID NOT NULL,
  CONSTRAINT "client_receipt_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_receipt_allocations_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "client_receipt_allocations_receipt_fkey"
    FOREIGN KEY ("receipt_id") REFERENCES "client_receipts"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_receipt_allocations_invoice_fkey"
    FOREIGN KEY ("client_invoice_id") REFERENCES "client_invoices"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "client_receipt_allocations_allocated_by_fkey"
    FOREIGN KEY ("allocated_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "client_receipt_allocations_receipt_at_idx"
  ON "client_receipt_allocations"("receipt_id", "allocated_at");
CREATE INDEX "client_receipt_allocations_invoice_at_idx"
  ON "client_receipt_allocations"("client_invoice_id", "allocated_at");
CREATE INDEX "client_receipt_allocations_actor_at_idx"
  ON "client_receipt_allocations"("allocated_by", "allocated_at");

-- Purpose: keep Invoice allocations and allocating users inside the owning Receipt Company/Client/Project scope.
CREATE FUNCTION "final21_validate_client_receipt_allocation_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  receipt_company_id UUID;
  receipt_client_id UUID;
  receipt_project_id UUID;
  invoice_company_id UUID;
  invoice_client_id UUID;
  invoice_project_id UUID;
  actor_company_id UUID;
BEGIN
  SELECT receipt."company_id", receipt."client_id", receipt."project_id"
    INTO receipt_company_id, receipt_client_id, receipt_project_id
    FROM "client_receipts" receipt
   WHERE receipt."id" = NEW."receipt_id";

  SELECT invoice."company_id", invoice."client_id", invoice."project_id"
    INTO invoice_company_id, invoice_client_id, invoice_project_id
    FROM "client_invoices" invoice
   WHERE invoice."id" = NEW."client_invoice_id";

  SELECT actor."company_id"
    INTO actor_company_id
    FROM "users" actor
   WHERE actor."id" = NEW."allocated_by";

  IF receipt_company_id IS NULL
     OR invoice_company_id IS DISTINCT FROM receipt_company_id
     OR invoice_client_id IS DISTINCT FROM receipt_client_id
     OR invoice_project_id IS DISTINCT FROM receipt_project_id THEN
    RAISE EXCEPTION 'Client Receipt allocation must use an Invoice from the same Company, Client and Project.'
      USING ERRCODE = '23514';
  END IF;

  IF actor_company_id IS DISTINCT FROM receipt_company_id THEN
    RAISE EXCEPTION 'Client Receipt allocation actor must belong to the same Company.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "client_receipt_allocations_scope_integrity"
BEFORE INSERT OR UPDATE OF "receipt_id", "client_invoice_id", "allocated_by"
ON "client_receipt_allocations"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_client_receipt_allocation_scope"();

-- Final Module 16 permission vocabulary is seeded now so later runtime passes only consume stable codes.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'client_receipts.read', 'Read Client Receipts', 'client_receipts'),
  (gen_random_uuid(), 'client_receipts.create', 'Create Client Receipts', 'client_receipts'),
  (gen_random_uuid(), 'client_receipts.allocate', 'Allocate Client Receipts', 'client_receipts'),
  (gen_random_uuid(), 'client_receipts.reverse', 'Reverse Client Receipts', 'client_receipts')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Existing conventional system administrators keep the same full-active-permission policy used by Administration bootstrap.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT role."id", permission."id"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN (
    'client_receipts.read',
    'client_receipts.create',
    'client_receipts.allocate',
    'client_receipts.reverse'
  )
ON CONFLICT DO NOTHING;
