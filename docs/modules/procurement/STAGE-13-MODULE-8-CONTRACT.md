# Stage 13 — Module 8 Procurement & RFQ Contract

## Purpose

Stage 13 freezes the executable boundary for **Module 8 — Procurement & RFQ** before Prisma models, migrations, backend code or React code are generated.

Module 8 owns the supplier/vendor master required by procurement and the pre-purchase workflow from purchase requisition through RFQ, supplier quotation comparison and recommended quotation selection. Selection remains pre-commitment: no financial/job-cost commitment exists until a later Purchase Order or Subcontract is issued.

The controlling dependency-aware order is:

```text
Stage 12  Module 7 - Budgeting & Job Costing
Stage 13  Module 8 - Procurement & RFQ
Stage 14  Module 9 - Purchase Orders
Stage 15  Module 10 - Inventory & Materials
...
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
```

Part I overrides Appendix A where they conflict. In particular, Part I makes Module 8 the supplier/vendor master owner and requires Module 24B Project Scope rather than an unqualified early Module 24 dependency.

## Stage prerequisite

The direct Stage-13 runtime handoff is genuine Stage-12 live acceptance:

```text
STAGE_12_ACCEPTED_READY_FOR_STAGE_13
```

The Module-8 contract may be reviewed and frozen while that live handoff is still pending. That does not authorize Stage-13 production runtime activation or deployment.

The hard prerequisites already generated before Stage 13 are:

```text
Module 5   Project Management
Module 6   WBS & Cost Codes
Module 7   Budgeting & Job Costing
Module 22  Approval Workflows
Module 24B Project Scope Activation
```

Module 8 must reuse these owners rather than duplicate Project, cost structure, budget or approval state.

## Ownership boundary

Part I adds the supplier/vendor master to Module 8. Together with the Appendix transaction tables, Module 8 owns exactly these reviewed persistence resources:

```text
vendors
vendor_contacts
purchase_requisitions
purchase_requisition_items
rfqs
rfq_vendors
supplier_quotations
supplier_quotation_items
```

Source-defined vendor fields:

```text
vendors
  id
  company_id
  code
  legal_name
  display_name
  tax_no nullable
  payment_terms_days nullable
  currency nullable
  status
  qualification_status nullable

vendor_contacts
  id
  vendor_id
  name
  email
  phone
  role
  status
```

All RFQ, supplier quotation and later Purchase Order `vendor_id` values must reference this Module-8 `vendors` master. Module 11 Subcontractor Management may link to an existing vendor but must not replace or duplicate the supplier master.

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency / numbering       Foundation
projects                                                   Module 5
wbs_nodes / cost_codes / cost_types / project_cost_codes   Module 6
project_budgets / job-cost budget controls                 Module 7
approval definitions / requests / actions                  Module 22
project authorization                                     Module 24B
```

Module 8 must not create duplicate Company, Project, WBS, Cost Code, Cost Type, budget or approval masters.

## Reviewed transaction persistence

### purchase_requisitions

Source-defined fields:

```text
id
company_id
project_id
pr_no
requested_by
required_date
status
purpose
```

Required meaning:

- requisitions belong to one Company and one Project;
- actor/Company/Project scope is resolved server-side;
- `pr_no` is a business document number and must use the existing Foundation numbering contract rather than browser authority;
- the Project and referenced cost structure must be active;
- submitted/approved requisitions are not silently edited.

The source does not enumerate requisition status tokens, revision fields or a return-to-draft endpoint. The workflow says submitted/approved requisitions change by revision or return-to-draft, but the reviewed route table exposes no such command. Stage 13 must not invent one silently.

### purchase_requisition_items

Source-defined fields:

```text
id
requisition_id
item_id nullable
description
quantity
unit
estimated_rate nullable
wbs_node_id
cost_code_id
cost_type_id
```

Required meaning:

- every item belongs to one requisition;
- WBS, Cost Code and Cost Type must resolve to one active Module-6 Project posting combination for the requisition Project;
- quantity/rate values use decimal-safe persistence and API serialization;
- `estimated_rate` is optional and must not become authoritative actual cost history.

`item_id` is nullable but the owning inventory/material item master is Module 10, which is generated after Module 8. Stage-13 persistence must not create a false foreign key to a table that does not yet exist. The nullable UUID may be stored as a deferred future reference and the real foreign key must be introduced only after the Module-10 item master exists.

### rfqs

Source-defined fields:

```text
id
company_id
project_id
rfq_no
requisition_id nullable
issue_date
due_date
status
buyer_user_id
```

Required meaning:

- RFQs are Company/Project scoped;
- an RFQ may derive from a requisition, but `requisition_id` is nullable;
- `rfq_no` is server-numbered through Foundation numbering;
- issue/due dates are validated;
- issue is an explicit command and is not represented by arbitrary status PATCH.

The source does not enumerate RFQ status tokens or the exact date-order rule beyond requiring valid dates.

### rfq_vendors

Source-defined fields:

```text
rfq_id
vendor_id
invited_at
response_status
```

Required meaning:

- invited vendors must resolve to the Module-8 vendor master;
- RFQ and vendor must resolve inside the authenticated Company boundary;
- RFQ issue targets approved/eligible vendors according to the reviewed vendor status/qualification contract.

The source does not enumerate vendor status, qualification status or RFQ vendor response-status tokens. Persistence/schema/service passes must not create a larger public enum vocabulary than the source supports without recording the chosen internal representation.

### supplier_quotations

Source-defined fields:

```text
id
rfq_id
vendor_id
quote_no
quote_date
valid_until
subtotal
tax
total
lead_time_days
status
```

Required meaning:

- the quotation vendor must be a vendor invited to the same RFQ when that rule applies;
- monetary values are decimal-safe;
- quotation subtotal/tax/total are server-calculated from validated quotation lines rather than trusted browser totals;
- closed RFQs reject quotation activity;
- validity and lead-time data participate in comparison.

The source does not enumerate quotation status values or exact duplicate quote-number policy.

### supplier_quotation_items

Source-defined fields:

```text
id
quotation_id
rfq_item_id
quantity
unit_rate
discount
tax
total
```

Required meaning:

- quotation lines belong to one quotation;
- quantity/rate/discount/tax/total use exact decimal-safe handling;
- line totals and quotation totals are server-calculated;
- comparison normalizes quantities, currency and tax assumptions before selection.

### Explicit RFQ-item relationship gap

The Appendix defines a required `supplier_quotation_items.rfq_item_id`, but the reviewed Module-8 table list does **not** define an `rfq_items` table, and Part I adds only `vendors` and `vendor_contacts` to Module 8.

The source also allows `rfqs.requisition_id` to be nullable, so Stage 13 cannot safely assume that every `rfq_item_id` is a `purchase_requisition_items.id`.

Therefore Pass 223 freezes this as an explicit source ambiguity. It does **not** silently:

```text
create an undocumented rfq_items table
reinterpret rfq_item_id as purchase_requisition_items.id
make rfq_item_id nullable
remove rfq_item_id
```

Pass 224 must keep this relationship decision explicit in persistence evidence. Any inferred structural completion must be clearly identified as an implementation inference required to make the source-defined workflow relationally valid; it must not be presented as if the source had specified the missing table/target.


### Pass 362 post-Stage-23 RFQ-item integrity amendment

Pass 362 is the reviewed structural completion anticipated by the frozen ambiguity above. It does **not** rewrite Appendix A as if `rfq_items` had originally been specified. Instead, it records one explicit implementation amendment required to make the already-required `supplier_quotation_items.rfq_item_id` relationally valid.

The current executable Module-8 persistence contract therefore adds exactly one support table:

```text
rfq_items
  id
  rfq_id
  requisition_item_id nullable
  description
  quantity
  unit
