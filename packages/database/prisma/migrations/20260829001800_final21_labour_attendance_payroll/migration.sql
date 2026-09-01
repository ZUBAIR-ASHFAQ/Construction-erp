-- Final-21 Pass B14: replace legacy Timesheet/Payroll persistence with the final
-- Labour / Attendance & Payroll contract. Historical migrations remain immutable.

-- Retire legacy trigger functions before their tables are transformed or removed.
DROP TRIGGER IF EXISTS "timesheets_scope_integrity" ON "timesheets";
DROP TRIGGER IF EXISTS "timesheet_entries_scope_integrity" ON "timesheet_entries";
DROP TRIGGER IF EXISTS "timesheet_adjustments_scope_integrity" ON "timesheet_adjustments";
DROP FUNCTION IF EXISTS "module_13_validate_timesheet_scope"();
DROP FUNCTION IF EXISTS "module_13_validate_timesheet_entry_scope"();
DROP FUNCTION IF EXISTS "module_13_validate_timesheet_adjustment_scope"();
DROP TRIGGER IF EXISTS "payroll_runs_period_integrity" ON "payroll_runs";
DROP TRIGGER IF EXISTS "payslips_company_integrity" ON "payslips";
DROP TRIGGER IF EXISTS "payroll_calculation_exceptions_scope_integrity" ON "payroll_calculation_exceptions";
DROP TRIGGER IF EXISTS "payroll_source_consumptions_scope_integrity" ON "payroll_source_consumptions";
DROP FUNCTION IF EXISTS "module_14b_validate_payroll_run_period"();
DROP FUNCTION IF EXISTS "module_14b_validate_payslip_company"();
DROP FUNCTION IF EXISTS "module_14b_validate_payroll_calculation_exception_scope"();
DROP FUNCTION IF EXISTS "module_14b_validate_payroll_source_consumption_scope"();

-- Final daily attendance replaces Timesheet header/entry/cost-code coupling.
CREATE TABLE "attendance_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "stage_id" UUID,
  "work_date" DATE NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "hours" DECIMAL(18,4),
  "overtime_hours" DECIMAL(18,4),
  "entered_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_entries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_entries_status_ck" CHECK ("status" IN ('PRESENT', 'ABSENT')),
  CONSTRAINT "attendance_entries_hours_nonnegative" CHECK ("hours" IS NULL OR "hours" >= 0),
  CONSTRAINT "attendance_entries_overtime_nonnegative" CHECK ("overtime_hours" IS NULL OR "overtime_hours" >= 0),
  CONSTRAINT "attendance_entries_daily_hours_ck" CHECK (COALESCE("hours", 0) + COALESCE("overtime_hours", 0) <= 24),
  CONSTRAINT "attendance_entries_absent_hours_ck" CHECK ("status" <> 'ABSENT' OR (COALESCE("hours", 0) = 0 AND COALESCE("overtime_hours", 0) = 0))
);

-- Preserve legacy worked time by collapsing old cost-coded rows to the Final-21 Employee/Project/date grain.
-- Approved Timesheet adjustments are folded into regular hours; no WBS/Cost Code/Cost Type survives.
WITH adjustment_totals AS (
  SELECT "original_entry_id", SUM("adjustment_hours") AS adjustment_hours
  FROM "timesheet_adjustments"
  WHERE "approved_by" IS NOT NULL
  GROUP BY "original_entry_id"
), legacy_attendance AS (
  SELECT
    t."company_id",
    t."employee_id",
    te."project_id",
    te."work_date",
    SUM(te."regular_hours" + COALESCE(a.adjustment_hours, 0)) AS hours,
    SUM(te."overtime_hours") AS overtime_hours
  FROM "timesheets" t
  JOIN "timesheet_entries" te ON te."timesheet_id" = t."id"
  LEFT JOIN adjustment_totals a ON a."original_entry_id" = te."id"
  GROUP BY t."company_id", t."employee_id", te."project_id", te."work_date"
), resolved AS (
  SELECT
    legacy.*,
    COALESCE(e."user_id", actor."id") AS entered_by
  FROM legacy_attendance legacy
  JOIN "employees" e ON e."id" = legacy."employee_id" AND e."company_id" = legacy."company_id"
  LEFT JOIN LATERAL (
    SELECT u."id"
    FROM "users" u
    WHERE u."company_id" = legacy."company_id"
    ORDER BY CASE WHEN upper(u."status") = 'ACTIVE' THEN 0 ELSE 1 END, u."created_at", u."id"
    LIMIT 1
  ) actor ON TRUE
)
INSERT INTO "attendance_entries" (
  "id", "company_id", "employee_id", "project_id", "stage_id", "work_date", "status", "hours", "overtime_hours", "entered_by"
)
SELECT
  gen_random_uuid(), "company_id", "employee_id", "project_id", NULL, "work_date", 'PRESENT', "hours", "overtime_hours", "entered_by"
