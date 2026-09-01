# Stage 7 — Module 5 Project Management Contract

## Purpose

Stage 7 freezes the executable contract for **Module 5 — Project Management** before any Project Prisma model, migration, backend module or React feature is generated.

Project Management becomes the company-owned project master used later by WBS, budgeting, procurement, field, resource, finance, reporting and dashboard workflows. This contract follows Part I whenever Appendix A places project membership inside Module 5, because Part I explicitly moves validated project membership and project-scoped authorization to **Module 24B — Project Scope Activation** after projects exist.

## Stage prerequisite

Direct dependency-aware prerequisite:

```text
Stage 6 — Module 4A BOQ Commercial Core
```

Module 5 also relies on earlier stable owners that already exist in the sequence:

```text
Module 2   Client master
Module 24A Company-scope users/RBAC
Module 3   Tendering & Estimation when a Project links a Tender
```

Runtime implementation must not be treated as accepted until genuine Module 4A live evidence contains:

```text
STAGE_6_ACCEPTED_READY_FOR_STAGE_7
```

The Stage-7 contract may be reviewed and frozen while live evidence is pending. That does not authorize deployment or falsely mark Stage 7 as runtime-accepted.

## Stage-7 ownership boundary

Module 5 owns only the Project master and Project lifecycle history:

```text
projects
project_status_history
```

Stage 7 intentionally does **not** own:

```text
project_members
validated project memberships
project-scoped role assignments
project-scoped authorization activation
WBS nodes
cost codes
budgets
procurement records
finance records
BOQ project/WBS mappings
```

`project_members` and validated project scope belong to **Stage 8 — Module 24B**. The later Stage-8 migration may add the membership table after `projects` exists.

## Project persistence contract

### projects

The Project master freezes these business fields for Pass 138:

```text
id
company_id
project_code
name
client_id
tender_id nullable
status
currency
start_date
planned_end_date
project_manager_user_id
location
created_at
updated_at
```

Ownership and references:

- `company_id` resolves to the Foundation company master and is derived from authenticated context.
- `client_id` resolves to the Module 2 client and must belong to the same company.
- `tender_id` is optional. When supplied it resolves to a same-company Module 3 Tender and must represent a `WON` tender before Project creation/linking.
- `project_manager_user_id` resolves to a same-company active user from Module 24A.
- `project_code` is unique inside one company.
- `planned_end_date` cannot precede `start_date`.
- `currency` is stored as an uppercase three-letter currency code.

### project_status_history

Lifecycle history freezes these fields:

```text
id
project_id
from_status nullable
to_status
changed_by
reason nullable
changed_at
```

Every lifecycle transition appends history in the same transaction as the Project status change, audit record and outbox event.

## Corrected membership boundary

Appendix A lists `project_members`, `PUT /api/v1/projects/:id/members`, member-management UI and the `project.member_changed` event inside the completed Project Management module.

Part I explicitly changes ownership: **Project membership activates only in Module 24B after Module 5 projects exist**. Therefore Stage 7 freezes the following as deferred:

```text
project_members table
PUT /api/v1/projects/:id/members
projects.manage_members runtime use
project.member_changed emission
team/member management React UI
project-membership notifications
project-scoped authorization decisions
```

The permission code `projects.manage_members` and event name `project.member_changed` remain reserved vocabulary from Appendix A. Stage 7 does not create a route or emit the event for them.

## Stage-7 lifecycle

The route-backed lifecycle is frozen as:

```text
DRAFT
  -> ACTIVE
  -> COMPLETED
  -> CLOSED
```

`SUSPENDED` is acknowledged because Appendix A describes suspension as part of the business lifecycle, but Appendix A defines no suspension command endpoint. Stage 7 must therefore **not invent** a suspend or resume route. The persistence contract may reserve `SUSPENDED` as an allowed lifecycle value, but Stage-7 services do not enter or leave it through an undocumented API.

Lifecycle rules:

- creation starts in server-owned `DRAFT`;
- activation changes `DRAFT -> ACTIVE` only after mandatory Project setup validation;
- completion changes `ACTIVE -> COMPLETED`;
- close changes `COMPLETED -> CLOSED` only after configured blocking-item checks pass;
- closed Projects reject normal transactional writes except later explicitly approved adjustment/reopen workflows;
- no generic status PATCH is allowed;
- no reopen command is invented in Stage 7.

## Exact Stage-7 API surface

Part I defers membership to Module 24B, so Stage 7 exposes exactly these seven Project operations:

```text
GET   /api/v1/projects
POST  /api/v1/projects
GET   /api/v1/projects/:id
PATCH /api/v1/projects/:id
POST  /api/v1/projects/:id/activate
POST  /api/v1/projects/:id/complete
POST  /api/v1/projects/:id/close
```

The Appendix A membership operation is reserved for Stage 8 and must not be registered in Stage 7:

```text
PUT /api/v1/projects/:id/members
```

Do not add generic CRUD or undocumented lifecycle routes such as:

```text
DELETE /api/v1/projects/:id
PATCH  /api/v1/projects/:id/status
POST   /api/v1/projects/:id/suspend
POST   /api/v1/projects/:id/resume
POST   /api/v1/projects/:id/reopen
```

## Request ownership

GET routes accept only validated path/query filters with bounded pagination.

POST/PATCH/command routes accept only reviewed business fields. The following remain server-owned and must never be trusted from the browser:

```text
companyId
actorUserId
permissions
projectScope
status
status history
changedBy
createdAt
updatedAt
```

Project membership and project-scope fields are not accepted at all in Stage 7.

## Concrete Stage-7 request boundary for later schema generation

### Project register

```text
GET /api/v1/projects

search optional
clientId optional
tenderId optional
status optional
page optional, >= 1
pageSize optional, 1..100
```

No project-membership filter is enabled before Module 24B.

### Create Project

```text
POST /api/v1/projects

{
  projectCode,
  name,
  clientId,
  tenderId optional,
  currency,
  startDate,
  plannedEndDate,
  projectManagerUserId,
  location
}
```

The server owns company identity and initial `DRAFT` status.

### Update Project master

```text
PATCH /api/v1/projects/:id

{
  name optional,
  clientId optional,
  tenderId optional,
  currency optional,
  startDate optional,
  plannedEndDate optional,
  projectManagerUserId optional,
  location optional
}
```

`projectCode` is intentionally not editable through the ordinary Stage-7 PATCH. Appendix A says project code, client and currency become controlled after financial postings exist; keeping project code immutable through the normal update path gives the Project a stable identifier without inventing a separate renumber command. Client/currency updates remain service-controlled so later financial-posting gates can tighten them when Finance exists.

### Lifecycle commands

Activation and completion are bodyless commands.

Close accepts only the business reason needed for lifecycle history/audit when provided:

```text
POST /api/v1/projects/:id/close

{
  reason optional
}
```

The client cannot submit target status or changed-by identity.

## Permissions

Appendix A defines these Project permission codes:

```text
projects.read
projects.create
projects.update
projects.manage_members
projects.activate
projects.close
```

Stage-7 use is frozen as:

```text
projects.read      -> list/get
projects.create    -> create
projects.update    -> update editable Project master data
projects.activate  -> activate
projects.close     -> complete and close lifecycle commands
```

`projects.manage_members` is reserved for Module 24B and is not exercised by a Stage-7 route.

Appendix A defines no separate `projects.complete` permission. Stage 7 therefore uses the existing `projects.close` lifecycle authority for both operational completion and final close rather than inventing a new permission code.

## Stable business errors

Stage 7 keeps the five Appendix A Project business errors:

```text
PROJECT_NOT_FOUND
DUPLICATE_PROJECT_CODE
PROJECT_SCOPE_FORBIDDEN
PROJECT_NOT_READY_TO_CLOSE
INVALID_PROJECT_STATUS_TRANSITION
```

Validation failures continue through the shared validation envelope. SQL, Prisma details, stack traces and unauthorized record details must never leak.

`PROJECT_SCOPE_FORBIDDEN` is reserved for Project resource-policy enforcement. Before Module 24B activation, Stage 7 can enforce company ownership and permission checks but must not pretend that validated project-membership scope already exists.

## Business invariants

Stage 7 must enforce at least:

- authenticated company ownership on every Project read/write;
- unique company Project code;
- active same-company Client;
- optional same-company `WON` Tender;
- active same-company Project Manager user;
- `plannedEndDate >= startDate`;
- explicit lifecycle transitions only;
- close blocked when configured open financial/operational blockers exist;
- lifecycle status/history, audit and outbox changes are transactional;
- repeated lifecycle commands must not create duplicate history/audit/outbox side effects when the requested state is already reached and retry-safe handling is applicable;
- closed Projects reject normal transactional writes;
- later financial activity may make client/currency changes more restrictive, but Stage 7 must not invent Finance tables or source adapters.

Because downstream financial/operational owner schemas are not present yet, Pass 137 freezes close-readiness as a service policy hook/contract. Passes for later owning modules may add concrete blocker checks; Stage 7 must not create fake future tables merely to implement them early.

## Events and audit