```

Rules for this repair are intentionally narrow:

- an RFQ created from a Purchase Requisition snapshots its requisition lines into `rfq_items` and preserves `requisition_item_id`;
- a direct RFQ supplies description, quantity and unit through the existing `POST /api/v1/procurement/rfqs` body, so every RFQ has real line identities without adding a new route;
- the existing RFQ response returns those line identities for quotation entry;
- `supplier_quotation_items.rfq_item_id` now has a real foreign key to `rfq_items.id`;
- service/repository checks and PostgreSQL triggers require every quotation line to belong to the exact RFQ being quoted;
- a linked `requisition_item_id` must belong to the RFQ's own source requisition;
- historical opaque quotation-line UUIDs are migrated safely before the foreign key is activated;
- no RFQ-item CRUD/list endpoint, item catalog subsystem, new permission, new stable error or new domain event is introduced.

This amendment resolves only the frozen **M8-01** data-integrity gap. Vendor-master public management and durable RFQ/requisition readback remain reserved for the next reviewed repair pass.

## Exact reviewed Stage-13 public API surface

The Appendix defines exactly eight Module-8 operations:

```text
GET  /api/v1/procurement/requisitions
POST /api/v1/procurement/requisitions
POST /api/v1/procurement/requisitions/:id/submit
POST /api/v1/procurement/rfqs
POST /api/v1/procurement/rfqs/:id/issue
POST /api/v1/procurement/rfqs/:id/quotations
GET  /api/v1/procurement/rfqs/:id/comparison
POST /api/v1/procurement/rfqs/:id/select-quotation
```

Purpose mapping:

```text
GET requisitions               list purchase requisitions
POST requisitions              create requisition
POST requisitions/:id/submit   submit requisition
POST rfqs                      create RFQ
POST rfqs/:id/issue            issue RFQ to approved vendors
POST rfqs/:id/quotations       record supplier quotation
GET rfqs/:id/comparison        get normalized quotation comparison
POST rfqs/:id/select-quotation select recommended quotation
```

Do not add generic CRUD or undocumented workflow routes such as:

```text
GET    /api/v1/procurement/requisitions/:id
PATCH  /api/v1/procurement/requisitions/:id
DELETE /api/v1/procurement/requisitions/:id
POST   /api/v1/procurement/requisitions/:id/return-to-draft
POST   /api/v1/procurement/requisitions/:id/revise
GET    /api/v1/procurement/rfqs
GET    /api/v1/procurement/rfqs/:id
PATCH  /api/v1/procurement/rfqs/:id
POST   /api/v1/procurement/rfqs/:id/close
```

unless the controlling contract is explicitly amended.

## Vendor-master API gap

Part I makes Module 8 the `vendors` / `vendor_contacts` owner, but the Appendix Module-8 route table defines no vendor-master list, create, read, update, archive or contact-management endpoint.

Pass 223 records that conflict rather than silently inventing vendor CRUD. In particular, it does not add:

```text
GET  /api/v1/procurement/vendors
POST /api/v1/procurement/vendors
GET  /api/v1/procurement/vendors/:id
PATCH /api/v1/procurement/vendors/:id
POST /api/v1/procurement/vendors/:id/contacts
```

Persistence may still establish the Part-I-mandated vendor master. Later HTTP/React passes must keep the missing public vendor-management surface visible as a source gap instead of claiming a fully source-defined vendor CRUD workflow.

## GET/query boundary

The source says GET routes accept only documented filters and list routes use bounded pagination with indexed filters. It does not enumerate specific requisition-list filter names, comparison filters or pagination field names.

The schema pass must therefore choose only the smallest project-safe pagination/filter shape needed by the reviewed endpoints and record that choice explicitly. It must not expose arbitrary database fields as filters.

## Request authority boundary

Browser requests may supply only Zod-validated business inputs required by the reviewed commands. The browser must never provide authoritative values for:

```text
companyId
actorUserId
permissions
projectScope
requestedBy
buyerUserId
prNo
rfqNo
status
invitedAt
server quotation totals
approval result
financial commitment amount
```

The server derives Company, actor and Project authorization from authenticated request context, revalidates the Project/resource policy in the service and calculates financial totals before persistence.

Dates, UUIDs and decimals are normalized at the boundary. Financial decimals must serialize without binary-floating precision loss.

## Cost-structure and budget boundary

Every requisition item cost code must resolve to an active Project/WBS/Cost-Code/Cost-Type posting combination owned by Module 6.

Module 7 is the budget/job-cost owner. Module 8 may validate procurement against the existing budget policy and may return the reviewed `PROCUREMENT_BUDGET_BLOCK` conflict, but it must not create or overwrite Project budgets, commitments or actuals.

The source does not define the exact budget-block threshold/tolerance policy or a procurement policy table. Pass 223 keeps that decision explicit rather than inventing a hidden approval threshold.

## Approval boundary

Purchase requisition submission uses Module 22 Approval Workflows when required. Module 8 must reuse the existing approval request/action contracts and preserve the rule that the owning module controls its business state transition after an approval decision.

The source does not define a separate Module-8 approve/reject route and does not include an approval-request foreign key in `purchase_requisitions`. Stage 13 must not duplicate the approval engine or invent a second approval state machine.

## Selection and commitment boundary

Quotation selection is pre-commitment only:

```text
requisition
→ RFQ
→ vendor invitation
→ supplier quotations
→ normalized comparison
→ selected/recommended quotation
→ later Module 9 Purchase Order or Module 11 Subcontract
→ financial/job-cost commitment only when that later document is issued
```

Selecting a quotation in Module 8 must **not** create a Module-7 `cost_commitments` row, Finance journal or payable.

The `INVALID_VENDOR_SELECTION` rule covers invalid selection. When policy requires a non-lowest evaluated offer exception, selection must preserve a documented rationale/exception reason. The source does not define the exact procurement policy source or request field names; the schema/service passes must record the narrowest implementation decision.

## Quotation comparison boundary

Comparison must use normalized quantities/currency/tax assumptions and server-calculated totals. The source does not define:

- the authoritative currency field for each quotation/RFQ;
- exchange-rate source/date;
- unit-conversion master;
- tax normalization formula;
- ranking/tie-break rules;
- whether lead time or validity changes evaluated-price ordering.

Stage 13 must not fabricate a sophisticated bid-evaluation engine. The later service pass may implement only source-supported comparison behavior and must keep any required assumptions explicit.

The React requirement mentions quotation entry/import, but the reviewed route table contains no dedicated import/upload endpoint. A later UI may parse an authorized local file into the same reviewed quotation command if that can be done without changing the API contract; Pass 223 does not add an import endpoint.

## Stable permissions

Freeze exactly the source-defined Module-8 permission vocabulary:

```text
procurement.pr.read
procurement.pr.create
procurement.rfq.manage
procurement.quotation.record
procurement.quotation.select
```

All checks are Company/Project/resource scoped. Route-level checks must be revalidated by the service/resource policy before sensitive writes.

The source defines no separate vendor-master permission token. Do not invent one in Pass 223.

## Stable error codes

Freeze exactly the reviewed Module-8 business conflict vocabulary:

```text
REQUISITION_NOT_FOUND
RFQ_NOT_FOUND
RFQ_CLOSED
QUOTATION_INVALID
PROCUREMENT_BUDGET_BLOCK
INVALID_VENDOR_SELECTION
```

Validation/authentication/authorization errors continue to use the existing platform-level error contracts. Do not invent a larger public Module-8 error-code vocabulary unless a later source-backed invariant genuinely requires it.

## Events, audit and outbox

Freeze the reviewed Module-8 events:

```text
purchase_requisition.submitted
rfq.issued
supplier_quotation.received
rfq.quotation_selected
```

Domain events are recorded through the Foundation outbox only after successful business validation. Core transaction correctness must not depend on an asynchronous worker.

Audit records must cover requisition changes after submission, quotation entry/import, comparison overrides and selected-vendor rationale, including actor user ID, Company/Project scope, entity ID, request ID and important before/after values. Secrets must never be logged.

Pass 223 does not emit events or write audit/outbox rows; it freezes their later service-layer contract only.

## React boundary reserved for later pass

The reviewed React feature remains:

```text
apps/web/src/features/procurement/
  api/
  hooks/
  components/
  pages/
