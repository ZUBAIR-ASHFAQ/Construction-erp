-- Scope operational Cash/Bank accounts to Projects while preserving existing company accounts for administrators.
-- Site Managers receive only the account and salary-payment permissions required for their assigned Projects.

ALTER TABLE "cash_bank_accounts"
  ADD COLUMN "project_id" UUID;

ALTER TABLE "cash_bank_accounts"
  ADD CONSTRAINT "cash_bank_accounts_project_company_fkey"
  FOREIGN KEY ("project_id", "company_id")
  REFERENCES "projects"("id", "company_id")
  ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE INDEX "cash_bank_accounts_company_project_status_type_idx"
  ON "cash_bank_accounts"("company_id", "project_id", "status", "account_type");

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
JOIN "permissions" permission ON permission."code" IN (
  'finance.accounts.manage',
  'payroll.payments.create',
  'payroll.advances.create'
)
WHERE role."code" = 'site-manager'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
ON CONFLICT DO NOTHING;
