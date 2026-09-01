# Pass B15.4 - Final-21 Site Expense Repository

## Purpose

Pass B15.4 adds only the persistence/repository layer for Final Module 14 - Site Expense Management.

The repository stays intentionally simple. It owns Company-scoped database access, trusted Project-scope filtering, bounded reads, relationship lookup helpers, DRAFT persistence and narrow lifecycle-state persistence. Business decisions remain in the next service pass.

## Production file added

`apps/api/src/modules/site-expenses/site-expenses.repository.ts`

No Prisma model or migration is added in B15.4. The B15.2 persistence schema and B15.3 request contract remain the controlling database/API boundary.

## Repository behavior

The repository now provides:

- bounded Site Expense register reads with Project, Stage, category, payment-mode, status and date filters;
- detail reads hidden outside the authenticated Company and trusted allowed-Project scope;
- same-Company Project validation;
- same-Project Stage validation;
- Company-owned Expense Category lookup with its optional default GL account;
- Company-owned Cash/Bank account lookup with its mapped GL account;
- evidence Document lookup limited to documents owned by or linked to the selected Project;
- server-numbered DRAFT Site Expense creation;
- DRAFT-only updates;
- a row lock for state-sensitive posting/reversal transactions;
- narrow `DRAFT -> POSTED` and `POSTED -> REVERSED` persistence primitives.

`allowedProjectIds: null` means the trusted caller may access all Projects in the active Company. A concrete list means every Project-scoped read/write is restricted to that list.

## Deliberately not implemented here

B15.4 does not add:

- Site Expense service business logic;
- permission checks;
- numbering orchestration;
- active Project/category/account policy decisions;
- Finance journal posting;
- Module 9 `site_expense` actual-cost posting;
- idempotency orchestration;
- audit/outbox events;
- reversal compensation calculations;
- Fastify routes or module registration;
- Document resource-type registration;
- React UI.

The repository does not create journals, cost actuals, audit rows or outbox rows. Those coordinated operations must live in one B15.5 service transaction so a posted expense cannot create partial financial effects.

## Code-quality rule

Every named helper and repository method has a short purpose comment. The repository avoids extra abstractions and keeps validation reads explicit so a junior developer can trace Project, Stage, category, Finance-account and evidence ownership checks directly.

## Verification

B15.4 focused static tests verify Company/Project isolation, bounded pagination, relationship lookup helpers, DRAFT-only persistence, row locking, narrow state transitions, no deletion path and the absence of premature Finance/Cost/Audit/Outbox logic.

Dependency-backed TypeScript/Prisma execution still requires installed dependencies. This archive does not contain `node_modules`, so B15.4 does not claim dependency-backed compilation or a live PostgreSQL repository test.

## Exit decision

B15.4 is complete when the Site Expense repository exists, all current Final-21 static regressions pass, and service/routes/UI remain deferred.

Next pass: **B15.5 - implement Site Expense service business logic, including Project/Stage/category/account/document validation, numbering, atomic Finance + Project Cost posting, idempotency, audit/outbox behavior and compensating reversal.**
