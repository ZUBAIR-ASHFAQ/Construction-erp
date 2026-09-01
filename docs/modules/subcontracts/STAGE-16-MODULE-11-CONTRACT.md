# Stage 16 — Module 11 Subcontractor Management Contract

## Purpose

Stage 16 freezes the executable boundary for **Module 11 — Subcontractor Management** before Prisma models, migrations, backend runtime code or React code are generated.

Module 11 manages subcontractor master data, subcontract agreements, scope/BOQ and cost-coded lines, progress applications, certified values and retention. Its source-owned commercial transactions create Project commitments in Module 7 while formal Finance/AP source adapters remain deferred to Module 15B.

The corrected dependency-aware order is:

```text
Stage 13  Module 8 - Procurement & RFQ / supplier-vendor master
Stage 14  Module 9 - Purchase Orders
Stage 15  Module 10 - Inventory & Materials
Stage 16  Module 11 - Subcontractor Management
Stage 17  Module 12 - Equipment Management
...
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
```

Part I is authoritative for generation order, hard dependencies, master-data ownership and deferred integrations. Appendix A remains authoritative for Module-11 workflow, API routes, validation, permissions, events, UI and acceptance requirements unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-16 runtime handoff is genuine Stage-15 live acceptance:

```text
STAGE_15_ACCEPTED_READY_FOR_STAGE_16
```

The Module-11 contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-16 production runtime activation or deployment.

The corrected hard prerequisites are:

```text
Module 5   Project Management
Module 6   WBS & Cost Codes
Module 7   Budgeting & Job Costing
Module 8   Procurement & RFQ supplier/vendor master
Module 22  Approval Workflows
```

Module 4 BOQ Management is optional when a subcontract item uses a BOQ link. Project-scope authorization already exists through Module 24B and must be reused rather than duplicated.

## Master-data ownership boundary

Part I makes Module 8 the supplier/vendor master owner. Module 11 owns the subcontractor business identity and may link it to an existing vendor; it must not duplicate or replace the Module-8 vendor master.

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency / numbering       Foundation
users / roles / permissions                                Module 24A
projects / Project scope                                    Modules 5 / 24B
boq_items                                                   Module 4B when used
wbs_nodes / cost_codes / cost_types / project_cost_codes   Module 6
cost_commitments / job-cost controls                       Module 7
vendors / vendor_contacts                                  Module 8
approval definitions / requests / actions                  Module 22
```

Later ownership remains:

```text
formal subcontract AP source adapter / reconciliation      Module 15B
approved formal subcontract variation adapter              Module 17 / Stage 27 integration completion
reports / analytics                                         Module 23
dashboard                                                   Module 1
```

Module 11 must not create a second vendor master, generic approval engine, Finance/AP ledger, Change Order module, reporting store or dashboard store.

## Reviewed persistence boundary

Module 11 owns exactly these five source-defined persistence resources:

```text
subcontractors
subcontracts
subcontract_items
subcontract_payment_applications
subcontract_payment_lines
```

No sixth Module-11 business table is part of the reviewed Appendix-A table list.

### subcontractors

Source-defined fields:

```text
id
company_id
code
legal_name
tax_no nullable
status
contact_json
compliance_status
```

Required meaning:

- every subcontractor belongs to one Company;
- code/legal/compliance/contact data belongs to the subcontractor record, but Vendor master identity still belongs to Module 8;
- the source does not enumerate subcontractor `status` or `compliance_status` token vocabularies;
- Company ownership is server-derived and never trusted from a browser request.

Part I additionally requires that a subcontractor **may link to an existing vendor**. The detailed table list does not name the relationship column. To satisfy the controlling correction without inventing a mapping table, Stage 16 freezes the minimal implementation convention for Pass 257:

```text
subcontractors.vendor_id nullable -> vendors.id
```

This nullable direct FK is an explicit implementation decision derived from Part I, not an Appendix-A field. It must enforce same-Company ownership. A subcontractor without a vendor link remains valid when the business record is not represented in the supplier master.

The reviewed route table provides subcontractor list/create only. It defines no update/archive/delete operation, so Stage 16 must not generate generic subcontractor CRUD.

### subcontracts

Source-defined fields:

```text
id
company_id
project_id
subcontract_no
subcontractor_id
status
start_date
end_date nullable
original_value
revised_value
retention_percent
currency
```

Required meaning:

- every subcontract belongs to one Company and one Project;
- `subcontractor_id` resolves to the Module-11 subcontractor master in the same Company;
- subcontract number is unique under the source-described Company/Project policy; the Appendix does not choose the exact database uniqueness shape, so Pass 257 must record the reviewed persistence decision;
- commercial values and retention are decimal-safe and losslessly serialized;
- lifecycle state is server-owned; the source does not enumerate every internal status token;
- executed subcontracts are not silently overwritten. Approved variation/revision is the source-required correction path.

The source workflow says a draft subcontract is submitted and approved before execution, but the eight-route Module-11 API table contains no dedicated subcontract submit or approve endpoint. Stage 16 must reuse Module 22 rather than inventing a second approval engine or generic `/approve` route.

### subcontract_items

Source-defined fields:

```text
id
subcontract_id
boq_item_id nullable
description
quantity
unit
rate
amount
wbs_node_id
cost_code_id
cost_type_id
```

Required meaning:

- every line belongs to one subcontract;
- BOQ linkage is optional and, when supplied, must resolve to the correct Project scope;
- WBS/Cost Code/Cost Type must resolve to a valid Module-6 posting combination for the subcontract Project;
- quantity/rate/amount use decimal-safe persistence;
- commercial totals and commitment amounts are server-authoritative;
- the source does not define a separate subcontract-item CRUD API. Item changes are part of the draft subcontract command boundary.

### subcontract_payment_applications

Source-defined fields:

```text
id
subcontract_id
application_no
period_from
period_to
claimed_amount
certified_amount
retention_amount
status
```

Required meaning:

- every application belongs to one subcontract;
- application numbering must be concurrency-safe under a reviewed scope;
- valuation dates must be normalized and `period_to` cannot precede `period_from`;
- claimed amount is derived/validated from the application detail rather than trusted as an arbitrary browser total;
- certified amount and retention amount are server-owned;
- the source does not enumerate the payment-application status vocabulary.

The reviewed API defines application creation and certification commands but no payment-application list/get/update/delete route.

### subcontract_payment_lines

Source-defined fields:

```text
id
application_id
subcontract_item_id
previous_qty
current_qty
current_value
certified_value
```

Required meaning:

- every line belongs to one payment application and one item on the same subcontract;
- previous/current quantities and values are decimal-safe;
- previous certified progress must be derived from prior immutable certification history rather than trusted from browser input;
- certified value is server-controlled by the certification command;
- cumulative certified quantity/value cannot exceed the approved subcontract plus valid variations unless an explicitly authorized source rule exists.

The Appendix does not define a separate deductions table or variation-line table. Stage 16 must not invent either during contract freeze.

## Module-8 vendor link boundary

The corrected master-data rule is:

```text
vendor master            Module 8
subcontractor master     Module 11
optional relationship    subcontractors.vendor_id -> vendors.id
```

Required checks for the later repository/service passes:

- linked Vendor exists;
- Vendor belongs to the same Company;
- a foreign-Company Vendor must never be exposed as a not-found leak across tenant boundaries;
- Module 11 does not duplicate `vendor_contacts`, Vendor qualification fields or supplier commercial master data;
- Vendor lifecycle authority remains Module 8.

## Module-22 approval boundary

The source workflow requires the agreement to be approved before execution and validation explicitly says execution requires approval. Module 22 is a corrected hard prerequisite.

The reviewed Module-11 API contains no:

```text
POST /api/v1/subcontracts/:id/submit
POST /api/v1/subcontracts/:id/approve
POST /api/v1/subcontracts/:id/reject
POST /api/v1/subcontracts/:id/return
```

Therefore Stage 16 freezes these rules:

- Module 22 owns approval definitions, requests, actions and terminal decision state;
- Module 11 owns the subcontract lifecycle transition and may observe/revalidate the Module-22 decision before execution;
- no duplicate Module-11 approval table or generic approve/reject route is generated;
- the source does not define a direct approval-request FK on `subcontracts`; generic approval resource references stay cross-cutting;
- the exact server-owned approval definition code/configuration is an implementation configuration decision for the later service pass, not browser input.

## Module-7 commitment boundary

Module 7 owns source-derived `cost_commitments` and intentionally does not expose browser CRUD for them.

Stage 16 freezes the source-required integration:

```text
approved subcontract
  -> execute
  -> create Module-7 commitment atomically
