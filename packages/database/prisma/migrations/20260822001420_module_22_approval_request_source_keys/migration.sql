-- Make approval-request creation retry-safe for trusted owning-module commands.
-- Existing rows receive a deterministic legacy key so the migration is safe on supported upgrades.
ALTER TABLE "approval_requests"
    ADD COLUMN "source_key" VARCHAR(700);

UPDATE "approval_requests"
SET "source_key" = 'legacy:approval-request:' || "id"::text
WHERE "source_key" IS NULL;

ALTER TABLE "approval_requests"
    ALTER COLUMN "source_key" SET NOT NULL;

CREATE UNIQUE INDEX "approval_requests_company_source_key_uq"
    ON "approval_requests"("company_id", "source_key");
