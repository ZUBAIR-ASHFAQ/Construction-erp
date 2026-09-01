# Stage 15 — Module 10 Inventory & Material Management Contract

## Purpose

Stage 15 freezes the executable boundary for **Module 10 — Inventory & Material Management** before Prisma models, migrations, backend runtime code or React code are generated.

Module 10 connects issued Purchase Orders to physical material stock and project job cost. It owns item/warehouse stock records, PO-backed receipts, stock movements and on-hand balances. Receipt, transfer, issue, return and adjustment workflows must preserve an append-only stock ledger, transactional balances, Company/Project scope and idempotent source integration.

The controlling dependency-aware order is:

```text
Stage 12  Module 7 - Budgeting & Job Costing
Stage 13  Module 8 - Procurement & RFQ
Stage 14  Module 9 - Purchase Orders
Stage 15  Module 10 - Inventory & Materials
Stage 16  Module 11 - Subcontractor Management
...
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
```

Part I is authoritative for generation order, dependency gates, ownership and deferred integrations. Appendix A remains authoritative for the Inventory workflow, route table, validation, permissions, events, UI and acceptance requirements unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-15 runtime handoff is genuine Stage-14 live acceptance:

```text
STAGE_14_ACCEPTED_READY_FOR_STAGE_15
```

The Module-10 contract may be reviewed and frozen while that live handoff is still pending. That does not authorize Stage-15 production runtime activation or deployment.

The corrected hard prerequisites are exactly:

```text
Module 9  Purchase Orders
Module 5  Project Management
Module 6  WBS & Cost Codes
Module 7  Budgeting & Job Costing
```

Project-scope authorization is already active through Module 24B and must be reused rather than duplicated.

## Ownership boundary

Module 10 owns exactly these six reviewed persistence resources:

```text
inventory_items
warehouses
inventory_balances
goods_receipts
goods_receipt_items
stock_transactions
```

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency / numbering       Foundation
users / roles / permissions                                Module 24A
projects / Project scope                                    Modules 5 / 24B
wbs_nodes / cost_codes / cost_types / project_cost_codes   Module 6
cost_actuals / budget and job-cost controls                 Module 7
vendors / procurement quotation authority                  Module 8
purchase_orders / purchase_order_items                      Module 9
```

Later ownership remains:

```text
supplier AP / Inventory Finance source adapters             Module 15B
Daily Site Report material references                       Module 20
reports / analytics                                         Module 23
dashboard                                                   Module 1
```

Module 10 must not duplicate Project, WBS/Cost Code, Vendor, Purchase Order, job-cost, Finance, reporting or dashboard masters.

## Reviewed persistence

### inventory_items

Source-defined fields:

```text
id
company_id
item_code
name
category
base_unit
status
valuation_method
```

Required meaning:

- every item belongs to one Company;
- `item_code` is Company-owned master data; the source does not separately define its uniqueness rule, so Pass 246 must not claim one as source text without an explicit persistence decision;
- base unit and valuation method are master-data properties used by stock transactions;
- the browser never supplies Company ownership;
- the source does not enumerate item status or valuation-method token vocabularies.

The route table provides item list/create only. It does not define item update/archive/delete routes, so Stage 15 must not invent generic item CRUD.

### warehouses

Source-defined fields:

```text
id
company_id
project_id nullable
code
name
location
status
```

Required meaning:

- a warehouse/site store belongs to one Company;
- `project_id` may be null for a Company-level warehouse or reference a Project for a project/site store;
- warehouse access must enforce Company ownership and, when project-scoped, the authenticated allowed-Project scope;
- transfer/receipt/issue commands must revalidate every referenced warehouse instead of trusting browser-provided ownership.

The business workflow says users maintain warehouse/site-store locations, but the reviewed eight-route API table defines **no warehouse create/update/list management endpoint**. Stage 15 records this source gap rather than inventing warehouse CRUD during contract freeze.

### inventory_balances

Source-defined fields:

```text
id
warehouse_id
item_id
quantity_on_hand
reserved_quantity
average_cost
```

Required meaning:

- one balance represents one reviewed warehouse/item stock position;
- quantities and costs use decimal-safe persistence and lossless API serialization;
- balance is derived/maintained transactionally from the stock ledger and is never a normal browser-authored total;
- issue/transfer cannot create negative stock unless an explicit policy enables it;
- because no negative-stock policy/configuration source is defined, Stage 15 must fail closed rather than silently permit negative stock.

The source names `average_cost` but also exposes item `valuation_method`; it does not define the exact valuation algorithm, supported valuation-method enum, rounding scale or whether non-average methods maintain a different cost basis. That remains an explicit contract gap.

### goods_receipts

Source-defined fields:

```text
id
company_id
project_id
warehouse_id
receipt_no
purchase_order_id
received_at
status
received_by
```

Required meaning:

- every goods receipt belongs to one Company and one Project;
- every receipt references an issued Module-9 Purchase Order belonging to the same Company/Project;
- the warehouse must belong to the same Company and be authorized for the transaction scope;
- `receipt_no` is server-owned; if Pass 246/249 uses Foundation numbering, the exact sequence scope must be recorded as an implementation convention because the Inventory appendix does not state the numbering scope;
- actor identity and `received_by` are server-derived;
- receipt state is server-owned and the source does not enumerate receipt lifecycle tokens.

Receipt must update the stock balance and the referenced Purchase Order received quantity **atomically**. If any receipt line, stock ledger write, balance update, PO consumption update, audit write or required outbox write fails, the receipt transaction must roll back.

### goods_receipt_items

Source-defined fields:

```text
id
goods_receipt_id
po_item_id
item_id
quantity
unit_cost
accepted_qty
rejected_qty
```

Required meaning:

- every line belongs to one goods receipt;
- `po_item_id` resolves to the Module-9 `purchase_order_items` row on the same Purchase Order;
- `item_id` resolves to the Module-10 `inventory_items` master;
- quantity/cost values are decimal-safe and server-normalized;
- receipt cannot exceed the PO ordered/open quantity unless an authorized tolerance exists;
- no tolerance configuration, permission token or request contract is defined, so the Stage-15 default is fail-closed: do not over-receive without a later explicit approved tolerance contract.

The source contains `quantity`, `accepted_qty` and `rejected_qty` but does not explicitly define whether `quantity = accepted_qty + rejected_qty`, how rejected material affects stock, or whether rejected quantities create a separate disposition movement. That relationship must be made explicit before runtime activation rather than guessed silently.

### stock_transactions

Source-defined fields:

```text
id
company_id
item_id
warehouse_id
project_id nullable
transaction_type
quantity
unit_cost
source_type
source_id
cost_structure_id nullable
occurred_at
```

Required meaning:

- the stock ledger is append-only;
- corrections use reversing transactions rather than destructive edit/delete;
- Company, Project scope, actor context and calculated cost are server-authoritative;
- transaction quantities/costs are decimal-safe;
- project issue requires a valid active Module-6 posting combination and creates Module-7 project actual cost only once using idempotent source linkage;
- balance mutation and ledger append happen in one transaction.

The source does not enumerate `transaction_type`/`source_type` tokens or define a separate transfer/return/adjustment document table. Stage 15 must not add extra business tables merely to invent those document models during the contract freeze.

## Deferred Module-9 item relationship completion

Module 9 deliberately kept `purchase_order_items.item_id` as a nullable UUID without an Inventory foreign key because Module 10 did not yet exist.

Stage 15 now owns `inventory_items`, so Pass 246 must review and activate the nullable relationship:

```text
purchase_order_items.item_id -> inventory_items.id
```

The relationship remains nullable. Existing description-only PO lines must stay valid. The migration must run both on a clean database and from the immediately previous supported schema, and it must not create a required relationship that invalidates historical Module-9 rows.

The same later-target rule applies to Module-8 `purchase_requisition_items.item_id`, which was also deliberately deferred. The current Stage-13/14 API boundaries permit a non-null optional item UUID even though no authoritative Inventory item target existed yet. That creates a real previous-schema upgrade risk: Pass 246 must inspect existing non-null values before adding either deferred FK. It must not silently null, rewrite or fabricate Inventory items merely to make the constraint pass. If unresolved historical values exist, the migration must fail with an explicit repair/preflight requirement until a reviewed data-mapping decision exists.

## Module-9 Purchase Order receipt boundary

The reviewed receipt path is:

```text
issued Purchase Order
  -> POST /api/v1/inventory/receipts
  -> goods receipt + receipt lines
  -> append stock transaction(s)
  -> update inventory balance
  -> update purchase_order_items.received_qty
  -> audit + outbox
