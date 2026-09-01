# Pass B18.2 - Final-21 Client Receipts Persistence Integrity

## Purpose

B18.2 adds only the persistence boundary for Final Module 16 - Client Receipts / Payments. The module runtime remains deliberately deferred.

The persistence contract keeps receipt cash separate from profit and does not store derived balances such as outstanding, advance, received totals, or profitability. Those values will be derived from posted receipts, allocations, Client Billing and Finance in later B18 passes.

## Changes

- Added the required `ClientReceipt` Prisma model mapped to `client_receipts`.
- Added the required `ClientReceiptAllocation` Prisma model mapped to `client_receipt_allocations`.
- Added a Project composite owner key so one receipt can prove that its Project belongs to the same Company and Client.
- Enforced receipt ownership with database relations for:
  - Company;
  - Client within Company;
  - Project within Company + Client;
  - optional Stage within Project;
  - Cash/Bank account within Company;
  - creator within Company.
- Kept allocation ownership compact. `client_receipt_allocations` does not duplicate Company, Client, Project, Stage or financial-balance columns.
- Added one allocation scope trigger that rejects an Invoice from another Company, Client or Project and rejects an allocating actor from another Company.
- Added positive-money and non-blank persistence checks plus Company-scoped receipt-number uniqueness.
- Added bounded indexes for Project, Client, Stage, Cash/Bank, creator, Receipt allocation and Invoice allocation reads.
- Seeded exactly the four frozen Module 16 permissions and assigned them to active system administrators using the existing Administration policy.
- Added one forward migration only. Historical migrations remain unchanged.

## Source-of-truth boundaries

B18.2 does not introduce a second AR ledger, cash ledger, outstanding balance, advance balance or profit value.

- Client Billing continues to own Client Invoices and billed values.
- Finance continues to own Cash/Bank accounts and accounting representation.
- Project Stages continues to own Stage identity.
- Module 16 now owns only receipt and allocation persistence.
- Allocation limits, invoice outstanding calculations, receipt posting, unallocation and reversal remain service responsibilities in later passes.

## Deferred runtime work

This pass intentionally **does not add the backend module, routes, services, repositories, or React feature**.

It also does not yet:

- define Zod request/response contracts;
- freeze receipt/payment-method/status boundary vocabularies beyond persistence strings;
- create/post receipt Finance journals;
- calculate unallocated/advance balances;
- allocate or unallocate Client Invoices;
- reverse posted receipts;
- expose Module 21 `client_receipt` document linking;
- replace Stage/Client receipt read placeholders.

## Migration safety

The new receipt tables have no legacy rows to guess or rewrite. Ownership therefore fails closed at write time through composite foreign keys and the allocation scope trigger. The migration contains no `DELETE`, `TRUNCATE`, or table-drop operation.

## Next pass

**B18.3 - Client Receipts boundary contract alignment:** add the exact Zod request/response schemas, stable error/permission vocabulary and six-route catalog while keeping repository, service, route registration and React behavior deferred.
