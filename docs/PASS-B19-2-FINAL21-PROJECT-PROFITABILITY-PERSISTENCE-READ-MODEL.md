# Pass B19.2 - Final-21 Project Profitability Persistence / Read-Model Decision

## Purpose

B19.2 freezes the persistence boundary for Final Module 19 - Project Profitability before any repository or service code is added.

The decision is intentionally simple: **Project Profitability remains a read-only derived module with no authoritative table, no snapshot table, no SQL/materialized view and no database migration in this pass.** All Project/Stage profitability values will be calculated from the already-frozen source modules.

This follows the Final-21 rule that the optional `project_profitability_snapshots` structure is cache-only and never authoritative. No performance evidence in the current archive justifies a cache, so adding one now would duplicate financial state and violate the project's simplicity rule.

## B19.2 persistence decision

### What is not persisted

Project Profitability must not persist editable or authoritative copies of:

- recognized revenue;
- billed amount;
- received cash;
- allocated receipts;
- advance/unallocated cash;
- outstanding receivable;
- Supplier payable;
- actual cost;
- Project profit/loss;
- Stage profit/loss;
- trend totals;
- portfolio totals.

No `ProjectProfitability`, `ProjectProfitabilitySnapshot` or equivalent model/table is added. No migration is added. No database view or materialized view is added.

### Runtime read model

B19.4+ will build the read model at request time:

1. repository reads Company/Project-scoped source rows;
2. service applies one deterministic financial policy using exact money arithmetic;
3. API returns the calculated read model;
4. nothing from the calculated response is written back as financial source data.

If future profiling proves a cache is necessary, that must be a separate reviewed pass. Any future snapshot must remain non-authoritative, include `as_of_date`, `source_version` and `generated_at`, and be safe to discard/rebuild from source modules.

## Frozen source and as-of semantics

B19.2 freezes the source/date behavior now so B19.4 does not invent new accounting rules inside repository code.

| Metric | Authoritative source for Module 19 | Included source state | Inclusive as-of rule | Important rule |
| --- | --- | --- | --- | --- |
| Project/Stage identity | Modules 6/7 | Existing same-Company Project/Stage inside allowed Project scope | Identity is resolved at request time | Never trust client-supplied Company ownership. |
| Actual cost | Module 9 `CostActual` | A persisted `CostActual` row is already a posted source actual; there is no editable status field | `postingDate <= asOfDate` | `stageId = null` remains Project-only cost and is never guessed into a Stage. |
| Billed amount | Module 15 `ClientInvoice` + `ClientInvoiceLine` | Final-21 issued/posted invoice states only (`ISSUED`, plus `POSTED` for compatible historical rows) | `invoiceDate <= asOfDate` | Billed is a receivable/billing measure, not cash and not automatically profit. |
| Recognized revenue used by Profit | Module 15 invoice source confirmed by Module 18 Finance | Invoice Finance source journal history; original source journal plus its compensating Finance reversal history | Journal business `postingDate <= asOfDate` and journal `postedAt <= end-of-asOfDate` | Net the revenue effect; do not use Client cash as revenue. A reversed source remains traceable through the original + compensating journal. |
| Client received cash | Module 16 + Module 18 Finance | Posted Client Receipt cash source and its controlled reversal history | Receipt/Finance business posting date through `asOfDate`; reversal contributes only when posted by the as-of cutoff | Current receipt `status` alone is not sufficient for historical as-of because a posted receipt may later be marked `REVERSED`. |
| Client allocated amount | Module 16 + Module 18 Finance | Allocation journal and allocation-reversal journal history | Allocation/reversal journal `postedAt <= end-of-asOfDate` | Historical as-of must use durable Finance history because an active allocation row is deleted after controlled unallocation. |
| Client advance/unallocated | Derived from received minus allocated | Same source history as received/allocated | Same inclusive as-of cutoff | Never store a second advance balance. Never allow a negative derived advance. |
| Client outstanding | Billed minus allocated receipts | Same Billing + allocation source rules | Same inclusive as-of cutoff | `outstanding = billed - allocated`; total received cash is not subtracted directly. |
| Supplier payable | Module 17 Supplier Payables | `POSTED` Supplier Invoices and allocations from `POSTED` Supplier Payments | `invoiceDate <= asOfDate`; `allocatedAt <= end-of-asOfDate` | Supplier payable is a financial-position value and is separate from Project profit. |
| Stage physical progress | Module 7 | `APPROVED` progress only | Latest approved progress whose `progressDate <= asOfDate` when needed for display | Physical progress is contextual information, not a revenue/cost/profit input unless a later billing policy explicitly says so. |

