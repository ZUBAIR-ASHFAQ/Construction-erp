# Pass B19.1 - Final-21 Project Profitability Alignment Audit

## Purpose

Pass B19.1 is a **non-destructive alignment audit** for Final Module 19 - Project Profitability. Module 16 Client Receipts / Payments is frozen at B18.10, so the next approved business module is Project Profitability.

This pass intentionally makes **no Project Profitability production implementation change and no database migration**. It confirms prerequisite readiness, freezes the exact read-only Module 19 contract, records the source-of-truth boundaries, and defines the B19.2-B19.10 implementation sequence before new production files are introduced.

Controlling Final-21 rules used by this audit:

- Profitability is calculated from approved/posted source modules; it is not manually entered.
- `Profit = recognized/approved revenue basis - actual cost`.
- Client cash received is **not profit** by itself.
- Billed, received, outstanding, advance, supplier payable, cost and profit remain separate values.
- `Outstanding = billed - allocated receipts`; unallocated advances remain separate until allocation.
- Stage totals must reconcile to Project totals without double counting.
- Only approved/posted source states are included.
- Company and allowed-Project scope are server-derived and enforced again in the service/repository path.
- The module is read-only. No generic CRUD or write endpoint belongs to Project Profitability.
- An optional profitability snapshot may be used only as a non-authoritative cache; it must never become the financial source of truth.

## Baseline verification

| Check | Result | Notes |
| --- | --- | --- |
| Pre-pass Final-21 static suite | PASS | 623/623 tests pass before B19.1 is added. |
| Module 19 backend | ABSENT BY SEQUENCE | No active `apps/api/src/modules/project-profitability/` folder exists. |
| Module 19 React feature | ABSENT BY SEQUENCE | No active `apps/web/src/features/project-profitability/` feature exists. |
| Authoritative profitability persistence | CORRECTLY ABSENT | No `ProjectProfitability` model or editable profitability table exists. |
| Optional snapshot cache | NOT PRESENT | The Final-21 guide makes this optional and non-authoritative; B19.2 must decide whether to omit it. |
| Module 7 Project Stages | READY | Stage value, actual-cost and billed seams already exist. |
| Module 9 Budget & Cost Tracking | READY | Append-only source-derived `CostActual` rows and Project cost aggregation exist. |
| Module 15 Client Billing | READY | Stage-aware issued invoices and Finance/AR posting are frozen. |
| Module 16 Client Receipts | READY | Posted cash, allocations, advance/unallocated and outstanding behavior are frozen. |
| Module 17 Supplier Payables | READY | Posted Supplier Invoices, payment allocations and bounded aging/outstanding reads exist. |
| Module 18 Finance | READY | Idempotent source journals, open-period controls and posted General Ledger history exist. |
| Dependency-backed build / Prisma validation | NOT RUN | The supplied source archive has no installed dependencies; no dependency-backed build claim is made. |

## Exact Module 19 public contract frozen by B19.1

### Required routes

1. `GET /api/v1/project-profitability/projects/:projectId`
2. `GET /api/v1/project-profitability/projects/:projectId/stages`
3. `GET /api/v1/project-profitability/projects/:projectId/trend`
4. `GET /api/v1/project-profitability/portfolio`

There are **zero write routes**. No POST, PUT, PATCH or DELETE endpoint may create or edit profit, revenue, cost, received, outstanding, advance or payable totals.

### Required permissions

- `project_profitability.read`
- `project_profitability.finance.read`
- `project_profitability.portfolio.read`

### Stable errors

- `PROFITABILITY_SCOPE_FORBIDDEN`
- `PROFITABILITY_SOURCE_INCOMPLETE`
- `INVALID_PROFITABILITY_FILTER`

## Ready source-of-truth seams

### Module 9 - Project Budget & Cost Tracking

`CostActual` is already append-only, Company/Project/optional-Stage scoped and protected by a unique source key. `BudgetsJobCostRepository.sumCostActuals(...)` and the bounded Job Cost ledger prove that actual cost is source-derived rather than browser-created.