```

Minimum UI:

```text
Requisition register
RFQ builder
Vendor invitation
Quotation entry/import
Side-by-side comparison
Selection approval
```

TanStack Query owns server state. React Hook Form + Zod handle forms. UI visibility is permission-aware while the API remains authoritative.

No React code is generated in Pass 223.

## Pass 223 boundary

Pass 223 is contract-only. It adds no:

```text
Prisma model
migration
procurement.schema.ts
procurement.repository.ts
procurement.service.ts
procurement.routes.ts
Fastify registration
React feature
Playwright workflow
source adapter
financial commitment
```

The next reviewed implementation step is:

```text
Pass 224 - Module 8 reviewed Prisma models, constraints, indexes and migration
```

Pass 224 must preserve the eight source/Part-I-owned resources, defer the future Module-10 `item_id` foreign key correctly, keep vendor IDs rooted in the Module-8 vendor master, and make the unresolved `rfq_item_id` relational decision explicit rather than silently presenting an inference as source text.

## Pass-223 contract acceptance

The Stage-13 contract is frozen only when:

1. all five hard-prerequisite module static regressions pass;
2. this Module-8 contract suite passes;
3. workspace/stack validation passes;
4. migration policy remains valid;
5. no production Module-8 runtime code or database migration is generated by Pass 223;
6. the vendor-master route gap and RFQ-item relationship gap remain explicitly recorded;
7. runtime activation remains blocked until genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence exists.

A contract freeze is not Stage-13 runtime acceptance.

## Pass 224 persistence decision

Pass 224 implements only the reviewed Stage-13 persistence layer. It creates Prisma models plus one forward PostgreSQL migration for the eight source/Part-I-owned resources:

```text
vendors
vendor_contacts
purchase_requisitions
purchase_requisition_items
rfqs
rfq_vendors
supplier_quotations
supplier_quotation_items
```

Pass 224 historically persisted the unresolved required `supplier_quotation_items.rfq_item_id` as a UUID scalar without a foreign key because neither Part I nor Appendix A defined its target. **Pass 362 now supersedes only that historical gap** through the reviewed amendment above: one minimal `rfq_items` snapshot table plus a real foreign key and same-RFQ integrity checks. The original source omission remains documented rather than silently rewritten.

The nullable `purchase_requisition_items.item_id` is also stored as UUID without a foreign key. Its real Module-10 inventory/material FK remains deferred until the owning item master exists.

Pass 224 enforces the source-supported relationships that are resolvable now:

- every `vendors.company_id` resolves to the Foundation Company master;
- purchase requisitions and RFQs are constrained to one Company/Project;
- `requested_by` and `buyer_user_id` resolve to users in the same Company;
- requisition lines resolve WBS, Cost Code and Cost Type IDs and a migration trigger requires one posting-enabled Module-6 `project_cost_codes` combination for the requisition Project;
- an RFQ linked to a requisition must use the same Company and Project;
- every RFQ invitation `vendor_id` resolves to the Module-8 vendor master and a trigger rejects cross-Company invitations;
- every supplier quotation `vendor_id` resolves to the Module-8 vendor master and a trigger requires that vendor to have been invited to the same RFQ.

Business document numbers are server-owned. Persistence therefore makes `pr_no` and `rfq_no` unique within Company scope while leaving the exact Foundation sequence code/service behavior to later orchestration. Vendor `code` receives an index but **not** an invented uniqueness rule because the controlling source never defines duplicate-vendor-code policy.

All unresolved requisition/RFQ/vendor/quotation status and qualification values remain string-backed; Pass 224 adds no Prisma enum vocabulary. It also adds no selected-quotation column, exception-rationale column, approval-request FK, procurement policy table, financial/job-cost commitment, Finance journal, payable or source adapter.

The migration does not enforce an RFQ issue-date/due-date ordering formula because Pass 223 explicitly records that the source requires valid dates without defining the exact ordering rule. Quotation header/line money is persisted with PostgreSQL `DECIMAL`; later schema/service code remains responsible for server calculation and normalization rather than trusting browser totals.

Pass 224 therefore remains persistence-only:

```text
Prisma models + relations       added
Stage-13 forward migration      added
migration gate/checksum lock    added
procurement.schema.ts           not added
procurement.repository.ts       not added
procurement.service.ts          not added
procurement.routes.ts           not added
Fastify registration            not added
React feature                   not added
financial commitment            not added
```

The next reviewed implementation step is:

```text
Pass 225 - Module 8 Zod request/response schema boundary for the eight reviewed procurement operations
```

Runtime deployment still requires genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence. Static Pass-224 completion must not be presented as Stage-13 live acceptance.


## Pass 225 schema decision

Pass 225 adds only `apps/api/src/modules/procurement/procurement.schema.ts` plus its verification gate/evidence. It freezes the Zod request/response boundary for the eight reviewed Procurement operations without adding repository, service, Fastify registration or React code.

The requisition register uses the narrowest explicit business filter needed by the Project-owned workflow:

```text
projectId optional
page optional
pageSize optional, max 100
```

`projectId` is a requested filter only. It never replaces authenticated Company/Project authorization, which remains service-authoritative. No status/search/vendor/requester/date filter is added because the source does not document those filters.

Purchase requisition creation accepts only:

```text
projectId
requiredDate
purpose
items[]
  itemId nullable/optional
  description
  quantity
  unit
  estimatedRate nullable/optional
  wbsNodeId
  costCodeId
  costTypeId
