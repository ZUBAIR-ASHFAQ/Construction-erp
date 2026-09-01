# Stage 14 — Module 9 Purchase Orders Contract

## Purpose

Stage 14 freezes the executable boundary for **Module 9 — Purchase Orders** before Prisma models, migrations, backend code or React code are generated.

Module 9 converts an approved procurement selection, or an approved direct-purchase exception, into a controlled Purchase Order. A PO becomes a binding project procurement commitment only when it is approved and issued. Issue, revision and cancellation must keep the Module-7 job-cost commitment synchronized atomically.

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

Part I overrides Appendix A where they conflict. Part I explicitly places Purchase Orders after Procurement & RFQ and before Inventory receipts and supplier Finance adapters.

## Stage prerequisite

The direct Stage-14 runtime handoff is genuine Stage-13 live acceptance:

```text
STAGE_13_ACCEPTED_READY_FOR_STAGE_14
```

The Module-9 contract may be reviewed and frozen while that live handoff is still pending. That does not authorize Stage-14 production runtime activation or deployment.

The corrected hard prerequisites are:

```text
Module 8   Procurement & RFQ
Module 7   Budgeting & Job Costing
Module 22  Approval Workflows
```

Project, WBS/Cost Code and Project-scope authorization are already stable upstream dependencies through the earlier gates and must be reused rather than duplicated.

## Ownership boundary

Module 9 owns exactly these three reviewed persistence resources:

```text
purchase_orders
purchase_order_items
purchase_order_revisions
```

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency / numbering       Foundation
users / roles / permissions                                Module 24A
projects / Project scope                                    Modules 5 / 24B
wbs_nodes / cost_codes / cost_types / project_cost_codes   Module 6
cost_commitments / budget controls                          Module 7
vendors / supplier quotations / RFQ selection              Module 8
approval definitions / requests / actions                  Module 22
```

Later ownership remains:

```text
inventory item master / goods receipts / stock             Module 10
supplier AP and PO Finance source adapter                   Module 15B
reports / analytics                                         Module 23
dashboard                                                   Module 1
```

Module 9 must not duplicate Vendor, Inventory, budget/job-cost, approval, Finance, reporting or dashboard masters.

## Reviewed persistence

### purchase_orders

Source-defined fields:

```text
id
company_id
project_id
po_no
vendor_id
quotation_id nullable
order_date
currency
status
subtotal
tax
total
delivery_address
terms
```

Required meaning:

- every PO belongs to one Company and one Project;
- `vendor_id` resolves to the Module-8 `vendors` master;
- `quotation_id`, when present, resolves to the Module-8 supplier quotation selected through the reviewed RFQ workflow;
- `quotation_id` is nullable so the source can represent an approved direct-purchase exception;
- `po_no` is server-generated with the Foundation concurrency-safe number sequence;
- Company, actor identity, allowed Project scope, lifecycle status, PO number and calculated totals are never browser-owned;
- issue requires an approved PO and creates/updates the Module-7 commitment atomically;
- issued POs are historical business documents and are not deleted.

The source does not enumerate PO lifecycle status tokens. Persistence and service passes must keep lifecycle values string-backed or otherwise internal unless an explicit controlled vocabulary is supplied.

### purchase_order_items

Source-defined fields:

```text
id
purchase_order_id
item_id nullable
description
quantity
unit
unit_rate
tax_rate
line_total
wbs_node_id
cost_code_id
cost_type_id
received_qty
invoiced_amount
```

Required meaning:

- every line belongs to one PO;
- project-costed lines require valid Module-6 WBS, Cost Code and Cost Type posting structure for the PO Project;
- quantity, rates, taxes, line totals, received quantities and invoiced amounts use decimal-safe persistence and lossless API serialization;
- `line_total`, PO subtotal, PO tax and PO total are server-authoritative;
- `received_qty` and `invoiced_amount` are downstream-consumption state and are not normal browser-edit fields;
- revision cannot reduce the ordered commercial position below quantities/values already consumed by receipts or invoices.

`item_id` is nullable while the owning Inventory item master is Module 10, which is generated after Module 9. Stage-14 persistence must **not** create a required foreign key to a future table. The nullable UUID may remain an explicitly deferred future reference until Module 10 creates the item master and a reviewed later migration can activate the real relationship.

### purchase_order_revisions

Source-defined fields:

```text
id
purchase_order_id
revision_no
reason
total_before
total_after
approved_at nullable
created_by
```

Required meaning:

- revisions belong to one existing PO;
- revision numbers must be deterministic and concurrency-safe inside their PO;
- revisions are controlled history and must not destroy prior issuance;
- a revision cannot reduce below already received/invoiced consumption;
- approved revisions update the corresponding Module-7 remaining commitment atomically;
- actor identity is server-derived and `created_by` resolves to the authenticated Company user.

The source does not define a separate revision-line snapshot table or exact before/after line persistence format. Stage 14 must not silently add a fourth PO business table merely to invent a history model. Important line/rate changes are also required to be preserved in Foundation audit records.

## Module-8 Procurement relationship

The normal path is:

```text
approved/selected procurement quotation
  -> draft Purchase Order
  -> Approval Workflows
  -> issue
  -> Module-7 commitment
