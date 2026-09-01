# Pass B16.1 - Final-21 Supplier Payables Baseline Audit

## Purpose

Pass B16.1 is a **non-destructive scope, dependency, and migration-readiness audit** for Final Module 17 - Supplier Payables. It does not create Supplier Payables tables, routes, services, React screens, Finance postings, payment allocation logic, aging calculations, or document-link behavior yet.

Its job is to prove that the required upstream modules are ready, freeze the exact Final-21 ownership boundary, identify the integration seams B16.2+ must reuse, and confirm that no legacy Accounts Payable implementation should be merged back into the active Final-21 runtime.

Controlling requirements used for this audit:

- Final Module 17 - Supplier Payables (requirements pages 69-72).
- Corrected generation sequence: Supplier Payables follows Site Expense Management and precedes Client Billing.
- Hard prerequisites: Module 5 Supplier & Subcontractor Management, Module 10 Procurement / Purchase, Module 18 Finance & Accounting, and Module 9 Project Budget & Cost Tracking.
- Final business flow: Supplier Invoice -> Payable -> Supplier Payment -> Bank/Cash -> Aging/Reports.
- Global rule: no generic CRUD routes; posting and allocation are explicit business commands.
- Final release rule: posted financial/payment/cost history is immutable and source postings are idempotent.

## Baseline verification

The B15.10 archive was checked before any B16.2 persistence work.

| Check | Result | Notes |
| --- | --- | --- |
| `node scripts/check-workspace.mjs` | PASS | Workspace structure and required stack are valid. |
| `node --test tests/final-21-*.test.mjs` | PASS | 273/273 Final-21 static tests pass before this B16.1 audit test is added. |
| `node scripts/final-21/build-legacy-cleanup-manifest.mjs --check` | PASS | Existing Final-21 cleanup manifest is current. |
| Supplier Payables backend/frontend/persistence search | PASS | No active `supplier-payables` backend, React feature, `SupplierInvoice`, `SupplierInvoiceLine`, `SupplierPayment`, or `SupplierPaymentAllocation` Prisma model exists. |
| Legacy AP ownership search | PASS | Historical Stage/Module documents mention deferred AP work, but there is no active legacy AP runtime to preserve or merge. Final-21 Module 17 remains the only future AP owner. |
| Prisma / dependency-backed build | NOT RUN | The archive does not contain installed dependencies. No claim is made that dependency-backed Prisma/TypeScript/build gates pass. They remain mandatory in later implementation passes. |

## B16.1 production-change boundary

This pass intentionally makes **no Supplier Payables production implementation** and creates **no database migration**.

No production source repair was required. The current active schema and prerequisite module registrations are suitable for the B16.2 forward migration.

## Current Supplier Payables ownership

There is currently no dedicated Supplier Payables owner in the active Final-21 runtime:

- no `apps/api/src/modules/supplier-payables/`
- no `apps/web/src/features/supplier-payables/`
- no `SupplierInvoice` Prisma model
- no `SupplierInvoiceLine` Prisma model
- no `SupplierPayment` Prisma model
- no `SupplierPaymentAllocation` Prisma model
- no `/api/v1/supplier-payables/*` routes

This is the correct starting point for B16.2. The new module can be added without preserving an obsolete AP CRUD surface.

## Dependency audit

### Module 5 - Supplier & Subcontractor Management

**Status: READY**

Reusable dependency behavior already exists:

- Company-scoped Vendor master reads.
- Stable Vendor identity and status.
- Company-scoped Vendor code uniqueness.
- Vendor purchase summary remains source-derived from Procurement.
- Supplier balances are intentionally not owned by the Vendor master.

B16 must reference the existing `vendors` master. It must never create a duplicate supplier table or manually store a supplier balance on Vendor.

### Module 10 - Procurement / Purchase

**Status: READY FOR PO / GOODS-RECEIPT MATCHING**

The active Final-21 Procurement implementation already provides:

- Company and Project-scoped Purchase Orders.
- Vendor ownership on Purchase Orders.
- PO lines with Stage, quantity, unit rate, line total, received quantity, and `invoicedAmount` tracking fields.
- Company/Project/Vendor-scoped Goods Receipts linked to Purchase Orders.
- Goods Receipt lines linked to PO lines with accepted/rejected quantities and optional Stage.
- Issued PO commitments in Project Budget & Cost.

B16 must validate that an optional Purchase Order and optional Goods Receipt belong to the same Company, Vendor, and Project as the Supplier Invoice. Where a Goods Receipt is provided, it must also belong to the referenced Purchase Order.

B16 must not reimplement purchasing, receiving, stock, or PO commitment ownership.

### Module 18 - Finance & Accounting

