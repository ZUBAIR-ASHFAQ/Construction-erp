# Pass B17.10 - Final-21 Client Billing Final Acceptance and Freeze

## Purpose

B17.10 is the final acceptance pass for Final Module 15 - Client Billing. It freezes the production boundary completed in B17.1-B17.9 and adds the executable integration and browser verification harness required before advancing to Module 16 Client Receipts / Payments.

The frozen workflow is:

**Client -> Project -> Stage -> Claim -> Client Invoice -> Finance / AR -> Stage billed views**

Physical Stage progress remains independent from billing progress. Client cash received, advance/unallocated cash, allocation and outstanding-after-receipt remain owned by Module 16 and are not introduced here.

## Frozen production scope

### Backend module

The backend remains one five-file module:

- `client-billing.schema.ts`
- `client-billing.repository.ts`
- `client-billing.service.ts`
- `client-billing.routes.ts`
- `index.ts`

### React feature

The frontend remains the required four-part feature:

- `api/`
- `hooks/`
- `components/`
- `pages/`

### Exact HTTP contract

The module remains exactly nine operations:

1. `GET /api/v1/client-billing/projects/:projectId/settings`
2. `PUT /api/v1/client-billing/projects/:projectId/settings`
3. `GET /api/v1/client-billing/claims`
4. `POST /api/v1/client-billing/claims`
5. `PATCH /api/v1/client-billing/claims/:id`
6. `POST /api/v1/client-billing/claims/:id/finalize`
7. `POST /api/v1/client-billing/claims/:id/invoice`
8. `GET /api/v1/client-billing/invoices`
9. `GET /api/v1/client-billing/invoices/:id`

No generic delete, approval, reversal, Contract, AR-receipt or receipt-allocation endpoint is added.

## Final business invariants

### Project and Stage ownership

- Project Management owns the Project commercial model and Client relationship.
- Client Billing derives `client_id` from the selected Project.
- Every non-null Claim or Invoice Stage must belong to the same Project and Company.
- Database reconciliation triggers protect the same ownership chain against direct persistence drift.

### Fixed Price

- Fixed Price Claim values are explicit billing values.
- Project value and Stage planned value are references, not automatic invoices.
- Physical progress does not create or change billing by itself.
- Finalization calculates gross, retention and certified net values server-side.

### Cost + Percentage

- Cost + Percentage uses only posted Project/Stage actual cost through the Claim period end.
- The percentage comes from Project Management.
- Previously finalized Claim values reduce the remaining eligible billing basis.
- Stage-tagged Claim lines cannot cumulatively exceed the same Stage cost-plus basis.

### Client Invoice and Finance / AR

- Only a finalized Claim can create a Client Invoice.
- Certified net value is allocated deterministically across immutable Claim lines while preserving optional Stage attribution.
- `CLIENT-RECEIVABLE` is the required active ASSET account.
- `CLIENT-REVENUE` is the required active REVENUE account.
- One deterministic `client_invoice:<invoiceId>` source key owns the Finance journal.
- Client Invoice persistence and Finance posting occur in one transaction.
- Finance failure leaves the finalized Claim intact and rolls back the new Client Invoice and Journal.

### Stage financial visibility

- Stage billed amount is derived from issued/posted Client Invoice lines only.
- Stage billing does not sum Progress Claims or Finance Journal lines as parallel billing sources.
- Until Module 16 is generated, Stage received remains zero and outstanding equals billed.

### Documents and audit

- Module 21 remains the owner of `client_invoice` document linking and secure file access.
- Client Billing does not duplicate document storage or upload/download behavior.
- Claim creation/finalization and Client Invoice creation/posting retain audit/outbox evidence and stable source ownership.

## Live Fastify/PostgreSQL verification

B17.10 adds `tests/integration/final-21-client-billing-api.integration.test.mjs` behind `RUN_FOUNDATION_DB_TESTS=1`.

The guarded live suite covers:

