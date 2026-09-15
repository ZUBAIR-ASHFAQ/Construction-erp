-- Separate daily worker settlement from monthly employee payroll without rewriting historical runs.
ALTER TABLE "payroll_runs"
  ADD COLUMN "pay_cycle" VARCHAR(16) NOT NULL DEFAULT 'LEGACY';

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_pay_cycle_check"
  CHECK ("pay_cycle" IN ('DAILY', 'MONTHLY', 'LEGACY'));

CREATE INDEX "payroll_runs_company_cycle_period_idx"
  ON "payroll_runs"("company_id", "pay_cycle", "period_start", "period_end");

-- Optional contract/employment end date supports correct final-month proration.
ALTER TABLE "employees"
  ADD COLUMN "employment_end_date" DATE;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_employment_dates_check"
  CHECK ("employment_end_date" IS NULL OR "employment_end_date" >= "joining_date");
