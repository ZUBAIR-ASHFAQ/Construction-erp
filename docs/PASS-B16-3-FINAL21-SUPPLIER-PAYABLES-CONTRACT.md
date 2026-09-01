# Pass B16.3 - Final-21 Supplier Payables Boundary Contract

## Purpose

Pass B16.3 adds only the API-boundary contract required before the Supplier Payables repository/service implementation begins. It follows Final Module 17 - Supplier Payables and keeps the implementation deliberately narrow: Zod request/response schemas, the exact future HTTP route catalog, stable permission codes, stable public business errors, and one permission-only forward migration.

This pass does not add a repository, service, Fastify route registration, React feature, Finance journal posting, Project Cost source adapter, payment-allocation transaction logic, aging calculation, document-link resource type, audit/outbox events, or idempotent posting command.

## Controlling Module 17 contract

The boundary is based on the Final-21 Supplier Payables requirements:

- Supplier invoices belong to a Vendor and Project and may reference a Purchase Order and Goods Receipt.
- Supplier invoice lines may reference a Project Stage and expense/inventory GL account.
- Supplier payments belong to a Vendor, may optionally be Project-specific, and use a Finance-owned Cash/Bank account.
- payment allocation cannot exceed the payment or Supplier Invoice outstanding amount; that cross-row rule belongs to the service pass.
- posted invoice/payment history is immutable.
- Supplier payable is derived from posted invoice value minus allocated payments/credits.
- the exact HTTP surface contains eight operations and does not include generic edit/delete/reverse endpoints.

## Added boundary file

`apps/api/src/modules/supplier-payables/supplier-payables.schema.ts`

### Exact route catalog frozen

1. `GET /api/v1/supplier-payables/invoices`
2. `POST /api/v1/supplier-payables/invoices`
3. `GET /api/v1/supplier-payables/invoices/:id`
4. `POST /api/v1/supplier-payables/invoices/:id/post`
5. `GET /api/v1/supplier-payables/payments`
6. `POST /api/v1/supplier-payables/payments`
7. `POST /api/v1/supplier-payables/payments/:id/allocations`
8. `GET /api/v1/supplier-payables/aging`

No generic `PATCH`, `DELETE`, approval, payment-post or reversal route is introduced.

## Stable permissions

The exact Module 17 permission vocabulary is now frozen:

- `supplier_payables.read`
- `supplier_invoices.create`
- `supplier_invoices.post`
- `supplier_payments.create`
- `supplier_payments.allocate`

The permission-only migration grants these permissions to existing active system-admin roles using the same upgrade policy already used by Final-21 Administration.

## Stable error vocabulary

The public Module 17 errors are frozen as:

- `SUPPLIER_INVOICE_NOT_FOUND`
- `DUPLICATE_SUPPLIER_INVOICE`
- `PAYMENT_ALLOCATION_INVALID`
- `SUPPLIER_SCOPE_MISMATCH`

`SUPPLIER_INVOICE_NOT_FOUND` maps to the standard not-found envelope. The other Module 17 conflicts map to the standard conflict envelope. No SQL detail, stack trace or cross-company record is exposed by this contract.

## Supplier Invoice request boundary

The create request accepts only business input:

- Vendor
- Project
- Vendor invoice number
- invoice date
- optional due date
- optional Purchase Order
- optional Goods Receipt
- non-negative tax amount
- one or more invoice lines

Each line contains:

- optional Stage
- description
- positive exact amount
- optional expense/inventory Finance account

The browser cannot supply Company, actor, permissions, allowed Project scope, status, subtotal, total amount, payment number or allocation timestamp. Invoice subtotal and total remain server-calculated values for the service pass.

The boundary validates calendar dates, rejects a due date before the invoice date, uses exact decimal strings for money, and bounds invoice line count. Company/Vendor/Project/PO/Goods Receipt/Stage/GL account ownership remains a service/repository responsibility because it requires trusted database state.

## Supplier Payment request boundary

The create payment request accepts:

- Vendor
- optional Project
- payment date
- positive exact amount
- Finance Cash/Bank account
- optional reference

`paymentNo` and payment `status` remain server-owned. The later service pass must allocate the existing Foundation `supplier-payment` number sequence and decide the atomic create/post behavior required by the exact route contract.

## Payment allocation boundary

The allocation command accepts one or more `{ supplierInvoiceId, amount }` rows. Every amount must be positive and the same invoice cannot be duplicated inside one request.

B16.3 intentionally does **not** accept browser-provided remaining balances or outstanding totals. B16.5/B16.6 must derive those values under transaction locks and reject allocation that exceeds either the available Supplier Payment amount or Supplier Invoice outstanding.

## Aging boundary

Aging accepts only bounded Vendor/Project/as-of filters and pagination. It does not accept arbitrary formulas or browser-defined aging expressions. Response rows expose derived invoice total, allocated amount, outstanding amount and age-days fields; the service/repository will calculate them from posted source history.

## Forward migration

Added:

`20260829002200_final21_supplier_payables_contract`

The migration only seeds the five Module 17 permission codes and grants them to conventional active system-admin roles. It creates no AP tables, triggers, functions, journals or business posting behavior.

The B16.2 persistence migration remains unchanged and locked.

## Deliberately deferred

Posting, Finance, Project Cost and payment-allocation business logic remain deferred. B16.3 does not add:

- Supplier Payables repository
- Supplier Payables service
- Fastify route registration
- React feature
- Supplier Invoice posting transaction
- Supplier Payment accounting transaction
- allocation locking/outstanding calculations
- aging SQL/read model
- Module 21 `supplier_invoice` link authorization
- audit/outbox/idempotency runtime behavior

This keeps business logic out of the boundary layer and prevents duplicate or premature abstractions.

## Verification

Focused B16.3 tests verify:

- the exact eight-route catalog;
- the five stable permissions;
- the four stable errors;
- exact decimal/date/pagination boundaries;
- server-owned authority fields;
- Supplier Invoice line and payment/allocation input shape;
- derived aging output;
- the permission-only migration;
- migration gate/checksum continuity;
- runtime/UI deferral.

Dependency-backed TypeScript/Prisma compilation is still required when dependencies are installed. The supplied source archive does not include `node_modules`, so this pass does not claim an installed-dependency build gate.

## Exit decision

B16.3 is complete when the boundary schemas, permission migration, migration locks and focused tests pass without introducing repository/service/HTTP/UI behavior.

Next pass: **B16.4 - implement the company/project-scoped Supplier Payables repository only.**
