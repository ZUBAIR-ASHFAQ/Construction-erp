-- Final-21 B5.2: make Module 3 the Employee master and effective-dated compensation owner.
-- Historical leave/payroll/timesheet rows remain intact; only their active Employee ownership is retired here.

-- Align Employee master columns with the final Module 3 vocabulary while preserving row IDs.
ALTER TABLE "employees"
  ADD COLUMN IF NOT EXISTS "cnic_or_id" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "phone" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "email" VARCHAR(320);

ALTER TABLE "employees" RENAME COLUMN "employment_type" TO "employee_type";
ALTER TABLE "employees" RENAME COLUMN "join_date" TO "joining_date";

-- Explicit duplicate handling for optional CNIC/identity values inside one Company.
CREATE UNIQUE INDEX IF NOT EXISTS "employees_company_cnic_or_id_uq"
  ON "employees"("company_id", "cnic_or_id");

-- Rename the existing effective-dated salary history instead of recreating or losing it.
ALTER TABLE "employee_compensation_periods" RENAME TO "employee_compensation";
ALTER TABLE "employee_compensation" RENAME COLUMN "base_salary" TO "base_salary_or_wage";

ALTER INDEX IF EXISTS "employee_compensation_periods_company_employee_from_idx"
  RENAME TO "employee_compensation_company_employee_from_idx";
ALTER INDEX IF EXISTS "employee_compensation_periods_employee_dates_idx"
  RENAME TO "employee_compensation_employee_dates_idx";

ALTER TABLE "employee_compensation"
  DROP CONSTRAINT IF EXISTS "employee_compensation_periods_pay_type",
  DROP CONSTRAINT IF EXISTS "employee_compensation_periods_shape",
  DROP CONSTRAINT IF EXISTS "employee_compensation_periods_date_order";

ALTER TABLE "employee_compensation"
  ADD CONSTRAINT "employee_compensation_pay_type"
    CHECK ("pay_type" IN ('SALARY', 'DAILY', 'HOURLY')),
  ADD CONSTRAINT "employee_compensation_shape"
    CHECK (
      ("pay_type" IN ('SALARY', 'DAILY') AND "base_salary_or_wage" IS NOT NULL AND "hourly_rate" IS NULL)
      OR
      ("pay_type" = 'HOURLY' AND "hourly_rate" IS NOT NULL AND "base_salary_or_wage" IS NULL)
    ),
  ADD CONSTRAINT "employee_compensation_date_order"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from");

-- Preserve legacy Employee salary/rate values when an Employee has no historical compensation row yet.
INSERT INTO "employee_compensation" (
  "id", "company_id", "employee_id", "pay_type", "base_salary_or_wage", "hourly_rate", "effective_from", "effective_to", "created_at"
)
SELECT
  gen_random_uuid(),
  e."company_id",
  e."id",
  CASE WHEN e."base_salary" IS NOT NULL THEN 'SALARY' ELSE 'HOURLY' END,
  e."base_salary",
  CASE WHEN e."base_salary" IS NULL THEN e."hourly_rate" ELSE NULL END,
  e."joining_date",
  NULL,
  CURRENT_TIMESTAMP
FROM "employees" e
WHERE (e."base_salary" IS NOT NULL OR e."hourly_rate" IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM "employee_compensation" c WHERE c."employee_id" = e."id"
  );

-- Replace the old overlap trigger because its PL/pgSQL body referenced the old table name.
DROP TRIGGER IF EXISTS "employee_compensation_periods_integrity" ON "employee_compensation";
DROP FUNCTION IF EXISTS "module_14b_validate_compensation_period"();

CREATE FUNCTION "final21_validate_employee_compensation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  employee_company_id UUID;
BEGIN
  SELECT "company_id" INTO employee_company_id
  FROM "employees"
  WHERE "id" = NEW."employee_id"
  FOR UPDATE;

  IF employee_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF employee_company_id IS DISTINCT FROM NEW."company_id" THEN
    RAISE EXCEPTION 'Employee compensation must belong to the Employee Company'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "employee_compensation" existing
    WHERE existing."employee_id" = NEW."employee_id"
      AND existing."id" <> NEW."id"
      AND existing."effective_from" <= COALESCE(NEW."effective_to", 'infinity'::date)
      AND NEW."effective_from" <= COALESCE(existing."effective_to", 'infinity'::date)
  ) THEN
    RAISE EXCEPTION 'Employee compensation periods may not overlap'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "employee_compensation_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "employee_id", "effective_from", "effective_to"
ON "employee_compensation"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_employee_compensation"();

-- Final Module 3 owns append-only employment status history.
CREATE TABLE "employee_employment_history" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "event_type" VARCHAR(64) NOT NULL,
  "effective_date" DATE NOT NULL,
  "notes" TEXT,
  CONSTRAINT "employee_employment_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_employment_history_event_type_not_blank" CHECK (length(btrim("event_type")) > 0),
  CONSTRAINT "employee_employment_history_employee_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "employee_employment_history_employee_date_idx"
  ON "employee_employment_history"("employee_id", "effective_date");

-- Seed one creation/history marker for existing Employees without inventing employment events.
INSERT INTO "employee_employment_history" ("id", "employee_id", "event_type", "effective_date", "notes")
SELECT gen_random_uuid(), e."id", 'MIGRATED', e."joining_date", 'Existing Employee migrated to Final-21 Module 3.'
FROM "employees" e
WHERE NOT EXISTS (
  SELECT 1 FROM "employee_employment_history" h WHERE h."employee_id" = e."id"
);

-- Final Module 3 permission vocabulary.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'employees.read', 'Read Employees', 'employees'),
  (gen_random_uuid(), 'employees.create', 'Create Employees', 'employees'),
  (gen_random_uuid(), 'employees.update', 'Update Employees', 'employees'),
  (gen_random_uuid(), 'employees.compensation.manage', 'Manage Employee Compensation', 'employees')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Preserve legacy HR access while splitting final Employee permissions.
INSERT INTO "role_permissions" ("role_id", "permission_code")
SELECT DISTINCT rp."role_id", mapping."final_code"
FROM "role_permissions" rp
JOIN (VALUES
  ('employees.manage', 'employees.create'),
  ('employees.manage', 'employees.update'),
  ('employees.manage', 'employees.compensation.manage')
) AS mapping("legacy_code", "final_code") ON mapping."legacy_code" = rp."permission_code"
ON CONFLICT DO NOTHING;

-- Leave Management is outside Final-21 active scope. Keep historical leave rows for later data-retention cleanup.
DELETE FROM "role_permissions"
WHERE "permission_code" IN ('employees.manage', 'leave.read', 'leave.approve');

DELETE FROM "permissions"
WHERE "code" IN ('employees.manage', 'leave.read', 'leave.approve');
