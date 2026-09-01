# Pass 362 — Module 8 RFQ Item Relational Integrity

## Purpose

Pass 362 repairs only **M8-01** from the Pass-358 Stage-0→23 repair contract: `supplier_quotation_items.rfq_item_id` was required by the Module-8 source contract but had no relational target.

This is a post-Stage-23 integrity repair on top of Pass 361. It does **not** start Vendor-master management/readback, Module 9 Direct Purchase, Stage 24, Stage 26 Finance source adapters or Stage 27 cross-module completion.

## Persistence amendment

Pass 362 adds one Module-8-owned support table:

```text
rfq_items
  id
  rfq_id
  requisition_item_id nullable
  description
  quantity
  unit
```

The table is a durable RFQ line snapshot. It is not a new catalog or business module.

An RFQ created from a Purchase Requisition snapshots the source requisition lines and preserves `requisition_item_id`. A direct RFQ provides description, quantity and unit through the already-existing `POST /api/v1/procurement/rfqs` operation, so every RFQ receives real line identities without introducing a separate RFQ-item route.

`supplier_quotation_items.rfq_item_id` now has a real foreign key to `rfq_items.id`.

## Migration safety

Migration `20260826000500_module_8_rfq_item_relational_integrity`:

1. creates `rfq_items` with positive-quantity and nonblank-description/unit checks;
2. preserves historical quotation identity through an RFQ-scoped backfill map;
3. reuses an old UUID only when it was unique to one RFQ, otherwise allocates a safe replacement UUID;
4. links a historical line to a requisition item only when that item belongs to the RFQ's own source requisition;
5. snapshots requisition lines for existing requisition-backed RFQs that had no quotation history;
6. activates the direct quotation-line foreign key;
7. adds database triggers preventing cross-RFQ quotation lines and invalid requisition-item scope.

No existing Stage-13 migration is rewritten.

## Application behavior

The existing RFQ response now includes its line snapshot:

```text
items[]
  id
  rfqId
  requisitionItemId nullable
  description
  quantity
  unit
```

Quotation entry continues to use `rfqItemId`, but the service now verifies that every supplied line belongs to the exact RFQ being quoted. Duplicate line identities or foreign RFQ line identities fail through the existing `QUOTATION_INVALID` boundary.

RFQ issue also refuses an RFQ with no persisted lines.

## Scope boundary

```text
Business modules added:       0
Prisma models added:          1 support model
Database tables added:        1 support table
Migrations added:             1
Public routes added:          0
Existing route bodies widened:1 (RFQ create direct-line source)
Permissions added:            0
Stable errors added:          0
Domain events added:          0
RFQ-item CRUD routes added:   0
```

Pass 362 deliberately does not add Vendor CRUD, RFQ list/detail routes, requisition revision commands, FX/scoring logic, Purchase Order conversion, commitments, journals or payables.

## Verification intent

The focused and cumulative gates prove that:

- exactly one support table and one append-only migration are added;
- historical opaque quotation-line IDs are migrated before the FK is activated;
- every quotation line has a real RFQ-owned target;
- requisition-derived RFQ items cannot point to another requisition;
- quotation lines cannot point to another RFQ;
- service/repository validation mirrors the database constraints;
- the existing eight Module-8 public routes remain eight;
- React uses RFQ response line IDs rather than inventing a lookup route;
- no new permission, stable error or domain event is introduced;
- Module-8 selection remains pre-commitment and Stage-26/27 deferrals stay frozen.
