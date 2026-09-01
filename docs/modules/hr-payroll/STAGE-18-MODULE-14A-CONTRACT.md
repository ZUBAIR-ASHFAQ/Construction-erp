# Stage 18 — Module 14A Employee Master Contract

## Purpose

Stage 18 freezes the executable **Module 14A — Employee Master** boundary before HR/Payroll Prisma models, migrations, backend runtime code or React code are generated.

`14A` is an implementation gate inside **Module 14 — HR & Payroll**. It is not a new business module.

The corrected dependency-aware order is:

```text
Stage 17  Module 12 - Equipment Management
Stage 18  Module 14A - Employee Master
Stage 19  Module 13 - Workforce & Timesheets
Stage 20  Module 14B - Payroll Completion
Stage 21  Module 21 - Project Scheduling
...
Stage 27  Cross-module Integration Completion
Stage 28  Module 23 - Reports & Analytics
Stage 29  Module 1 - Dashboard
```

Part I is authoritative for generation order, hard dependencies, ownership and the 14A/14B split. Appendix A remains authoritative for the final Module-14 workflow, fields, routes, permissions, errors, events and UI unless Part I explicitly changes when those capabilities become executable.

## Stage prerequisite

The direct Stage-18 runtime handoff is genuine Stage-17 live acceptance:

```text
STAGE_17_ACCEPTED_READY_FOR_STAGE_18
```

The Module-14A contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-18 production runtime activation or deployment.

The corrected hard prerequisite for **14A** is exactly:

```text
Module 24A - Users/RBAC Core
```

The complete Appendix-A Module-14 dependency statement also names Workforce and Finance because it describes final HR & Payroll. Part I supersedes that ordering for Gate A: Module 13 Workforce is a **downstream consumer of 14A**, and payroll completion waits until Stage 20.

Module 18 Document Management, Module 22 Approval Workflows, Module 13 Workforce & Timesheets and Module 15A Finance Core are therefore **not hard prerequisites for the Stage-18 Employee Master persistence/API boundary**. They become relevant to the reviewed payroll/payslip/approval completion gate as specified by Part I.

## 14A / 14B ownership split

### Owned now by Module 14A

Stage 18 owns exactly these two source-defined persistence resources:

```text
employees
leave_requests
```

Stage 18 owns only the corrected Gate-A capabilities:

```text
employee identity
optional login-user linkage
employment/profile details
base salary / hourly-rate compensation inputs
leave-request foundation
```

### Deferred to Module 14B

The following source-defined Module-14 tables remain deferred until Stage 20:

```text
payroll_runs
payslips
payslip_items
```

The following workflows remain deferred to Module 14B:

```text
payroll-run creation
approved timesheet/overtime import
payroll calculation/recalculation
payroll exception review
payroll approval/finalization
payslip publication/readback
Finance payroll journal posting
labor-cost posting from finalized payroll
```

Stage 18 must not create placeholder payroll tables, payroll status rows, accounting adapters or payslip storage merely because Appendix A describes the complete final Module-14 shape.

## Employee persistence boundary

The source-defined `employees` fields are:

```text
id
company_id
employee_no
user_id nullable
name
department
job_title
employment_type
join_date
status
base_salary nullable
hourly_rate nullable
```

Required Stage-18 meaning:

- every Employee belongs to one Foundation Company;
- `employee_no` is unique inside the Company;
- `user_id`, when present, references the existing Module-24A user identity;
- an optional login-user link must not bypass Company isolation;
- browser requests never supply authoritative `companyId`, actor identity, permissions or tenant scope;
- salary/rate values use DECIMAL/NUMERIC persistence and precision-safe transport;
- `status` remains server-controlled unless an explicitly reviewed request field is allowed by the final schema pass;
- Employee history must not be destroyed merely to change current profile information;
- Stage 19 Workforce must use direct foreign keys from `workforce_assignments.employee_id` and `timesheets.employee_id` to this Employee master.