**Status: READY FOR AP AND PAYMENT SOURCE POSTING**

Finance already provides the trusted source-module posting seam required by Supplier Payables:

- `postSourceJournalInTransaction(...)` for atomic integration.
- stable `sourceKey` idempotency.
- balanced debit/credit enforcement.
- open fiscal period checks.
- active GL account validation.
- Project/Stage dimension validation.
- Company-scoped Cash/Bank accounts.
- append-only posted journals with controlled reversal behavior.
- Finance-owned audit/outbox evidence for journal posting.

B16 must use Finance as the accounting owner. Supplier Payables owns supplier invoices, payments and allocations; Finance owns their accounting representation and cash/bank movement.

### Module 9 - Project Budget & Cost Tracking

**Status: READY, WITH DOUBLE-COUNTING GUARD REQUIRED**

The Final-21 Project cost layer already provides:

- Project/Stage commitments.
- append-oriented Project/Stage actual costs.
- stable Company-scoped source keys.
- allowed categories: `material`, `labour`, `security`, `equipment`, `subcontract`, `site_expense`, `other`.
- source-derived cost history rather than browser-created actual totals.

B16 must not blindly create a second Project cost for a supplier invoice when the underlying material cost is already represented by the Inventory issue flow. Supplier-invoice cost/commitment integration must follow the documented accounting/source policy and remain traceable by stable source key.

For example, an AP invoice can create the payable/accounting effect while the Project material actual remains owned by the existing inventory issue source. Any Supplier Payables cost adapter added later must prove that it does not double count an already-posted operational cost source.

### Foundation numbering, idempotency, audit and outbox

**Status: READY**

The current runtime already uses:

- Company-scoped number allocation.
- Foundation-required `supplier-payment` sequence support.
- `executeIdempotentCommand(...)`.
- `recordAudit(...)`.
- `recordOutboxEvent(...)`.
- database transactions.
- server-derived Company, actor, permissions and Project scope.

B16 should reuse these primitives and must not create a separate AP sequence, audit, event, transaction, or idempotency framework.

Supplier invoice number is the Vendor's invoice number and should not be replaced by an internally generated invoice number. Supplier **payment** number should use the existing `supplier-payment` Foundation sequence.

### Module 21 - Documents & Audit

**Status: CORE READY; SUPPLIER INVOICE LINK TYPE NOT YET ENABLED**

The secure upload/version/download and audit infrastructure exists. The current active document-link allow-list does not yet include `supplier_invoice`, which is correct before the Supplier Invoice resource exists.

When B16 persistence and authorization exist, a later B16 document integration pass may add `supplier_invoice` to the approved resource types. Supplier Payables must store/reference document IDs or links rather than binary files.

## Exact B16 target persistence

B16.2 should add only the four Final Module 17 persistence tables required by the controlling requirements.

### `supplier_invoices`

Target responsibilities:

- `id`
- `company_id`
- `vendor_id`
- `project_id`
- `invoice_no`
- `invoice_date`
- `due_date` nullable
- `purchase_order_id` nullable
- `goods_receipt_id` nullable
- `status`
- `subtotal`
- `tax_amount`
- `total_amount`

Required design rules:

- Vendor invoice number uniqueness follows Company + Vendor policy.
- Vendor and Project must belong to the same Company.
- Optional PO must belong to the same Company, Vendor and Project.
- Optional Goods Receipt must belong to the same Company, Vendor, Project and referenced PO where PO is supplied.
- monetary values use precise `NUMERIC/DECIMAL`.
- posted invoices are immutable.

### `supplier_invoice_lines`

Target responsibilities:

- `id`
- `supplier_invoice_id`
- `stage_id` nullable
- `description`
- `amount`
- `expense_or_inventory_account_id` nullable

Required design rules:

- Stage, when supplied, must belong to the Supplier Invoice Project.
- GL account, when supplied, must be an active same-Company Finance account.
- line amounts are positive precise money.
- invoice totals are server-calculated/validated from lines and tax policy; browser totals are never authoritative.

### `supplier_payments`

Target responsibilities:

- `id`
- `company_id`
- `vendor_id`
- `project_id` nullable
- `payment_no`
- `payment_date`
- `amount`
- `cash_bank_account_id`
- `reference` nullable
- `status`

Required design rules:

- payment number is Company-scoped and generated by the Foundation `supplier-payment` sequence.
- Vendor must belong to the Company.
- optional Project must be same-Company and inside allowed Project scope.
- Cash/Bank account is Finance-owned, active and same-Company.
- posted payment history is immutable.

### `supplier_payment_allocations`

Target responsibilities:

- `supplier_payment_id`
- `supplier_invoice_id`
- `amount`
- `allocated_at`

Required design rules:

- payment and invoice must belong to the same Company and Vendor.
- Project compatibility must be enforced where the payment is Project-specific.
- allocation cannot exceed the unallocated payment amount or invoice outstanding.
- allocation history is traceable; no silent deletion of posted AP history.

B16.2 must use one forward migration and preserve all historical migrations.

## Exact API target for later B16 route pass

The final Module 17 surface is exactly:

- `GET /api/v1/supplier-payables/invoices`
- `POST /api/v1/supplier-payables/invoices`
- `GET /api/v1/supplier-payables/invoices/:id`
- `POST /api/v1/supplier-payables/invoices/:id/post`
- `GET /api/v1/supplier-payables/payments`
- `POST /api/v1/supplier-payables/payments`
- `POST /api/v1/supplier-payables/payments/:id/allocations`
- `GET /api/v1/supplier-payables/aging`

Do not add generic DELETE, generic invoice PATCH, generic payment PATCH, RFQ, purchase-receipt mutation, or a separate approval-workflow surface unless a later controlling requirement explicitly changes the contract.

## Business invariants frozen by B16.1

The next passes must preserve these rules:

1. Supplier/Vendor identity comes only from Module 5.
2. Supplier invoice Project is required; payment Project is optional exactly as defined by the persistence contract.
3. PO and Goods Receipt references are optional but, when supplied, must reconcile to the same Vendor/Project/Company.
4. Supplier invoice number duplicate handling is scoped by Company + Vendor policy.
5. Supplier Invoice amount/tax/total values use precise decimal arithmetic.
6. Posted Supplier Invoices and posted Supplier Payments are immutable.
7. Posting a Supplier Invoice creates the AP/Finance effect exactly once by stable source key.
8. Supplier payment reduces cash/bank and payable through Finance exactly once.
9. Allocation cannot exceed available payment or invoice outstanding.
10. Supplier payable = posted invoice - allocated payments/credits.
11. Project/Stage cost integration must not double count an operational cost already posted by Procurement/Inventory or another source module.
12. A retry must not create a second Finance journal, payment, allocation, or cost source.
13. No silent deletion of posted AP history.
14. Aging and outstanding are derived from posted invoices, due dates and allocations rather than manually stored balances.
15. Documents store evidence metadata/versions; AP business rows store only references/links.
16. Client-supplied `companyId`, actor, permissions, Project scope, status, payable balance and authoritative totals are never trusted.

## Reusable implementation patterns

B16 should reuse the simplest patterns already proven by current Final-21 modules:

- Vendor validation from Module 5.
- PO/Goods Receipt ownership validation from Procurement.
- exact decimal handling without `parseFloat` or browser-authoritative financial totals.
- `FinanceService.postSourceJournalInTransaction(...)` for AP and cash/bank accounting.
- stable source keys for invoice posting and payment posting.
- Foundation `supplier-payment` number allocation.
- Foundation idempotency wrapper for invoice create/post, payment create and allocation commands where required.
- audit/outbox calls in the same transaction as meaningful writes.
- one five-file backend module: schema, repository, service, routes, index.
- React feature later limited to `api/`, `hooks/`, `components/`, `pages/`.

## Explicitly rejected scope

B16 must not introduce:

- a second Vendor/Supplier master
- a second Purchase Order or Goods Receipt owner
- RFQ or Tender workflow
- a duplicate Cash/Bank master
- a manually editable supplier balance field
- a manually editable Project cost total
- generic CRUD delete for posted invoices/payments/allocations
- a standalone Approval Workflow module
- background workers as a requirement for transaction correctness
- direct writes to Project Profitability
- client/browser authority over Company, posting state, AP balance or accounting totals

## Migration readiness finding

The upstream relational shapes needed by B16 are already present:

- Vendor same-Company ownership
- Project same-Company ownership
- Purchase Order Vendor/Project ownership
- Goods Receipt Vendor/Project/PO ownership
- optional Stage dimensions on procurement lines
- GL and Cash/Bank accounts
- Project cost commitment/actual source-key infrastructure
- Foundation `supplier-payment` numbering
- Foundation idempotency/audit/outbox
- Documents core

No prerequisite bridge table or production repair is required before B16.2.

## B16.1 exit decision

**B16.1 is complete as a scope/dependency audit and migration-readiness pass.**

No Supplier Payables runtime, API, UI, or database migration is intentionally implemented here.

The next pass is **B16.2 - add the Final-21 `supplier_invoices`, `supplier_invoice_lines`, `supplier_payments`, and `supplier_payment_allocations` Prisma models plus one forward migration**, with same-Company Vendor/Project/Procurement/Finance integrity, precise money constraints, allocation-safe indexes, and no service/routes/UI yet.
