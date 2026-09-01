# Pass B18.6 - Final-21 Client Receipt Allocation, Unallocation and Reversal

## Purpose

B18.6 completes the three remaining Module 16 service commands before HTTP publication: allocate posted Client Receipt cash to an issued Client Invoice, reverse one permitted allocation, and reverse one fully unallocated posted Client Receipt.

## Allocation behavior

`ClientReceiptsService.allocateClientReceipt()` runs through Foundation idempotency with operation `client-receipts.allocate`. Inside one transaction it:

1. resolves the authenticated Company/Project permission scope for `client_receipts.allocate`;
2. locks the Client Receipt `FOR UPDATE`;
3. rejects missing or already-reversed receipts;
4. locks the target Client Invoice `FOR UPDATE` and requires the same Client and Project;
5. requires the invoice to be `ISSUED`;
6. derives the receipt's remaining unallocated amount;
7. derives the invoice's remaining outstanding amount;
8. rejects allocation above either remaining side;
9. when the Receipt is Stage-tagged, requires the Invoice to contain that Stage and prevents Stage-tagged allocations from exceeding the Stage's billed invoice-line value;
10. appends one allocation row;
11. posts the Finance reclassification in the same transaction;
12. records `client_receipt.allocated` audit and outbox evidence.

Allocation does not create a second Cash/Bank movement. The Finance mapping is:

- debit `CLIENT-ADVANCE` (active liability);
- credit `CLIENT-RECEIVABLE` (active asset).

This moves already-received cash from unapplied Client Advance into AR settlement without treating cash as revenue or profit.

The stable Finance source key is `client_receipt_allocation:<allocationId>`. After posting, the service re-reads the source Journal and verifies source ownership, posted status, and balanced total amount before the transaction can complete.

## Controlled unallocation

`ClientReceiptsService.unallocateClientReceipt()` uses `client_receipts.allocate` permission because it changes allocation state rather than the original Receipt.

The command locks the Receipt and Invoice, verifies the selected allocation belongs to the Receipt, requires the original posted allocation Journal, then writes a compensating Journal using the exact opposite of the original allocation lines. Only after the compensating Finance entry succeeds does the service remove the active allocation link.

The original Client Receipt is never rewritten. Append-only Audit/Outbox evidence preserves the controlled change:

- `client_receipt.allocation_reversed`

The stable compensating Finance source key is `client_receipt_allocation_reversal:<allocationId>`, with the same source-ownership and amount verification before the active link is removed.

## Controlled receipt reversal

`ClientReceiptsService.reverseClientReceipt()` runs through idempotency operation `client-receipts.reverse` and requires `client_receipts.reverse`.

A Receipt may be reversed only while it is `POSTED` and has zero active allocations. Allocated receipts must be explicitly unallocated first so AR and Client Advance remain reconciled.

The service requires the original posted `client_receipt:<receiptId>` Journal, posts its exact opposite under `client_receipt_reversal:<receiptId>`, verifies the compensating source Journal, then changes only the Receipt lifecycle state from `POSTED` to `REVERSED`.

Receipt amount, date, reference, Cash/Bank identity and original Finance Journal remain historical facts; no posted cash history is deleted or overwritten.

The required event is:

- `client_receipt.reversed`

## Concurrency and reconciliation

Receipt and Invoice rows are locked before balance checks so two concurrent allocations cannot both consume the same remaining Receipt or Invoice amount. Allocation totals are always derived from persisted active allocation rows. No receipt balance, advance balance, outstanding balance or profit total is stored on the Receipt.

## Scope intentionally deferred

B18.6 does not publish HTTP routes, add React UI, add Module 21 `client_receipt` links or add any Prisma migration. The exact six Module 16 routes remain reserved for B18.7.

## Next pass

**B18.7 - Client Receipts Fastify routes and OpenAPI:** publish exactly the six required endpoints with Zod boundaries, bearer authentication, idempotency headers, permissions, stable errors and documented response envelopes.