Stage-7 emitted event vocabulary is limited to:

```text
project.created
project.activated
project.completed
project.closed
```

The Appendix A event:

```text
project.member_changed
```

is reserved for Stage 8 / Module 24B because membership is deferred there.

Sensitive writes use Foundation audit/outbox behavior. Audit covers:

```text
Project creation
Project master update
activation
completion
close
```

Audit records include actor, company, Project entity ID, request ID and safe before/after values. Passwords, tokens and secrets are never recorded.

## React boundary

When the frontend passes begin, Stage 7 may provide:

```text
Project register
Project create form
Project detail
editable Project master fields
lifecycle controls
commercial/source summary
status history
links/placeholders to later Project modules
```

Stage 7 does not provide team/member management UI because that belongs to Module 24B.

TanStack Query owns server state. React Hook Form + Zod own forms. UI permission hiding is convenience only; the API remains authoritative.

## Stage-7 generation order

After this contract freeze, continue only in this order:

```text
Pass 138  Prisma models, constraints, indexes and reviewed migration
Pass 139  Zod boundary schemas and inferred request types
Pass 140  company-scoped repository
Pass 141  services, lifecycle transactions, invariants, audit and outbox
Pass 142  Fastify routes, index and app registration
Pass 143  PostgreSQL/Fastify integration workflow tests
Pass 144  security, cross-company isolation and database integrity
Pass 145  OpenAPI and stable API contract verification
Pass 146  React Project register/create/detail
Pass 147  React lifecycle, status history and commercial/source summary
Pass 148  Playwright main workflow and permission verification
Pass 149  performance, concurrency, migration/recovery and operations
Pass 150  final Stage-7 acceptance gate
```

After genuine Stage-7 acceptance, continue to:

```text
Stage 8 — Module 24B Project Scope Activation
```

Only after Module 24B should project membership and project-scoped authorization be treated as active. Module 6 WBS & Cost Codes follows, then Module 4B BOQ Project Mapping.

## Pass-137 contract-only boundary

Pass 137 adds no Project runtime code. It does not add a Prisma model, migration, Project API route, repository, service, permission seed, event producer, React production file or `project_members` table.

The maintained contract gate may record:

```text
STAGE_7_CONTRACT_FROZEN_STAGE_6_LIVE_ACCEPTANCE_PENDING
```

while the current Stage-6 live prerequisite remains blocked.

Only genuine upstream evidence containing:

```text
STAGE_6_ACCEPTED_READY_FOR_STAGE_7
```

allows the contract evidence to report that Pass 138 runtime implementation is authorized.

## Pass-138 persistence preparation status

Pass 138 adds only the reviewed Stage-7 persistence needed by the frozen contract:

```text
projects
project_status_history
```

The `projects` table uses database constraints for company-unique project codes, uppercase three-letter currency, valid date order and the reserved Project lifecycle values. Composite foreign keys keep Client, optional Tender and Project Manager references inside the same company. Active Client/manager checks and the requirement that an optional Tender is `WON` remain service invariants for Pass 141 because a foreign key cannot enforce another row's lifecycle state safely.

`project_status_history` is append-ready for the later service transaction and accepts only valid lifecycle values. It references the Project and actor directly and rejects same-status history rows. The service remains responsible for proving the actor belongs to the authenticated company before writing history.

The migration adds only indexes required for Stage-7 Project register and reference lookups. It does not add `project_members`, project-scoped authorization, WBS, cost codes, budgets, procurement, finance or BOQ Project mapping.

Maintained command:

```bash
npm run module-5:persistence:gate
```

Static preparation may record `STAGE_7_PERSISTENCE_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remains required before Stage-7 persistence can be treated as deployable. Pass 139 continues with `projects.schema.ts` and inferred request types.

## Pass-139 Zod boundary preparation status

Pass 139 adds only `apps/api/src/modules/projects/projects.schema.ts`. It converts the already-frozen Stage-7 request contract into strict Zod schemas and inferred TypeScript types without adding repository, service, route or React behavior.

The schema keeps the seven Stage-7 operations and six Appendix permission codes as stable vocabulary. `projects.manage_members` and `project.member_changed` remain reserved for Module 24B and no membership request schema or membership route is introduced.

Concrete request validation now includes:

```text
GET /api/v1/projects
  search optional
  clientId optional UUID
  tenderId optional UUID
  status optional
  page optional >= 1
  pageSize optional 1..100

POST /api/v1/projects
  projectCode
  name
  clientId
  tenderId optional
  currency
  startDate
  plannedEndDate
  projectManagerUserId
  location