```

Required safeguards:

- PO must exist, belong to the authenticated Company/Project scope and be in a receipt-eligible issued state;
- each receipt line must reference a line on that PO;
- receipt quantity cannot exceed open ordered quantity unless an explicit authorized tolerance exists;
- duplicate/retried receipt commands must not duplicate physical stock or PO received quantity;
- PO received quantity is server-owned and is written only by the Inventory integration, not the browser;
- receipt does not create supplier AP, payment or Finance journal state in Stage 15.

## Module-7 job-cost actual boundary

The reviewed material issue path is:

```text
stock on hand
  -> POST /api/v1/inventory/issues
  -> validate Project + posting combination
  -> append ISSUE stock transaction
  -> decrease stock balance
  -> create one idempotent Module-7 cost_actual source
  -> audit + outbox
```

Module 7 owns `cost_actuals`. Inventory owns the material movement that becomes the source.

Therefore:

- issue to Project/WBS/Cost Code must use a valid Module-6 posting combination;
- the actual-cost amount is source-derived from the approved Inventory valuation policy and cannot be browser-authored;
- stock mutation and Module-7 actual-cost creation must be atomic/idempotent;
- one stock issue source may post to job cost at most once;
- retries must not duplicate `cost_actuals`;
- Inventory must not directly overwrite actual-cost history.

The source does not define the exact Module-7 `source_type`, source-line encoding or valuation-to-actual formula. Those internal tokens/formulas must be frozen consistently before the write adapter is activated and must not become undocumented public API fields.

## Transfer boundary

Transfers move stock between authorized warehouses/projects and must not create or destroy quantity.

At minimum the later service must enforce:

```text
source warehouse/item has sufficient stock
source and destination warehouses belong to the authenticated Company
project-scoped warehouses are inside allowed Project scope
the transfer is atomic
source decrease and destination increase reconcile to the same quantity/cost basis
no duplicate retry creates a second movement
```

The source defines no `inventory_transfers` header/table and no exact pairing/source-identity rule for the two ledger sides. Pass 245 records that ambiguity instead of inventing a seventh Inventory table.

## Return boundary

The route table defines:

```text
POST /api/v1/inventory/returns
```

but Appendix A does not specify whether a return means Project/site issue return-to-stock, return-to-vendor, warehouse return, or more than one of those scenarios. It also defines no dedicated `inventory.return` permission.

Pass 245 therefore freezes the route existence but does not invent return direction, party semantics or a new permission token. The schema/service passes must keep this gap explicit and fail closed on unsupported interpretations.

## Adjustment / stock-count boundary

The route table defines one controlled adjustment command:

```text
POST /api/v1/inventory/adjustments
```

The business workflow says stock counts are reconciled through controlled Inventory adjustments. The React requirements also name inventory-count adjustments.

The source does **not** define a stock-count session/header/table, count approval route, reason-code master or variance-tolerance table. Stage 15 must use the reviewed adjustment command and must not silently introduce a separate stock-count business module.

Adjustments must be auditable, append-only in the ledger and reasoned. Where approval is required by policy, the source gives no Inventory-specific approval endpoint or hard Module-22 prerequisite for Module 10; no new approval API may be invented in this pass.

## Units and conversion boundary

The source requires compatible units or conversion using approved conversion rules, but it defines no unit-of-measure master, conversion table, conversion API or exact rounding rule.

Therefore:

- same-unit movements are fully source-supported;
- incompatible units must fail with `INVALID_UNIT_CONVERSION` unless a later explicitly reviewed conversion contract exists;
- Stage 15 must not invent a UOM master or arbitrary browser-provided conversion factor.

## Stock-period boundary

`STOCK_PERIOD_LOCKED` is a reviewed Inventory error, but Module 10 owns no stock-period table and the source does not define whether the lock is driven by Finance fiscal periods, an Inventory period, or another policy.

Stage 15 records this as a gap. The implementation must not silently equate Inventory periods with Module-15 Finance periods unless an explicit integration contract is established.

## Finance boundary

Inventory is a downstream source for Finance, but Part I defers source-specific Finance adapters to **Module 15B**.

Stage 15 therefore must not create:

```text
supplier AP invoice
supplier payment
Finance journal
inventory accounting adapter
Inventory-to-GL reconciliation posting
```

Module-7 material actual-cost posting is part of Stage 15 because the Inventory requirements explicitly say project issues create actual cost. Formal Finance source posting remains deferred.

## Exact reviewed Stage-15 API surface

The source defines exactly eight Inventory operations:

```text
GET  /api/v1/inventory/items
POST /api/v1/inventory/items
GET  /api/v1/inventory/balances
POST /api/v1/inventory/receipts
POST /api/v1/inventory/transfers
POST /api/v1/inventory/issues
POST /api/v1/inventory/returns
POST /api/v1/inventory/adjustments
```

Purpose mapping:

```text
GET items          list Inventory items
POST items         create Inventory item
GET balances       query authorized stock balances
POST receipts      receive material against an issued PO
POST transfers     transfer stock between authorized warehouses/projects
POST issues        issue material to Project/cost structure
POST returns       record reviewed return command; exact direction remains source-ambiguous
POST adjustments   controlled stock adjustment / stock-count reconciliation
```

Do not add generic CRUD routes automatically. In particular Pass 245 does not invent:

```text
GET/POST/PATCH/DELETE /api/v1/inventory/warehouses
PATCH /api/v1/inventory/items/:id
DELETE /api/v1/inventory/items/:id
GET /api/v1/inventory/transactions
POST /api/v1/inventory/counts
POST /api/v1/inventory/adjustments/:id/approve
POST /api/v1/inventory/returns/:id/approve
```

A later React stock-ledger/low-stock view must use a source-supported read contract. Appendix A requires those UI views but the eight-route API table names only item and balance reads; no dedicated stock-ledger or low-stock route is defined. That mismatch remains explicit instead of being hidden by invented endpoints.

## Request authority

GET routes accept only documented path/query filters with bounded pagination where applicable.

Write routes accept only Zod-validated business fields. The following are server-owned and must never be accepted as normal browser authority:

```text
companyId
actorUserId
permissions
allowedProjectIds
receiptNo
receivedBy
status
quantityOnHand
reservedQuantity
averageCost
calculatedUnitCost
calculatedActualCost
purchaseOrderReceivedQty
ledger source identity
created/updated audit identity
```

The browser may request a business movement, but repository/service logic owns scope, stock availability, valuation, balance mutation, PO consumption, actual-cost source linkage, audit and outbox behavior.

## Validation contract

The source explicitly requires:

- receipt cannot exceed ordered/open PO quantity unless an authorized tolerance exists;
- issue/transfer cannot create negative stock unless explicitly enabled by policy;
- units must be compatible or converted using approved conversion rules;
- stock transaction quantities/costs use DECIMAL/NUMERIC semantics;
- Project/cost coding must use valid active Project/WBS/Cost Code/Cost Type structures for project actual cost;
- all UUID/date/decimal/enums are normalized at the API boundary;
- Company and actor ownership are derived from authenticated context.

Because tolerance, negative-stock policy and conversion contracts are not defined, the default implementation posture is fail-closed.

## Authentication and authorization

All normal Inventory routes require an active authenticated session.

Server-side request context supplies:

```text
user identity
company ownership
stable permissions
allowed Project scope
```

The reviewed permission vocabulary is exactly:

```text
inventory.read
inventory.item.manage
inventory.receive
inventory.transfer
inventory.issue
inventory.adjust
```

There is no source-defined `inventory.return`, `inventory.warehouse.manage`, `inventory.count` or `inventory.valuation.manage` permission. Pass 245 records those gaps rather than adding permission codes.

Route-level permission checks must be revalidated through resource/Project policy before sensitive writes.

## Stable business conflicts

The reviewed Inventory conflicts are exactly:

```text
ITEM_NOT_FOUND
WAREHOUSE_NOT_FOUND
INSUFFICIENT_STOCK
RECEIPT_EXCEEDS_PO
INVALID_UNIT_CONVERSION
STOCK_PERIOD_LOCKED
```

Normal validation/authentication errors continue to use the Foundation API error contract. Do not expose SQL errors, stack traces or unauthorized records.

## Business rules

The Stage-15 invariant set is:

- stock ledger is append-only;
- corrections use reversing transactions;
- Inventory balance is transactionally derived/maintained from stock ledger;
- site issues create Project actual cost only once with idempotent source linkage;
- receipt updates stock and PO received quantity atomically;
- no normal issue/transfer produces negative stock without an explicitly approved policy;
- no browser directly writes stock balances, PO received quantities or Module-7 actual-cost rows;
- downstream Finance posting remains deferred to Module 15B.

## Events, audit and background work

The source defines exactly five Inventory domain events:

```text
inventory.received
inventory.transferred
inventory.issued
inventory.returned
inventory.adjusted
```

Durable domain events are recorded through the Foundation outbox only after successful business validation and inside the transaction boundary required for correctness. Core stock correctness cannot depend on a worker.

Audit must cover receipt overrides, stock adjustments, negative-stock exceptions and valuation-sensitive changes, with actor, Company/Project scope, entity, request ID and important before/after values. Passwords, tokens and secret material are never logged.

Optional low-stock, overdue-receipt and exceptional-adjustment notifications remain asynchronous. The source does not define a separate notification module.

## React boundary for the later Stage-15 UI pass

The source requires:

```text
apps/web/src/features/inventory/
  api/
  hooks/
  components/
  pages/
