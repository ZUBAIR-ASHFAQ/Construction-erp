# Stage 9 — Module 6 WBS & Cost Codes Contract

## Purpose

Stage 9 freezes the executable boundary for **Module 6 — WBS & Cost Codes** before any Module-6 Prisma model, migration, backend module or React feature is generated.

Module 6 is the Project Controls owner for the work-breakdown and cost-classification structure used later by budgets, commitments, actuals and forecasts.

## Correct dependency-aware position

The controlling order is:

```text
Stage 7  Module 5 - Project Management
Stage 8  Module 24B - Project Scope Activation
Stage 9  Module 6 - WBS & Cost Codes
Stage 10 Module 4B - BOQ Project Mapping
```

Module 6 depends on the existing Project master. Project-scoped authorization is already owned by Module 24B and must be consumed rather than recreated.

The Stage-9 contract may be reviewed and frozen while the Stage-8 repair/live handoff remains pending. That does not authorize Module-6 production runtime activation or deployment.

## Stage-9 ownership boundary

Module 6 owns exactly these source-defined business tables:

```text
wbs_nodes
cost_codes
cost_types
project_cost_codes
```

Module 6 does not own:

```text
projects
project_members
user_role_assignments
BOQ project/WBS/cost-code foreign keys
budgets
commitments
actuals
forecasts
procurement transactions
finance journals
```

The BOQ Project/WBS/cost-code relationship belongs to the following **Module 4B** gate and must not be generated during Stage 9.

## Persistence contract

### wbs_nodes

Source-defined fields:

```text
id
company_id
project_id
parent_id nullable
code
name
level
status
sort_order
```

Required relationship rules:

- `company_id` resolves to the Foundation Company master.
- `project_id` resolves to the existing Module-5 Project and must belong to the same Company.
- `parent_id`, when present, references another WBS node in the same Project hierarchy.
- sibling WBS codes are unique inside one Project hierarchy level/parent scope.
- hierarchy cycles are forbidden.
- referenced nodes remain historical and are not hard deleted.

The source names `level` and `status` as persisted fields but does not define whether `level` is browser-supplied or server-derived and does not enumerate public WBS status values. Later schema/service passes must not silently invent public values or client authority.

### cost_codes

Source-defined fields:

```text
id
company_id
code
name
category
status
```

Cost Codes are Company-owned classifications. The source requires a Cost Code master and says referenced codes cannot be hard deleted.

The source does not enumerate `category` or public Cost Code status values. Passes must keep that ambiguity explicit until a reviewed contract decision is made.

### cost_types

Source-defined fields:

```text
id
company_id
code
name
status
```

Cost Types are Company-owned classifications used by posting combinations.

The source requires users to create or select Cost Types and requires a React Cost Type master, but the reviewed route table contains no Cost Type read/create operation. Stage 9 must not silently invent `/api/v1/cost-types` routes.

### project_cost_codes

Source-defined fields:

```text
id
project_id
wbs_node_id
cost_code_id
cost_type_id
is_posting_allowed
status
```

A mapping must reference a valid Project/WBS/Cost Code/Cost Type combination. The WBS node must belong to the target Project. Company-owned Cost Code and Cost Type records must belong to the Project's Company.

The source requires replacement of the allowed Project mapping set through the reviewed mapping command. Duplicate mapping combinations must be prevented by persistence/service validation.

## Exact reviewed Stage-9 API surface

Freeze exactly these seven source-defined operations:

```text
GET   /api/v1/projects/:projectId/wbs
POST  /api/v1/projects/:projectId/wbs/nodes
PATCH /api/v1/projects/:projectId/wbs/nodes/:id
GET   /api/v1/cost-codes
POST  /api/v1/cost-codes
PUT   /api/v1/projects/:projectId/cost-code-assignments
POST  /api/v1/projects/:projectId/wbs/freeze
```

Do not add generic CRUD or undocumented commands such as:

```text
DELETE /api/v1/projects/:projectId/wbs/nodes/:id
GET    /api/v1/cost-types
POST   /api/v1/cost-types
PATCH  /api/v1/cost-codes/:id
DELETE /api/v1/cost-codes/:id
POST   /api/v1/projects/:projectId/wbs/reopen
POST   /api/v1/projects/:projectId/wbs/archive
```

