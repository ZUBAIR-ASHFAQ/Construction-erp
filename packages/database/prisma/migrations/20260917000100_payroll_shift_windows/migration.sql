-- Add optional attendance shift times and Payroll Run time windows without rewriting historical rows.
ALTER TABLE "attendance_entries"
  ADD COLUMN "start_minute" INTEGER,
  ADD COLUMN "end_minute" INTEGER;

ALTER TABLE "attendance_entries"
  ADD CONSTRAINT "attendance_entries_shift_minutes_valid"
  CHECK (
    ("start_minute" IS NULL AND "end_minute" IS NULL)
    OR (
      "start_minute" BETWEEN 0 AND 1439
      AND "end_minute" BETWEEN 0 AND 1439
      AND "start_minute" <> "end_minute"
    )
  );

ALTER TABLE "payroll_runs"
  ADD COLUMN "from_minute" INTEGER,
  ADD COLUMN "to_minute" INTEGER;

ALTER TABLE "payroll_runs"
  ADD CONSTRAINT "payroll_runs_window_minutes_valid"
  CHECK (
    ("from_minute" IS NULL AND "to_minute" IS NULL)
    OR (
      "from_minute" BETWEEN 0 AND 1439
      AND "to_minute" BETWEEN 0 AND 1439
      AND "from_minute" <> "to_minute"
    )
  );
