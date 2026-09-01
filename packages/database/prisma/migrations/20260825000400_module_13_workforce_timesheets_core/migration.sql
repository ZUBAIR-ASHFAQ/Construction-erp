-- Stage 19 / Module 13 - Workforce & Timesheets core persistence.
-- Creates exactly the four reviewed Module-13 resources and direct Module-14A Employee relationships.
-- Status vocabularies, shift, hour-limit values, Payroll locks and Job-Cost/Payroll posting keys are intentionally not invented.

CREATE TABLE "workforce_assignments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "trade_role" VARCHAR(160) NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "workforce_assignments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "workforce_assignments_trade_role_not_blank" CHECK (length(btrim("trade_role")) > 0),
    CONSTRAINT "workforce_assignments_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "workforce_assignments_date_order" CHECK ("to_date" IS NULL OR "to_date" >= "from_date")
);

CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheets_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "timesheets_period_order" CHECK ("period_end" >= "period_start")
);

CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "project_id" UUID NOT NULL,
    "wbs_node_id" UUID NOT NULL,
    "cost_code_id" UUID NOT NULL,
    "cost_type_id" UUID NOT NULL,
    "regular_hours" DECIMAL(18,4) NOT NULL,
    "overtime_hours" DECIMAL(18,4) NOT NULL,
    "remarks" TEXT NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_entries_regular_hours_nonnegative" CHECK ("regular_hours" >= 0),
    CONSTRAINT "timesheet_entries_overtime_hours_nonnegative" CHECK ("overtime_hours" >= 0)
);

CREATE TABLE "timesheet_adjustments" (
    "id" UUID NOT NULL,
    "timesheet_id" UUID NOT NULL,
    "original_entry_id" UUID NOT NULL,
    "adjustment_hours" DECIMAL(18,4) NOT NULL,
    "reason" TEXT NOT NULL,
    "approved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "timesheet_adjustments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "timesheet_adjustments_reason_not_blank" CHECK (length(btrim("reason")) > 0)
);

CREATE INDEX "workforce_assignments_company_employee_dates_idx"
    ON "workforce_assignments"("company_id", "employee_id", "from_date", "to_date");
CREATE INDEX "workforce_assignments_company_project_dates_idx"
    ON "workforce_assignments"("company_id", "project_id", "from_date", "to_date");
CREATE INDEX "workforce_assignments_employee_project_status_idx"
    ON "workforce_assignments"("employee_id", "project_id", "status");

CREATE INDEX "timesheets_company_employee_period_idx"
    ON "timesheets"("company_id", "employee_id", "period_start", "period_end");
CREATE INDEX "timesheets_company_status_period_idx"
    ON "timesheets"("company_id", "status", "period_start");

CREATE INDEX "timesheet_entries_timesheet_date_idx"
    ON "timesheet_entries"("timesheet_id", "work_date");
CREATE INDEX "timesheet_entries_project_date_idx"
    ON "timesheet_entries"("project_id", "work_date");
CREATE INDEX "timesheet_entries_cost_structure_idx"
    ON "timesheet_entries"("wbs_node_id", "cost_code_id", "cost_type_id");

CREATE INDEX "timesheet_adjustments_timesheet_created_idx"
    ON "timesheet_adjustments"("timesheet_id", "created_at");
CREATE INDEX "timesheet_adjustments_entry_created_idx"
    ON "timesheet_adjustments"("original_entry_id", "created_at");
CREATE INDEX "timesheet_adjustments_approved_by_idx"
    ON "timesheet_adjustments"("approved_by");

ALTER TABLE "workforce_assignments"
    ADD CONSTRAINT "workforce_assignments_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "workforce_assignments_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "workforce_assignments_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timesheets"
    ADD CONSTRAINT "timesheets_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheets_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timesheet_entries"
    ADD CONSTRAINT "timesheet_entries_timesheet_fkey"
        FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_entries_project_fkey"
        FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_entries_wbs_node_fkey"
        FOREIGN KEY ("wbs_node_id") REFERENCES "wbs_nodes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_entries_cost_code_fkey"
        FOREIGN KEY ("cost_code_id") REFERENCES "cost_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_entries_cost_type_fkey"
        FOREIGN KEY ("cost_type_id") REFERENCES "cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "timesheet_adjustments"
    ADD CONSTRAINT "timesheet_adjustments_timesheet_fkey"
        FOREIGN KEY ("timesheet_id") REFERENCES "timesheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_adjustments_original_entry_fkey"
        FOREIGN KEY ("original_entry_id") REFERENCES "timesheet_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "timesheet_adjustments_approved_by_fkey"
        FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: enforce same-Company Employee/Project ownership for Workforce assignments.
