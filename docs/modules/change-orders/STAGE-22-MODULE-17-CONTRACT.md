# Stage 22 — Module 17 Change Orders / Variations Contract

## Purpose

Stage 22 freezes the executable boundary for **Module 17 — Change Orders / Variations** before Prisma models, migrations, backend runtime code or React code are generated.

The module captures Project scope changes, estimated cost/revenue impact, Approval Workflow state, formal approved Change Orders and durable impact evidence. It must preserve immutable approved history and must not silently apply partial Budget, Contract, Subcontract or Schedule changes.

The corrected dependency-aware order is:

```text
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

Part I remains authoritative for generation order, hard dependencies and deferred integrations. Appendix A remains authoritative for Module-17 workflow, tables, routes, validation, permissions, errors, events and React requirements unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-22 runtime handoff is genuine Stage-21 live acceptance:

```text
STAGE_21_ACCEPTED_READY_FOR_STAGE_22
```

The Module-17 contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-22 production runtime activation or deployment.

The corrected business prerequisites are:

```text
Module 5  - Project Management             required
Module 6  - WBS & Cost Codes              required
Module 7  - Budgeting & Job Costing       required; Budget impact remains mandatory
Module 22 - Approval Workflows            required
Module 4B - BOQ Project Mapping           optional when boq_item_id is used
Module 21 - Project Scheduling            conditional when approved_days or Schedule impact is enabled
```

Project-scope authorization already exists through Module 24B and must be reused. Stage 22 must not create another Project membership or authorization model.

Supporting documents use the already-generated Module-18 signed upload/version/link contract. Stage 22 does not create a second file store or binary upload API.

## Ownership boundary

Module 17 owns exactly these four source-defined persistence resources:

```text
change_requests
change_request_lines
change_orders
change_order_impacts
```

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency        Foundation
users / roles / permissions                      Module 24A
Project membership / allowed Project scope       Module 24B
projects / Project lifecycle                     Module 5
wbs_nodes / cost_codes / cost_types              Module 6
project budgets / forecasts / cost sources       Module 7
approval definitions / requests / actions        Module 22
BOQs / BOQ revisions / BOQ items                 Module 4B when used
documents / versions / links                     Module 18
Project schedules / activities / baselines       Module 21 when Schedule impact is enabled
subcontracts / subcontract commitments           Module 11
```

Later ownership remains:

```text
client contracts / claims / invoices             Module 16
reports / analytics                              Module 23
dashboard                                        Module 1
```

Stage 22 must not create duplicate Project, WBS, Cost Code, Budget, Approval, BOQ, Document, Schedule, Subcontract, Client Billing, reporting or dashboard masters.

## Reviewed persistence boundary

### change_requests

Source-defined fields:

```text
id
company_id
project_id
change_no
change_type
title
description
reason
status
requested_by
requested_at
```

Required meaning:

- every Change Request belongs to exactly one Company and one Module-5 Project;
- Project ownership must match the authenticated Company;
- Project access is revalidated through Module 24B before reads or writes;
- `requested_by` is the authenticated actor and is never accepted as browser authority;
- `requested_at` is server-owned time;
- `status` is server-controlled lifecycle state;
- rejected requests remain historical and do not alter approved financial baselines.

The source does not enumerate `change_type` or `status` token vocabularies. Stage 22 records those gaps instead of inventing a large status engine during contract freeze.

The source defines `change_no` but does not define whether it is manually supplied, Foundation-numbered, Company-unique or Project-unique. No undocumented numbering or uniqueness rule is frozen in Pass 334.

The workflow mentions withdrawn changes, but the reviewed API exposes no withdraw command. Stage 22 must not invent one.

### change_request_lines

Source-defined fields:

```text
id
change_request_id
wbs_node_id nullable
cost_code_id nullable
cost_type_id nullable
description
cost_amount
revenue_amount
boq_item_id nullable
```

Required meaning:

- every line belongs to exactly one Change Request;
- cost and revenue values use DECIMAL/NUMERIC and are serialized without precision loss;
- WBS/Cost Code/Cost Type references, when supplied, must resolve to the Change Request Project and active reviewed Project cost structure;
- `boq_item_id`, when supplied, uses the existing Module-4B Project-mapped BOQ boundary and must not point to an unrelated Project;
- browser input never supplies calculated approved totals or impact-application state through line writes.

The source route uses `PUT /requests/:id/lines` but describes it as “Update draft impact lines”. It does not explicitly state replace-all versus item-by-item merge semantics. The schema/service pass must freeze one simple executable behavior without inventing line-item CRUD routes.

The source does not define line quantity, unit, labor/material/equipment/subcontract component columns or separate estimated-day fields. The workflow may discuss those categories, but Pass 334 does not invent persistence fields absent from the reviewed table.

### change_orders

Source-defined fields:

```text
id
change_request_id
approved_cost
approved_revenue
approved_days nullable
approved_at
effective_date
status
```

Required meaning:

- a formal Change Order is created only from an approved Change Request;
- approved cost/revenue values are server-calculated/snapshotted DECIMAL values;
- `approved_at` and lifecycle status are server-owned;
- the approved variation snapshot is immutable;
- retrying approval must never create duplicate formal approved state;
- `approved_days`, when present, activates the corrected Scheduling prerequisite and must never rewrite a Module-21 baseline snapshot.

The reviewed workflow is singular: one approved request issues one formal Change Order/Variation. Pass 334 freezes one formal Change Order per Change Request so retries can be idempotent without inventing parallel approved orders for the same request.

The source does not define Change Order status vocabulary, effective-date defaulting, approval-number/revision numbering or a reopen/revise command. Those are not invented.

### change_order_impacts

Source-defined fields:

```text
id
change_order_id
target_type
target_id
amount_delta
quantity_delta nullable
applied_at nullable
status
```

Required meaning:

- impact rows belong to one formal Change Order;
- impact rows are server-created orchestration evidence, not arbitrary browser-authored generic links;
- `amount_delta` is DECIMAL/NUMERIC;
- `quantity_delta`, when used, is DECIMAL/NUMERIC and must not silently redefine Schedule day semantics;
- successful impact application records durable applied state and timestamp;
- applying the same approved impact more than once is forbidden;
- all required impacts for one approval apply atomically or none do.

The source-defined `target_type` / `target_id` pair is a deliberate cross-module impact reference. It does not authorize generic resource pointers elsewhere.

The source does not enumerate `target_type` or impact `status` tokens, does not define whether Schedule days use `quantity_delta`, and does not define a public impact-write API. These values remain server-controlled until later passes freeze the executable adapter vocabulary.

## Budget, Contract, Subcontract and Schedule impact boundary

Part I explicitly corrects Module 17 as follows:

- Budget impact remains mandatory.
- Scheduling is a prerequisite only when `approved_days` or Schedule impact is enabled.
- Client, Subcontract and Schedule target adapters must pass Stage-27 integration tests.
- Stage 27 must prove every configured Change impact is applied once, traceable and reversible/adjustable according to policy.

Therefore Stage 22 freezes these boundaries:

1. Module-7 Budget/Forecast impact is part of the mandatory Change Order completion path.
2. Approval must not report success while leaving a partial mandatory Budget impact.
3. Client Billing belongs to later Module 16 and must not be generated early in Pass 334.
4. Existing Subcontract and Schedule targets may be prepared only through reviewed service boundaries; their release-complete integration claim remains gated by Stage 27.
5. Module-21 baseline history is immutable. Schedule-day application must affect reviewed current/forecast state, never an old baseline snapshot.
6. Potential/unapproved changes may be reported separately in forecasts only when a later reviewed policy defines that optional behavior; Pass 334 does not invent it.

## Approval Workflow boundary

Module 22 is a hard prerequisite.

The owning Change Order module retains business-state authority. Module 22 retains approval-decision authority.

The reviewed flow is:

```text
Create Change Request
-> estimate/update draft lines
-> submit current request through Module 22
-> Module 22 records approver actions and terminal decision
-> Module 17 validates the latest approved request state
-> Module 17 creates the immutable formal Change Order
-> Module 17 applies required impacts atomically/idempotently
```

The Change Order tables do not define an `approval_request_id` column. Stage 22 reuses Module-22 generic resource references rather than inventing a new required foreign key during contract freeze.

The source says approval requires the “latest revision”, but no Change Request revision table or revision number is defined. Stage 22 records this gap. Later service logic must ensure approval is for the current submitted request/line state without inventing a new revision subsystem unless a narrow reviewed amendment is necessary.

The reviewed Change Order API contains no separate `/apply` route even though `changes.apply` is a source-defined permission. Pass 334 therefore does not invent one. The eventual approval/application orchestration must use the reviewed `/approve` command and service-level authorization so impact application cannot be caused by a caller who lacks the required apply authority.

## Exact reviewed Stage-22 API surface

Stage 22 exposes exactly these seven source-defined operations:

```text
GET  /api/v1/change-orders
POST /api/v1/change-orders/requests
PUT  /api/v1/change-orders/requests/:id/lines
POST /api/v1/change-orders/requests/:id/submit
POST /api/v1/change-orders/requests/:id/approve
POST /api/v1/change-orders/requests/:id/reject
GET  /api/v1/change-orders/:id/impact
```

Do not automatically add generic or undocumented endpoints such as:

```text
GET    /api/v1/change-orders/requests/:id
PATCH  /api/v1/change-orders/requests/:id
DELETE /api/v1/change-orders/requests/:id
POST   /api/v1/change-orders/requests/:id/withdraw
POST   /api/v1/change-orders/:id/apply
POST   /api/v1/change-orders/:id/reopen
POST   /api/v1/change-orders/:id/revise
DELETE /api/v1/change-orders/:id
```


### Pass 377 narrow local amendment

The seven operations above remain the reviewed Stage-22 source surface. The post-Stage-23 repair program adds exactly one local lifecycle command because the business workflow explicitly requires withdrawn Changes to remain historical:

```text
POST /api/v1/change-orders/requests/:id/withdraw
```

The repair reuses `changes.submit`, accepts only a required withdrawal reason, derives actor/time server-side, applies no Change target impact and keeps the withdrawn Change Request immutable. Generic detail/PATCH/DELETE/apply/reopen/revise routes remain absent.

The source does not define a dedicated request/order detail GET. React work must use the reviewed API surface unless a later controlling amendment explicitly adds a detail read.

The source does not define exact list filters, pagination response shape, create body fields, approval/rejection body fields, rejection-reason requirement or impact response shape. The strict schema pass must freeze only the minimum source-supported fields and must not accept client-authored Company/actor/permission/status/approved-total/impact-authority fields.

## Exact reviewed permissions

The source-defined Module-17 permissions are exactly:

```text
changes.read
changes.create
changes.estimate
changes.submit
changes.approve
changes.apply
```

No extra `changes.update`, `changes.reject`, `changes.withdraw`, `changes.delete`, `changes.reopen`, `changes.documents`, `changes.schedule` or generic administrator permission is invented.

First-scope route/service mapping remains conservative:

- list and impact reads use `changes.read`;
- create request uses `changes.create`;
- draft line work uses `changes.estimate`;
- submit uses `changes.submit`;
- approve/reject use `changes.approve` for owning-module decision authority;
- any approved command that causes target application must additionally enforce `changes.apply` at service/resource-policy level.

This mapping uses only reviewed permission codes and does not create a standalone apply endpoint.

## Authentication, Company and Project authority

All seven routes require an active authenticated session.

The server derives and revalidates:

```text
companyId
actorUserId
permissions
allowedProjectIds
Project ownership
request actor/time
server-owned lifecycle state
approved totals/timestamps
impact application state
```

A selected Project ID may be a legitimate business input where the strict schema allows it, but it must be inside the authenticated user's allowed Project scope. A browser-supplied Project ID never grants Project access by itself.

