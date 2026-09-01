# Pass B16.4 - Final-21 Supplier Payables Repository

## Purpose

Pass B16.4 implements only the persistence/repository layer for Final Module 17 - Supplier Payables. It builds on the B16.2 four-table persistence and B16.3 boundary contract without adding service business logic, Fastify routes, Finance posting, Project Cost posting, audit/outbox behavior, Documents integration, or React UI.

The repository is intentionally simple. It accepts trusted Company context from the existing tenant-scope package and trusted Project visibility from the later service layer. Every named function has a short purpose comment.

## Added production file

`apps/api/src/modules/supplier-payables/supplier-payables.repository.ts`

No other Supplier Payables production file is added in this pass.

## Company and Project isolation

Every Supplier Invoice and Project-specific Supplier Payment query is Company-scoped with `requireCompanyRepositoryScope()`.

The repository also accepts `allowedProjectIds` from authenticated request context:

- `null` means Company-wide Project visibility.
- a list means only those Projects may be read or written.
- a requested Project outside the list returns no data instead of widening scope.
- a Project-restricted user cannot create or read a Project-less Supplier Payment.

The repository never accepts browser-supplied Company ownership.

## Dependency lookups

B16.4 adds narrow lookup methods needed by the later service layer:

- Vendor
- Project
- Purchase Order matched to Vendor + Project
- Goods Receipt matched to Vendor + Project
- Project Stage
- expense/inventory GL account
- Finance Cash/Bank account and mapped GL account

The repository does not decide whether a status is business-valid. B16.5/B16.6 will apply those invariants using these scoped reads.

## Supplier Invoice persistence

The repository supports:

- bounded/filterable invoice list;
- invoice detail with deterministic line order;
- duplicate Vendor invoice-number lookup;
- batch invoice lookup for payment allocation validation;
- creation of one `DRAFT` invoice and its lines;
- `FOR UPDATE` row locking before posting;
- one narrow `DRAFT -> POSTED` persistence transition;
- allocated-amount aggregation for later outstanding calculation.

`subtotal`, `taxAmount`, and `totalAmount` are accepted only from trusted service input. B16.5 must calculate them from validated lines and tax before calling the repository.

There is no edit/delete path for Supplier Invoices in B16.4 because the controlling Module 17 HTTP contract does not define generic invoice editing or deletion.

## Supplier Payment persistence

The repository supports:

- bounded/filterable payment list;
- internal payment detail with allocation history;
- server-numbered payment creation;
- `FOR UPDATE` payment locking;
- one narrow `DRAFT -> POSTED` persistence transition;
- allocated-amount aggregation for remaining-payment calculation.

The repository allows Company-wide callers to persist an optional Project-less Supplier Payment, but a restricted Project scope must provide a visible Project.

B16.6 will decide whether payment creation and Finance posting happen as one immediate posting transaction because Module 17 has no separate payment-post endpoint.

## Allocation persistence

Allocation history is append-oriented. B16.4:

- validates that the selected Supplier Payment is Company/Project-visible;
- validates that every selected Supplier Invoice is Company/Project-visible;
- appends new allocation rows;
- never updates or deletes previous allocation rows;
- exposes allocation sums for later over-allocation checks.

Amount-limit, Vendor consistency, invoice POSTED status, payment POSTED status, payment Project matching and concurrency-safe remaining-balance rules remain service responsibilities for B16.6.

## Aging source read

The repository exposes a bounded `listSupplierAgingSources` read. It returns only `POSTED` Supplier Invoices through the requested invoice-date boundary and only allocations through the requested allocation timestamp.

It intentionally does not calculate `ageDays`, outstanding amount, buckets, or business formulas. B16.6 will calculate the stable aging response from these traceable sources.

## Deliberately deferred

B16.4 does **not** implement:

- Supplier Payables service;
- Fastify routes or `app.ts` registration;
- Finance journals/AP posting;
- Project Budget/Cost posting;
- invoice/payment idempotency commands;
- audit or outbox events;
- Module 21 `supplier_invoice` document resource;
- React Supplier Payables feature;
- Playwright workflow.

It also adds no migration. The B16.2 persistence and B16.3 permission migrations remain unchanged.

## Important double-counting boundary

The repository does not post Project Cost. B16.5 must preserve the B16.1 rule that a Supplier Invoice linked to material already costed through Inventory must not blindly create a second Project actual cost. Cost ownership must be decided by the service using the operational source and stable source keys.

## Verification

Focused B16.4 tests verify repository existence, Company/Project scoping, bounded reads, dependency lookups, draft invoice persistence, row locking, controlled status transitions, payment persistence, append-only allocations, as-of aging sources, and absence of premature service/HTTP/Finance/Project-Cost behavior.

Dependency-backed TypeScript/Prisma compilation is still required when dependencies are installed. The supplied archive does not include `node_modules`, so B16.4 does not claim that installed-dependency gate.

## Exit decision

B16.4 is complete when the repository-only implementation and cumulative Final-21 static checks pass without adding service, HTTP, UI, migration, Finance or Project Cost behavior.

Next pass: **B16.5 - implement Supplier Invoice service logic, including validation, server-calculated totals, idempotent posting, Finance/AP posting and policy-controlled Project Cost integration.**