PATCH /api/v1/projects/:id
  name optional
  clientId optional
  tenderId optional
  currency optional
  startDate optional
  plannedEndDate optional
  projectManagerUserId optional
  location optional

POST /api/v1/projects/:id/activate
  bodyless

POST /api/v1/projects/:id/complete
  bodyless

POST /api/v1/projects/:id/close
  reason optional
```

Create validates the complete date pair at the API boundary. Update validates the pair when both dates are supplied together; Pass 141 service logic must also compare a one-date PATCH against the stored other date before writing.

Safe Project responses omit internal `companyId`, serialize date-only and timestamp fields as strings, and preserve the reserved Project lifecycle vocabulary. Project detail includes append-only `statusHistory` because Stage 7 defines no separate history endpoint and the reviewed React feature requires status-history display. This is a response-shape decision only and does not add another route or business capability.

Maintained command:

```bash
npm run module-5:schema:gate
```

Static preparation may record `STAGE_7_SCHEMA_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remains required before Stage-7 schemas are treated as deployable. Pass 140 continues with the company-scoped Project repository.


## Pass-140 repository preparation status

Pass 140 adds only `apps/api/src/modules/projects/projects.repository.ts`. The repository accepts either the normal Prisma client or an active service transaction so Pass 141 can keep Project state, status history, audit and outbox work inside one transaction.

Every Project-master read and write derives company ownership from Foundation `requireCompanyRepositoryScope()`. No repository method accepts `companyId`, actor identity, permissions or project scope from a caller. Stage 7 intentionally enforces company ownership only; validated project-membership scope remains deferred to Module 24B.

The repository provides only persistence operations required by the frozen Stage-7 workflow:

```text
bounded Project register + count
find Project by id/code
find existing Project by Tender
find same-company Client
find same-company Tender
find active same-company Project Manager
create DRAFT Project
update editable Project master data
lock Project for lifecycle writes
compare-and-set Project lifecycle status
list append-only status history
append status history under a company-owned Project
```

Normal Project updates cannot change `projectCode`, company ownership or lifecycle `status`; lifecycle changes use the separate expected-status transition method so the service can reject stale or invalid transitions safely.

Pass 140 keeps a same-company Tender-to-Project lookup because Module 3 states that a won Tender may create/link only one primary Project unless an authorized split-award workflow exists. Stage 7 does not invent a split-award command or policy; Pass 141 will apply the existing Tender rule using the repository lookup and the already-frozen Project error contract.

Project status history remains append-only. The repository exposes create/list operations only; it does not expose update/delete history operations.

No `project_members`, project-scoped role assignment, membership route, WBS/cost-code relationship, Budget/Finance persistence or BOQ Project mapping is added.

Maintained command:

```bash
npm run module-5:repository:gate
```

Static preparation may record `STAGE_7_REPOSITORY_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remains required before Stage-7 repository code is treated as deployable. Pass 141 continues with service transactions, lifecycle invariants, audit and outbox behavior.

## Pass-141 service preparation status

Pass 141 adds `apps/api/src/modules/projects/projects.service.ts` and keeps the service layer responsible for Project business rules and transaction boundaries before any Fastify route is generated.

The service exposes only the seven Stage-7 Project workflows:

```text
list Projects
get Project + status history
create Project
update Project master
activate Project
complete Project
close Project
```

Creation validates an active same-company Client, an active same-company Project Manager, the complete date range, and an optional same-company `WON` Tender. The repository adds one small Tender row lock used only while linking a Project so concurrent requests cannot violate Module 3's one-primary-Project rule. No split-award workflow is invented.

Normal Project PATCH remains separate from lifecycle status. A PATCH against a closed Project is rejected, and a one-date PATCH is checked against the other stored date before persistence.

The route-backed lifecycle remains exactly:

```text
DRAFT -> ACTIVE -> COMPLETED -> CLOSED
```

Activation revalidates mandatory Project references. Completion and close use the already-frozen `projects.close` authority because the source defines no separate `projects.complete` permission. Repeating a lifecycle command after the requested target state is already reached returns the current Project without adding duplicate history, audit or outbox side effects.

Project creation writes the initial `null -> DRAFT` status-history row. Later lifecycle commands append one history row in the same transaction as the status change, audit entry and approved outbox event. Stage 7 emits only:

```text
project.created
project.activated
project.completed
project.closed
```

Project master updates are audited as `project.updated` but do not invent a `project.updated` domain event.

Concrete Finance/Procurement/WBS blocker tables do not exist yet. Close readiness therefore uses one optional service callback that later owning modules can supply. If that configured check reports a blocker, the service returns `PROJECT_NOT_READY_TO_CLOSE`; Stage 7 does not create fake future tables merely to perform an early close check.

`project_members`, member routes, `projects.manage_members` runtime behavior and `project.member_changed` emission remain deferred to Module 24B.

Maintained command:

```bash
npm run module-5:service:gate
```

Static preparation may record `STAGE_7_SERVICE_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remains required before Stage-7 service code is treated as deployable. Pass 142 continues with Fastify routes, module registration and app wiring.