```

Minimum UI:

```text
Item master
Warehouse balances
Receipt screen
Transfer/issue forms
Stock ledger
Low-stock view
Inventory count adjustments
```

TanStack Query owns server state. React Hook Form + Zod own forms. UI actions are permission-aware while the API remains authoritative.

Two UI/API mismatches remain explicit at Pass 245:

1. stock-ledger and low-stock views are required, but no dedicated stock-transaction/low-stock read endpoint is listed;
2. warehouse/site-store maintenance is part of the workflow, but no warehouse-management route is listed.

Do not solve either mismatch by silently adding public APIs during the contract freeze.

## Explicit unresolved source ambiguities

Pass 245 records these source gaps for later passes:

1. Warehouse/site-store maintenance is required by workflow, but no warehouse CRUD/read management route or permission is defined.
2. Item master has list/create routes only; no update/archive lifecycle route is defined.
3. Stock-ledger and low-stock React views are required, but no dedicated ledger/low-stock read endpoint is defined.
4. Low-stock thresholds/reorder levels are not represented in the six source tables.
5. `valuation_method` exists, but allowed valuation methods, cost-layer behavior and exact rounding are not defined; only `average_cost` is explicitly stored on balances.
6. Unit compatibility/conversion is required, but no UOM/conversion master, factor source or rounding rule is defined.
7. Receipt tolerance is mentioned but no tolerance configuration, dedicated permission or request field is defined.
8. `quantity`, `accepted_qty` and `rejected_qty` receipt-line reconciliation/disposition rules are not explicitly defined.
9. Negative stock may be enabled by policy, but no policy/configuration source or permission is defined.
10. Return direction/semantics are not defined and no dedicated `inventory.return` permission exists.
11. Transfers have no header/table or exact source-identity/pairing rule for the two append-only ledger sides.
12. Inventory-count adjustments are required, but no count-session/table, reason-code master or approval endpoint is defined.
13. Adjustment approval is policy-dependent, but Module 10 has no hard Module-22 dependency and no Inventory approval command is defined.
14. `STOCK_PERIOD_LOCKED` exists, but no Inventory stock-period owner or relation to Finance fiscal periods is defined.
15. Item/receipt/stock transaction status/type token vocabularies are not enumerated.
16. The exact Module-7 material actual-cost `source_type`/source-line encoding is not defined.
17. The source does not define a dedicated Inventory transaction ledger read route even though the UI requires a stock ledger.
18. The current Module-8/9 APIs permit non-null deferred `item_id` UUIDs without an Inventory target; Pass 246 must preflight historical values and must not silently null, rewrite or fabricate Inventory items to satisfy the new FKs.

These gaps must remain visible. Later passes may choose the narrowest implementation behavior needed for correctness, but must distinguish that implementation convention from the source contract and must not create extra business modules.

## Pass boundary

Pass 245 is contract-only.

It may add:

```text
docs/modules/inventory/STAGE-15-MODULE-10-CONTRACT.md
scripts/module-10/verify-stage-15-contract.mjs
tests/module-10-static.test.mjs
module-10-evidence/stage-15-contract.json
root package/workspace/README registration for the contract gate
```

It must not add:

```text
Inventory Prisma models
Inventory migration
Inventory API schema/repository/service/routes
Inventory React feature
new public Inventory endpoint
new Inventory permission token
Finance/AP/GL posting
Daily Site Report material integration
Reports or Dashboard work
```

## Pass 245 → 246 handoff (completed)

After the Pass-245 contract checks pass, the next reviewed pass is:

```text
Pass 246 — Module 10 reviewed Prisma models, constraints, indexes and migration
```

Pass 246 must create the six reviewed Inventory resources, review all Company/Project/FK/index constraints, activate the now-valid nullable `purchase_order_items.item_id -> inventory_items.id` relationship, preflight and activate the earlier nullable Procurement item relationship only when historical values resolve safely, and preserve every unresolved public-contract gap without inventing routes or unrelated Finance tables.

Production deployment remains blocked until the Stage-14 live handoff is genuine.


## Pass 246 persistence decisions

Pass 246 implements only the reviewed persistence layer. It adds the six source-owned Prisma models and one Stage-15 migration; it does not add Inventory HTTP schemas, repositories, services, routes, React code, Finance posting or extra business tables.

The reviewed persistence conventions are:

```text
quantity / accepted_qty / rejected_qty / on-hand / reserved       DECIMAL(18,4)
unit_cost / average_cost                                          DECIMAL(18,4)
item_code / warehouse code / receipt_no                           indexed, not source-invented unique keys
inventory balance                                                  one row per warehouse + item
stock_transactions                                                 append-only at database level
purchase_requisition_items.item_id                                 nullable FK activated after historical-value preflight
purchase_order_items.item_id                                       nullable FK activated after historical-value preflight
```

The migration deliberately does **not** enumerate item status, receipt status, valuation method, transaction type or source type values because the source does not define those vocabularies.

The migration also does not infer `quantity = accepted_qty + rejected_qty`, does not add an over-receipt tolerance table, does not invent a transfer header, stock-count session, UOM conversion table, low-stock threshold, warehouse CRUD persistence extension or Finance source adapter.

### Deferred item upgrade preflight

Before either old nullable item reference becomes a foreign key, the migration counts non-null historical `purchase_requisition_items.item_id` and `purchase_order_items.item_id` values that do not resolve to the new `inventory_items` target. If any exist, migration deployment fails with an explicit repair hint.

The migration does not null those values, rewrite them or fabricate Inventory items. A database with only description-based historical lines continues to migrate because the relationships stay nullable.

After activation, database triggers also reject future cross-Company item references through both the Purchase Requisition and Purchase Order headers.

### Persistence integrity added in Pass 246

- Warehouse Project links are same-Company constrained.
- One Inventory balance is allowed per warehouse/item and fail-closed on-hand balances cannot be negative.
- Goods Receipt headers must match the same Company/Project Purchase Order, same-Company warehouse and same-Company receiving user.
- Project-scoped warehouses may only be used by receipts/stock rows for that Project; Company-level warehouses remain usable for authorized Projects.
- Goods Receipt lines must reference a Purchase Order line on the receipt header PO and an Inventory item in the receipt Company.
- Stock transactions enforce Company/item/warehouse scope and, when a cost structure is present, it must belong to the transaction Project.
- `stock_transactions` rejects UPDATE and DELETE; corrections remain new reversing/adjustment rows.

These are persistence integrity rules only. Receipt eligibility status, over-receipt/open-quantity calculation, valuation, unit conversion, balance locking, PO `received_qty` mutation, Module-7 actual-cost creation, audit/outbox and idempotency remain Pass-249 service responsibilities after the API/repository passes freeze their boundaries.

## Pass 247 handoff

After the Pass-246 persistence gate succeeds, the next reviewed pass is:

```text
Pass 247 — Module 10 strict Zod/API schemas
```

Pass 247 must define request/query/response boundaries for exactly the eight reviewed Inventory operations. It must keep Company ownership, actor identity, calculated balances/costs and PO consumption server-owned, and it must preserve every unresolved Warehouse/ledger/low-stock/valuation/UOM/return/stock-period gap rather than inventing new public routes.


## Pass 247 strict Zod/API boundary

Pass 247 adds only `apps/api/src/modules/inventory/inventory.schema.ts` plus schema verification evidence. It follows the controlling within-module order by placing the Zod boundary after the reviewed Stage-15 persistence layer and before repository/service/routes.

Exactly the eight reviewed public operations remain frozen:

```text
GET  /api/v1/inventory/items
POST /api/v1/inventory/items
GET  /api/v1/inventory/balances
POST /api/v1/inventory/receipts
POST /api/v1/inventory/transfers
POST /api/v1/inventory/issues
POST /api/v1/inventory/returns
POST /api/v1/inventory/adjustments
```

No Warehouse CRUD, Item update/delete, stock-ledger read, low-stock read, stock-count, approval, valuation or UOM endpoint is added.

### Read-query boundary

The source calls the Item endpoint a list and the balance endpoint a stock-balance query, but it does not enumerate business filter fields. Pass 247 therefore accepts only bounded `page` / `pageSize` pagination, with a maximum page size of 100. It does not invent `status`, `category`, `warehouseId`, `itemId`, `projectId` or free-text filters. Later repository methods still apply Company and allowed-Project scope from trusted context independently of the browser query.

### Item create boundary

Browser-owned Item fields are limited to:

```text
itemCode
name
category
baseUnit
valuationMethod
```

`companyId` and item `status` remain server-owned. `valuationMethod` remains a bounded nonblank string because the source does not enumerate supported valuation tokens. Pass 247 does not invent a valuation enum or a browser-provided conversion factor.

### PO receipt boundary

The receipt command accepts:

```text
purchaseOrderId
warehouseId
items[]
  poItemId
  itemId
  quantity
  acceptedQty
  rejectedQty
