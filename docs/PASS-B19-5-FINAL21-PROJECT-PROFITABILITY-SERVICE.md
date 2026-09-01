# Pass B19.5 - Final-21 Core Project Profitability Service

## Purpose

B19.5 implements the first production calculation layer for Final Module 19 - Project Profitability.

This pass is deliberately limited to the **single-Project summary**. Stage reconciliation, trend buckets and portfolio comparison remain B19.6 work. Fastify route registration remains B19.7 work, so the module is still not exposed through HTTP in this pass.

The service follows the frozen Final-21 rule:

`profit = recognized revenue - actual cost`

Client cash received is not profit. Billed, recognized revenue, received, allocated, advance, outstanding, Supplier payable, actual cost and profit remain separate values.

## Security and Project scope

`ProjectProfitabilityService.getProjectSummary(...)` revalidates authorization inside the service before reading any source data.

The service:

- reads the authenticated actor and Project scope from the trusted request context;
- fails closed when Project scope is unresolved;
- rejects a requested Project outside a restricted request Project scope;
- rechecks persisted same-Company Project access through `AdministrationRepository.findEffectivePermissionCodesForProject(...)`;
- requires both `project_profitability.read` and `project_profitability.finance.read` for the Project financial summary;
- returns `PROFITABILITY_SCOPE_FORBIDDEN` rather than leaking whether an out-of-scope Project exists.

The repository receives only the single already-authorized Project ID.

## As-of behavior

The optional `asOfDate` defaults to the current UTC date.

One source window is built with:

- business date cutoff at `YYYY-MM-DDT00:00:00.000Z` for date-only source columns;
- durable posting cutoff at `YYYY-MM-DDT23:59:59.999Z` for Finance `postedAt` history.

This preserves B19.2 historical semantics for Billing, Finance, Client Receipts and Supplier Payables.

## Exact money arithmetic

All Project profitability calculations use signed integer minor units backed by `bigint`.

The implementation does not use `parseFloat`, `toFixed`, `Math.round` or JavaScript floating-point arithmetic for money. The helper correctly preserves signed accounting values, including values such as `-0.50` produced by reversals or corrections.

The final response is serialized back to exact two-decimal strings and validated through the frozen B19.3 `projectProfitabilitySummaryResponseSchema`.

## Source calculations

The service reads the five frozen source groups in parallel after Project authorization succeeds.

### Actual cost

Actual cost is the sum of Module 9 `CostActual.amount` rows through the requested as-of date.

No browser-entered Project Profitability cost exists and no second cost balance is persisted.

### Billed amount

Billed amount is the non-negative sum of eligible Module 15 Client Invoice lines returned by the B19.4 repository.

Billed remains a billing/receivable measure and is not used as a shortcut for recognized revenue or cash.

### Recognized revenue

Recognized revenue is calculated from the net Finance Revenue-account effect returned by B19.4:

`recognized revenue = revenue credits - revenue debits`

Before calculating the Project result, B19.5 requires every billed Client Invoice represented in the source rows to have its Finance-confirmed original `client_invoice` revenue source. If a billed source exists without that Finance ownership, the service returns `PROFITABILITY_SOURCE_INCOMPLETE` instead of guessing a revenue value.

Finance reversal rows remain part of the net revenue effect, so recognized revenue can differ from billed amount when accounting history has been reversed or corrected.

### Received and allocated Client cash

Historical Client cash and allocation values are reconstructed from immutable Finance source history rather than current active allocation rows.

B19.5 recognizes:

- `client_receipt` as positive received cash;
- `client_receipt_reversal` as negative received cash;
- `client_receipt_allocation` as positive allocated cash;
- `client_receipt_allocation_reversal` as negative allocated cash;
- generic Finance `REVERSAL` as the exact opposite effect of its referenced source Journal.

Each Journal must remain balanced before its amount is used.

The service then derives:

`advance = received - allocated`

`outstanding = billed - allocated`

If net allocated cash exceeds net received cash or billed amount, B19.5 fails with `PROFITABILITY_SOURCE_INCOMPLETE`. It never clamps or stores an impossible negative advance/outstanding balance.

### Supplier payable

Supplier payable is derived independently for each posted Supplier Invoice:

`invoice payable = invoice total - posted payment allocations`

An allocation above the invoice total is treated as incomplete/inconsistent source history. Supplier payable is not part of the Project profit formula.

## Final Project summary

The Project summary returns the frozen nine financial concepts independently:

- recognized revenue;
- actual cost;
- profit amount;
- billed amount;
- received amount;
- allocated amount;
- advance amount;
- outstanding amount;
- Supplier payable amount.

Only this line determines profit:

`profitAmount = recognizedRevenue - actualCost`

Received cash, billed amount, allocation amount, advance, outstanding and Supplier payable do not directly modify profit.

## Scope intentionally deferred

B19.5 does not implement:

- Stage-by-Stage profitability or Project-only reconciliation bucket;
- trend bucket generation;
- portfolio Project comparison;
- HTTP/Fastify route registration;
- OpenAPI wiring;
- React UI;
- profitability table, cache or migration.

Stage, trend and portfolio service behavior is B19.6.

## Historical checkpoint hygiene

B19.3 and B19.4 tests were adjusted only where they previously asserted that the current service file must still be the intentionally deferred shell. Their own documentation/evidence remains the authority that those earlier passes did not implement service calculations at that time.

No earlier production source behavior was rewritten.

## Verification target

B19.5 is accepted when:

- the backend folder still contains exactly five files;
- the Project summary service exists and routes are still unregistered;
- service authorization checks request Project scope plus persisted Project permissions;
- money arithmetic is exact and signed;
- all five source groups are consumed;
- every billed Invoice has Finance-confirmed revenue ownership;
- recognized revenue uses Revenue credits minus debits;
- durable receipt/reversal history produces received and allocated values;
- advance, outstanding and Supplier payable are derived independently;
- `profit = recognized revenue - actual cost` and Client cash is not profit;
- impossible negative financial positions fail with `PROFITABILITY_SOURCE_INCOMPLETE`;
- no Project Profitability write, persistence model or migration is added;
- B19.1-B19.5, Final-21, migration, workspace and cleanup checks remain green.

## Next pass

**B19.6 - Stage, trend and portfolio service:** add deterministic Stage reconciliation including the Project-only bucket, bounded revenue/cost/profit trend buckets and permission-scoped portfolio comparisons without creating a second source of truth.

## Verification results

- B19.1-B19.5 alignment suite: **58/58 PASS**
- B19.5 focused gate including B18.10 handoff, migration and workspace checks: **86/86 PASS**
- Final-21 static suite: **681/681 PASS**
- Foundation / maintenance static checks: **99/99 PASS**
- Migration policy: **88/88 migrations locked across 88 gates**
- Workspace structure: **PASS**
- Legacy cleanup manifest: **PASS**
- Dependency-backed TypeScript/build verification: **not claimed**, because the supplied archive has no installed `node_modules`.
