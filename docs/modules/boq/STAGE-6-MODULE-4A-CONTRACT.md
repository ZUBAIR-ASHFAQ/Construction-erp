# Stage 6 — Module 4A BOQ Commercial Core Contract

## Purpose

Stage 6 freezes the executable contract for **Module 4A — BOQ Commercial Core** before any BOQ Prisma model, migration, backend module or React feature is generated.

Module 4 remains one approved ERP business module. `4A` and `4B` are implementation gates only. Stage 6 delivers the tender/commercial BOQ core. Project/WBS/cost-code mapping belongs to Module 4B after Project Management and WBS & Cost Codes exist.

This contract follows Part I when the Appendix A BOQ wording conflicts with the corrected execution order.

## Stage prerequisite

Direct prerequisite:

```text
Stage 5 — Module 3 Tendering & Estimation
```

Runtime implementation must not begin until genuine Module 3 live evidence contains:

```text
STAGE_5_ACCEPTED_READY_FOR_STAGE_6
```

The contract may be reviewed and frozen while live evidence is pending, but that does not authorize the Stage-6 migration or runtime implementation.

## Stage-6 ownership boundary

Module 4A owns only these BOQ records:

```text
boqs
boq_revisions
boq_items
```

Stage 6 must not own or add:

```text
projects
project_id
wbs_nodes
wbs_node_id
cost_codes
cost_code_id
project cost-code mappings
budgets
client billing persistence
change-order persistence
```

Those project relationships remain deferred to Module 4B or the later owning modules.

## Corrected Stage-6 persistence shape

### boqs

Stage 6 BOQs are tender-linked commercial BOQs.

Required business fields:

```text
id
company_id
tender_id
code
title
currency
current_revision_id nullable
status
```

`project_id` does not exist in Stage 6. Because Part I removes project ownership from 4A, `tender_id` is required for a Stage-6 BOQ even though Appendix A describes tender-or-project BOQs for the completed Module 4.

### boq_revisions

Required business fields:

```text
id
boq_id
revision_no
status
effective_date
notes
approved_by nullable
```

Revision numbers are concurrency-safe and unique inside one BOQ.

### boq_items

Required business fields:

```text
id
boq_revision_id
parent_id nullable
item_code
description
unit
quantity
rate
amount
```

`quantity`, `rate` and `amount` use PostgreSQL/Prisma decimal-safe types. `amount` is server-calculated from the accepted quantity/rate contract and is never trusted from the browser.

`parent_id`, when present, must resolve to an item in the same BOQ revision. Stage 6 does not add WBS or cost-code columns.

## Company ownership and scope

`boqs.company_id` is derived from authenticated request context. The client never chooses it.

A BOQ tender must belong to the same authenticated company. Repository reads and writes for `boq_revisions` and `boq_items` must traverse the company-owned BOQ rather than accepting an untrusted company identifier.

Project scope is not activated for Module 4A because this gate has no project relationship. Project authorization is introduced only after Module 5 and Module 24B.

## Stage-6 lifecycle

The reviewed commercial lifecycle is:

```text
Tender
  -> BOQ
  -> Draft Revision
  -> Draft Item Set
  -> Review Totals
  -> Freeze Revision
  -> New Revision for later approved quantity/rate changes
```

Frozen revisions are immutable. A correction creates another revision rather than silently rewriting the frozen snapshot.

Downstream records must reference a specific BOQ revision/item when those integrations are introduced later. They must not rely on an ambiguous "latest" row.

## Exact Stage-6 API surface

Only the six Appendix A BOQ operations are approved for this gate:

```text
GET  /api/v1/boqs
POST /api/v1/boqs
POST /api/v1/boqs/:id/revisions
PUT  /api/v1/boqs/:id/revisions/:revId/items
POST /api/v1/boqs/:id/revisions/:revId/freeze
GET  /api/v1/boqs/:id/revisions/:revId/export
```

Do not add generic CRUD routes automatically.

In particular, Stage 6 does not add:

```text
DELETE /api/v1/boqs/:id
PATCH  /api/v1/boqs/:id/status
POST   /api/v1/boqs/:id/import
POST   /api/v1/boqs/:id/revisions/:revId/submit
POST   /api/v1/boqs/:id/revisions/:revId/approve
project/WBS mapping endpoints
```