unless the controlling contract is explicitly amended.

## Request authority boundary

All normal Module-6 routes require active authentication. Company, Project scope and actor identity come from trusted request context.

The browser must never be allowed to provide authoritative values such as:

```text
companyId
actorUserId
permissions
projectScope
effectivePermissions
createdBy
updatedBy
```

The route path owns the target `projectId` for Project-scoped commands. Nested rows must not be able to substitute a different authoritative Project.

Dates, UUIDs and other typed values are normalized at the API boundary. Validation failures use the shared readable validation envelope.

## Permissions

Freeze the five source-defined stable permission codes:

```text
wbs.read
wbs.manage
cost_codes.read
cost_codes.manage
wbs.freeze
```

The source does not define a separate Cost Type permission. Stage 9 must not invent one during this contract pass.

Intended reviewed route mapping:

```text
wbs.read          -> GET Project WBS
wbs.manage        -> create/update WBS nodes and replace Project cost-code mappings
cost_codes.read   -> list Company Cost Codes
cost_codes.manage -> create Company Cost Code
wbs.freeze        -> freeze Project cost structure
```

Sensitive Project writes require service/resource-policy revalidation in addition to route authentication/permission checks.

## Stable source errors

Freeze the five source-defined business error codes:

```text
WBS_NODE_NOT_FOUND
DUPLICATE_WBS_CODE
WBS_CYCLE_DETECTED
COST_CODE_IN_USE
INVALID_POSTING_COMBINATION
```

The source discusses a frozen baseline but does not define a dedicated frozen/reopen error. Do not add a new public error code merely for implementation convenience during Pass 176.

## Business rules

Stage 9 must preserve these source rules:

- transactional documents reference IDs rather than free-text classifications;
- WBS sibling codes are unique inside the Project;
- hierarchy cycles are forbidden;
- posting combinations reference active Project/WBS/Cost Code/Cost Type records;
- referenced nodes/codes cannot be hard deleted;
- frozen WBS baseline changes require a controlled revision or authorized reopen;
- only leaf/posting-enabled nodes may receive actual cost when configured;
- repository queries enforce Company ownership and allowed Project scope before returning or mutating records.

The reviewed route table exposes `freeze` but no reopen/revision command. Therefore Stage 9 may implement the documented freeze command, but it must not invent a reopen API. Final Stage-9 acceptance must keep the missing reopen path explicit unless the contract is reconciled first.

## Events, audit and outbox

Freeze these source event names:

```text
wbs.node_created
wbs.updated
cost_code.created
project.cost_structure_frozen
```

Meaningful hierarchy changes, Cost Code mapping changes and freeze/reopen actions are audit-sensitive. Audit entries include actor, Company/Project scope, entity, request ID and important before/after values without secret material.

Durable domain events use the existing Foundation outbox after successful business validation. Core transaction correctness never depends on a background worker.

The source mentions optional notification when a cost structure is frozen or reopened. No new synchronous notification dependency is created by Module 6.

## Required backend structure after implementation

When production generation is authorized, Module 6 must use exactly:

```text
apps/api/src/modules/wbs-cost-codes/
├── wbs-cost-codes.schema.ts
├── wbs-cost-codes.repository.ts
├── wbs-cost-codes.service.ts
├── wbs-cost-codes.routes.ts
└── index.ts
```

Prisma schema and migrations remain centralized under `packages/database/prisma/`.

Do not introduce controller/use-case/domain/helper layers merely to wrap these five files.

## Required React structure after backend/OpenAPI acceptance

The reviewed feature path is:

```text
apps/web/src/features/wbs-cost-codes/
├── api/
├── hooks/
├── components/
└── pages/
```

Minimum source UI:

```text
WBS tree editor
Cost Code master
Cost Type master
Project mapping matrix
validation issues
freeze status
```

TanStack Query owns server state. React Hook Form + Zod handle forms. The API remains authoritative.

The Cost Type master cannot be truthfully completed from the seven reviewed routes alone. That is an explicit contract ambiguity, not permission to create an undocumented API.

