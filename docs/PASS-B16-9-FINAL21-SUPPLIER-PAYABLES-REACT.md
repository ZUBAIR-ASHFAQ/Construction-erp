# Pass B16.9 - Final-21 Supplier Payables React Integration

## Scope

B16.9 adds only the React feature required for Module 17 Supplier Payables. The backend eight-route contract and the two existing Supplier Payables migrations remain unchanged.

## Implemented

- Added the required `api/`, `hooks/`, `components/`, and `pages/` feature structure.
- Added a typed client for the exact eight Supplier Payables endpoints.
- Added Foundation `Idempotency-Key` headers to invoice create/post, payment create, and payment allocation.
- TanStack Query owns Supplier Payables server state and refreshes Finance/Job Cost reads after posting effects.
- React Hook Form + Zod validate Supplier Invoice, Supplier Payment, and allocation forms.
- Reused existing Vendor, Project, Project Stage, Procurement Purchase Order, Finance GL account, and Cash/Bank APIs.
- Added Supplier Invoice register/detail, PO/receipt references, Stage lines, account selection, and explicit Post action.
- Added Supplier Payment register, atomic create/post entry, and allocation to posted invoices with outstanding amounts.
- Added source-derived outstanding and aging view with Project filtering and Stage traceability through invoice lines.
- Added permission-aware Supplier Payables navigation to the existing lightweight ERP shell.

## Deliberate boundaries

- No new backend route, Prisma model, migration, generic CRUD action, payment-post endpoint, reversal endpoint, or browser-owned balance field was added.
- Module 10 exposes Goods Receipt detail but no Goods Receipt list endpoint in the current frozen contract. B16.9 therefore accepts an optional Goods Receipt UUID rather than inventing a ninth Procurement/Supplier Payables endpoint.
- Outstanding and age values come from the Module 17 aging API. The browser does not calculate authoritative AP balances.
- Posted Supplier Invoices are not editable in this UI.

## Next pass

B16.10 is the final Supplier Payables integration/API/E2E verification and freeze pass. It should prove Vendor -> PO/Receipt -> Supplier Invoice -> Payable -> Supplier Payment -> Allocation -> Outstanding/Aging with negative permission, cross-Company, idempotency, reconciliation, OpenAPI, and Playwright coverage.
