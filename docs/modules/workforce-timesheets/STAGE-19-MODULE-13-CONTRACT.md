# Stage 19 — Module 13 Workforce & Timesheets Contract

## Purpose

Stage 19 freezes the executable **Module 13 — Workforce & Timesheets** boundary before Prisma models, migrations, backend runtime code or React code are generated.

The corrected dependency-aware order is:

```text
Stage 18  Module 14A - Employee Master
Stage 19  Module 13 - Workforce & Timesheets
Stage 20  Module 14B - Payroll Completion
Stage 21  Module 21 - Project Scheduling
...
Stage 27  Cross-module Integration Completion
Stage 28  Module 23 - Reports & Analytics
Stage 29  Module 1 - Dashboard
```

Part I is authoritative for generation order, hard dependencies and the Employee-Master correction. Appendix A remains authoritative for Module-13 workflow, fields, routes, permissions, errors, events and UI unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-19 runtime handoff is genuine Stage-18 live acceptance:

```text
STAGE_18_ACCEPTED_READY_FOR_STAGE_19
```

The Module-13 contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-19 runtime activation or deployment.

The corrected hard prerequisites are:

```text
Module 5   - Project Management
Module 6   - WBS & Cost Codes
Module 14A - Employee Master
Module 24B - Project Scope Activation
Module 22  - Approval Workflows when timesheet approval is enabled
```

Because the reviewed API contains an explicit timesheet approval command, Stage 19 treats the existing Module-22 approval engine as the approval dependency. Module 13 must not create a second approval engine.

## Exact owned persistence boundary

Stage 19 owns exactly these four source-defined tables:

```text
workforce_assignments
timesheets
timesheet_entries
timesheet_adjustments
```

### workforce_assignments

Source-defined fields:

```text
id
company_id
employee_id
project_id
trade_role
from_date
to_date nullable
status
```

Required meaning:

- `company_id` references Foundation Company;
- `employee_id` directly references Module-14A `employees.id`;
- `project_id` directly references Module-5 `projects.id`;
- Employee and Project must belong to the same Company as the assignment;
- Project scope is enforced from trusted request context;
- normal assignment is valid only against an active Project;
- assignment periods are date-bounded and `to_date` cannot precede `from_date`;
- assignment lifecycle state is server-controlled.

The source does not enumerate assignment status values or define a transfer/reassignment command. Stage 19 must not invent those APIs or token vocabularies.

### timesheets

Source-defined fields:

```text
id
company_id
employee_id
period_start
period_end
status
submitted_at nullable
approved_at nullable
```

Required meaning:

- every Timesheet belongs to one Company and one Module-14A Employee;
- Employee Company ownership must match Timesheet Company ownership;
- `period_end` cannot precede `period_start`;
- status/submission/approval timestamps are server-owned;
- approved time is immutable except through the reviewed controlled adjustment command;
- no required foreign key may point to future Module-14B payroll tables.

The source says daily/weekly timesheets are supported but does not define a timesheet-type field. Stage 19 does not invent one.

### timesheet_entries

Source-defined fields:

```text
id
timesheet_id
work_date
project_id
wbs_node_id
cost_code_id
cost_type_id
regular_hours
overtime_hours
remarks
```

Required meaning:

- `timesheet_id` references the owning Timesheet;
- `project_id` references Module-5 Project;
- `wbs_node_id`, `cost_code_id` and `cost_type_id` reference Module-6 cost classification;
- every Project/cost reference must belong to the same Company and valid Project scope;
- the Employee must have an active Workforce Assignment for the work date and Project;
- work date must be valid for the Timesheet period;
- hours use decimal-safe persistence/transport and cannot be negative;
- the browser never supplies labor cost or arbitrary pay rate.

The source requires duplicate employee/project/date/shift protection, but defines no `shift` field. Stage 19 records that contradiction rather than inventing a shift column.

### timesheet_adjustments

Source-defined fields:

```text
id
timesheet_id
original_entry_id
adjustment_hours
reason
approved_by nullable
created_at
```

Required meaning:

- adjustment references the approved Timesheet and original Timesheet Entry;
- original entry must belong to that Timesheet;
- `approved_by` is server-owned and references an authorized Module-24A user when used;
- adjustment is append-only history rather than mutation of the approved source entry;
- Company/Project scope is inherited and revalidated through the Timesheet/original Entry relationships.

The source does not define adjustment replacement fields for Project/cost-code changes, negative/positive adjustment bounds, or a separate approval command for adjustments. Those details are not invented.

