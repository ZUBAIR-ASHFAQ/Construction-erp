# Pass 368 — Module 10 Warehouse Management, Stock Ledger and Low Stock

Pass 368 closes frozen repair items **M10-01** and **M10-02** on top of the exact Pass-367 baseline. It does not reopen the original Stage-15 source contract or pull Stage-26/27 Finance work forward.

## Reviewed repair boundary

The original eight Module-10 source operations remain unchanged. Pass 368 adds exactly six reviewed repair operations:

```text
GET   /api/v1/inventory/warehouses
POST  /api/v1/inventory/warehouses
PATCH /api/v1/inventory/warehouses/:id
GET   /api/v1/inventory/stock-ledger
PUT   /api/v1/inventory/balances/minimum-stock
GET   /api/v1/inventory/low-stock
```

The repair reuses the source-owned `warehouses`, `inventory_balances` and `stock_transactions` resources. No Warehouse lifecycle table, stock-ledger shadow table, low-stock alert table, manager layer or generic CRUD subsystem is added.

## Warehouse/site-store master

Warehouse reads use persisted `inventory.read` Company/Project policy. Warehouse create/update reuse `inventory.item.manage`.

Create accepts only:

```text
projectId optional
code
name
location
```

Status is server-owned and starts `ACTIVE`. Update accepts only code, name and location. Project ownership, lifecycle status, delete/archive and reassignment remain outside this repair because the source does not define those transitions.

## Minimum stock and truthful low-stock read

One nullable `DECIMAL(18,4)` field is added to `inventory_balances`:

```text
minimum_stock_quantity
```

`NULL` disables monitoring for that Warehouse/Item pair. Configured values must be non-negative.

The low-stock predicate is deliberately limited to:

```text
minimum_stock_quantity IS NOT NULL
AND quantity_on_hand <= minimum_stock_quantity
```

Reserved quantity is returned for visibility but is not subtracted because the source does not define that policy. No reorder quantity, preferred supplier, automatic replenishment or low-stock event is invented.

## Stock ledger

`GET /api/v1/inventory/stock-ledger` is a bounded read over existing append-only `stock_transactions`. It supports optional Warehouse and Item filters and returns source identity, exact quantity/unit cost, occurrence time and authorized Warehouse/Item labels.

No stock-transaction update/delete route is added. Existing correction semantics remain reversing/adjustment transactions.

## Audit and events

Warehouse create/update and minimum-stock changes write Foundation audit records. Read operations do not create audit/outbox records.

The reviewed five Module-10 domain events remain unchanged:

```text
inventory.received
inventory.transferred
inventory.issued
inventory.returned
inventory.adjusted
```

## Deferred boundary

Pass 368 intentionally does not implement:

```text
UOM conversion
stock-count/reconciliation sessions
receipt-tolerance policy expansion
negative-stock policy expansion
return-direction / dedicated return-permission redesign
Inventory-owned stock-period policy
formal Inventory → Finance adapter
```

Those remain for Pass 369 or Stage 26/27 according to the Pass-358 repair contract.