Appendix A mentions validated spreadsheet import "if required" and requires all-or-nothing behavior when bulk import is enabled, but it does not define a public import API. Stage 6 therefore must not invent one. The reviewed `PUT .../items` command remains the authoritative item-set write contract unless a later approved contract explicitly adds an import command.

## Request ownership

GET routes accept only documented filters, pagination and path parameters.

POST/PUT requests accept only reviewed business input. The following remain server-owned and must not be trusted from the client:

```text
companyId
actorUserId
permissions
projectScope
status transitions
revisionNo
amount
approvedBy
currentRevisionId
```

Dates, UUIDs, enums and decimal strings are normalized at the Zod boundary.

## Pass-125 concrete API boundary

Appendix A requires Zod validation, bounded pagination, normalized dates/decimals/UUIDs and a consistent API envelope, but it does not prescribe every concrete wire-field name or every list filter. Pass 125 therefore freezes the smallest Stage-6 engineering contract needed by the six approved routes without adding a new business capability.

### List query

```text
GET /api/v1/boqs

search optional
tenderId optional
status optional (ACTIVE only in 4A)
page optional, >= 1
pageSize optional, 1..100
```

`search` is limited to BOQ register text matching implemented later by the repository. `tenderId` and `status` align with the Pass-124 Stage-6 indexes. No project filter exists in 4A.

### Create BOQ

```text
POST /api/v1/boqs

{
  tenderId,
  code,
  title,
  currency
}
```

The server derives `companyId`, lifecycle `status` and `currentRevisionId`.

### Create revision

```text
POST /api/v1/boqs/:id/revisions

{
  effectiveDate,
  notes
}
```

The server owns `revisionNo`, revision `status` and `approvedBy`.

### Replace draft item set

```text
PUT /api/v1/boqs/:id/revisions/:revId/items

{
  items: [
    {
      rowKey,
      parentRowKey optional,
      itemCode,
      description,
      unit,
      quantity,
      rate
    }
  ]
}
```

`rowKey` and `parentRowKey` are transient request-only hierarchy keys. They let the browser submit a complete hierarchy without choosing persistent BOQ item UUIDs. They are never persisted. The server generates item IDs and calculates `amount`; clients cannot submit `amount`.

A request is rejected before persistence when row keys are duplicated, a parent key is absent from the submitted revision, an item parents itself, or the submitted hierarchy contains a cycle. The complete item set is bounded to 1,000 rows per command as an API safety limit; this is an implementation guard, not a new business module rule.

### Freeze and export request shapes

Freeze is a bodyless command. Appendix A defines no export query options, so the Stage-6 export route accepts no public query fields. The exact synchronous-versus-queued export response is intentionally left to the later service/route pass because Appendix A says "Queue/export BOQ" but does not define an exact transport payload or HTTP status.

### Response data contract

Normal BOQ responses serialize UUIDs and dates as strings and all decimals as decimal strings. Response DTOs expose the commercial BOQ, revision/item data, pagination and server-calculated revision total needed by the reviewed UI while omitting internal `companyId` from the browser DTO. All endpoint responses remain wrapped by the shared `{ data: ... }` success envelope when routes are generated.

## Pass-126 repository boundary

The Stage-6 repository is `apps/api/src/modules/boq/boq.repository.ts`. It accepts either the normal Prisma client or an active service transaction client so lifecycle-sensitive service commands can keep BOQ state, audit and outbox work in one transaction later.

Every BOQ master read/write uses the Foundation `requireCompanyRepositoryScope()` helper. Revision and item operations do not accept a company identifier; they prove ownership by traversing their parent BOQ. Raw row locks include an explicit `company_id` predicate before returning a lifecycle-sensitive record.

The repository provides only persistence operations needed by the frozen six-route workflow:

```text
bounded BOQ register + count
find BOQ by id/code
find same-company Tender
create BOQ
lock BOQ
list/latest/find/lock BOQ revision
create server-numbered revision
list/replace revision items
freeze DRAFT revision
set current revision
sum revision amount
```

`replaceBoqRevisionItems` accepts only internal server-owned persistent item IDs, parent IDs and already-calculated decimal amounts. The later service converts validated transient `rowKey`/`parentRowKey` input into those values and calls this operation inside a transaction. The repository does not accept browser `amount`, `companyId`, project scope or lifecycle authority.