```

Required invariants:

- execution creates the subcontract commitment exactly once;
- commitment rows are keyed idempotently by stable subcontract/source-line identity;
- the browser never writes `cost_commitments` directly;
- a failed commitment write must roll back execution, audit and outbox changes;
- approved later subcontract revision/variation may change commitment value only through a reviewed controlled adapter;
- Module 11 does not create Module-7 `cost_actuals` merely because a payment application is certified.

The Appendix requires commitment posting to be idempotent by subcontract/application source keys but does not define the exact internal `source_type`, source-line encoding or commitment status tokens. Those remain implementation details to be frozen consistently before the write adapter is activated.

## Finance / AP deferral boundary

Appendix A describes certified payable flow to Finance/AP. Part I explicitly places source-specific subcontract Finance adapters at **Module 15B / Stage 26** after the source modules exist.

Therefore Stage 16 must not create:

```text
AP invoice
supplier/subcontract payment
payment allocation
Finance journal
subcontract AP subledger adapter
```

Stage 16 must preserve an immutable, stable certification source snapshot/source key so Module 15B can later post it idempotently. The source business rule that AP posting is idempotent remains a downstream obligation; Passes 256-266 must not falsely claim the Stage-26 adapter is complete.

## Certification and retention boundary

The source validation rules are mandatory:

- execution requires valid cost coding and approval;
- certified cumulative quantity/value cannot exceed the approved subcontract plus variations unless authorized;
- retention is calculated server-side with cap/release rules;
- certified snapshots are immutable after posting;
- corrections use reversal/re-certification instead of destructive edit.

The Appendix does not define exact retention rounding, cap formula, release trigger, a retention-release API, a retention-ledger table or a dedicated deduction table. Stage 16 records those gaps rather than inventing new persistence or routes.

Because Module 17 Change Orders is generated later, Stage 16 must not invent the future formal variation adapter. The `revised_value` field exists and `subcontract.revised` is a source event, but the exact approved variation/revision command and data owner are not defined in the eight-route Module-11 API. Any later linkage must remain traceable and completed through the corrected Stage-27 integration gate.

## Exact reviewed public API surface

Stage 16 freezes exactly these eight operations:

```text
GET   /api/v1/subcontractors
POST  /api/v1/subcontractors
POST  /api/v1/subcontracts
PATCH /api/v1/subcontracts/:id
POST  /api/v1/subcontracts/:id/execute
POST  /api/v1/subcontracts/:id/payment-applications
POST  /api/v1/subcontracts/:id/payment-applications/:appId/certify
POST  /api/v1/subcontracts/:id/close
```

Do not add generic CRUD routes automatically. The following source-unsupported APIs are explicitly **not generated by this contract freeze**:

```text
GET /api/v1/subcontracts/:id
GET /api/v1/subcontracts
DELETE /api/v1/subcontracts/:id
POST /api/v1/subcontracts/:id/submit
POST /api/v1/subcontracts/:id/approve
POST /api/v1/subcontracts/:id/revisions
GET /api/v1/subcontracts/:id/payment-applications
GET /api/v1/subcontracts/:id/retention
POST /api/v1/subcontracts/:id/retention/release
PATCH /api/v1/subcontractors/:id
DELETE /api/v1/subcontractors/:id
```

### Readback/UI source gap

The source-required React feature includes subcontract detail, scope/BOQ lines, commitment summary, progress application/certification and retention ledger views, but the reviewed public route table contains only one GET route: the subcontractor list.

Therefore Pass 256 records a real readback mismatch. Later passes must not silently invent GET/detail/ledger routes merely to make the UI easy. Pass 263 must either use a reviewed extension decision recorded before implementation or limit UI readback to data returned by the frozen command responses. This contract freeze does not decide an undocumented public API.

## Request authority

All normal routes require an authenticated session. The server derives Company, actor and Project scope from request context.

The browser must never supply or control:

```text
companyId
actorUserId
permissions
allowedProjectIds
approvalDefinitionCode
approvalStatus
subcontractNo when server numbering is selected
serverCalculatedOriginalValue
serverCalculatedRevisedValue
serverCalculatedClaimedAmount
certifiedAmount
retentionAmount
commitmentAmount
commitmentSourceKey
financePostingState
```

Dates, UUIDs and decimals are normalized at the API boundary. Financial/commercial decimals are serialized without floating-point precision loss.

## Reviewed permission vocabulary

The source defines exactly these seven typical stable permissions:

```text
subcontractors.read
subcontractors.manage
subcontracts.read
subcontracts.create
subcontracts.execute
subcontracts.certify
subcontracts.close
```

No source-defined permission exists for `subcontracts.update`, `subcontracts.apply`, `subcontracts.revise`, `subcontracts.retention.release` or a Module-11 approval action. Pass 258/260 must map the reviewed commands to the existing permission set without inventing public permission codes silently.

The PATCH draft-edit operation exists while the permission list has no explicit edit permission. Pass 256 records this mismatch; the service pass must choose and document the narrowest reviewed authority instead of creating a new permission token without source support.

## Reviewed stable business errors

Stage 16 freezes exactly these five Module-11 source-defined business conflicts:

```text
SUBCONTRACT_NOT_FOUND
SUBCONTRACT_NOT_APPROVED
PAYMENT_APPLICATION_INVALID
CERTIFIED_VALUE_EXCEEDS_CONTRACT
SUBCONTRACT_NOT_READY_TO_CLOSE
```

Shared authentication/authorization/validation errors remain owned by the existing platform contract and do not become new Module-11 business errors.

## Reviewed events

Stage 16 freezes exactly these five source-defined domain events:

```text
subcontract.executed
subcontract.revised
subcontract.payment_application_submitted
subcontract.payment_certified
subcontract.closed
```

Events are recorded through the Foundation outbox only after successful business validation and in the same business transaction where correctness requires it. Core correctness must not depend on a worker.

The source defines `subcontract.revised` even though the eight-route Module-11 API defines no explicit revision command. This mismatch is preserved as an integration gap rather than resolved by inventing an endpoint in Pass 256.

## Audit boundary

Later service transactions must audit contract terms, execution, certified quantities/amounts, retention and closeout. Audit data includes actor, Company/Project scope, entity identity, request identity and important before/after values, without passwords, tokens or secrets.

Audit/outbox failure that belongs to the owning transaction must not leave a partially executed subcontract, commitment or certification state.

## Closeout boundary

The source allows close only after final account and retention-release conditions are met, but it does not define the exact final-account state fields, retention-release route, retention ledger table or open-liability query contract.

`SUBCONTRACT_NOT_READY_TO_CLOSE` therefore remains the fail-closed business conflict until the service can prove the reviewed close conditions from authoritative data. Pass 256 must not weaken closeout merely because some source detail is deferred.

## React boundary

The source-required React feature location is:

```text
apps/web/src/features/subcontracts/
  api/
  hooks/
  components/
  pages/
