-- Stage 20 / Module 14B - Payroll persistence core.
-- Implements the Pass-308 reviewed persistence amendment only: effective-dated compensation,
-- source-defined Payroll/Payslip snapshots, blocking calculation exceptions and direct Timesheet Entry source consumption.
-- Payroll formulas, public API/runtime, Finance posting, Job-Cost posting, Shift/leave policy and Timesheet-adjustment consumption remain deferred.

CREATE TABLE "employee_compensation_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "pay_type" VARCHAR(16) NOT NULL,
    "base_salary" DECIMAL(18,2),
    "hourly_rate" DECIMAL(18,4),
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_compensation_periods_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_compensation_periods_pay_type" CHECK ("pay_type" IN ('SALARY', 'HOURLY')),
    CONSTRAINT "employee_compensation_periods_shape" CHECK (
        ("pay_type" = 'SALARY' AND "base_salary" IS NOT NULL AND "hourly_rate" IS NULL)
        OR
        ("pay_type" = 'HOURLY' AND "hourly_rate" IS NOT NULL AND "base_salary" IS NULL)
    ),
    CONSTRAINT "employee_compensation_periods_date_order" CHECK (
        "effective_to" IS NULL OR "effective_to" >= "effective_from"
    )
);

CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "status" VARCHAR(32) NOT NULL,
    "gross_total" DECIMAL(18,2) NOT NULL,
    "deduction_total" DECIMAL(18,2) NOT NULL,
    "net_total" DECIMAL(18,2) NOT NULL,
    "calculated_at" TIMESTAMPTZ(6),
    "finalized_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_runs_period_order" CHECK ("period_end" >= "period_start"),
    CONSTRAINT "payroll_runs_status" CHECK ("status" IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'FINALIZED')),
    CONSTRAINT "payroll_runs_totals" CHECK ("net_total" = "gross_total" - "deduction_total"),
    CONSTRAINT "payroll_runs_calculation_state" CHECK (
        "status" = 'DRAFT' OR "calculated_at" IS NOT NULL
    ),
    CONSTRAINT "payroll_runs_finalization_state" CHECK (
        ("status" = 'FINALIZED' AND "finalized_at" IS NOT NULL)
        OR
        ("status" <> 'FINALIZED' AND "finalized_at" IS NULL)
    )
);

CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "gross_pay" DECIMAL(18,2) NOT NULL,
    "deductions" DECIMAL(18,2) NOT NULL,
    "net_pay" DECIMAL(18,2) NOT NULL,
    "file_id" UUID,
    "status" VARCHAR(32) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslips_status_not_blank" CHECK (length(btrim("status")) > 0),
    CONSTRAINT "payslips_totals" CHECK ("net_pay" = "gross_pay" - "deductions")
);

CREATE TABLE "payslip_items" (
    "id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "item_type" VARCHAR(16) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4),
    "rate" DECIMAL(18,4),
    "amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "payslip_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payslip_items_item_type" CHECK ("item_type" IN ('EARNING', 'DEDUCTION')),
    CONSTRAINT "payslip_items_code_not_blank" CHECK (length(btrim("code")) > 0),
    CONSTRAINT "payslip_items_description_not_blank" CHECK (length(btrim("description")) > 0),
    CONSTRAINT "payslip_items_amount_nonnegative" CHECK ("amount" >= 0)
);

CREATE TABLE "payroll_calculation_exceptions" (
    "id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "employee_id" UUID,
    "timesheet_entry_id" UUID,
    "reason_key" VARCHAR(120) NOT NULL,
    "message" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_calculation_exceptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payroll_calculation_exceptions_reason_not_blank" CHECK (length(btrim("reason_key")) > 0),
    CONSTRAINT "payroll_calculation_exceptions_message_not_blank" CHECK (length(btrim("message")) > 0)
);

CREATE TABLE "payroll_source_consumptions" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "timesheet_entry_id" UUID NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "payroll_source_consumptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_compensation_periods_company_employee_from_idx"
    ON "employee_compensation_periods"("company_id", "employee_id", "effective_from");
CREATE INDEX "employee_compensation_periods_employee_dates_idx"
    ON "employee_compensation_periods"("employee_id", "effective_from", "effective_to");

CREATE INDEX "payroll_runs_company_period_idx"
    ON "payroll_runs"("company_id", "period_start", "period_end");
CREATE INDEX "payroll_runs_company_status_period_idx"
    ON "payroll_runs"("company_id", "status", "period_start");