No `project_id`, `wbs_node_id`, `cost_code_id`, generic CRUD operation, import endpoint or extra BOQ business rule is introduced by Pass 126.

## Exact permissions

Stage 6 uses only the five BOQ permissions defined by Appendix A:

```text
boq.read
boq.create
boq.edit
boq.freeze
boq.export
```

Do not create extra permissions for revision creation, item replacement, revision comparison or totals unless a later approved contract requires them.

## Exact public business errors

The Stage-6 BOQ module keeps these Appendix A business conflicts:

```text
BOQ_NOT_FOUND
BOQ_REVISION_LOCKED
INVALID_BOQ_ITEM
BOQ_SCOPE_CONFLICT
```

Validation errors continue to use the shared API validation envelope. Database, SQL and stack details must not leak through public errors.

## Validation and invariants

Stage 6 must enforce at least:

- the Tender exists and belongs to the authenticated company;
- BOQ code uniqueness follows the reviewed company/tender policy chosen by the migration contract;
- revision number is unique inside one BOQ;
- parent item belongs to the same revision and cannot create an invalid hierarchy;
- quantity/rate are decimal-safe and amount is calculated server-side;
- a frozen revision cannot be edited;
- only a draft/editable revision may replace its item set;
- item replacement is transactional and all-or-nothing;
- any optional bulk-import path introduced later must validate the whole set before commit;
- client-supplied company/security/server-owned fields are rejected or ignored according to the shared strict-schema policy.

## Exact domain events

Stage 6 may emit only the reviewed BOQ events:

```text
boq.created
boq.revision_created
boq.revision_frozen
```

Events are written through the Foundation outbox in the same transaction as the successful state change. Core correctness must not depend on a worker.

Do not invent item-created, item-updated, export-created or generic BOQ-updated events.

## Audit requirements

Audit at minimum:

- BOQ creation where required by the shared audit policy;
- revision creation;
- item/rate changes;
- bulk import result when that optional path exists;
- freeze action.

Audit records include actor, company scope, entity/resource identity, request ID and important before/after values. Passwords, tokens and secret material are never logged.

## Export boundary

The Appendix A route is:

```text
GET /api/v1/boqs/:id/revisions/:revId/export
```

Stage 6 must preserve that route rather than replacing it with an invented generic report endpoint. Heavy/retryable export work may use the existing queue/outbox/storage infrastructure where appropriate, and exported file access must continue to use the shared Document Management/storage authorization contract.

## React Stage-6 boundary

The later Stage-6 React feature belongs under:

```text
apps/web/src/features/boq/
  api/
  hooks/
  components/
  pages/
```

Minimum commercial-core UI:

```text
BOQ register
Create BOQ from Tender
BOQ detail
hierarchical item grid
quantity / rate / server amount
totals
revision history
revision comparison
freeze status
export
import affordance only if implemented through an approved contract
```

Do not render fake Project/WBS/cost-code mapping controls in 4A. Those controls belong to Module 4B.

TanStack Query owns server state. React Hook Form + Zod handle forms. UI permission hiding is convenience only; the API remains authoritative.


## Pass-127 service boundary

The Stage-6 service is `apps/api/src/modules/boq/boq.service.ts`. It remains the only BOQ business-orchestration layer and uses the Pass-126 repository inside the existing `withTransaction(...)` helper for every lifecycle mutation.

The service now implements the reviewed Stage-6 behavior without adding HTTP routes:

```text
boq.read    -> bounded BOQ register
boq.create  -> same-company Tender check + BOQ create
boq.edit    -> concurrency-safe next revision + DRAFT item replacement
boq.freeze  -> DRAFT -> FROZEN + approved_by + current_revision_id
boq.export  -> authorized revision export source snapshot only
```

BOQ creation, revision creation and revision freeze write only the three approved outbox events: `boq.created`, `boq.revision_created` and `boq.revision_frozen`. BOQ creation/revision/freeze and item/rate replacement are audited in the same transaction as the business state. Item replacement remains audit-only and does not invent an item-created/item-updated event.

Revision numbering is serialized by locking the company-owned BOQ before reading the latest revision number and inserting the next DRAFT revision. Item replacement locks both the BOQ and revision and rejects every non-DRAFT revision with `BOQ_REVISION_LOCKED`. Freeze locks the same records, records the authenticated actor as `approved_by`, updates `current_revision_id` in the same transaction and treats an already-FROZEN retry as a read-only replay so duplicate audit/outbox side effects are not written.