```

`requestedBy`, `prNo`, status and all ownership/permission fields remain server-owned. Submit remains a bodyless command.

RFQ creation accepts only:

```text
projectId
requisitionId nullable/optional
issueDate
dueDate
```

The browser does not supply `buyerUserId`, `rfqNo` or status. The schema validates both dates as real calendar dates but deliberately does not invent an `issueDate <= dueDate` formula because the controlling source did not define that exact rule.

RFQ issue accepts one deduplicated `vendorIds[]` set. `invitedAt`, invitation response status and vendor qualification decisions remain server-owned/service-owned.

Supplier quotation recording accepts only:

```text
vendorId
quoteNo
quoteDate
validUntil
leadTimeDays
items[]
  rfqItemId
  quantity
  unitRate
  discount
  tax
```

Header `subtotal`, header `tax`, header `total`, line `total` and quotation lifecycle status are not browser inputs. Exact decimal strings are used for monetary/quantity/rate values. The unresolved `rfqItemId` target stays explicit: the schema requires a UUID because the source requires the field, but it does not reinterpret it as a requisition-item relationship or claim a missing FK exists.

Quotation comparison accepts no business query filters and returns the reviewed quotation facts only. Pass 225 deliberately adds no exchange-rate, ranking, score, evaluated-price, lowest-offer or tie-break response fields because the source does not define their calculation contract.

Quotation selection accepts:

```text
quotationId
rationale optional
```

One optional `rationale` field is the narrowest implementation decision for both normal selection rationale and any policy-required non-lowest-offer exception reason. A later service may require it conditionally only when a source-backed/configured policy requires that exception. Selection still creates no Module-7 commitment, Finance journal or payable.

The vendor-master API gap also remains open. Pass 225 defines no vendor CRUD/list/contact request schemas because the reviewed public route table still contains no vendor-management endpoint.

All unresolved procurement lifecycle/status vocabularies remain string-backed. No public requisition, RFQ, invitation, quotation, vendor-status or qualification enum is invented.

Pass 225 therefore adds:

```text
procurement.schema.ts                     added
verify-stage-13-schema.mjs                added
stage-13-schema.json evidence             added after gate execution
procurement.repository.ts                 not added
procurement.service.ts                    not added
procurement.routes.ts                     not added
Fastify registration                      not added
React feature                             not added
new migration                             not added
financial commitment                      not added
```

The next reviewed implementation step is:

```text
Pass 226 - Module 8 Company/Project-scoped repository
```

Runtime deployment remains blocked until genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence exists.

## Pass 226 repository decision

Pass 226 adds only `apps/api/src/modules/procurement/procurement.repository.ts` plus its repository verification gate/evidence. No service, Fastify routes, React feature, new migration, source adapter or financial commitment is generated.

The repository accepts either the application Prisma client or an active transaction client. Company ownership is always derived through `requireCompanyRepositoryScope()`. Project-scoped list/read access additionally requires an explicit Module-24B visibility object:

```text
allowedProjectIds: string[] | null
```

`null` means Company-wide Project visibility; an array restricts reads to those exact Project IDs. The optional requisition-list `projectId` filter can narrow this scope but can never widen it. Requisition pagination is rejected before Prisma when `skip` is negative or `take` is outside the reviewed maximum of 100.

Pass 226 prepares row locks for the owning Project, one requisition and one RFQ so the later service can serialize number/state-sensitive writes inside service-owned transactions. The repository deliberately does not decide lifecycle tokens: requisition, RFQ, quotation, invitation, Vendor and qualification values remain string-backed and service-supplied.

Requisition creation validates:

- the Project belongs to the authenticated Company;
- `requestedBy` resolves to a User in that Company;
- every requested WBS/Cost-Code/Cost-Type identity resolves to one posting-enabled Module-6 `project_cost_codes` row for that Project;
- the repository stores only the server-supplied `prNo` and status plus reviewed business line values.

RFQ creation validates the Company Project and buyer, and when `requisitionId` is present it must resolve inside the same Company and Project. RFQ issue persistence accepts service-prepared invitation rows only after every Vendor ID resolves to the Module-8 Vendor master inside the authenticated Company. The repository provides Vendor reads needed by issue/quotation workflows but adds **no Vendor create/update/archive/contact write method**, because the controlling public Vendor-management API gap remains unresolved.

Supplier quotation persistence requires the RFQ to belong to the requested Company/Project and the Vendor to already be invited to that RFQ. Quotation header and line totals are accepted only as service-prepared exact decimal values; the repository performs no monetary arithmetic, normalized ranking, FX conversion, tax evaluation or lowest-offer decision.

Pass 226 historically treated `supplier_quotation_items.rfq_item_id` as opaque. Pass 362 supersedes that historical runtime behavior: repository writes now validate the real RFQ-owned line snapshot before quotation persistence, while no separate RFQ-item CRUD API is added.

Quotation selection remains pre-commitment. The repository exposes controlled expected-state updates for RFQ/quotation lifecycle persistence but adds no `selected_quotation_id`, rationale column, ranking engine, Module-7 commitment write, Finance journal, payable or other financial side effect. The optional selection `rationale` remains a later service/audit concern because no source-defined persistence column exists.

Pass 226 therefore adds:

```text
procurement.repository.ts                  added
verify-stage-13-repository.mjs             added
stage-13-repository.json evidence          added after gate execution
procurement.service.ts                     not added
procurement.routes.ts                      not added
Fastify registration                       not added
React feature                              not added
new migration                              not added
Vendor write API/repository methods        not added
financial commitment                       not added
```

The next reviewed implementation step is:

```text
Pass 227 - Module 8 service/business rules, Project resource policy, Approval/Module-7 boundary checks, server quotation totals, audit/outbox and pre-commitment selection
```

Runtime deployment remains blocked until genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence exists.

## Pass 227 — Service/business-rule implementation decision record

Pass 227 adds `apps/api/src/modules/procurement/procurement.service.ts` and stops before Fastify registration. The service owns Project/resource authorization, numbering, internal lifecycle decisions, transaction boundaries, exact quotation arithmetic, Module-22 requisition approval integration, Module-7 budget-readiness checks, audit/outbox recording and pre-commitment quotation selection.

The service uses the existing Foundation numbering contract with two internal sequence keys:

```text
procurement.pr
procurement.rfq
```

Those keys are server infrastructure, not browser fields. Allocation happens inside the same transaction as the owning requisition/RFQ write.

### Internal lifecycle tokens

Because the source defines lifecycle concepts but does not enumerate a public vocabulary, Pass 227 uses string-backed **internal** tokens only. It does not add a Zod enum or public status contract:

```text
Purchase requisition: DRAFT, PENDING_APPROVAL, SUBMITTED, APPROVED, REJECTED, RETURNED
RFQ:                 DRAFT, ISSUED, SELECTED
RFQ invitation:      INVITED, RESPONDED
Supplier quotation:  RECEIVED, SELECTED
Vendor eligibility:  ACTIVE + QUALIFIED
```

These values are implementation decisions needed for orchestration. They are not presented as source-enumerated public enums and may not be expanded into new APIs without a controlling requirement.

### Project/resource policy

Every exact write/read revalidates Module-24B Project scope plus the source-defined Module-8 permission through `AdministrationRepository`. The requisition register derives a Project visibility set that cannot widen the authenticated Project scope. Closed Projects reject normal procurement writes.

### Module-6 cost-structure revalidation

Requisition creation revalidates every WBS + Cost Code + Cost Type identity against:

- a posting-enabled `project_cost_codes` mapping for the exact Project;
- ACTIVE WBS node;
- ACTIVE Cost Code;
- ACTIVE Cost Type.

This is repeated in the service even though persistence also protects the relation, because sensitive writes must recheck business invariants.

### Narrow Module-7 budget gate

The source defines `PROCUREMENT_BUDGET_BLOCK` but does not define an amount threshold, tolerance or procurement-policy table. Pass 227 therefore implements only the narrow structural readiness rule:

```text
before requisition submission / RFQ progression
→ one current FROZEN Module-7 Project budget must exist
```

Pass 227 does **not** compare requisition value against remaining budget, invent over-budget percentages, create commitments, or mutate Module-7 budget/actual history.

### Module-22 requisition approval

The service accepts one optional server-owned `requisitionApprovalDefinitionCode`. When configured, the bodyless submit command reuses `ApprovalsService.requestApprovalInTransaction()` with a stable `purchase_requisition` resource/source key. Module 22 owns approval request/actions; Module 8 owns the requisition status transition.

Initial DRAFT submission records the reviewed `purchase_requisition.submitted` event once. A repeated submit may replay/synchronize the same approval request and apply a terminal APPROVED/REJECTED/RETURNED result without creating a second approval engine or another public approve/reject route.

When no approval definition is configured, DRAFT moves directly to internal SUBMITTED.

### Vendor eligibility

RFQ issue and quotation recording require the referenced Module-8 Vendor to be internal `ACTIVE` + `QUALIFIED`. These are deliberately service-internal status decisions because the source provides vendor status/qualification fields and requires approved/eligible vendors but does not enumerate public tokens. No vendor write API is added.

### Exact quotation calculation

Browser quotation totals remain non-authoritative. For each line Pass 227 applies:

```text
gross                = quantity(4dp) × unit_rate(4dp), rounded half-up to money(2dp)
net_before_tax       = gross - discount
total                = net_before_tax + tax
quotation subtotal   = sum(net_before_tax)
quotation tax        = sum(tax)
quotation total      = subtotal + tax
```

Arithmetic uses bigint-scaled integers rather than binary floating point and rejects DECIMAL(18,2) overflow. Quantity must be positive, unit rate non-negative, discount/tax non-negative, and discount cannot exceed the calculated gross line value. `leadTimeDays` must be a non-negative integer. These are service validation decisions required to make the source-defined monetary calculation executable; they do not add browser authority.

### Conservative comparison normalization

The source requires normalized quantity/currency/tax assumptions but does not provide FX or unit-conversion contracts. Pass 227 therefore uses only normalization it can prove from available data:

- quotation totals are already server-calculated including line tax;
- every compared quotation must contain the same `rfqItemId + quantity` signature;
- Vendor currency may be null (treated as Company base currency) or must equal Company base currency;
- any cross-currency comparison requiring FX is rejected as `QUOTATION_INVALID` rather than fabricated;
- no exchange-rate, score, evaluated-price, ranking or tie-break response field is added.

For presentation only, comparison rows are ordered by stored server-calculated total and stable ID. The response still exposes no invented rank field.

### Selection / rationale / commitment boundary

Pass 227 may require `rationale` for a non-lowest selection only when the server-owned `requireRationaleForNonLowestSelection` option is enabled. The source does not define a persistence column for selection rationale, so the rationale and `isLowestByStoredTotal` fact are preserved in Foundation audit/outbox evidence rather than adding a new transaction-table column.

Selection changes the chosen quotation to internal SELECTED and the RFQ to internal SELECTED. Replaying selection of that same already-selected quotation is safe. Selecting a different quotation after the RFQ is selected is rejected.

Selection explicitly creates:

```text
NO Module-7 cost_commitment
NO Finance journal
NO AP invoice/payable
NO source adapter posting
```

Those effects remain owned by later Module 9 / Module 11 issuance and Stage 26 Finance adapters.

### Reviewed audit/outbox events emitted by Pass 227

```text
purchase_requisition.submitted
rfq.issued
supplier_quotation.received
rfq.quotation_selected
```

Creation audit rows may be recorded for traceability, but no extra integration event type is invented.

Pass 227 therefore adds:

```text
procurement.service.ts                       added
verify-stage-13-service.mjs                  added
stage-13-service.json evidence               added after gate execution
procurement.repository.ts                    extended only with base-currency read + invitation response update
procurement.routes.ts                        not added
index.ts                                     not added
Fastify registration                         not added
React feature                                not added
new migration                                not added
Vendor write API                             not added
financial commitment                         not added
```

The next reviewed implementation step is:

```text
Pass 228 - Module 8 Fastify routes, module registration and OpenAPI metadata for exactly the eight reviewed procurement operations
```

Runtime deployment remains blocked until genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence exists.

## Pass 228 — Fastify HTTP / OpenAPI / module registration

Pass 228 adds only the HTTP/OpenAPI/module-registration layer for the already frozen Module-8 contract. It adds:

```text
apps/api/src/modules/procurement/procurement.routes.ts
apps/api/src/modules/procurement/index.ts
```

and registers the module in `apps/api/src/app.ts` immediately after its Module-7 prerequisite.

The Fastify surface is exactly the eight reviewed operations:

```text
GET  /api/v1/procurement/requisitions
POST /api/v1/procurement/requisitions
POST /api/v1/procurement/requisitions/:id/submit
POST /api/v1/procurement/rfqs
POST /api/v1/procurement/rfqs/:id/issue
POST /api/v1/procurement/rfqs/:id/quotations
GET  /api/v1/procurement/rfqs/:id/comparison
POST /api/v1/procurement/rfqs/:id/select-quotation
```

Every route authenticates through the existing request authentication plugin, reparses path/query/body values through the Pass-225 Zod schemas and validates successful service DTOs through the existing response schemas before serialization. Exact financial and quantity/rate values remain string-backed in OpenAPI.

Project-specific permission checks remain service-authoritative because Module 24B may grant permission at Project scope even when a Company-wide permission is absent. The route layer therefore does not add a Company-only `hasPermission()` precheck that could incorrectly reject a valid Project-scoped user; the Pass-227 service still revalidates exact Project permissions before reads/writes.

The application composition root wires only two narrow server-owned policies already introduced by Pass 227:

```text
procurementRequisitionApprovalDefinitionCode
procurementRequireRationaleForNonLowestSelection
```

Pass 228 does not add:

```text
Vendor-master CRUD routes
Vendor contact management routes
RFQ-item CRUD/list route
Purchase Order conversion route
Module-7 commitment/actual write routes
Finance journal/AP routes
new database migration
React Procurement pages
```

React Procurement pages remain deferred to Pass 230. Quotation selection remains pre-commitment, and the unresolved `rfqItemId` relationship remains opaque rather than being silently reinterpreted.

Run:

```bash
npm run module-8:http:gate
```

With genuine Stage-12 live acceptance the gate may report `STAGE_13_MODULE_8_HTTP_READY_FOR_PASS_229`; otherwise the truthful static result is `STAGE_13_MODULE_8_HTTP_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING`.

Next reviewed pass: **Pass 229 - Module 8 PostgreSQL/Fastify integration, generated OpenAPI and security verification**.


## Pass 229 — PostgreSQL / Fastify integration, OpenAPI and security verification

Pass 229 adds verification only. No production Module-8 runtime file, Prisma model or migration changes in this pass.

The prepared live suite exercises the real reviewed chain:

```text
requisition register/read
→ create requisition
→ submit directly or create one Module-22 approval request when configured
→ create RFQ from submitted/approved requisition
→ issue to eligible Module-8 Vendors
→ record server-calculated supplier quotations
→ compare conservative same-currency/same-quantity offers
→ select one quotation with optional policy-required rationale
```

The verification explicitly proves that the four reviewed procurement events are audit/outbox-backed, retries do not duplicate the requisition-submitted/RFQ-issued evidence, and quotation selection creates no Module-7 commitment or Finance journal.

Security coverage includes unauthenticated access, missing Project permission, restricted Project visibility, cross-Company access, closed-Project writes, client-supplied ownership/number/status/totals, missing frozen Module-7 budget, invalid Vendor eligibility and unsupported cross-currency comparison.

The live suite also attacks the Stage-13 database boundary directly and expects the reviewed migration protections to reject:

```text
requisition line using another Project's cost structure
RFQ linked to a requisition from another Project
RFQ invitation using a Vendor from another Company
supplier quotation from a Vendor not invited to that RFQ
```

Generated OpenAPI must expose exactly the eight reviewed Module-8 operations with bearer security. It must not expose Vendor CRUD, RFQ-item CRUD, requisition revision/return-to-draft, Purchase Order conversion or commitment-write routes.

Run the static preparation gate with:

```bash
npm run module-8:integration-security:gate
```

The destructive PostgreSQL/Fastify live run is guarded:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run module-8:integration-security:gate:live
```