```

Minimum source UI:

```text
Subcontractor register
Subcontract detail
Scope / BOQ lines
Commitment summary
Progress application / certification
Retention ledger
```

TanStack Query owns server state. React Hook Form + Zod handle forms. UI actions are permission-aware, while the API remains authoritative.

No React code is generated in Pass 256. The readback mismatch described above must stay explicit until a reviewed decision exists.

## Explicit unresolved source ambiguities

Pass 256 records these gaps so later code does not silently invent business behavior:

1. Part I requires an optional Vendor link but Appendix A omits the relationship column; Stage 16 chooses minimal nullable `vendor_id` as an explicit implementation convention for Pass 257.
2. The workflow requires submit/approval while the eight-route Module-11 API has no submit/approve/reject/return command.
3. The API has no subcontract list/detail GET despite required detail/commitment/application/retention UI.
4. The API has no payment-application list/get/update command despite required application/certification UI.
5. `subcontract.revised` and approved variation/revision behavior are defined, but no revision route/table/permission is defined.
6. Module 17 owns later formal Change Orders; exact subcontract variation linkage remains deferred.
7. Retention is server-calculated, but exact formula, cap, rounding, release trigger and retention-release command are not defined.
8. The source mentions deductions during certification but defines no deduction field/table/route.
9. Subcontract number and application number require a practical concurrency-safe scope, but exact numbering scope is not stated.
10. Status/compliance/lifecycle token vocabularies are not enumerated.
11. The PATCH draft-edit route exists, but the permission list contains no explicit `subcontracts.edit` permission.
12. The source says cumulative certification may exceed the approved subcontract only when authorized, but defines no override permission/configuration or request field; default behavior must fail closed.
13. The exact Module-7 commitment source_type/source-line/status encoding is not defined.
14. Certified payable flows to AP in the business workflow, but Part I defers the actual source adapter to Module 15B / Stage 26.
15. Closeout requires final-account/retention conditions, but exact persistence and readback fields for proving them are not defined.
16. The source field list contains `contact_json`, but no exact contact object schema is defined.
17. The source does not state whether `amount` is always `quantity * rate`, its rounding scale, or whether manual amount overrides are allowed.
18. The source does not define currency conversion/FX behavior; Stage 16 must not invent an FX engine.

## Pass-256 implementation boundary

Pass 256 is contract-only. It must add no:

```text
Prisma Module-11 model
Stage-16 database migration
subcontracts.schema.ts
subcontracts.repository.ts
subcontracts.service.ts
subcontracts.routes.ts
subcontracts/index.ts
React feature
public API registration
Module-7 commitment runtime adapter
Module-22 approval runtime adapter
Module-15B AP adapter
Module-17 variation adapter
```

The next reviewed pass is:

```text
Pass 257 - Module 11 reviewed Prisma models, constraints, indexes and Stage-16 migration
```

Pass 257 must preserve every ambiguity above rather than silently expanding the module boundary.

## Pass 257 — Module 11 persistence implementation

Pass 257 appends the reviewed Stage-16 Prisma persistence layer while preserving the Pass-256 API and business ambiguities. It creates no Module-11 HTTP schema, repository, service, route, React feature, Module-7 commitment adapter, Module-22 approval adapter, Module-15B Finance adapter or Module-17 variation adapter.

### Exactly five Module-11 models/tables

The Stage-16 migration creates only:

```text
subcontractors
subcontracts
subcontract_items
subcontract_payment_applications
subcontract_payment_lines
```

No revision, deduction, retention-ledger, approval, AP/Finance, payment, Change Order or reporting table is added.

### Vendor-link persistence decision

The corrected Part-I rule is implemented as the minimal nullable direct relationship frozen in Pass 256:

```text
subcontractors.vendor_id nullable
  -> vendors.id