`quantity * rate` is calculated with exact scaled `BigInt` arithmetic. Both inputs use four-decimal scale, the result is rounded half-up to two-decimal money, and every line plus the complete revision total is checked against the Stage-6 `DECIMAL(18,2)` range before persistence. This is the concrete engineering rounding rule required by the Pass-124 database shape; Appendix A requires server-owned decimal calculation but does not prescribe a rounding mode.

The service revalidates the Pass-125 complete item-set schema before generating persistent UUIDs, so missing/duplicate hierarchy keys, cycles and amount overflow cannot reach repository persistence through a direct service call. The before/after audit snapshot records item code, parent, quantity, rate and server amount without logging secrets.

The exact export transport remains intentionally deferred to Pass 128 because Appendix A specifies `GET /api/v1/boqs/:id/revisions/:revId/export` as "Queue/export BOQ" but does not prescribe the file format, job response or HTTP status. Pass 127 therefore exposes only an authorized company-scoped export source snapshot and does not enqueue a job, create a document or emit an export event.

No Project/WBS/cost-code field, generic CRUD operation, import endpoint, new permission, new error code or extra domain event is introduced by Pass 127.

## Stage-6 implementation order after live prerequisite acceptance

Once Stage 5 is genuinely live-accepted, continue in this order:

```text
Pass 124  Prisma models + reviewed migration
Pass 125  Zod schemas and request/response contracts
Pass 126  Repository
Pass 127  Service transactions and invariants
Pass 128  Fastify routes, index and registration
Pass 129  PostgreSQL/Fastify integration workflow tests
Pass 130  security, company isolation and database-integrity verification
Pass 131  OpenAPI/API contract verification
Pass 132  React BOQ register/create/revision UI
Pass 133  React item grid/comparison/freeze/export UI
Pass 134  Playwright workflow and permission verification
Pass 135  performance/concurrency/migration-recovery/operations verification
Pass 136  final Stage-6 acceptance gate
```

## Module 4B deferral

After 4A closes, the corrected sequence is still:

```text
Module 5  Project Management
Module 24B Project Scope Activation
Module 6  WBS & Cost Codes
Module 4B BOQ Project Mapping
```

Only Module 4B may add the reviewed BOQ project/WBS/cost-code relationships through a migration where those target tables already exist.

## Pass 123 exit condition

Pass 123 is contract-only. It does not claim Stage 6 runtime acceptance.

A successful contract gate records one of:

```text
STAGE_6_CONTRACT_FROZEN_READY_FOR_IMPLEMENTATION
STAGE_6_CONTRACT_FROZEN_STAGE_5_LIVE_ACCEPTANCE_PENDING
```

The second status is expected when Stage-5 live evidence is still blocked or missing. In that case, Pass 124 runtime work remains blocked until the genuine Stage-5 live acceptance is supplied.

## Pass 124 persistence preparation status

Pass 124 prepares the reviewed Prisma shape and one forward Stage-6 migration for `boqs`, `boq_revisions` and `boq_items`.

This preparation does not change the Stage-5 prerequisite rule. Until genuine Module 3 live evidence contains `STAGE_5_ACCEPTED_READY_FOR_STAGE_6`, the Stage-6 persistence must not be treated as deployable or accepted runtime state.

The migration deliberately contains no `project_id`, `wbs_node_id` or `cost_code_id`; those columns remain owned by Module 4B.

## Pass-128 Fastify HTTP and export transport boundary

Pass 128 completes the five-file Module 4A backend folder with `boq.routes.ts` and `index.ts`, then registers the module in `apps/api/src/app.ts` whenever the database dependency is available.

The HTTP layer exposes exactly the six approved Stage-6 operations and no generic CRUD/import/project-mapping route. Every route authenticates first, performs the reviewed route-level permission check, parses the request again with the Pass-125 Zod contract, and then calls `BoqService`, which independently revalidates authorization and business invariants.

The route layer serializes safe response DTOs before sending them. `companyId` is not exposed in BOQ responses, `effectiveDate` remains `YYYY-MM-DD`, timestamps are ISO strings, and Prisma decimal values are converted to decimal strings without JavaScript floating-point conversion.