```

Part I requires every PO `vendor_id` to reference the Module-8 Vendor master.

For a quotation-backed PO, Module 9 must revalidate all of the following server-side before the PO can issue:

```text
quotation exists
quotation belongs to the referenced Vendor
quotation belongs to the same Company/Project procurement chain
quotation is the selected/recommended quotation under the reviewed Module-8 state
commercial values used by the PO are valid for the PO workflow
```

Module 9 must not trust a browser-supplied Vendor/quotation pair merely because both UUIDs exist.

### Selected-quotation proof boundary

The source requires creation from a selected RFQ/quotation but does not define a dedicated `selected_quotation_id` column on RFQ or a separate selection table. The reviewed Module-8 implementation preserves selection through its RFQ/quotation lifecycle state plus audit/outbox evidence.

Stage 14 must use that reviewed Module-8 authority and must not create a second competing quotation-selection master inside Purchase Orders.

## Direct-purchase exception gap

The workflow allows creation from an **approved direct-purchase exception**, and the business rules require an **explicit permission and reason** for bypass.

However, the source does not define:

```text
a dedicated direct-purchase permission token
a direct-purchase request/approval endpoint
a purchase_orders direct_purchase flag
a purchase_orders direct_purchase_reason field
a separate exception table
the exact Approval-Workflow resource/configuration used for the exception
```

Therefore Pass 234 freezes the normal quotation-backed PO path and records the direct-purchase exception as an explicit contract gap. Later schema/service work must not silently invent a public permission token, endpoint or persistence table. If a narrow implementation field is required to satisfy the source business rule, that decision must be recorded explicitly before runtime activation.

## Module-22 Approval boundary

The reviewed workflow is:

```text
draft PO
  -> submit
  -> Module 22 Approval Workflows
  -> owning Module 9 observes approval decision
  -> issue
