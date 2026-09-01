# Pass B15.5 - Final-21 Site Expense Service

## Purpose

Pass B15.5 implements the business/service layer for Final Module 14 - Site Expense Management. It coordinates the B15.2 persistence and B15.4 repository with Administration permissions, Foundation numbering/idempotency/audit/outbox, Module 9 actual cost and Module 18 Finance source posting.

No Prisma model or migration is added in B15.5. Fastify routes, module registration, Document `site_expense` link-type registration and React UI remain deferred.

## Service file added

`apps/api/src/modules/site-expenses/site-expenses.service.ts`

The service now owns:

- bounded permission-safe list and detail reads;
- Project-aware create/update/post/reverse authorization;
- active Project validation;
- same-Project Stage validation;
- active Expense Category validation;
- Finance Cash/Bank account validation;
- Project-authorized evidence Document validation;
- company-scoped Site Expense numbering through Foundation;
- idempotent DRAFT creation and DRAFT-only editing;
- atomic Site Expense posting to Finance and Project/Stage actual cost;
- compensating reversal without deleting original history;
- audit and outbox evidence for meaningful lifecycle writes.

## Numbering

B15.5 uses the Foundation number sequence key:

`site-expense`

The service never derives an expense number from browser input or `MAX()+1`. Deployment/bootstrap configuration must provision this Company-scoped sequence before Site Expense creation is enabled, using the existing Foundation numbering mechanism.

## Permission and Project scope behavior

The service uses Administration as the authority for the five frozen permissions:

- `site_expenses.read`
- `site_expenses.create`
- `site_expenses.update`
- `site_expenses.post`
- `site_expenses.reverse`

Authenticated Project scope is reapplied in the service and then again in repository visibility. Client-supplied Company or Project-scope authority is never accepted.

## Validation behavior

Before a Site Expense can be persisted or posted:

1. the Project must exist in the authenticated Company and be `ACTIVE`;
2. a supplied Stage must belong to that Project;
3. the Expense Category must be active in the Company;
4. a supplied evidence Document must be owned by or linked to the Project;
5. `CASH` and `BANK` require an active matching Finance Cash/Bank account and active mapped GL account;
6. `PAYABLE` does not accept a Cash/Bank account;
7. final posting requires an active category default expense GL account.

## PAYABLE accounting convention

The requirements define `cash/bank/payable treatment` but the frozen Module 14 persistence has no payable-account field or separate Site Expense settings table. B15.5 therefore does **not** invent another table or browser-owned account field.

For `PAYABLE` posting, the service resolves the existing Finance-owned GL account with the explicit Company account code:

`SITE-EXPENSE-PAYABLE`

This is an implementation convention needed to complete the accounting entry while preserving the required database shape. The account must already exist and be active in Module 18 Finance. No GL master is duplicated or auto-created by Site Expense Management.

## Atomic posting contract

`POST` service behavior uses one `executeIdempotentCommand(...)` transaction.

Inside that same transaction B15.5:

1. locks the Site Expense;
2. revalidates state, permission and dependencies;
3. writes/upserts one Module 9 `CostActual` row with category `site_expense`;
4. posts one balanced Module 18 source journal through `FinanceService.postSourceJournalInTransaction(...)`;
5. marks the Site Expense `POSTED`;
6. records audit and outbox evidence.

The original Finance and Project-cost effects share the stable source key:

`site_expense:<expenseId>`

The Project-cost source is checked after upsert so an unexpected source-key collision cannot silently reuse unrelated data.

## Accounting behavior

For direct `CASH` / `BANK` treatment:

- debit = category default expense GL account;
- credit = selected Cash/Bank account's mapped GL account.

For `PAYABLE` treatment:

- debit = category default expense GL account;
- credit = Finance account `SITE-EXPENSE-PAYABLE`.

The Project and optional Stage are carried as Finance journal dimensions and the same Project/Stage receives the source-derived Module 9 actual cost.

## Compensating reversal

A posted Site Expense is never deleted or edited back into a draft.

Reversal uses a second stable source key:

`site_expense_reversal:<expenseId>`

The service verifies that the original `site_expense:<expenseId>` Finance journal and Project cost source still match the expense. It then appends:

- one negative `site_expense` category actual-cost row with source type `site_expense_reversal`;
- one opposite Finance source journal produced by swapping the original debit/credit lines;
- the Site Expense state transition `POSTED -> REVERSED`;
- audit and outbox evidence.

The original cost row, journal and Site Expense posting timestamp remain preserved. Repeated reversal commands cannot create a second compensating source because the idempotency command and source keys are stable.

## Events and audit

Audit actions:

- `site_expense.created`
- `site_expense.updated`
- `site_expense.posted`
- `site_expense.reversed`

Outbox events required by the module lifecycle:

- `site_expense.created`
- `site_expense.posted`
- `site_expense.reversed`

The update remains audit-only because the controlling Module 14 event list does not define a `site_expense.updated` domain event.

## Repository support added

B15.5 adds only the narrow helpers needed by the service:

- Company GL account lookup by stable code;
- actual-cost lookup by stable source key;
- idempotent `site_expense` / `site_expense_reversal` cost actual upsert.

Business permission, lifecycle and accounting decisions remain in the service.

## Deliberately deferred

B15.5 does not add:

- Fastify route handlers;
- `index.ts` module registration;
- `registerSiteExpensesRoutes` in `app.ts`;
- generic DELETE or approval workflow routes;
- a new Site Expense payable-account table/settings table;
- direct writes to Project Profitability;
- Document `site_expense` resource-type authorization;
- React API/hooks/components/pages.

## Verification

Focused B15.5 static tests cover permission revalidation, Project/Stage/category/account/document validation, Foundation numbering, source-key idempotency, atomic Finance + Project Cost posting, immutable posted history, compensating reversal, audit/outbox vocabulary and purpose comments.

The uploaded source archive contains no `node_modules`, so dependency-backed TypeScript/Prisma/PostgreSQL integration is not claimed in this pass. Static source tests and Node TypeScript syntax checks are used without pretending they are a live database verification.

## Exit decision

B15.5 is complete when the service coordinates one Site Expense post into exactly one Finance effect and one source-derived Project/Stage actual-cost effect, retries remain duplicate-safe, reversal is compensating and traceable, and routes/UI are still absent.

Next pass: **B15.6 - add the exact six Final Module 14 Fastify routes, `index.ts`, module registration and OpenAPI contract without adding generic CRUD endpoints.**
