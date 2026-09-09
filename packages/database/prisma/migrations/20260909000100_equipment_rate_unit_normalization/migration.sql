-- Canonicalize legacy rate-unit casing before assignments capture the unit.
UPDATE "equipment"
SET "rate_unit" = UPPER(BTRIM("rate_unit"))
WHERE "rate_unit" IS NOT NULL
  AND "rate_unit" IS DISTINCT FROM UPPER(BTRIM("rate_unit"));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "equipment"
    WHERE "rate_unit" IS NOT NULL
      AND "rate_unit" NOT IN ('HOUR', 'DAY', 'MONTH')
  ) THEN
    RAISE EXCEPTION 'Equipment rate_unit must be HOUR, DAY, or MONTH before applying this migration';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'equipment_rate_unit_valid'
      AND conrelid = 'equipment'::regclass
  ) THEN
    ALTER TABLE "equipment"
      ADD CONSTRAINT "equipment_rate_unit_valid"
      CHECK ("rate_unit" IS NULL OR "rate_unit" IN ('HOUR', 'DAY', 'MONTH'));
  END IF;
END;
$$;
