# Pass 365 — Module 9 Exact Revision History + Durable Cancellation Evidence

## Baseline

Pass 365 is implemented on the exact verified Pass-364 archive. It closes frozen repair items **M9-02** and **M9-03** only.

## Revision-history repair

The source requires controlled PO revision history and preservation of line/rate changes without destroying issued history. Pass 365 adds one small support table:

```text
purchase_order_revision_items
```

Every controlled revision stores immutable line snapshots for both states:

```text
BEFORE
AFTER
```

Each snapshot preserves line order and the exact decimal commercial/cost-coding values needed to reconstruct the revision. The service writes the header and snapshots in the existing revision transaction. Existing historical revisions are recovered from Foundation audit before/after payloads when those records contain the required line data.

No revision-item CRUD route exists.

## Cancellation evidence repair

`purchase_orders` gains:

```text
cancel_reason
cancelled_at
cancelled_by
```

Cancellation still uses the existing `POST /api/v1/purchase-orders/:id/cancel` command and the existing `purchase_orders.revise` authority because the source defines no dedicated cancellation permission.

A new cancellation transition atomically persists:

```text
status = CANCELLED
reason
actor
timestamp
remaining commitment = 0
```

PostgreSQL requires complete evidence for new cancellation transitions, validates same-Company actor scope and prevents later rewriting of cancellation evidence.

Existing cancelled rows recover their evidence from Foundation audit history where possible. The migration does not invent an actor or timestamp when those facts are unavailable.

## Readback

The existing detail route remains authoritative:

```text
GET /api/v1/purchase-orders/:id
```

It now returns cancellation evidence and each revision's immutable line snapshots. The React workspace exposes those snapshots under the controlled revision history and shows a read-only cancellation-evidence card after cancellation.

## Scope boundary

Pass 365 adds no public route, no permission, no business event, no business module and no Finance/Inventory write. The source's tax/rounding and issued-PO FX repricing gap remains policy-required. Stage-26 Finance adapters and Stage-27 cross-module completion remain deferred.

## Migration

```text
20260826000700_module_9_revision_history_cancellation_evidence
```

Expected effects:

```text
new support tables: 1
new PO columns:     3
new public routes:  0
new permissions:    0
new stable errors:  0
new domain events:  0
```
