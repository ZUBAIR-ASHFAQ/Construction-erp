# Pass 413 — Module 10 Durable Inventory Count UI Readback

## Purpose

Pass 413 closes cumulative audit item **A408-04** without changing the accepted Module-10 backend contract. The backend already owned a durable physical-count detail read through `GET /api/v1/inventory/counts/:id`, the typed browser API already exposed `getInventoryCount()`, and the TanStack Query layer already exposed `useInventoryCount()`. The remaining defect was only that `PhysicalInventoryCount` copied the freshly created server object into component-local state.

## Repair

The Inventory workspace now stores only the selected physical-count **identifier** in session storage and uses the existing `useInventoryCount()` query as the durable owner of count status, lines and reconciliation evidence.

The flow is now:

```text
Capture count
→ existing POST /api/v1/inventory/counts
→ remember returned count ID only
→ existing useInventoryCount(countId)
→ existing GET /api/v1/inventory/counts/:id
→ render durable server state

Navigation / browser refresh
→ restore selected count ID from session storage
→ existing useInventoryCount(countId)
→ reload the server record

Reconcile
→ existing POST /api/v1/inventory/counts/:id/reconcile
→ existing Module-10 query invalidation
→ selected count detail refetches from the server
```

No `InventoryCount` object is copied into `useState` or serialized into browser storage.

## Recovery behavior

If a remembered identifier is no longer readable under the current user's Inventory scope, the existing normalized API error is shown and the user can clear the selected identifier. This avoids creating a second lookup form, route or count subsystem.

## Deliberately unchanged

Pass 413 does not change:

- `inventory-api.ts`;
- `hooks/inventory.ts`;
- any Module-10 backend schema/repository/service/route/index file;
- Prisma models or migrations;
- permissions, stable errors or events;
- Inventory count persistence/reconciliation rules;
- Module-10 route count;
- package dependencies;
- folder structure.

The only production behavior change is inside the existing Inventory workspace component.

## Browser verification asset

The existing Module-10 Playwright workflow is extended to create a no-variance physical count, verify that only the count ID is remembered, reload the browser, reopen Inventory, prove the durable count is read back as `DRAFT`, reconcile it, and prove the server-backed view becomes `RECONCILED`. The live browser suite remains guarded by the project's existing dependency/database runtime requirements.

## Historical test supersession

Pass-408 and Pass-412 contained intentional pre-Pass-413 assertions that `useInventoryCount()` was not yet consumed. Only those now-obsolete Inventory-specific assertions are retained as skipped historical evidence. The still-pending Pass-414 RFQ readback assertion remains active.

## Next repair

**Pass 414 — Module 8 active RFQ durable readback / unused-hook repair.**
