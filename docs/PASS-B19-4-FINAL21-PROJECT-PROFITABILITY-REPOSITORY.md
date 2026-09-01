# Pass B19.4 - Final-21 Project Profitability Repository Source Aggregation

## Purpose

B19.4 replaces the deferred Project Profitability repository shell with the read-only, Company-scoped source access required by Final Module 19.

This pass does **not** calculate profit, advance, outstanding, Stage reconciliation, trend buckets or portfolio metrics. It only exposes the authoritative source rows needed by the later service passes. Profitability arithmetic remains B19.5 service work.

No Prisma model, SQL view, snapshot cache or migration is added. B19.2 remains the persistence authority: Project Profitability is derived at request time and never becomes a second financial source of truth.

## Repository boundary

`ProjectProfitabilityRepository` accepts either the normal Prisma client or an active transaction client and derives `companyId` from `requireCompanyRepositoryScope()`.

The repository accepts trusted `allowedProjectIds` and intersects every requested Project set with that scope before source reads. It never accepts browser-supplied Company ownership.

The repository now exposes only the source reads needed by B19.5/B19.6:

- `findProject`
- `listPortfolioProjects`
- `listProjectStages`
- `listActualCostSources`
- `listBilledSources`
- `listRecognizedRevenueSources`
- `listClientReceiptFinanceSources`
- `listSupplierPayableSources`

## Project and Stage sources

Project identity comes from Module 6 `Project` rows inside Company and allowed-Project scope.

Stage identity comes from Module 7 `ProjectStage`. The repository also reads at most one latest `APPROVED` physical-progress row per Stage whose `progressDate` is on or before the requested as-of business date.

Stage Weight %, Physical Progress %, planned amount and later financial values remain separate concepts. The repository does not calculate overall progress or profitability.

## Actual cost source

Actual cost comes directly from Module 9 `CostActual` rows.

Each returned row keeps:

- `projectId`;
- optional `stageId`;
- amount;
- posting date;
- category;
- source type / ID / stable source key.

Project-only rows with `stageId = null` remain Project-only. No repository logic redistributes them into Stages.

## Billed source

Billed position comes from Module 15 `ClientInvoiceLine` rows whose owning Client Invoice is:

- in the same Company;
- in the requested visible Project set;
- `ISSUED`, or compatible historical `POSTED` state;
- inside the requested business-date window.

The repository returns invoice-line Stage attribution and amount. Billed is not treated as recognized revenue or cash here.

## Recognized revenue source

Recognized revenue uses the B19.2 Finance-confirmed Client Billing basis.

The repository first resolves eligible Client Invoices, then finds their `client_invoice` Finance Journals through the requested business/as-of cutoff. It also finds posted generic Finance `REVERSAL` Journals whose `sourceId` points to those original Client Invoice Journals.

Only Finance lines on Company `REVENUE` accounts are returned, preserving:

- Project ID;
- optional Stage ID;
- debit;
- credit;
- Journal source identity;
- business posting date;
- `postedAt` history.

This gives B19.5 enough durable accounting history to calculate net recognized revenue without using Client cash as revenue.

## Client receipt / allocation source

Historical Client cash and allocation values use durable Module 16 + Finance history rather than current operational allocation rows.

The repository reads these Finance source types:

- `client_receipt`
- `client_receipt_reversal`
- `client_receipt_allocation`
- `client_receipt_allocation_reversal`

It also includes a posted generic Finance reversal when one directly compensates one of those source Journals.

Returned Journal lines keep Project/Stage dimensions and GL account code/type so the later service can distinguish cash, Client Advance and Client Receivable effects with exact arithmetic.

No received, allocated, advance or outstanding value is calculated in the repository.

## Supplier payable source

Supplier payable input comes from Module 17 `POSTED` Supplier Invoices through the requested invoice-date cutoff.

Each source row includes:

- Project/vendor/invoice identity;
- invoice total;
- Stage-tagged Supplier Invoice lines;
- allocations whose `allocatedAt` is inside the as-of cutoff and whose Supplier Payment is `POSTED` in the same Company.

The repository does not distribute invoice-level payments across Stage lines. Any Stage/project-only reconciliation policy remains service work so no invented Stage allocation is introduced.

## Portfolio source discovery

Portfolio Project discovery is bounded by `PROJECT_PROFITABILITY_MAX_PAGE_SIZE`, optional Client filter and Project code/name search.

Every row preserves its own currency. The repository does not create a cross-currency grand total or introduce an FX policy that the Final-21 requirements do not define.

## Read-only guarantee

B19.4 adds no create/update/delete/upsert operation to Project Profitability.

The module still has:

- no profitability table;
- no snapshot table;
- no materialized view;
- no migration;
- no service calculation;
- no Fastify route registration;
- no React feature.

## Historical checkpoint hygiene

The B19.3 boundary test was updated only to stop treating its deliberately deferred repository shell as a permanent current-state requirement. Its historical documentation still proves that B19.3 itself added no repository aggregation.

## Verification target

B19.4 is accepted when:

- the five-file backend shape remains unchanged;
- repository reads are transaction-capable and Company-scoped;
- every requested Project set is intersected with trusted Project scope;
- Project/Stage, CostActual, Billing, Finance revenue, Client Receipt Finance history and Supplier Payable source reads exist;
- as-of cutoffs preserve the B19.2 rules;
- repository code contains no profitability/advance/outstanding arithmetic;
- repository code is read-only;
- no migration or React/HTTP/service implementation is added;
- B19.1-B19.4, Final-21, migration, workspace and cleanup checks remain green.

## Verification results

- B19.4 gate: **73/73 PASS**
- Final-21 static suite: **668/668 PASS**
- Current Foundation + Final-21 static suite: **773/773 PASS**
- Migration policy: **88/88 migrations locked across 88 gates**
- Workspace structure: **PASS**
- Legacy cleanup manifest: **PASS**
- Dependency-backed TypeScript/build verification: **not claimed**, because the supplied archive has no installed `node_modules`.

## Next pass

**B19.5 - Core Project profitability service:** calculate the Project summary with exact minor-unit arithmetic, require complete source ownership, keep billed/recognized/received/allocated/advance/outstanding/payable separate, and enforce `profit = recognized revenue - actual cost` without treating Client cash as profit.