## Pass-142 HTTP preparation status

Pass 142 completes the required five-file Project backend with:

```text
apps/api/src/modules/projects/
├── projects.schema.ts
├── projects.repository.ts
├── projects.service.ts
├── projects.routes.ts
└── index.ts
```

The HTTP layer registers exactly the seven Stage-7 operations frozen by this contract:

```text
GET   /api/v1/projects
POST  /api/v1/projects
GET   /api/v1/projects/:id
PATCH /api/v1/projects/:id
POST  /api/v1/projects/:id/activate
POST  /api/v1/projects/:id/complete
POST  /api/v1/projects/:id/close
```

All seven routes authenticate before business work, apply the frozen route-level permission, validate with the existing Zod schemas, delegate to `ProjectsService`, and serialize safe response DTOs. Project company ownership, actor identity, permissions, project scope and lifecycle status are never accepted from the request body.

Completion is protected by `projects.close`, matching the Pass-137 permission decision because the source provides no `projects.complete` permission. Activation and completion remain bodyless command endpoints. Close accepts only the optional `reason`.

`PUT /api/v1/projects/:id/members`, `projects.manage_members` runtime behavior, `project_members`, Project-role scope validation, Project-scoped authorization and `project.member_changed` remain reserved for Module 24B. No suspend/resume/reopen route is introduced.

`apps/api/src/app.ts` now registers `registerProjectsRoutes` when the database dependency is available. OpenAPI metadata is present for all seven operations, but Pass 145 remains responsible for the dedicated generated OpenAPI/stable-error verification.

Maintained command:

```bash
npm run module-5:http:gate
```

Static preparation may record `STAGE_7_HTTP_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remains required before Stage-7 HTTP code is treated as deployable. Pass 143 continues with real PostgreSQL and Fastify integration workflow tests.

## Pass-143 integration preparation status

Pass 143 adds one focused real PostgreSQL/Fastify workflow suite at `tests/integration/module-5-api.integration.test.mjs`. It reuses the existing disposable integration database, Module 24A sign-in flow and the real built API rather than adding another test framework or mock Project runtime.

The workflow proves the Stage-7 Project master end to end:

```text
active Client + active Project Manager + WON Tender
        ↓
create DRAFT Project
        ↓
list/get Project + initial status history
        ↓
update editable Project master data
        ↓
DRAFT -> ACTIVE
        ↓
ACTIVE -> COMPLETED
        ↓
COMPLETED -> CLOSED
        ↓
verify Project row + append-only history + audit + outbox
```

Lifecycle retries are deliberately repeated and must not duplicate history, audit or outbox side effects. A closed Project must reject normal master-data PATCH with `INVALID_PROJECT_STATUS_TRANSITION`.

The integration suite also proves Module 3's existing award rule: one `WON` Tender can link to only one primary Project unless a separately authorized split-award workflow exists. A second Project request for the same Tender must fail before a second Project, status-history row, audit entry or outbox event is created. Stage 7 does not invent split-award behavior.

The live command is explicitly destructive-test guarded:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:module-5
```

Maintained gates:

```bash
npm run module-5:integration:gate
RUN_FOUNDATION_DB_TESTS=1 npm run module-5:integration:gate:live
```

