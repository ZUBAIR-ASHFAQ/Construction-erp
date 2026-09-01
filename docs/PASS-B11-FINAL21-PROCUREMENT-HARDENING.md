# Pass B11 - Final-21 Procurement / Purchase Hardening

## Purpose

Align Module 10 with the controlling Final 21-module Construction ERP contract while keeping the Material Requirement -> Purchase Order -> Goods Receipt workflow small, readable, retry-safe and Project/Stage traceable.

## Implemented

- Kept Procurement as the required five-file backend: schema, repository, service, routes and index.
- Kept exactly the ten documented Procurement routes and no RFQ/quotation workflow.
- Added optional Material Requirement header Stage and real ProjectStage relations for requirement, PO and receipt lines.
- Added service and database checks so Procurement Stage references belong to the same Company and Project.
- Kept material validation against the active Company material master.
- Hardened supplier selection: Vendor must be active and cannot be pending qualification.
- Kept PO totals server-calculated from approved requirement lines with exact decimal arithmetic.
- Kept over-order protection under a requisition row lock.
- Kept issued PO commitments source-keyed and idempotent in Project Budget & Cost.
- Required Foundation `Idempotency-Key` on every Procurement write command.
- Kept Goods Receipt as the Procurement command while Inventory performs receipt + stock effects atomically.
- Added stable `PO_NOT_RECEIVABLE` and `OVER_RECEIPT_NOT_ALLOWED` errors at the Procurement boundary.
- Made Goods Receipt Vendor identity mandatory and tied it to its Purchase Order.
- Added optional receipt-line `batch_no` traceability.
- Made Company Goods Receipt numbers unique.
- Updated React writes to send idempotency keys, hide pending vendors and display open PO quantity.
- Simplified stale migration-system tests so they validate the current ordered gate manifest instead of hard-coding old pass counts.
- Updated the workspace regression test to keep removed legacy Module 24B executables removed while retaining historical evidence.
- Added a forward-only B11 migration; historical migrations were not edited.

## Final Module 10 routes

- `GET /api/v1/procurement/requisitions`
- `POST /api/v1/procurement/requisitions`
- `POST /api/v1/procurement/requisitions/:id/approve`
- `GET /api/v1/procurement/purchase-orders`
- `POST /api/v1/procurement/purchase-orders`
- `GET /api/v1/procurement/purchase-orders/:id`
- `POST /api/v1/procurement/purchase-orders/:id/issue`
- `POST /api/v1/procurement/purchase-orders/:id/cancel`
- `POST /api/v1/procurement/goods-receipts`
- `GET /api/v1/procurement/goods-receipts/:id`

## Important invariants

- No RFQ or Tender workflow is reintroduced.
- A PO can be created only from an approved material requirement.
- Vendor, Project and Stage ownership are Company scoped.
- A pending/unavailable Vendor cannot receive a new PO.
- PO totals are authoritative server calculations.
- Issuing one PO creates one source-keyed material commitment per PO line.
- Goods cannot be received unless the PO is issued.
- Receipt quantity cannot exceed remaining PO quantity.
- Goods Receipt + Inventory stock posting remains atomic/idempotent.
- Posted receipt history is preserved; later Inventory reversal behavior remains compensating rather than destructive.

## Deferred to later owning passes

- Inventory WBS/Cost Code/Cost Type removal and final stock-ledger simplification is Pass B12.
- Equipment Stage/cost final alignment is Pass B13.
- Supplier invoice/AP matching is owned by the later Supplier Payables pass.
- Full live clean/previous-schema migration execution requires `MIGRATION_TEST_DATABASE_URL` and is not possible in the supplied archive environment.
- Full Prisma generation/typecheck requires installed project dependencies; the supplied archive does not include `node_modules`.
