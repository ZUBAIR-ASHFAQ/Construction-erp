# Pass B18.5 - Final-21 Client Receipt Creation + Finance Posting

## Purpose

B18.5 implements the first executable business command for Final Module 16: create/post one Client Receipt atomically with Finance while preserving the Final-21 distinction between cash received, invoice allocation, revenue and profit.

## Business rule implemented

A newly posted Client Receipt is cash history. Until a later B18.6 allocation applies that cash to a Client Invoice, the amount remains unapplied Client advance cash. Receipt creation therefore does **not** reduce Client Receivable and does **not** create revenue or profit.

The Finance mapping is explicit:

- debit the selected Cash/Bank account's active `ASSET` GL account;
- credit the Company GL account with stable code `CLIENT-ADVANCE`;
- require `CLIENT-ADVANCE` to be an active `LIABILITY` account.

B18.5 deliberately validates this configuration rather than auto-creating or guessing a Finance account. B18.6 will reclassify allocated amounts from Client Advance / Unapplied to Client Receivable without creating a second cash movement.

## Service orchestration

`ClientReceiptsService.createClientReceipt()` now:

1. executes through Foundation `executeIdempotentCommand()` using operation `client-receipts.create`;
2. derives Company, actor and Project scope from authenticated request context;
3. requires `client_receipts.create` at Company or Project scope;
4. validates Client -> Project ownership;
5. validates optional Stage -> Project ownership;
6. validates the selected active Cash/Bank account, payment-method match and active mapped asset GL;
7. validates the active `CLIENT-ADVANCE` liability account;
8. allocates a Company-scoped `client-receipt` number;
9. persists one immutable `POSTED` Client Receipt;
10. posts the balanced Finance Journal inside the same transaction with source key `client_receipt:<receiptId>`;
11. records `client_receipt.posted` audit evidence and outbox event;
12. completes the idempotency replay record in the same transaction.

Any validation or Finance posting failure rolls back the Receipt, Journal, audit, outbox and idempotency completion together.

## Receipt type note

Both `ADVANCE` and `INVOICE_PAYMENT` remain valid receipt classifications from B18.3, but neither classification is used as a shortcut for AR accounting. The persisted allocation rows are authoritative for whether cash has actually been applied to an Invoice. This prevents an `INVOICE_PAYMENT` label from reducing AR before the B18.6 allocation command succeeds.

## Repository extension

B18.5 adds one small repository lookup only because the service needs an explicit Company-owned Client Advance Finance mapping:

- `findGlAccountByCode(accountCode)`

No Journal persistence is duplicated in Client Receipts. Finance remains the owner of balanced Journal creation and posting-period validation.

## No schema, route or frontend expansion

B18.5 adds no Prisma model or migration. Historical migrations are unchanged. The six Module 16 public routes remain unpublished until B18.7, and the React feature remains deferred to B18.9.

Allocation, unallocation and receipt reversal are intentionally not implemented here.

## Next pass

**B18.6 - Invoice allocation, unallocation and receipt reversal:** add concurrency-safe allocation limits, Client Advance -> Client Receivable reclassification, controlled unallocation compensation, and full receipt reversal without rewriting original cash history.

## Verification hygiene

The cumulative Final-21 static suite previously contained one R3 regression assertion that read a generated `packages/contracts/dist/financial-posting.js` file. Source archives intentionally do not carry generated `dist` output, so that assertion could fail even when the source contract was correct. B18.5 narrows that old regression to the authoritative `packages/contracts/src/financial-posting.ts` source; dependency-backed build output remains the responsibility of the separate R2 toolchain gate.
