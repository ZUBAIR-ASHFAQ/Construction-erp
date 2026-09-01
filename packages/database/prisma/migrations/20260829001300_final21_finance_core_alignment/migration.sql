-- Final-21 B9: Finance & Accounting alignment.
-- Remove Finance dependency on legacy WBS/Cost Code mappings, add Project Stage dimensions,
-- stable source-key idempotency, Cash/Bank master data and reconciliation persistence.

-- Journal source identity is now an explicit stable source key. Historical source rows are preserved.
ALTER TABLE "journals"
  ADD COLUMN "source_key" VARCHAR(700),
  ADD COLUMN "created_by" UUID,
  ADD COLUMN "posted_at" TIMESTAMPTZ(6);

UPDATE "journals"
SET "source_key" = "source_type" || ':' || "source_id"
WHERE "source_id" IS NOT NULL
  AND "source_key" IS NULL;

DROP INDEX IF EXISTS "journals_company_source_uq";
CREATE UNIQUE INDEX "journals_company_source_key_uq"
  ON "journals"("company_id", "source_key");
CREATE INDEX "journals_created_by_posting_idx"
  ON "journals"("created_by", "posting_date");

ALTER TABLE "journals"
  ADD CONSTRAINT "journals_created_by_fkey"
    FOREIGN KEY ("created_by") REFERENCES "users"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Finance lines use only Project and optional Project Stage dimensions in Final-21.
DROP TRIGGER IF EXISTS "journal_lines_scope_integrity" ON "journal_lines";
DROP FUNCTION IF EXISTS "module_15a_validate_journal_line_scope"();
ALTER TABLE "journal_lines" DROP CONSTRAINT IF EXISTS "journal_lines_cost_structure_fkey";
DROP INDEX IF EXISTS "journal_lines_cost_structure_idx";
ALTER TABLE "journal_lines" DROP COLUMN IF EXISTS "cost_structure_id";
ALTER TABLE "journal_lines" ADD COLUMN "stage_id" UUID;
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_stage_fkey"
    FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "journal_lines_stage_idx" ON "journal_lines"("stage_id");

-- Enforce same-Company account/Project ownership and same-Project Stage ownership.
CREATE OR REPLACE FUNCTION "final21_validate_journal_line_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  journal_company_id UUID;
  account_company_id UUID;
  project_company_id UUID;
  stage_project_id UUID;
  stage_company_id UUID;
BEGIN
  SELECT "company_id" INTO journal_company_id FROM "journals" WHERE "id" = NEW."journal_id";
  SELECT "company_id" INTO account_company_id FROM "gl_accounts" WHERE "id" = NEW."account_id";

  IF account_company_id IS DISTINCT FROM journal_company_id THEN
    RAISE EXCEPTION 'Journal line account must belong to the Journal Company'
      USING ERRCODE = '23514';
  END IF;

  IF NEW."project_id" IS NOT NULL THEN
    SELECT "company_id" INTO project_company_id FROM "projects" WHERE "id" = NEW."project_id";
    IF project_company_id IS DISTINCT FROM journal_company_id THEN
      RAISE EXCEPTION 'Journal line Project must belong to the Journal Company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."stage_id" IS NOT NULL THEN
    SELECT "project_id", "company_id"
      INTO stage_project_id, stage_company_id
      FROM "project_stages"
     WHERE "id" = NEW."stage_id";

    IF NEW."project_id" IS NULL
       OR stage_project_id IS DISTINCT FROM NEW."project_id"
       OR stage_company_id IS DISTINCT FROM journal_company_id THEN
      RAISE EXCEPTION 'Journal line Stage must belong to the line Project and Journal Company'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "journal_lines_scope_integrity"
BEFORE INSERT OR UPDATE OF "journal_id", "account_id", "project_id", "stage_id"
ON "journal_lines"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_journal_line_scope"();

-- Cash/Bank accounts are Finance-owned wrappers around General Ledger accounts.
CREATE TABLE "cash_bank_accounts" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "code" VARCHAR(100) NOT NULL,
  "name" VARCHAR(300) NOT NULL,
  "account_type" VARCHAR(32) NOT NULL,
  "gl_account_id" UUID NOT NULL,
  "bank_name" VARCHAR(200),
  "account_reference" VARCHAR(200),
  "status" VARCHAR(32) NOT NULL,
  CONSTRAINT "cash_bank_accounts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "cash_bank_accounts_code_ck" CHECK (length(btrim("code")) > 0),
  CONSTRAINT "cash_bank_accounts_name_ck" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "cash_bank_accounts_type_ck" CHECK (length(btrim("account_type")) > 0),
  CONSTRAINT "cash_bank_accounts_status_ck" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "cash_bank_accounts_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "cash_bank_accounts_gl_company_fkey" FOREIGN KEY ("gl_account_id", "company_id") REFERENCES "gl_accounts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "cash_bank_accounts_company_code_uq" ON "cash_bank_accounts"("company_id", "code");