A live run first requires genuine `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` evidence. Until that exists, the truthful status is `STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING`; no runtime verification claim is created.

Next reviewed pass: **Pass 230 - Module 8 React Procurement API, hooks, requisition/RFQ/quotation comparison and selection UI preparation**.


## Pass 230 — React Procurement & RFQ feature

Pass 230 adds the source-defined React feature at `apps/web/src/features/procurement/` with exactly `api/`, `hooks/`, `components/` and `pages/`. TanStack Query owns requisition/comparison server state and reviewed mutations; React Hook Form + Zod own browser forms.

The UI implements the minimum reviewed surface:

```text
Requisition register
Requisition creation with active Module-6 Project cost-structure selection
Requisition submission
RFQ builder
Vendor invitation
Supplier quotation entry
Local JSON quotation-line import into the existing quotation form
Side-by-side quotation comparison
Recommended-quotation selection with optional rationale
```

The browser calls only the eight reviewed Module-8 operations. It never submits Company ownership, actor identity, PR/RFQ numbering, lifecycle status, invitation metadata, quotation totals or financial-commitment authority. Quotation subtotal/tax/total remain server-calculated.

Two controlling contract gaps remain visible rather than being silently repaired:

- The reviewed Module-8 API defines no Vendor list/CRUD/contact-management route. Vendor invitation and quotation entry therefore accept explicit Vendor UUIDs and do not invent a Vendor browser API.
- The specification originally omitted an `rfq_items` target. Pass 362 resolves that integrity gap with one RFQ-owned line snapshot table; quotation entry now consumes real line IDs returned by the existing RFQ response, without adding a separate RFQ-item route.

