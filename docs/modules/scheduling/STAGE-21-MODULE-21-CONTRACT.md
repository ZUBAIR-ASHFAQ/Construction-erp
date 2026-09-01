# Stage 21 — Module 21 Project Scheduling Contract

## Purpose

Stage 21 freezes the executable boundary for **Module 21 — Project Scheduling** before Prisma models, migrations, backend runtime code or React code are generated.

The module provides medium-level Project activities, milestones, dependencies, immutable schedule baselines, progress updates and bounded look-ahead views. It must not pretend to provide full resource-loaded CPM, Primavera/P6 parity or an undocumented external-scheduler synchronization engine.

The corrected dependency-aware order is:

```text
Stage 20  Module 14B - Payroll Completion
Stage 21  Module 21  - Project Scheduling
Stage 22  Module 17  - Change Orders / Variations
Stage 23  Module 16  - Client Billing
Stage 24  Module 19  - RFI & Submittals
Stage 25  Module 20  - Daily Site Reports
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
Stage 28  Module 23  - Reports & Analytics
Stage 29  Module 1   - Dashboard
```

Part I remains authoritative for generation order and hard dependencies. Appendix A remains authoritative for Module-21 workflow, tables, routes, validation, permissions, errors, events and React requirements unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-21 runtime handoff is genuine Stage-20 live acceptance:

```text
STAGE_20_ACCEPTED_READY_FOR_STAGE_21
```

The Module-21 contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-21 production runtime activation or deployment.

The corrected business prerequisites are:

```text
Module 5  - Project Management        required
Module 6  - WBS & Cost Codes         optional activity mapping only
```

Project-scope authorization already exists through the shared Module-24B resource policy and must be reused. Stage 21 must not create a second Project membership or authorization model.

## Ownership boundary

Module 21 owns exactly these five source-defined persistence resources:

```text
project_schedules
schedule_activities
schedule_dependencies
schedule_baselines
schedule_progress_updates
```

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency          Foundation
users / roles / permissions                        Module 24A
projects / Project lifecycle                       Module 5
Project membership / allowed Project scope         Module 24B
wbs_nodes                                           Module 6
```

Later ownership remains:

```text
Change Order schedule-day impacts                  Module 17
Daily Site Report activity links                   Module 20
reports / analytics                                Module 23
dashboard                                          Module 1
```

Module 21 must not create a second Project master, WBS master, Change Order store, Daily Report store, reporting store or dashboard store.

## Reviewed persistence boundary

### project_schedules

Source-defined fields:

```text
id
company_id
project_id
name
status
baseline_at nullable
data_date nullable
```

Required meaning:

- every schedule belongs to exactly one Company and one Module-5 Project;
- the Project must belong to the same Company;
- Company and allowed Project scope come from trusted authenticated context;
- `baseline_at` is server-owned and records when a current schedule baseline was frozen;
- `data_date`, when used, is a normalized schedule-control date;
- `status` is server-controlled, but the source does not enumerate its token vocabulary.

The reviewed routes are singular and Project-scoped: `GET /projects/:projectId/schedule` returns the **current schedule** and `POST /projects/:projectId/schedule` creates it. No route selects among multiple schedule IDs. To keep that API executable without inventing a schedule-selection mechanism, Stage 21 freezes the conservative first-scope rule: **one current Project Schedule record per Project**. Baseline history belongs in `schedule_baselines`, not duplicate current-schedule rows.

The source does not define a schedule archive/reopen/delete route. Stage 21 does not invent one.

### schedule_activities

Source-defined fields:

```text
id
schedule_id
parent_id nullable
activity_code
name
wbs_node_id nullable
planned_start
planned_finish
actual_start nullable
actual_finish nullable
percent_complete
milestone
status
```

Required meaning:

- every activity belongs to one Project Schedule;
- `parent_id`, when present, references another Activity inside the same Schedule;
- `wbs_node_id`, when present, directly references Module-6 WBS and must belong to the same Project as the Schedule;
- `activity_code` is unique inside the Schedule;
- planned finish cannot precede planned start;
- percent complete is bounded from 0 through 100;
- actual finish normally requires 100 percent complete because no configured exception contract exists yet;
- activity lifecycle status is server-controlled.

The workflow mentions activity **owner** and planned **duration**, but neither field exists in the reviewed table. Stage 21 must not invent `owner_user_id`, `duration_days` or a planning-resource master. Duration may be displayed only when safely derived from reviewed dates; it is not a new persisted authority.

The source says activity hierarchy but does not define hierarchy-depth limits, parent-change rules or a separate hierarchy-cycle error. Later implementation must at minimum keep parent references inside the same Schedule and must not fabricate an undocumented hierarchy-management subsystem.

The source does not enumerate activity status values or milestone-specific date rules. In particular, it does not say a milestone must have identical planned start/finish dates. Stage 21 does not invent that rule.

### schedule_dependencies

Source-defined fields:

```text
id
schedule_id
predecessor_activity_id
successor_activity_id
dependency_type
lag_days
```

Required meaning:

- dependency, predecessor and successor must all belong to the same Schedule;
- the complete dependency graph must be cycle-free;
- a self-dependency is invalid because it is a cycle;
- dependency replacement is validated as one complete set before commit.

The workflow explicitly names **finish-start** plus “other supported dependencies”, but it does not enumerate the other dependency types. Stage 21 freezes **finish-start (`FS`) as the only guaranteed executable dependency type**. No `SS`, `FF`, `SF` or custom token is invented until a controlling contract names it.

`lag_days` is source-defined but lead/negative-lag behavior and fractional-day lag are not defined. The first implementation must use whole-day lag and must fail closed on unsupported lag semantics instead of guessing planning-engine behavior.

### schedule_baselines

Source-defined fields:

```text
id
schedule_id
baseline_no
created_at
created_by
snapshot_json
```

Required meaning:

- every baseline belongs to one Schedule;
- `created_by` is the authenticated actor and is never accepted as browser authority;
- `snapshot_json` is an immutable server-created snapshot of the reviewed Schedule state at baseline time;
- baseline history is append-only and existing snapshots are never overwritten;
- baseline number identifies the baseline sequence inside one Schedule.

Because duplicate baseline numbers would make the source-defined `baseline_no` identity ambiguous, Stage 21 freezes uniqueness of `(schedule_id, baseline_no)`. The source does not define whether numbering starts at zero or one, so later numbering logic must use a simple server-owned monotonic sequence without exposing browser numbering authority.

The exact JSON snapshot shape is not defined. Persistence may store JSON, but service/schema passes must document the canonical server-created snapshot before relying on individual JSON keys.

### schedule_progress_updates

Source-defined fields:

```text
id
schedule_id
data_date
activity_id
percent_complete
forecast_finish nullable
remarks
updated_by
```

Required meaning:

- every progress update belongs to one Schedule and one Activity inside that Schedule;
- `updated_by` is the authenticated actor;
- percent complete is bounded from 0 through 100;
- a progress update is auditable history, not a silent destructive rewrite of prior progress evidence;
- `forecast_finish`, when present, carries the source-defined revised finish forecast while the immutable baseline remains preserved.

The source does not define `forecast_start`, quantity-based progress, earned-value fields, progress-weighting formulas or multiple progress measurements on the same activity/data date. Those are not invented.

## Exact reviewed Stage-21 API surface

Stage 21 exposes exactly these eight source-defined operations:

```text
GET   /api/v1/projects/:projectId/schedule
POST  /api/v1/projects/:projectId/schedule
POST  /api/v1/projects/:projectId/schedule/activities
PATCH /api/v1/projects/:projectId/schedule/activities/:id
PUT   /api/v1/projects/:projectId/schedule/dependencies
POST  /api/v1/projects/:projectId/schedule/baseline
POST  /api/v1/projects/:projectId/schedule/progress
GET   /api/v1/projects/:projectId/schedule/lookahead
```

Do not automatically add generic or undocumented endpoints such as:

```text
GET    /api/v1/projects/:projectId/schedules
GET    /api/v1/projects/:projectId/schedule/activities/:id
DELETE /api/v1/projects/:projectId/schedule/activities/:id
DELETE /api/v1/projects/:projectId/schedule/dependencies/:id
PATCH  /api/v1/projects/:projectId/schedule/baselines/:id
POST   /api/v1/projects/:projectId/schedule/reopen
POST   /api/v1/projects/:projectId/schedule/import
POST   /api/v1/projects/:projectId/schedule/sync
POST   /api/v1/projects/:projectId/schedule/recalculate-cpm
```

The look-ahead route is described only as a **bounded look-ahead view**, while the React requirement says **two-to-six-week look-ahead**. The source does not name the query parameters or define whether the range starts from `data_date`, today or a caller-supplied date. Schema generation must not invent arbitrary look-ahead query names. The first executable shape must be explicitly frozen before that route accepts optional query filters.

## Exact reviewed permissions

The source-defined Module-21 permissions are exactly:

```text
schedule.read
schedule.manage
schedule.baseline
schedule.progress
```

No extra `schedule.create`, `schedule.dependencies.manage`, `schedule.activity.manage`, `schedule.reopen`, `schedule.import` or `schedule.sync` permission is invented.

Later route/service mapping uses only these reviewed permissions:

- read/current schedule and look-ahead use `schedule.read`;
- create schedule, create/update activities and replace dependencies use `schedule.manage`;
- baseline uses `schedule.baseline`;
- progress uses `schedule.progress`.

This mapping does not create new permission codes and remains subject to service-level Project-scope revalidation.

## Authentication, Company and Project authority

All eight routes require an active authenticated session.

The server derives and revalidates:

```text
companyId
actorUserId
permissions
allowedProjectIds
Project ownership
baseline actor/timestamp/number
progress actor
server-owned status
```

Browser-provided Company, actor, permission, Project-scope, baseline-history or audit authority is rejected.

Repository reads/writes must enforce Company ownership and allowed Project scope before returning or mutating Schedule records.

## Validation and business rules

Stage 21 freezes these source-defined rules:

- activity code is unique inside one Schedule;
- planned finish cannot precede planned start;
- dependency graph must not contain cycles;
- percent complete is 0 through 100;
- actual finish implies 100 percent complete unless a future configured exception is explicitly defined;
- baseline snapshot is immutable;
- external scheduler integration must use an explicit future import/sync contract and must never overwrite history silently;
- this module does not claim full resource-loaded CPM/P6 parity.

The source does not define a critical-path calculation engine, float calculations, calendars, resources, resource leveling, working-day calendars or weather calendars. Stage 21 must not invent them.

## Baseline and current-schedule boundary

The workflow says to freeze a baseline, then continue recording progress and revised forecast dates while preserving that baseline.

Therefore:

- `schedule_baselines` stores immutable historical snapshots;
- baseline creation must never rewrite an earlier baseline;
- normal progress after baseline remains allowed through the reviewed progress command;
- later current forecast/progress changes must not mutate baseline JSON;
- the browser never supplies `snapshot_json`, `baseline_no`, `created_by` or `baseline_at` as authoritative values.

The source includes `SCHEDULE_BASELINE_LOCKED` but does not define a baseline reopen/revision lifecycle or which current-schedule fields become locked after baseline creation. Stage 21 records that ambiguity. Later service logic may protect immutable baseline history but must not block the source-defined post-baseline progress workflow merely by guessing a broader lock rule.

## Progress and forecast boundary

The reviewed progress command owns progress-date, percent-complete, actual-date and forecast evidence that the source exposes through the existing Schedule fields.

The source does not define:

```text
forecast_start
remaining_duration
actual quantity
planned quantity
progress weighting
progress approval workflow
```

No such fields or APIs are added during Stage 21.

Because `schedule_progress_updates` contains only `forecast_finish`, the module must not claim full two-sided forecast-date history without a later reviewed amendment.

## Change Order boundary

Module 17 — Change Orders / Variations is generated at Stage 22 and may later apply approved schedule-day impact.

Stage 21 must not add a Change Order foreign key, Change Order command or schedule-impact endpoint early. The later Module-17 adapter must use reviewed Schedule service/repository boundaries and preserve baseline history.

Stage 27 remains the mandatory cross-module integration proof for every configured Change -> Schedule impact. It must prove the impact is applied once, traceable and reversible/adjustable according to the approved policy.

## Daily Report boundary

Module 20 — Daily Site Reports is a later consumer of Schedule activities. Stage 21 owns Activities; Module 20 may reference them after its own reviewed schema exists.

Stage 21 must not add Daily Report columns or tables early.

## Stable errors

The source-defined Module-21 errors are exactly:

```text
SCHEDULE_NOT_FOUND
DUPLICATE_ACTIVITY_CODE
SCHEDULE_DEPENDENCY_CYCLE
SCHEDULE_BASELINE_LOCKED
INVALID_PROGRESS_UPDATE
```

Later implementation may use existing shared authentication, authorization, validation and idempotency errors, but it must not replace these stable business conflicts with raw Prisma/PostgreSQL errors.

## Events

The source-defined events are exactly:

```text
schedule.created
schedule.baselined
schedule.progress_updated
schedule.milestone_changed
```

Events are recorded through the Foundation outbox only after successful business validation.

No `schedule.activity_created`, `schedule.dependencies_replaced`, `schedule.deleted`, `schedule.imported`, `schedule.synced` or CPM event is invented.

`schedule.milestone_changed` is retained because the source explicitly defines it. The exact condition that emits it is not stated and must be resolved during the service pass without creating extra lifecycle vocabulary.

## Notifications and audit

The source permits optional milestone-due, delayed-activity and baseline-approval alerts.

No baseline approval API, permission or Module-22 dependency is defined for Scheduling, so Stage 21 does not fabricate a Scheduling approval workflow merely to support an optional alert phrase.

Audit must capture baseline creation, dependency changes and manual progress/date overrides with actor user ID, Company/Project scope, entity ID, request ID and important before/after values. Secrets are never logged.

## React boundary

The reviewed React feature path is:

```text
apps/web/src/features/scheduling/
  api/
  hooks/
  components/
  pages/