CREATE UNIQUE INDEX "cash_bank_accounts_company_gl_account_uq" ON "cash_bank_accounts"("company_id", "gl_account_id");
CREATE UNIQUE INDEX "cash_bank_accounts_id_company_uq" ON "cash_bank_accounts"("id", "company_id");
CREATE INDEX "cash_bank_accounts_company_status_type_idx" ON "cash_bank_accounts"("company_id", "status", "account_type");

-- Preserve obvious legacy Cash/Bank GL accounts as Finance cash/bank masters without fabricating bank metadata.
INSERT INTO "cash_bank_accounts" (
  "id", "company_id", "code", "name", "account_type", "gl_account_id", "bank_name", "account_reference", "status"
)
SELECT
  gen_random_uuid(), account."company_id", account."account_code", account."name",
  upper(account."account_type"), account."id", NULL, NULL, account."status"
FROM "gl_accounts" account
WHERE upper(account."account_type") IN ('CASH', 'BANK')
ON CONFLICT ("company_id", "gl_account_id") DO NOTHING;

CREATE TABLE "bank_reconciliations" (
  "id" UUID NOT NULL,
  "cash_bank_account_id" UUID NOT NULL,
  "statement_date" DATE NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "reconciled_balance" DECIMAL(18,2) NOT NULL,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bank_reconciliations_status_ck" CHECK (length(btrim("status")) > 0),
  CONSTRAINT "bank_reconciliations_account_fkey" FOREIGN KEY ("cash_bank_account_id") REFERENCES "cash_bank_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "bank_reconciliations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "bank_reconciliations_account_statement_idx" ON "bank_reconciliations"("cash_bank_account_id", "statement_date");
CREATE INDEX "bank_reconciliations_created_by_idx" ON "bank_reconciliations"("created_by", "created_at");

-- The actor creating a reconciliation must belong to the same Company as the Cash/Bank account.
CREATE FUNCTION "final21_validate_bank_reconciliation_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  account_company_id UUID;
  actor_company_id UUID;
BEGIN
  SELECT "company_id" INTO account_company_id FROM "cash_bank_accounts" WHERE "id" = NEW."cash_bank_account_id";
  SELECT "company_id" INTO actor_company_id FROM "users" WHERE "id" = NEW."created_by";

  IF account_company_id IS DISTINCT FROM actor_company_id THEN
    RAISE EXCEPTION 'Bank reconciliation actor must belong to the Cash/Bank account Company'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "bank_reconciliations_scope_integrity"
BEFORE INSERT OR UPDATE OF "cash_bank_account_id", "created_by"
ON "bank_reconciliations"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_bank_reconciliation_scope"();

-- Final Module 18 permission vocabulary.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'finance.read', 'Read Finance', 'finance'),
  (gen_random_uuid(), 'finance.accounts.manage', 'Manage Finance Accounts', 'finance'),
  (gen_random_uuid(), 'finance.journals.create', 'Create Finance Journals', 'finance'),
  (gen_random_uuid(), 'finance.journals.post', 'Post Finance Journals', 'finance'),
  (gen_random_uuid(), 'finance.journals.reverse', 'Reverse Finance Journals', 'finance'),
  (gen_random_uuid(), 'finance.periods.close', 'Close Finance Periods', 'finance'),
  (gen_random_uuid(), 'finance.reconcile', 'Reconcile Cash and Bank Accounts', 'finance')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Preserve old read/report grants as the single final Finance read permission.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", new_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id"
JOIN "permissions" new_permission ON new_permission."code" = 'finance.read'
WHERE old_permission."code" IN ('finance.accounts.read', 'finance.journals.read', 'finance.reports.read')
ON CONFLICT DO NOTHING;

-- Preserve the previous effective Chart-of-Accounts write rule: account read + journal create.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT account_read."role_id", manage_permission."id"
FROM "role_permissions" account_read
JOIN "permissions" read_permission ON read_permission."id" = account_read."permission_id" AND read_permission."code" = 'finance.accounts.read'
JOIN "permissions" manage_permission ON manage_permission."code" = 'finance.accounts.manage'
WHERE EXISTS (
  SELECT 1
  FROM "role_permissions" create_grant
  JOIN "permissions" create_permission ON create_permission."id" = create_grant."permission_id"
  WHERE create_grant."role_id" = account_read."role_id"
    AND create_permission."code" = 'finance.journals.create'
)
ON CONFLICT DO NOTHING;

-- Anyone who could post journals can reverse them under the new explicit permission.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", reverse_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'finance.journals.post'
JOIN "permissions" reverse_permission ON reverse_permission."code" = 'finance.journals.reverse'
ON CONFLICT DO NOTHING;

-- Existing period controllers are the closest prior Finance authority for reconciliation.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", reconcile_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'finance.periods.close'
JOIN "permissions" reconcile_permission ON reconcile_permission."code" = 'finance.reconcile'
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" rp
USING "permissions" permission
WHERE rp."permission_id" = permission."id"
  AND permission."code" IN ('finance.accounts.read', 'finance.journals.read', 'finance.reports.read');
DELETE FROM "permissions" WHERE "code" IN ('finance.accounts.read', 'finance.journals.read', 'finance.reports.read');
