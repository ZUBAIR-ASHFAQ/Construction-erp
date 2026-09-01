# Pass B8 — Final-21 Project Team / Assignment

## Purpose

Pass B8 makes Final Module 8 the single owner of Employee-to-Project and optional Stage assignment. Project roles and allocation are operational assignment data and remain separate from global Administration RBAC roles.

## Implemented

- Added the exact five-file backend module at `apps/api/src/modules/project-team/`.
- Added `project_team_assignments` and append-only `project_team_history` through a forward-only migration.
- Added the exact Final-21 API surface: list, assign, update and explicit end command.
- Added `project_team.read` and `project_team.manage`; legacy `workforce.read` and `workforce.assign` grants are mapped forward and then retired.
- Enforced authenticated Company and allowed-Project scope in repository/service access.
- Employee, Project and optional Stage ownership is validated; the migration also enforces same-Project Stage scope at the database boundary.
- New assignments require an active same-company Employee.
- Allocation is exact decimal input greater than 0 and at most 100, and overlapping active assignments cannot take one Employee above 100% total allocation.
- Project role, allocation, Stage and effective dates can be updated without changing Employee or Project ownership.
- Ending an assignment changes status and appends history; it never deletes assignment, Timesheet or later Payroll history.
- Assignment writes are idempotent, audited and emitted through the Foundation outbox.
- Migrated useful legacy `workforce_assignments` data into Module 8.
- Migrated legacy `project_members` only when its User resolves to a same-company Employee, avoiding fabricated Employee identities.
- Removed active `ProjectMember` and `WorkforceAssignment` Prisma ownership after data migration.
- Removed the old Workforce-assignment HTTP/UI ownership from the preserved Timesheet module. Existing Timesheet validation now reads Final Module 8 assignments until the later Attendance/Payroll rewrite.
- Added the React Project Team API/hooks/workspace/page using TanStack Query plus React Hook Form/Zod for assignment creation.
- Added focused B8 Final-21 regression tests and workspace checks.

## Deliberately deferred

- The legacy Timesheet model still contains WBS/Cost Code fields. Final Module 13 Attendance & Payroll will replace that workflow in its dedicated pass; B8 changes only assignment ownership so it does not mix unrelated payroll/cost rewrites into this module.
- Employee salary/compensation remains owned by Module 3. Module 8 only assigns the Employee to a Project/Stage.
- Stage allocation is optional exactly as required; Project-level assignment remains valid.

## B8 exit condition

Module 8 is the only active owner of Employee Project/Stage assignments. Legacy User membership and Workforce assignment persistence are migrated/retired, while historical Timesheet data remains intact for the later controlled Attendance & Payroll migration.