Browser-provided Company, actor, permission, approval-decision, server status, approved totals, impact status, applied timestamp or audit/outbox authority is rejected.

Repository reads/writes must enforce Company ownership and allowed Project scope before returning or mutating records.

## Validation and business rules

Stage 22 freezes these source-defined rules:

- cost and revenue impact values use DECIMAL/NUMERIC;
- approval requires the latest submitted state and all required documents/fields;
- a Change cannot apply to a closed Project or locked Contract/Budget without an authorized reopen policy;
- impact application is idempotent;
- approved variation snapshot is immutable;
- Budget/Contract/Commitment impacts apply atomically or not at all;
- rejected/withdrawn historical records do not alter approved financial baselines;
- source postings/events are durable through Foundation audit/outbox behavior.

Stage 22 does not invent a closed-Project reopen command, locked-Budget reopen command, Contract reopen command, Change revision engine or arbitrary impact target engine.

## Stable errors

The source-defined Module-17 business errors are exactly:

```text
CHANGE_REQUEST_NOT_FOUND
CHANGE_REQUEST_LOCKED
CHANGE_APPROVAL_REQUIRED
CHANGE_IMPACT_ALREADY_APPLIED
CHANGE_TARGET_CLOSED
```

Later implementation may use existing shared authentication, authorization, validation, idempotency and generic not-found behavior where appropriate, but it must not replace these stable Module-17 conflicts with raw Prisma/PostgreSQL errors.

## Events

The source-defined events are exactly:

```text
change_request.created
change_request.submitted
change_order.approved
change_order.impact_applied
change_request.rejected
```

Events are recorded through the Foundation outbox only after successful business validation.

No `change_request.updated`, `change_request.withdrawn`, `change_order.created`, `change_order.revised`, `change_order.deleted` or target-specific event is invented in Pass 334.

## Notifications and audit

The source requires notification support for approvers, Project/commercial users and owners about pending changes and approval/rejection.

Notification delivery is asynchronous from durable business/approval events and does not create a new business module.

Audit must cover:

```text
impact estimates
supporting document linkage
approval/rejection actions and reasons
applied financial changes
applied Schedule changes when configured
```

Audit records include actor user ID, Company/Project scope, entity ID, request ID and important before/after values. Passwords, tokens and secret material are never logged.

## Document boundary

Supporting documents use Module 18.

Business requests store or link reviewed document/version identifiers through the shared Document Management linking model. Stage 22 must not store binary data in PostgreSQL and must not create an undocumented Change Order upload endpoint.

The source does not define which supporting documents are mandatory for which Change type. Approval must therefore validate only reviewed/configured requirements and must not invent universal attachment counts or categories.

## React boundary

The reviewed React feature path is:

```text
apps/web/src/features/change-orders/
  api/
  hooks/
  components/
  pages/
```

Minimum source-defined UI:

```text
Change register
cost/revenue impact worksheet
approval timeline
supporting documents
applied-impact summary
```

TanStack Query owns server state. React Hook Form + Zod handle forms. Permission-aware UI never replaces server authorization.

Because no dedicated Change Request detail GET is source-defined, the React pass must remain within the reviewed list/command/impact API contract and must not invent hidden browser-only backend routes.

## Exact generation checkpoint

Stage 22 proceeds in the already-reviewed pass sequence:

1. **Pass 334** — freeze this Module-17 contract;
2. **Pass 335** — generate/review the four Prisma models, constraints, indexes and Stage-22 migration;
3. **Pass 336** — generate strict `change-orders.schema.ts`;
4. **Pass 337** — generate Company/Project-scoped `change-orders.repository.ts`;
5. **Pass 338** — generate core `change-orders.service.ts` lifecycle/approval business transactions;
6. **Pass 339** — complete mandatory Budget/Forecast impact orchestration and reviewed conditional target-adapter boundaries without claiming Stage-27 completion;
7. **Pass 340** — generate `change-orders.routes.ts`, `index.ts`, authentication/RBAC and OpenAPI for exactly seven routes;
8. **Pass 341** — run PostgreSQL/Fastify integration, OpenAPI, Company/Project isolation, negative RBAC, transaction and idempotency verification;
9. **Pass 342** — generate React typed API client and TanStack Query hooks;
10. **Pass 343** — generate the permission-aware Change Order React workspace;
11. **Pass 344** — run Playwright for the main Change workflow and permission negatives;
12. **Pass 345** — run final Stage-22 operational/concurrency/regression acceptance and prepare the Stage-23 handoff.