The live gate additionally requires genuine Module 4A evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7`. Static preparation may therefore record `STAGE_7_INTEGRATION_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`, but it cannot claim the PostgreSQL/Fastify workflow has executed live while Stage 6 remains blocked.

Pass 144 remains responsible for the full negative permission matrix, cross-company HTTP/repository/service isolation and direct PostgreSQL foreign-key/check/index attack tests. `project_members`, membership routes, `projects.manage_members` runtime behavior and `project.member_changed` remain deferred to Module 24B.

## Pass-144 security, isolation and database-integrity preparation status

Pass 144 extends the existing Module 5 PostgreSQL/Fastify integration suite instead of creating another test framework. The security selection now covers all seven protected Stage-7 Project routes, the five active Stage-7 route authorities (`projects.read`, `projects.create`, `projects.update`, `projects.activate`, `projects.close`), and confirms that `projects.manage_members` remains reserved for Module 24B.

The same suite creates a second company and proves that Project lists hide foreign-company rows, foreign Project detail/update/lifecycle requests resolve as `PROJECT_NOT_FOUND`, and foreign Client, Tender and Project Manager references cannot be used to create a Project in the authenticated company. Direct repository and service calls are also exercised under trusted request context so company isolation does not depend only on the HTTP layer.

Strict request tests reject client-supplied company, actor, permission, project-scope and lifecycle authority. Direct PostgreSQL attacks cover same-company composite foreign keys, company-unique Project code, currency/date/status checks, lifecycle-history checks and the reviewed Stage-7 index/constraint catalog. Public errors are checked for SQL, Prisma and stack-detail leakage.

Maintained commands:

```bash
npm run module-5:security:gate
RUN_FOUNDATION_DB_TESTS=1 npm run test:security:module-5
RUN_FOUNDATION_DB_TESTS=1 npm run module-5:security:gate:live
```

The live gate still requires genuine Module 4A evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7`. Static preparation may therefore record `STAGE_7_SECURITY_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`; only a genuine live run may record `STAGE_7_SECURITY_VERIFIED_READY_FOR_PASS_145`.

Pass 144 changes no Project production runtime file. `project_members`, membership routes, `projects.manage_members` runtime behavior and `project.member_changed` remain deferred to Module 24B. Pass 145 continues with generated OpenAPI, exact API-contract and stable-error verification.

## Pass-145 OpenAPI, exact API-contract and stable-error preparation status

Pass 145 keeps the seven Stage-7 Project business operations unchanged and strengthens only their generated OpenAPI/API-contract verification. The generated `/openapi.json` document must contain exactly:

```text
GET   /api/v1/projects
POST  /api/v1/projects
GET   /api/v1/projects/:id
PATCH /api/v1/projects/:id
POST  /api/v1/projects/:id/activate
POST  /api/v1/projects/:id/complete
POST  /api/v1/projects/:id/close
```

Every operation documents bearer authentication, strict path/query/body schemas and the existing shared success/error envelope. Create and update schemas must not expose company, actor, permission, project-scope or lifecycle authority. Activation and completion remain bodyless commands. Close documents only the optional `reason` field already frozen by Stage 7.

Pass 145 narrows OpenAPI `409` error enums to the conflicts each route can actually emit:

```text
create   -> DUPLICATE_PROJECT_CODE
update   -> INVALID_PROJECT_STATUS_TRANSITION
activate -> INVALID_PROJECT_STATUS_TRANSITION
complete -> INVALID_PROJECT_STATUS_TRANSITION
close    -> PROJECT_NOT_READY_TO_CLOSE | INVALID_PROJECT_STATUS_TRANSITION
```

`PROJECT_SCOPE_FORBIDDEN` remains reserved vocabulary for the later Module 24B Project Scope Activation gate. Stage 7 does not document it as an active route error because validated Project membership/scope is not yet enabled. Ordinary route permission denial remains `FORBIDDEN`.

The generated-contract test must also prove there is no Stage-7 membership route, generic DELETE/status endpoint, suspend/resume/reopen command or other undocumented Project operation.

Maintained commands:

```bash
npm run module-5:api-contract:gate
RUN_FOUNDATION_DB_TESTS=1 npm run test:api-contract:module-5
RUN_FOUNDATION_DB_TESTS=1 npm run module-5:api-contract:gate:live
```

