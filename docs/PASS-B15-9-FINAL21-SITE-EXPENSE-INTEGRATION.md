# Pass B15.9 - Final-21 Site Expense Backend/API Integration Verification

## Purpose

Pass B15.9 verifies the completed Final Module 14 backend as one integrated workflow rather than adding another business feature.

The pass focuses on the release risks that remain after the B15.1-B15.8 persistence, contract, repository, service, HTTP, Documents and React work:

- negative permission enforcement;
- Company and allowed-Project isolation;
- exact Finance + Project/Stage cost reconciliation;
- retry-safe post/reversal behavior;
- atomic rollback when Finance cannot post;
- generated OpenAPI completeness for all six frozen Site Expense routes.

## Production repair found during verification

The B15.6 route layer registered Swagger operation IDs/tags/security, but the Site Expense routes did not yet describe their validated query, params, body or response shapes in Fastify route schema metadata.

B15.9 closes that documentation gap only. `site-expenses.routes.ts` now publishes JSON schemas for:

- bounded list filters and pagination;
- UUID route params;
- create and draft-update request bodies;
- bodyless post/reverse command bodies;
- required `Idempotency-Key` headers on all four writes;
- Site Expense success envelopes;
- bounded list success envelope;
- stable common error response envelopes.

The Zod schemas remain the application boundary and the six-route business surface is unchanged.

## Live integration verification added

`tests/integration/final-21-site-expenses-api.integration.test.mjs` is an opt-in disposable-PostgreSQL test suite.

It seeds two Companies with the minimum current Final-21 graph required by Site Expense:

- Administration users/roles/permissions and Project scope;
- Clients, Projects and Project Stages;
- Expense Categories;
- active GL and Bank accounts;
- open fiscal periods;
- company number sequences for Site Expense and Journal posting.

The suite uses the compiled `buildApp(...)` and `Fastify.inject(...)`, so it exercises authentication, request context, RBAC, service transactions, repositories, Finance posting, Project Cost posting, audit/outbox, idempotency and generated Swagger together.

## Scenarios covered

### 1. Posting reconciliation and retries

A valid BANK Site Expense is created and posted.

The test proves:

- the expense becomes `POSTED`;
- exactly one `cost_actuals` row exists for `site_expense:<expenseId>`;
- exactly one posted Journal exists for the same source key;
- the Journal has two balanced lines;
- Project and Stage tags match the Site Expense;
- repeated requests with the same idempotency key do not duplicate effects;
- a later different post idempotency key still does not create a second source effect;
- posting audit and outbox evidence exists once.

### 2. Compensating reversal

The test posts and then reverses one Site Expense.

It proves:

- original history remains present;
- one `site_expense_reversal:<expenseId>` cost row is appended;
- one compensating Finance Journal is appended;
- original + reversal Project Cost nets to zero exactly;
- each Journal remains balanced;
- the Site Expense moves to `REVERSED`;
- repeated reversal with the same key does not duplicate history.

### 3. Permission, Project and Company isolation

A read-only user is restricted to one Project while another same-company Project also contains Site Expense data.

The test proves:

- allowed Project list access succeeds;
- explicit query of another Project is forbidden;
- detail from another Project is not disclosed;
- a read-only user cannot create Site Expenses;
- a user from another Company cannot read the first Company's Site Expense.

### 4. Atomic rollback

The test closes the fiscal period after creating a DRAFT Site Expense and then attempts posting.

Finance rejects the posting with `FISCAL_PERIOD_CLOSED`.

The test then proves the transaction rolled back fully:

- no Project Cost row exists;
- no Journal exists;
- the Site Expense is still `DRAFT`.

### 5. Generated OpenAPI

The live API test reads `/openapi.json` and verifies all six operation IDs, Bearer security, responses, bounded list parameters and required write idempotency header metadata.

## Commands

Static B15.1-B15.9 verification:

```bash
npm run test:final-21-site-expenses
```

Focused B15.9 gate:

```bash
npm run final-21-site-expenses:b15-9:gate
```

Disposable PostgreSQL live verification:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:final-21-site-expenses
```

## Deliberately unchanged

B15.9 does not add:

- a seventh Site Expense route;
- a new database table or migration;
- another Site Expense lifecycle state;
- generic DELETE or approval workflow endpoints;
- direct Project Profitability writes;
- duplicate Finance or Project Cost posting logic;
- another file-storage implementation;
- additional React behavior.

## Verification result

Available handoff-environment checks completed successfully:

- B15.1-B15.9 focused static regression: **87/87 PASS**
- Complete Final-21 static regression: **263/263 PASS**
- Migration-system tests: **8/8 PASS**
- Migration checksum policy: **81/81 migrations locked**
- Workspace structure check: **PASS**
- Legacy cleanup manifest: **PASS**
- Live suite parse/discovery: **5 scenarios discovered and intentionally skipped without `RUN_FOUNDATION_DB_TESTS=1`**

## Environment note

The supplied source archive contains no installed `node_modules` and no disposable PostgreSQL runtime is available inside this handoff environment. Therefore the new live integration suite is prepared and statically verified but is not claimed as executed here.

Static source, migration-policy and workspace gates are run in this pass. The live command above remains the required dependency/database-backed acceptance gate in a normal development or CI environment.

## Exit decision

B15.9 is complete when the static suite proves the live integration coverage exists, the OpenAPI gap is repaired, the frozen six-route/persistence scope is unchanged, and all available static regression/migration/workspace gates pass.

Next pass: **B15.10 - final Module 14 cleanup/freeze, final regression matrix and handoff to B16 Supplier Payables.**
