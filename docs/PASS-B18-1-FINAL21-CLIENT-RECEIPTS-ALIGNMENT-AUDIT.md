# Pass B18.1 - Final-21 Client Receipts / Payments Alignment Audit

## Purpose

Pass B18.1 is a **non-destructive alignment audit** for Final Module 16 - Client Receipts / Payments. The previous B17 sequence froze Module 15 Client Billing. Module 16 does not yet exist as an active backend or React feature, so this pass records the exact implementation boundary before persistence is introduced.

This pass intentionally makes **no production Client Receipts implementation change and no database migration**. It verifies prerequisite readiness, confirms which source-owned values already exist, identifies the missing Module 16 contracts, and freezes the B18.2-B18.10 build sequence.

Controlling Final-21 rules used by this audit:

- Module 16 records client cash received against a Client, Project, optional Stage, and optional Client Invoice.
- A receipt may exist without an Invoice and must then remain an advance/unallocated receipt until later allocation.
- Allocating a receipt later must not rewrite the original cash history.
- Client money received is cash, **not profit by itself**.
- Outstanding equals billed minus allocated receipts; unallocated advances remain separate.
- Stage received values must avoid double counting between direct Stage attribution and Invoice allocation.
- Finance owns cash/bank accounts and accounting representation.
- Client Billing owns Client Invoices.
- Project Stages owns the Stage financial read surface but must source received values from Module 16 after it exists.
- Posting, allocation, unallocation, and reversal are explicit commands; no generic CRUD expansion is allowed.

## Baseline verification

| Check | Result | Notes |
| --- | --- | --- |
| `node --test tests/final-21*.test.mjs` | PASS | 507/507 Final-21 tests pass before the B18.1 audit test is added. |
| Current full static gate | PASS | 611/611 current Foundation + Final-21 tests pass before B18.1. |
| Module 16 backend | ABSENT BY SEQUENCE | No `apps/api/src/modules/client-receipts/` folder is registered yet. |
| Module 16 React feature | ABSENT BY SEQUENCE | No `apps/web/src/features/client-receipts/` feature exists yet. |
| Module 16 Prisma ownership | ABSENT BY SEQUENCE | No `ClientReceipt` or `ClientReceiptAllocation` model exists yet. |
| Client Billing prerequisite | READY | Client Invoice creation, Stage-aware lines, and Finance/AR posting are frozen by B17. |
| Client / Project prerequisite | READY | Client and Project ownership are Company-scoped and linked. |
| Project Stage prerequisite | READY | Stage ownership is Project-scoped; Stage financials already expose a zero-valued receipt hook for the later source. |
| Finance prerequisite | READY | Cash/Bank accounts and transaction-safe, source-keyed Finance posting exist. |
| Foundation numbering | READY | `client-receipt` is already a required Company-scoped sequence key. |
| Documents prerequisite | PARTIAL READY | Module 21 is ready for resource authorization, but `client_receipt` is not yet an allow-listed document link type. |
| Dependency-backed build / Prisma validation | NOT RUN | The archive has no installed dependencies; no dependency-backed build claim is made. |

## What is already aligned and reusable

### Module 15 Client Billing

B17 is frozen and already provides the source invoice data Module 16 needs:

- Company-owned and Project-owned Client Invoices;
- same-Client / same-Project integrity;
- Stage-aware Client Invoice lines;
- immutable issued/posted billing history;
- Finance source posting for Client Invoice receivables/revenue;
- exact Client Billing route ownership without payment routes.

Module 16 must reference these invoices rather than duplicating invoice or AR state.

### Module 4 Client Management and Module 6 Project Management

The Client and Project models already enforce Company ownership. Project owns `clientId`, so receipt creation can verify that the selected Client is the Project's Client instead of trusting browser-supplied ownership.

Client Management currently reports billed value only and explicitly marks receipt summary as unavailable. B18 will later replace that placeholder with source-derived receipt/advance/outstanding reads rather than storing balances on Client.

### Module 7 Project Stages / Progress

Project Stage already owns the Stage financial read surface. Its current service intentionally sets:

- received = `0.00`;
- outstanding = billed;

with a comment that Client Receipts is generated later in the approved sequence. This is the correct integration seam for B18.8; Module 16 should provide source-derived receipt values without storing manual Stage totals.

### Module 18 Finance & Accounting

Finance already provides:

- active Company-scoped Cash/Bank accounts;
- each Cash/Bank account linked to a GL account;
- Project/Stage dimensions on Journal lines;
- stable Company-scoped Journal source keys;
- transaction-safe `postSourceJournalInTransaction(...)` behavior;
- immutable posted Journal history with controlled reversal.

B18 should reuse this seam for receipt and reversal accounting. It must not create a second cash ledger.

### Foundation numbering / audit / outbox / idempotency

The Foundation already includes `client-receipt` in the required sequence keys. Existing modules also provide the established patterns for:

- Company-scoped numbering;
- idempotent write commands;
- request-context Company / actor / Project scope;
- audit entries;
- outbox events;
- database transactions.

B18 must reuse these patterns rather than adding module-local infrastructure.

## Missing Module 16 implementation that B18.2+ must add

### Gap 1 - Client Receipt persistence does not exist

**Severity: BLOCKING**

The active Prisma schema has no Module 16 source tables. B18.2 must add only the two required ownership records:

- `client_receipts`
- `client_receipt_allocations`

Required receipt fields include Company, Client, Project, optional Stage, receipt number/date, amount, payment method, Cash/Bank account, reference, receipt type, status, creator, and posting timestamp.

Required allocation fields include receipt, Client Invoice, amount, allocation timestamp, and allocating actor.

The migration must enforce same-Company / same-Project / same-Client ownership and optional Stage -> Project integrity. Historical migrations must not be edited.

### Gap 2 - Module 16 boundary vocabulary does not exist

**Severity: BLOCKING**

B18.3 must introduce the exact Final-21 Module 16 boundary contract.

Required permissions:

- `client_receipts.read`
- `client_receipts.create`
- `client_receipts.allocate`
- `client_receipts.reverse`

Required stable errors:

- `RECEIPT_NOT_FOUND`
- `ALLOCATION_EXCEEDS_RECEIPT`
- `ALLOCATION_EXCEEDS_INVOICE`
- `RECEIPT_SCOPE_MISMATCH`
- `RECEIPT_LOCKED`

Required six-route surface:

1. `GET /api/v1/client-receipts`
2. `POST /api/v1/client-receipts`
3. `GET /api/v1/client-receipts/:id`
4. `POST /api/v1/client-receipts/:id/allocations`
5. `POST /api/v1/client-receipts/:id/unallocate`
6. `POST /api/v1/client-receipts/:id/reverse`

No generic update/delete endpoint should be added for posted receipts or allocations.

### Gap 3 - Receipt repository does not exist

**Severity: BLOCKING**

B18.4 must add the five-file backend module and keep repository behavior limited to persistence / scoped reads. Repository responsibilities should include:

- scoped Client / Project / Stage / Invoice lookup;
- scoped Cash/Bank lookup;
- receipt create/read/list;
- allocation create/read/reverse support;
- sum allocated amount by receipt;
- sum allocated amount by invoice;
- invoice outstanding source reads;
- row locks required for concurrent allocation/reversal safety.

Allocation calculations and accounting policy belong in the service, not repository helpers.

### Gap 4 - Receipt cash posting and advance treatment do not exist

**Severity: CRITICAL**

B18.5 must create/post a Client Receipt atomically with Finance.

At minimum the service must:

- derive Company / actor / Project scope server-side;
- verify Client -> Project ownership;
- verify optional Stage -> Project ownership;
- require an active Company Cash/Bank account;
- allocate a Company-scoped `client-receipt` number;
- preserve the original amount/date/method/reference after posting;
- post one idempotent Finance source effect with a stable source key;
- keep unallocated money as client advance/unapplied cash rather than revenue/profit.

The exact GL account mapping for unallocated Client advances must be explicit and validated. B18 must not invent profit from cash receipt.

### Gap 5 - Invoice allocation, unallocation, and outstanding logic do not exist

**Severity: CRITICAL**

B18.6 must implement allocation commands with concurrency-safe locking and precise decimal arithmetic.

Rules:

- total allocations cannot exceed the receipt amount;
- allocation cannot exceed the target Client Invoice outstanding;
- Invoice must belong to the same Company / Client / Project;
- original receipt history remains unchanged;
- allocation later may move accounting from Client Advance / Unapplied to Client Receivable according to Finance policy without creating a second cash receipt;
- unallocation must be a controlled compensating action, not deletion of cash history;
- a posted receipt reversal must reverse both Finance effect and allocation state safely and idempotently.