## Why Finance history is required for historical receipt/allocation reads

The frozen Client Receipts module intentionally keeps the operational tables simple:

- a reversed receipt changes the receipt status from `POSTED` to `REVERSED` while Finance keeps the compensating cash history;
- a controlled unallocation writes a compensating Finance journal and removes the active allocation row.

Therefore the current active receipt/allocation tables are correct for present-state operational views, but **historical Project Profitability `asOfDate` calculations must reconstruct cash/allocation effects from durable Finance posting history** rather than pretending deleted active links still exist.

This is not new persistence. It is use of the existing immutable accounting history.

## Recognized revenue policy frozen for B19.4/B19.5

For this Final-21 implementation, Profit uses a Finance-confirmed Client Billing basis:

`Project Profit = recognized Client Billing revenue - actual Project cost`

Recognized Client Billing revenue is the net revenue-account effect of Client Invoice Finance postings through the requested as-of cutoff, including controlled reversals. The Client Invoice remains the business source; Finance is the accounting confirmation/reversal history.

This keeps the following values separate:

- `billedAmount` from Client Billing;
- `recognizedRevenue` used by the profit formula;
- `receivedAmount` from Client cash history;
- `allocatedAmount` applied against invoices;
- `advanceAmount` still unallocated;
- `outstandingAmount` still receivable;
- `supplierPayableAmount` still payable;
- `actualCost` from Module 9;
- `profitAmount = recognizedRevenue - actualCost`.

## Stage reconciliation rule

Project and Stage profitability must reconcile without invented allocation:

- Stage actual cost includes only source actual rows explicitly tagged to that Stage.
- Project-only actual cost (`stageId = null`) remains visible in the Project total and must not be distributed across Stages.
- Stage billed/recognized revenue includes only invoice/revenue lines explicitly tagged to that Stage.
- Project-level invoice/revenue lines remain Project-only and must not be distributed across Stages.
- Stage received/allocated values use explicit Stage attribution and allocation source behavior; a value must be counted once only.
- The API may expose a Project-only/unattributed amount where needed so `sum(stages) + projectOnly = projectTotal` is deterministic.

## No cache justification in the current archive

B19.2 found no evidence that source aggregation has been measured and shown to require caching. The source modules already have bounded indexes on the fields needed by Module 19, including Project/Stage/date dimensions for actual cost, billing, receipts and payables.

Adding a snapshot now would create:

- another migration;
- cache invalidation logic;
- source-version ownership;
- stale-data risk;
- more files and tests;
- no proven business benefit.

The cache is therefore **deferred, not implemented**.

## Production changes intentionally deferred

B19.2 does not add:

- `apps/api/src/modules/project-profitability/`;
- React Project Profitability files;
- Zod request/response schemas;
- repository queries;
- service calculations;
- Fastify route registration;
- permissions seed migration;
- OpenAPI definitions;
- Playwright coverage.

Those begin in the later frozen passes. This keeps B19.2 limited to the persistence/read-model decision.

## Verification target

B19.2 is accepted when:

- no Project Profitability table/model/view/cache exists;
- migration count remains unchanged;
- no active Project Profitability backend or React feature has been introduced early;
- source status/date semantics above are frozen by tests/evidence;
- the complete B19.1 + B19.2 gate passes;
- Final-21, migration-policy, workspace and legacy-cleanup checks remain green.

## Next pass

**B19.3 - Project Profitability boundary contract:** add the minimal five-file backend module shell as needed for `project-profitability.schema.ts`, then freeze bounded Zod request/response contracts for the four read-only routes, three permissions and three stable errors. No repository aggregation or service calculation belongs in B19.3.