```

Approval Workflows owns approval definitions, requests, approver actions and decision state. Purchase Orders owns the PO business transition.

Module 9 must not duplicate the approval engine or fabricate generic approve/reject Purchase Order endpoints.

The source does not define a direct approval-request foreign key on `purchase_orders`; generic cross-cutting approval references remain owned by Module 22.

## Module-7 commitment boundary

Module 7 already owns source-derived `cost_commitments`. Its public API intentionally has no browser command for creating commitment rows.

Module 9 is the first reviewed source module that must create/update purchasing commitment state. Therefore:

- PO issue must create/update source-keyed Module-7 commitment rows atomically with the PO issue transition;
- PO revision must atomically adjust the corresponding remaining commitment;
- PO cancellation must atomically cancel/reduce the remaining commitment without deleting historical PO issuance;
- retries must remain idempotent and must not duplicate commitment rows;
- the browser never writes `cost_commitments` directly;
- Module 9 must not create `cost_actuals`; Inventory/other approved source modules own actual-cost generation when their gates exist.

The source does not define the exact internal `source_type` token or source-line key encoding for PO commitments. Those are implementation details that must be frozen consistently before the write adapter is activated; they are not new public API vocabulary.

## Finance boundary

Part I explicitly defers supplier/PO Finance source adapters to **Module 15B**.

Stage 14 therefore must **not** create:

```text
supplier AP invoice
payment
payment allocation
Finance journal for the PO itself
supplier subledger posting
```

PO issue creates a Module-7 purchasing commitment, not a Finance payable or journal. Finance source posting is completed only when Module 15B is generated.

## Inventory / receipt / invoice-consumption boundary

The PO schema exposes `received_qty` and `invoiced_amount`, and the UI later shows receipt/invoice progress. The current Stage-14 route table defines no receipt or invoice-consumption commands.

Therefore:

- Stage 14 initializes and reads these server-owned consumption fields;
- Module 10 later owns goods receipts and ordered-quantity consumption;
- Module 15B later owns supplier invoice/AP integration;
- Stage 14 must not invent receipt, invoice or stock endpoints inside Purchase Orders;
- revision/cancellation checks must remain compatible with future downstream consumption updates.

## Exact reviewed Stage-14 API surface

The source defines exactly eight Purchase Order operations:

```text
GET   /api/v1/purchase-orders
POST  /api/v1/purchase-orders
GET   /api/v1/purchase-orders/:id
PATCH /api/v1/purchase-orders/:id
POST  /api/v1/purchase-orders/:id/submit
POST  /api/v1/purchase-orders/:id/issue
POST  /api/v1/purchase-orders/:id/revise
POST  /api/v1/purchase-orders/:id/cancel
```

Purpose mapping:

```text
GET collection        list/search POs
POST collection       create draft PO
GET :id               read one PO
PATCH :id             edit draft PO
POST :id/submit       submit for approval
POST :id/issue        issue approved PO and create/update commitment
POST :id/revise       create controlled revision
POST :id/cancel       cancel remaining commitment with reason
```

Do not add generic CRUD routes automatically. In particular Pass 234 does not invent:

```text
DELETE /api/v1/purchase-orders/:id
POST   /api/v1/purchase-orders/:id/approve
POST   /api/v1/purchase-orders/:id/reject
POST   /api/v1/purchase-orders/:id/receipt
POST   /api/v1/purchase-orders/:id/invoice
POST   /api/v1/purchase-orders/direct-purchase-exceptions
```

## Request authority

GET routes accept only documented path/query filters, with validated bounded pagination for the register.

Write routes accept only reviewed business inputs through Zod. The following remain server-owned and must not be accepted as normal browser authority:

```text
companyId
actorUserId
permissions
allowedProjectIds
poNo
status
subtotal
tax
total
lineTotal
receivedQty
invoicedAmount
revisionNo
approvedAt
createdBy
commitment IDs / source keys
approval decision state
```

Dates, UUIDs and financial decimals are normalized at the API boundary. Financial decimals are serialized without precision loss.

## Validation contract

The source explicitly requires:

1. PO number generated by a concurrency-safe number sequence.
2. Issued PO total must match line totals/tax and the approved currency.
3. Cost coding is required for project-costed lines.
4. Revision cannot reduce below already received/invoiced value.
5. Vendor, Project, budget/cost coding, quantities, rates, tax and delivery details are validated before controlled issuance.
6. Direct-purchase bypass requires explicit permission and reason.

### Monetary/tax formula gap

The source provides `quantity`, `unit_rate`, `tax_rate`, `line_total`, PO `subtotal`, `tax` and `total`, but it does not define:

```text
whether line_total includes or excludes tax
discount behavior (no PO discount field is listed)
rounding scale/mode per line versus header
whether tax_rate is percentage or another encoded rate basis
currency minor-unit/precision policy
```

The service must calculate totals server-side, but Pass 234 does not fabricate an accounting/tax formula that the source does not state. Persistence can preserve exact decimals while the later service pass records the narrow calculation convention it uses.

### Approved-currency gap

The PO has a required `currency` and issue validation refers to an "approved currency", but the source does not define a currency master, approval-currency field or reliable quotation-currency field in the reviewed Module-8 quotation table.

Stage 14 must not invent an FX/currency master. Currency remains an explicit commercial field whose approval/compatibility rule must be recorded before issue logic is activated.

## Authentication and authorization

All normal Purchase Order routes require an active authenticated session. Company, actor identity and Project scope are resolved from server request context.

Route-level permission checks are revalidated by service/resource policy before sensitive writes.

The source names these six stable permissions:

```text
purchase_orders.read
purchase_orders.create
purchase_orders.edit
purchase_orders.submit
purchase_orders.issue
purchase_orders.revise
```

### Cancellation-permission gap

The route table includes `POST /purchase-orders/:id/cancel`, but the source permission list does **not** name `purchase_orders.cancel` or state that `purchase_orders.revise` covers cancellation.

Pass 234 therefore does not silently create a seventh permission token or silently alias cancellation to revision authority. The cancel command remains part of the reviewed API surface, while its exact permission mapping is an explicit contract gap to resolve before runtime activation.

### Direct-purchase-permission gap

The business rule requires an explicit permission for direct-purchase bypass, but no token is named. Pass 234 does not invent `purchase_orders.direct_purchase` or another token.

## Stable reviewed error codes

The source names exactly these five Module-9 business conflict codes:

```text
PO_NOT_FOUND
PO_NOT_APPROVED
PO_ALREADY_ISSUED
PO_REVISION_BELOW_CONSUMED_VALUE
PO_BUDGET_BLOCK
```

Validation/authentication/authorization continue to use the shared platform error envelope. Do not invent a larger public Module-9 business error vocabulary merely for internal branches unless the controlling contract is amended.

The source does not provide a dedicated error code for cancellation authorization, direct-purchase exception failure, currency mismatch, invalid Vendor/quotation pairing or duplicate issue. Later implementation must map those cases conservatively to shared validation/authorization semantics or a reviewed existing Module-9 conflict without inventing new public codes silently.

## Business rules

The source freezes these rules:

- issued POs are not deleted;
- commitment records update atomically with issue, revision and cancellation;
- direct purchase bypass requires explicit permission and reason;
- revision cannot reduce below already received/invoiced value;
- PO issue is the transition that creates the binding purchasing commitment;
- receipts and invoices consume ordered quantities/values later without rewriting issuance history.

### Revision-history gap

The source requires controlled revision history and auditing of line/rate changes, but the three-table design includes only one revision header table and no revision-line snapshot table. Pass 234 does not add an undocumented fourth table. Exact line-history representation must be explicitly reviewed in the persistence/service passes, with Foundation audit before/after records remaining mandatory.

### Cancellation-reason storage gap

The cancel route requires a reason, but the source does not define a `cancel_reason` column. Pass 234 freezes the business requirement to capture the reason while leaving its durable location explicit for later review rather than silently changing the source table list.

## Events / audit / outbox

The source defines exactly five Purchase Order domain events:

```text
purchase_order.created
purchase_order.submitted
purchase_order.issued
purchase_order.revised
purchase_order.cancelled
```

Events are written through the Foundation outbox only after successful business validation/transactional state change. Core transaction correctness does not depend on a worker.

Audit must include commercial terms, line/rate changes, issue, revision and cancellation with actor user ID, Company/Project scope, entity ID, request ID and important before/after values. Secrets are never logged.

Pass 234 does not emit events or create audit/outbox records because it is contract-only.

## React boundary reserved for later pass

The reviewed frontend location is:

```text
apps/web/src/features/purchase-orders/
  api/
  hooks/
  components/
  pages/