The reviewed API also has no RFQ register/detail read. A newly created RFQ is retained only inside the current browser workflow so issue/quotation/comparison/selection can proceed without creating an undocumented endpoint.

Selection remains pre-commitment. Pass 230 adds no Purchase Order conversion, Module-7 commitment write, Finance journal, payable or source adapter.

Run:

```bash
npm run module-8:react:gate
```

With genuine Stage-12 live acceptance the gate may report `STAGE_13_MODULE_8_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD`; otherwise the truthful static result is `STAGE_13_MODULE_8_REACT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING`.

Next reviewed pass: **Pass 231 - Module 8 Playwright Procurement & RFQ workflow verification**.

## Pass 231 - Playwright Procurement & RFQ workflow verification

Pass 231 adds verification only. It prepares one real Playwright workflow over the built React application, Fastify API and disposable PostgreSQL database in:

```text
tests/e2e/module-8-browser.spec.mjs
```

The browser flow signs in through Module 24A, selects an authorized Project through the existing Project register, creates a server-numbered purchase requisition using an active Module-6 posting combination, submits it after the frozen Module-7 budget readiness gate, creates and issues an RFQ to two ACTIVE + QUALIFIED Module-8 Vendor identifiers, records two supplier quotations, compares their server-calculated values and selects the reviewed quotation with rationale.