## Exact reviewed Stage-19 API surface

Stage 19 exposes exactly these eight source-defined operations:

```text
GET  /api/v1/workforce/assignments
POST /api/v1/workforce/assignments
GET  /api/v1/timesheets
POST /api/v1/timesheets
PUT  /api/v1/timesheets/:id/entries
POST /api/v1/timesheets/:id/submit
POST /api/v1/timesheets/:id/approve
POST /api/v1/timesheets/:id/adjust
```

Do not automatically add generic or undocumented endpoints such as:

```text
GET    /api/v1/workforce/assignments/:id
PATCH  /api/v1/workforce/assignments/:id
DELETE /api/v1/workforce/assignments/:id
GET    /api/v1/timesheets/:id
PATCH  /api/v1/timesheets/:id
DELETE /api/v1/timesheets/:id
POST   /api/v1/timesheets/:id/reopen
POST   /api/v1/timesheets/:id/reject
POST   /api/v1/timesheets/:id/post-job-cost
POST   /api/v1/timesheets/:id/post-payroll
```

The route table describes `GET /timesheets` as list/search but does not enumerate search filters. Schema generation must not invent unreviewed filter names beyond safe pagination until the contract is explicit.

## Exact reviewed permissions

The source-defined Module-13 permissions are exactly:

```text
workforce.read
workforce.assign
timesheets.read
timesheets.create
timesheets.approve
timesheets.adjust
```

No extra `timesheets.edit`, `timesheets.submit`, `timesheets.reject`, `timesheets.reopen`, `workforce.manage` or posting permission is invented.

The source does not map `PUT /timesheets/:id/entries` and `POST /timesheets/:id/submit` to a dedicated permission. Later service/route passes must record and enforce one reviewed existing authority without silently creating new permission codes.

## Authentication, Company and Project authority

All eight routes require an active authenticated session.

The server derives and revalidates:

```text
companyId
actorUserId
permissions
allowedProjectIds
approval actor/current step
status/timestamps
posting/source identity
```

Browser-provided Company, actor, permission, Project-scope, approval-state, payroll-state or job-cost-state authority is rejected.

Repository reads/writes must enforce both Company ownership and allowed Project scope before returning or mutating records.

## Validation and business rules

Stage 19 freezes these source-defined rules:

- Employee and Project assignment must be active for the work date.
- Daily/period hour limits are enforced by policy.
- Duplicate employee/Project/date/shift entries are blocked where policy disallows them.
- Approved payroll periods block normal edits once the future payroll lock is executable.
- Approved time is immutable except controlled adjustment.
- Labor cost uses approved HR/Payroll rate policy, never arbitrary user-entered cost/rate.
- One source entry reaches job cost/payroll at most once.
- Submitted/approved hours and all post-approval adjustments are audited.
- Foundation outbox records source-defined domain events after successful transaction validation.

The source does not define the actual hour-limit values, shift representation, overtime multiplier, effective-rate lookup, payroll-lock persistence contract, or job-cost/payroll source-key shape. These are explicit source gaps, not implementation freedom.

## Approval boundary

The reviewed API contains:

```text
POST /api/v1/timesheets/:id/approve
```

and Part I requires Module 22 when timesheet approval is enabled.

Therefore:

- Module 13 owns the Timesheet business state;
- Module 22 owns reusable approval decisions/steps;
- approval completion may authorize Module 13 to transition the Timesheet to its approved state;
- no separate `timesheet_approvals` table or duplicate approval engine is created;
- approval definition/step identity is never selected by an untrusted browser unless an existing reviewed Module-22 contract explicitly allows it.

The source mentions rejection in notification prose but defines no Timesheet reject/return route. Stage 19 does not invent one.

## Payroll and job-cost boundary

Stage 19 produces approved labor input for two downstream consumers:

```text
Module 14B - Payroll Completion
Module 7   - Budgeting & Job Costing
```

However:

- Module 14B does not exist until Stage 20, so Stage 19 must not create a required FK to payroll tables;
- payroll period locking cannot rely on a future mandatory FK;
- labor cost cannot use arbitrary browser-entered rate/cost values;
- the source does not define overtime-rate policy, compensation effective-date lookup or exact job-cost source-key persistence;
- the source promises at-most-once payroll/job-cost posting but does not define posting-status columns on the four Stage-19 tables.