```

The server owns Company/Project scope, receipt number, receive timestamp, receiver identity, receipt status, unit cost/valuation, stock ledger rows, balance mutation and Purchase Order `received_qty` mutation.

The source does not define the exact reconciliation rule among `quantity`, `accepted_qty` and `rejected_qty`. Pass 247 therefore validates their decimal shape and sign independently but deliberately does not add `quantity = acceptedQty + rejectedQty` as an invented API invariant. Pass 249 must resolve the narrowest runtime behavior before activation.

### Transfer boundary

The transfer command accepts only:

```text
sourceWarehouseId
destinationWarehouseId
itemId
quantity
```

The two warehouse ids must differ. Project scope, unit cost, source identity, stock-transaction types and resulting balances remain server-owned. Because the source defines no transfer header or transfer token vocabulary, Pass 247 does not add a transfer id/number/status, direction enum or seventh Inventory table. The response is only the two server-created stock movement DTOs from the later atomic transaction.

### Project issue boundary

The issue command accepts:

```text
warehouseId
projectId
itemId
quantity
wbsNodeId
costCodeId
costTypeId
```

The server resolves the Module-6 posting mapping (`costStructureId`), approved valuation/unit cost, Inventory source identity and Module-7 actual-cost source linkage. No calculated cost, source token or actual-cost amount/id is accepted from the browser.

### Return boundary convention

The source requires a return command and a reason but does not define whether the return is site-to-stock, vendor return or reversal of a warehouse movement, and it defines no `inventory.return` permission.

Pass 247 therefore uses the narrow direction-neutral request convention:

```text
sourceTransactionId
quantity
reason
```

`sourceTransactionId` references an existing append-only Inventory stock transaction. This is an implementation-boundary convention, not a claim that the source defines a return direction. No return-direction/type enum is exposed, and the missing authorization mapping remains unresolved for the later HTTP/service passes.

### Adjustment boundary convention

The controlled adjustment command accepts:

```text
warehouseId
itemId
quantityDelta
reason
```

`quantityDelta` is a signed, non-zero exact decimal. This avoids inventing an adjustment-direction enum or stock-count session while still expressing the reviewed controlled adjustment command. Resulting stock balance, unit cost, source identity, transaction type and any policy/approval decision remain server-owned.

### Decimal and response boundary

Inventory quantities and costs cross the API boundary as exact decimal strings compatible with the reviewed `DECIMAL(18,4)` persistence. This avoids JavaScript floating-point precision loss.

Safe response DTOs expose Item master data, balances, PO receipt/readback and stock movement fields needed by the reviewed operations. Company ownership is not exposed as browser authority. `sourceType`, `sourceId` and Module-7 actual-cost source tokens remain internal rather than becoming an undocumented public token vocabulary.

The six reviewed business errors remain exactly:

```text
ITEM_NOT_FOUND
WAREHOUSE_NOT_FOUND
INSUFFICIENT_STOCK
RECEIPT_EXCEEDS_PO
INVALID_UNIT_CONVERSION
STOCK_PERIOD_LOCKED
```

The five reviewed event names remain visible for the later service/outbox pass but Pass 247 emits no events and writes no audit/outbox records.

### Unresolved gaps preserved after Pass 247

Pass 247 does not resolve Warehouse management, ledger/low-stock reads, low-stock thresholds, exact valuation algorithms, UOM conversion rules, receipt tolerance, accepted/rejected reconciliation, negative-stock policy configuration, return authorization/direction, transfer source pairing, stock-count sessions, adjustment approval, stock-period ownership, lifecycle/type token vocabularies or Module-7 material actual-cost source encoding.

## Pass 248 handoff

After the Pass-247 schema gate succeeds, the next reviewed pass is:

```text
Pass 248 - Module 10 Company/Project-scoped repository
```

Pass 248 must add only repository methods needed by the frozen eight-route boundary and later atomic workflows. It must derive Company ownership and allowed-Project scope from trusted context, support transaction clients/locking for stock correctness, keep stock history append-only, and avoid resolving service-only valuation, return-permission, approval or source-token policy early.

Production deployment remains blocked until the Stage-14 live handoff is genuine.

## Pass 248 Company/Project-scoped repository boundary

Pass 248 adds only `apps/api/src/modules/inventory/inventory.repository.ts` plus repository verification evidence. The repository accepts either the normal Prisma client or an active transaction client so Pass 249 can orchestrate receipt, stock and job-cost writes atomically in the service layer.

### Trusted Company and Project scope

Every Company-owned read/write starts from `requireCompanyRepositoryScope()`. Warehouse-scoped reads use an explicit `InventoryProjectVisibilityRepositoryInput` instead of trusting browser project IDs. The visibility model distinguishes unrestricted Company access from an explicit allowed-Project set and makes Company-wide Warehouse visibility an explicit service decision.

Item master persistence remains Company-owned. Inventory balances are read only through same-Company Item and Warehouse relations. Project/site Warehouses are visible only when their Project is in the allowed scope; Company-wide Warehouses are included only when the service explicitly allows them.

### Item and balance primitives

The repository provides bounded Item and balance list primitives, Item lookup/create, Warehouse lookup, balance lookup, a zero-balance ensure-and-lock primitive and a service-calculated balance update primitive.

`ensureAndLockInventoryBalance()` uses the reviewed unique warehouse/item balance key and finishes with `FOR UPDATE OF balance`. The repository does **not** decide valuation algorithms, negative-stock policy, reservation policy or browser-facing lifecycle behavior. It persists exact service-reviewed values only.

No Item update/delete method, Warehouse create/update/delete method or undocumented business search/filter is generated.

### PO receipt concurrency primitives

Pass 248 prepares later atomic receipt orchestration with:

```text
findPurchaseOrderForReceipt
lockPurchaseOrderForReceipt
lockPurchaseOrderItemsForReceipt
incrementPurchaseOrderItemReceivedQty
createGoodsReceipt
findGoodsReceiptById
```

Purchase Order lines are locked in deterministic ID order before the later service checks open quantity. The repository does not decide issued/receivable PO lifecycle policy, receipt tolerance, `quantity`/`acceptedQty`/`rejectedQty` reconciliation or valuation. Those remain service rules for Pass 249.

The PO `received_qty` primitive accepts only a service-calculated increment. Goods Receipt creation stamps trusted Company ownership and verifies same-Company Project, Warehouse, PO and receiving user before nested line persistence.

### Append-only stock primitives

Stock history remains append-only at both the database and repository boundaries. The repository provides read-by-id, read-by-source and create-only stock transaction methods. It exposes no stock transaction update/delete/upsert path and does not invent transaction-type or source-type constants.

`findPostingCostStructure()` resolves only posting-enabled Module-6 mappings inside the Company-owned Project. `createStockTransaction()` rechecks Item, Warehouse, optional Project and optional posting mapping scope before inserting a service-reviewed movement.

Transfer pairing, issue/return/adjustment token vocabularies, stock-count sessions and unit-conversion persistence remain unresolved and are not invented.

### Module-7 actual-cost source primitive

Because the source requires site issues to create Project actual cost exactly once, Pass 248 prepares a narrow Module-7 adapter primitive:

```text
findCostActualBySourceKey
createCostActual
```

The stable Module-7 unique source key is reused for idempotency lookup. Actual rows remain append-only: no update/delete/upsert is exposed. The repository does not choose Inventory `sourceType`, `sourceId`, `sourceLineId`, correction encoding or amount-calculation policy; Pass 249 must keep those choices server-owned and auditable.

### Boundaries still deferred

Pass 248 adds no service, Fastify route, module registration or React feature. It does not add Warehouse CRUD, stock-ledger/low-stock APIs, transfer headers, stock-count tables, UOM/conversion persistence, valuation configuration, Inventory approval persistence or Finance/AP/GL writes.

Production deployment remains blocked until the Stage-14 live handoff is genuine.

## Pass 249 handoff

After the Pass-248 repository gate succeeds, the next reviewed pass is:

```text
Pass 249 - Module 10 Inventory service/business transactions
```

Pass 249 must place Project resource policy and transaction orchestration in `inventory.service.ts`, use the Pass-248 transaction-capable repository primitives, preserve fail-closed stock/receipt behavior where the source defines no enabling policy, write audit/outbox records with the business transaction, and keep unresolved valuation/UOM/return-permission/source-token gaps explicit rather than turning them into invented public contracts.

## Pass 249 Inventory service/business-transaction boundary

Pass 249 adds only `apps/api/src/modules/inventory/inventory.service.ts` plus service verification evidence. It uses the transaction-capable Pass-248 repository and Foundation audit, outbox, idempotency and numbering infrastructure. Fastify routes, module registration and React remain deferred to Pass 250 and later.

### Resource-policy rules

The service does not trust role names, browser permission arrays, Company ids or Project ids as authorization proof. It re-resolves effective permission codes from Module 24A/24B persistence. Project-store commands require the exact Project permission. Company-wide Warehouse commands require the matching Company permission and an unrestricted resolved Project scope. Closed Projects reject normal Stage-15 Inventory writes.

Item master reads/writes remain Company-owned. Balance visibility is the intersection of the server-resolved Project scope and persisted `inventory.read` assignments. A Project-only user is not allowed to use a Company-wide Warehouse merely because it has `project_id = null`.

### Idempotent command boundary

The five stock-mutating commands use Foundation `executeIdempotentCommand()` and one caller-supplied idempotency key at the later HTTP boundary:

```text
inventory.receive
inventory.transfer
inventory.issue
inventory.return
inventory.adjust
```

The idempotency record, Inventory writes, Module-7 actual source writes, audit and outbox all commit or roll back together.

### PO receipt runtime conventions

The source leaves `quantity`, `accepted_qty` and `rejected_qty` reconciliation undefined. Pass 249 freezes the narrow executable convention:

```text
quantity = accepted_qty + rejected_qty
accepted_qty enters stock
accepted_qty increments purchase_order_items.received_qty
rejected_qty remains receipt quality history and does not enter stock
```

This is an implementation convention, not new source text. The public request schema is unchanged.

Receipt validation remains fail-closed:

- the PO must be `ISSUED`;
- every receipt line belongs to the PO;
- duplicate PO-line entries inside one command are rejected;
- if a PO line already has an Inventory `item_id`, the receipt item must match it;
- item `base_unit` must match the PO line unit because no approved conversion source exists;
- `quantity` cannot exceed the locked open ordered quantity;
- a project-scoped Warehouse must match the PO Project;
- the Project must not be closed.

The receipt number is server-allocated from the internal Foundation sequence key `goods-receipt`. This key is an implementation identifier, not a public API field.

The receipt transaction is:

```text
lock Project
lock Purchase Order
lock requested PO lines in deterministic order
create Goods Receipt + lines
for every accepted quantity:
  ensure + lock warehouse/item balance
  update balance
  append RECEIPT stock movement
  increment PO received_qty
