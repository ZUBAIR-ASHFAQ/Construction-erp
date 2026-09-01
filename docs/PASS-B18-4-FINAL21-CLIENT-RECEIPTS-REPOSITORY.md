# Pass B18.4 - Final-21 Client Receipts Repository

## Purpose

B18.4 completes the required five-file backend folder for Final Module 16 and adds only the Company/Project-scoped persistence operations needed by the later Client Receipt service passes. Business calculations, Finance posting, permissions, audit/outbox orchestration, Fastify handlers and React remain outside the repository.

## Production changes

Added `client-receipts.repository.ts` with transaction-capable access through `DatabaseClient | TransactionClient` and mandatory `requireCompanyRepositoryScope()` ownership.

The repository now provides:

- bounded Client Receipt list/detail reads under resolved Project scope;
- same-Company Client lookup;
- Client-owned Project lookup under trusted Project scope;
- optional same-Project Stage lookup;
- same-Company Cash/Bank lookup including its Finance GL account;
- Client Invoice lookup constrained to the same Client, Project, Company and Project scope;
- server-numbered POSTED receipt persistence for the later atomic create/post service;
- Client Receipt `FOR UPDATE` locking;
- Client Invoice `FOR UPDATE` locking for race-safe allocation-limit checks;
- source allocation totals for a Receipt and Invoice;
- allocation lookup and append persistence;
- controlled allocation removal persistence after service-owned reversal evidence is recorded;
- controlled `POSTED -> REVERSED` receipt state persistence.

## Five-file module shape

`apps/api/src/modules/client-receipts/` now contains exactly:

- `client-receipts.routes.ts`
- `client-receipts.service.ts`
- `client-receipts.repository.ts`
- `client-receipts.schema.ts`
- `index.ts`

The service and routes files are deliberately tiny dependency-contract files in B18.4. They contain no business command and register no endpoint. This avoids fake or incomplete runtime behavior while bringing the backend folder to the required architecture before the dedicated service and HTTP passes.

## Business logic intentionally excluded

The repository does not decide:

- whether a Client/Project/Stage/Cash-Bank record is business-active;
- whether a receipt is an advance or invoice payment according to workflow state;
- available receipt amount;
- Client Invoice outstanding amount;
- allocation overrun errors;
- accounting debit/credit policy;
- AR versus client-advance account choice;
- whether an allocation may be unallocated;
- whether a posted Receipt may be reversed.

Those are service rules in B18.5/B18.6.

## Finance ownership

B18.4 does not duplicate Journal persistence in `ClientReceiptsRepository`. The existing Finance module already owns `FinanceRepository.findJournalBySourceKey()` and the Finance service posting transaction. B18.5 will reuse that authoritative seam inside the same database transaction.

## Unallocation persistence note

The Final-21 table contract defines the allocation row without a separate allocation-status column. B18.4 therefore exposes a narrow `deleteAllocation()` persistence operation only for the later explicit `/unallocate` command. B18.6 must record audit/outbox and any Finance compensation before that delete occurs, so the operation is controlled and never a generic CRUD delete. The original posted Client Receipt remains immutable.

## No database or runtime expansion

B18.4 adds no Prisma model, migration, permission, public route, React feature or Finance journal behavior. Historical migrations remain untouched.

## Next pass

**B18.5 - Client Receipt creation and atomic Finance posting:** implement service-level Client/Project/Stage/Cash-Bank validation, company numbering, idempotency, audit/outbox, receipt creation and the atomic Cash/Bank plus AR/client-advance Finance effect. Allocation stays for B18.6.
