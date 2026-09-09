-- Complete Payroll settlement with employee-linked partial payments and append-only reversals.

CREATE TABLE "payroll_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "payroll_line_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payment_no" VARCHAR(100) NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "cash_bank_account_id" UUID NOT NULL,
    "reference" VARCHAR(200),
    "status" VARCHAR(32) NOT NULL DEFAULT 'POSTED',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversal_date" DATE,
    "reversed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "payroll_payments_status_allowed" CHECK ("status" IN ('POSTED', 'REVERSED'))
);

CREATE UNIQUE INDEX "payroll_payments_company_payment_no_uq"
    ON "payroll_payments"("company_id", "payment_no");
CREATE UNIQUE INDEX "payroll_payments_id_company_uq"
    ON "payroll_payments"("id", "company_id");
CREATE INDEX "payroll_payments_company_employee_date_idx"
    ON "payroll_payments"("company_id", "employee_id", "payment_date");
CREATE INDEX "payroll_payments_line_status_idx"
    ON "payroll_payments"("payroll_line_id", "status");
CREATE INDEX "payroll_payments_cash_bank_date_idx"
    ON "payroll_payments"("cash_bank_account_id", "payment_date");

ALTER TABLE "payroll_payments"
    ADD CONSTRAINT "payroll_payments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_payments_payroll_line_fkey"
        FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_payments_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_payments_cash_bank_company_fkey"
        FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "payroll_payments_created_by_fkey"
        FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "permissions" ("code", "description", "domain") VALUES
  ('payroll.payments.create', 'Create and post Employee salary payments', 'payroll'),
  ('payroll.payments.reverse', 'Reverse posted Employee salary payments', 'payroll')
ON CONFLICT ("code") DO UPDATE SET
  "description" = EXCLUDED."description",
  "domain" = EXCLUDED."domain";

INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT role."id", permission."code"
FROM "roles" role
CROSS JOIN "permissions" permission
WHERE role."code" = 'system-admin'
  AND role."is_system" = TRUE
  AND role."status" = 'ACTIVE'
  AND permission."code" IN ('payroll.payments.create', 'payroll.payments.reverse')
ON CONFLICT DO NOTHING;

INSERT INTO "number_sequences" (
  "id", "company_id", "sequence_key", "prefix", "suffix", "pad_width",
  "next_value", "increment_by", "status", "created_at", "updated_at"
)
SELECT gen_random_uuid(), company."id", 'payroll-payment', 'SAL-', '', 6, 1, 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies" company
ON CONFLICT ("company_id", "sequence_key") DO NOTHING;