```

The database uses the existing `vendors(id, company_id)` unique key so a linked Vendor must belong to the same Company. `vendor_id` remains optional, and Module 8 continues to own Vendor contacts, qualification and supplier lifecycle data.

### Numbering uniqueness decisions

The source requires practical concurrency-safe numbering but does not fully state the scopes. Pass 257 records these narrow persistence conventions:

```text
subcontract number:
  UNIQUE(company_id, project_id, subcontract_no)

payment application number:
  UNIQUE(subcontract_id, application_no)
```

These constraints protect concurrency without adding a new numbering table. Actual number allocation remains a later service concern using the existing Foundation numbering contract. Subcontractor `code` is indexed but is **not** made unique because the source does not state a uniqueness rule for it.

### Decimal persistence decisions

Commercial values use PostgreSQL/Prisma `DECIMAL` rather than JavaScript floating point:

```text
quantity / rate / previous_qty / current_qty   DECIMAL(18,4)
original/revised/amount/claimed/certified/
retention/current_value/certified_value        DECIMAL(18,2)
retention_percent                              DECIMAL(7,4)
```

`retention_percent` is constrained to `0..100`. Contract values are constrained non-negative and date ranges must be ordered. The source does not define amount formula/rounding, negative variation-line semantics or reversal representation, so Pass 257 does not add a database `quantity * rate = amount` formula or broad sign checks to payment/certification lines. Those remain explicit service-contract decisions.

### Project and cost-structure integrity

A subcontract is constrained to its Company Project and same-Company subcontractor. Each subcontract item references the reviewed WBS node, Cost Code and Cost Type. A Stage-16 database trigger additionally requires the combination to exist as a posting-enabled Module-6 `project_cost_codes` mapping for the subcontract Project.

When `boq_item_id` is present, the linked BOQ item must resolve through its revision to a BOQ mapped to the same Company and Project as the subcontract. Tender-only/unmapped BOQ items therefore cannot be attached to a Project subcontract until the BOQ is Project-mapped through the reviewed Module-4B boundary.

### Payment-line integrity

A payment line references one payment application and one subcontract item. A database trigger rejects a line when the referenced item belongs to a different subcontract from the application. Pass 257 does not invent a one-line-per-item uniqueness rule because the source does not explicitly state that persistence invariant.

### Preserved lifecycle gaps

Status/compliance values remain string-backed; Pass 257 creates no new Prisma enums. The exact certified-status token is still undefined, so Pass 257 does not invent a database trigger that guesses when a certification snapshot becomes immutable. Pass 260 must enforce the reviewed immutable-certification/reversal rule using the lifecycle contract it documents.

`contact_json` is stored as JSONB but no contact-object schema is invented. Approval state remains in Module 22, commitment data remains in Module 7, and Finance/AP source posting remains deferred to Module 15B / Stage 26.

### Pass-257 migration

```text
packages/database/prisma/migrations/
  20260825000100_module_11_subcontractor_management_core/
    migration.sql
