# Pass 369 — Module 10 UOM, Physical Count and Stock-Period Repair

Pass 369 closes only the three Module-10 gaps classified for repair before Stage 24 by the Pass-358 audit. It does not change the required stack, the five-file backend module structure, the original eight source routes, the Pass-368 Warehouse/read routes, or the Stage-26 Finance boundary.

## Approved unit-conversion contract

`InventoryItem.baseUnit` remains the authoritative stock unit. An Item may have a small set of approved alternate units. Each row stores `factorToBase`, meaning one alternate unit equals that exact number of base units. The base unit itself is implicit with factor `1` and cannot be duplicated as an alternate row.

Only PO receipt conversion is activated in this pass because that is the existing transaction that already carries a source unit. The receipt keeps PO/source quantities in their original unit for PO consumption and snapshots `sourceUnit`, `conversionFactor`, `sourceUnitCost`, base quantity and base accepted/rejected quantities. Stock balance and stock ledger quantities remain in the Item base unit. Conversion must be exactly representable at four decimal places; the service rejects values that would require an invented rounding policy.

The repair adds no global UOM module and no new permission. Reading conversions reuses `inventory.read`; replacing them reuses `inventory.item.manage` with unrestricted Company scope.

## Physical count and reconciliation contract

A physical count is durable evidence, not a direct balance edit. Creating a count snapshots each selected Item's current Warehouse on-hand quantity together with the observed base-unit quantity. A count starts `DRAFT` and creation is idempotent.

Reconciliation re-locks the count and each affected balance. If current stock differs from the captured expected quantity, reconciliation fails and the user must create a fresh count. A non-zero variance produces one append-only `ADJUSTMENT` stock transaction using `source_type = inventory_count`; zero variance produces no movement. Each generated movement is linked back to its count line. The count then becomes `RECONCILED` with actor/time evidence. Reconciliation is idempotent.

This repair reuses `inventory.adjust`. It does not invent a count-approval workflow because the source says adjustment approval is policy-dependent and Module 10 has no hard Module-22 dependency.

## Return authority and semantics

The existing return implementation remains intentionally narrow: a return reverses part of a prior Project `ISSUE`. The source route has no dedicated return permission, so Pass 369 formalizes the conservative existing authority as the combination of `inventory.issue` and `inventory.adjust`. No `inventory.return` permission is introduced.

Return movements remain append-only and continue to reverse the linked Module-7 actual cost exactly once. Other return directions remain unsupported until a future explicit contract defines them.

## Inventory-owned stock periods

Pass 369 gives the existing `STOCK_PERIOD_LOCKED` error a real Module-10 owner instead of borrowing Finance fiscal periods. Inventory stock periods are Company-owned date ranges with `OPEN` or `LOCKED` status. Periods cannot overlap. Locking records actor/time evidence and prevents normal receipt, transfer, issue, return, direct adjustment and physical-count reconciliation when the movement date falls inside a locked period.

The stock-period control reuses `inventory.read` for reads and `inventory.adjust` for create/lock management under unrestricted Company scope. No Finance table or journal relation is added.

## Public repair routes

Pass 369 appends only these eight reviewed repair endpoints:

```text
GET  /api/v1/inventory/items/:id/unit-conversions
PUT  /api/v1/inventory/items/:id/unit-conversions
POST /api/v1/inventory/counts
GET  /api/v1/inventory/counts/:id
POST /api/v1/inventory/counts/:id/reconcile
GET  /api/v1/inventory/stock-periods
POST /api/v1/inventory/stock-periods
POST /api/v1/inventory/stock-periods/:id/lock
```

The existing six stable Module-10 error codes and five source domain events remain unchanged. Count reconciliation uses the existing `inventory.adjusted` event for each real variance movement rather than inventing a new source event vocabulary.

## Deferred boundary

Formal Inventory-to-Finance posting remains Stage 26 / Module 15B. Pass 369 does not create Inventory journals, AP/AR behavior, Finance fiscal-period coupling, negative-stock exceptions, receipt-tolerance policy, Warehouse delete/archive behavior, or new business modules.
