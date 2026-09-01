# Pass B16.5 - Final-21 Supplier Invoice Service

## Purpose

Pass B16.5 implements the Supplier **Invoice** business-service slice of Final Module 17 - Supplier Payables. It builds on the B16.2 persistence, B16.3 boundary contract and B16.4 repository without registering HTTP routes, implementing Supplier Payment/allocation behavior, enabling Module 21 `supplier_invoice` document links, or adding React UI.

The implementation stays inside the Final-21 ownership boundary: Supplier Payables owns supplier invoice state; Finance owns accounting; Project Budget & Cost remains source-derived; Procurement remains the Purchase Order/Goods Receipt owner.

## Production changes

Added:

- `apps/api/src/modules/supplier-payables/supplier-payables.service.ts`

Narrowly extended:

- `apps/api/src/modules/supplier-payables/supplier-payables.repository.ts`
  - same-Company GL lookup by stable account code;
  - active Subcontractor lookup for direct-cost category selection;
  - idempotent `cost_actuals` persistence for policy-approved direct Supplier Invoice expense lines.

No Prisma model or migration is added in B16.5.

## Supplier Invoice permissions

The service revalidates permissions from Administration and authenticated Project scope:

- `supplier_payables.read` for list/detail;
- `supplier_invoices.create` for draft creation;
- `supplier_invoices.post` for posting.

Company permission never widens the authenticated Project scope. Project-level grants are resolved from persisted Administration data.

## Draft creation

`createSupplierInvoice(...)` is retry-safe through Foundation idempotency.

Before persistence the service verifies:

- Vendor exists in the same Company and is active;
- Project exists inside allowed scope and is not closed;
- Vendor currency, when configured, matches Project currency because the current Supplier Invoice persistence has no independent currency field;
- optional Purchase Order belongs to the same Vendor/Project/Company, is issued and matches Project currency;
- optional Goods Receipt belongs to the same Vendor/Project/Company, is received, and matches the selected PO when both are supplied;
- every optional Stage belongs to the Supplier Invoice Project;
- every supplied line account is an active same-Company `EXPENSE` or `ASSET` account.

The browser cannot provide `subtotal` or `totalAmount`. The service calculates exact decimal totals from line amounts plus validated tax using integer minor-unit arithmetic. It does not use JavaScript floating-point money calculations.

Vendor invoice number duplication is rejected with `DUPLICATE_SUPPLIER_INVOICE` and remains backed by the B16.2 Company + Vendor + invoice-number unique constraint.

## Posting and Finance/AP ownership

`postSupplierInvoice(...)` is an explicit idempotent command. It row-locks the invoice and only permits `DRAFT -> POSTED`.

Before posting, every line must have an active expense/inventory account. The service recalculates totals from stored immutable lines and rejects any stored total mismatch.

Finance posting uses one deterministic source key:

` supplier_invoice:<supplierInvoiceId> `

The journal is balanced as:

- debit each Supplier Invoice line's selected expense/inventory account;
- debit `INPUT-TAX` when `tax_amount > 0`;
- credit `SUPPLIER-PAYABLE` for the full invoice total.

`SUPPLIER-PAYABLE` must be an active liability GL account. `INPUT-TAX`, when needed, must be an active asset GL account. These are Finance-owned accounts; B16 does not create a second AP or tax account master.

The Finance journal and Supplier Invoice status transition occur inside the same database transaction. If Finance posting fails, the Supplier Invoice is not marked posted.

## Project Cost double-counting policy

B16.1 identified the key risk that an AP invoice must not create a second Project cost when Procurement/Inventory already owns the operational material cost.

B16.5 implements the following explicit policy:

1. **PO- or Goods-Receipt-linked Supplier Invoice**
   - creates the AP/Finance effect;
   - does **not** create another Project `cost_actual` from the invoice;
   - operational material cost remains owned by the existing Inventory/operational source flow.

2. **Direct Supplier Invoice without PO or Goods Receipt**
   - `EXPENSE` lines create idempotent Project/Stage actual-cost rows;
   - an active linked Subcontractor Vendor uses category `subcontract`;
   - other direct expense Vendors use category `other`;
   - `ASSET`/inventory lines do not become Project actual cost merely because an AP invoice exists.

Direct-cost source keys are deterministic per invoice line:

` supplier_invoice:<supplierInvoiceId>:line:<supplierInvoiceLineId> `

This keeps Project Cost source-derived and prevents a single invoice retry from duplicating cost history.

## Audit and outbox

Meaningful lifecycle writes are traceable:

- draft creation records `supplier_invoice.created` audit evidence;
- posting records `supplier_invoice.posted` audit evidence;
- successful posting emits `supplier_invoice.posted` through the Foundation outbox.

The posting audit records whether Project Cost was `operational-source-owned` or created from `direct-expense-lines`.

## Deliberately deferred to B16.6+

B16.5 does not implement:

- Supplier Payment creation/posting;
- Foundation `supplier-payment` number allocation in the service;
- payment-to-invoice allocation;
- outstanding and aging calculations;
- Fastify routes or module registration;
- Module 21 `supplier_invoice` document-link enablement;
- React Supplier Payables UI;
- Playwright.

There is no generic invoice edit/delete path and no reversal endpoint because the frozen Final Module 17 HTTP contract does not define them.

## Verification boundary

Static regression coverage verifies permission scoping, exact totals, dependency validation, idempotent create/post, Finance AP posting, Project Cost double-counting protection, audit/outbox behavior, absence of premature payment/HTTP/UI work, and purpose comments on changed named functions.

Dependency-backed Prisma/TypeScript integration remains mandatory when installed dependencies and a disposable PostgreSQL database are available. The archive does not claim those live gates when they are not executable in the current environment.

## Exit decision

B16.5 is complete when Supplier Invoice create/read/post service behavior is present, Finance/AP posting is atomic and idempotent, direct Project Cost policy cannot double count PO/receipt-owned operational cost, no historical migration changes, and the cumulative Final-21 static suite remains green.

Next pass: **B16.6 - implement Supplier Payment creation/posting plus immutable payment allocation and derived remaining/outstanding/aging business logic.**