```

The migration is checksum-locked and registered as the Stage-16 latest migration gate. Clean-database and immediately-previous-schema runtime migration verification remain guarded by the existing migration tooling and cannot be claimed until the required upstream live handoff is available.

The next reviewed pass is:

```text
Pass 258 - Module 11 strict Zod request/query/response schemas for exactly the eight reviewed public operations.
```

## Pass 258 — Module 11 strict Zod/API schema implementation

Pass 258 adds only the boundary schema file:

```text
apps/api/src/modules/subcontracts/subcontracts.schema.ts
```

It does not generate the Module-11 repository, service, Fastify routes/index, React feature, Module-7 commitment write adapter, Module-22 approval adapter, Module-15B Finance/AP adapter or Module-17 variation adapter.

### Exact reviewed HTTP boundary

The schema exports constants for exactly the eight Stage-16 operations already frozen in Pass 256. No subcontract list/detail GET, approval command, revision command, payment-application read route or retention-release route is added.

The only source-defined GET route is the subcontractor register. Because Appendix A gives no business filter vocabulary for that read, Pass 258 allows bounded pagination only with a maximum page size of `100`.

### Subcontractor create boundary

The browser may submit only:

```text
vendorId nullable/optional
code
legalName
taxNo nullable/optional
contactJson
complianceStatus
```

`vendorId` is the nullable Module-8 Vendor link frozen by Part I/Pass 256. Company ownership and subcontractor lifecycle `status` remain server-owned.

The source does not define contact-object keys. Pass 258 therefore validates `contactJson` only as an opaque JSON object and invents no contact name/email/phone shape or Vendor-contact duplication.

### Draft subcontract create/edit boundary

Create accepts:

```text
projectId
subcontractorId
startDate
endDate nullable/optional
retentionPercent
currency
items[]
```

Each item accepts only the source business values:

```text
boqItemId nullable/optional
description
quantity
unit
rate
amount
wbsNodeId
costCodeId
costTypeId
```

The browser cannot supply `subcontractNo`, lifecycle status, Company/actor/scope values, approval state, `originalValue` or `revisedValue`. Header values remain server-calculated.

The source does not define whether line `amount` must equal `quantity * rate`. Pass 258 therefore accepts the source-defined line amount as an exact-decimal business input and does **not** invent an amount formula or rounding rule. The later service must validate the resulting commercial header according to the frozen contract without silently introducing a different formula.

The draft PATCH accepts only `subcontractorId`, dates, retention percent, currency and replacement scope lines. `projectId` is intentionally not patchable because the source defines Project scope on creation but does not define a Project-reassignment workflow. This is a narrow API-boundary decision, not a new business permission. The missing explicit `subcontracts.edit` permission remains unresolved for Pass 260 rather than adding a new permission token in Pass 258.

### Execute and close commands

Both commands are strict bodyless schemas:

```text
POST /api/v1/subcontracts/:id/execute
POST /api/v1/subcontracts/:id/close
```

Execution does not accept approval decisions, commitment amounts/source keys or status from the client. Close does not invent final-account, retention-release or open-liability request fields that the source does not define.

### Payment-application boundary

Application creation accepts:

```text
periodFrom
periodTo
lines[]
  subcontractItemId
  currentQty
  currentValue
```

`applicationNo`, prior quantity, claimed header amount, certified header amount, retention amount and lifecycle status are server-owned. `previousQty` must continue to come from authoritative prior certification history.

The source does not define a `currentValue = quantity * rate` formula. Pass 258 therefore keeps `currentValue` as the source-defined application-line business input and leaves the exact commercial validation rule for Pass 260 rather than inventing arithmetic at the API boundary.

### Certification boundary

Certification accepts only:

```text
lines[]
  subcontractItemId
  certifiedValue
