# Pass B5.1 - Final-21 HR / Employee / Payroll Baseline Audit

## Purpose

Pass B5.1 is a **non-destructive baseline and migration-planning pass**. It does not split the current `hr-payroll` and `workforce-timesheets` runtime yet. Its job is to prove what exists, identify what must move/delete in the next implementation passes, preserve current employee/salary/payroll data sources, and avoid destructive schema changes before the replacement modules exist.

Controlling requirements used for this audit:

- Final 21 Module 3 - Employee & Labour Management (requirements pages 17-19).
- Final 21 Module 8 - Project Team / Assignment (requirements pages 35-37).
- Final 21 Module 13 - Labour / Attendance & Payroll (requirements pages 54-57).
- Final release gate: no excluded workflow/table may remain active, and posted/history data must be preserved through controlled migration/reversal rules (requirements page 88).

## Baseline verification

The B4 archive was checked before any B5.2 restructuring.

| Check | Result | Notes |
| --- | --- | --- |
| `node scripts/check-workspace.mjs` | PASS | Workspace structure and required stack are valid. |
| `node --test tests/final-21-*.test.mjs` | PASS | 78/78 Final-21 static tests pass. |
| `node scripts/final-21/build-legacy-cleanup-manifest.mjs --check` | PASS | Existing Final-21 cleanup manifest is current. |
| Historical HR/payroll static pack | MIXED | 302 pass, 11 fail, 25 skip. The failing assertions are old Stage/Pass exact-contract expectations and are not treated as the Final-21 controlling acceptance suite. |
| Prisma validate / TypeScript / full build | NOT RUN | The uploaded archive has no installed dependencies and the dependency install attempt exceeded the execution window. No claim is made that these gates pass in B5.1. They remain mandatory before B5 completion. |

## Current runtime ownership

### Backend

Current production registration still uses:

- `apps/api/src/modules/hr-payroll/`
- `apps/api/src/modules/workforce-timesheets/`

`apps/api/src/app.ts` registers both modules. This is a transitional ownership shape and must not be treated as the final Module 3 / Module 8 / Module 13 architecture.

### Frontend

Current production features still use:

- `apps/web/src/features/hr-payroll/`
- `apps/web/src/features/workforce-timesheets/`

The employee master, salary/compensation, leave, payroll, workforce assignment and timesheet screens are therefore mixed across legacy feature boundaries.

## Current database source inventory to preserve before migration

These current models contain data that must be reviewed before B5.2/B8/B14 delete or rename anything:

### Employee / salary source data

- `Employee`
- `EmployeeCompensationPeriod`

### Payroll source data

- `PayrollRun`
- `Payslip`
- `PayslipItem`
- `PayrollCalculationException`
- `PayrollSourceConsumption`

### Legacy workforce/time source data

- `WorkforceAssignment`
- `Timesheet`
- `TimesheetEntry`
- `TimesheetAdjustment`

### Out-of-scope HR data

- `LeaveRequest`

B5.1 deliberately does **not** drop or rewrite these tables. Historical migrations are also left unchanged.

## Final Module 3 gap analysis

Final Module 3 requires a dedicated Employee & Labour master with employee identity, status, effective-dated compensation and employment history.

| Final requirement | Current state | B5.2 action |
| --- | --- | --- |
| Dedicated `employees/` five-file backend module | Missing | Create final module and move employee-only logic. |
| `employees` master | Exists but field contract differs | Migrate/align without losing employee IDs/history. |
| `employee_compensation` | Similar data exists as `employee_compensation_periods` | Migrate/rename/align effective-dated salary authority. |
| `employee_employment_history` | Missing | Add with a forward migration. |
| `cnic_or_id` | Missing from current Employee | Add nullable/safe migration policy as appropriate. |
| `phone` | Missing from current Employee | Add. |
| `email` | Missing from current Employee | Add nullable normalized field. |
| Final `employee_type` terminology | Current `employment_type` | Align boundary/model naming carefully. |
| Final `joining_date` terminology | Current `join_date` | Align boundary/model naming carefully. |
| Employee number company uniqueness | Present | Keep. |
| Effective compensation history | Present in legacy compensation periods | Preserve and move to Module 3. |
| Employment status history | Missing | Add through `employee_employment_history`. |
| Referenced employees are deactivated, not deleted | Current activate/deactivate exists | Preserve rule under final status command. |

## Current Employee API mismatch

Current Employee endpoints:

- `GET /api/v1/hr/employees`
- `POST /api/v1/hr/employees`
- `PATCH /api/v1/hr/employees/:id`
- `POST /api/v1/hr/employees/:id/activate`
- `POST /api/v1/hr/employees/:id/deactivate`
- `GET /api/v1/hr/employees/:id/compensation-periods`
- `POST /api/v1/hr/employees/:id/compensation-periods`

