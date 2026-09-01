# Pass B19.6 - Final-21 Project Profitability Stage, Trend and Portfolio Service

## Purpose

B19.6 completes the read-only service layer for Final Module 19 - Project Profitability.

B19.5 already implemented the single-Project profitability summary. This pass adds the remaining three service reads required before HTTP registration:

- Stage profitability / financial position with an explicit Project-only reconciliation bucket;
- bounded revenue / actual-cost / profit trend buckets;
- permission-scoped Project portfolio profitability.

Fastify route registration and OpenAPI wiring remain B19.7 work. No React feature, profitability table, cache or migration is added.

## Stage profitability

`getProjectStages(...)` loads the requested same-Company Project, Project Stages and the five frozen financial source groups through one inclusive `asOfDate`.

Each Stage response keeps these concepts separate:

- Stage weight percent;
- approved physical progress percent;
- planned Stage amount;
- recognized revenue;
- actual cost;
- profit/loss;
- billed amount;
- received cash;
- allocated cash;
- advance/unallocated cash;
- outstanding receivable;
- Supplier payable.

The service never uses Stage weight, physical progress, billing progress or cash received as a replacement for another value.

### Explicit Stage attribution only

Actual cost, billed amount and Finance-confirmed recognized revenue are assigned to a Stage only when their frozen source row contains that Stage ID.

Client Receipt and allocation history is assigned through the Stage carried by its immutable Finance Journal lines. Every Receipt Journal used by Module 19 must resolve to exactly one visible Project and one explicit-or-null Stage. Mixed or missing Project attribution fails with `PROFITABILITY_SOURCE_INCOMPLETE`.

Any financial source Stage ID that is not part of the requested Project Stage set also fails closed.

### Project-only bucket

Rows whose `stageId` is null remain Project-only. They are not proportionally distributed or guessed into Stages.

Supplier payment allocations in the current Final-21 Supplier Payables model are invoice-level, not Stage-allocation-level. Therefore **remaining Supplier payable is intentionally kept in the Project-only bucket** instead of inventing a Stage payment allocation rule. Stage rows expose zero Supplier payable until a future authoritative Stage allocation source exists.

This keeps the rule deterministic:

`sum(Stage values) + Project-only values = Project total`

The service verifies this reconciliation for all nine frozen financial measures.

If a Project-level Client Receipt allocation would make a Project-only bucket impossible, for example an untagged allocation reducing explicitly Stage-tagged billing without authoritative Stage allocation, the service returns `PROFITABILITY_SOURCE_INCOMPLETE` rather than producing a negative Project-only outstanding balance or guessing a Stage split.

## Trend service

`getProjectTrend(...)` uses the B19.3 bounded trend contract and returns only:

- recognized revenue;
- actual cost;
- profit = recognized revenue - actual cost.

Cash received, allocations, advances, outstanding and Supplier payable are intentionally excluded from trend points.

The trend uses:

- Module 9 `CostActual.postingDate` for actual cost;
- Finance-confirmed Client Invoice Revenue Journal `postingDate` for recognized revenue.

Every billed source in the requested window must still have Finance-confirmed Client Invoice ownership.

### Deterministic buckets

The service creates empty buckets as well as buckets containing activity so chart output has no unexplained gaps.

- `DAY` = UTC calendar day;
- `WEEK` = Monday-based WEEK, clipped to the requested from/to window;
- `MONTH` = UTC calendar month, clipped to the requested from/to window.

The maximum window remains the frozen 366-day B19.3 contract.

## Portfolio service

`getPortfolio(...)` is bounded by the frozen page-size contract and defaults to page 1 / 25 items.

Before any Project discovery, the service intersects:

1. trusted request Project scope;
2. `project_profitability.read`;
3. `project_profitability.finance.read`;
4. `project_profitability.portfolio.read`.

Only the resulting Project IDs are passed to the repository.

After the bounded Project page is known, B19.6 batch-reads the five source groups for that page and calculates each Project independently. Each item retains its own currency. No cross-currency grand total, conversion or portfolio currency is created.

## Shared financial rules

All new B19.6 service reads continue to use signed `bigint` minor-unit arithmetic.

For every Project/Stage bucket:

`profit = recognized revenue - actual cost`

`advance = received - allocated`

`outstanding = billed - allocated`

Allocated cash may not exceed received cash or the billed amount of the same authoritative bucket. The service fails with `PROFITABILITY_SOURCE_INCOMPLETE` instead of clamping impossible values.

Client cash remains separate from profit.

## Scope intentionally deferred

B19.6 does not add:

- Fastify route registration;
- OpenAPI route definitions;
- React Project Profitability UI;
- database persistence or migration;
- snapshot/cache logic;
- cross-module live integration/E2E freeze.

## Next pass

**B19.7 - Project Profitability HTTP, RBAC and OpenAPI:** register exactly the four frozen GET routes, parse the B19.3 Zod contracts, expose the completed service methods, keep service-level authorization authoritative, and verify the OpenAPI surface without adding write endpoints.

## Verification results

- B19.6 focused gate including B18.10 handoff, migration and workspace checks: **100/100 PASS**
- B19.1-B19.6 Project Profitability alignment: **72/72 PASS**
- Final-21 static suite: **695/695 PASS**
- Current static suite: **800/800 PASS**
- Migration policy: **88/88 migrations locked across 88 gates**
- Workspace structure: **PASS**
- Legacy database-cleanup manifest: **6/6 PASS**
- TypeScript syntax transpile for the changed service: **PASS**
- Dependency-backed TypeScript/build verification: **not claimed**, because the supplied archive has no installed `node_modules`.