```

Minimum UI:

```text
PO register
Draft editor
Approval timeline
Printable PO preview
Receipt/invoice progress
Commitment status
```

TanStack Query owns server state. React Hook Form + Zod handle write forms. Components hide actions the user lacks permission for while the API remains authoritative.

Receipt/invoice progress is read-only against available server data at Stage 14; this UI requirement does not authorize inventing Module-10 receipt or Module-15B invoice endpoints early.

No React code is generated in Pass 234.

## Stage-14 implementation order

The controlling within-module order is:

```text
Pass 234  Contract freeze
Pass 235  Prisma models, constraints, indexes and migration
Pass 236  Zod boundary schemas
Pass 237  Company/Project-scoped repository
Pass 238  Service/business rules, approval and atomic Module-7 commitment adapter
Pass 239  Fastify routes, module index/registration and OpenAPI
Pass 240  PostgreSQL/Fastify integration and security verification
Pass 241  React Purchase Orders feature
Pass 242  Playwright main workflow
Pass 243  Operational/migration/concurrency verification
Pass 244  Final Stage-14 acceptance gate
```

The source-required generation order is Prisma/migration -> Zod -> repository -> service -> routes/index -> integration/security/OpenAPI -> React -> Playwright.

## Pass 234 implementation boundary

Pass 234 is contract-only.

It may add only:

```text
this reviewed contract document
one Stage-14 contract verification gate
static contract tests
evidence/README/workspace registration
```

It must not add:

```text
Purchase Order Prisma models
migration
purchase-orders.schema.ts
purchase-orders.repository.ts
purchase-orders.service.ts
purchase-orders.routes.ts
Purchase Order React feature
new public permissions
new public business error codes
Inventory receipt logic
Finance/AP logic
```

## Explicit unresolved source ambiguities carried forward

Pass 234 records these source gaps so later code does not hide them:

1. PO lifecycle status tokens are not enumerated.
2. The cancel route exists but no dedicated cancellation permission or explicit permission mapping is supplied.
3. Direct-purchase bypass requires explicit permission and reason, but the permission token, request shape, approval contract and persistence location are not defined.
4. `purchase_orders.quotation_id` is nullable for direct purchase, while the exact authoritative proof/field mapping for a selected Module-8 quotation is not defined by the source schema itself.
5. The exact PO line/header tax and rounding formula is not defined.
6. The source requires an approved currency but defines no currency master or quotation-currency contract that can be compared directly.
7. `purchase_order_items.item_id` points toward the later Module-10 Inventory item master and must not receive a premature required FK.
8. `received_qty` and `invoiced_amount` are required PO-line state, but their writers arrive in later Module-10/Module-15B integrations; Stage 14 must not expose browser mutation for them.
9. The three-table design has no revision-line snapshot table even though controlled line/rate revision history is required.
10. Cancellation requires a reason, but no cancellation-reason persistence field is defined.
11. Module-7 commitment source-type/source-line key tokens and exact source-adapter function shape are not defined, although issue/revision/cancel atomicity and idempotency are mandatory.
12. The source does not define whether revision itself requires a fresh Module-22 approval before commitment adjustment, despite `purchase_order_revisions.approved_at` being nullable.

These are not permission to invent additional features. Each later pass must choose only the narrowest implementation necessary to satisfy an explicit source rule and must keep any inference visible in tests/evidence.

## Next pass

After this contract gate passes, the next reviewed implementation step is:

```text
Pass 235 - Module 9 reviewed Prisma models, constraints, indexes and migration.
```

Persistence preparation may continue while genuine Stage-13 live acceptance is pending, but Stage-14 production runtime activation/deployment remains blocked until the preceding live handoff is genuine.

## Pass 235 reviewed persistence decisions

Pass 235 implements only the reviewed Stage-14 persistence boundary. It does not resolve public API, permission, status, tax-policy or direct-purchase gaps that the controlling source leaves undefined.

The Prisma/migration layer now creates exactly the three frozen Module-9 tables:

```text
purchase_orders
purchase_order_items
purchase_order_revisions
```

Persistence decisions are deliberately narrow:

- `purchase_orders.company_id` and `project_id` enforce the existing Company/Project scope.
- `vendor_id` uses the Module-8 `vendors` master and is Company-scoped.
- nullable `quotation_id` directly references Module-8 `supplier_quotations`; a database trigger verifies that the quotation Vendor and its RFQ Company/Project chain match the PO. The migration does **not** invent a second selected-quotation table or claim to prove Module-8 selection state at the database layer.
- `purchase_order_items` use the existing Module-6 WBS/Cost Code/Cost Type tables, with a trigger requiring one posting-enabled `project_cost_codes` combination for the PO Project.
- nullable `item_id` remains a UUID scalar with no Module-10 Inventory foreign key.
- `received_qty` and `invoiced_amount` initialize to zero and remain server-owned downstream consumption state.
- `purchase_order_revisions` enforce a positive unique revision number within one PO, and a trigger verifies that `created_by` belongs to the PO Company.
- no fourth revision-line history table is created; important before/after line and rate details remain required Foundation audit data in the later service pass.
- no `cancel_reason`, direct-purchase flag/reason, approval-request ID, commitment ID/source-key field, Finance field or Inventory receipt field is added because the source does not define those columns.
- no tax/rounding formula is encoded as a database invariant; persistence preserves exact decimals while the later service pass must record its narrow server calculation convention.
- no Module-7 commitment row is created by the migration itself; issue/revision/cancellation orchestration belongs to the later service transaction.

The migration adds only relational integrity, nonnegative/positive commercial guards, scoped uniqueness/indexes and the three source-faithful scope triggers above. Stage-14 deployment remains blocked until the genuine Stage-13 live handoff exists.

## Pass 236 reviewed schema decisions

Pass 236 adds only the Zod request/response boundary for the eight frozen Purchase Order operations. It does not generate a repository, service, Fastify routes, React feature or another migration.

The normal create path is quotation-backed: `projectId`, `vendorId`, non-null `quotationId`, order/commercial fields and one or more cost-coded items. The unresolved direct-purchase bypass remains blocked at the browser boundary until its permission and request/persistence contract are defined by a controlling source. No `direct_purchase` flag, bypass endpoint or new permission is invented.

Draft PATCH is strict and partial. Submit and issue remain bodyless commands because approval decision, status, totals and Module-7 commitment identity are server-owned. Controlled revision requires a reason plus at least one commercial change and does not switch Project, Vendor or quotation identity. Cancellation accepts the source-required reason as command input for later audit/outbox handling, but no cancellation permission token or persistence column is invented.

Commercial quantities/rates/tax/totals remain decimal strings at the API boundary so later repository/service code can preserve PostgreSQL precision. The schema does not invent a PO lifecycle enum, tax formula, tax percentage ceiling, FX engine or currency master. Receipt quantity and invoiced amount are read-only response fields for downstream progress; they are not browser-writable at Stage 14.

The next reviewed implementation step is:

```text
Pass 237 - Module 9 Company/Project-scoped repository for Purchase Orders, items and controlled revisions, including Module-8 quotation/vendor reads and Module-7 commitment adapter primitives
```

Runtime deployment remains blocked until genuine Stage-13 live acceptance exists.


## Pass 237 reviewed repository decisions

Pass 237 adds Company/Project-scoped PO reads/writes, deterministic Project/PO row locks, read-only Module-8 Vendor/quotation resolution, posting-enabled Module-6 cost-structure reads, controlled revision primitives and internal Module-7 commitment read/upsert primitives. The repository does not choose lifecycle policy, tax formula, quotation-selection policy, commitment source/status tokens, cancel permission or direct-purchase behavior.

## Pass 238 explicit service decisions

Pass 238 resolves only the implementation details that must exist for the source-required Stage-14 business transaction. These are internal conventions, not new public API vocabulary:

- normal creation remains quotation-backed because the direct-purchase permission/approval/persistence contract is still undefined;
- selected-quotation authority is proven by the existing Module-8 quotation `SELECTED` state, its RFQ `SELECTED` state and the same Vendor/Company/Project relationship; no second selection table is added;
- draft PO total must equal the selected quotation total; the source provides no quotation currency field, so no fabricated quotation-currency comparison is added;
- `tax_rate` is interpreted as a percentage, each line uses exact integer arithmetic with half-up money rounding, and `line_total` includes line tax; this is an explicit implementation inference because the source does not state the formula;
- a current Module-7 `FROZEN` budget is the only budget readiness gate; no amount threshold, tolerance or over-budget percentage is invented;
- PO approval uses Module 22 and requires a configured approval definition; missing configuration fails closed rather than bypassing approval;
- Module-7 PO commitments use internal `source_type = purchase_order`, `source_id = purchase_orders.id`, `source_line_id = purchase_order_items.id`, and internal `ACTIVE` / `CANCELLED` status tokens;
- the commitment amount uses the server-calculated PO `line_total`, including tax, because that is the source-defined line commitment value available at this gate;
- cancellation uses `purchase_orders.revise`, the closest source-defined authorized-change permission, because no dedicated cancel permission is supplied; no new public permission token is created;
- cancellation reason is preserved in audit/outbox only because the source defines no cancellation-reason column;
- the source defines no separate revision approval command. An authorized `purchase_orders.revise` command is therefore treated as the controlled authorization and records the revision `approved_at` time; no new Approval-Workflow route is invented;
- Stage 14 blocks item-list replacement after non-zero receipt/invoice consumption because its revision input has no stable line identifier for safely remapping consumed downstream state. Header-only revision preserves line IDs. Module 10/15B integration may later extend this through a reviewed contract;
- issued currency changes fail closed until an approved currency/FX contract exists; no FX engine is invented.

All five reviewed PO domain events are written through the Foundation outbox in the same transaction as their owning state change. Commercial before/after values, including line/rate detail, are retained in Foundation audit records. Finance/AP, Inventory receipt and cost-actual writes remain outside Module 9.

The next reviewed implementation step is:

```text
Pass 239 - Module 9 Fastify routes, module registration and OpenAPI for exactly the eight reviewed Purchase Order operations
```

## Pass 239 reviewed HTTP/OpenAPI decisions

Pass 239 adds only the Fastify HTTP/OpenAPI/module-registration layer for the eight frozen Purchase Order operations. Every route authenticates first, reparses request params/query/body through the Pass-236 Zod boundary, and validates successful service output through the same reviewed response schemas before serialization. Project/resource authorization remains service-authoritative through Module 24B.

OpenAPI publishes exactly the reviewed list/create/get/edit/submit/issue/revise/cancel operations. It does not add generic delete, direct-purchase, approval-result, receipt, invoice, Finance/AP or commitment-management routes. The cancel command remains mapped inside the service to the existing `purchase_orders.revise` authority because the controlling source still supplies no dedicated cancel permission token.

The only new `buildApp` policy option is the server-owned `purchaseOrderApprovalDefinitionCode` required by the Pass-238 Module-22 approval orchestration. Company ID, actor identity, Project authority, PO number, lifecycle state, calculated totals, receipt/invoice progress, revision numbering and commitment identity remain absent from request bodies. Commercial decimals are documented as strings so Swagger/OpenAPI does not introduce floating-point precision loss.

Pass 239 adds no Prisma model, migration, React code, Finance/AP behavior, Inventory receipt behavior or new public permission/error vocabulary.

The next reviewed implementation step is:

```text
Pass 240 - Module 9 PostgreSQL/Fastify integration, generated OpenAPI and security verification
```

Runtime deployment remains blocked until genuine Stage-13 live acceptance exists.

## Pass 240 — PostgreSQL / Fastify integration, generated OpenAPI and security verification

Pass 240 adds verification only. It does not alter the three Stage-14 persistence resources, eight reviewed HTTP operations, six reviewed permission tokens, five reviewed error codes or five reviewed Purchase Order events.

The prepared live suite exercises the real reviewed chain:

```text
PO register
→ quotation-backed draft creation
→ draft edit
→ Module-22 approval submission
→ approval action
→ approved issue
→ atomic Module-7 commitment creation
→ controlled revision and commitment synchronization
→ cancellation and remaining-commitment reduction
```

Security coverage includes unauthenticated access, missing Project permission, restricted/cross-Company scope, closed-Project writes, browser attempts to set Company/actor/number/status/totals, missing frozen Module-7 budget, invalid or unselected Module-8 Vendor/quotation authority and unresolved direct-purchase bypass input.

The live suite attacks all three Stage-14 database integrity boundaries directly and expects PostgreSQL to reject a PO whose quotation Vendor/Company/Project chain does not match, a PO line whose cost coding is not one posting-enabled Module-6 mapping for the PO Project, and a revision whose creator belongs to another Company.

Generated OpenAPI must expose exactly the eight reviewed Module-9 operations with bearer security and strict request authority. It must not expose direct-purchase, generic approval/delete, receipt, supplier invoice, Finance posting or commitment-management endpoints.

The integration proof also preserves ownership boundaries: issue creates Module-7 purchasing commitments, but Stage 14 creates no Finance journal and no Inventory receipt. Revision/cancellation remain atomic with the current source-keyed commitment rows.

Run static preparation with:

```bash
npm run module-9:integration-security:gate
```

Run the destructive live verification only against the dedicated test database:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run module-9:integration-security:gate:live
```