FROM resolved
WHERE "entered_by" IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance_entries"
    WHERE COALESCE("hours", 0) < 0 OR COALESCE("overtime_hours", 0) < 0
       OR COALESCE("hours", 0) + COALESCE("overtime_hours", 0) > 24
  ) THEN
    RAISE EXCEPTION 'B14 cannot migrate invalid legacy attendance hours; correct the old Timesheet history first';
  END IF;
END;
$$;

CREATE UNIQUE INDEX "attendance_entries_company_employee_project_date_uq"
  ON "attendance_entries"("company_id", "employee_id", "project_id", "work_date");
CREATE INDEX "attendance_entries_company_project_date_idx"
  ON "attendance_entries"("company_id", "project_id", "work_date");
CREATE INDEX "attendance_entries_company_employee_date_idx"
  ON "attendance_entries"("company_id", "employee_id", "work_date");
CREATE INDEX "attendance_entries_stage_date_idx" ON "attendance_entries"("stage_id", "work_date");
CREATE INDEX "attendance_entries_entered_by_idx" ON "attendance_entries"("entered_by");

ALTER TABLE "attendance_entries"
  ADD CONSTRAINT "attendance_entries_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "attendance_entries_employee_company_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "attendance_entries_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "attendance_entries_stage_project_fkey" FOREIGN KEY ("stage_id", "project_id") REFERENCES "project_stages"("id", "project_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT "attendance_entries_entered_by_fkey" FOREIGN KEY ("entered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Database-level assignment and tenant guard for attendance writes.
CREATE FUNCTION "final21_validate_attendance_scope"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  employee_company UUID;
  project_company UUID;
  actor_company UUID;
BEGIN
  SELECT "company_id" INTO employee_company FROM "employees" WHERE "id" = NEW."employee_id";
  SELECT "company_id" INTO project_company FROM "projects" WHERE "id" = NEW."project_id";
  SELECT "company_id" INTO actor_company FROM "users" WHERE "id" = NEW."entered_by";

  IF NEW."company_id" IS DISTINCT FROM employee_company
     OR NEW."company_id" IS DISTINCT FROM project_company
     OR NEW."company_id" IS DISTINCT FROM actor_company THEN
    RAISE EXCEPTION 'Attendance Company Employee Project and actor must match' USING ERRCODE = '23514';
  END IF;

  IF NEW."stage_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "project_stages" s WHERE s."id" = NEW."stage_id" AND s."project_id" = NEW."project_id"
  ) THEN
    RAISE EXCEPTION 'Attendance Stage must belong to the selected Project' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "project_team_assignments" a
    WHERE a."company_id" = NEW."company_id"
      AND a."employee_id" = NEW."employee_id"
      AND a."project_id" = NEW."project_id"
      AND upper(a."status") = 'ACTIVE'
      AND a."from_date" <= NEW."work_date"
      AND (a."to_date" IS NULL OR a."to_date" >= NEW."work_date")
      AND (NEW."stage_id" IS NULL OR a."stage_id" IS NULL OR a."stage_id" = NEW."stage_id")
  ) THEN
    RAISE EXCEPTION 'Attendance requires an active Project/Stage Employee assignment' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER "attendance_entries_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "employee_id", "project_id", "stage_id", "work_date", "entered_by"