Static preparation may record `STAGE_7_API_CONTRACT_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Only a genuine live run after `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` may record `STAGE_7_API_CONTRACT_VERIFIED_READY_FOR_PASS_146`.

Pass 145 adds no Project business route, repository method, service method, table, migration, permission or domain event. `project_members`, `projects.manage_members` runtime behavior, `project.member_changed` and validated Project-scoped authorization remain deferred to Module 24B. Pass 146 continues with the Project register/create/detail React feature.

## Pass-146 React register/create/detail preparation status

Pass 146 adds the first Stage-7 Project Management React surface without changing the reviewed backend contract. The web feature is intentionally limited to the Project register, Project creation and read-only Project detail/lifecycle history:

```text
apps/web/src/features/projects/
├── api/projects-api.ts
├── hooks/projects.ts
├── components/project-details-panel.tsx
└── pages/projects-page.tsx
```

The Project register uses the reviewed server-side `search`, `status`, `clientId`, `tenderId`, `page` and `pageSize` filters. The create form uses React Hook Form + Zod and sends only `projectCode`, `name`, `clientId`, optional `tenderId`, `currency`, `startDate`, `plannedEndDate`, `projectManagerUserId` and `location`.

When the current role may read the related master modules, the form loads active Clients, WON Tenders and active company users as Project Manager choices. When those read permissions are absent, the form falls back to validated UUID entry instead of making unauthorized API requests. Company ownership, actor identity, permissions, Project scope, lifecycle status and status history remain server-owned.

Project detail uses the existing `GET /api/v1/projects/:id` response and displays the append-only lifecycle history. Pass 146 deliberately does not add edit, activate, complete or close controls; those remain Pass 147 work. It also does not add Project membership UI, `projects.manage_members`, `project_members`, member routes or `project.member_changed`; those remain Module 24B responsibilities.

Maintained command:

```bash
npm run module-5:react-register:gate
```

Static preparation may record `STAGE_7_REACT_REGISTER_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. A dependency-backed web build and genuine Module 4A evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` are still required before this UI is considered runtime-verified. Pass 147 continues with Project editing, lifecycle controls and the Stage-7 commercial/source summary.

## Pass-147 React edit/lifecycle/commercial-summary preparation status

Pass 147 completes the Stage-7 Project Management React workflow by extending the existing four Project frontend files rather than creating another UI abstraction. The browser now uses the already-reviewed `PATCH`, activate, complete and close operations while preserving server ownership of company, actor, permission, Project scope and lifecycle state.

The edit form exposes only `name`, `clientId`, optional replacement `tenderId`, `currency`, `startDate`, `plannedEndDate`, `projectManagerUserId` and `location`. `projectCode` remains creation-only, and a closed Project does not expose the normal edit form. The current Stage-7 PATCH accepts an optional Tender UUID but no nullable clear command, so the UI does not pretend that an existing Tender link can be cleared.

Lifecycle controls remain permission-aware and explicit:

```text
projects.activate + DRAFT     -> POST /activate, no body
projects.close    + ACTIVE    -> POST /complete, no body
projects.close    + COMPLETED -> POST /close, optional reason only
```

No `projects.complete` permission is invented. The persistence-only `SUSPENDED` value still has no Stage-7 suspend/resume browser command because the source contract defines no such API.

The commercial/source summary is read-only and source-derived. Client details are requested only when `clients.read` is present; linked Tender details are requested only when `tenders.read` is present. The Project module does not persist or calculate opportunity totals, Tender amounts, budget, finance or billing values. Downstream Project modules remain placeholders until their owning stages exist.

Project membership remains completely deferred to Module 24B: no `project_members`, membership route, `projects.manage_members` UI, project-scope activation or `project.member_changed` behavior is added.

Maintained command:

```bash
npm run module-5:react-workflow:gate
```

Static preparation may record `STAGE_7_REACT_WORKFLOW_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. A dependency-backed web build and genuine Module 4A live evidence containing `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` remain required before this React workflow is considered runtime-verified. Pass 148 continues with the Project Playwright browser workflow and permission verification.

## Pass-148 Playwright workflow and permission verification status

Pass 148 adds one focused Playwright suite for the completed Stage-7 Project browser workflow. It uses the real authentication form, real Fastify API and disposable PostgreSQL database rather than mocking Project responses.

The main browser path covers:

```text
WON Tender + active Client + active Project Manager
        ↓
Create DRAFT Project
        ↓
read Client/Tender source summary
        ↓
edit allowed Project master fields
        ↓
DRAFT -> ACTIVE
        ↓
ACTIVE -> COMPLETED
        ↓
COMPLETED -> CLOSED
        ↓
verify lifecycle history, audit and outbox
```

The browser suite also proves that read-only, updater-only, activator-only and closer-only roles see only their reviewed controls, while direct API attempts still return `403` for unauthorized writes. A user without `projects.read` receives no Project navigation and creates no `/api/v1/projects` request.

Outgoing Project writes are inspected so the browser never supplies company ownership, actor identity, permissions, Project scope, lifecycle status/history or status actor fields. Create/update use only reviewed business fields; activate and complete remain bodyless; close sends only optional `reason`.

Project membership remains outside Stage 7. The Playwright suite makes no `/members` request and adds no `project_members`, `projects.manage_members` UI or `project.member_changed` behavior before Module 24B.

Maintained commands:

```bash
npm run module-5:playwright:gate
RUN_MODULE_5_E2E=1 TEST_DATABASE_URL=<disposable-db> npm run test:e2e:module-5
RUN_MODULE_5_E2E=1 RUN_FOUNDATION_DB_TESTS=1 npm run module-5:playwright:gate:live
```

