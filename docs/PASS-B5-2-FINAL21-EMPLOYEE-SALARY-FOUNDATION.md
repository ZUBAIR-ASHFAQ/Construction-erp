# Pass B5.2 - Final-21 Employee + Salary/Compensation Foundation

## Scope

B5.2 moves Employee master ownership out of the mixed legacy HR/Payroll surface and into Final-21 Module 3. The pass is intentionally limited to Employee identity, employment lifecycle and effective-dated compensation. Full attendance-based Payroll remains deferred until Project Team and Finance prerequisites are ready.

## Implemented

- Added the five-file backend module at `apps/api/src/modules/employees/`.
- Registered the Final-21 Employee API surface under `/api/v1/employees`.
- Added Company-scoped Employee search, create, detail, update, explicit status command and compensation command.
- Added CNIC/identity, phone and email to Employee master data.
- Added explicit `employees.read`, `employees.create`, `employees.update` and `employees.compensation.manage` permissions.
- Reused existing Employee IDs and salary history through a forward-only migration.
- Renamed the physical compensation table to `employee_compensation` and the salary column to `base_salary_or_wage`.
- Added `employee_employment_history` for append-only lifecycle history.
- Added SALARY, DAILY and HOURLY compensation inputs with effective dates and overlap prevention.
- Kept previous salary/wage/rate history immutable; a new change closes the open period and appends a new period.
- Blocked new compensation for inactive Employees while preserving historical salary and Payroll references.
- Removed active legacy `/api/v1/hr/employees*` and leave-management routes.
- Added a dedicated React Employee & Salary workspace and removed Employee/leave ownership from the legacy Payroll page.
- Kept existing Payroll and Timesheet data intact for the later Module 13 migration rather than deleting source history early.

## Deliberately deferred

- Project/stage Employee assignment migration to Final-21 Module 8.
- Attendance replacement for legacy Timesheets.
- Final `/api/v1/attendance` and `/api/v1/payroll/runs` Module 13 API surface.
- Payroll calculation rewrite using effective compensation + attendance.
- Labour-cost posting and Finance posting from finalized Payroll.
- Physical removal of legacy LeaveRequest/Timesheet/Workforce tables after their retained history is handled by later passes.

## Data-safety rule

Historical migrations are unchanged. B5.2 adds one forward migration and preserves existing Employee IDs, Payroll history and workforce source rows. Legacy `employees.base_salary` and `employees.hourly_rate` columns remain temporarily as migration compatibility fields; the Final-21 Employee runtime does not write or read them as salary authority. They can be dropped only after the later Payroll migration proves no supported upgrade path depends on them.

## Exit condition

B5.2 is complete when Final-21 Employee routes, Company scoping, salary history, employment history, duplicate protection, inactive-Employee compensation blocking, frontend access and static contract checks pass without reintroducing Leave Management or the old `/api/v1/hr/employees` route family.
