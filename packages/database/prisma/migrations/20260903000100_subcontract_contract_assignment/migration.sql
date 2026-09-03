-- Add the requested simple subcontract Project-assignment contract workflow.
-- This intentionally does not restore the removed legacy subcontract item/payment/revision scope.

CREATE TABLE "subcontract_contracts" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "subcontractor_id" UUID NOT NULL,
    "contract_amount" DECIMAL(18,2) NOT NULL,
    "contract_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcontract_contracts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subcontract_contracts_amount_positive" CHECK ("contract_amount" > 0),
    CONSTRAINT "subcontract_contracts_status_allowed" CHECK ("status" IN ('ACTIVE', 'FINISHED')),
    CONSTRAINT "subcontract_contracts_finish_state" CHECK (
        ("status" = 'ACTIVE' AND "finished_at" IS NULL)
        OR ("status" = 'FINISHED' AND "finished_at" IS NOT NULL)
    )
);

CREATE INDEX "subcontract_contracts_company_status_date_idx"
    ON "subcontract_contracts"("company_id", "status", "contract_date");
CREATE INDEX "subcontract_contracts_company_project_status_idx"
    ON "subcontract_contracts"("company_id", "project_id", "status");
CREATE INDEX "subcontract_contracts_company_subcontractor_status_idx"
    ON "subcontract_contracts"("company_id", "subcontractor_id", "status");

ALTER TABLE "subcontract_contracts"
    ADD CONSTRAINT "subcontract_contracts_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "subcontract_contracts_project_company_fkey"
        FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT,
    ADD CONSTRAINT "subcontract_contracts_subcontractor_company_fkey"
        FOREIGN KEY ("subcontractor_id", "company_id") REFERENCES "subcontractors"("id", "company_id")
        ON DELETE RESTRICT ON UPDATE RESTRICT;
