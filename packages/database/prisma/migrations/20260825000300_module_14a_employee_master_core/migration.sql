-- Stage 18 / Module 14A - Employee Master and leave-request foundation.
-- Creates exactly the two reviewed Gate-A persistence resources; payroll/payslip persistence remains deferred to Module 14B.
-- Employee lifecycle vocabularies, compensation history, leave balances/accruals and leave approval APIs are intentionally not invented.

CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_no" VARCHAR(100) NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "department" VARCHAR(160) NOT NULL,
    "job_title" VARCHAR(160) NOT NULL,
    "employment_type" VARCHAR(64) NOT NULL,
    "join_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "base_salary" DECIMAL(18,2),
    "hourly_rate" DECIMAL(18,4),

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employees_employee_no_not_blank" CHECK (length(btrim("employee_no")) > 0),
    CONSTRAINT "employees_name_not_blank" CHECK (length(btrim("name")) > 0),
    CONSTRAINT "employees_department_not_blank" CHECK (length(btrim("department")) > 0),
    CONSTRAINT "employees_job_title_not_blank" CHECK (length(btrim("job_title")) > 0),
    CONSTRAINT "employees_employment_type_not_blank" CHECK (length(btrim("employment_type")) > 0),
    CONSTRAINT "employees_status_not_blank" CHECK (length(btrim("status")) > 0)
);

CREATE TABLE "leave_requests" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type" VARCHAR(100) NOT NULL,
    "from_date" DATE NOT NULL,
    "to_date" DATE NOT NULL,
    "days" DECIMAL(18,4) NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "approved_by" UUID,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_requests_leave_type_not_blank" CHECK (length(btrim("leave_type")) > 0),
    CONSTRAINT "leave_requests_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "leave_requests_date_order" CHECK ("to_date" >= "from_date")
);

-- Employee number uniqueness is explicitly required inside the Company.
CREATE UNIQUE INDEX "employees_company_employee_no_uq"
    ON "employees"("company_id", "employee_no");
CREATE INDEX "employees_company_status_idx"
    ON "employees"("company_id", "status");
CREATE INDEX "employees_company_name_idx"
    ON "employees"("company_id", "name");
CREATE INDEX "employees_user_idx"
    ON "employees"("user_id");

CREATE INDEX "leave_requests_employee_dates_idx"
    ON "leave_requests"("employee_id", "from_date", "to_date");
CREATE INDEX "leave_requests_employee_status_from_idx"
    ON "leave_requests"("employee_id", "status", "from_date");
CREATE INDEX "leave_requests_approved_by_idx"
    ON "leave_requests"("approved_by");

ALTER TABLE "employees"
    ADD CONSTRAINT "employees_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "employees_user_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "leave_requests_approved_by_fkey"
        FOREIGN KEY ("approved_by") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: prevent an optional Employee login link from crossing the authenticated Company boundary at persistence level.
CREATE FUNCTION "module_14a_validate_employee_user_company"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    linked_user_company_id UUID;
BEGIN
    IF NEW."user_id" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "company_id" INTO linked_user_company_id
      FROM "users"
     WHERE "id" = NEW."user_id";

    -- Let the foreign key report a missing User; this trigger owns only same-Company integrity.
    IF linked_user_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF linked_user_company_id IS DISTINCT FROM NEW."company_id" THEN
        RAISE EXCEPTION 'Employee login User must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "employees_user_company_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "user_id"
ON "employees"
FOR EACH ROW
EXECUTE FUNCTION "module_14a_validate_employee_user_company"();

-- Purpose: keep a future server-owned leave approver inside the Employee Company without adding an invented company_id column.
CREATE FUNCTION "module_14a_validate_leave_approver_company"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    employee_company_id UUID;
    approver_company_id UUID;
BEGIN
    IF NEW."approved_by" IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT "company_id" INTO employee_company_id
      FROM "employees"
     WHERE "id" = NEW."employee_id";

    SELECT "company_id" INTO approver_company_id
      FROM "users"
     WHERE "id" = NEW."approved_by";

    -- Leave missing Employee/User identities to their foreign keys; this trigger only protects tenant scope.
    IF employee_company_id IS NULL OR approver_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF employee_company_id IS DISTINCT FROM approver_company_id THEN
        RAISE EXCEPTION 'Leave approver must belong to the Employee Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "leave_requests_approver_company_integrity"
BEFORE INSERT OR UPDATE OF "employee_id", "approved_by"
ON "leave_requests"
FOR EACH ROW
EXECUTE FUNCTION "module_14a_validate_leave_approver_company"();