Stage 27 remains the release-completion proof for deferred/conditional Change -> Contract/Subcontract/Schedule adapters and the full configured Change -> Budget/Contract/Schedule flow.

## Contract gaps deliberately left unresolved

Stage 22 explicitly records these source ambiguities instead of guessing:

```text
change_requests.change_no numbering authority and uniqueness scope are not defined
change_type vocabulary is not enumerated
Change Request status vocabulary is not enumerated
Change Order status vocabulary is not enumerated
change_order_impacts target_type vocabulary is not enumerated
change_order_impacts status vocabulary is not enumerated
PUT draft-line replace-all versus merge semantics are not explicitly defined
no Change Request / Change Order detail GET route is defined
list filters and combined request/order list response shape are not defined
create body and reject/approve command body fields are not fully enumerated
workflow originally omitted a withdraw route; Pass 377 resolves only that local lifecycle gap
source says approval uses the latest revision but no Change Request revision table/number exists
exact linkage between Module-22 terminal approval request and Module-17 approve/reject commands is not defined
changes.apply exists but no standalone apply route exists
exact mandatory-document rules are not defined
exact approved_cost / approved_revenue derivation from estimate lines is not described beyond server-side controlled approval snapshot
approved_days semantics and how Schedule impact maps into target quantity/dates are not defined
impact target identity/idempotency key structure is not defined
reversal/adjustment command for an already-applied Change is required by Stage-27 policy but no Module-17 reversal route is defined
potential/unapproved Change forecast inclusion policy is optional and not defined
locked Contract/Budget authorized reopen policy belongs to owning modules and is not defined here
```

These gaps remain visible until a controlling contract or a later narrow reviewed amendment resolves them.

## Pass-334 completion rule

Pass 334 is complete only when:

- the Stage-22 Module-17 contract is documented;
- exactly four owned tables, seven routes, six permissions, five stable errors and five events are frozen;
- Module 5, Module 6, Module 7 and Module 22 hard prerequisites are preserved;
- Module 4B remains optional for BOQ links;
- Module 21 is conditional specifically for `approved_days` / Schedule impact;
- Budget impact remains mandatory;
- Project scope reuses Module 24B;
- documents reuse Module 18;
- approved snapshots are immutable and impact application is atomic/idempotent;
- Client/Subcontract/Schedule release-complete adapter claims remain gated by Stage 27;
- no Module-17 Prisma model, migration, backend runtime file or React file is generated in this pass;
- no extra route, permission, target master or lifecycle subsystem is invented;
- unresolved source gaps remain explicit;
- dependency-independent Module-17 contract verification, workspace verification and migration-policy checks pass.

The next reviewed implementation pass is **Pass 335 — Module 17 Change Orders / Variations Prisma models, constraints, indexes and Stage-22 migration**.

## Pass 335 persistence decisions

Pass 335 implements the reviewed Stage-22 persistence boundary without expanding the business contract.

The migration is:

```text
20260826000200_module_17_change_orders_core
```

Persistence choices are intentionally narrow:

- exactly the four reviewed tables are created;
- `change_no`, `change_type`, request status, Change Order status, impact `target_type` and impact status stay string-backed because the source does not enumerate vocabularies;
- no uniqueness constraint is added to `change_no` because its numbering authority/scope is unresolved;
- Change Request Project and requester references use trusted same-Company foreign keys;
- line cost/revenue and approved/impact amounts use exact DECIMAL storage;
- optional WBS/Cost Code/Cost Type references are checked against the Change Request Company/Project, and a complete WBS + Cost Code + Cost Type combination must be posting-enabled in Module 6;
- optional `boq_item_id` must resolve through a Project-mapped BOQ for the same Company/Project;
- one formal Change Order per Change Request is enforced with a unique key;
- formal approved Change Order snapshots reject UPDATE/DELETE at the database boundary;
- impact `target_type`/`target_id` remains the source-defined cross-module reference and receives no invented polymorphic foreign key;
- impact identity/value fields are immutable after creation, and once `applied_at` is set that impact row becomes immutable;
- no Budget, Subcontract, Client Billing or Schedule target adapter is generated in this persistence pass; mandatory Budget application and Stage-27 adapter proof remain service/integration work.

`approved_days` is stored as exact `DECIMAL(10,2)` so persistence does not silently force whole-day semantics before the reviewed Schedule mapping is defined. This storage choice does not define whether negative/fractional approved days are allowed by business policy; that remains a later boundary/service decision.

The next reviewed pass is **Pass 336 — strict Zod/API schemas and inferred request types for the seven source-defined Module-17 operations**.

## Pass 336 strict API-schema decisions

Pass 336 converts the reviewed seven-operation HTTP boundary into one strict Zod contract without adding a route, permission, lifecycle enum or cross-module adapter.

The list route accepts only bounded `page` / `pageSize` pagination, with a maximum page size of 100. No search, status, Project, type, date or sorting filter is invented because the source does not name those filters.

The create body is limited to:

```text
projectId
changeType
title
description
reason
```

`projectId` identifies the requested business Project only; it never grants access. Company, actor, allowed Project scope, `changeNo`, request status and request timestamps remain server-owned. The source mentions a Change “source” but defines no persistence field for it, so Pass 336 does not invent one.

The reviewed `PUT /requests/:id/lines` command is frozen as complete replacement of the current editable draft line set. Each submitted line contains only the source-defined optional WBS/Cost Code/Cost Type/BOQ references, description, cost amount and revenue amount. Line IDs and parent Change Request ownership are generated/derived by the server. This choice makes the existing `PUT` command executable without adding line-item CRUD endpoints.

Submit and reject are bodyless commands. The source does not define a Module-17 rejection body or rejection-reason field, so no browser rejection payload is invented; Module 22 remains the approval-action evidence authority.

Approval accepts only:

```text
effectiveDate
approvedDays nullable/optional
```

Approved cost/revenue, approval time, lifecycle state and impact rows remain server-calculated/server-created. `approvedDays` remains an exact decimal string and Pass 336 does not impose a whole-day-only rule before the Schedule adapter policy is reviewed.

Money values are serialized as exact signed decimal strings compatible with the Pass-335 `DECIMAL(18,2)` persistence. Impact quantities use exact signed decimal strings compatible with `DECIMAL(18,4)`. Change type, request/order statuses and impact target/status remain bounded strings because the source does not enumerate public vocabularies.

Because the reviewed API has no request/order detail GET, the Change register response carries the Change Request aggregate with its lines and optional formal Change Order snapshot. This is a response-shape decision inside the reviewed list route, not a new backend endpoint. The dedicated impact GET returns the formal Change Order snapshot plus its server-created impact evidence.

The next reviewed pass is **Pass 337 — Company/Project-scoped Module-17 repository primitives using the Pass-335 persistence and Pass-336 schemas**.

## Pass 337 repository decisions

Pass 337 adds only the Company/Project-scoped persistence primitives required by the reviewed service layer. Company ownership remains derived from trusted request context, while every Project-visible read/write receives an explicit Module-24B visibility boundary. The repository supports caller-owned transactions, deterministic Change Register pagination, Change Request row locking, draft-line replacement, same-Project WBS/BOQ checks, Company-scoped Cost Code/Cost Type checks, posting-enabled cost-combination checks, singular formal Change Order creation and read-only impact evidence creation/readback.

