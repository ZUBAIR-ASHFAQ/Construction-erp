# Pass B18.3 - Final-21 Client Receipts Boundary Contract

## Purpose

B18.3 adds the API boundary vocabulary and Zod contracts for Final Module 16 - Client Receipts / Payments. Persistence was introduced in B18.2; repository, service, HTTP registration, Finance posting and React behavior remain deliberately deferred.

This pass follows the Final-21 rules that a Client Receipt may exist without an Invoice as advance/unallocated cash, may later be allocated without rewriting the original cash history, must keep cash separate from profit, and must use explicit allocation, unallocation and reversal commands rather than generic CRUD.

## Changes

Added `apps/api/src/modules/client-receipts/client-receipts.schema.ts` with:

- exactly four Module 16 permissions;
- exactly five stable public business error codes;
- exactly six required HTTP route descriptors;
- strict request schemas for list, create/post, allocate, unallocate and reverse operations;
- strict response schemas for receipts, allocations and bounded list responses;
- exact positive/non-negative decimal-string validation;
- real calendar-date validation and bounded date windows;
- bounded pagination with a maximum page size of 100;
- explicit server-owned ownership, numbering, status, posting and derived-total fields;
- one stable error mapper using the shared project error envelope.

## Boundary vocabulary

### Payment method

The runtime boundary uses:

- `CASH`
- `BANK`

This mirrors the existing Finance Cash/Bank ownership model. The Final-21 document explicitly models receipt money through a Cash/Bank account and gives `Bank` as the canonical random-payment method. `CASH` is the matching Finance-owned cash path already used across the current Final-21 implementation.

### Receipt type

The runtime boundary uses:

- `ADVANCE`
- `INVOICE_PAYMENT`

`ADVANCE` maps directly to the Final-21 advance/unallocated receipt scenario. `INVOICE_PAYMENT` is the code-level enum spelling for the document's invoice-payment flow. Classification never replaces allocation: AR is reduced only by a valid allocation command.

### Receipt status

The runtime boundary uses:

- `POSTED`
- `REVERSED`

There is no draft update lifecycle in Module 16. `POST /api/v1/client-receipts` is the create/post command, and a posted receipt is corrected only through the explicit reversal command.

## Exact HTTP surface

B18.3 freezes the required six-route catalog but does not register routes yet:

1. `GET /api/v1/client-receipts`
2. `POST /api/v1/client-receipts`
3. `GET /api/v1/client-receipts/:id`
4. `POST /api/v1/client-receipts/:id/allocations`
5. `POST /api/v1/client-receipts/:id/unallocate`
6. `POST /api/v1/client-receipts/:id/reverse`

No generic PATCH, PUT or DELETE receipt route is introduced.

## Request ownership

Receipt creation accepts only business inputs needed to identify the source cash event:

- Client;
- Project;
- optional Stage;
- receipt date;
- positive amount;
- payment method;
- Finance-owned Cash/Bank account;
- optional reference;
- receipt type.

The browser cannot submit authoritative Company, actor, permission scope, receipt number, status, posting metadata, allocation metadata, derived allocation totals, Invoice outstanding, or Finance source identity.

Invoice allocation is a separate command containing only:

- `clientInvoiceId`;
- positive allocation amount.

Unallocation identifies one persisted allocation by `allocationId`. Receipt reversal is a bodyless explicit command so accounting ownership remains server-derived.

## Response ownership

Receipt responses expose source values plus derived allocation totals:

- receipt source data;
- persisted allocation rows;
- `allocatedAmount`;
- `unallocatedAmount`.

These totals are response/read-model values only. B18.3 does not add derived balance columns to Prisma and does not treat Client cash as profit.

## Intermediate folder state

The global generation sequence requires the boundary schema before repository/service/routes generation. Therefore B18.3 intentionally creates only:

`apps/api/src/modules/client-receipts/client-receipts.schema.ts`

The existing completed modules keep their approved five-file shape. Client Receipts becomes a complete five-file backend module in B18.4. No React feature is created until B18.9.

## Explicitly deferred

B18.3 does not add a repository, service, routes, route registration, React feature, or migration.

It does not yet implement:

- Client/Project/Stage/CashBank scoped repository reads;
- Invoice outstanding reads;
- row locks;
- receipt numbering;
- Finance cash/advance posting;
- allocation limits;
- unallocation accounting;
- receipt reversal accounting;
- audit/outbox events;
- Module 21 `client_receipt` links;
- Stage/Client/Project received/outstanding integration.

## Next pass

**B18.4 - Client Receipts repository completion:** complete the five-file backend module shape and add only scoped persistence/read/locking operations required by the later service passes. Business calculations and Finance policy remain out of the repository.