record audit
record inventory.received outbox event
commit
```

### Valuation convention

The source defines `inventory_balances.average_cost` but does not define a public valuation-method enum or algorithm matrix. Pass 249 therefore does **not** branch on the opaque `inventory_items.valuation_method` string and does not expose a browser cost override.

For the executable Stage-15 stock basis, accepted PO receipt quantity uses the server-owned PO `unit_rate` and updates the stored `average_cost` by weighted average. Transfers and returns carry the source balance/movement cost into the destination balance using the same weighted-average basis. Issues and negative adjustments use the locked balance `average_cost`.

This is explicitly an implementation convention around the only source-defined persisted cost basis. It does not claim that the source defines FIFO/LIFO/weighted-average valuation tokens, cost layers or rounding policy. All calculations use scaled integers and deterministic half-up rounding rather than JavaScript floating point.

### Transfer convention

The source has no transfer header/table. Pass 249 keeps transfer as two append-only stock transactions in one idempotent transaction:

```text
TRANSFER_OUT  negative quantity at source Warehouse
TRANSFER_IN   positive quantity at destination Warehouse
```

Both rows share one internal request source identity. The service locks the two balances in deterministic Warehouse-id order, protects reserved quantity, rejects negative available stock and keeps transferred quantity/cost basis equal on both sides. No seventh Inventory table is added.

### Project issue and Module-7 actual-cost convention

Issue requires:

- exact `inventory.issue` Project permission;
- writable Project;
- authorized Project or Company-wide Warehouse;
- same-Company Item;
- posting-enabled Module-6 Project/WBS/Cost Code/Cost Type mapping;
- sufficient on-hand stock after reserved quantity.

The service appends one negative `ISSUE` stock transaction, decreases the locked balance and creates one append-only Module-7 `cost_actuals` source in the same transaction. The internal source convention is:

```text
source_type    inventory_issue
source_id      created ISSUE stock_transaction.id
source_line_id created ISSUE stock_transaction.id
```

The actual amount is quantity multiplied by the locked server-owned Inventory average cost and serialized to Module-7 money precision. The browser cannot submit the amount or source key.

### Return convention and permission gap

The source does not define return direction or a dedicated `inventory.return` permission. Pass 249 does not add one. To fail closed while keeping the reviewed return route executable, the service supports only one narrow interpretation:

```text
return = reversal of a prior Project ISSUE stock transaction
```

The caller must hold **both** existing `inventory.issue` and `inventory.adjust` authority for the source Project. Any non-ISSUE source transaction is rejected. Cumulative returns cannot exceed the original issued quantity.

A supported return appends a positive `RETURN` stock transaction to the original Warehouse, restores stock at the original issue unit cost and appends a negative Module-7 actual-cost correction. No prior stock transaction or actual-cost row is edited or deleted. Return-to-vendor, warehouse-return and other interpretations remain unsupported and fail closed until an explicit contract exists.

### Adjustment convention

The reviewed adjustment request remains only Warehouse, Item, signed non-zero quantity delta and reason. Pass 249 locks the balance, rejects a negative delta that would consume reserved/absent stock, updates the balance, appends one `ADJUSTMENT` stock transaction and writes reasoned audit plus `inventory.adjusted` outbox evidence.

No stock-count session/table, reason-code master, Inventory approval request or approval endpoint is introduced. If a later policy requires adjustment approval, it needs an explicit reviewed integration contract.

### Events and audit

Only the five reviewed Inventory domain events are emitted:

```text
inventory.received
inventory.transferred
inventory.issued
inventory.returned
inventory.adjusted
```

Item creation is audited because it includes valuation-sensitive master data, but it does not invent an `inventory.item_created` domain event. Stock writes record before/after quantity/cost information and reason/source references where relevant. Audit/outbox writes share the owning transaction.

### Gaps still intentionally unresolved

Pass 249 still does not invent:

- Warehouse CRUD/public management APIs;
- stock-ledger or low-stock read APIs;
- low-stock thresholds;
- valuation-method public enums or alternate cost-layer algorithms;
- UOM conversion persistence/factors;
- receipt tolerance configuration;
- negative-stock enabling policy;
- general return directions or a new return permission;
- transfer header/number persistence;
- stock-count sessions;
- adjustment approval workflow;
- an Inventory stock-period owner or a Finance-period shortcut;
- Finance/AP/GL Inventory posting.

`STOCK_PERIOD_LOCKED` therefore remains a reviewed error code that the service does not manufacture from Module-15 fiscal periods. Formal Inventory accounting remains deferred to Module 15B.

## Pass 250 handoff

After the Pass-249 service gate succeeds, the next reviewed pass is:

```text
Pass 250 - Module 10 Fastify routes, authentication/RBAC, OpenAPI and module registration
```

Pass 250 must expose exactly the eight reviewed Inventory operations, require idempotency headers for the five retry-sensitive stock mutation commands, preserve the service's resource-policy revalidation, use the frozen Zod request/response schemas and stable errors, register the five-file backend module, and add no Warehouse/ledger/low-stock API beyond the source contract.

Production runtime activation remains blocked until the Stage-14 live handoff is genuine.

## Pass 250 Inventory HTTP/OpenAPI boundary

Pass 250 registers the reviewed five-file backend module and exactly these eight operations:

```text
GET  /api/v1/inventory/items
POST /api/v1/inventory/items
GET  /api/v1/inventory/balances
POST /api/v1/inventory/receipts
POST /api/v1/inventory/transfers
POST /api/v1/inventory/issues
POST /api/v1/inventory/returns
POST /api/v1/inventory/adjustments
```

Every route authenticates through the existing Module-24 session boundary and delegates authorization/resource policy to the Pass-249 service. Request and response values are validated with the frozen Zod schemas. Receipt, transfer, issue, return and adjustment require `Idempotency-Key`; Item creation remains a normal non-idempotency-key master-data command.

OpenAPI keeps quantity/cost values as exact decimal strings and does not expose Company, actor, status, balance, valuation cost, PO-consumption or Module-7 actual-cost fields as browser authority. No Warehouse CRUD, stock-ledger read, low-stock, stock-count, valuation or Finance route is added.

## Pass 251 PostgreSQL/Fastify integration and security boundary

Pass 251 adds verification infrastructure only. It does not change Inventory runtime behavior, Prisma models, migrations or the reviewed public route surface.

The live-capable integration suite exercises the real Fastify -> authentication/RBAC -> Inventory service -> repository -> Prisma -> PostgreSQL chain for:

- Company Item list/create and Project-authorized balance reads;
- issued PO receipt with Goods Receipt, append-only stock ledger, balance and `purchase_order_items.received_qty` synchronization;
- replay-safe receipt idempotency;
- two-sided quantity-conserving transfer;
- Project issue plus one Module-7 `cost_actuals` source;
- supported Project-issue return plus append-only negative actual-cost correction;
- controlled adjustment;
- receipt quality, unit, PO-open-quantity, available-stock and closed-Project validation;
- unauthenticated, missing-permission, restricted-Project, cross-Company and browser-authority negative cases;
- database Company/Project integrity and append-only stock-ledger protection;
- late outbox failure rollback for receipt and issue transactions;
- generated OpenAPI with exactly eight reviewed operations and five required idempotency headers.

Pass 251 intentionally does not claim live execution while Stage 14 lacks its genuine live acceptance handoff. The static gate verifies the integration harness, runtime TypeScript syntax, dependency regressions, workspace contract and migration policy. The live gate fails before PostgreSQL execution unless `module-9-evidence/stage-14-live.json` proves `STAGE_14_ACCEPTED_READY_FOR_STAGE_15` with runtime verification complete and the disposable database guard is explicitly enabled.

## Pass 252 handoff

After the Pass-251 integration/security gate is prepared, the next reviewed pass is:

```text
Pass 252 - Module 10 React Inventory typed API client and TanStack Query UI preparation
```

The React pass must consume only the eight reviewed APIs. It must not invent missing Warehouse CRUD, stock-ledger/low-stock reads or valuation configuration merely to satisfy UI wishes; any source/API mismatch remains explicit until a reviewed contract resolves it.

## Pass 253 browser-verification handoff

Pass 253 prepares the required Playwright workflow after the React boundary. It exercises the supported Item -> PO receipt -> transfer -> Project issue -> return -> adjustment path, checks restricted-reader UI/API denial, verifies browser request authority and idempotency, and reconciles the resulting Inventory/PO/Module-7/audit/outbox state.

This pass adds no production runtime file, database change, migration or public route. Warehouse CRUD/lookup, stock-ledger/low-stock reads, stock-count sessions, valuation/UOM configuration and Finance/AP/GL behavior remain outside the frozen Stage-15 contract.

A genuine browser-runtime success may be recorded only after Stage 14 has live status `STAGE_14_ACCEPTED_READY_FOR_STAGE_15`, `RUN_MODULE_10_E2E=1` is explicitly enabled and the disposable PostgreSQL test guard is enabled. Otherwise the Playwright gate must remain prepared/blocked rather than claiming runtime verification.

After successful Pass-253 preparation, the next reviewed pass is Pass 254 operational, migration and concurrency verification.

## Pass 254 operational, migration and concurrency handoff

Pass 254 adds verification only. It does not change Inventory runtime behavior, Prisma models, migrations or the eight reviewed public operations.

The live operational suite now exercises concurrent receipts against one PO line, concurrent Project issues against one Warehouse/Item balance, and opposing cross-Project Warehouse transfers. These checks verify that existing PO/line, Project and balance locks serialize competing commands, prevent over-receipt/negative stock, preserve transfer quantity and keep the append-only ledger consistent with resulting balances.

The same operational gate reuses Pass-251 rollback coverage for late `inventory.received` and `inventory.issued` outbox failures, verifies the clean and immediately-previous-schema migration paths before live concurrency execution, and checks the reviewed Stage-15 Item/Warehouse/Balance/Receipt/Stock-transaction indexes through PostgreSQL `EXPLAIN` without unstable wall-clock thresholds.

Live operational verification remains blocked until Stage 14 is genuinely accepted and the Module-10 integration/security plus Playwright live handoffs are genuine. Static preparation therefore cannot be used as a runtime acceptance claim.

Next reviewed pass: **Pass 255 - Module 10 final Stage-15 acceptance gate.**

## Pass 255 final Stage-15 acceptance boundary

Pass 255 closes the reviewed Module-10 implementation with a verification-only final gate. It adds no production Inventory behavior, Prisma model, migration or public API. The final static gate rechecks Modules 5, 6, 7, 9 and 24B, the complete Module-10 suite, workspace/stack rules, migration policy, Inventory integration/Playwright syntax and all five backend module files.

The live acceptance gate is fail-honest. It cannot run unless Stage 14 is genuinely accepted and Passes 251, 253 and 254 have genuine live evidence. After those handoffs, the guarded live chain performs a clean dependency install, typecheck, lint, Prisma validation/generation, clean and immediately-previous-schema migration verification, full build, real Module-10 Fastify/PostgreSQL integration, the Module-10 browser workflow, Module-10 operational/concurrency verification and operational regressions for Modules 9, 7, 6 and 5.

Only that genuine live chain may write `STAGE_15_ACCEPTED_READY_FOR_STAGE_16`. Static preparation alone must remain `STAGE_15_STATIC_GATE_PASSED_STAGE_14_LIVE_HANDOFF_PENDING` while the upstream live handoff is absent.

The final Stage-15 boundary remains exactly six owned Inventory tables, eight public operations, six stable permissions and five Inventory events. Stock history remains append-only, PO receipt consumption remains atomic, Project issues remain idempotently linked to Module-7 actual costs, and formal Finance source adapters stay deferred to Module 15B / Stage 26. The documented Warehouse, stock-ledger/low-stock, valuation/UOM, return-permission and stock-period gaps remain explicit rather than being filled with invented contracts.

After genuine Stage-15 acceptance, the next dependency-aware stage is **Stage 16 - Module 11 Subcontractor Management**.

Next reviewed pass: **Pass 256 - Stage 16 / Module 11 Subcontractor Management contract freeze.**


## Pass 368 repair amendment — Warehouse management, stock-ledger read and low-stock support

Pass 368 resolves the two Stage-15 source/UI gaps frozen by Pass 358 without rewriting the original eight source operations. The source itself owns the `warehouses`, `inventory_balances` and `stock_transactions` resources and requires Warehouse/site-store maintenance, a stock-ledger UI and a low-stock UI. The original API table did not provide those reads/maintenance commands, so this amendment adds only the minimum reviewed repair contract.

### Repair operations

The original eight Module-10 operations remain unchanged. Pass 368 adds exactly these six repair operations:

```text
GET   /api/v1/inventory/warehouses
POST  /api/v1/inventory/warehouses
PATCH /api/v1/inventory/warehouses/:id
GET   /api/v1/inventory/stock-ledger
PUT   /api/v1/inventory/balances/minimum-stock
GET   /api/v1/inventory/low-stock
```

Warehouse and stock reads reuse `inventory.read`. Warehouse create/update and minimum-stock configuration reuse `inventory.item.manage`; no new permission is introduced. Project-scoped Warehouse reads/writes continue to use persisted Module-24B Project authorization, while Company-wide Warehouse creation requires Company-level authority.

Warehouse creation accepts only optional `projectId`, `code`, `name` and `location`; status is server-owned and starts `ACTIVE`. Warehouse update accepts only `code`, `name` and `location`. Pass 368 deliberately provides no Warehouse DELETE/archive, status mutation or Project reassignment command because the source does not define those lifecycle rules.

### Minimum-stock persistence and low-stock rule

Pass 368 adds one nullable `DECIMAL(18,4)` field to the existing source-owned `inventory_balances` resource:

```text
minimum_stock_quantity nullable
```

`NULL` means low-stock monitoring is disabled for that Warehouse/Item balance. A configured value must be non-negative. The service may create the existing zero balance row when an authorized user configures a threshold for a Warehouse/Item pair that has never moved stock; this does not create a stock transaction or change physical quantity.

The reviewed low-stock predicate is intentionally limited to:

```text
minimum_stock_quantity IS NOT NULL
AND quantity_on_hand <= minimum_stock_quantity
```

Reserved quantity remains visible in the response but is not subtracted from on-hand because the source does not define reservation-vs-threshold semantics. No reorder quantity, preferred vendor, replenishment automation or low-stock event/job is invented.

### Stock-ledger readback

`GET /stock-ledger` is read-only and bounded by `page`/`pageSize` with optional Warehouse and Item UUID filters. It exposes the existing append-only stock transaction identity, exact quantity/unit cost, occurrence time, source type/source ID and authorized Warehouse/Item labels. It does not provide edit/delete/rewrite operations. Existing corrections continue to use reversing/adjustment transactions.

### Audit, events and deferred boundaries

Warehouse create/update and minimum-stock changes are audited with actor/Company/Project scope. They do not invent new Module-10 domain events; the reviewed five-event vocabulary remains unchanged. Reads create no audit/outbox record.

Pass 368 does **not** resolve UOM conversion, receipt tolerance, negative-stock policy, general return directions/dedicated return permission, stock-count sessions/reconciliation ownership, stock-period ownership or formal Inventory-to-Finance posting. Those remain frozen for Pass 369 or Stage 26/27 exactly as classified by the Pass-358 repair contract.

## Pass 369 repair amendment — approved UOM conversion, physical-count evidence and Inventory stock periods

Pass 369 supersedes only the previously frozen UOM/count/stock-period gaps. It adds per-Item approved factor-to-base conversions and immutable PO-receipt conversion snapshots; durable physical count headers/lines with idempotent stale-safe reconciliation into the existing append-only adjustment ledger; and Inventory-owned OPEN/LOCKED stock periods behind the existing `STOCK_PERIOD_LOCKED` error.

The return route remains the previously conservative partial reversal of a prior Project ISSUE. Its authority is now explicitly frozen as the conjunction of the existing `inventory.issue` and `inventory.adjust` permissions; no dedicated return permission is created.

The original eight source operations and the six Pass-368 repair operations remain intact. Pass 369 appends eight narrowly reviewed operations for Item unit conversions, physical counts and Inventory stock periods. The source-defined six stable error codes and five domain events remain unchanged. Formal Inventory-to-Finance adapters remain deferred to Stage 26.