## Source-contract ambiguities frozen by Pass 176

Pass 176 records these unresolved points and does not silently resolve them:

1. **Cost Type master vs API route table** — workflow/UI require Cost Type create/select/master behavior, but no Cost Type list/create endpoint is defined.
2. **Archive unused codes vs API route table** — workflow says unused codes may be archived, but no Cost Code/WBS archive command is defined.
3. **Frozen baseline reopen/revision vs API route table** — business rules and notifications mention reopen/revision behavior, but only the freeze command is defined.
4. **Public status/category values** — table fields contain statuses/category, but the source does not enumerate their API values.
5. **WBS `level` ownership** — `level` is persisted, but the source does not explicitly state whether it is client input or server-derived hierarchy metadata.

These ambiguities do not justify generic CRUD. Persistence and internal validation can be prepared around the reviewed ownership model, but HTTP/React completion and final Stage-9 acceptance must not pretend the missing source contract exists.

## Pass sequence after this freeze

```text
Pass 176 contract freeze + ambiguity review
Pass 177 Prisma models + migration
Pass 178 Zod boundary
Pass 179 repository
Pass 180 service/business rules
Pass 181 Fastify routes + registration
Pass 182 PostgreSQL/Fastify integration
Pass 183 Project-scope security regression
Pass 184 OpenAPI contract
Pass 185 React API/hooks registration
Pass 186 React workflow
Pass 187 Playwright
Pass 188 operations/concurrency/readiness
Pass 189 final Stage-9 acceptance
Pass 190 Module 4B BOQ Project Mapping
```

## Pass-176 production boundary

Pass 176 is contract-only.

It must not create:

```text
WBS Prisma models
Module-6 migration
apps/api/src/modules/wbs-cost-codes/
apps/web/src/features/wbs-cost-codes/
Module-6 API registration
Module-6 permissions
Module-6 runtime events
```

The existing Stage-8 repair hold remains authoritative. Production Module-6 runtime activation is not accepted until Pass 174/175 live evidence genuinely clears that hold.

## Pass 177 persistence implementation note

Pass 177 prepares the four source-owned Prisma models and one append-only Stage-9 migration:

```text
wbs_nodes
cost_codes
cost_types
project_cost_codes
```

Persistence now enforces same-company Project ownership, root/child sibling-code uniqueness, no self/cyclic WBS parenting, Company-owned Cost Code/Cost Type uniqueness, and Project/WBS/Cost Code/Cost Type mapping consistency.

Pass 177 intentionally keeps source ambiguities unresolved rather than hiding them in persistence:

- status and Cost Code category remain nonblank string-backed fields because the source does not enumerate public values;
- `level` is persisted and constrained non-negative, but its API ownership remains for the schema/service contract to reconcile;
- no Cost Type HTTP route is created;
- no archive/reopen route is created;
- no `is_frozen`, `frozen_at` or extra `project_cost_structures` table is invented because the source defines a freeze command without defining durable Project-level freeze storage.

This is persistence preparation only. No `apps/api/src/modules/wbs-cost-codes/` runtime module or React feature exists yet, and runtime/deployment acceptance remains blocked until the genuine Stage-8 live handoff is complete.


## Pass 178 Zod boundary implementation note

Pass 178 creates only:

```text
apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.schema.ts
```

The remaining repository/service/routes/index files stay ungenerated until their reviewed passes.

The boundary covers exactly the seven reviewed Stage-9 operations. It accepts no client-owned Company, actor, permission or Project-scope authority. For Project-scoped commands, `projectId` comes only from the route path and is not accepted again inside request bodies.

Pass 178 makes one explicit safety decision for the previously unresolved WBS `level` ownership: **`level` is response-only and will be server-derived from hierarchy**. A browser may choose `parentId`, but it may not submit a trusted hierarchy level. This is an implementation safety decision rather than a source-enumerated API field rule, and it prevents a child from claiming an inconsistent level.

The source's public status/category vocabulary remains unresolved. The Zod boundary therefore uses only bounded nonblank strings for WBS status, Cost Code status/category and mapping status; it does not invent enums such as `ACTIVE`, `INACTIVE` or `ARCHIVED`.