Pass 128 resolves the previously deferred export transport using the smallest bounded implementation supported by the Stage-6 contract:

```text
GET /api/v1/boqs/:id/revisions/:revId/export
  -> authenticate + boq.export
  -> company-scoped service snapshot
  -> synchronous CSV serialization (at most 1,000 reviewed item rows)
  -> { data: { fileName, mimeType: "text/csv", content } }
```

No export worker, document record, new domain event or new permission is created because this bounded CSV serialization is not heavy/retryable work. User-authored CSV text is quoted and formula-leading values are neutralized before export. A later approved requirement may move heavy formatted exports to queue/storage/Document Management without changing the reviewed Stage-6 BOQ business route.

OpenAPI metadata now includes the six Module 4A operations, bearer security, reviewed path/query/body shapes and shared error responses. Pass 131 owns the deeper generated OpenAPI contract and stable-error verification.

Pass 128 still adds no `project_id`, `wbs_node_id`, `cost_code_id`, Project/WBS mapping behavior, import endpoint, extra permission, extra error code or extra domain event.


## Pass-129 PostgreSQL/Fastify integration workflow boundary

Pass 129 adds one real-database integration suite at `tests/integration/module-4a-api.integration.test.mjs`. It exercises the public Fastify API against the disposable PostgreSQL schema instead of mocking repository or service behavior.

The maintained workflow proves:

```text
Tender-linked BOQ create
  -> server-normalized BOQ response
  -> server-numbered DRAFT revision
  -> complete hierarchical item replacement
  -> exact server-calculated DECIMAL amounts
  -> freeze + current_revision_id
  -> retry-safe freeze with no duplicate side effects
  -> frozen revision rejects edits
  -> authorized CSV export
```

The suite also creates a second revision after the first is frozen, verifies that the earlier revision/items remain historical, and proves an amount-overflow replacement is rejected before it can partially replace the already-persisted item set.

Database assertions cover the BOQ/revision/item rows, same-revision hierarchy, `current_revision_id`, before/after item audit, revision lifecycle audit, and exactly the three reviewed outbox events: `boq.created`, `boq.revision_created`, and `boq.revision_frozen`.

Pass 129 intentionally does not absorb Pass 130. The complete negative RBAC matrix, cross-company HTTP/repository/service attacks, and direct database constraint attack suite remain Pass 130.

