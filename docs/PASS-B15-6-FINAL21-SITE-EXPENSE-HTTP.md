# Pass B15.6 - Final-21 Site Expense HTTP and Registration

## Purpose

Pass B15.6 exposes the already-implemented Final Module 14 - Site Expense Management business logic through the exact Fastify HTTP contract. It adds the final backend route file, the module barrel, application registration and Swagger/OpenAPI route metadata.

This pass is HTTP-only. It does not change the B15.2/B15.3 database shape or add another migration, and it does not start the React feature.

## Backend files added

- `apps/api/src/modules/site-expenses/site-expenses.routes.ts`
- `apps/api/src/modules/site-expenses/index.ts`

The Site Expense backend now has exactly the required five files:

1. `site-expenses.schema.ts`
2. `site-expenses.repository.ts`
3. `site-expenses.service.ts`
4. `site-expenses.routes.ts`
5. `index.ts`

## Exact HTTP surface

B15.6 registers only the six routes frozen in B15.3:

- `GET /api/v1/site-expenses`
- `POST /api/v1/site-expenses`
- `GET /api/v1/site-expenses/:id`
- `PATCH /api/v1/site-expenses/:id`
- `POST /api/v1/site-expenses/:id/post`
- `POST /api/v1/site-expenses/:id/reverse`

No generic DELETE, approval-workflow, submit, archive or duplicate lifecycle endpoint is introduced.

## Boundary validation

Every route authenticates through the existing API authentication plugin before calling the service.

The route layer reuses the frozen B15.3 Zod schemas rather than duplicating business validation:

- list query validation uses `listSiteExpensesQuerySchema`;
- `:id` uses `siteExpenseIdParamsSchema`;
- create uses `createSiteExpenseBodySchema`;
- draft edit uses `updateSiteExpenseBodySchema`;
- post uses `postSiteExpenseBodySchema`;
- reverse uses `reverseSiteExpenseBodySchema`;
- service output is parsed through `siteExpenseResponseSchema` or `listSiteExpensesResponseSchema` before it is returned.

Validation failures use the existing stable `INVALID_REQUEST` envelope with field-level paths.

## Idempotency

All four write commands require the Foundation `Idempotency-Key` header:

- create;
- update;
- post;
- reverse.

The header is limited to 200 characters and is passed directly to the B15.5 service, where persisted command idempotency already owns retry behavior.

GET routes do not require an idempotency header.

## HTTP response behavior

- Create returns HTTP `201` with `{ data }`.
- List, detail, update, post and reverse return the normal success envelope `{ data }`.
- Company identity, actor identity, allowed Project scope and posting authority remain server-owned and are not introduced into the route request contract.

## OpenAPI / Swagger

The six routes include:

- one `Site Expenses` tag;
- unique operation IDs;
- concise business summaries;
- Bearer security metadata;
- the required idempotency header schema on writes.

`apps/api/src/app.ts` already registers Swagger before business routes and exposes `/openapi.json`. B15.6 registers `registerSiteExpensesRoutes` inside the database-backed module block, so the Site Expense paths become part of that generated route graph when the API runs with its database dependency.

## Application registration

`apps/api/src/app.ts` now imports and registers:

`registerSiteExpensesRoutes`

Registration occurs after Labour / Attendance & Payroll and before the already-present Client Billing module. No separate plugin or unnecessary registration file is added.

## Module barrel

`apps/api/src/modules/site-expenses/index.ts` exports only the existing Site Expense schema constants/types, repository, service, route registrar and route options type. It does not create another abstraction layer.

## Regression maintenance

Earlier B15 static tests originally asserted that routes were absent because those passes intentionally deferred HTTP work. B15.6 updates those cumulative assertions so they continue to verify their original schema/persistence/repository/service boundaries while allowing the now-approved HTTP layer.

The repository migration-system test also had a stale hard-coded latest gate from B11. It is updated to the already-existing B15.3 migration gate (`stage 46`) without changing any migration or checksum.

## Deliberately deferred

B15.6 does not add:

- a new Prisma model or migration;
- React Site Expense API/hooks/components/pages;
- generic CRUD/delete routes;
- a new approval workflow;
- duplicate Finance or Project Cost posting logic;
- direct Project Profitability writes;
- a new Site Expense account master;
- a new Document binary-storage path.

The B15.5 service remains the single owner of Site Expense business posting and reversal behavior.

## Verification

Completed static verification:

- focused B15.1-B15.6 tests: **57/57 PASS**;
- complete Final-21 static test glob: **233/233 PASS**;
- workspace checks: **31/31 PASS**;
- Final-21 legacy cleanup manifest: **PASS**;
- migration-system static tests: **8/8 PASS**;
- migration policy: **81/81 migrations locked across 81 gates**.

The source archive does not contain installed `node_modules`, so dependency-backed Fastify build, Prisma client generation, PostgreSQL integration and live Swagger document execution are not claimed in this pass.

## Exit decision

B15.6 is complete when the exact six Site Expense routes are authenticated, Zod-validated, idempotency-aware where required, exported through one five-file module, registered in `app.ts`, represented in Swagger metadata, and no extra CRUD/migration/UI scope is introduced.

Next pass: **B15.7 - complete the remaining Site Expense evidence/document resource authorization and backend integration verification before React UI work.**
