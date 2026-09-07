ALTER TABLE "equipment_assignments"
  ADD COLUMN "from_minute" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "to_minute" INTEGER;

ALTER TABLE "equipment_assignments"
  ADD CONSTRAINT "equipment_assignments_from_minute_valid" CHECK ("from_minute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "equipment_assignments_to_minute_valid" CHECK ("to_minute" IS NULL OR "to_minute" BETWEEN 0 AND 1439),
  ADD CONSTRAINT "equipment_assignments_to_time_requires_date" CHECK ("to_minute" IS NULL OR "to_date" IS NOT NULL);