The live command is destructive to its configured test database and therefore requires both the existing disposable-database safety checks and `RUN_FOUNDATION_DB_TESTS=1`:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:module-4a
```

`npm run module-4a:integration:gate` verifies the maintained static test contract. `npm run module-4a:integration:gate:live` additionally requires genuine Module 3 evidence containing `STAGE_5_ACCEPTED_READY_FOR_STAGE_6`; it refuses to convert skipped integration tests into live Stage-6 acceptance.

Pass 129 still adds no Project/WBS/cost-code relationship and no new BOQ production route, service method, repository method, table, migration, permission or domain event.


## Pass-130 security, company-isolation and database-integrity boundary

Pass 130 extends the maintained real PostgreSQL/Fastify suite instead of adding another runtime abstraction. It does not change BOQ production code. The security pass proves the server remains authoritative at HTTP, service, repository and database boundaries.

The live security matrix covers all six protected BOQ routes. Requests without a valid session return the shared authentication error. A signed-in user with no BOQ permission is denied every route, while isolated principals carrying only `boq.read`, `boq.create`, `boq.edit`, `boq.freeze` or `boq.export` prove that each reviewed permission independently enables only its intended operation.

Company isolation is attacked with a second active company, user, client, Tender, BOQ and revision. Company A cannot list Company B BOQs, create from Company B's Tender, or revise, replace, freeze or export Company B records. The same attack is repeated directly against `BoqRepository` and `BoqService` under trusted Company A request context so route-level filtering is not the only security boundary.

Strict request validation also rejects client attempts to choose server-owned authority, including `companyId`, actor identity, project scope, lifecycle status, revision number, persistent item IDs/parents, calculated `amount`, approver and current-revision state. Public validation/authorization/scope errors are checked for stable codes without SQL, Prisma or stack leakage.

The PostgreSQL attack test verifies the live constraints for same-company Tender ownership, company-unique BOQ code, currency format, positive/unique revision numbering, revision status, non-negative decimals, non-self/same-revision hierarchy, and current-revision ownership. It also queries the live catalog for the reviewed Stage-6 uniqueness/filter/hierarchy indexes. Query-plan/performance measurements remain Pass 135.

The maintained commands are:

```bash
npm run module-4a:security:gate
RUN_FOUNDATION_DB_TESTS=1 npm run test:security:module-4a
RUN_FOUNDATION_DB_TESTS=1 npm run module-4a:security:gate:live
```

The live gate still requires genuine Module 3 evidence containing `STAGE_5_ACCEPTED_READY_FOR_STAGE_6`. Static preparation records `STAGE_6_SECURITY_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING` when that prerequisite is absent; only a real live run may record `STAGE_6_SECURITY_VERIFIED_READY_FOR_PASS_131`.

Pass 130 adds no `project_id`, `wbs_node_id`, `cost_code_id`, Project/WBS mapping, BOQ route, service method, repository method, table, migration, permission or domain event. Pass 131 owns the deeper OpenAPI/API-contract verification.

## Pass-131 OpenAPI, API-contract and stable-error boundary

Pass 131 keeps the six approved BOQ business operations unchanged and strengthens only their API documentation/verification surface. The generated OpenAPI document must contain exactly the six Stage-6 operations, each with bearer security and the already-reviewed request boundary.

Success responses now document the actual safe DTOs: BOQ masters omit `companyId`, revision/item payloads preserve decimal values as strings, list pagination is bounded, and CSV export has the exact Stage-6 response shape chosen in Pass 128.

The OpenAPI error envelope is aligned with the shared runtime error contract:

```text
{
  error: {
    code,
    message,
    requestId,
    fieldErrors? 
  }
}
```

`requestId` is not a top-level sibling of `error`. The generated schemas document the applicable stable shared codes (`INVALID_REQUEST`, `AUTHENTICATION_REQUIRED`, `FORBIDDEN`, `INTERNAL_SERVER_ERROR`) plus the reviewed Module 4A codes (`BOQ_NOT_FOUND`, `BOQ_REVISION_LOCKED`, `INVALID_BOQ_ITEM`, `BOQ_SCOPE_CONFLICT`).

The live API-contract test reads `/openapi.json` from the actual Fastify app and rejects extra BOQ methods/routes, client-owned authority fields, a request body on freeze, generic response objects, or future `/import`/project-mapping operations.

Maintained commands:

```bash
npm run module-4a:api-contract:gate
RUN_FOUNDATION_DB_TESTS=1 npm run test:api-contract:module-4a
RUN_FOUNDATION_DB_TESTS=1 npm run module-4a:api-contract:gate:live
```

Static preparation may record `STAGE_6_API_CONTRACT_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING`. Only a genuine live run after Stage-5 acceptance may record `STAGE_6_API_CONTRACT_VERIFIED_READY_FOR_PASS_132`.

Pass 131 adds no BOQ business route, repository method, service method, table, migration, permission or domain event. `project_id`, `wbs_node_id` and `cost_code_id` remain deferred to Module 4B.

## Pass-132 React BOQ register, create and revision-entry boundary

Pass 132 starts the source-defined React feature at `apps/web/src/features/boq/` using only `api/`, `hooks/`, `components/` and `pages/`. It consumes the already-reviewed Stage-6 backend contract and does not add a backend route or change database behavior.

The BOQ register uses TanStack Query for server state with bounded server pagination plus the existing `search`, `tenderId` and `ACTIVE` filters. The workspace navigation appears only when the authenticated identity contains `boq.read`; without that permission, the BOQ list query is disabled and the navigation action is hidden.

BOQ creation uses React Hook Form + Zod and sends only:

```text
tenderId
code
title
currency
```

When the same user also has `tenders.read`, the create form may load up to 100 Tenders as a convenience selector. Without `tenders.read`, the form does not make that unauthorized Tender API request and instead accepts the Tender UUID directly. Company identity, actor identity, permissions, project scope, lifecycle state, current revision and all Project/WBS/cost-code fields remain server-owned or deferred.

The selected BOQ panel exposes the explicit `boq.edit` revision command and sends only `effectiveDate` plus optional `notes`. The browser never chooses `revisionNo`, `status` or `approvedBy`; the mutation response may display the server-created DRAFT revision without creating duplicate client-side server state.

Pass 132 intentionally does not absorb the remaining BOQ React workflow. Hierarchical item editing, revision comparison, freeze and export controls remain Pass 133. No Project/WBS/cost-code mapping control is shown because `project_id`, `wbs_node_id` and `cost_code_id` remain Module 4B concerns after Modules 5 and 6.

Maintained command:

```bash
npm run module-4a:react-register:gate
```

Static preparation may record `STAGE_6_REACT_REGISTER_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING`. A dependency-backed web build and the upstream Stage-5 live prerequisite are still required before this prepared UI can be treated as runtime-verified.

## Pass-133 React item-grid, comparison, freeze and export boundary

Pass 133 completes the Module 4A commercial React workflow without changing the six approved backend operations. The existing BOQ feature still uses only `api/`, `hooks/`, `components/` and `pages/`; no extra frontend folder or abstraction is introduced.

The selected DRAFT revision now uses React Hook Form + Zod plus one `useFieldArray` item grid. Each browser row sends only transient `rowKey`, optional `parentRowKey`, item code, description, unit, quantity and rate. Persistent item IDs, persistent parent IDs and `amount` remain server-owned. Parent choices build the hierarchy inside the submitted revision, and the browser also rejects missing/self/cyclic parent relationships before the API revalidates them.

Saving replaces the complete DRAFT item set through the existing reviewed PUT route. The UI displays only the returned server-calculated line amounts and `totalAmount`. A frozen revision becomes read-only and is frozen only through the explicit bodyless `boq.freeze` command. CSV export uses only the existing `boq.export` route and downloads the already-authorized response; no export worker, extra route or new event is added.

The approved Stage-6 route surface does not include a revision-history/detail GET operation. Pass 133 therefore does not invent one. Revision comparison is available for authoritative server snapshots returned by item-save/freeze mutations during the current BOQ browser session. Persisted cross-session revision-history loading remains unavailable until an approved contract explicitly defines such a read operation.

Permissions remain explicit:

```text
boq.edit   -> create revisions and replace DRAFT item sets
boq.freeze -> freeze a saved DRAFT revision
boq.export -> export an authorized revision
```

No Project, WBS or cost-code control is added. `project_id`, `wbs_node_id` and `cost_code_id` remain deferred to Module 4B after Modules 5 and 6.

Maintained command:

```bash
npm run module-4a:react-workflow:gate
```

Static preparation may record `STAGE_6_REACT_WORKFLOW_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING`. A dependency-backed web build and genuine Stage-5 live acceptance are still required before runtime acceptance. Pass 134 owns Playwright coverage for the BOQ browser workflow and permission matrix.

## Pass-134 Playwright browser-workflow boundary

Pass 134 adds one focused Playwright file at `tests/e2e/module-4a-browser.spec.mjs` and does not change BOQ production runtime code. The browser scenario runs against the real Fastify application and disposable PostgreSQL test database through the existing shared Playwright configuration.

The main browser workflow proves:

```text
Tender-linked BOQ create
  -> Revision 1
  -> parent/child item hierarchy
  -> server-calculated line amounts and total
  -> freeze immutable Revision 1
  -> CSV export
  -> Revision 2
  -> changed server total
  -> revision comparison
