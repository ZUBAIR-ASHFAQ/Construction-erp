# Pass B16.2 - Final-21 Supplier Payables Persistence

## Purpose

Pass B16.2 implements only the database persistence baseline for Final Module 17 - Supplier Payables. It follows the B16.1 dependency audit and intentionally does not add Zod schemas, repositories, services, Fastify routes, permissions, React UI, Finance posting logic, Project Cost adapters, payment-allocation business logic, aging calculations, or document-link resource handling yet.

The controlling Module 17 persistence is limited to `supplier_invoices`, `supplier_invoice_lines`, `supplier_payments`, and `supplier_payment_allocations`.

## Prisma models added

### `SupplierInvoice`

Fields:

- `id`
- `companyId`
- `vendorId`
- `projectId`
- `invoiceNo`
- `invoiceDate`
- `dueDate` nullable
- `purchaseOrderId` nullable
- `goodsReceiptId` nullable
- `status`
- `subtotal`
- `taxAmount`
- `totalAmount`

Integrity implemented now:

- Vendor invoice number is unique by Company + Vendor.
- Vendor and Project are constrained to the same Company as the invoice.
- Optional Purchase Order is constrained to the same Company + Project + Vendor.
- Optional Goods Receipt is constrained to the same Company + Project + Vendor.
- Monetary values use precise `DECIMAL(18,2)`.
- Database checks reject blank invoice/status strings, negative subtotal/tax and non-positive total.
- No editable payable/outstanding balance is stored.

To support the scoped Procurement foreign keys without duplicating Procurement ownership, this migration adds composite unique indexes to the existing Purchase Order and Goods Receipt tables. It does not add or mutate Procurement business fields.

### `SupplierInvoiceLine`

Fields:

- `id`
- `supplierInvoiceId`
- `stageId` nullable
- `description`
- `amount`
- `expenseOrInventoryAccountId` nullable

Integrity implemented now:

- A line belongs to one Supplier Invoice.
- Optional Stage references the existing Project Stage master.
- Optional expense/inventory account references the existing Finance GL master.
- Line amount is precise `DECIMAL(18,2)` and database-constrained to be positive.
- No duplicated Company/Project fields or manually editable Project cost totals are added to the line.

### `SupplierPayment`

Fields:

- `id`
- `companyId`
- `vendorId`
- `projectId` nullable
- `paymentNo`
- `paymentDate`
- `amount`
- `cashBankAccountId`
- `reference` nullable
- `status`

Integrity implemented now:

- Payment number is unique inside one Company.
- Vendor is constrained to the same Company.
- Optional Project is constrained to the same Company.
- Cash/Bank account is constrained to the same Company and remains Finance-owned.
- Amount is precise `DECIMAL(18,2)` and database-constrained to be positive.
- No editable remaining-payment or payable balance is stored.

The later service pass will allocate the Company-scoped `supplier-payment` Foundation sequence; B16.2 does not invent a second numbering system.

### `SupplierPaymentAllocation`

Fields:

- `id`
- `supplierPaymentId`
- `supplierInvoiceId`
- `amount`
- `allocatedAt`

Integrity implemented now:

- Allocation references one Supplier Payment and one Supplier Invoice.
- Amount is precise `DECIMAL(18,2)` and database-constrained to be positive.
- Payment- and invoice-oriented indexes support later outstanding/aging derivation.
- No stored payable, outstanding, remaining-payment, or aging total is introduced.

## Cross-row rules deliberately left for the service layer

The Final-21 table contract does not place `company_id` / `project_id` on Supplier Invoice lines or Company/Vendor fields on allocation rows. B16.2 therefore does not duplicate those keys merely to force extra composite foreign keys. The later service passes must enforce these rules transactionally:

- when both optional references are supplied, the Goods Receipt must belong to the referenced Purchase Order; this cross-reference check belongs in the service;
- an optional invoice-line Stage must belong to the Supplier Invoice Project; this is a service validation;
- an optional invoice-line expense/inventory GL account must be active and belong to the Supplier Invoice Company;
- a payment allocation must connect a payment and invoice from the same Company and Vendor, and must satisfy Project compatibility when the payment is Project-specific; this is a service validation;
- allocation must not exceed the unallocated payment amount or invoice outstanding.

These validations are intentionally deferred rather than introducing triggers, duplicated balance fields, or extra persistence columns not present in the controlling Module 17 table contract.

## Migration

Added one forward-only migration:

`20260829002100_final21_supplier_payables`

Historical migrations were not edited. The migration creates exactly the four Final Module 17 tables plus the two supporting Procurement composite unique indexes required for same-Company/Project/Vendor foreign keys. It does not seed permissions/status vocabularies, add triggers/functions, or add runtime behavior.

The migration gate/checksum manifests are extended with the new migration while all existing checksum locks remain unchanged.

## Deliberately deferred to B16.3+

B16.2 does not add Zod schemas, repositories, services, Fastify routes, permissions, React UI, document-link resource types, Finance journals, Project Cost source adapters, payment allocation commands, aging calculations, audit/outbox events or idempotency commands.

## Verification

B16.2 adds focused static tests covering the four-table persistence shape, Vendor/Project/Procurement/Finance ownership, precise money constraints, absence of editable balance fields, runtime deferral, migration registration, and the explicit service handoff for cross-row rules.

Dependency-backed Prisma generation/validation remains mandatory when dependencies are installed. The supplied archive does not include `node_modules`, so B16.2 does not claim an installed-dependency Prisma CLI gate.

## Exit decision

B16.2 is complete when the four Prisma models, one forward migration, migration lock metadata and focused regression tests pass while Supplier Payables runtime/API/UI remain absent.

Next pass: **B16.3 - add Supplier Payables Zod boundary schemas, stable permissions and stable error vocabulary only.**