CREATE FUNCTION "module_13_validate_workforce_assignment_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    employee_company_id UUID;
    project_company_id UUID;
BEGIN
    SELECT "company_id" INTO employee_company_id FROM "employees" WHERE "id" = NEW."employee_id";
    SELECT "company_id" INTO project_company_id FROM "projects" WHERE "id" = NEW."project_id";

    IF NEW."company_id" IS DISTINCT FROM employee_company_id
       OR NEW."company_id" IS DISTINCT FROM project_company_id THEN
        RAISE EXCEPTION 'Workforce assignment Company, Employee and Project must match'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "workforce_assignments_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "employee_id", "project_id"
ON "workforce_assignments"
FOR EACH ROW
EXECUTE FUNCTION "module_13_validate_workforce_assignment_scope"();

-- Purpose: enforce same-Company Employee ownership for Timesheet headers.
CREATE FUNCTION "module_13_validate_timesheet_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    employee_company_id UUID;
BEGIN
    SELECT "company_id" INTO employee_company_id FROM "employees" WHERE "id" = NEW."employee_id";

    IF NEW."company_id" IS DISTINCT FROM employee_company_id THEN
        RAISE EXCEPTION 'Timesheet Company and Employee must match'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "timesheets_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "employee_id"
ON "timesheets"
FOR EACH ROW
EXECUTE FUNCTION "module_13_validate_timesheet_scope"();

-- Purpose: keep each Timesheet entry inside its header period, Company, date-bounded Project assignment and valid Module-6 posting combination.
CREATE FUNCTION "module_13_validate_timesheet_entry_scope"()
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
        SELECT 1 FROM "workforce_assignments" assignment
         WHERE assignment."company_id" = sheet_company_id
           AND assignment."employee_id" = sheet_employee_id
           AND assignment."project_id" = NEW."project_id"
           AND assignment."from_date" <= NEW."work_date"
           AND (assignment."to_date" IS NULL OR assignment."to_date" >= NEW."work_date")
    ) THEN
        RAISE EXCEPTION 'Employee must have an active Workforce assignment for the work date and Project'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "timesheet_entries_scope_integrity"
BEFORE INSERT OR UPDATE OF "timesheet_id", "work_date", "project_id", "wbs_node_id", "cost_code_id", "cost_type_id"
ON "timesheet_entries"
FOR EACH ROW
EXECUTE FUNCTION "module_13_validate_timesheet_entry_scope"();

-- Purpose: keep append-only adjustment references and optional approver inside the approved Timesheet Company.
CREATE FUNCTION "module_13_validate_timesheet_adjustment_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    sheet_company_id UUID;
    entry_timesheet_id UUID;
    approver_company_id UUID;
BEGIN
    SELECT "company_id" INTO sheet_company_id FROM "timesheets" WHERE "id" = NEW."timesheet_id";
    SELECT "timesheet_id" INTO entry_timesheet_id FROM "timesheet_entries" WHERE "id" = NEW."original_entry_id";

    IF entry_timesheet_id IS DISTINCT FROM NEW."timesheet_id" THEN
        RAISE EXCEPTION 'Timesheet adjustment original entry must belong to the Timesheet'
            USING ERRCODE = '23514';
    END IF;

    IF NEW."approved_by" IS NOT NULL THEN
        SELECT "company_id" INTO approver_company_id FROM "users" WHERE "id" = NEW."approved_by";
        IF approver_company_id IS DISTINCT FROM sheet_company_id THEN
            RAISE EXCEPTION 'Timesheet adjustment approver must belong to the Timesheet Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "timesheet_adjustments_scope_integrity"
BEFORE INSERT OR UPDATE OF "timesheet_id", "original_entry_id", "approved_by"
ON "timesheet_adjustments"
FOR EACH ROW
EXECUTE FUNCTION "module_13_validate_timesheet_adjustment_scope"();