```

The QS line-level certified value is the business decision being recorded. The application-level `certifiedAmount` and `retentionAmount` remain server-calculated snapshots. No deduction field, cumulative-limit override switch, retention-release field, AP-posting field or approval field is invented.

Cumulative contract/quantity limits, server retention, immutable certification and reversal/re-certification remain service-layer invariants for Pass 260.

### Exact decimal/date boundary

Stage-16 commercial values remain strings at the API boundary so JavaScript floating-point conversion does not own financial precision:

```text
quantity / rate / currentQty / previousQty     up to 4 decimal places
money values                                    up to 2 decimal places
retentionPercent                                up to 4 decimal places, 0..100
currency                                        normalized three-letter code
dates                                           YYYY-MM-DD valid calendar dates
```

Status/compliance tokens remain bounded strings. No source-unsupported lifecycle enum is introduced.

### Response boundary

Command responses expose safe server-authoritative subcontract, scope-line and payment-application snapshots, including server-numbered document identities and calculated header totals. They do not expose Company ownership internals, approval-definition/decision internals, Module-7 commitment source keys or Stage-26 Finance posting state.

Pass 258 deliberately does not invent a commitment DTO/read route merely to solve the later React commitment-summary gap. That readback mismatch remains recorded for the reviewed Pass-263 decision.

### Errors, permissions and events

The schema preserves exactly the frozen:

```text
7 permission codes
5 Module-11 business error codes
5 Module-11 event names
```

`PAYMENT_APPLICATION_INVALID` maps to the shared validation error type; `SUBCONTRACT_NOT_FOUND` maps to not-found; the remaining reviewed lifecycle/value conflicts map to conflict errors. No extra Module-11 public error code is introduced.

### Pass-258 gate

Run:

```bash
npm run module-11:schema:gate
```

With a genuine Stage-15 live handoff the gate may report:

```text
STAGE_16_MODULE_11_SCHEMA_READY_FOR_PASS_259
```

Until that handoff exists the truthful prepared status is:

```text
STAGE_16_MODULE_11_SCHEMA_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING
```

The next reviewed pass is:

```text
Pass 259 - Module 11 Company/Project-scoped repository with Vendor/BOQ/cost-structure lookups, row locking, payment-application persistence and Module-7 commitment primitives.
```

## Pass 259 — Company/Project-scoped repository

Pass 259 adds only `apps/api/src/modules/subcontracts/subcontracts.repository.ts` after the reviewed Stage-16 persistence and Zod boundary. It does not generate service rules, Fastify routes, module registration, React UI, Finance/AP adapters or Change Order persistence.

The repository derives every Company predicate from `requireCompanyRepositoryScope()` and accepts explicit Module-24B Project visibility wherever a subcontract/project record is read or prepared for mutation. Company ownership and allowed Project scope therefore remain server-owned rather than request-body fields.

Prepared persistence primitives are deliberately narrow:

```text
subcontractor list / find / create
read-only Module-8 Vendor lookup
read-only Project and posting-enabled Module-6 cost-structure lookup
read-only Project-mapped BOQ-item lookup
subcontract create / draft replacement / expected-state status update
subcontract FOR UPDATE row lock
payment-application list / find / create
payment-application FOR UPDATE row lock
service-calculated certification snapshot update
Module-7 source-keyed commitment read / upsert
```

The repository does **not** decide lifecycle tokens, approval outcomes, retention formulas, certification limits, source-type/status vocabularies or closeout policy. Those remain Pass-260 service invariants. `subcontracts.updateMany` uses an expected status only as a compare-and-set persistence primitive; the repository does not choose which transitions are legal.

Vendor ownership remains in Module 8. Pass 259 can read a same-Company Vendor while creating a linked subcontractor, but it contains no Vendor create/update/delete method. BOQ and Module-6 cost structures are also read-only dependencies.

Subcontract and payment-application locks are prepared so Pass 260 can serialize execution/certification and keep commitment/cumulative-value checks inside one transaction. Payment-application readback exists only as an internal repository primitive needed for prior/cumulative progress calculation; no unsupported public GET endpoint is created.

Module-7 commitment persistence reuses the existing `cost_commitments` source key:

```text
company_id + project_id + source_type + source_id + source_line_id
```

Pass 259 intentionally leaves the exact subcontract `source_type`, source-line identity and commitment status tokens to Pass 260 instead of inventing them inside persistence access.

No AP invoice, Finance journal, payment allocation, approval-request persistence, retention-ledger table, subcontract revision table or Module-17 variation adapter is added. The Stage-26 Finance adapter and Stage-27 deferred integrations remain authoritative.

Run:

```bash
npm run module-11:repository:gate
```

With genuine Stage-15 live acceptance the gate may report:

```text
STAGE_16_MODULE_11_REPOSITORY_READY_FOR_PASS_260
```

Until then the truthful prepared state remains:

```text
STAGE_16_MODULE_11_REPOSITORY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING
```

The next reviewed pass is:

```text
Pass 260 - Module 11 service/business transactions: Project resource policy, Module-22 approval verification, atomic execution/commitment, progress applications, certification/retention, closeout, idempotency, audit and outbox.
```

## Pass 260 — Service/business-transaction decisions

Pass 260 adds only `apps/api/src/modules/subcontracts/subcontracts.service.ts`. It keeps Fastify routes/index registration, React, formal Change Orders and Finance/AP source adapters deferred to their reviewed later passes.

The service uses narrow internal persistence tokens only; they are not promoted to new public schema enums:

```text
subcontractor status          ACTIVE
subcontract lifecycle         DRAFT -> EXECUTED -> CLOSED
payment application           SUBMITTED -> CERTIFIED
Module-7 commitment source    subcontract
Module-7 commitment status    ACTIVE
```

Because Appendix A defines a draft PATCH and application-create command but provides no separate edit/application-create permission, Pass 260 uses `subcontracts.create` as the narrowest reviewed Project permission for those two creation/draft-maintenance actions. It does not invent `subcontracts.edit` or another permission token. Execute, certify and close use their exact reviewed permission codes.

All seven Module-11 writes use the Foundation idempotency contract. Subcontracts and payment applications use Foundation company number sequences named `subcontract` and `subcontract-payment-application`; the persistence uniqueness constraints remain the final database guard.

Header `originalValue` and `revisedValue` are calculated from the exact source-defined line `amount` values. Pass 260 does not infer `amount = quantity * rate`, because the source never defines that formula or its rounding rule.

Execution owns the narrow Module-22 handshake because the reviewed public Module-11 API contains no submit/approve route. The server-owned approval definition code is configured outside request bodies. The approval request source key includes a fingerprint of the complete commercial subcontract snapshot, so changing a DRAFT contract after an earlier request requires a fresh approval rather than reusing an approval for different commercial terms. Execution rechecks that exact approval under the subcontract row lock, transitions to `EXECUTED`, creates one Module-7 commitment per subcontract item keyed by the item id, and records audit/outbox in the same transaction.

Progress applications derive `previousQty` and previously certified value only from earlier `CERTIFIED` applications. Current cumulative quantity may not exceed the subcontract item quantity, and prior certified value plus the new claimed line value may not exceed the item amount. The application header claimed amount is the exact server sum of submitted current line values.

Certification locks both the subcontract and application. Only `SUBMITTED` applications can become `CERTIFIED`. The service enforces per-item and whole-contract cumulative certified-value limits against `revisedValue`. The source requires server-owned retention but does not define the exact formula/cap/rounding, so Pass 260 records this explicit implementation convention rather than hiding it: retention equals the newly certified amount multiplied by the subcontract retention percentage, calculated with exact integer arithmetic and half-up cent rounding, capped so cumulative retention does not exceed the same percentage of revised contract value.

The certified application is the immutable Stage-16 certification snapshot. No mutation path back to submitted/draft is added. A stable certification source key using source type `subcontract-payment-certification` is placed in audit/outbox metadata for the future Stage-26 Finance source adapter. Pass 260 creates no AP invoice, Finance journal, payment allocation or `cost_actuals` row.

Closeout remains deliberately fail-closed because Stage 16 has no reviewed retention-release command or final-account proof model. A subcontract can close only when it is executed, has at least one application, every application is certified, cumulative certified amount exactly equals revised contract value, and persisted outstanding retention equals zero. A non-zero retention contract therefore cannot be closed until a later authoritative retention-release contract exists; Pass 260 does not fabricate one.

`subcontract.revised` remains a source-defined event name but is not emitted because the reviewed Stage-16 API contains no revision/variation command. Formal Module-17 variation behavior remains deferred.

Run:

```bash
npm run module-11:service:gate
```

With a genuine Stage-15 live handoff the gate may report:

```text
STAGE_16_MODULE_11_SERVICE_READY_FOR_PASS_261
```

Until that upstream handoff exists the truthful prepared status is:

```text
STAGE_16_MODULE_11_SERVICE_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING
```

The next reviewed pass is:

```text
Pass 261 - Module 11 Fastify routes, authentication/RBAC, OpenAPI and module registration for exactly the eight reviewed public operations.
```

## Pass 261 HTTP/OpenAPI implementation state

Pass 261 completes the standard five-file Module-11 backend composition by adding `subcontracts.routes.ts` and `index.ts` after the frozen schema, repository and service layers.

Exactly the eight reviewed public operations are registered. Every route requires an active authenticated session. Company, actor and Project scope remain server-derived; the route layer never accepts browser ownership, approval, commitment, certified header totals, retention totals or Finance posting state. The service remains the authoritative RBAC/resource-policy boundary.

All seven writes require the Foundation `Idempotency-Key` header because Pass 260 implemented each write through `executeIdempotentCommand`. Execute and close remain bodyless commands. OpenAPI documents exact decimal strings for quantities, rates, money and retention percentages and preserves the five reviewed Module-11 business errors.

The Module-22 execution approval definition is server-owned configuration exposed as `SUBCONTRACT_APPROVAL_DEFINITION_CODE` and passed through config -> API startup -> app registration -> Module-11 routes/service. It is never accepted from a browser request.

Pass 261 does not add subcontract/detail GET routes, application readback, retention release, generic approval routes, formal Change Order revisions, Finance/AP routes, a migration or React code. Formal Finance/AP source adapters remain deferred to Module 15B / Stage 26 and formal subcontract variation integration remains later work.

Static/runtime preparation may advance to Pass 262 only after this HTTP gate passes. Genuine Stage-16 runtime activation remains blocked until the genuine Stage-15 live acceptance handoff exists.



## Pass 262 — PostgreSQL/Fastify integration and security preparation

Pass 262 adds only live-capable verification after the Pass-261 HTTP composition. No production Module-11 runtime file, Prisma model, migration or reviewed public route changes in this pass.

The integration suite exercises exactly the eight frozen Module-11 operations through the real Fastify -> service -> repository -> PostgreSQL path. It prepares verification for same-Company Module-8 Vendor linkage, server-owned Module-22 execution approval, atomic/idempotent Module-7 commitment creation, progress applications, cumulative certification limits, server-calculated retention, immutable certification behavior and closeout blocking.

Security coverage includes unauthenticated requests, missing permission, restricted Project membership, foreign-Company resources, browser-owned fields and direct database constraint attempts. Late outbox failures are injected during execution and certification so the live run can prove that lifecycle state, commitments, audit and certification snapshots roll back without partial persistence.

Generated OpenAPI is checked at runtime for exactly eight Module-11 operation IDs, bearer authentication, and required `Idempotency-Key` headers on all seven writes. Unsupported subcontract/detail/application readback, generic approval, revision, retention-release and Finance routes must remain absent.

The suite also checks that no Module-7 `cost_actuals` or Finance journals are created by Stage-16 certification. The stable certification source identity is retained for the later Module-15B / Stage-26 Finance adapter rather than pulling AP posting into Module 11. `subcontract.revised` remains source-defined but un-emitted because Stage 16 still has no reviewed revision command.

Run static preparation with:

```bash
npm run module-11:integration-security:gate
```

A genuine PostgreSQL/Fastify run requires both a real `STAGE_15_ACCEPTED_READY_FOR_STAGE_16` handoff and `RUN_FOUNDATION_DB_TESTS=1`:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run module-11:integration-security:gate:live
```