The flow also exercises the local JSON quotation-line import without inventing a server import route. Browser request assertions keep every Procurement call inside the eight reviewed endpoints and reject Company, actor, requester, buyer, numbering, lifecycle, server-total and financial-commitment authority in request bodies. A read-only Procurement user is verified to have write controls hidden while direct create/selection attempts still receive HTTP 403.

Quotation selection remains pre-commitment: the browser scenario verifies no Module-7 cost commitment or Finance journal is created by selection. Vendor list/CRUD, RFQ list/detail, separate RFQ-item CRUD, Purchase Order conversion and financial posting remain intentionally absent. Pass 362 supplies RFQ line identities only through the existing RFQ workflow.

Pass 231 changes no production runtime file, Prisma model or migration. The dependency-backed browser run remains guarded by `RUN_MODULE_8_E2E=1`, `RUN_FOUNDATION_DB_TESTS=1` and genuine Stage-12 live acceptance. Static preparation remains fail-honest while that prerequisite is absent.

Run the static preparation gate with:

```bash
npm run module-8:playwright:gate
```

Run the genuine browser gate only in the prepared live environment with:

```bash
RUN_MODULE_8_E2E=1 RUN_FOUNDATION_DB_TESTS=1 npm run module-8:playwright:gate:live
```

Next reviewed pass: Pass 232 - Module 8 operational, migration and concurrency verification.

## Pass 232 operational, migration and concurrency verification

Pass 232 is verification-only. Pass 232 adds no production runtime code, database migration or public API. Pass 224 remains the single Stage-13 persistence change.

