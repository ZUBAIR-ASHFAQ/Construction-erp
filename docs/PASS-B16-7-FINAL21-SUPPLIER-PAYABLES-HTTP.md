# Pass B16.7 - Final-21 Supplier Payables HTTP and OpenAPI Registration

## Purpose

Pass B16.7 exposes the completed Supplier Payables invoice, payment, allocation and aging service through the exact Final Module 17 HTTP contract.

This pass is intentionally HTTP-only. It does not add or change Supplier Payables Prisma models, migrations, Finance posting rules, Project Cost rules, allocation rules, document-resource behavior or React UI.

## Production changes

Added:

- `apps/api/src/modules/supplier-payables/supplier-payables.routes.ts`
- `apps/api/src/modules/supplier-payables/index.ts`

Updated:

- `apps/api/src/app.ts`

The backend module now has exactly five files:

1. `supplier-payables.schema.ts`
2. `supplier-payables.repository.ts`
3. `supplier-payables.service.ts`
4. `supplier-payables.routes.ts`
5. `index.ts`

## Exact route contract

B16.7 registers exactly these eight routes:

1. `GET /api/v1/supplier-payables/invoices`
2. `POST /api/v1/supplier-payables/invoices`
3. `GET /api/v1/supplier-payables/invoices/:id`
4. `POST /api/v1/supplier-payables/invoices/:id/post`
5. `GET /api/v1/supplier-payables/payments`
6. `POST /api/v1/supplier-payables/payments`
7. `POST /api/v1/supplier-payables/payments/:id/allocations`
8. `GET /api/v1/supplier-payables/aging`

No generic PATCH, PUT or DELETE route is introduced. No Supplier Payment `/post`, reversal, credit, archive or generic CRUD endpoint is invented.

## Authentication and authorization

Every route authenticates through the existing Foundation/Administration session flow before invoking Supplier Payables service logic.

B16.7 does not trust browser Company, actor, permission or Project-scope fields. The B16.5/B16.6 service remains authoritative for Company permission and Project-resource policy revalidation.

## Zod boundaries

HTTP handlers reuse the B16.3 Supplier Payables Zod schemas for:

- list invoice filters;
- invoice creation;
- invoice identifier parameters;
- invoice posting command;
- list payment filters;
- payment creation;
- payment allocation;
- aging filters;
- invoice/payment/allocation/aging response validation.

Invalid boundaries return the existing stable `INVALID_REQUEST` envelope through the central Fastify error handler.

## Idempotency

The four retry-sensitive commands require `Idempotency-Key`:

- create Supplier Invoice;
- post Supplier Invoice;
- create/post Supplier Payment;
- allocate Supplier Payment.

Reads do not require an idempotency key.

The HTTP layer passes the key to the already-implemented Foundation idempotent service commands and does not duplicate idempotency logic.

## Supplier Payment HTTP decision

The frozen Module 17 route catalog defines `POST /api/v1/supplier-payables/payments` but does not define a separate payment-post route.

B16.6 already implemented create-and-post atomically. B16.7 exposes that behavior directly and returns `201 Created`. It does not invent a ninth route.

## OpenAPI

All eight routes include:

- `Supplier Payables` tag;
- unique operation ID;
- Bearer security metadata;
- bounded query JSON schemas where applicable;
- path parameter schemas;
- request-body schemas;
- `Idempotency-Key` header schema on write commands;
- success response schemas using the standard `{ data }` envelope;
- common error response metadata.

Operation IDs:

- `listSupplierInvoices`
- `createSupplierInvoice`
- `getSupplierInvoice`
- `postSupplierInvoice`
- `listSupplierPayments`
- `createSupplierPayment`
- `allocateSupplierPayment`
- `getSupplierAging`

Because `app.ts` registers Swagger before business routes and already exposes `/openapi.json`, Supplier Payables is now part of the generated OpenAPI route graph whenever the API is built with a database runtime.

## Persistence boundary

B16.7 adds no migration. The only Supplier Payables migrations remain:

- `20260829002100_final21_supplier_payables`
- `20260829002200_final21_supplier_payables_contract`

All B16.5/B16.6 Finance and Project Cost source-key behavior remains unchanged.

## Regression maintenance

Earlier B16.1-B16.6 static tests intentionally asserted that the HTTP layer was absent at those historical checkpoints. B16.7 updates those cumulative assertions to allow the now-approved `routes.ts`, `index.ts` and `app.ts` registration while preserving their original persistence/service boundaries.

## Deferred work

B16.7 deliberately leaves these items for later passes:

- Module 21 `supplier_invoice` document resource authorization/integration;
- Supplier Payables React feature;
- live Fastify/PostgreSQL integration and negative-permission reconciliation tests;
- Playwright workflow;
- final B16 cleanup/freeze.

## Exit decision

B16.7 is complete when exactly eight authenticated Supplier Payables routes are registered, all request/response boundaries are validated, retry-sensitive writes require Foundation idempotency keys, complete Swagger metadata is present, no unsupported endpoint is added, and the cumulative static regression remains green.

Next pass: **B16.8 - Supplier Payables cross-module integration and Module 21 document/evidence authorization verification.**