A live run first requires genuine `STAGE_13_ACCEPTED_READY_FOR_STAGE_14` evidence. Until that exists, the truthful static result is `STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING` and no runtime deployment claim is made.

Next reviewed pass: **Pass 241 - Module 9 React Purchase Orders API, hooks, register/editor, approval timeline, printable preview, receipt/invoice progress and commitment status UI preparation**.

## Pass 241 — React Purchase Orders UI decisions

Pass 241 adds only the source-required React Purchase Orders feature under `apps/web/src/features/purchase-orders/` with `api/`, `hooks/`, `components/` and `pages/`. The browser calls exactly the eight reviewed Module-9 operations; no Vendor CRUD/list, quotation lookup, direct-purchase, approval-result, receipt, supplier-invoice, Finance-posting or commitment-mutation endpoint is invented.

TanStack Query owns Purchase Order server state. React Hook Form + Zod own the draft, controlled-revision and cancellation forms. Commercial quantities, rates and tax rates remain decimal strings at the browser/API boundary, and Company, actor, PO number, lifecycle status, calculated totals, received quantity, invoiced amount, revision number and commitment identity remain server-owned.

The minimum reviewed UI is now represented as:

- Purchase Order register and quotation-backed draft editor;
- Approval timeline, reusing the existing Module-22 inbox/detail APIs visible to the signed-in user rather than creating a new PO-specific approval lookup route;
- printable PO preview through the browser print surface, without inventing a document-generation endpoint;
- receipt/invoice progress read directly from the server-owned PO item fields; no Module-10 or Module-15B write control is added;
- commitment status read from the existing Module-7 job-cost ledger by the source key `purchase_order` + PO ID; no Module-9 commitment endpoint is added;
- controlled header revision and cancellation commands through the reviewed Module-9 endpoints.