ON "attendance_entries"
FOR EACH ROW EXECUTE FUNCTION "final21_validate_attendance_scope"();

-- Preserve old Payroll headers/employee summaries long enough to transform them forward.
ALTER TABLE "payroll_runs" RENAME TO "payroll_runs_legacy_b14";
ALTER TABLE "payslips" RENAME TO "payslips_legacy_b14";
ALTER TABLE "payslip_items" RENAME TO "payslip_items_legacy_b14";
ALTER TABLE "payroll_calculation_exceptions" RENAME TO "payroll_calculation_exceptions_legacy_b14";
ALTER TABLE "payroll_source_consumptions" RENAME TO "payroll_source_consumptions_legacy_b14";

-- Free legacy index names before creating the Final-21 payroll tables.
ALTER TABLE "payroll_runs_legacy_b14"
  RENAME CONSTRAINT "payroll_runs_pkey" TO "payroll_runs_legacy_b14_pkey";

ALTER INDEX "payroll_runs_company_period_idx"
  RENAME TO "payroll_runs_legacy_b14_company_period_idx";

ALTER INDEX "payroll_runs_company_status_period_idx"
  RENAME TO "payroll_runs_legacy_b14_company_status_period_idx";

ALTER TABLE "payslips_legacy_b14"
  RENAME CONSTRAINT "payslips_pkey" TO "payslips_legacy_b14_pkey";

CREATE TABLE "payroll_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "status" VARCHAR(32) NOT NULL,
  "created_by" UUID NOT NULL,
  "finalized_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_runs_period_order" CHECK ("period_end" >= "period_start"),
  CONSTRAINT "payroll_runs_status_ck" CHECK ("status" IN ('DRAFT', 'CALCULATED', 'FINALIZED')),
  CONSTRAINT "payroll_runs_finalization_state_ck" CHECK (("status" = 'FINALIZED') = ("finalized_at" IS NOT NULL))
);

INSERT INTO "payroll_runs" ("id", "company_id", "period_start", "period_end", "status", "created_by", "finalized_at", "created_at")
SELECT
  legacy."id",
  legacy."company_id",
  legacy."period_start",
  legacy."period_end",
  CASE
    WHEN upper(legacy."status") = 'FINALIZED' THEN 'FINALIZED'
    WHEN legacy."calculated_at" IS NOT NULL OR upper(legacy."status") <> 'DRAFT' THEN 'CALCULATED'
    ELSE 'DRAFT'
  END,
  actor."id",
  CASE WHEN upper(legacy."status") = 'FINALIZED' THEN COALESCE(legacy."finalized_at", legacy."calculated_at", CURRENT_TIMESTAMP) ELSE NULL END,
  COALESCE(legacy."calculated_at", CURRENT_TIMESTAMP)
FROM "payroll_runs_legacy_b14" legacy
JOIN LATERAL (
  SELECT u."id"
  FROM "users" u
  WHERE u."company_id" = legacy."company_id"
  ORDER BY CASE WHEN upper(u."status") = 'ACTIVE' THEN 0 ELSE 1 END, u."created_at", u."id"
  LIMIT 1
) actor ON TRUE;

CREATE TABLE "payroll_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payroll_run_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "gross_amount" DECIMAL(18,2) NOT NULL,
  "deductions" DECIMAL(18,2) NOT NULL,
  "net_amount" DECIMAL(18,2) NOT NULL,
  "project_allocation_json" JSONB NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_lines_amounts_nonnegative" CHECK ("gross_amount" >= 0 AND "deductions" >= 0 AND "net_amount" >= 0),
  CONSTRAINT "payroll_lines_totals_ck" CHECK ("net_amount" = "gross_amount" - "deductions")
);

