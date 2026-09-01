# Pass B19.10 - Final-21 Project Profitability Final Acceptance and Freeze

## Purpose

B19.10 closes Final Module 19 - Project Profitability. It adds the guarded browser workflow, extends the disposable PostgreSQL/Fastify acceptance with a live OpenAPI freeze, replays the full B19.1-B19.10 regression chain, records acceptance evidence and freezes Module 19 without adding duplicate financial persistence.

## Frozen production shape

The backend remains exactly five files under `apps/api/src/modules/project-profitability/`:

- `project-profitability.routes.ts`
- `project-profitability.service.ts`
- `project-profitability.repository.ts`
- `project-profitability.schema.ts`
- `index.ts`

The React feature remains exactly `api/`, `hooks/`, `components/` and `pages/` under `apps/web/src/features/project-profitability/`.

B19.10 adds no database migration, profitability table, snapshot table, materialized view or browser-owned financial state.

## Frozen public API

Module 19 remains read-only with exactly four GET operations:

1. `GET /api/v1/project-profitability/projects/:projectId`
2. `GET /api/v1/project-profitability/projects/:projectId/stages`
3. `GET /api/v1/project-profitability/projects/:projectId/trend`
4. `GET /api/v1/project-profitability/portfolio`

No POST, PUT, PATCH or DELETE route is allowed for Project Profitability.

## Frozen permissions and errors

Permissions:

- `project_profitability.read`
- `project_profitability.finance.read`
- `project_profitability.portfolio.read`

Stable business errors:

- `PROFITABILITY_SCOPE_FORBIDDEN`
- `PROFITABILITY_SOURCE_INCOMPLETE`
- `INVALID_PROFITABILITY_FILTER`

Company ownership, explicit Project scope and effective permissions remain server-authoritative.

## Final financial invariants

- Profit = recognized / approved revenue basis - actual Project cost.
- **Client Received is not Profit.** Cash received and advances remain financial-position values only.
- Billed, received, allocated, advance, outstanding, Supplier payable, actual cost and profit remain distinct.
- Outstanding = billed - allocated Client receipts.
- Advance / unallocated = received - allocated.
- Project and Stage actual cost comes from Module 9 source-derived `CostActual` history.
- Billed position comes from issued/posted Module 15 Client Invoice lines.
- Recognized revenue is confirmed from posted Module 18 revenue Journal lines for the billed Client Invoice source.
- Client Receipt history is reconstructed from durable Module 18 Finance sources so later allocation reversal or Receipt reversal does not rewrite history.
- Supplier payable comes from posted Module 17 Supplier Invoices minus posted Supplier Payment allocations.
- Only approved Stage physical progress is exposed.
- Stage values plus the explicit Project-only bucket reconcile to the Project total without guessed Stage allocation or double counting.
- Portfolio rows preserve each Project currency; no unsafe cross-currency grand total is created.

## Guarded PostgreSQL / Fastify acceptance

`tests/integration/final-21-project-profitability-api.integration.test.mjs` remains the live cross-module reconciliation/security suite. B19.10 also freezes live OpenAPI to the exact four bearer-secured read-only operations.

The integration suite covers Modules 9, 15, 16, 17 and 18, approved Stage progress, the canonical Rs. 500,000 advance, source-status/as-of filtering, Stage reconciliation, trend ownership, Company isolation, Project scope and negative permission behavior.

Run in a dependency-installed disposable PostgreSQL environment:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration
```

## Guarded Playwright acceptance

`tests/e2e/final-21-project-profitability-browser.spec.mjs` seeds authoritative source rows and verifies:

`sign in -> Project Profitability -> apply bounded filters -> portfolio -> Project summary -> Stage drill-down -> trend -> advance-only Project`

The browser workflow verifies the reconciliation Project, the Rs. 500,000 advance-only Project, the visible cash-versus-profit separation and that every Module 19 browser request stays inside the four frozen GET operations.

Run after installing dependencies and providing the disposable test database:

```bash
npm run build
RUN_FOUNDATION_DB_TESTS=1 npm run test:db:prepare
RUN_FOUNDATION_DB_TESTS=1 RUN_FINAL_21_PROJECT_PROFITABILITY_E2E=1 playwright test --config playwright.config.mjs
```

## Static freeze gate

`npm run final-21-project-profitability:b19-10:gate` replays B19.1-B19.10 together with the frozen B18.10 Client Receipts acceptance, migration policy and workspace structure checks.

`npm run test:final-21-project-profitability-alignment` is the focused cumulative Module 19 regression chain.

## Verification recorded in this archive

- B19.10 gate: **154/154 PASS**
- B19.1-B19.10 focused alignment: **126/126 PASS**
- Final-21 static suite: **749/749 PASS**
- Current Foundation + Final-21 static suite: **854/854 PASS**
- Migration policy: **89/89 PASS**
- Workspace required stack: **PASS**
- Legacy cleanup manifest: **PASS**
- Guarded Project Profitability integration discovery: **9/9 correctly skipped without the live DB flag**

## Environment boundary

The source archive does not include installed project dependencies or a disposable PostgreSQL/browser environment. Dependency-backed Prisma/TypeScript/Vite compilation and live PostgreSQL/Playwright execution therefore remain guarded rather than being reported as executed.

## Freeze decision

**Module 19 is frozen at B19.10.** Later work must consume this read-only contract rather than adding a second profitability source of truth or changing cash into profit.

## Next pass

**B20.1 - Cross-module Integration Completion alignment audit.** This is the corrected executable Stage 20 gate before Module 20 Reports & Analytics. It should verify end-to-end idempotency, source-key ownership, permission isolation and reconciliation across the stabilized source modules before reporting APIs are generated.