Module-6 WBS/Cost Code/Cost Type assignments are reused for line cost coding. The reviewed Module-8 HTTP contract still provides no Vendor or quotation lookup CRUD route, so the editor accepts the selected Vendor and quotation UUIDs from the Procurement workflow instead of fabricating discovery APIs. Direct-purchase creation remains fail-closed because its dedicated permission/approval/persistence contract is still undefined. Cancellation visibility continues to use the already-reviewed `purchase_orders.revise` authority; no `purchase_orders.cancel` permission is invented.

The UI does not create Finance journals, supplier AP records, goods receipts, stock movements or job-cost commitment writes. Those ownership boundaries remain server/downstream responsibilities defined by the controlling contract.

Run the static React preparation gate with:

```bash
npm run module-9:react:gate
```

Until genuine Stage-13 live acceptance exists, the truthful result remains `STAGE_14_MODULE_9_REACT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING`.

The next reviewed implementation step is:

```text
Pass 242 - Module 9 Playwright Purchase Order workflow verification
```

## Pass 242 — Playwright Purchase Order workflow verification

Pass 242 adds the browser verification boundary for the complete reviewed Purchase Order lifecycle without adding another public Purchase Order route. The prepared Playwright workflow signs in through Module 24A, creates a quotation-backed draft, submits it, approves through the existing Module-22 inbox, synchronizes approval state through the replay-safe existing submit command, issues the PO, reads the resulting Module-7 commitment, creates a controlled revision and cancels the remaining commitment. Read-only browser denial coverage verifies that hidden actions do not replace backend authority.

