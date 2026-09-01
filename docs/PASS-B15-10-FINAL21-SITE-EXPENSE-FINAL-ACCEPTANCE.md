# Pass B15.10 - Final-21 Site Expense Management Final Acceptance and Freeze

## Purpose

Pass B15.10 closes Final Module 14 - Site Expense Management. It does not add another business capability. It freezes the approved implementation, adds the missing browser-workflow acceptance harness required before advancing, runs the available cumulative release gates, and records the handoff boundary for B16 Supplier Payables.

## Frozen Module 14 scope

The completed Site Expense module remains exactly:

- one five-file Fastify backend: schema, repository, service, routes and index;
- centralized Prisma persistence through `expense_categories` and `site_expenses`;
- one four-folder React feature: `api/`, `hooks/`, `components/`, `pages/`;
- secure evidence through Module 21 Documents;
- Project required and Stage optional;
- direct Site Expense posting to Finance and Project/Stage actual cost in one transaction;
- append/compensating reversal history instead of deletion;
- company/project scope, RBAC, idempotency, audit and outbox through existing Foundation contracts.

No separate Site Expense approval workflow, category CRUD module, generic DELETE route, Project Profitability write model, duplicate cash/bank master or duplicate document storage is introduced.

## Exact public API freeze

The public Module 14 contract is exactly six operations:

1. `GET /api/v1/site-expenses`
2. `POST /api/v1/site-expenses`
3. `GET /api/v1/site-expenses/:id`
4. `PATCH /api/v1/site-expenses/:id`
5. `POST /api/v1/site-expenses/:id/post`
6. `POST /api/v1/site-expenses/:id/reverse`

Writes retain the reviewed Zod boundary, explicit permissions and idempotency key handling. Browser clients never supply Company ownership, actor identity, authoritative status, expense number, posting timestamps, Finance totals or Project Cost totals.

## Persistence freeze

B15 uses only two forward migrations:

- `20260829001900_final21_site_expenses`
- `20260829002000_final21_site_expense_contract`

Historical migrations remain unchanged. B15.10 adds no migration.

The key history rules remain:

- DRAFT may be edited;
- POSTED may not be silently edited;
- REVERSED remains historical;
- Project Cost source key for posting is `site_expense:<expenseId>`;
- compensating cost/journal source key is `site_expense_reversal:<expenseId>`;
- one source key can produce at most one source effect;
- Finance failure rolls the Site Expense post transaction back;
- Project Profitability remains a downstream reader.

## Final browser acceptance harness

B15.10 adds `tests/e2e/final-21-site-expenses-browser.spec.mjs` and wires it into `playwright.config.mjs` behind `RUN_FINAL_21_SITE_EXPENSES_E2E=1`.

The browser scenario uses the real sign-in page and permission-aware ERP shell, then:

1. opens Site Expenses;
2. creates a BANK Site Expense against a Project and Stage;
3. posts the DRAFT through the explicit post command;
4. reverses the POSTED expense through the explicit reversal command;
5. verifies the persisted Site Expense finishes as REVERSED;
6. verifies original plus compensating Project Cost rows net to zero;
7. verifies both Finance journals remain balanced;
8. verifies browser writes use only the frozen six-route surface and carry idempotency keys.

Run the live browser gate with a disposable PostgreSQL test database:

```bash
RUN_FOUNDATION_DB_TESTS=1 RUN_FINAL_21_SITE_EXPENSES_E2E=1 npm run test:e2e:final-21-site-expenses
```

## Final regression matrix

| Gate | B15.10 handoff status |
| --- | --- |
| B15.1-B15.10 focused static regression | Required PASS |
| Complete Final-21 static regression | Required PASS |
| Workspace validation | Required PASS |
| Legacy cleanup manifest | Required PASS |
| Migration-system tests | Required PASS |
| Migration checksum/gate policy | Required PASS |
| Changed TypeScript/TSX syntax transpilation | Required PASS |
| Site Expense live Fastify/PostgreSQL integration | Prepared; run when disposable PostgreSQL + dependencies are available |
| Site Expense Playwright workflow | Prepared; run when disposable PostgreSQL + dependencies/browser are available |
| ZIP integrity | Required PASS |

## B16 handoff boundary

The next generation-sequence module is Module 17 - Supplier Payables. Its hard prerequisites are already present: Module 5 Supplier/Vendor master, Module 10 Procurement/Purchase, Module 18 Finance Core and Module 9 Project Budget & Cost Tracking.

B16 should begin with a non-destructive audit of the existing Supplier Payables runtime before creating anything, because this source tree contains older finance/procurement functionality that may need alignment rather than duplication.

B16 must preserve the same Final-21 rules used here: company/project isolation, exact decimal money, explicit post/allocation commands, immutable posted history, stable source keys, Finance ownership of cash/bank/GL, source-derived Project Cost, and no generic CRUD expansion.

## Verification completed in this handoff

Available non-database gates were executed after the B15.10 freeze changes:

- B15.1-B15.10 focused Site Expense regression: **97/97 PASS**;
- complete `final-21-*` static regression: **273/273 PASS**;
- migration-system tests: **8/8 PASS**;
- workspace tests: **31/31 PASS**;
- migration checksum/gate policy: **81/81 migrations locked across 81 gates**;
- Final-21 legacy cleanup manifest: **PASS and regenerated/current**;
- B15.10 Playwright spec/config and Node syntax checks: **PASS**;
- B15.10 adds **no production TypeScript/TSX or migration change** beyond the already accepted B15.1-B15.9 module implementation.

The disposable-PostgreSQL B15.9 integration suite and B15.10 Playwright workflow are not claimed as executed in this handoff because the archive does not contain installed dependencies and this environment does not provide the required disposable PostgreSQL/browser runtime. Their guarded commands are included for CI/development execution before release.