```

The test captures outgoing `/api/v1/boqs` requests and verifies the browser never sends company/actor/security fields, lifecycle state, calculated `amount`, persistent item IDs/parents, or future `projectId`, `wbsNodeId` and `costCodeId` mappings. Create BOQ, create revision, replace items, freeze and export retain their reviewed request shapes; freeze remains bodyless.

Permission scenarios verify read-only behavior, edit-only behavior, freeze and export controls, direct API denial for unauthorized writes, and the `boq.read` navigation boundary. A user with only an unrelated Tender permission receives no BOQ navigation and causes no BOQ API request.

Because the approved six-route Stage-6 contract has no revision-history/detail GET operation, freeze/export-specific browser roles include `boq.edit` only so each role can establish a DRAFT/current-session revision snapshot before its permission-specific control is inspected. This does not weaken server authorization; the direct route authorization matrix remains independently covered by Pass 130.

Maintained commands:

```bash
npm run module-4a:playwright:gate
RUN_MODULE_4A_E2E=1 TEST_DATABASE_URL=<disposable-test-db> TEST_DATABASE_CONFIRM=RESET_CONSTRUCTION_ERP_TEST_DATABASE npm run test:e2e:module-4a
RUN_MODULE_4A_E2E=1 TEST_DATABASE_URL=<disposable-test-db> TEST_DATABASE_CONFIRM=RESET_CONSTRUCTION_ERP_TEST_DATABASE npm run module-4a:playwright:gate:live
```

The live gate still requires genuine Module 3 evidence containing `STAGE_5_ACCEPTED_READY_FOR_STAGE_6`. Static preparation records `STAGE_6_PLAYWRIGHT_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING` while that prerequisite is absent. Only a real browser run may record `STAGE_6_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_135`.

Pass 134 adds no BOQ route, schema, repository method, service method, table, migration, permission, domain event, worker or React production file. Pass 135 owns performance, concurrency, migration/recovery and operational verification.

## Pass-135 operational verification boundary

Pass 135 is verification-only. It does not add or change a BOQ table, migration, repository method, service method, Fastify route, permission, event, worker or React production file.

The maintained operational suite reuses the existing real PostgreSQL/Fastify integration test and verifies:

```text
concurrent revision creation
  -> unique sequential revision numbers

