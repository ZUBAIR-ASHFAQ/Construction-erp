# Pass B15.3 - Final-21 Site Expense Boundary Contract

## Purpose

Pass B15.3 adds only the request/response boundary contract, stable permission vocabulary and stable business-error vocabulary for Final Module 14 - Site Expense Management.

B15.2 already owns the two persistence tables. B15.3 intentionally does not add a repository, service, Fastify route registration, posting adapter, reversal adapter, document-link resource handler or React UI.

## Boundary schema added

Added:

`apps/api/src/modules/site-expenses/site-expenses.schema.ts`

The schema freezes the exact six-route contract for later passes without registering the routes yet:

- `GET /api/v1/site-expenses`
- `POST /api/v1/site-expenses`
- `GET /api/v1/site-expenses/:id`
- `PATCH /api/v1/site-expenses/:id`
- `POST /api/v1/site-expenses/:id/post`
- `POST /api/v1/site-expenses/:id/reverse`

No generic DELETE or separate approval workflow route is introduced.

## Request rules frozen

The boundary now enforces:

- UUID identifiers at the HTTP boundary.
- exact positive decimal money represented as a string with up to two decimal places.
- `YYYY-MM-DD` calendar dates.
- bounded pagination with maximum page size 100.
- Project is required on create.
- Stage is optional and remains a service-level Project ownership check for B15.4/B15.5.
- payment treatment vocabulary is `CASH`, `BANK` or `PAYABLE`.
- direct `CASH`/`BANK` treatment requires a Cash/Bank account identifier.
- evidence is referenced only by `documentId`; no binary/file payload is accepted.
- post and reverse are explicit bodyless commands.
- client input cannot set company, actor, permissions, Project scope, expense number, posting status, creator or posted timestamp.

Cross-company, active Project, Stage ownership, category ownership, active Finance account, document authorization and draft/post state checks remain service/repository responsibilities and are not falsely claimed as completed here.

## Stable permissions

B15.3 registers exactly these Final Module 14 permissions:

- `site_expenses.read`
- `site_expenses.create`
- `site_expenses.update`
- `site_expenses.post`
- `site_expenses.reverse`

A small forward migration registers these permission rows and grants them only to the conventional active system-admin role so an upgraded installation does not deadlock permission administration. Other business-role grants remain an Administration decision.

Migration:

`20260829002000_final21_site_expense_contract`

Historical migrations remain unchanged.

## Stable business errors

The schema exposes exactly the required Module 14 error vocabulary:

- `EXPENSE_NOT_FOUND`
- `EXPENSE_LOCKED`
- `INVALID_EXPENSE_ACCOUNT`
- `INVALID_EXPENSE_STAGE`

The public error factory maps not-found to `NotFoundError` and validation/state conflicts to `ConflictError`. Authorization continues to use the shared authorization layer and is not hidden behind an invented Module 14 error code.

## Deliberately deferred

B15.3 does not implement:

- `site-expenses.repository.ts`
- `site-expenses.service.ts`
- `site-expenses.routes.ts`
- module registration
- database reads/writes
- company/Project permission resolution
- Stage/category/account/document ownership checks
- numbering
- Finance journal posting
- Module 9 `site_expense` actual-cost posting
- idempotency
- audit/outbox events
- reversal transactions
- Document resource linking
- React feature

## Verification

Focused B15.3 static tests verify the exact route catalog, strict Zod request ownership boundary, payment/account rule, permission/error vocabulary, forward permission migration, migration-lock registration, and that repository/service/routes/UI remain deferred.

Dependency-backed TypeScript/Zod/Prisma execution still requires installed dependencies. The supplied archive does not contain `node_modules`, so this pass does not claim those live dependency-backed gates.

## Exit decision

B15.3 is complete when the Site Expense contract, permissions, errors and permission migration are present and all current Final-21 static regression tests pass without adding runtime business logic.

Next pass: **B15.4 - implement the company/project-scoped Site Expense repository only, with simple methods for list/detail, category/account/project/stage/document validation, draft create/update and state persistence. Business posting/reversal logic remains in B15.5.**
