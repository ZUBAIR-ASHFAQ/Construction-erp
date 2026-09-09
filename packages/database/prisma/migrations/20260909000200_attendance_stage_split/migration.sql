-- Allow one Employee to split a Project work day across distinct Stages while preserving one row per destination.
DROP INDEX "attendance_entries_company_employee_project_date_uq";

CREATE UNIQUE INDEX "attendance_entries_company_employee_project_stage_date_uq"
  ON "attendance_entries"("company_id", "employee_id", "project_id", "stage_id", "work_date") NULLS NOT DISTINCT;
