# Pass B19.8 - Final-21 Project Profitability Cross-Module Reconciliation and Security

## Purpose

B19.8 verifies the completed Module 19 backend against its authoritative source modules before any React work begins. No new profitability business state is introduced. The existing Project Profitability repository, service and four GET routes remain read-only.

This pass adds guarded PostgreSQL/Fastify integration coverage for reconciliation across **Modules 9, 15, 16, 17 and 18**, Stage drill-down, permission scope, cross-Company isolation, approved/posted source filtering and the critical rule that Client cash is not profit.

## Frozen reconciliation scenario

The live fixture uses one Project with two Stages plus Project-only source rows. At `2026-08-29` the expected Project values are:

- recognized revenue: `1700.00`
- actual cost: `600.00`
- profit: `1100.00`
- billed: `1700.00`
- received: `1500.00`
- allocated: `1000.00`
- advance: `500.00`
- outstanding: `700.00`
- Supplier payable: `650.00`

The Stage response must reconcile every one of these measures as:

`sum(Stage values) + Project-only value = Project total`

Supplier payable remains in the Project-only bucket because Module 17 payment allocation does not provide Stage allocation authority. No value is guessed or distributed by Stage weight.

## Source ownership verified

- **Module 9 Project Budget & Cost Tracking** owns source-derived `cost_actuals`.
- **Module 15 Client Billing** owns billed Client Invoice lines.
- **Module 18 Finance** confirms recognized revenue from posted Client Invoice journals and provides durable Client Receipt/allocation history.
- **Module 16 Client Receipts** remains the cash business source; persisted receipt/allocation rows are present in the fixture but are not counted a second time by Module 19.
- **Module 17 Supplier Payables** owns posted Supplier Invoice/payment allocation history.
- **Module 7 Project Stages** owns Stage identity and approved physical progress.

This proves **no double counting** between operational rows and Finance representation.

## Cash is not profit

The canonical random-payment case is covered directly: a **Rs. 500,000** Client advance with no invoice produces:

- received `500000.00`
- advance `500000.00`
- billed `0.00`
- recognized revenue `0.00`
- actual cost `0.00`
- profit `0.00`

The cash receipt therefore never increases Project profit by itself.

## Source-status and as-of filtering

The integration fixture intentionally includes rows that must not affect the `2026-08-29` answer:

- Draft Client Invoice and Draft Finance revenue journal;
- Draft Client Receipt Finance journal;
- Draft Supplier Invoice;
- Draft Supplier Payment allocation;
- future Project cost after the as-of date;
- submitted Stage progress and approved future Stage progress.

Only the allowed approved/posted source states and source dates contribute to the response.

## Security verification

The guarded API scenarios prove:

- all three Module 19 permissions remain required where applicable;
- a restricted actor can read only its explicitly allowed Project;
- an actor missing `project_profitability.finance.read` is rejected;
- a Company A actor cannot read a Company B Project;
- a Company B administrator cannot read Company A values;
- portfolio results intersect request Project scope with all three required permissions;
- failures use the frozen `PROFITABILITY_SCOPE_FORBIDDEN` code.

Repository Company scoping and service authorization remain authoritative. No route-level shortcut is introduced.

## Trend verification

The DAY trend fixture proves that trend values use only:

- Finance-confirmed recognized revenue; and
- Module 9 actual cost.

Client receipts, allocations, advances and Supplier payable are not added to profit trend buckets.

## Code and migration impact

B19.8 changes verification infrastructure only:

- adds `tests/final-21-project-profitability-b19-8-reconciliation-security.test.mjs`;
- adds guarded `tests/integration/final-21-project-profitability-api.integration.test.mjs`;
- adds that live test to the current integration runner;
- advances the B19 gate/alignment scripts without growing the root script surface.

The five production Module 19 files are unchanged. No React feature is added. No profitability table, snapshot, cache, SQL view or database migration is added.

## Live execution guard

The PostgreSQL/Fastify test is intentionally guarded by `RUN_FOUNDATION_DB_TESTS=1` and runs through the existing current integration runner after the compiled runtime is available. The supplied archive does not include installed `node_modules` or a disposable PostgreSQL runtime, so live execution is not claimed in this pass artifact.

## Verification results

- B19.8 focused gate: **129/129 PASS**
- Project Profitability B19.1-B19.8 alignment: **101/101 PASS**
- Final-21 static suite: **724/724 PASS**
- Current static suite: **829/829 PASS**
- Migration policy: **89 migrations locked across 89 gates - PASS**
- Workspace structure and required stack: **PASS**
- Legacy cleanup manifest: **PASS**
- Guarded live integration test syntax: **PASS**
- Dependency-backed PostgreSQL/Fastify execution: **not claimed**, because this archive contains no installed `node_modules` or disposable PostgreSQL runtime.

## Next pass

**B19.9 - Project Profitability React feature:** add the standard `api/`, `hooks/`, `components/` and `pages/` feature using the already-frozen four read-only backend operations. No new profitability calculation or source ownership should move into the browser.