concurrent complete item replacement
  -> serialized all-or-nothing item sets
  -> never a mixed partial hierarchy

concurrent freeze retries
  -> one frozen state
  -> one freeze audit record
  -> one boq.revision_frozen outbox event

bounded BOQ register query
  -> reviewed BOQ company/tender index

latest frozen revision query
  -> reviewed BOQ revision status/number index

rejected overflowing replacement
  -> transaction rollback
  -> prior item set remains intact
```

Performance verification uses PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` to prove reviewed index usage. It deliberately does not impose fixed millisecond thresholds because CI and database hardware vary; query shape and planner evidence are the stable contract.

The live Pass-135 gate also runs the existing migration verifier against both a clean database and the immediately previous supported schema. It remains blocked until genuine Stage-5 acceptance and the Pass-134 live Playwright evidence exist.

Project/WBS/cost-code columns remain deferred to Module 4B.

## Pass-136 final Stage-6 acceptance boundary

Pass 136 closes the Module 4A Commercial Core implementation sequence with one maintained static/live acceptance gate. It does not add a BOQ table, route, repository method, service method, permission, event, worker or React production file.

The static gate reruns the Module 3 prerequisite, complete Module 4A static contract suite, workspace/stack rules, migration policy and syntax checks for the real PostgreSQL/Fastify and Playwright verification files. Static success is preparation only; it never upgrades missing Module 3 live evidence into runtime acceptance.

The live gate requires genuine Module 3 evidence with `STAGE_5_ACCEPTED_READY_FOR_STAGE_6`, explicitly disposable integration and migration databases, isolated `RUN_MODULE_4A_E2E=1`, the auth-action secret and a reproducible `package-lock.json`. It then reruns clean install, typecheck, lint, Prisma validation/generation, clean plus previous-schema migrations, build, the complete Module 4A PostgreSQL/Fastify suite and the real BOQ Playwright workflow.

Only a successful live run may write:

```text
STAGE_6_ACCEPTED_READY_FOR_STAGE_7
```

That status closes **Module 4A only**. `project_id`, `wbs_node_id` and `cost_code_id` remain deferred to Module 4B. The next dependency-aware stage is **Module 5 - Project Management**, followed later by Module 24B, Module 6 and then Module 4B Project Mapping.

Maintained commands:

```bash
npm run module-4a:gate
npm run module-4a:gate:live
npm run module-4a:acceptance:live
```


## Pass 367 amendment — durable revision readback

The historical Stage-6 source contract remains six operations. Pass 367 adds exactly two reviewed read-only repair routes because the required revision-comparison UI could not reconstruct historical revisions after reload:

- `GET /api/v1/boqs/:id` — BOQ master plus ordered revision metadata.
- `GET /api/v1/boqs/:id/revisions/:revId` — one durable revision with its stored item hierarchy and server total.

Both routes reuse `boq.read`, company/project resource policy, existing repository reads, and the existing stable BOQ errors. Pass 367 adds no table, migration, permission, event, item CRUD operation, or generic BOQ CRUD surface. Frozen revision immutability and the six source workflow operations remain unchanged.
