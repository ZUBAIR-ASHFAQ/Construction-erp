# Pass B16.10 - Final-21 Supplier Payables Final Acceptance and Freeze

## Purpose

B16.10 is the final acceptance pass for Final Module 17 - Supplier Payables. It freezes the production boundary implemented in B16.1-B16.9 and adds the executable integration and browser verification harness required before advancing to Client Billing.

The final workflow is:

**Vendor / Procurement -> Supplier Invoice -> Payable -> Supplier Payment -> Allocation -> Outstanding/Aging -> Finance/Reports**

Supplier Payables owns business invoice/payment/allocation history. Finance owns the accounting representation and Cash/Bank movement. Procurement owns Purchase Orders and Goods Receipts. Project Budget & Cost owns source-derived Project/Stage cost. Module 21 owns document storage/linking.

## Frozen production scope

### Persistence

Exactly four Supplier Payables models remain active:

- `SupplierInvoice`
- `SupplierInvoiceLine`
- `SupplierPayment`
- `SupplierPaymentAllocation`

Only the two approved forward migrations remain:

- `20260829002100_final21_supplier_payables`
- `20260829002200_final21_supplier_payables_contract`

No editable Supplier balance, outstanding amount or remaining-payment column is introduced.

### Backend module

The backend remains one five-file module:

- `supplier-payables.schema.ts`
- `supplier-payables.repository.ts`
- `supplier-payables.service.ts`
- `supplier-payables.routes.ts`
- `index.ts`

### Exact HTTP contract

The module remains exactly eight operations:

1. `GET /api/v1/supplier-payables/invoices`
2. `POST /api/v1/supplier-payables/invoices`
3. `GET /api/v1/supplier-payables/invoices/:id`
4. `POST /api/v1/supplier-payables/invoices/:id/post`
5. `GET /api/v1/supplier-payables/payments`
6. `POST /api/v1/supplier-payables/payments`
7. `POST /api/v1/supplier-payables/payments/:id/allocations`
8. `GET /api/v1/supplier-payables/aging`

No generic update/delete, separate payment-post, reversal or approval endpoint is added.

## Final business invariants

### Supplier Invoice posting

- Vendor, Project, optional PO, Goods Receipt, Stage and Finance account ownership are revalidated server-side.
- Supplier Invoice totals are server-calculated with exact decimal logic.
- Posting is retry-safe through Foundation idempotency.
- One deterministic `supplier_invoice:<invoiceId>` Finance source key owns the AP journal.
- Posted Supplier Invoices are immutable.
- PO/Goods-Receipt-linked invoices do not create a second Project material cost.
- Direct expense invoices may create source-keyed Project/Stage actual cost from eligible expense lines.
- Audit and outbox evidence record posting ownership and source keys.

### Supplier Payment and allocation

- `POST /payments` creates and posts the payment atomically because the Final-21 route catalog contains no separate payment-post command.
- Payment numbering uses the Foundation `supplier-payment` sequence.
- One deterministic `supplier_payment:<paymentId>` Finance source key debits Supplier Payable and credits the Finance-owned Cash/Bank account.
- Allocation is append-only subledger history and creates no second Finance journal.
- Allocation cannot exceed either the remaining payment or the Supplier Invoice outstanding.
- Vendor and Project consistency are enforced.
- Outstanding and aging are derived from POSTED Supplier Invoices minus POSTED-payment allocations.

### Documents

Supplier Invoice evidence remains owned by Module 21 through `supplier_invoice` document links. No blob, public URL or duplicate upload/download API is owned by Supplier Payables.

## Live Fastify/PostgreSQL verification

B16.10 adds `tests/integration/final-21-supplier-payables-api.integration.test.mjs` behind `RUN_FOUNDATION_DB_TESTS=1`.

The live suite covers:

- PO/Goods Receipt linked Supplier Invoice creation and posting;
- one AP Finance journal per posted invoice source key;
- Supplier Payment Finance posting;
- idempotent invoice post and allocation retry behavior;
- payment allocation and source-derived outstanding/aging;
- no Supplier Invoice Project Cost duplication for Procurement-owned material cost;
- one direct Supplier Invoice Project/Stage cost source when Procurement is not the cost owner;
- payment/invoice over-allocation rejection with `PAYMENT_ALLOCATION_INVALID`;
- read-only permission denial;
- Project scope isolation;
- cross-Company isolation;
- Finance period failure rollback to DRAFT with no partial Finance/Project Cost side effect;
- generated OpenAPI verification for all eight operations and required idempotency headers.

Run in a disposable PostgreSQL environment:

```bash
RUN_FOUNDATION_DB_TESTS=1 npm run test:integration:final-21-supplier-payables
```

## Final Playwright workflow

B16.10 adds `tests/e2e/final-21-supplier-payables-browser.spec.mjs` and a dedicated `RUN_FINAL_21_SUPPLIER_PAYABLES_E2E=1` Playwright selector.

The browser workflow signs in through the real UI, then:

1. opens Supplier Payables;
2. creates a Supplier Invoice linked to an issued PO and received Goods Receipt;
3. posts the Supplier Invoice;
4. creates and posts a Supplier Payment;
5. allocates part of the payment to the posted invoice;
6. opens Supplier Outstanding & Aging;
7. verifies the remaining outstanding amount;
8. verifies exactly one invoice journal and one payment journal remain balanced;
9. verifies the allocation is stored once;
10. verifies the Procurement-linked Supplier Invoice did not create duplicate Project Cost;
11. verifies browser writes use only the frozen eight-route surface and carry idempotency keys.

Run with:

```bash
RUN_FOUNDATION_DB_TESTS=1 RUN_FINAL_21_SUPPLIER_PAYABLES_E2E=1 npm run test:e2e:final-21-supplier-payables
```

## Final regression matrix

| Gate | B16.10 requirement |
| --- | --- |
| B16.1-B16.10 focused static tests | Must pass |
| Complete Final-21 static regression | Must pass |
| Workspace tests | Must pass |
| Migration-system tests | Must pass |
| Migration checksum/gate policy | Must pass |
| Final-21 database cleanup | Must pass |
| Legacy cleanup manifest | Must be current |
| New Node/Playwright syntax checks | Must pass |
| Live Fastify/PostgreSQL Supplier Payables integration | Prepared for disposable DB runtime |
| Supplier Payables Playwright workflow | Prepared for disposable DB/browser runtime |
| ZIP integrity | Must pass |

## B17 handoff

B16 is frozen after this pass. The next generation-sequence work is **B17.1 - Module 15 Client Billing alignment audit**.

The source tree already contains a `client-billing` implementation, so B17.1 must audit it against the Final-21 Client Billing contract before adding or deleting production logic. The audit should preserve the Final-21 separation between physical progress, billing progress, Client Invoice, Client Receipt and recognized profitability.

## Verification completed in this handoff

Available non-database gates were executed after the B16.10 freeze changes:

- B16.1-B16.10 focused Supplier Payables static regression: **113/113 PASS**;
- complete `final-21-*` static regression: **386/386 PASS**;
- B16.10 focused + migration/workspace gate: **152/152 PASS**;
- Final-21 database-cleanup regression: **6/6 PASS**;
- migration checksum/gate policy: **83/83 migrations locked across 83 gates**;
- Final-21 legacy cleanup manifest: **PASS/current**;
- new B16.10 integration, E2E and Playwright config Node syntax checks: **PASS**;
- live Supplier Payables integration test discovery: **6 scenarios discovered and correctly guarded**.

The disposable PostgreSQL live integration and Playwright browser workflow are not claimed as executed because this source archive does not include installed runtime dependencies and this environment does not provide the required disposable PostgreSQL/browser runtime. The guarded commands are included for CI/development execution before release.
