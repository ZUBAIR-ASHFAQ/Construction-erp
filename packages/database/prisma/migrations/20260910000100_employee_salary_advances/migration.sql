-- Add project-linked Employee salary advances, automatic Payroll recovery, and visible absence breakdown.

ALTER TABLE "payroll_lines"
  ADD COLUMN "salary_before_absence" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "absence_deduction" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "advance_deduction" DECIMAL(18,2) NOT NULL DEFAULT 0;

UPDATE "payroll_lines"
SET "salary_before_absence" = "gross_amount";

ALTER TABLE "payroll_lines"
  ADD CONSTRAINT "payroll_lines_absence_deduction_nonnegative" CHECK ("absence_deduction" >= 0),
  ADD CONSTRAINT "payroll_lines_advance_deduction_nonnegative" CHECK ("advance_deduction" >= 0),
  ADD CONSTRAINT "payroll_lines_salary_before_absence_nonnegative" CHECK ("salary_before_absence" >= 0);

CREATE TABLE "employee_advances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stage_id" UUID,
  "advance_no" VARCHAR(100) NOT NULL,
  "advance_date" DATE NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "cash_bank_account_id" UUID NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "reference" VARCHAR(200),
  "status" VARCHAR(32) NOT NULL DEFAULT 'POSTED',
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversal_date" DATE,
  "reversed_at" TIMESTAMPTZ(6),
  CONSTRAINT "employee_advances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_advances_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "employee_advances_status_allowed" CHECK ("status" IN ('POSTED', 'REVERSED'))
);

CREATE UNIQUE INDEX "employee_advances_company_advance_no_uq" ON "employee_advances"("company_id", "advance_no");
CREATE UNIQUE INDEX "employee_advances_id_company_uq" ON "employee_advances"("id", "company_id");
CREATE INDEX "employee_advances_company_employee_date_idx" ON "employee_advances"("company_id", "employee_id", "advance_date");
CREATE INDEX "employee_advances_company_project_date_idx" ON "employee_advances"("company_id", "project_id", "advance_date");
CREATE INDEX "employee_advances_cash_bank_date_idx" ON "employee_advances"("cash_bank_account_id", "advance_date");

ALTER TABLE "employee_advances"
  ADD CONSTRAINT "employee_advances_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_advances_employee_company_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "employee_advances_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "employee_advances_stage_project_fkey" FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "employee_advances_cash_bank_company_fkey" FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "employee_advances_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "payroll_advance_recoveries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "payroll_line_id" UUID NOT NULL,
  "employee_advance_id" UUID NOT NULL,
  "amount" DECIMAL(18,2) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_advance_recoveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_advance_recoveries_amount_positive" CHECK ("amount" > 0)
);

CREATE UNIQUE INDEX "payroll_advance_recoveries_line_advance_uq" ON "payroll_advance_recoveries"("payroll_line_id", "employee_advance_id");
CREATE INDEX "payroll_advance_recoveries_company_advance_idx" ON "payroll_advance_recoveries"("company_id", "employee_advance_id");

ALTER TABLE "payroll_advance_recoveries"
  ADD CONSTRAINT "payroll_advance_recoveries_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payroll_advance_recoveries_payroll_line_fkey" FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payroll_advance_recoveries_advance_company_fkey" FOREIGN KEY ("employee_advance_id", "company_id") REFERENCES "employee_advances"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO "permissions" ("code", "description", "domain") VALUES
  ('payroll.advances.create', 'Create and post Employee salary advances', 'payroll'),
  ('payroll.advances.reverse', 'Reverse unrecovered Employee salary advances', 'payroll')
ON CONFLICT ("code") DO UPDATE SET "description" = EXCLUDED."description", "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin' AND role."is_system" = TRUE AND role."status" = 'ACTIVE'
  AND permission."code" IN ('payroll.advances.create', 'payroll.advances.reverse')
ON CONFLICT DO NOTHING;

INSERT INTO "number_sequences" (
  "id", "company_id", "sequence_key", "prefix", "suffix", "pad_width",
  "next_value", "increment_by", "status", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", 'employee-advance', 'ADV-', '', 6, 1, 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
ON CONFLICT ("company_id", "sequence_key") DO NOTHING;