Final Module 3 target:

- `GET /api/v1/employees`
- `POST /api/v1/employees`
- `GET /api/v1/employees/:id`
- `PATCH /api/v1/employees/:id`
- `POST /api/v1/employees/:id/compensation`
- `POST /api/v1/employees/:id/status`

Key gaps:

1. `/hr` prefix is not final.
2. Employee detail endpoint is missing.
3. Activate/deactivate aliases must become the final status command.
4. Compensation route and response ownership must move to Module 3.
5. Salary history must remain effective-dated and append-oriented rather than overwriting prior compensation.

## HR scope cleanup identified for B5.2

`LeaveRequest` and all leave routes/service/repository/UI behavior are outside the Final-21 Module 3 contract.

Delete **only after** the replacement Employee module is working and data retention requirements have been confirmed:

- leave request schema/API functions
- leave repository functions
- leave service functions
- leave UI/hooks
- leave permissions/events no longer needed by the final system
- active `LeaveRequest` model/table through a forward migration when safe

B5.1 does not delete this data.

## Salary / compensation findings

The existing code already has useful effective-dated compensation logic that should be **moved and simplified**, not rewritten from scratch.

Reusable concepts:

- company-scoped Employee lookup
- employee number duplicate prevention
- effective compensation periods
- salary versus hourly pay types
- decimal-safe salary/hourly values
- compensation period overlap/closure handling
- compensation history readback

Required B5.2 corrections:

- make Module 3 the owner of compensation history
- remove duplicate current salary authority from the Employee master after migration is safe
- expose final `/employees/:id/compensation` command
- keep historical compensation immutable/effective-dated
- add employment history
- do not expose salary values through generic employee list responses unless permission policy explicitly allows it

## Project assignment finding

Current `WorkforceAssignment` belongs to the old workforce/timesheet implementation. Final assignment ownership belongs to **Module 8 Project Team / Assignment**, not Module 3 or Module 13.

Therefore:

- do not delete current assignment rows in B5.2
- do not move assignment ownership into the new Employee module
- migrate reusable assignment data later in B8 to `project_team_assignments`
- add optional stage and allocation percent in B8

## Attendance / payroll finding

Current payroll reads approved `TimesheetEntry` rows and contains WBS/Cost Code/Cost Type coupling. Final Module 13 requires `attendance_entries` and validates attendance against active project/team assignment.

Current legacy payroll endpoints are under `/api/v1/hr/payroll-runs` and include a submit workflow. Final Module 13 target is:

- `GET /api/v1/attendance`
- `POST /api/v1/attendance`
- `PATCH /api/v1/attendance/:id`
- `GET /api/v1/payroll/runs`
- `POST /api/v1/payroll/runs`
- `POST /api/v1/payroll/runs/:id/calculate`
- `POST /api/v1/payroll/runs/:id/finalize`
- `GET /api/v1/payroll/runs/:id`

B5.2 must **not** rewrite the payroll engine yet. Payroll moves after Project Team and Finance prerequisites are available. The current Payroll/Timesheet source rows stay intact until B14 migration.

## Service / repository observations

### Reusable Module 3 logic

- list employees
- find employee by ID/number
- create/update employee
- employee status change
- compensation history read/write
- effective-date and overlap checks
- same-company user/employee checks where still relevant

### Delete from Module 3 scope

- leave creation/list/approval/rejection
- payroll run lifecycle/calculation
- payslip logic
- timesheet source consumption

### Move later to Module 13

- payroll run persistence
- payroll calculation snapshot
- payslips
- payroll calculation exceptions if still needed after simplification
- source idempotency/consumption logic that remains relevant to attendance-based payroll

### Move later to Module 8

- project workforce assignments

## Code-quality baseline

The current HR/payroll and workforce/timesheet source generally already uses short purpose comments on named functions and class methods. B5.2 must preserve this standard while simplifying ownership.

Rules for the next implementation:

1. Keep each backend module to the required five files.
2. Prefer direct repository/service functions over managers, factories, command buses or duplicate helpers.
3. Keep one business rule in one owner; do not duplicate salary or assignment validation across modules.
4. Add a short purpose comment above every named function/method.
5. Preserve historical migrations; use new forward migrations only.
6. Move useful data/logic first, prove the replacement, then delete obsolete code.

## B5.1 exit decision

**B5.1 is complete as a baseline/audit pass.**

No production runtime or database migration was intentionally changed in this pass. The next implementation pass is **B5.2 - create the final Employee + Salary/Compensation module**, migrate reusable employee/compensation logic into it, add employment history, expose the final Employee API surface, and only then remove the legacy Employee/leave ownership from `hr-payroll`.
