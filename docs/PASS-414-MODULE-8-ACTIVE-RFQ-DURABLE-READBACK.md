# Pass 414 — Module 8 Active RFQ Durable Readback / Unused-Hook Repair

## Purpose

Pass 414 closes cumulative audit item **A408-05** on top of the exact Pass-413 state. The Module-8 backend, browser API and TanStack Query layer already contain durable RFQ list/detail readback from the reviewed Pass-363 amendment, but the Procurement workspace did not consume the existing `useRfq()` detail hook. It kept a complete active `Rfq` object in local React state and could copy that object directly from an RFQ list row or mutation response.

This pass wires the existing detail query and removes that duplicate local business-object authority.

## Implementation boundary

Only the existing Procurement workspace changes in production.

The active workflow now keeps only `activeRfqId` in local React state. `useRfq(activeRfqId, canManageRfq)` loads the authoritative RFQ detail, and the rendered RFQ summary, Vendor invitation state and quotation-line identity use `activeRfqQuery.data`.

Opening an existing RFQ now passes only its server-owned id from the durable RFQ register. Creating an RFQ also keeps only the returned id. Issuing an RFQ no longer copies the returned RFQ object into local state; the existing mutation invalidation refreshes the detail query.

A small effect hydrates the quotation form from the durable RFQ detail only when a different RFQ id becomes active. A ref prevents same-RFQ cache refetches from unnecessarily wiping an in-progress quotation form.

## Browser reload behavior

The existing bounded RFQ register remains the recovery entry point after a browser reload:

```text
browser reload
→ Procurement workspace reloads Project RFQ register
→ user opens RFQ by id
→ useRfq(id)
→ GET /api/v1/procurement/rfqs/:id
→ active workflow uses current server detail
```

No RFQ business object is serialized to browser storage. No second RFQ cache or read endpoint is added.

## Existing contracts reused

Pass 414 reuses, byte-for-byte:

- `getRfq()` from `procurement-api.ts`;
- `useRfq()` from `hooks/procurement.ts`;
- the existing `GET /api/v1/procurement/rfqs/:id` service/route/repository path;
- existing mutation invalidation;
- existing RFQ list readback;
- existing server-owned RFQ item ids used by quotation lines.

## Deliberately unchanged

Pass 414 adds no:

- Prisma model or migration;
- backend schema, repository, service or route function;
- public endpoint;
- permission, stable error or event;
- package dependency;
- production file or folder;
- RFQ item CRUD subsystem;
- client-side RFQ persistence format;
- Purchase Order, commitment, journal or Finance behavior.

The required Module-8 five-file backend and four-file React feature structure remain unchanged.

## Browser verification asset

The existing Module-8 Playwright workflow is updated so it issues an RFQ, reloads the browser, reopens the durable RFQ from the existing register, and proves the active workflow reads the RFQ detail endpoint before continuing quotation entry. The request-boundary assertion is also updated to recognize the previously reviewed Vendor/RFQ readback routes used by the current UI.

The live browser suite remains guarded by the project's normal installed-dependency and PostgreSQL requirements and is not claimed as executed in this archive-only pass.

## Historical assertion supersession

The pre-Pass-414 assertions in Pass 408, Pass 412 and Pass 413 that expected `useRfq()` to remain unused are retained only as skipped historical evidence. The still-valid one-reference proof candidates remain active.

## Next repair

**Pass 415 — Module 19 attachment + immutable Document-version contract freeze.**