Module 19 must read these actual-cost sources. It must not copy actual cost into an editable profitability table.

### Module 15 - Client Billing

Client Billing already owns Project/Client Invoices, Stage-aware Invoice lines and Finance posting. Issued/posted invoice lines are the billed source used by the existing Project Stage financial read.

Project Profitability must define one consistent approved/recognized revenue basis from the frozen Billing + Finance sources. It must not equate an Invoice total, a cash receipt or a Stage planned value automatically with profit.

### Module 16 - Client Receipts / Payments

Client Receipts already owns posted cash history and active Invoice allocations. `ClientReceiptsRepository.readReceiptFinancialTotals(...)` returns source-derived received and allocated totals for Client/Project/Stage scopes. B18.10 freezes advance/unallocated cash and the rule that receipt cash is not profit.

B19 must consume this source behavior and keep received, allocated, unallocated advance and outstanding separate. Historical allocation changes are represented through controlled Finance/audit history, so B19.4 must not invent historical allocation state from browser calculations.

### Module 17 - Supplier Payables

Supplier Payables already derives payable aging from POSTED Supplier Invoices and posted-payment allocations. This provides a reusable source for current/as-of Supplier outstanding values without storing a second AP balance in Project Profitability.

Supplier payable is a financial-position value and must remain separate from Project profit calculation.

### Module 18 - Finance & Accounting

Finance already provides idempotent source-key posting, balanced Journals, Project/Stage dimensions, controlled reversals and posted ledger history. Module 19 may use Finance to confirm the recognized accounting basis, but Finance subledger data must not be copied into editable Project Profitability records.

### Module 7 - Project Stages / Progress

Project Stages already exposes source-derived Stage actual cost and Stage billed values and consumes Client Receipt totals. Stage Weight %, Physical Progress %, Billed, Received, Actual Cost and Profit remain separate concepts.

Module 19 should reuse these ownership rules while calculating Stage profitability and reconciling Stage totals to the Project summary.

## Gaps B19.2+ must close

### Gap 1 - Project Profitability module does not yet exist

**Severity: BLOCKING**

The exact five-file backend must be introduced only when implementation begins:

- `project-profitability.routes.ts`
- `project-profitability.service.ts`
- `project-profitability.repository.ts`
- `project-profitability.schema.ts`
- `index.ts`

The React feature must later use only:

- `api/`
- `hooks/`
- `components/`
- `pages/`

No unnecessary helper folder or parallel analytical framework should be added.

### Gap 2 - Persistence/cache decision is not frozen

**Severity: HIGH**

The Final-21 guide permits `project_profitability_snapshots` only as an optional cache and says it is never authoritative.

B19.2 must explicitly decide the persistence boundary. The preferred simple implementation is **no new profitability table and no migration** unless a measured performance need justifies a cache. All authoritative numbers must remain source-derived.

### Gap 3 - Boundary schemas and vocabulary do not exist

**Severity: BLOCKING**

B19.3 must add bounded Zod schemas for:

- Project ID;
- as-of date;
- trend date window/granularity;
- bounded portfolio pagination/filtering;
- exact Project summary, Stage summary, trend and portfolio responses.

User-defined formulas and arbitrary report expressions are forbidden.

### Gap 4 - Cross-module read repository does not exist

**Severity: BLOCKING**

B19.4 must add Company/Project-scoped read aggregation for:

- Project and Stage ownership;
- actual cost from Module 9;
- billed/approved revenue basis from Module 15 / Finance;
- received, allocated and advance/unallocated cash from Module 16;
- Supplier payable from Module 17;
- Stage dimensions from Module 7.

Repository methods should read and aggregate sources. Profitability policy belongs in the service.

### Gap 5 - Deterministic profitability service does not exist

**Severity: CRITICAL**

B19.5 must calculate Project summary values using precision-safe decimal helpers and one documented revenue basis.

Required invariants:

- `profit = recognized/approved revenue - actual cost`;
- Client received cash never directly increases profit;
- billed and recognized revenue are not silently conflated when policy differs;
- outstanding uses allocated receipt value, not total cash received;
- advance/unallocated cash remains separate;
- Supplier payable remains separate from profit;
- calculations include only approved/posted source states.

### Gap 6 - Stage, trend and portfolio analytics do not exist

**Severity: HIGH**

B19.6 must add:

- Stage-by-Stage financial/profitability summary;
- bounded revenue/cost/profit trend;
- permission-scoped portfolio comparison.

Stage values must reconcile to the Project result without double counting Project-level rows or receipt allocations.

### Gap 7 - HTTP/OpenAPI surface does not exist

**Severity: HIGH**

B19.7 must expose exactly the four frozen GET routes with authentication, RBAC, allowed-Project scope, Zod validation, stable errors and complete OpenAPI metadata.

### Gap 8 - Cross-module reconciliation proof does not exist

**Severity: CRITICAL**

B19.8 must prove at minimum:

- Project actual cost equals Module 9 source actuals;
- Stage actuals reconcile correctly to Project actuals while preserving Project-level costs;
- billed/recognized revenue agrees with the selected Billing/Finance basis;
- received/allocated/advance agrees with Module 16;
- Supplier payable agrees with Module 17;
- cash received alone does not change profit;
- the canonical random advance remains cash/advance, not profit;
- cross-Company and unauthorized Project reads fail closed;
- no source record is counted twice.

### Gap 9 - React Project Profitability feature does not exist

**Severity: MEDIUM**

B19.9 must add read-only UI for:

- Project profit/loss;
- Stage financial table;
- billed vs received;
- actual cost;
- outstanding and advance;
- Supplier payable;
- trend;
- portfolio comparison.

TanStack Query owns server state. This read-only module should not add unnecessary React Hook Form write flows.

### Gap 10 - Final live/E2E freeze does not exist

**Severity: HIGH**

B19.10 must add guarded PostgreSQL/Fastify integration and Playwright coverage, then freeze Module 19 before the cross-module Integration Completion stage begins.

## Frozen B19 implementation sequence

### B19.2 - Persistence / read-model decision

Freeze the no-authoritative-table rule. Add no migration unless a non-authoritative snapshot cache is proven necessary. Record exact source status/date semantics before repository code is written.

### B19.3 - Boundary contract

Add the five-file module shell only as needed for `project-profitability.schema.ts`; freeze four GET routes, three permissions, three errors and all request/response Zod contracts.

### B19.4 - Repository source aggregation

Implement Company/Project-scoped, read-only source aggregation for Project, Stage, actual cost, Billing/Finance revenue basis, Client Receipts and Supplier Payables.

### B19.5 - Core Project profitability service

Implement deterministic Project summary calculations with precision-safe money arithmetic and the rule that Client cash is not profit.

### B19.6 - Stage, trend and portfolio service

Implement Stage reconciliation, bounded trend reads and permission-scoped portfolio comparison without adding a second source of truth.

### B19.7 - Fastify routes / RBAC / OpenAPI

Register exactly four GET routes. Add authentication, service-level authorization revalidation, filters and stable OpenAPI/error contracts.

### B19.8 - Cross-module reconciliation and security

Add integration-style static/runtime tests for source reconciliation, no-double-counting, posted/approved statuses, cross-Company isolation and negative Project permissions.

### B19.9 - React Project Profitability

Add `api/`, `hooks/`, `components/`, `pages/` only. Use TanStack Query and permission-aware read-only views.

### B19.10 - Final integration, E2E and freeze

Add guarded live PostgreSQL/Fastify and Playwright workflows, run full Final-21 regression and freeze Module 19 before Cross-module Integration Completion.

## B19.1 decision

**READY FOR B19.2.**

All hard prerequisites required by Final Module 19 are present and frozen enough to begin the persistence/read-model decision. B19.2 must preserve source ownership and should prefer **no new profitability persistence** unless a cache is explicitly justified.
