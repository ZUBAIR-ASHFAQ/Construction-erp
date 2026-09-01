# Pass B18.10 - Final-21 Client Receipts Final Acceptance and Freeze

## Purpose
B18.10 is the final acceptance pass for Module 16 Client Receipts / Payments. It adds the guarded live integration contract, browser end-to-end workflow, regression gate, acceptance evidence and freeze boundary without changing the six-route API or adding a database migration.

## Frozen shape
Backend remains exactly five production files in `apps/api/src/modules/client-receipts/`: routes, service, repository, schema and index. React remains exactly `api/`, `hooks/`, `components/` and `pages/`. Persistence remains the existing `ClientReceipt` and `ClientReceiptAllocation` models. B18.10 adds no database migration.

## Frozen public API
1. `GET /api/v1/client-receipts`
2. `POST /api/v1/client-receipts`
3. `GET /api/v1/client-receipts/:id`
4. `POST /api/v1/client-receipts/:id/allocations`
5. `POST /api/v1/client-receipts/:id/unallocate`
6. `POST /api/v1/client-receipts/:id/reverse`

The four write commands remain idempotent commands; no generic CRUD route is introduced.

## Final invariants
- Invoice payment and random advance Receipts both post through the same controlled cash history.
- A random advance may exist without an Invoice and remain advance / unapplied cash until later allocation.
- Client cash received is not profit merely because cash arrived.
- Allocation cannot exceed remaining Receipt cash or Invoice outstanding.
- Stage received, allocated, advance and outstanding remain source-derived and do not double count allocation.
- Concurrent allocation uses row locking to prevent over-allocation.
- Posted Receipt history is immutable; unallocation and reversal use compensating Finance history.
- Stable source keys make Receipt, allocation, unallocation and reversal posting idempotent.
- Company, Project-scope and RBAC checks remain server-side.
- A closed Finance period rolls the Receipt command back atomically.

## Live PostgreSQL / Fastify integration
`tests/integration/final-21-client-receipts-api.integration.test.mjs` covers Invoice payment idempotency and partial allocation, the canonical Rs. 500,000 random advance, over-allocation rejection, negative permission, Project scope, cross-Company isolation, concurrent allocation, compensating unallocation/reversal, Finance rollback and frozen OpenAPI/idempotency contracts.

Run in a dependency-installed disposable PostgreSQL environment:
```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:final-21-client-receipts
```

## Playwright workflow
`tests/e2e/final-21-client-receipts-browser.spec.mjs` proves `sign in -> create advance -> allocate -> unallocate -> reverse`, checks source-derived balances, verifies cash is not presented as profit, and records that browser writes use only frozen routes with Idempotency-Key headers.

Run with:
```bash
RUN_FOUNDATION_DB_TESTS=1 RUN_FINAL_21_CLIENT_RECEIPTS_E2E=1 npm run test:e2e:final-21-client-receipts
```

## Static gate
`npm run final-21-client-receipts:b18-10:gate` replays B18.1-B18.10 together with the previous Client Billing acceptance, migration-system and workspace guards.

## Environment boundary
The supplied source archive does not include installed project dependencies or a disposable PostgreSQL connection. Dependency-backed Prisma/TypeScript/Vite compilation and live PostgreSQL/Playwright execution therefore remain guarded commands instead of fabricated pass results.

## Freeze decision
Module 16 is frozen at B18.10. Later passes should not expand or rewrite Client Receipts unless a documented integration defect requires a controlled fix.

## Next pass
**B19.1 - Module 19 Project Profitability alignment audit.** Project Profitability must consume approved/posted source data and must not treat Client cash received as profit or create duplicate authoritative financial state.
