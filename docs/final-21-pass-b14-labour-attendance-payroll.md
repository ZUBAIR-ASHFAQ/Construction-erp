# Final-21 Pass B14 — Labour / Attendance & Payroll

## Purpose

Pass B14 aligns Module 13 Labour / Attendance & Payroll with the Final 21-module Construction ERP contract. Employee identity and effective compensation remain owned by Module 3, Project/Stage assignment remains owned by Module 8, and this module now owns attendance, payroll calculation/finalization, Project/Stage labour cost and Finance posting.

## Implemented

- Replaced the separate legacy `hr-payroll` and `workforce-timesheets` runtimes with one required five-file `labour-payroll` backend.
- Added `attendance_entries`, final `payroll_runs`, `payroll_lines` and `payslips` persistence.
- Migrated useful legacy Timesheet and Payroll history forward before dropping obsolete active Timesheet/Payroll helper tables.
- Attendance validates the Employee, allowed Project, optional Stage and an active Project Team assignment covering the work date.
- Enforced the one Employee/Project/work-date attendance policy and blocked correction after finalized Payroll consumes the period.
- Payroll calculation reads PRESENT attendance and the effective Employee compensation record for each work date.
- Supports salary, daily-wage and hourly compensation using exact decimal/integer arithmetic rather than floating-point money calculations.
- Fixed daily/monthly pay is allocated deterministically across the Employee's Project/Stage attendance destinations for the period.
- Payroll finalization re-calculates and verifies the persisted draft before posting so stale calculated data cannot be finalized silently.
- Finalization posts source-keyed `labour` / `security` actual costs to Module 9 and one balanced source journal to Module 18 in the same transaction.
- Added basic generated payslip metadata without duplicating Document storage ownership.
- Finalized Payroll and its lines/payslips are immutable; later correction must use an adjustment/reversal Payroll run rather than silent mutation.
- Added Final-21 permissions, stable error codes, audit entries, outbox events and idempotent write commands.
- Added one combined React Attendance & Payroll workspace with Employee, Project and Stage lookups, calculation preview, finalization and Project/Stage labour-cost visibility.
- Removed obsolete Module 13/14A/14B verifier scripts, evidence folders, static/integration/e2e tests and the old Pass-373 lifecycle test instead of carrying duplicate workflows.
- Historical migrations remain unchanged; B14 uses one forward migration.
- Added short purpose comments to changed named functions and methods.

## Exact public API

- `GET /api/v1/attendance`
- `POST /api/v1/attendance`
- `PATCH /api/v1/attendance/:id`
- `GET /api/v1/payroll/runs`
- `POST /api/v1/payroll/runs`
- `POST /api/v1/payroll/runs/:id/calculate`
- `POST /api/v1/payroll/runs/:id/finalize`
- `GET /api/v1/payroll/runs/:id`

No generic attendance/payroll CRUD, Timesheet, leave-request or self-payslip permission API is carried forward.

## Salary and posting rules

- Employee salary/compensation history is effective-dated in Module 3 and is never overwritten by Payroll.
- Attendance belongs to a valid active Employee Project/Stage assignment unless a later explicitly approved exception policy is added.
- Payroll money uses exact decimal arithmetic.
- Finalized Payroll periods cannot overlap.
- Finalized Payroll is immutable.
- One finalized run posts deterministic source keys to Project/Stage actual cost and Finance so retries cannot double-post.
- Employee cash payment is not invented here: B14 posts the salary payable/accounting effect required by the current Finance contract; later cash/bank settlement should use the Finance-owned payment workflow when implemented/connected.

## Verification target

Pass B14 must pass:

- B14 Labour/Payroll regression tests.
- Existing Final-21 regression suite.
- Workspace validation.
- Legacy cleanup manifest regeneration/check.
- Migration checksum and gate policy.
- TypeScript syntax transpilation for changed production files.
- ZIP integrity verification.

Live clean/previous-schema migration execution still requires a disposable PostgreSQL `MIGRATION_TEST_DATABASE_URL` and explicit destructive-test confirmation.