The source says an employee may be linked to an optional login user but does not state whether one User may link to only one Employee. Stage 18 does **not** invent a one-to-one uniqueness rule until that policy is explicitly supported.

The source also does not enumerate public `employment_type` or Employee `status` token vocabularies. The contract freeze therefore does not invent enum values.

## Employment and compensation boundary

Part I says Gate A delivers **employment details and compensation inputs**. Appendix A stores those inputs directly on `employees` through:

```text
department
job_title
employment_type
join_date
base_salary nullable
hourly_rate nullable
```

However, the full workflow also refers to:

```text
department/trade
pay type
approved compensation components
```

and validation says compensation effective dates are explicit.

The source table inventory defines no separate:

```text
departments
trades
employee_compensation
compensation_components
salary_history
pay_rate_history
```

and no `trade`, `pay_type`, compensation-effective-date or compensation-approval column is defined on `employees`.

Stage 18 therefore freezes only the source-defined Employee columns. It must **not invent extra HR master tables or columns** to make the prose workflow look more complete. The missing trade/pay-type/component/effective-date history contract remains explicit for later reconciliation.

Sensitive salary data has stricter permissions than general employee profile data according to the source. But the reviewed permission vocabulary provides only `employees.read` and `employees.manage`; it does not define a separate compensation-read or compensation-manage permission. Later API/React passes must not silently invent `employees.salary.read` or similar permission codes.

## Leave-request persistence boundary

The source-defined `leave_requests` fields are:

```text
id
employee_id
leave_type
from_date
to_date
days
status
approved_by nullable
```

Required Stage-18 meaning:

- every leave request belongs to one Employee;
- Employee Company ownership is the Company authority for the leave request;
- `approved_by`, when present, is a server-controlled Module-24A user identity and must belong to an authorized actor context;
- dates are normalized and `to_date` cannot precede `from_date`;
- `days` must be represented without unnecessary binary-floating loss if fractional leave is supported;
- leave lifecycle state is server-controlled;
- Company isolation applies through the Employee relationship.

The source does **not** define:

- leave-type master data;
- leave balance/accrual tables;
- half-day/hourly leave rules;
- holiday/weekend calculation rules;
- overlapping-leave rules;
- exact `days` calculation/rounding authority;
- leave status token vocabulary.

Stage 18 records these as source-contract gaps rather than inventing an advanced HR/leave suite.

## Exact reviewed Stage-18 API surface

Appendix A defines eight final Module-14 operations. The controlling 14A/14B split activates only the four operations that do not depend on payroll completion:

```text
GET   /api/v1/hr/employees
POST  /api/v1/hr/employees
PATCH /api/v1/hr/employees/:id
POST  /api/v1/hr/leave-requests
```

These remain deferred to Module 14B:

```text
POST /api/v1/hr/payroll-runs
POST /api/v1/hr/payroll-runs/:id/calculate
POST /api/v1/hr/payroll-runs/:id/finalize
GET  /api/v1/hr/payslips/:id
```

Stage 18 must not add generic or undocumented HR endpoints such as:

```text
GET    /api/v1/hr/employees/:id
DELETE /api/v1/hr/employees/:id
GET    /api/v1/hr/leave-requests
GET    /api/v1/hr/leave-requests/:id
POST   /api/v1/hr/leave-requests/:id/approve
POST   /api/v1/hr/leave-requests/:id/reject
GET    /api/v1/hr/compensation
POST   /api/v1/hr/compensation
```

unless the controlling source contract is explicitly amended.

## Leave workflow gap kept explicit

The source workflow says users **record/approve leave requests** and the permission vocabulary includes:

```text
leave.read
leave.approve
```

The source-defined event inventory also includes:

```text
leave.approved
```

But the reviewed route table contains only:

```text
POST /api/v1/hr/leave-requests
```

There is no leave-list/detail route and no approve/reject command.