### Gap 6 - Module 16 HTTP / OpenAPI does not exist

**Severity: HIGH**

B18.7 must publish exactly the six required routes with:

- authentication;
- permission and Project-scope checks;
- Zod params/query/body contracts;
- idempotency headers for commands;
- bounded list filters;
- complete success/error OpenAPI schemas;
- stable error codes.

### Gap 7 - Cross-module receipt read models are intentionally incomplete

**Severity: HIGH**

B18.8 must wire source-derived receipt information into existing consumers without duplicating source-of-truth values.

Required integration proofs include:

- Stage billed remains sourced from Client Invoice lines;
- Stage received is sourced from Client Receipts/allocations without double counting direct Stage tags plus Invoice allocations;
- Stage outstanding = Stage billed - allocated Stage receipts;
- Project/Client billed, received, advance/unallocated and outstanding remain distinct;
- Finance cash history and Client Receipt history reconcile;
- Client cash receipt never becomes Project profit merely because cash moved.

### Gap 8 - Module 21 does not yet allow `client_receipt` links

**Severity: MEDIUM**

Module 21 currently supports the already-built owner resource types but does not yet allow `client_receipt`. B18.8 should extend the existing Documents authorization seam after Client Receipt persistence exists. It must not add file-storage code inside Module 16.

### Gap 9 - React Client Receipts feature does not exist

**Severity: HIGH**

B18.9 should create exactly the required React feature structure:

- `api/`
- `hooks/`
- `components/`
- `pages/`

Required UI behavior:

- receipt register;
- new receipt form;
- Project and optional Stage selector;
- Cash/Bank account selector;
- optional Invoice allocation;
- advance/unallocated balance;
- allocation/unallocation action;
- controlled reversal;
- Client/Project payment history.

TanStack Query owns server state. React Hook Form + Zod handle forms. The UI must not calculate authoritative outstanding or profit values independently of the API.

## Frozen B18 implementation sequence

### B18.2 - Persistence integrity

Add `ClientReceipt` and `ClientReceiptAllocation` Prisma models, relations, indexes, permission seed migration, and fail-closed Company/Client/Project/Stage/Invoice/CashBank ownership constraints. Use one forward migration only.

### B18.3 - Zod / boundary contract

Add exact permissions, stable errors, exact six routes, request/response schemas, payment method / receipt type / lifecycle values, pagination, decimal/date normalization, and server-owned fields.

### B18.4 - Repository

Add scoped repository reads/writes, Invoice outstanding reads, receipt/allocation totals, Finance/CashBank lookup support, and row locks for allocation concurrency. Keep calculations out of repository code.

### B18.5 - Receipt posting service + Finance cash effect

Implement receipt creation/posting, Company/Project/Stage/Client checks, numbering, Cash/Bank validation, advance/unallocated treatment, Finance posting, idempotency, audit, and outbox in one transaction.

### B18.6 - Allocation / unallocation / reversal

Implement partial/multi-step allocation, receipt and Invoice limit checks, controlled unallocation, receipt reversal, Finance compensating entries, immutable cash history, and concurrency/idempotency protection.

### B18.7 - HTTP / OpenAPI

Register exactly six routes with auth, RBAC/Project scope, Zod parsing, idempotency headers, complete response/error schemas, and stable operation IDs.

### B18.8 - Cross-module reconciliation + Documents

Wire Stage/Client/Project received/advance/outstanding source reads, extend Module 21 for `client_receipt`, and prove no double counting across direct Stage tags and Invoice allocation.

### B18.9 - React

Build the four-folder Client Receipts feature, real Project/Stage/Invoice/CashBank selectors, receipt register/detail/allocation/reversal UX, and source-derived financial summaries.

### B18.10 - Integration / E2E / freeze

Run repository/service/Fastify.inject, negative permission, cross-Company, Project-scope, allocation concurrency, Finance rollback/idempotency, OpenAPI, Prisma, TypeScript, Vite, and Playwright gates. Freeze Module 16 only when all current Final-21 gates are green.

## B18.1 exit decision

**READY FOR B18.2.**

The absence of Client Receipts production code is expected at this sequence point. All hard prerequisites are present, and the current code contains explicit integration seams for the new source. B18.2 may now introduce Module 16 persistence without changing the already-frozen Module 15 ownership model.