-- Old Payslip totals remain visible. Project allocation cannot be inferred safely from the legacy cost-coded model,
-- so migrated historical lines retain an empty allocation snapshot instead of inventing Project/Stage amounts.
INSERT INTO "payroll_lines" ("id", "payroll_run_id", "employee_id", "gross_amount", "deductions", "net_amount", "project_allocation_json")
SELECT gen_random_uuid(), p."payroll_run_id", p."employee_id", p."gross_pay", p."deductions", p."net_pay", '[]'::jsonb
FROM "payslips_legacy_b14" p
JOIN "payroll_runs" r ON r."id" = p."payroll_run_id";

CREATE TABLE "payslips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "payroll_line_id" UUID NOT NULL,
  "document_id" UUID,
  "generated_at" TIMESTAMPTZ(6),
  CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

INSERT INTO "payslips" ("id", "payroll_line_id", "document_id", "generated_at")
SELECT
  gen_random_uuid(),
  line."id",
  NULL,
  CASE WHEN run."status" = 'FINALIZED' THEN run."finalized_at" ELSE NULL END
FROM "payroll_lines" line
JOIN "payroll_runs" run ON run."id" = line."payroll_run_id";

CREATE INDEX "payroll_runs_company_period_idx" ON "payroll_runs"("company_id", "period_start", "period_end");
CREATE INDEX "payroll_runs_company_status_period_idx" ON "payroll_runs"("company_id", "status", "period_start");
CREATE INDEX "payroll_runs_created_by_idx" ON "payroll_runs"("created_by");
CREATE UNIQUE INDEX "payroll_lines_run_employee_uq" ON "payroll_lines"("payroll_run_id", "employee_id");
CREATE INDEX "payroll_lines_employee_run_idx" ON "payroll_lines"("employee_id", "payroll_run_id");
CREATE UNIQUE INDEX "payslips_payroll_line_uq" ON "payslips"("payroll_line_id");
CREATE INDEX "payslips_document_idx" ON "payslips"("document_id");

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payroll_runs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payroll_lines"
  ADD CONSTRAINT "payroll_lines_run_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payroll_lines_employee_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "payslips"
  ADD CONSTRAINT "payslips_payroll_line_fkey" FOREIGN KEY ("payroll_line_id") REFERENCES "payroll_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "payslips_document_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Same-Company creator and finalized-period overlap integrity.
CREATE FUNCTION "final21_validate_payroll_run"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE creator_company UUID;
BEGIN
  SELECT "company_id" INTO creator_company FROM "users" WHERE "id" = NEW."created_by";
  IF creator_company IS DISTINCT FROM NEW."company_id" THEN
    RAISE EXCEPTION 'Payroll Run creator must belong to the Payroll Company' USING ERRCODE = '23514';
  END IF;

  IF NEW."status" = 'FINALIZED' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW."company_id"::text || ':payroll', 0));
    IF EXISTS (
      SELECT 1 FROM "payroll_runs" existing
      WHERE existing."company_id" = NEW."company_id"
        AND existing."id" <> NEW."id"
        AND existing."status" = 'FINALIZED'
        AND existing."period_start" <= NEW."period_end"
        AND existing."period_end" >= NEW."period_start"
    ) THEN
      RAISE EXCEPTION 'Finalized Payroll periods may not overlap' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "payroll_runs_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "period_start", "period_end", "status", "created_by"
ON "payroll_runs" FOR EACH ROW EXECUTE FUNCTION "final21_validate_payroll_run"();

-- Finalized Payroll and its employee snapshots are immutable; corrections require a later adjustment/reversal run.
CREATE FUNCTION "final21_prevent_finalized_payroll_run_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."status" = 'FINALIZED' THEN
    RAISE EXCEPTION 'Finalized Payroll is immutable; use an adjustment or reversal run' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER "payroll_runs_finalized_immutable_update" BEFORE UPDATE ON "payroll_runs"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_finalized_payroll_run_mutation"();