Therefore Stage 18 does **not** invent a leave queue API or approval command. `leave.read`, `leave.approve` and `leave.approved` remain source-defined Gate-A vocabulary whose executable route mapping is unresolved. No fake Module-22 approval dependency is introduced to hide this gap.

The source also defines no dedicated `leave.create` permission, so the exact authorization for `POST /hr/leave-requests` is unresolved. A later route/service pass must explicitly document the narrowest approved mapping rather than silently treating `leave.read` or `leave.approve` as create authority.

## Request authority boundary

All normal Stage-18 routes require an active authenticated session.

The browser must never authoritatively provide:

```text
companyId
actorUserId
permissions
projectScope
approvedBy
payroll totals
payroll status
finalizedAt
Finance posting identity
```

For Employee create/update, only source-defined business fields may be accepted after Zod validation. Server-side Company ownership and actor identity always come from request context.

The source does not define whether `employee_no` is manually entered or generated by the Foundation number-sequence capability. Stage 18 keeps that authority unresolved rather than silently creating a numbering key.

## Stage-18 permissions

The final source defines:

```text
employees.read
employees.manage
leave.read
leave.approve
payroll.read
payroll.calculate
payroll.finalize
payslip.self_read
```

Stage 18 activates/freezes the Employee/leave subset only:

```text
employees.read
employees.manage
leave.read
leave.approve
```

These remain deferred to Module 14B:

```text
payroll.read
payroll.calculate
payroll.finalize
payslip.self_read
```

The absence of a separate salary/compensation permission remains explicit even though the source requires stricter salary-data access.

## Stable errors

The complete Module-14 source defines:

```text
EMPLOYEE_NOT_FOUND
DUPLICATE_EMPLOYEE_NUMBER
PAYROLL_RUN_CONFLICT
PAYROLL_HAS_BLOCKING_ERRORS
PAYROLL_ALREADY_FINALIZED
```

Stage 18 owns only the Employee-relevant errors:

```text
EMPLOYEE_NOT_FOUND
DUPLICATE_EMPLOYEE_NUMBER
```

The three payroll errors remain deferred to Module 14B.

The source defines no leave-not-found, leave-conflict, leave-already-approved or compensation-specific error code. Stage 18 must use the project's existing normalized validation/not-found/conflict envelope where appropriate instead of inventing a large new public error vocabulary.

## Stage-18 business rules

Stage 18 freezes these source-derived rules:

- Employee number is unique inside one Company;
- salary and pay rates use DECIMAL/NUMERIC and precision-safe serialization;
- optional login-user linkage reuses Module 24A and must preserve Company isolation;
- sensitive salary data requires stricter access than general employee profile data, even though the exact dedicated permission token is missing;
- leave records remain Company-isolated through their Employee;
- Company/actor/permission authority is server-derived;
- audit must cover compensation changes and leave approval activity when an executable approval transition exists;
- downstream Workforce employee references use direct foreign keys to the Stage-18 Employee master.

Stage 18 does **not** claim that payroll, payroll approval, payslips, Finance posting or labor-cost posting is complete.

## Events, notifications, audit and outbox

The source-defined Gate-A event names are:

```text
employee.created
employee.status_changed
leave.approved
```

The payroll event names deferred to Module 14B are:

```text
payroll.calculated
payroll.finalized
```

`leave.approved` cannot be emitted by a reviewed HTTP workflow yet because no approval command exists. Stage 18 keeps the event vocabulary but does not fabricate an emission path.

The source requires notifications for leave actions and payslip publication. Payslip notifications are deferred with 14B. Leave-action notifications cannot be made complete until the leave read/approval command gap is resolved.

Audit-sensitive Gate-A activity includes Employee creation/profile changes, compensation changes and future leave approval. Audit records must include actor, Company scope, entity, request identity and important before/after values without secrets.

Reviewed events use the Foundation outbox only after successful business validation. Core transaction correctness never depends on a worker.

## Module-13 Workforce handoff

