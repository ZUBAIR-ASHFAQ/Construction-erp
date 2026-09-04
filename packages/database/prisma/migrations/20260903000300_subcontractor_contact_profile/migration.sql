-- Add the professional subcontractor contact profile while preserving existing records.
ALTER TABLE "subcontractors"
  ADD COLUMN "name" VARCHAR(300),
  ADD COLUMN "phone" VARCHAR(50),
  ADD COLUMN "address" VARCHAR(1000);

UPDATE "subcontractors"
SET
  "name" = COALESCE(NULLIF(btrim("legal_name"), ''), "code"),
  "phone" = COALESCE(NULLIF(btrim("phone"), ''), 'Not provided'),
  "address" = COALESCE(NULLIF(btrim("address"), ''), 'Not provided');

ALTER TABLE "subcontractors"
  ALTER COLUMN "name" SET NOT NULL,
  ALTER COLUMN "phone" SET NOT NULL,
  ALTER COLUMN "address" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "subcontractors_company_code_uq"
  ON "subcontractors"("company_id", "code");