- Fixed Price settings, Claim creation, finalization, retention and certified net;
- retry-safe Claim, finalization and Client Invoice commands;
- Stage-preserving Client Invoice lines;
- one balanced Finance journal per `client_invoice:<invoiceId>` source key;
- Stage billed reconciliation through Module 7;
- Cost + Percentage Project/Stage cost-basis ceiling and cumulative over-certification rejection;
- invalid Stage rejection with `BILLING_STAGE_INVALID`;
- read-only permission denial;
- Project scope restriction;
- cross-Company isolation;
- closed-period Finance failure rollback with no partial Client Invoice or Journal;
- generated OpenAPI verification for all nine operations and all five idempotent writes.

Run in a disposable PostgreSQL environment:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:final-21-client-billing
```

## Final Playwright workflow

B17.10 adds `tests/e2e/final-21-client-billing-browser.spec.mjs` and a dedicated `RUN_FINAL_21_CLIENT_BILLING_E2E=1` Playwright selector.

The browser workflow signs in through the real UI, then:

1. opens Client Billing;
2. selects an allowed Project;
3. confirms the Project-owned Fixed Price model is read-only;
4. saves retention and billing-cycle settings;
5. creates a Stage-aware Progress Claim;
6. finalizes the Claim and verifies gross/retention/net values;
7. creates the Client Invoice;
8. verifies the Invoice retains Stage attribution;
9. verifies exactly one balanced Finance journal remains for the Invoice source key;
10. verifies browser writes remain on the frozen nine-route surface and carry idempotency keys.

Run with:

```bash
RUN_FOUNDATION_DB_TESTS=1 RUN_FINAL_21_CLIENT_BILLING_E2E=1 npm run test:e2e:final-21-client-billing
```

## Final regression matrix

| Gate | B17.10 requirement |
| --- | --- |
| B17.1-B17.10 focused static tests | Must pass |
| Complete Final-21 static regression | Must pass |
| Current Foundation + Final-21 static gate | Must pass |
| Workspace tests | Must pass |
| Migration-system tests | Must pass |
| Migration checksum/gate policy | Must pass |
| Final-21 database cleanup | Must pass |
| Legacy cleanup manifest | Must be current |
| New Node/Playwright syntax checks | Must pass |
| Live Fastify/PostgreSQL Client Billing integration | Prepared for disposable DB runtime |
| Client Billing Playwright workflow | Prepared for disposable DB/browser runtime |
| ZIP integrity | Must pass |

## B18 handoff

**B17 is frozen after this pass.**

The next corrected generation-sequence work is **B18.1 - Module 16 Client Receipts / Payments alignment audit**.

That audit must preserve the already-frozen separation between Client Invoice billing and cash receipt history. Module 16 may record invoice payments and random/advance receipts, allocate receipts later, and derive received/advance/outstanding values without rewriting the original Client Invoice or treating cash received as profit.

## Verification completed in this handoff

Available non-database gates were executed after the B17.10 freeze changes:

- B17.1-B17.10 focused Client Billing static regression: **103/103 PASS**;
- B17.10 cumulative Client Billing + migration/workspace gate: **119/119 PASS**;
- complete `final-21-*` static regression: **507/507 PASS**;
- current Foundation + Final-21 static gate: **611/611 PASS**;
- Final-21 database-cleanup regression: **6/6 PASS**;
- migration checksum/gate policy: **87/87 migrations locked across 87 gates**;
- Final-21 legacy cleanup manifest: **PASS/current**;
- Workspace / required stack: **PASS**;
- function-purpose-comment gate: **PASS**;
- B17.10 integration test, Playwright spec and Playwright config Node syntax checks: **PASS**;
- guarded live Client Billing integration discovery: **5 scenarios discovered and correctly skipped without the live database flag**.

## Environment limitation

The source archive does not contain installed `node_modules`. Therefore the disposable PostgreSQL integration workflow, dependency-backed Prisma/TypeScript/Vite build and real Playwright browser run are not claimed as executed in this handoff. Their guarded commands and source-level verification are included for CI/development execution with the required runtime dependencies.
