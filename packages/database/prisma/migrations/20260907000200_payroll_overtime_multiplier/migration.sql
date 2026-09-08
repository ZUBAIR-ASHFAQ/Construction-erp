-- Add an explicit per-run overtime multiplier so hourly overtime is never silently paid at the regular rate.
ALTER TABLE "payroll_runs"
  ADD COLUMN "overtime_multiplier" DECIMAL(8,4);

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_overtime_multiplier_positive_ck"
  CHECK ("overtime_multiplier" IS NULL OR "overtime_multiplier" >= 1);