CREATE UNIQUE INDEX "payslips_run_employee_uq"
    ON "payslips"("payroll_run_id", "employee_id");
CREATE INDEX "payslips_employee_run_idx"
    ON "payslips"("employee_id", "payroll_run_id");
CREATE INDEX "payslips_file_idx"
    ON "payslips"("file_id");

CREATE INDEX "payslip_items_payslip_type_idx"
    ON "payslip_items"("payslip_id", "item_type");

CREATE INDEX "payroll_calculation_exceptions_run_created_idx"
    ON "payroll_calculation_exceptions"("payroll_run_id", "created_at");
CREATE INDEX "payroll_calculation_exceptions_employee_run_idx"
    ON "payroll_calculation_exceptions"("employee_id", "payroll_run_id");
CREATE INDEX "payroll_calculation_exceptions_timesheet_entry_idx"
    ON "payroll_calculation_exceptions"("timesheet_entry_id");

CREATE UNIQUE INDEX "payroll_source_consumptions_run_entry_uq"
    ON "payroll_source_consumptions"("payroll_run_id", "timesheet_entry_id");
CREATE UNIQUE INDEX "payroll_source_consumptions_company_entry_finalized_uq"
    ON "payroll_source_consumptions"("company_id", "timesheet_entry_id")
    WHERE "consumed_at" IS NOT NULL;
CREATE INDEX "payroll_source_consumptions_company_run_idx"
    ON "payroll_source_consumptions"("company_id", "payroll_run_id");
CREATE INDEX "payroll_source_consumptions_entry_consumed_idx"
    ON "payroll_source_consumptions"("timesheet_entry_id", "consumed_at");

ALTER TABLE "employee_compensation_periods"
    ADD CONSTRAINT "employee_compensation_periods_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "employee_compensation_periods_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_runs"
    ADD CONSTRAINT "payroll_runs_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payslips"
    ADD CONSTRAINT "payslips_payroll_run_fkey"
        FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payslips_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payslip_items"
    ADD CONSTRAINT "payslip_items_payslip_fkey"
        FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_calculation_exceptions"
    ADD CONSTRAINT "payroll_calculation_exceptions_payroll_run_fkey"
        FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_calculation_exceptions_employee_fkey"
        FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_calculation_exceptions_timesheet_entry_fkey"
        FOREIGN KEY ("timesheet_entry_id") REFERENCES "timesheet_entries"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll_source_consumptions"
    ADD CONSTRAINT "payroll_source_consumptions_company_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_source_consumptions_payroll_run_fkey"
        FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payroll_source_consumptions_timesheet_entry_fkey"
        FOREIGN KEY ("timesheet_entry_id") REFERENCES "timesheet_entries"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

-- Purpose: keep each compensation period inside the Employee Company and serialize overlap checks by Employee.
CREATE FUNCTION "module_14b_validate_compensation_period"()
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

    -- Let the foreign key report a missing Employee; this trigger owns Company/range integrity only.
    IF employee_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF employee_company_id IS DISTINCT FROM NEW."company_id" THEN
        RAISE EXCEPTION 'Compensation period Employee must belong to the same Company'
            USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM "employee_compensation_periods" existing
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

CREATE TRIGGER "employee_compensation_periods_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "employee_id", "effective_from", "effective_to"
ON "employee_compensation_periods"
FOR EACH ROW
EXECUTE FUNCTION "module_14b_validate_compensation_period"();

-- Purpose: keep the first Company-wide Payroll group free from overlapping Payroll Run periods.
CREATE FUNCTION "module_14b_validate_payroll_run_period"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    -- Lock the Company row so concurrent Payroll Run inserts serialize the overlap check.
    PERFORM 1
      FROM "companies"
     WHERE "id" = NEW."company_id"
     FOR UPDATE;

    IF EXISTS (
        SELECT 1
          FROM "payroll_runs" existing
         WHERE existing."company_id" = NEW."company_id"
           AND existing."id" <> NEW."id"
           AND existing."period_start" <= NEW."period_end"
           AND NEW."period_start" <= existing."period_end"
    ) THEN
        RAISE EXCEPTION 'Company Payroll Run periods may not overlap'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "payroll_runs_period_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "period_start", "period_end"
ON "payroll_runs"
FOR EACH ROW
EXECUTE FUNCTION "module_14b_validate_payroll_run_period"();

-- Purpose: prevent one Payroll Run from containing a Payslip for an Employee in another Company.
CREATE FUNCTION "module_14b_validate_payslip_company"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    run_company_id UUID;
    employee_company_id UUID;
