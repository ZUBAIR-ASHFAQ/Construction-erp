ALTER TABLE "equipment_assignments"
  ADD COLUMN "quantity" DECIMAL(18,4) NOT NULL DEFAULT 1,
  ADD COLUMN "rate" DECIMAL(18,4),
  ADD COLUMN "rate_unit" VARCHAR(32),
  ADD COLUMN "estimated_amount" DECIMAL(18,2);

UPDATE "equipment_assignments" assignment
SET "rate" = COALESCE(equipment."default_rate", 0),
    "rate_unit" = CASE UPPER(COALESCE(equipment."rate_unit", 'DAY'))
      WHEN 'HOUR' THEN 'HOUR'
      WHEN 'DAY' THEN 'DAY'
      WHEN 'MONTH' THEN 'MONTH'
      ELSE 'DAY'
    END
FROM "equipment" equipment
WHERE equipment."id" = assignment."equipment_id";

ALTER TABLE "equipment_assignments"
  ALTER COLUMN "rate" SET NOT NULL,
  ALTER COLUMN "rate_unit" SET NOT NULL;

ALTER TABLE "equipment_assignments"
  ADD CONSTRAINT "equipment_assignments_quantity_positive" CHECK ("quantity" > 0),
  ADD CONSTRAINT "equipment_assignments_rate_nonnegative" CHECK ("rate" >= 0),
  ADD CONSTRAINT "equipment_assignments_rate_unit_valid" CHECK ("rate_unit" IN ('HOUR', 'DAY', 'MONTH'));