```

Minimum source-defined UI:

```text
Activity table / Gantt-style view
milestones
dependencies
baseline vs current dates
progress entry
two-to-six-week look-ahead
```

TanStack Query owns server state. React Hook Form + Zod handle forms. Permission-aware UI never replaces server authorization.

“Gantt-style” is a medium-level visualization requirement. It does not authorize an advanced scheduling engine, drag-driven automatic CPM recalculation, resource leveling or P6 import/sync behavior.

## Exact generation checkpoint

Stage 21 proceeds in this order:

1. freeze this contract;
2. generate/review the five Prisma models, constraints, indexes and migration;
3. generate `scheduling.schema.ts`;
4. generate `scheduling.repository.ts`;
5. generate `scheduling.service.ts`;
6. generate `scheduling.routes.ts` and `index.ts`;
7. add repository/service/Fastify integration tests with negative Company/Project/RBAC coverage;
8. register Module 21 in `app.ts` and verify OpenAPI/Swagger;
9. generate React API/hooks/pages/forms;
10. run Playwright for the main schedule workflow;
11. run operational/migration/concurrency verification;
12. close Stage 21 only after the final acceptance gate passes.

## Contract gaps deliberately left unresolved

Stage 21 explicitly records these source ambiguities instead of guessing:

```text
project_schedules status vocabulary
schedule_activities status vocabulary
activity owner field is required by workflow but absent from persistence
planned duration field is mentioned by workflow but absent from persistence
hierarchy depth and parent-change/cycle rules are not defined
other dependency types beyond guaranteed FS are not enumerated
negative lead / fractional lag semantics are not defined
exact baseline snapshot_json shape is not defined
baseline numbering start value is not defined
baseline reopen/revision lifecycle is not defined
exact meaning/scope of SCHEDULE_BASELINE_LOCKED is not defined
exact post-baseline activity fields that remain editable are not enumerated
forecast_start and complete revised-forecast persistence are not defined
look-ahead query parameter names/start-date semantics are not defined
progress duplicate/replace rule for one activity/data_date is not defined
progress approval is not defined
schedule.milestone_changed emission condition is not defined
optional baseline-approval notification has no approval route/dependency
approved Change Order schedule-impact adapter is deferred to Stage 22/27
external scheduler import/sync contract is intentionally absent
advanced CPM/P6 calculations, calendars and resources are outside medium scope
```

These gaps remain visible until a controlling contract or a later narrow reviewed amendment resolves them.

## Pass-322 completion rule

Pass 322 is complete only when:

- the Stage-21 contract is documented;
- exactly five owned tables, eight routes, four permissions, five stable errors and four events are frozen;
- Module-5 Project ownership and optional Module-6 WBS mapping are preserved;
- existing Module-24B Project scope is reused rather than duplicated;
- one current Schedule per Project is frozen so the singular reviewed API is executable;
- immutable baseline history and cycle-free dependencies are preserved;
- no Scheduling Prisma model, migration, backend runtime file or React file is generated in this pass;
- no Change Order, Daily Report, external-scheduler or advanced CPM integration is generated early;
- unresolved source gaps remain explicit;
- dependency-free Module-21 contract verification, workspace verification and migration-policy checks pass.

The next reviewed implementation pass is **Pass 323 — Module 21 Project Scheduling Prisma models, constraints, indexes and Stage-21 migration**.