The Cost Type route ambiguity also remains unresolved. No Cost Type list/create request schema, permission or HTTP route is added. Project assignment input may reference a `costTypeId` because that relationship is source-owned, but later HTTP/React completion must not pretend the missing Cost Type master API exists.

The whole-set Project mapping command now has safe readback in the existing WBS read contract:

```text
GET /api/v1/projects/:projectId/wbs
  -> nodes[]
  -> assignments[]
```

This does not add a route. It prevents a replace-all editor from starting with an unknown assignment set and accidentally deleting existing mappings.

The freeze command remains bodyless. Its response acknowledges only `projectId`; Pass 178 intentionally does not invent `isFrozen`, `frozenAt` or another durable freeze-state field because Pass 177 confirmed that the source does not define the required persistence for those values.

Still unresolved after Pass 178:

- Cost Type create/list/master HTTP contract;
- archive commands for unused codes/nodes;
- reopen/revision command and durable freeze-state model;
- public status/category vocabularies.

Runtime/deployment activation remains blocked until the genuine Stage-8 Pass-174/175 live handoff succeeds.

## Pass 179 repository implementation note

Pass 179 creates `wbs-cost-codes.repository.ts` as the second file in the required five-file backend sequence. It does not create service/routes/index files.

Repository ownership rules are intentionally simple:

- `companyId` always comes from `requireCompanyRepositoryScope()`;
- Project-scoped WBS reads/writes include the requested `projectId` and same-Company Project relationship;
- Project mapping reads/writes traverse a same-Company Project because `project_cost_codes` itself does not own `company_id`;
- mapping creation verifies candidate WBS nodes are in the same Project and Cost Codes/Cost Types are in the active Company before create-many;
- whole-set replacement remains a service transaction in Pass 180, so the repository exposes separate list/delete/create primitives plus one Project row lock;
- no repository method creates unsupported Cost Type CRUD, archive or reopen business operations.

The repository does not attempt to decide whether a User may access a Project. Exact Project membership/permission authorization is a service/resource-policy responsibility using Module 24B trusted request scope. This keeps authentication/authorization separate from persistence while still preventing cross-Company and cross-Project data access at the repository boundary.

Still deferred to Pass 180: hierarchy-cycle business checks, derived `level`, posting eligibility/active-record semantics, freeze behavior, audit/outbox events and stable Module-6 business-error mapping.

## Pass 180 service implementation note

Pass 180 adds only:

```text
apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts
```

The service keeps the implementation deliberately small and reuses the existing Module 24B Project authorization path. Every Project-scoped read/write revalidates the authenticated Project scope and the exact effective permission through `AdministrationRepository.findEffectivePermissionCodesForProject()`; Company, actor, permissions and Project scope never come from request bodies.

WBS creation derives `level` from the selected parent. WBS updates reject self/descendant parenting before persistence, keep sibling-code uniqueness, and shift descendant levels in the same transaction when a node moves to another hierarchy level. The database trigger remains a defensive second layer for concurrent or out-of-band writes.

Project cost-code assignment replacement is one transaction: lock Project cost structure, validate the Project plus every referenced WBS node/Cost Code/Cost Type, remove the old set, create the replacement set, then append one audit record. The service interprets the source term "active" case-insensitively without creating a public Zod enum; the public status/category vocabulary remains unresolved.

Pass 180 emits only the four reviewed source events:

```text
wbs.node_created
wbs.updated
cost_code.created
project.cost_structure_frozen
```

Mapping replacement is audit-sensitive but emits no invented `project.cost_code_assignments_changed` domain event because that event is not in the source list.

The freeze command remains intentionally limited. It locks and validates the Project, records audit/outbox evidence, and returns only `projectId`. It does **not** invent `isFrozen`, `frozenAt`, a Project-cost-structure table, or a reopen endpoint. Because the source defines no durable freeze-state storage/revision/reopen contract, Pass 180 cannot truthfully enforce post-freeze mutation blocking across later requests. That remains an explicit Stage-9 acceptance ambiguity rather than hidden implementation behavior.

Pass 180 does not create Cost Type CRUD, archive/reopen commands, routes/index registration, React code or Module 4B relationships. The next pass is **Pass 181 - Module 6 Fastify routes + registration**.