Without that upstream live handoff, the gate must remain fail-honest as:

```text
STAGE_16_MODULE_11_INTEGRATION_SECURITY_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING
```

The next reviewed pass is:

```text
Pass 263 - Module 11 React typed API, TanStack Query hooks and source-supported Subcontractor register, subcontract workflow, commitment, application/certification and retention UI.
```

## Pass 264 - Stage-16 Playwright browser workflow verification

Pass 264 adds one focused browser workflow after the Pass-263 React boundary. It changes no Module-11 production backend runtime, Prisma model, migration or public HTTP route.

The browser scenario signs in through Module 24A, opens the permission-aware Subcontractor Management workspace, creates a subcontractor linked to an existing same-Company Module-8 Vendor, creates one server-numbered Project subcontract with a valid Module-6 cost-coded scope line, edits the DRAFT through the reviewed PATCH, then attempts execution so the existing Module-22 workflow creates the approval request. The same browser approves the request through the Module-22 inbox and retries the reviewed execution command.

Successful execution must expose exactly one Module-7 `cost_commitments` source for the subcontract line. The browser then creates one progress application, certifies the full application value, verifies the server-calculated retention snapshot, and closes the subcontract only when the limited Stage-16 closeout proof is satisfied. The test deliberately uses zero retention for this closeout path because Stage 16 has no reviewed retention-release command.