The controlling contract makes **Module 14A a hard prerequisite for Module 13 Workforce & Timesheets**.

After the Stage-18 persistence exists, Stage 19 must create direct foreign keys:

```text
workforce_assignments.employee_id -> employees.id
timesheets.employee_id            -> employees.id
```

No Workforce pass may create its own Employee master or accept free-text employee identity as a substitute for these relationships.

The Stage-18 Employee Master itself does not depend on Module 13 and must not create timesheet, workforce-assignment or payroll tables early.

## React boundary for Stage 18

The final Module-14 React feature is:

```text
apps/web/src/features/hr-payroll/
```

with minimum final UI covering Employee master, leave queue, payroll run wizard, exception review, payslip list/detail and accounting posting status.

Because Part I splits Module 14, Stage 18 may only implement UI supported by the Gate-A API boundary, such as Employee master create/update/list and a source-supported leave-request create flow.

A durable leave queue cannot be implemented faithfully because the source provides no leave GET route. Payroll wizard, exceptions, payslips and accounting-posting status remain deferred to 14B. React must not simulate missing server state locally as if those workflows were complete.

## Source-contract gaps kept explicit

Pass 279 records these unresolved items:

1. The workflow mentions `department/trade`, but the Employee table defines `department` and `job_title` only; no Trade master/field is defined.
2. The workflow mentions `pay type`, but no `pay_type` field or stable vocabulary is defined.
3. The workflow mentions approved compensation components, but no compensation-component/history table or command is defined.
4. Validation requires explicit compensation effective dates, but the table inventory contains no compensation effective-date/history field beyond Employee `join_date`.
5. Sensitive salary data requires stricter permission than general profile data, but no salary/compensation-specific permission code is defined.
6. `employees.user_id` is optional, but one-to-one uniqueness and cross-company linking behavior are not explicitly specified beyond normal Company isolation.
7. Employee `status` and `employment_type` token vocabularies are not enumerated.
8. The workflow requires leave approval, `leave.read`, `leave.approve` and `leave.approved`, but no leave read/approve/reject API is defined.
9. No dedicated permission is defined for creating a leave request.
10. Leave type master, balances/accruals, overlap policy, holidays/weekends, fractional-day rules and exact `days` authority are undefined.
11. `employee_no` numbering authority (manual versus Foundation number sequence) is not stated.
12. The source has no Employee detail GET route, so durable detail/edit readback beyond list payload is not separately defined.
13. The source says Employee history should support downstream payroll/audit needs, but no compensation-history persistence shape is defined.

These gaps must not be silently filled by generic CRUD, speculative tables, extra permissions or invented public enums.

## Required backend structure after implementation

When Stage-18 production generation is authorized, Module 14 uses the source-defined five-file backend folder:

```text
apps/api/src/modules/hr-payroll/
├── hr-payroll.schema.ts
├── hr-payroll.repository.ts
├── hr-payroll.service.ts
├── hr-payroll.routes.ts
└── index.ts
```

Stage 18 may initially implement only the 14A portions of those files. Stage 20 extends the same Module-14 folder for 14B; it must not create a duplicate payroll module tree.

Prisma schema and migrations remain centralized under `packages/database/prisma/`.

## Pass 279 boundary

Pass 279 is contract-only. It does not add or change:

```text
Prisma models
migration SQL
HR/Payroll backend runtime files
Fastify registration
OpenAPI runtime operations
React production files
Playwright tests
runtime permissions
runtime domain-event emission
payroll persistence
payslip persistence
Finance payroll adapters
Module-7 labor-cost posting
Module-13 Workforce persistence
```

The next pass is:

```text
Pass 280 - Module 14A reviewed Employee/Leave Prisma models, constraints, indexes and Stage-18 migration
```

Runtime/deployment acceptance remains blocked until genuine Stage-17 live acceptance.

## Pass 280 — Employee/leave persistence boundary