BEGIN
    SELECT "company_id" INTO run_company_id
      FROM "payroll_runs"
     WHERE "id" = NEW."payroll_run_id";

    SELECT "company_id" INTO employee_company_id
      FROM "employees"
     WHERE "id" = NEW."employee_id";

    IF run_company_id IS NULL OR employee_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF run_company_id IS DISTINCT FROM employee_company_id THEN
        RAISE EXCEPTION 'Payslip Employee must belong to the Payroll Run Company'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "payslips_company_integrity"
BEFORE INSERT OR UPDATE OF "payroll_run_id", "employee_id"
ON "payslips"
FOR EACH ROW
EXECUTE FUNCTION "module_14b_validate_payslip_company"();

-- Purpose: keep optional Payroll calculation exception references inside the Payroll Run Company.
CREATE FUNCTION "module_14b_validate_calculation_exception_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    run_company_id UUID;
    employee_company_id UUID;
    entry_company_id UUID;
BEGIN
    SELECT "company_id" INTO run_company_id
      FROM "payroll_runs"
     WHERE "id" = NEW."payroll_run_id";

    IF NEW."employee_id" IS NOT NULL THEN
        SELECT "company_id" INTO employee_company_id
          FROM "employees"
         WHERE "id" = NEW."employee_id";

        IF run_company_id IS NOT NULL
           AND employee_company_id IS NOT NULL
           AND run_company_id IS DISTINCT FROM employee_company_id THEN
            RAISE EXCEPTION 'Payroll calculation exception Employee must belong to the Payroll Run Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW."timesheet_entry_id" IS NOT NULL THEN
        SELECT sheet."company_id" INTO entry_company_id
          FROM "timesheet_entries" entry
          JOIN "timesheets" sheet ON sheet."id" = entry."timesheet_id"
         WHERE entry."id" = NEW."timesheet_entry_id";

        IF run_company_id IS NOT NULL
           AND entry_company_id IS NOT NULL
           AND run_company_id IS DISTINCT FROM entry_company_id THEN
            RAISE EXCEPTION 'Payroll calculation exception Timesheet Entry must belong to the Payroll Run Company'
                USING ERRCODE = '23514';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "payroll_calculation_exceptions_scope_integrity"
BEFORE INSERT OR UPDATE OF "payroll_run_id", "employee_id", "timesheet_entry_id"
ON "payroll_calculation_exceptions"
FOR EACH ROW
EXECUTE FUNCTION "module_14b_validate_calculation_exception_scope"();

-- Purpose: enforce Company, approved-Timesheet and Payroll-period scope for calculated Workforce source membership.
CREATE FUNCTION "module_14b_validate_source_consumption_scope"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    run_company_id UUID;
    run_period_start DATE;
    run_period_end DATE;
    entry_company_id UUID;
    entry_work_date DATE;
    timesheet_status VARCHAR(32);
BEGIN
    SELECT "company_id", "period_start", "period_end"
      INTO run_company_id, run_period_start, run_period_end
      FROM "payroll_runs"
     WHERE "id" = NEW."payroll_run_id";

    SELECT sheet."company_id", entry."work_date", sheet."status"
      INTO entry_company_id, entry_work_date, timesheet_status
      FROM "timesheet_entries" entry
      JOIN "timesheets" sheet ON sheet."id" = entry."timesheet_id"
     WHERE entry."id" = NEW."timesheet_entry_id";

    IF run_company_id IS NULL OR entry_company_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW."company_id" IS DISTINCT FROM run_company_id
       OR entry_company_id IS DISTINCT FROM run_company_id THEN
        RAISE EXCEPTION 'Payroll source consumption must stay inside the Payroll Run Company'
            USING ERRCODE = '23514';
    END IF;

    IF entry_work_date < run_period_start OR entry_work_date > run_period_end THEN
        RAISE EXCEPTION 'Payroll source Timesheet Entry must fall inside the Payroll Run period'
            USING ERRCODE = '23514';
    END IF;

    IF timesheet_status IS DISTINCT FROM 'APPROVED' THEN
        RAISE EXCEPTION 'Payroll source Timesheet Entry must belong to an APPROVED Timesheet'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "payroll_source_consumptions_scope_integrity"
BEFORE INSERT OR UPDATE OF "company_id", "payroll_run_id", "timesheet_entry_id"
ON "payroll_source_consumptions"
FOR EACH ROW
EXECUTE FUNCTION "module_14b_validate_source_consumption_scope"();