Production startup now carries the existing server-owned Purchase Order approval-definition code into the Module-9 service composition. The React workspace exposes only a narrow `Refresh approval status` action while a PO is pending approval; this reuses the existing submit command and does not create a ninth PO API operation.

No migration, Inventory receipt, Finance/AP write, direct-purchase path, new permission or new Purchase Order route is introduced by Pass 242. Genuine browser execution remains blocked until Stage-13 live acceptance is real.

The next reviewed implementation step is:

```text
Pass 243 - Module 9 operational, migration and concurrency verification
```

## Pass 243 — operational, migration and concurrency verification

Pass 243 adds verification only. It does not alter Purchase Order production runtime behavior, the three Stage-14 tables, the eight reviewed PO operations, the six named permission tokens or the five PO event names.

The prepared live operational suite verifies:

- concurrent quotation-backed draft creation produces unique monotonic `PO-` numbers through the existing Project lock plus Foundation number sequence;
- concurrent duplicate issue attempts serialize and produce only one issue audit/outbox transition and one source-keyed Module-7 commitment set;
- concurrent controlled header revisions serialize on the PO lock and receive monotonic revision numbers without changing line identities;
- concurrent duplicate cancellation preserves the historical issued PO and reduces current PO commitments to zero without duplicate cancellation evidence;
- forced late outbox failures for issue, revision and cancellation roll back all earlier writes in those transactions, including PO status/header changes, revision rows, Module-7 commitment mutations and audit rows;
- reviewed Purchase Order and Module-7 source-key indexes are exercised with `EXPLAIN (FORMAT JSON)` and no unstable duration threshold;
- clean database migration deployment and upgrade from the immediately previous supported schema are rerun before genuine live concurrency verification.

