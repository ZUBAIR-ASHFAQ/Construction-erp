# Pass B19.3 - Final-21 Project Profitability Boundary Contract

## Purpose

B19.3 introduces the minimal five-file backend shell and freezes the Zod/API vocabulary for Final Module 19 - Project Profitability before any source aggregation or calculation is implemented.

The module remains **read-only and source-derived**. No repository aggregation, profitability service calculation, Fastify registration, React feature or migration is added in this pass. B19.2 remains authoritative for source/as-of semantics and the no-authoritative-profitability-table decision.

## Five-file backend shell

`apps/api/src/modules/project-profitability/` now contains exactly:

- `project-profitability.routes.ts`
- `project-profitability.service.ts`
- `project-profitability.repository.ts`
- `project-profitability.schema.ts`
- `index.ts`

Only `project-profitability.schema.ts` contains the new boundary implementation. The repository, service and routes files are deliberately tiny deferred shells so no partial runtime behavior can be mistaken for a working analytical module.

## Exact read-only HTTP contract

B19.3 freezes exactly four GET routes:

1. `GET /api/v1/project-profitability/projects/:projectId`
2. `GET /api/v1/project-profitability/projects/:projectId/stages`
3. `GET /api/v1/project-profitability/projects/:projectId/trend`
4. `GET /api/v1/project-profitability/portfolio`

There are zero write routes. Project Profitability never accepts browser-created profit, cost, revenue, billed, received, outstanding, advance or payable totals.

## Permission vocabulary

Exactly three Module 19 permissions are frozen:

- `project_profitability.read`
- `project_profitability.finance.read`
- `project_profitability.portfolio.read`

The actual route/service permission enforcement remains B19.7 work because registering handlers before source aggregation exists would expose incomplete runtime behavior.

## Stable business errors

Exactly three public business errors are frozen:

- `PROFITABILITY_SCOPE_FORBIDDEN`
- `PROFITABILITY_SOURCE_INCOMPLETE`
- `INVALID_PROFITABILITY_FILTER`

The schema maps them to the shared error envelope through Authorization, Conflict and Validation errors respectively.

## Request contracts

### Project and Stage summary

Project-scoped reads accept:

- server-resolved `projectId` path parameter;
- optional inclusive `asOfDate` in real `YYYY-MM-DD` calendar format.

No Company ownership, Project scope, permission set, formula or derived total can be supplied by the client.

### Trend

Trend requires:

- `fromDate`;
- `toDate`;
- `granularity` = `DAY`, `WEEK` or `MONTH`.

The date pair is ordered and limited to an inclusive maximum of 366 days so analytical reads remain bounded.

### Portfolio

Portfolio supports only bounded filters needed by the later permission-scoped read:

- optional `asOfDate`;
- optional text `search`;
- optional `clientId`;
- `page`;
- `pageSize`, maximum 100.

Strict Zod objects reject arbitrary formula/expression parameters.

## Response contracts

### Project summary

The response keeps all major concepts separate:

- `recognizedRevenue`;
- `actualCost`;
- `profitAmount`;
- `billedAmount`;
- `receivedAmount`;
- `allocatedAmount`;
- `advanceAmount`;
- `outstandingAmount`;
- `supplierPayableAmount`.

`profitAmount` is signed exact money because a Project may be in loss. Cash, billed, outstanding, advance and Supplier payable remain distinct fields and are never aliases for profit.

### Stage summary

Each Stage keeps separate:

- Stage Weight %;
- Physical Progress %;
- planned amount;
- the nine financial measures above.

The response also has explicit `projectOnly` and `projectTotal` financial buckets. This preserves B19.2's rule that Project-only actual cost or revenue rows are never guessed or distributed into Stages merely to force a visual total.

### Trend

Each trend bucket contains only:

- period start/end;
- recognized revenue;
- actual cost;
- profit.

Cash movement and Supplier payable are intentionally excluded from the trend profit formula.

### Portfolio

Each portfolio row carries its own Project currency. B19.3 does not define a cross-currency grand total because summing unrelated currencies would be misleading without an explicit FX policy that the Final-21 requirements do not define.

## Precision and validation

Money is serialized as exact decimal strings, not JavaScript floating-point numbers. Profit/revenue/cost read-model values may be signed where accounting corrections can create a net effect; billed/received/allocated/advance/outstanding/payable values use non-negative exact decimal contracts.

Percentages are exact 0-100 decimal strings with up to four decimal places, matching the Stage precision rules.

## Server-owned authority

The boundary explicitly marks the following as server-owned and rejects them from strict request bodies/queries:

- Company and actor identity;
- permissions and allowed Project scope;
- all authoritative financial totals;
- formula/expression fields.

Module 19 will calculate from approved/posted sources only after B19.4/B19.5 implementation exists.

## No persistence or runtime registration change

B19.3 adds:

- no Prisma model;
- no migration;
- no SQL/materialized view;
- no cache;
- no `app.ts` route registration;
- no permission seed migration;
- no React feature.

Historical migrations stay untouched.

## Verification target

B19.3 is accepted when:

- the Project Profitability backend folder has exactly five files;
- exactly four GET routes, three permissions and three stable errors are frozen;
- project/as-of/trend/portfolio request schemas are strict and bounded;
- Project/Stage/trend/portfolio response contracts preserve source concepts without double-purpose fields;
- no write route, repository aggregation, service calculation, HTTP registration, React feature or migration exists;
- B19.1 through B19.3, Final-21, migration-policy, workspace and legacy-cleanup checks remain green.


## Verification results

- B19.3 gate: **59/59 PASS**
- Final-21 static suite after this pass: **654/654 PASS**
- Current Foundation + Final-21 static suite: **759/759 PASS**
- Migration policy: **88/88 migrations locked across 88 gates**
- Workspace structure: **PASS**
- Legacy cleanup manifest: **PASS**
- Dependency-backed TypeScript/build verification: **not claimed**, because the supplied archive has no installed `node_modules`.

## Next pass

**B19.4 - Project Profitability repository source aggregation:** replace the repository shell with Company/Project-scoped read-only aggregation for Project/Stage identity, Module 9 actual cost, Module 15/18 billed and recognized revenue sources, Module 16 receipt/allocation history and Module 17 Supplier Payables. Profitability policy remains in the later service pass.