Pass 280 appends only the reviewed Stage-18 persistence layer:

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260825000300_module_14a_employee_master_core/migration.sql
scripts/module-14a/verify-stage-18-persistence.mjs
module-14a-evidence/stage-18-persistence.json
tests/module-14a-static.test.mjs
migration gate/checksum registration
small workspace/package/README registration changes
```

Exactly these two Prisma/database resources are added:

```text
Employee     -> employees
LeaveRequest -> leave_requests
```

The persistence pass records only narrow decisions needed to make the source-defined tables safe and executable:

- `employees.company_id` directly references Foundation `companies.id`;
- `(company_id, employee_no)` is unique because the source explicitly requires Employee-number uniqueness inside Company;
- optional `employees.user_id` references Module-24A `users.id` and a database trigger rejects cross-Company links;
- no one-to-one uniqueness is added to `user_id`, because the source does not define that rule;
- Employee `status` and `employment_type` stay string-backed because no public token vocabulary is defined;
- `base_salary` is `DECIMAL(18,2)` and `hourly_rate` is `DECIMAL(18,4)` so compensation remains precision-safe without inventing a sign, history or effective-date policy;
- `leave_requests` derives Company ownership through its Employee rather than gaining an invented `company_id` column;
- optional `approved_by` references Module-24A `users.id`; a database trigger rejects an approver from another Employee Company;
- `to_date >= from_date` is enforced;
- leave `days` uses `DECIMAL(18,4)` for fractional precision, but no calculation, rounding, overlap, holiday/weekend or balance rule is invented;
- leave type and lifecycle status remain string-backed and no leave-type/balance/accrual master is created;
- no timestamps are added because the source table inventory does not define them.

Pass 280 still does **not** add:

```text
apps/api/src/modules/hr-payroll/
apps/web/src/features/hr-payroll/
Fastify routes
Zod public API schemas
repository/service logic
leave read/approve/reject commands
new permission codes
compensation-history/component tables
payroll_runs
payslips
payslip_items
Finance payroll adapters
Module-7 labor-cost posting
Module-13 Workforce persistence
```

Run the persistence preparation gate with:

```bash
npm run module-14a:persistence:gate
```

With genuine Stage-17 live acceptance the gate may report:

```text
STAGE_18_MODULE_14A_PERSISTENCE_READY_FOR_PASS_281
```

Until that handoff exists, the truthful prepared status is:

```text
STAGE_18_MODULE_14A_PERSISTENCE_PREPARED_STAGE_17_LIVE_HANDOFF_PENDING
```

The next reviewed pass is:

```text
Pass 281 - Module 14A strict Zod request/query/response schemas for exactly the four reviewed Gate-A operations
```


## Pass 281 — Module 14A strict Zod/API schema implementation

Pass 281 adds only the reviewed Stage-18 public boundary schema:

```text
apps/api/src/modules/hr-payroll/hr-payroll.schema.ts
```

No repository, service, Fastify route/index, React feature, new migration, Workforce persistence, payroll table, payslip workflow or Finance payroll adapter is generated in this pass.

### Exact four-operation Gate-A boundary

The schema exports constants for exactly the four Gate-A operations frozen in Pass 279:

```text
GET   /api/v1/hr/employees
POST  /api/v1/hr/employees
PATCH /api/v1/hr/employees/:id
POST  /api/v1/hr/leave-requests
```

It does not add Employee detail/delete, leave list/detail, leave approve/reject, compensation-history or payroll/payslip routes. Payroll operations remain deferred to 14B.

The Employee register accepts only bounded `page` / `pageSize` query values with a maximum page size of `100`. The source defines no Employee list filter vocabulary, so Pass 281 does not invent search, department, employment-type or status filters.

### Employee create/update boundary

Employee create accepts only these source-defined business fields:

```text
employeeNo
userId nullable/optional
name
department
jobTitle
employmentType
joinDate
baseSalary nullable/optional
hourlyRate nullable/optional
```

PATCH accepts the same fields as optional changes and requires at least one changed field.

`companyId`, authenticated actor identity, permissions, Project scope and lifecycle `status` remain server-owned and are rejected by the strict schemas. The source defines no separate Employee status command even though it names `employee.status_changed`; Pass 281 therefore keeps that transition gap explicit instead of making status browser-controlled.

The source does not say whether `employee_no` is manual or Foundation-generated. Because create is otherwise impossible and the source table/API both require an Employee identity, Pass 281 accepts `employeeNo` as a business input while recording that numbering authority remains unresolved. No Foundation numbering key or hidden generation policy is invented.

`employmentType` remains a bounded string because the source does not enumerate an enum vocabulary. Trade, pay type, compensation component, compensation effective-date and salary-history fields remain absent.

### Compensation precision and readback safety

`baseSalary` is accepted as an exact signed decimal string matching `DECIMAL(18,2)`. `hourlyRate` is accepted as an exact signed decimal string matching `DECIMAL(18,4)`. Pass 280 intentionally added no non-negative database rule because the source did not define one, so Pass 281 does not silently add one at the API boundary.

The source explicitly says sensitive salary data requires stricter permissions than general Employee profile data, but it defines no salary-specific permission. Pass 281 therefore **does not expose `baseSalary` or `hourlyRate` in the public Employee response schema**. The safe Employee list/create/update response contains:

```text
id
employeeNo
userId nullable
name
department
jobTitle
employmentType
joinDate
status
```

This is a deliberate fail-closed readback decision until the source contract defines which permission may read compensation. No `employees.salary.read` or similar permission is invented.

### Leave-request create boundary

The only reviewed leave operation accepts:

```text
employeeId
leaveType
fromDate
toDate
days
```

`approvedBy` and lifecycle `status` remain server-owned. Dates are strict valid `YYYY-MM-DD` calendar dates and `toDate` cannot precede `fromDate`.

`days` is serialized as an exact four-decimal string matching the persistence scale. The source does not define whether the browser or server calculates leave days, nor holiday/weekend, fractional-day or rounding rules. Pass 281 accepts the source-defined `days` field as input to keep the reviewed create route executable, but does not claim that a leave-calculation policy exists and does not invent a positivity rule.

The create response returns only:

```text
id
employeeId
leaveType
fromDate
toDate
days
status
```

It does not expose an approval actor because there is no reviewed approval command.

### Permission and leave-workflow gaps remain explicit

The Gate-A permission vocabulary remains exactly:

```text
employees.read
employees.manage
leave.read
leave.approve
```

Pass 281 does not invent a `leave.create` permission. The exact service/route authorization mapping for `POST /hr/leave-requests` therefore remains unresolved for a later service/HTTP pass and must fail closed rather than silently reinterpreting `leave.read` or `leave.approve` as create authority.

Likewise, `leave.read`, `leave.approve` and the `leave.approved` event remain source-defined vocabulary without executable read/approval routes. No fake leave queue or approval transition is generated.

### Stable errors and events

Stage 18 keeps only the two Employee-relevant public business errors:

```text
EMPLOYEE_NOT_FOUND
DUPLICATE_EMPLOYEE_NUMBER
```

The schema maps them to the project's existing normalized Not Found / Conflict error types. No new leave-specific public error code is invented.

The Gate-A event vocabulary remains:

```text
employee.created
employee.status_changed
leave.approved
```

Pass 281 defines names only; no event emission path is generated in a schema-only pass.

### Pass-281 boundary

Pass 281 adds no:

```text
repository
service
Fastify routes
module index
React files
new Prisma model
new migration
new database table
new permission
Employee detail route
leave read/approve route
compensation-history table
payroll table/API
payslip API
Finance payroll posting
Workforce persistence
```

Runtime deployment remains blocked until genuine `STAGE_17_ACCEPTED_READY_FOR_STAGE_18` evidence exists.

Next reviewed pass: **Pass 282 - Module 14A Company-scoped Employee/Leave repository primitives.**