## Pass-184 OpenAPI/API-contract checkpoint

Pass 184 keeps the HTTP surface at exactly seven reviewed Module-6 operations and verifies generated `/openapi.json` against the frozen contract. Every operation uses bearer security, strict request schemas, exact public success DTOs and the shared error envelope with `requestId` inside `error`.

The OpenAPI contract exposes only error codes that a current reviewed operation can actually emit. `COST_CODE_IN_USE` remains a frozen source error code, but the reviewed seven-route API has no Cost Code archive/delete command, so Pass 184 does not invent an endpoint merely to expose that code.

Still intentionally absent after Pass 184:

```text
Cost Type CRUD
Cost Code/WBS archive commands
WBS reopen/revision command
DELETE endpoints
generic Module-6 CRUD
```

## Pass-185 React API/hooks checkpoint

Pass 185 adds only the browser transport and TanStack Query boundary required before the dedicated Module-6 workflow UI pass:

```text
apps/web/src/features/wbs-cost-codes/
├── api/
│   └── wbs-cost-codes-api.ts
└── hooks/
    └── wbs-cost-codes.ts
```

The browser API maps exactly to the seven reviewed Module-6 operations. Project identity comes from the selected route context, while Company, actor, permissions, Project scope and derived WBS `level` remain server-owned. Cost Code listing exposes only the reviewed bounded `page` and `pageSize` query options. The freeze request remains bodyless.

TanStack Query owns Module-6 server state through one small query family. Successful WBS, Cost Code, mapping and freeze mutations invalidate that family so later Pass-186 components reload authoritative server readback instead of maintaining duplicate client state.

Pass 185 intentionally does not create components or pages. It also does not invent Cost Type CRUD, archive controls, durable freeze-state fields or reopen/revision browser APIs. The source-contract gaps recorded by Pass 176 therefore remain visible for Pass 186 and final Stage-9 acceptance.

The next preparation pass is **Pass 186 - Module 6 React WBS tree, Cost Code, Project mapping, validation and freeze workflow**.

## Pass-186 React workflow checkpoint

Pass 186 adds only the focused frontend workflow files required after the reviewed Module-6 OpenAPI and browser-hook boundary:

```text
apps/web/src/features/wbs-cost-codes/
├── api/
│   └── wbs-cost-codes-api.ts
├── hooks/
│   └── wbs-cost-codes.ts
├── components/
│   └── wbs-cost-structure-workspace.tsx
└── pages/
    └── wbs-cost-codes-page.tsx
```

The workflow consumes only the seven reviewed Module-6 HTTP operations. It renders the WBS tree with server-derived `level`, provides WBS create/update forms, bounded Cost Code list/create UI, edits the complete Project mapping set and invokes the bodyless freeze command. Company, actor, permissions, Project scope and hierarchy authority remain server-owned.

The source gaps frozen by Pass 176 remain explicit. There is still no reviewed Cost Type list/create route, archive command, durable freeze-state field, or reopen/revision command, so Pass 186 does not fabricate those features. Existing Cost Type UUIDs can be entered only as relationships in the reviewed mapping command.

The current auth identity contract exposes Company-scope permissions and resolved Project scope, but not exact effective permission codes for each Project. Backend Module-6 services continue to enforce exact Project permissions. The frontend therefore keeps Company-permission action controls strict and records Project-scoped action visibility as an unresolved contract limitation rather than inventing a permission-discovery endpoint.

The next pass is **Pass 187 - Module 6 Playwright WBS, Cost Code, mapping, permission and freeze workflow verification**.

## Pass 359 post-Stage-23 repair amendment — durable freeze and controlled reopen

Pass 358 later classified the missing durable WBS freeze as `REPAIR_BEFORE_STAGE_24`. Pass 359 therefore amends only the current Module-6 freeze/reopen contract; the historical Pass-176→189 notes above remain evidence of what Stage 9 originally implemented.

The repair adds one Module-6 support table, not a new ERP business module:

```text
project_cost_structure_states
- project_id        one row per Project
- company_id        same-company ownership
- status            OPEN | FROZEN
- revision_no       starts at 1; increments on controlled reopen
- frozen_at         durable freeze timestamp
- frozen_by         authenticated actor when known
- updated_at
```