Static preparation may record `STAGE_7_PLAYWRIGHT_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Only a genuine browser run after `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` may record `STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149`.

Pass 149 continues with Module 5 performance, concurrency, migration/recovery and operational verification.

## Pass-149 operational verification status

Pass 149 adds no Project production behavior. It extends the existing PostgreSQL/Fastify integration suite to verify concurrent duplicate Project creation, the one-primary-Project Tender rule, retry-safe activate/complete/close commands, and rollback of losing concurrent transactions.

Operational query-plan checks use real PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` against medium-sized data and require the reviewed Project register and lifecycle-history indexes. No hardware-specific millisecond threshold is used.

The maintained live gate also reruns clean and previous-schema migration verification before the operational PostgreSQL selection. Live verification requires both `STAGE_6_ACCEPTED_READY_FOR_STAGE_7` and `STAGE_7_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_149` evidence.

Maintained commands:

```bash
npm run module-5:operations:gate
RUN_FOUNDATION_DB_TESTS=1 TEST_DATABASE_URL=<disposable-db> npm run test:operations:module-5
RUN_FOUNDATION_DB_TESTS=1 npm run module-5:operations:gate:live
```

Static preparation may record `STAGE_7_OPERATIONS_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Only a genuine live run may record `STAGE_7_OPERATIONS_VERIFIED_READY_FOR_PASS_150`. Project membership, `projects.manage_members` runtime behavior and `project.member_changed` remain deferred to Module 24B.

Pass 150 is the Module 5 final Stage-7 acceptance gate.



## Pass-150 final Stage-7 acceptance status

Pass 150 adds no Project business behavior. It provides one maintained final Stage-7 gate that reruns the static Module 5 contract and, only after genuine `STAGE_6_ACCEPTED_READY_FOR_STAGE_7`, can execute the dependency-backed install, typecheck, lint, Prisma validation/generation, clean/previous migration verification, build, complete PostgreSQL/Fastify integration suite and Module 5 Playwright workflow.

Maintained commands:

```bash
npm run module-5:gate
npm run module-5:gate:live
npm run module-5:acceptance:live
```

Static preparation may record `STAGE_7_STATIC_GATE_PASSED_STAGE_6_LIVE_ACCEPTANCE_PENDING`. Only a genuine successful live run may record `STAGE_7_ACCEPTED_READY_FOR_STAGE_8`.

Stage 7 remains limited to `projects` and `project_status_history`. `project_members`, `projects.manage_members` runtime behavior, `project.member_changed` and validated project-scoped authorization remain owned by Module 24B. After genuine Stage-7 live acceptance, the next dependency-aware stage is Module 24B Project Scope Activation.

## Pass 366 amendment — Controlled Project suspension / resumption

The source workflow requires Projects to move through a controlled `SUSPENDED` state, but the original Stage-7 route table listed only activate, complete and close. Pass 366 is a narrow repair amendment for that mismatch; the original seven source-defined Module-5 operations remain preserved as historical source inventory.

Pass 366 adds exactly these two repair commands:

```text
POST /api/v1/projects/:id/suspend
POST /api/v1/projects/:id/resume
```

The reviewed transition contract is intentionally small:

```text
ACTIVE
  ↓ suspend  [projects.close]
SUSPENDED
  ↓ resume   [projects.activate]
ACTIVE
```

Both commands accept only optional `reason`. The server still derives actor, Company, Project scope and lifecycle state. Suspension/resumption uses the existing row-lock + conditional-status transition repository methods and writes `project_status_history` plus Foundation audit evidence in the same transaction. A repeat command against its already-reached target state is idempotent and creates no duplicate history/audit row.

Resume revalidates the same active Client, optional WON Tender, active Project Manager and valid date-range conditions used by activation before it returns the Project to `ACTIVE`.

No new Project permission, stable error, table, Prisma model, migration, repository method or generic status endpoint is introduced. The source event vocabulary remains `project.created`, `project.activated`, `project.member_changed`, `project.completed` and `project.closed`; Pass 366 therefore does **not** invent `project.suspended` or `project.resumed` outbox event types. Audit actions `project.suspended` and `project.resumed` are used only as durable lifecycle audit evidence.

While a Project is `SUSPENDED`, normal downstream operational writes are rejected by modules that already own a writable-Project guard. Administrative Project reads and the existing Project master/member controls remain governed by their current contracts. There is no generic `/status` endpoint and no Project reopen command in this repair.

The React Project detail uses the same permission mapping: `projects.close` exposes **Suspend Project** for `ACTIVE`, while `projects.activate` exposes **Resume Project** for `SUSPENDED`. The UI remains advisory; Fastify/service authorization is authoritative.