CREATE TRIGGER "payroll_runs_finalized_immutable_delete" BEFORE DELETE ON "payroll_runs"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_finalized_payroll_run_mutation"();

CREATE FUNCTION "final21_prevent_finalized_payroll_child_mutation"()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run_status VARCHAR(32);
DECLARE run_id UUID;
BEGIN
  run_id := CASE WHEN TG_TABLE_NAME = 'payroll_lines' THEN COALESCE(OLD."payroll_run_id", NEW."payroll_run_id") ELSE NULL END;
  IF TG_TABLE_NAME = 'payslips' THEN
    SELECT pl."payroll_run_id" INTO run_id FROM "payroll_lines" pl WHERE pl."id" = COALESCE(OLD."payroll_line_id", NEW."payroll_line_id");
  END IF;
  SELECT "status" INTO run_status FROM "payroll_runs" WHERE "id" = run_id;
  IF run_status = 'FINALIZED' THEN
    RAISE EXCEPTION 'Finalized Payroll child records are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER "payroll_lines_finalized_immutable" BEFORE UPDATE OR DELETE ON "payroll_lines"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_finalized_payroll_child_mutation"();
CREATE TRIGGER "payslips_finalized_immutable" BEFORE UPDATE OR DELETE ON "payslips"
FOR EACH ROW EXECUTE FUNCTION "final21_prevent_finalized_payroll_child_mutation"();

-- Remove the old Payroll dependency chain, then remove Timesheet history now represented by Attendance.
DROP TABLE "payslip_items_legacy_b14" CASCADE;
DROP TABLE "payroll_calculation_exceptions_legacy_b14" CASCADE;
DROP TABLE "payroll_source_consumptions_legacy_b14" CASCADE;
DROP TABLE "payslips_legacy_b14" CASCADE;
DROP TABLE "payroll_runs_legacy_b14" CASCADE;
DROP TABLE "timesheet_adjustments" CASCADE;
DROP TABLE "timesheet_entries" CASCADE;
DROP TABLE "timesheets" CASCADE;

-- Final Module 13 permission vocabulary. Existing old grants are migrated before obsolete permissions are removed.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'attendance.read', 'Read Attendance', 'payroll'),
  (gen_random_uuid(), 'attendance.create', 'Create Attendance', 'payroll'),
  (gen_random_uuid(), 'attendance.correct', 'Correct Attendance', 'payroll'),
  (gen_random_uuid(), 'payroll.read', 'Read Payroll', 'payroll'),
  (gen_random_uuid(), 'payroll.create', 'Create Payroll Runs', 'payroll'),
  (gen_random_uuid(), 'payroll.calculate', 'Calculate Payroll', 'payroll'),
  (gen_random_uuid(), 'payroll.finalize', 'Finalize Payroll', 'payroll')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Helper grant copies intentionally use stable permission codes rather than role names.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'timesheets.read'
JOIN "permissions" replacement ON replacement."code" = 'attendance.read'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'timesheets.create'
JOIN "permissions" replacement ON replacement."code" = 'attendance.create'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" IN ('timesheets.adjust', 'timesheets.approve')
JOIN "permissions" replacement ON replacement."code" = 'attendance.correct'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", replacement."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id" AND old_permission."code" = 'payroll.calculate'
JOIN "permissions" replacement ON replacement."code" = 'payroll.create'
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions"
WHERE "permission_id" IN (
  SELECT "id" FROM "permissions"
  WHERE "code" IN ('timesheets.read', 'timesheets.create', 'timesheets.approve', 'timesheets.adjust', 'payslip.self_read')
);
DELETE FROM "permissions"
WHERE "code" IN ('timesheets.read', 'timesheets.create', 'timesheets.approve', 'timesheets.adjust', 'payslip.self_read');