Stage 19 therefore freezes approval/lock semantics and source identity requirements, but later implementation must fail closed or defer downstream cost/posting when authoritative rate/posting policy is not executable. Stage 27 remains the mandatory integration-completion proof for Employee -> Timesheet -> Payroll and labor-cost atomic/idempotent behavior.

## Stable errors

The source-defined Module-13 errors are:

```text
WORKFORCE_ASSIGNMENT_NOT_FOUND
TIMESHEET_NOT_FOUND
TIMESHEET_ALREADY_APPROVED
INVALID_WORK_HOURS
PAYROLL_PERIOD_LOCKED
```

Later implementation may use existing shared authentication/authorization/validation/idempotency errors, but must not replace these stable business conflicts with raw Prisma/PostgreSQL errors.

## Events

The source-defined events are exactly:

```text
workforce.assigned
timesheet.submitted
timesheet.approved
timesheet.adjusted
```

Events are written through the Foundation outbox only after successful business validation. Core correctness must not depend on a background worker.

No `timesheet.created`, `timesheet.rejected`, `timesheet.posted`, `labor_cost.posted` or payroll event is invented at Stage 19.

## Notifications and audit

The source allows asynchronous notification of supervisors about pending Timesheets and employees/payroll about rejection/approval where appropriate. Because no reject command exists, Stage 19 does not fabricate one merely for notification parity.

Audit must capture assignment changes, submitted/approved hours and every post-approval adjustment with actor, Company/Project scope, entity ID, request ID and meaningful before/after values. Secrets are never logged.

## React boundary

The reviewed React feature path is:

```text
apps/web/src/features/workforce-timesheets/
  api/
  hooks/
  components/
  pages/
```

Minimum source-defined UI:

```text
Project workforce roster
Timesheet grid
bulk daily entry
approval queue
labor-hour summary
payroll/job-cost posting status
```

TanStack Query owns server state. React Hook Form + Zod handle forms. Permission-aware UI never replaces server authorization.

The route/response contract does not yet define a durable payroll/job-cost posting-status read model. The React pass must not invent server state to satisfy that label; it may only render status actually supported by reviewed API responses.

## Exact generation checkpoint

Stage 19 proceeds in this order:

1. freeze this contract;
2. generate/review the four Prisma models, constraints, indexes and migration;
3. generate `workforce-timesheets.schema.ts`;
4. generate `workforce-timesheets.repository.ts`;
5. generate `workforce-timesheets.service.ts`;
6. generate `workforce-timesheets.routes.ts` and `index.ts`;
7. add repository/service/Fastify integration and negative Company/Project/RBAC tests;
8. register in `app.ts` and verify generated OpenAPI/Swagger;
9. generate React API/hooks/pages/forms;
10. run Playwright main workflow;
11. run operational/migration/concurrency verification;
12. close Stage 19 only after the final acceptance gate passes.

## Contract gaps deliberately left unresolved

Stage 19 explicitly records these source ambiguities instead of guessing:

```text
assignment status vocabulary
timesheet status vocabulary
daily vs weekly timesheet type representation
exact daily/period hour-limit policy
shift field/identity required by duplicate rule but absent from persistence schema
exact duplicate-entry uniqueness shape
specific GET /timesheets search filters
permission for replacing draft entries
permission for submitting a timesheet
rejection/return/reopen workflow
approval-definition selection and returned/rejected transition detail
adjustment-hours sign/bounds and adjustment approval detail
payroll-period lock persistence/integration before Module 14B exists
regular/overtime authoritative rate lookup and overtime multiplier
effective compensation date lookup
job-cost source-key/posting-status persistence
payroll source-key/posting-status persistence
exact labor-hour summary response shape
payroll/job-cost posting-status response/readback shape
```

These gaps must remain visible until a controlling contract explicitly resolves them.

## Pass-291 completion rule

Pass 291 is complete only when:

- the Stage-19 contract is documented;
- exactly four owned tables, eight routes, six permissions, five stable errors and four events are frozen;
- corrected Employee-master and Project-scope dependencies are preserved;
- Module-22 approval ownership is preserved;
- no Workforce/Timesheet production runtime file is generated;
- no Prisma model or migration for Module 13 is generated;
- no Payroll/Job-Cost posting implementation is generated early;
- unresolved source gaps are recorded;
- dependency-free Module-13 contract verification, workspace verification and migration-policy checks pass.

The next reviewed implementation pass is **Pass 292 — Module 13 Workforce & Timesheets Prisma models, constraints, indexes and Stage-19 migration**.