The repository intentionally does not own lifecycle policy, approval decisions, Budget application, Schedule changes, Client Billing, Subcontract changes or Stage-27 adapter completion.

## Pass 338 core service decisions

Pass 338 adds the core `change-orders.service.ts` lifecycle and Module-22 approval orchestration without exposing HTTP routes yet and without moving the mandatory Budget/Forecast adapter forward from its reviewed Pass-339 gate.

The service uses only a small implementation-private lifecycle vocabulary needed to execute the source workflow:

```text
DRAFT
SUBMITTED
APPROVED
REJECTED
```

These remain string-backed internal tokens, not a newly exported public enum. The formal Change Order uses the same implementation-private `APPROVED` token for its immutable approved snapshot.

Pass 338 resolves the previously open `change_no` execution question narrowly by using the existing Foundation Company-numbering service with the server-owned sequence key `change-request`. This does not add a Project-level numbering claim or a new database uniqueness constraint; Company administrators must provision the corresponding existing Foundation number sequence before runtime use.

Core service behavior is frozen as follows:

- list/read visibility comes from Module-24/24B permissions and Project scope, never from browser ownership fields;
- create requires `changes.create`, rejects a closed Project, allocates the Change number server-side and creates a DRAFT request atomically with audit/outbox evidence;
- line replacement requires `changes.estimate`, only permits DRAFT state and revalidates optional WBS/Cost Code/Cost Type/BOQ references before the complete replacement;
- submit requires `changes.submit`, snapshots the current immutable estimate state into Module 22 using a server-configured approval definition, then records SUBMITTED state and `change_request.submitted` evidence in the same transaction;
- approve/reject never accept browser approval authority; they replay/read the existing Module-22 request and synchronize Module-17 state only after the terminal Module-22 decision is respectively APPROVED or REJECTED;
- approved cost and revenue are exact server-side sums of the submitted Change Request lines using integer minor-unit arithmetic, then stored in the immutable formal Change Order snapshot;
- repeated create/replace/submit/approve/reject writes use the Foundation idempotency helper;
- rejection preserves request/estimate history and creates no financial impact;
- the dedicated impact read remains read-only and returns only already-created server impact evidence.

Pass 338 deliberately stops before mandatory Change application. The core approve method creates the reviewed immutable formal approval snapshot, but the Change Orders module is still not registered or route-accessible. **Pass 339 must extend that same approval transaction with mandatory Module-7 Budget/Forecast application and `changes.apply` authorization before Pass 340 may expose the `/approve` route.** The `change_order.impact_applied` event is therefore not emitted in Pass 338.

No Client Billing, Subcontract or Schedule adapter is generated in Pass 338. Their release-complete proof remains Stage-27-gated, and `approved_days` still does not rewrite Module-21 baseline history.

The next reviewed pass is **Pass 339 — mandatory Module-7 Budget/Forecast Change impact orchestration plus the reviewed conditional target-adapter boundaries, without claiming Stage-27 completion**.


## Pass 339 mandatory Budget / Forecast impact decisions

Pass 339 completes the mandatory Stage-22 Change -> Module-7 application path before any Module-17 HTTP route is exposed. The reviewed `/approve` orchestration now requires both `changes.approve` and `changes.apply`, verifies the terminal Module-22 approval, creates the immutable formal Change Order, applies the Module-7 revision/forecast effect, writes server-owned impact evidence, updates the Change Request to APPROVED and records audit/outbox evidence in the same caller-owned transaction. A failure in any required step rolls the whole approval/application transaction back.

The Module-7 adapter is intentionally small and reuses the existing `BudgetsJobCostingRepository` instead of writing `project_budgets`, `budget_lines` or `forecast_lines` from Module 17. It locks the Project, requires an existing current FROZEN budget, creates the next DRAFT budget version, clones the current budget lines, appends grouped approved financial adjustments, recalculates authoritative totals, freezes the new version and records `budget.revised`. Non-zero Change financial lines must have a complete WBS + Cost Code + Cost Type so the mandatory revision never guesses a posting identity.

