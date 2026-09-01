-- Final-21 B8: Project Team / Assignment.
-- Employee Project/Stage assignment moves out of legacy ProjectMember and WorkforceAssignment ownership.

CREATE UNIQUE INDEX IF NOT EXISTS "employees_id_company_uq" ON "employees"("id", "company_id");

CREATE TABLE "project_team_assignments" (
  "id" UUID NOT NULL,
  "company_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "project_role" VARCHAR(160) NOT NULL,
  "allocation_percent" DECIMAL(7,4) NOT NULL,
  "stage_id" UUID,
  "from_date" DATE NOT NULL,
  "to_date" DATE,
  "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "project_team_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_team_assignments_role_ck" CHECK (length(btrim("project_role")) > 0),
  CONSTRAINT "project_team_assignments_allocation_ck" CHECK ("allocation_percent" > 0 AND "allocation_percent" <= 100),
  CONSTRAINT "project_team_assignments_date_order_ck" CHECK ("to_date" IS NULL OR "to_date" >= "from_date"),
  CONSTRAINT "project_team_assignments_company_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_team_assignments_project_company_fkey" FOREIGN KEY ("project_id", "company_id") REFERENCES "projects"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "project_team_assignments_employee_company_fkey" FOREIGN KEY ("employee_id", "company_id") REFERENCES "employees"("id", "company_id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "project_team_assignments_stage_fkey" FOREIGN KEY ("stage_id") REFERENCES "project_stages"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "project_team_assignments_id_company_uq" ON "project_team_assignments"("id", "company_id");
CREATE INDEX "project_team_assignments_company_project_status_idx" ON "project_team_assignments"("company_id", "project_id", "status");
CREATE INDEX "project_team_assignments_company_employee_status_idx" ON "project_team_assignments"("company_id", "employee_id", "status");
CREATE INDEX "project_team_assignments_employee_dates_idx" ON "project_team_assignments"("employee_id", "from_date", "to_date");
CREATE INDEX "project_team_assignments_stage_status_idx" ON "project_team_assignments"("stage_id", "status");

CREATE TABLE "project_team_history" (
  "id" UUID NOT NULL,
  "assignment_id" UUID NOT NULL,
  "action" VARCHAR(64) NOT NULL,
  "changed_by" UUID NOT NULL,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  CONSTRAINT "project_team_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "project_team_history_assignment_fkey" FOREIGN KEY ("assignment_id") REFERENCES "project_team_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "project_team_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "project_team_history_assignment_changed_idx" ON "project_team_history"("assignment_id", "changed_at");
CREATE INDEX "project_team_history_changed_by_idx" ON "project_team_history"("changed_by", "changed_at");

-- Enforce that an optional Stage belongs to the same Project and Company as the assignment.
CREATE FUNCTION "final21_validate_project_team_stage_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  stage_project_id UUID;
  stage_company_id UUID;
BEGIN
  IF NEW."stage_id" IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT "project_id", "company_id"
    INTO stage_project_id, stage_company_id
    FROM "project_stages"
   WHERE "id" = NEW."stage_id";

  IF stage_project_id IS DISTINCT FROM NEW."project_id"
     OR stage_company_id IS DISTINCT FROM NEW."company_id" THEN
    RAISE EXCEPTION 'Project Team Stage must belong to the assignment Project and Company'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "project_team_assignments_stage_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "project_id", "stage_id"
ON "project_team_assignments"
FOR EACH ROW
EXECUTE FUNCTION "final21_validate_project_team_stage_scope"();

-- Preserve legacy Workforce assignment history as the primary migration source.
INSERT INTO "project_team_assignments" (
  "id", "company_id", "project_id", "employee_id", "project_role",
  "allocation_percent", "stage_id", "from_date", "to_date", "status", "created_at", "updated_at"
)
SELECT
  wa."id", wa."company_id", wa."project_id", wa."employee_id", wa."trade_role",
  100.0000, NULL, wa."from_date", wa."to_date",
  CASE WHEN upper(wa."status") = 'ACTIVE' THEN 'ACTIVE' ELSE 'ENDED' END,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "workforce_assignments" wa
ON CONFLICT ("id") DO NOTHING;

-- Preserve legacy ProjectMember rows only when the member has a linked Employee identity.
INSERT INTO "project_team_assignments" (
  "id", "company_id", "project_id", "employee_id", "project_role",
  "allocation_percent", "stage_id", "from_date", "to_date", "status", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), pm."company_id", pm."project_id", employee."id", pm."project_role",
  100.0000, NULL, pm."from_date", pm."to_date",
  CASE WHEN upper(pm."status") = 'ACTIVE' THEN 'ACTIVE' ELSE 'ENDED' END,
  pm."created_at", pm."updated_at"
FROM "project_members" pm
JOIN "employees" employee
  ON employee."company_id" = pm."company_id"
 AND employee."user_id" = pm."user_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "project_team_assignments" current_assignment
  WHERE current_assignment."company_id" = pm."company_id"
    AND current_assignment."project_id" = pm."project_id"
    AND current_assignment."employee_id" = employee."id"
    AND current_assignment."from_date" = pm."from_date"
    AND current_assignment."to_date" IS NOT DISTINCT FROM pm."to_date"
);

-- Final Module 8 permissions.
INSERT INTO "permissions" ("id", "code", "name", "domain") VALUES
  (gen_random_uuid(), 'project_team.read', 'Read Project Team', 'project_team'),
  (gen_random_uuid(), 'project_team.manage', 'Manage Project Team', 'project_team')
ON CONFLICT ("code") DO UPDATE SET "name" = EXCLUDED."name", "domain" = EXCLUDED."domain";

-- Carry forward sensible legacy Workforce grants before retiring the old permission vocabulary.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT DISTINCT rp."role_id", new_permission."id"
FROM "role_permissions" rp
JOIN "permissions" old_permission ON old_permission."id" = rp."permission_id"
JOIN (VALUES
  ('workforce.read', 'project_team.read'),
  ('workforce.assign', 'project_team.manage')
) AS mapping("old_code", "new_code") ON mapping."old_code" = old_permission."code"
JOIN "permissions" new_permission ON new_permission."code" = mapping."new_code"
ON CONFLICT DO NOTHING;

DELETE FROM "role_permissions" rp
USING "permissions" permission
WHERE rp."permission_id" = permission."id"
  AND permission."code" IN ('workforce.read', 'workforce.assign');
DELETE FROM "permissions" WHERE "code" IN ('workforce.read', 'workforce.assign');

-- Update the legacy Timesheet integrity function to consume Final Module 8 assignments.
CREATE OR REPLACE FUNCTION "module_13_validate_timesheet_entry_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    sheet_company_id UUID;
    sheet_employee_id UUID;
    sheet_period_start DATE;
    sheet_period_end DATE;
    project_company_id UUID;
    wbs_project_id UUID;
    cost_code_company_id UUID;
    cost_type_company_id UUID;
BEGIN
    SELECT "company_id", "employee_id", "period_start", "period_end"
      INTO sheet_company_id, sheet_employee_id, sheet_period_start, sheet_period_end
      FROM "timesheets" WHERE "id" = NEW."timesheet_id";

    SELECT "company_id" INTO project_company_id FROM "projects" WHERE "id" = NEW."project_id";
    SELECT "project_id" INTO wbs_project_id FROM "wbs_nodes" WHERE "id" = NEW."wbs_node_id";
    SELECT "company_id" INTO cost_code_company_id FROM "cost_codes" WHERE "id" = NEW."cost_code_id";
    SELECT "company_id" INTO cost_type_company_id FROM "cost_types" WHERE "id" = NEW."cost_type_id";

    IF sheet_company_id IS DISTINCT FROM project_company_id
       OR sheet_company_id IS DISTINCT FROM cost_code_company_id
       OR sheet_company_id IS DISTINCT FROM cost_type_company_id
       OR wbs_project_id IS DISTINCT FROM NEW."project_id" THEN
        RAISE EXCEPTION 'Timesheet entry Project and cost references must match the Timesheet Company and Project'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."work_date" < sheet_period_start OR NEW."work_date" > sheet_period_end THEN
        RAISE EXCEPTION 'Timesheet entry work date must fall inside the Timesheet period'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "project_cost_codes" mapping
         WHERE mapping."project_id" = NEW."project_id"
           AND mapping."wbs_node_id" = NEW."wbs_node_id"
           AND mapping."cost_code_id" = NEW."cost_code_id"
           AND mapping."cost_type_id" = NEW."cost_type_id"
           AND mapping."status" = 'ACTIVE'
           AND mapping."is_posting_allowed" = TRUE
    ) THEN
        RAISE EXCEPTION 'Timesheet entry cost structure must be an active posting combination for the Project'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM "project_team_assignments" assignment
         WHERE assignment."company_id" = sheet_company_id
           AND assignment."employee_id" = sheet_employee_id
           AND assignment."project_id" = NEW."project_id"
           AND assignment."status" = 'ACTIVE'
           AND assignment."from_date" <= NEW."work_date"
           AND (assignment."to_date" IS NULL OR assignment."to_date" >= NEW."work_date")
    ) THEN
        RAISE EXCEPTION 'Employee must have an active Project Team assignment for the work date and Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "workforce_assignments_scope_integrity" ON "workforce_assignments";
DROP FUNCTION IF EXISTS "module_13_validate_workforce_assignment_scope"();
DROP TABLE "workforce_assignments";
DROP TABLE "project_members";
