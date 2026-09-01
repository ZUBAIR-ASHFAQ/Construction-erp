# Pass B16.6 - Final-21 Supplier Payment, Allocation and Aging Service

## Purpose

Pass B16.6 completes the Supplier **Payment**, payment-to-invoice **allocation**, derived **outstanding**, and **aging** service slice of Final Module 17 - Supplier Payables.

The source requirements explicitly require Supplier Payments from Cash/Bank, allocation to one or more Supplier Invoices, supplier payable/outstanding/aging, immutable posted history, and Finance integration. The source also freezes the Module 17 HTTP contract without a separate Supplier Payment posting endpoint.

No Prisma model or migration is added in B16.6.

## Production changes

Extended:

- `apps/api/src/modules/supplier-payables/supplier-payables.service.ts`
- `apps/api/src/modules/supplier-payables/supplier-payables.repository.ts`
- comments only in `packages/database/prisma/schema.prisma` to remove now-stale "later service pass" wording

Still deliberately absent:

- `supplier-payables.routes.ts`
- Supplier Payables `index.ts`
- React Supplier Payables feature
- Module 21 `supplier_invoice` resource enablement
- Playwright workflow

Those remain later-pass work.

## Supplier Payment read scope

`listSupplierPayments(...)` uses `supplier_payables.read`, authenticated Company context, and persisted Project permission scope.

Project-less Supplier Payments are visible only when the authenticated context is allowed to see Company-wide payment records. Restricted Project users are not allowed to use a Project-less payment as a way around Project scope.

## Create and post behavior

The Final-21 route catalog contains:

`POST /api/v1/supplier-payables/payments`

but no separate Supplier Payment post route. B16.6 therefore makes one explicit implementation decision: **create and post the payment atomically** inside that command. This avoids inventing a ninth Module 17 endpoint and avoids leaving a real Cash/Bank payment in an externally visible draft state.

The command is Foundation-idempotent and:

1. revalidates `supplier_payments.create`;
2. validates same-Company Vendor;
3. validates optional Project and Project permission;
4. validates an active same-Company Finance Cash/Bank account and its active GL account;
5. validates active liability account `SUPPLIER-PAYABLE`;
6. allocates the existing Foundation `supplier-payment` sequence;
7. creates the payment as `DRAFT` inside the transaction;
8. posts Finance using a deterministic source key;
9. changes `DRAFT -> POSTED` only after Finance succeeds;
10. records audit and outbox evidence.

If any step fails, the transaction rolls back, including the allocated business number.

## Payment accounting

The source requirements state that a Supplier cash payment reduces payable and Cash/Bank. B16.6 implements that directly and does not invent a new Supplier Advance/Unapplied GL account that is absent from the controlling specification.

Finance source key:

` supplier_payment:<supplierPaymentId> `

Balanced journal:

- debit `SUPPLIER-PAYABLE`;
- credit the selected Cash/Bank GL account.

Project ID is carried as the optional Finance dimension when the Supplier Payment itself is Project-specific.

The allocation command does **not** post Finance again. This prevents double counting the same cash/AP effect.

## Immutable allocation behavior

`allocateSupplierPayment(...)` is an idempotent explicit command.

The service:

- row-locks the Supplier Payment;
- requires payment status `POSTED`;
- locks target Supplier Invoices in deterministic sorted-ID order;
- requires every target invoice to be `POSTED`;
- requires the same Vendor;
- requires the same Project when the payment is Project-specific;
- revalidates `supplier_payments.allocate` on every involved Project;
- derives previously allocated amounts from immutable allocation rows;
- rejects allocation beyond remaining payment;
- rejects allocation beyond invoice outstanding;
- appends new allocation rows only;
- records `supplier_payment.allocated` audit/outbox evidence.

No prior allocation is edited or deleted, and no stored outstanding or remaining-payment column is introduced.

## Outstanding rule

Invoice outstanding is derived as:

`posted supplier invoice total - posted Supplier Payment allocations`

The service uses exact integer minor-unit arithmetic for all comparisons and response values.

The remaining unallocated portion of a Supplier Payment is likewise derived as:

`payment amount - existing allocations - new allocations`

It is recorded in allocation audit/outbox evidence but is not persisted as an editable balance field.

## Aging

The requirements require Supplier aging but do not define bucket ranges or an exact `ageDays` basis. B16.6 intentionally does **not** invent aging buckets or browser formulas.

For the already-frozen `ageDays` response field, B16.6 uses the smallest deterministic rule needed by the contract:

- use invoice **due date** when present;
- otherwise use invoice date;
- calculate whole UTC calendar days through the requested `asOfDate`;
- clamp future/not-yet-due values to `0`.

Aging source rows are restricted to `POSTED` Supplier Invoices. Only allocations belonging to `POSTED` Supplier Payments and occurring on or before the inclusive end of `asOfDate` contribute to allocated/outstanding values.

This rule is an implementation choice for a source gap, not a claim that the requirements defined aging buckets.

## Audit and outbox

B16.6 emits:

- `supplier_payment.posted`
- `supplier_payment.allocated`

Audit records include Finance source ownership for posting and allocation IDs/remaining payment for allocation traceability.

## Deliberately deferred to B16.7+

B16.6 does not add:

- Fastify routes;
- OpenAPI registration;
- a ninth payment-post route;
- Supplier Payment reversal route;
- generic PATCH or DELETE behavior;
- Module 21 Supplier Invoice document links;
- React Supplier Payables UI;
- browser E2E.

The controlling Module 17 route contract does not define a Supplier Payment reversal endpoint, so B16.6 does not invent one. Final correction/reversal reconciliation remains an integration/final-acceptance concern within the controlling API boundary.

## Verification boundary

Static regression coverage checks:

- Foundation `supplier-payment` numbering;
- server-side payment scope and Cash/Bank validation;
- atomic AP/Cash posting;
- source-key idempotency;
- payment/invoice row locking;
- same-Vendor/Project allocation rules;
- both sides of over-allocation protection;
- append-only allocations;
- no duplicate Finance posting during allocation;
- posted-only as-of aging sources;
- deterministic documented `ageDays` behavior;
- no B16.6 migration, routes or React feature;
- purpose comments on named functions.

Dependency-backed Prisma/TypeScript/PostgreSQL verification remains mandatory when project dependencies and a disposable PostgreSQL database are available. This archive does not claim unavailable live runtime gates.

## Exit decision

B16.6 is complete when Supplier Payment creation posts Cash/Bank and AP atomically, allocations cannot exceed either payment availability or invoice outstanding, aging is derived from posted source history without stored balance shortcuts, and cumulative Final-21 static regression remains green.

Next pass: **B16.7 - register the exact eight-route Supplier Payables Fastify/OpenAPI contract against the completed invoice/payment services.**