The same transaction carries the latest Project forecast snapshot forward to the later of the existing latest forecast date or the Change effective date, then adds forecast rows for the new approved financial adjustment lines. This records the approved cost delta in estimate-to-complete while preserving prior forecast assumptions. Module 7 records its reviewed `forecast.updated` audit/outbox evidence.

Pass 339 freezes only these implementation-private, server-created impact target tokens needed for the mandatory adapter:

```text
PROJECT_BUDGET_COST
PROJECT_BUDGET_REVENUE
PROJECT_FORECAST_COST
PROJECT_FORECAST_REVENUE
```

All four rows use the implementation-private `APPLIED` status and non-null `applied_at`. They are not public request enums and the browser still cannot author impact targets. Budget target rows point to the new controlled Project Budget revision; Project Forecast rows point to the owning Project because Module 7 has no forecast-header resource. The formal Change Order remains the authoritative approved cost/revenue snapshot.

`approved_days` remains source-defined but its exact Module-21 target/mapping and reversal policy are still not defined. Pass 339 therefore fails closed when `approvedDays` is supplied rather than approving a Change Order while silently leaving a required Schedule impact unapplied. No Schedule mutation, Subcontract mutation or Client Billing mutation is generated in this pass. Those adapters and reversible/adjustable completion proof remain Stage-27 work.

Pass 339 adds no route, module index, React feature or database migration. Pass 340 may generate the exact reviewed seven-route HTTP/OpenAPI surface only after this impact gate passes.

The next reviewed pass is **Pass 340 — Module 17 Fastify routes, index registration, authentication/RBAC and OpenAPI for exactly the seven source-defined operations**.


## Pass 340 implementation note

Pass 340 exposes the reviewed Module-17 runtime only after Pass 339 completed mandatory Module-7 Budget/Forecast application. The HTTP surface is exactly the seven source-defined operations. Every route authenticates first, parses through the frozen Zod request contract, and validates the returned service payload through the frozen response schema. The five write commands require the existing Foundation `Idempotency-Key` contract.

The Module-22 approval definition is deployment configuration, not browser authority. Pass 340 wires `CHANGE_REQUEST_APPROVAL_DEFINITION_CODE` from validated server configuration into `ChangeOrdersService`; Company, actor, Project scope, permissions, status, approved values and impact targets remain server-owned. The approve command still requires both `changes.approve` and `changes.apply` in the service before its atomic mandatory impact transaction can complete.

Pass 340 does not add a detail GET, generic PATCH/DELETE, withdraw, reopen or standalone apply route. It does not add Schedule, Subcontract or Client Billing adapters, React code, integration tests or a database migration. Those boundaries remain assigned to their reviewed later passes.

The next reviewed pass is **Pass 341 — Module 17 PostgreSQL/Fastify integration, generated OpenAPI, Company/Project isolation, negative RBAC, transaction and idempotency verification**.


## Pass 341 implementation note

Pass 341 adds the reviewed live integration/security harness without changing production runtime behavior, persistence, public routes or migrations. The disposable PostgreSQL suite exercises all seven Module-17 operations through real Fastify/service/repository boundaries, including Module-22 approval handoff, mandatory Module-7 Budget/Forecast application, rejected-change history, exact Project/Company isolation, negative RBAC, strict server-owned request fields, idempotent replay and generated OpenAPI.

The approval rollback test intentionally forces the `change_order.impact_applied` outbox insert to fail after the earlier approval work has started. The test requires the entire caller-owned transaction to roll back: formal Change Order, revised Budget, Forecast rows, impact rows, audit/outbox evidence and the approval idempotency result must not partially commit.

`approvedDays` remains fail-closed because the corrected contract assigns Schedule target completion to the reviewed Stage-27 adapter boundary. Pass 341 does not add Schedule, Subcontract, Client Billing or other deferred target adapters.

The next reviewed pass is **Pass 342 — Module 17 React typed API client and TanStack Query hooks for exactly the seven source-defined Change Orders operations**.