Browser-network assertions are limited to the eight reviewed Module-11 operation shapes. Every one of the seven browser writes must carry `Idempotency-Key`; Company/actor/project-scope authority, numbering, lifecycle, original/revised header values, application totals, certified totals, retention totals, approval state, commitment authority and Finance posting state must remain absent from browser-owned request bodies.

A read-only Module-11 user can read the subcontractor register but receives no subcontractor/create/edit/execute/application/certification/close controls, and direct create/execute attempts must still return HTTP 403. Cross-Company integrity, cumulative certification overshoot, immutable certification and late-outbox rollback remain additionally covered by the Pass-262 PostgreSQL/Fastify integration-security suite.

The shared Playwright configuration now recognizes `RUN_MODULE_11_E2E=1` and supplies only the existing server-owned `SUBCONTRACT_APPROVAL_DEFINITION_CODE=SUBCONTRACT_EXECUTION` composition required by the seeded approval definition. No Module-11 approval endpoint is introduced.

No subcontract list/detail GET, application-history GET, retention-ledger GET, revision command, retention-release command, Vendor write/list API, Finance/AP/GL posting or Module-7 actual-cost posting is added for browser convenience. The corrected Stage-26 Finance source adapter and later Change Order integration remain deferred.

Run the dependency-independent preparation gate with:

```bash
npm run module-11:playwright:gate
```

A genuine browser runtime success may be recorded only after Stage 15 has live status `STAGE_15_ACCEPTED_READY_FOR_STAGE_16`, `RUN_MODULE_11_E2E=1` is explicitly enabled and the disposable PostgreSQL guard `RUN_FOUNDATION_DB_TESTS=1` is enabled. Until that handoff exists, the truthful state is:

```text
STAGE_16_MODULE_11_PLAYWRIGHT_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING
```

Next reviewed pass: **Pass 265 - Module 11 operational, migration and concurrency verification.**

## Pass 265 operational verification boundary

Pass 265 is verification-only. It adds no production Module-11 behavior, Prisma persistence, migration, route, permission, Finance/AP adapter or Change Order integration.

The live operational gate must prove all of the following before Stage-16 runtime acceptance can advance:

- concurrent Project-scoped subcontract creation produces unique monotonic Foundation numbers without duplicate Company/Project subcontract numbers;
- duplicate concurrent execution of one approved subcontract leaves one lifecycle transition, one audit/outbox event and one Module-7 commitment per source line;
- a failed payment-application submission rolls back the application row, audit state and Foundation number allocation;
- concurrent payment applications receive unique numbers;
- concurrent certifications serialize before cumulative value validation, so two certifications cannot jointly exceed the valid subcontract value;
- certified snapshots remain immutable and Stage 16 still produces no Finance/AP posting or Module-7 actual cost;
- executed subcontract commitment rows reconcile to the server-owned revised subcontract value;
- reviewed Stage-16 read shapes use the intended subcontractor, subcontract, application and payment-line indexes, while Module-7 commitment source lookup uses its source-key index;
- clean migration deployment and upgrade from the immediately previous supported schema both pass before the operational PostgreSQL suite.

The gate deliberately defines no hard latency threshold. It verifies correctness, lock ordering, rollback, reconciliation and index availability without inventing a performance SLA absent from the requirements.

Static preparation may report `STAGE_16_MODULE_11_OPERATIONS_PREPARED_STAGE_15_LIVE_HANDOFF_PENDING`. Only a genuine upstream Stage-15 handoff plus live Pass-262 and Pass-264 evidence may allow `STAGE_16_MODULE_11_OPERATIONS_VERIFIED_READY_FOR_PASS_266`.
