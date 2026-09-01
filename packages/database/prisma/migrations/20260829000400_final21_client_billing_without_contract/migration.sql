-- Final-21 Pass A10: remove standalone Client Contract ownership from active Client Billing.
-- Legacy client_contracts and retention_ledger tables remain until the dedicated database-cleanup pass.

CREATE TABLE IF NOT EXISTS "project_billing_settings" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "billing_method" VARCHAR(64) NOT NULL,
  "retention_percent" DECIMAL(7,4),
  "billing_cycle" VARCHAR(64),
  "advance_recovery_enabled" BOOLEAN NOT NULL DEFAULT false,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  CONSTRAINT "project_billing_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_billing_settings_retention_range" CHECK ("retention_percent" IS NULL OR ("retention_percent" >= 0 AND "retention_percent" <= 100))
);

INSERT INTO "project_billing_settings" (
  "id", "company_id", "project_id", "billing_method", "retention_percent", "billing_cycle", "advance_recovery_enabled", "status"
)
SELECT gen_random_uuid(), legacy."company_id", legacy."project_id", legacy."billing_method", legacy."retention_percent", NULL, false, 'ACTIVE'
FROM (
  SELECT DISTINCT ON ("company_id", "project_id") "company_id", "project_id", "billing_method", "retention_percent"
  FROM "client_contracts"
  ORDER BY "company_id", "project_id", "id"
) legacy
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX IF NOT EXISTS "project_billing_settings_company_project_uq"
  ON "project_billing_settings"("company_id", "project_id");
CREATE INDEX IF NOT EXISTS "project_billing_settings_company_status_idx"
  ON "project_billing_settings"("company_id", "status");
ALTER TABLE "project_billing_settings"
  ADD CONSTRAINT "project_billing_settings_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "project_billing_settings_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Progress Claims now belong directly to Company, Project and Client.
ALTER TABLE "progress_claims"
  ADD COLUMN IF NOT EXISTS "company_id" UUID,
  ADD COLUMN IF NOT EXISTS "project_id" UUID,
  ADD COLUMN IF NOT EXISTS "client_id" UUID,
  ADD COLUMN IF NOT EXISTS "created_by" UUID;

UPDATE "progress_claims" claim
SET "company_id" = contract."company_id",
    "project_id" = contract."project_id",
    "client_id" = contract."client_id"
FROM "client_contracts" contract
WHERE contract."id" = claim."contract_id"
  AND (claim."company_id" IS NULL OR claim."project_id" IS NULL OR claim."client_id" IS NULL);

ALTER TABLE "progress_claims"
  ALTER COLUMN "company_id" SET NOT NULL,
  ALTER COLUMN "project_id" SET NOT NULL,
  ALTER COLUMN "client_id" SET NOT NULL,
  ALTER COLUMN "contract_id" DROP NOT NULL,
  ALTER COLUMN "previous_value" SET DEFAULT 0,
  ALTER COLUMN "current_value" SET DEFAULT 0;

ALTER TABLE "progress_claims"
  ADD CONSTRAINT "progress_claims_company_fkey"
    FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "progress_claims_project_company_fkey"
    FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "progress_claims_client_company_fkey"
    FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX IF NOT EXISTS "progress_claims_company_claim_no_idx" ON "progress_claims"("company_id", "claim_no");
CREATE INDEX IF NOT EXISTS "progress_claims_project_status_period_idx" ON "progress_claims"("project_id", "status", "period_end");

ALTER TABLE "progress_claim_lines"
  ADD COLUMN IF NOT EXISTS "billing_progress_percent" DECIMAL(7,4);
ALTER TABLE "progress_claim_lines"
  ADD CONSTRAINT "progress_claim_lines_billing_progress_range"
  CHECK ("billing_progress_percent" IS NULL OR ("billing_progress_percent" >= 0 AND "billing_progress_percent" <= 100));

-- Client Invoices now belong directly to Client/Project instead of a standalone Contract.
ALTER TABLE "client_invoices"
  ADD COLUMN IF NOT EXISTS "client_id" UUID;
UPDATE "client_invoices" invoice
SET "client_id" = contract."client_id"
FROM "client_contracts" contract
WHERE contract."id" = invoice."contract_id"
  AND invoice."client_id" IS NULL;
ALTER TABLE "client_invoices"
  ALTER COLUMN "client_id" SET NOT NULL,
  ALTER COLUMN "contract_id" DROP NOT NULL,
  ALTER COLUMN "retention_amount" SET DEFAULT 0;
ALTER TABLE "client_invoices"
  ADD CONSTRAINT "client_invoices_client_company_fkey"
  FOREIGN KEY ("client_id", "company_id") REFERENCES "clients"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE IF NOT EXISTS "client_invoice_lines" (
  "id" UUID NOT NULL,
  "client_invoice_id" UUID NOT NULL,
  "stage_id" UUID,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "revenue_account_id" UUID,
  CONSTRAINT "client_invoice_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "client_invoice_lines_amount_nonnegative" CHECK ("amount" >= 0)
);
ALTER TABLE "client_invoice_lines"
  ADD CONSTRAINT "client_invoice_lines_invoice_fkey"
  FOREIGN KEY ("client_invoice_id") REFERENCES "client_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "client_invoice_lines_invoice_stage_idx"
  ON "client_invoice_lines"("client_invoice_id", "stage_id");

INSERT INTO "client_invoice_lines" ("id", "client_invoice_id", "stage_id", "description", "amount", "revenue_account_id")
SELECT gen_random_uuid(), invoice."id", NULL, 'Migrated invoice total', invoice."total_receivable", NULL
FROM "client_invoices" invoice
WHERE NOT EXISTS (
  SELECT 1 FROM "client_invoice_lines" line WHERE line."client_invoice_id" = invoice."id"
);

-- Final Client Billing permissions. Map existing role access forward without rewriting historical permission rows.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'client_billing.read', 'Read Client Billing', 'client_billing'),
  (gen_random_uuid(), 'client_billing.settings.manage', 'Manage Client Billing Settings', 'client_billing'),
  (gen_random_uuid(), 'claims.create', 'Create Billing Claims', 'client_billing'),
  (gen_random_uuid(), 'claims.edit', 'Edit Draft Billing Claims', 'client_billing'),
  (gen_random_uuid(), 'claims.finalize', 'Finalize Billing Claims', 'client_billing'),
  (gen_random_uuid(), 'client_invoices.create', 'Create Client Invoices', 'client_billing'),
  (gen_random_uuid(), 'client_invoices.read', 'Read Client Invoices', 'client_billing')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", final_permission."id"
FROM "role_permissions" rp
JOIN "permissions" legacy_permission
  ON legacy_permission."id" = rp."permission_id"
JOIN (VALUES
  ('client_contracts.manage', 'client_billing.settings.manage'),
  ('client_claims.create', 'claims.create'),
  ('client_claims.create', 'claims.edit'),
  ('client_claims.certify', 'claims.finalize'),
  ('client_invoices.issue', 'client_invoices.create'),
  ('client_billing.read', 'client_invoices.read')
) AS mapping("legacy_code", "final_code")
  ON mapping."legacy_code" = legacy_permission."code"
JOIN "permissions" final_permission
  ON final_permission."code" = mapping."final_code"
ON CONFLICT DO NOTHING;