The migration backfills a Project as `FROZEN` when an earlier accepted `project.cost_structure_frozen` audit record exists. Before Pass 359 there was no reopen command, so preserving that historical freeze is the safest compatible interpretation.

The current HTTP surface is the seven original source routes plus one narrowly scoped repair command:

```text
POST /api/v1/projects/:projectId/wbs/reopen
```

`reopen` reuses the existing `wbs.freeze` permission. No new permission is introduced. Freeze and reopen remain bodyless so Company, actor and Project authority stay server-owned. `GET /api/v1/projects/:projectId/wbs` now returns the authoritative `costStructureState`; freeze/reopen return the same state shape.

Current state response:

```text
projectId
status       OPEN | FROZEN
revisionNo
frozenAt     nullable ISO timestamp
```

Pass 359 also adds the stable conflict code `WBS_COST_STRUCTURE_FROZEN`. WBS node create/update and Project cost-code mapping replacement reject while the Project is frozen. PostgreSQL triggers enforce the same rule against direct or concurrent writes, including updates that try to move a row out of a frozen Project.

A successful reopen changes `FROZEN -> OPEN`, increments `revisionNo`, clears the active freeze metadata, writes audit history and emits `project.cost_structure_reopened`. Repeating freeze while already frozen or reopen while already open is naturally idempotent and does not duplicate transition audit/outbox records.

This repair does **not** add Cost Type CRUD, archive/delete APIs, status/category enums, BOQ mapping changes, Finance adapters or any Stage-26/27 integration. Those remain in their separately frozen repair/deferred passes.

## Pass 360 post-Stage-23 repair amendment — Cost Type master and non-destructive archive lifecycle

Pass 358 classified the missing Cost Type master and missing non-destructive classification lifecycle as `REPAIR_BEFORE_STAGE_24`. Pass 360 therefore amends only those Module-6 gaps. It does not reopen the original Stage-9 business scope or add generic CRUD.

The existing five source permissions stay unchanged. Cost Type operations deliberately reuse the already reviewed Cost Code authorities because the source defines no separate Cost Type permission:

```text
cost_codes.read   -> list Cost Codes and Cost Types
cost_codes.manage -> create/archive/restore Cost Codes and Cost Types
wbs.manage        -> archive/restore WBS nodes inside an OPEN Project cost structure
```

The repaired HTTP additions are intentionally narrow:

```text
POST /api/v1/projects/:projectId/wbs/nodes/:id/archive
POST /api/v1/projects/:projectId/wbs/nodes/:id/restore
POST /api/v1/cost-codes/:id/archive
POST /api/v1/cost-codes/:id/restore
GET  /api/v1/cost-types
POST /api/v1/cost-types
POST /api/v1/cost-types/:id/archive
POST /api/v1/cost-types/:id/restore
```

No `DELETE` route is added. Archive/restore is implemented only as status transition to `ARCHIVED` or `ACTIVE`, so existing UUID relationships remain valid for history. Existing Project mapping and downstream posting validation already require active WBS/Cost Code/Cost Type rows for new writes, so archived masters remain visible historically but cannot be used as new active posting combinations.

WBS archive/restore is blocked while the Project cost structure is `FROZEN`; the user must use the Pass-359 controlled reopen command first. WBS status transitions reuse the source-defined `wbs.updated` audit/outbox behavior. Cost Code and Cost Type lifecycle changes are audit recorded but do not invent new source domain-event names.

The Cost Type master now supports bounded list and create plus archive/restore. It does not add arbitrary update/delete endpoints, a new permission family, or a new persistence table. The original `cost_types` table and Company uniqueness constraint remain authoritative.

The React Module-6 feature now renders the Cost Type master, uses known Cost Type records as mapping choices, and exposes archive/restore actions for WBS nodes, Cost Codes and Cost Types. Server-side validation remains authoritative, and historical archived records remain visible.

Pass 360 does **not** change Prisma models or migrations, add Module-7 Budget behavior, alter BOQ Project mapping, or begin Stage-26/27 integrations.
