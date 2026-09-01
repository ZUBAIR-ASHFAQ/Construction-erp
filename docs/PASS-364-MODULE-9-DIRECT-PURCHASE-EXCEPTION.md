# Pass 364 — Module 9 Direct Purchase Exception Workflow

## Baseline

Pass 364 is implemented on the exact verified Pass-363 archive. It closes only frozen repair item **M9-01** from Pass 358.

The source-defined Purchase Order workflow allows a draft PO to originate from either a selected RFQ/quotation or an approved direct-purchase exception. The source also explicitly requires direct-purchase bypass to have **permission and reason**. This pass implements only that missing exception path and preserves the existing Module-9 lifecycle.

## Frozen Pass-364 contract

The existing command remains authoritative:

```text
POST /api/v1/purchase-orders
```

No separate direct-purchase route is introduced.

A new PO has exactly one source:

```text
Quotation-backed
quotationId = UUID
directPurchaseReason = null

OR

Direct-purchase exception
quotationId = null
directPurchaseReason = required nonblank text
```

PostgreSQL enforces this source XOR invariant.

## Authority

The six original Module-9 permissions remain unchanged. Pass 364 adds only the source-required exception authority:

```text
purchase_orders.direct_purchase
```

The permission is registered by migration but is **not automatically assigned to any role**.

A direct-purchase PO therefore requires both the normal command permission and the direct-purchase exception permission. Project scope remains server-derived through the existing Module-24B authorization boundary.

## Vendor and commercial validation

Direct purchase does not bypass ordinary Purchase Order safety checks. The server still requires:

- a writable authorized Project;
- a frozen Project Budget;
- an active and qualified Module-8 Vendor;
- valid active WBS / Cost Code / Cost Type combinations;
- server-calculated line totals, tax, subtotal and total;
- normal Module-22 Purchase Order approval before issue.

The selected-quotation total comparison applies only to quotation-backed POs because a direct purchase has no selected quotation to compare against.

## Durable evidence

`purchase_orders` gains only:

```text
direct_purchase_reason text nullable
```

The database guarantees that quotation-backed POs have no direct-purchase reason and quotation-less POs have one.

Historical quotation-less rows are backfilled with a truthful migration marker stating that the original reason was not captured before Pass 364. The migration does not invent a historical business reason.

Audit/approval snapshots carry the persisted reason and the server-derived source classification:

```text
QUOTATION
DIRECT_PURCHASE
```

No new business event is added. The existing Purchase Order events remain authoritative.

## Draft-edit protection

A PO cannot silently switch source identity after creation:

```text
quotation-backed -> direct purchase   rejected
direct purchase -> quotation-backed   rejected
```

A direct-purchase reason may be updated while the PO is still in the reviewed editable lifecycle, but the server rechecks direct-purchase authority and Vendor eligibility.

## React behavior

The existing Purchase Order editor gains a Procurement Source selector. The Direct Purchase option appears only when the current identity has `purchase_orders.direct_purchase` authority. Direct mode requires the exception reason and does not request a quotation UUID.

No new React feature directory, alternate form system or parallel state manager is introduced.

## Deliberate deferrals

Pass 364 does not implement:

- revision-line historical snapshots;
- durable cancellation reason/actor/time readback;
- Inventory receipt behavior;
- supplier AP / Finance posting;
- Stage-26 Finance source adapters;
- Stage-27 cross-module integration completion;
- a tax/FX engine;
- a generic exception framework.

The first two remain the reviewed scope of Pass 365. Finance and integration work remain at their corrected later stages.

## Migration

```text
20260826000600_module_9_direct_purchase_exception
```

Migration effects:

```text
new tables:       0
new columns:      1
new permissions:  1
role grants:       0
new events:        0
new public routes: 0
```

## Verification intent

Pass 364 verifies that:

- the eight Module-9 source routes remain eight;
- direct Purchase Order creation requires a persisted reason;
- direct Purchase Order creation requires explicit Project-scoped exception authority;
- only active/qualified Vendors can be used;
- source identity cannot be switched during edit;
- normal approval remains mandatory before issue;
- migration constraints protect the source invariant;
- API and browser scenarios cover the exception path;
- every named production function keeps a short purpose comment;
- Stage-26 and Stage-27 work remains deferred.