The prepared live operational suite extends the existing Module-8 PostgreSQL/Fastify integration file and verifies:

- concurrent purchase-requisition creation still uses the Company/Project lock plus Foundation numbering to allocate unique monotonic PR numbers;
- concurrent RFQ creation uses the same reviewed numbering boundary and allocates unique monotonic RFQ numbers;
- retrying requisition submit, RFQ issue or the same quotation selection does not duplicate the reviewed audit/outbox transition;
- RFQ issue leaves exactly one invitation row per requested Vendor under retry;
- retry-safe quotation selection remains pre-commitment and leaves Module-7 commitments plus Finance journals untouched;
- quotation totals outside the reviewed `DECIMAL(18,2)` storage range fail without a persisted quotation, invitation-response mutation or quotation audit/outbox row;
- a policy-rejected non-lowest selection without required rationale leaves RFQ/quotation lifecycle state unchanged;
- `EXPLAIN (FORMAT JSON)` with sequential scans disabled can use the reviewed Vendor, requisition, RFQ, invitation, quotation and quotation-item indexes without imposing a fragile hard-duration threshold.

The guarded live gate reruns both supported migration paths (clean database and immediately previous supported schema) before focused operational execution. It requires genuine Stage-12 acceptance plus Pass-229 integration/security and Pass-231 Playwright live verification. Missing runtime prerequisites produce blocked evidence instead of a successful operational claim.

Pass 232 historically did not resolve the documented Vendor-public-API or `rfqItemId` relationship gaps. Pass 362 later resolves only the RFQ-item data-integrity gap without introducing a commitment, journal, payable, Purchase Order conversion or separate RFQ-item application surface.

Next reviewed pass: **Pass 233 - Module 8 final Stage-13 acceptance gate**.

## Pass 233 final Stage-13 acceptance

Pass 233 adds the final verification gate for **Module 8 - Procurement & RFQ**. It changes no production runtime code, database schema, migration or public API. Pass 224 remains the only Stage-13 persistence migration.

Static acceptance is run with:

```bash
npm run module-8:gate
```

The static gate reruns the hard-prerequisite Module 5, Module 6, Module 7, Module 22 and Module 24B regressions, the complete Module-8 suite, the full project static regression, workspace/stack validation, migration policy, PostgreSQL integration-test syntax, Playwright syntax, and the Procurement service/repository syntax checks.

Genuine runtime acceptance remains guarded. It requires a real `STAGE_12_ACCEPTED_READY_FOR_STAGE_13` handoff plus successful Pass-229 integration/security, Pass-231 Playwright and Pass-232 operational live evidence. Only after those proofs may the final live gate perform a clean install, typecheck, lint, Prisma validate/generate, clean + immediately-previous-schema migration verification, build, real Module-8 backend/security integration, browser workflow, operational concurrency checks and the Module-7 operational regression.

```bash
MODULE_8_LIVE_GATE_CONFIRM=RUN_CONSTRUCTION_ERP_MODULE_8_LIVE_GATE \
MIGRATION_TEST_CONFIRM=RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE \
RUN_FOUNDATION_DB_TESTS=1 \
RUN_MODULE_8_E2E=1 \
npm run module-8:acceptance:live
```

Only a successful live gate may report:

```text
STAGE_13_ACCEPTED_READY_FOR_STAGE_14
```

The original Stage-13 source boundary remains eight source/Part-I tables, eight public operations, five stable permissions and four reviewed domain events. Pass 362 adds exactly one post-Stage-23 **support table** (`rfq_items`) to repair referential integrity; it adds no public operation, permission or event. Module 8 remains the Vendor-master owner, and quotation selection remains pre-commitment: it creates no Module-7 cost commitment, Finance journal, payable or Purchase Order.

The remaining source gaps stay explicit: Appendix A still defines no Vendor-master management API; requisition revision/return-to-draft commands are still absent from the reviewed route table; and no source-defined FX/evaluation-scoring contract exists for quotation comparison. The former `rfq_item_id` target gap is now resolved only through the explicit Pass-362 amendment above.

With the currently supplied cumulative project, Stage-12 live acceptance is still blocked, so Pass 233 may prove static readiness but must not claim Stage-13 runtime acceptance.

Next reviewed pass after genuine Stage-13 acceptance: **Pass 234 - Stage 14 / Module 9 Purchase Orders contract freeze**.


## Pass 363 post-Stage-23 repair amendment — Vendor master and durable readback

Part I makes Module 8 the Vendor master owner, but the original Appendix route table did not define Vendor management operations. Pass 363 therefore preserves the original eight Stage-13 source operations and adds one deliberately narrow repair surface instead of generic CRUD.

### Repair operations

- `GET /api/v1/procurement/vendors`
- `POST /api/v1/procurement/vendors`
- `PATCH /api/v1/procurement/vendors/:id`
- `POST /api/v1/procurement/vendors/:id/archive`
- `POST /api/v1/procurement/vendors/:id/restore`
- `POST /api/v1/procurement/vendors/:id/contacts`
- `PATCH /api/v1/procurement/vendors/:vendorId/contacts/:contactId`
- `GET /api/v1/procurement/requisitions/:id`
- `POST /api/v1/procurement/requisitions/:id/revise`
- `GET /api/v1/procurement/rfqs`
- `GET /api/v1/procurement/rfqs/:id`

Vendor records remain Company-owned and non-destructive: archive/restore is supported, DELETE is not. Vendor management reuses `procurement.rfq.manage`; no new permission or lifecycle enum is introduced. RFQ invitations and quotations continue to require active qualified Vendors.

A requisition revision is not an unrestricted edit. Only the original requester with `procurement.pr.create` may revise a `SUBMITTED`, `RETURNED` or `REJECTED` requisition; the command requires a reason, revalidates Project cost structures, refuses an RFQ-backed requisition, and transitions the revised source back to `DRAFT`. Audit evidence records the controlled revision.

This amendment creates no new database table, migration, permission, stable Module-8 error code or domain event. Purchase Order conversion/commitment remains Module 9; Finance source adapters remain Stage 26 and cross-module completion remains Stage 27.
