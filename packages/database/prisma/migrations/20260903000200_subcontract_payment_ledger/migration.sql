-- Add simple subcontract payments and a source-derived subcontract ledger.
-- This does not restore the removed legacy payment-application, retention or revision workflow.

CREATE TABLE "subcontract_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "subcontract_contract_id" UUID NOT NULL,
    "payment_no" VARCHAR(100) NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "cash_bank_account_id" UUID NOT NULL,
    "reference" VARCHAR(200),
    "status" VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontract_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontract_payments_amount_positive" CHECK ("amount" > 0),
    CONSTRAINT "subcontract_payments_status_allowed" CHECK ("status" IN ('DRAFT', 'POSTED'))
);

CREATE UNIQUE INDEX "subcontract_contracts_id_company_uq"
    ON "subcontract_contracts"("id", "company_id");

CREATE UNIQUE INDEX "subcontract_payments_company_payment_no_uq"
    ON "subcontract_payments"("company_id", "payment_no");
CREATE UNIQUE INDEX "subcontract_payments_id_company_uq"
    ON "subcontract_payments"("id", "company_id");
CREATE INDEX "subcontract_payments_company_contract_status_date_idx"
    ON "subcontract_payments"("company_id", "subcontract_contract_id", "status", "payment_date");
CREATE INDEX "subcontract_payments_cash_bank_date_idx"
    ON "subcontract_payments"("cash_bank_account_id", "payment_date");

ALTER TABLE "subcontract_payments"
    ADD CONSTRAINT "subcontract_payments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_payments_contract_company_fkey"
        FOREIGN KEY ("subcontract_contract_id", "company_id") REFERENCES "subcontract_contracts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "subcontract_payments_cash_bank_company_fkey"
        FOREIGN KEY ("cash_bank_account_id", "company_id") REFERENCES "cash_bank_accounts"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;