The live gate is fail-honest. It requires genuine Stage-13 acceptance plus successful Pass-240 integration/security and Pass-242 Playwright live evidence before it may reset/migrate PostgreSQL and run the operational tests. Static preparation may therefore report `STAGE_14_MODULE_9_OPERATIONS_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING` without making a deployment claim.

Run the dependency-independent preparation with:

```bash
npm run module-9:operations:gate
```

Run the guarded live verification only after all required live handoffs exist:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run module-9:operations:gate:live
```

Pass 243 adds no production runtime code, database migration, public API, Finance write or Inventory write.

The next reviewed implementation step is:

```text
Pass 244 - Module 9 final Stage-14 acceptance gate
```

---

# Pass 364 amendment — Direct-Purchase Exception Contract

Pass 364 supersedes only the earlier fail-closed direct-purchase gap statements. The original eight public Module-9 routes, five stable errors and five domain events remain unchanged.

The smallest approved exception contract is:

- The existing `POST /api/v1/purchase-orders` remains the only creation route.
- A normal Purchase Order supplies a non-null `quotationId` and no direct-purchase reason.
- A direct-purchase exception supplies `quotationId: null` plus a non-blank `directPurchaseReason`.
- Direct purchase requires the additional explicit Project-scoped permission `purchase_orders.direct_purchase` in addition to the normal command permission.
- The permission is registered but is not automatically granted to any role.
- The Purchase Order stores `direct_purchase_reason`; PostgreSQL enforces exactly one purchase-source path: quotation or direct-purchase reason.
- Existing quotation-less historical rows are migrated with an explicit legacy marker stating that the original reason was not captured; the migration does not invent a historical business reason.
- Direct purchase still requires an active qualified Module-8 Vendor, valid active Module-6 Project cost structure, a frozen Module-7 budget and the normal Module-22 approval before issue.
- The approval payload snapshot includes `directPurchaseReason` and `purchaseSource`, so approval evidence is tied to the exact exception being approved.
- Create/update/submit/issue audit evidence includes the persisted source/reason. No `purchase_order.direct_purchase` event is added; the existing Purchase Order lifecycle events remain authoritative.
- A DRAFT cannot switch between quotation-backed and direct-purchase source identity after creation. This avoids silently changing procurement provenance.
- No Finance/AP adapter, Inventory write, Stage-27 integration, direct-purchase route, generic exception table or parallel approval system is introduced.

Pass 365 remains responsible for line-level revision reconstruction and cancellation reason readback; those concerns are not expanded here.


# Pass 365 amendment — Exact Revision History and Cancellation Evidence

Pass 365 supersedes only the earlier revision-line and cancellation-persistence gap statements. The original eight public Module-9 routes, seven current permissions (including the Pass-364 direct-purchase permission), five stable errors and five domain events remain unchanged.

The reviewed repair contract is:

- `purchase_order_revisions` remains the controlled revision header.
- One support table, `purchase_order_revision_items`, stores immutable `BEFORE` and `AFTER` snapshots for every revision line. It is historical evidence, not a fourth generic Purchase Order CRUD resource.
- Each snapshot preserves line order, prior/current line identity, Inventory item reference value when present, description, quantity, unit, rate, tax, line total, WBS, Cost Code, Cost Type, received quantity and invoiced amount.
- Existing revision rows are backfilled from the Foundation `purchase_order.revised` audit before/after payloads when those payloads exist. Missing historical evidence is not invented.
- Revision header and snapshot rows are immutable after creation.
- `purchase_orders` persists `cancel_reason`, `cancelled_at` and `cancelled_by`.
- Existing cancelled rows recover reason/actor/time from the latest Foundation cancellation audit when available. A truthful legacy reason marker is used only when no historical reason can be recovered; actor/time remain unknown rather than fabricated.
- A new cancellation transition must persist nonblank reason, actor and timestamp atomically with `status = CANCELLED`.
- The cancellation actor must belong to the same Company, and cancellation evidence cannot be changed after cancellation.
- The existing `purchase_orders.revise` permission remains the cancellation authority because the source still defines no dedicated `purchase_orders.cancel` permission.
- The existing `GET /api/v1/purchase-orders/:id` response exposes revision snapshots and cancellation evidence; no ninth route is added.
- Module-7 commitment cancellation remains in the same transaction. Stage-26 Finance and Stage-27 integration work remain deferred.

Pass 365 does not change tax/rounding policy or permit issued-PO currency repricing. Those remain under M9-04 `POLICY_REQUIRED`.
