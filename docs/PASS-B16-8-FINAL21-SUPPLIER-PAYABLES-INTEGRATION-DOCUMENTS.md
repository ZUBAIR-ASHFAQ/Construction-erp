# Pass B16.8 - Final-21 Supplier Payables Cross-Module and Documents Integration

## Purpose

Pass B16.8 closes the backend cross-module integration alignment for Final Module 17 - Supplier Payables before React work begins.

The Supplier Payables business service already owns Supplier Invoices, Supplier Payments, allocations, outstanding and aging. Finance owns accounting and Cash/Bank movement, Procurement owns Purchase Orders/Goods Receipts, Project Budget & Cost owns source-derived Project/Stage cost, and Module 21 owns document upload/version/link/download behavior.

This pass verifies those boundaries together and enables `supplier_invoice` as an authorized Module 21 document-link resource without adding duplicate file storage or another Supplier Payables API.

## Changes

### 1. Supplier Invoice is an allow-listed Module 21 resource

`DOCUMENT_LINK_RESOURCE_TYPES` now includes:

- `supplier_invoice`

The existing Module 21 document link/unlink endpoints can therefore attach evidence to a Supplier Invoice. No Supplier Payables-specific upload/download endpoint is added.

### 2. Same-Company Supplier Invoice resolution

`DocumentsRepository.findLinkableResource()` now resolves `supplier_invoice` through the authenticated Company repository scope.

The persisted Supplier Invoice supplies:

- `id`
- `projectId`

The document-link service does not trust a browser-supplied Project owner for the invoice.

### 3. Project-scoped authorization

Linking or unlinking a document to a Supplier Invoice requires:

- normal Module 21 `documents.link` authority; and
- `supplier_payables.read` for the exact Supplier Invoice Project, either through Company-wide permission or effective Project permission.

A Project-scoped document cannot be linked to a Supplier Invoice in another Project.

### 4. Cross-module Supplier Invoice integration remains intact

B16.8 verifies the B16.5 posting contract remains unchanged:

- Vendor/Project/PO/Goods Receipt relationships are revalidated server-side;
- a Goods Receipt must agree with the selected PO when both are supplied;
- Supplier Invoice posting uses one deterministic Finance source key;
- Finance owns the AP journal;
- PO/Goods-Receipt-linked invoices do not create a second Project material actual;
- direct expense Supplier Invoices may create source-keyed Project/Stage cost according to the B16.5 policy;
- audit and outbox evidence preserve the Finance and Project Cost source keys.

### 5. Supplier Payment/allocation integration remains intact

B16.8 verifies the B16.6 behavior remains separated correctly:

- Supplier Payment posting debits Supplier Payable and credits Finance-owned Cash/Bank;
- one deterministic Finance source key prevents duplicate payment journals;
- allocations append subledger history only and do not post another Finance journal;
- allocation cannot exceed the remaining payment or invoice outstanding;
- supplier outstanding/aging remains derived from POSTED invoices and POSTED-payment allocations rather than editable balance columns.

## Deliberately not added

B16.8 does not add:

- a Prisma model or migration;
- a ninth Supplier Payables route;
- generic Supplier Payables CRUD;
- Supplier Invoice blob/file/public-URL fields;
- duplicate upload/download behavior;
- Supplier Payment document ownership;
- React Supplier Payables pages;
- manual Supplier balance/outstanding columns;
- duplicate material Project Cost posting.

## Verification target

B16.8 is complete when:

1. `supplier_invoice` is a strict Module 21 link resource type;
2. Supplier Invoice resource resolution is same-Company and derives Project ownership from persistence;
3. link/unlink operations require `supplier_payables.read` for the exact Project plus normal document-link authority;
4. cross-Project links remain rejected;
5. Vendor -> PO/Receipt -> Supplier Invoice -> Finance/AP traceability remains intact;
6. Supplier Payment -> Finance/Cash/Bank and allocation-only subledger behavior remain separate;
7. outstanding and aging remain source-derived;
8. no route, migration, React or duplicate file-storage scope is introduced.

Next pass: **B16.9 - Supplier Payables React API/hooks/components/pages and ERP navigation integration.**

## Verification completed

- cumulative B16.1-B16.8 focused tests: **89/89 PASS**;
- complete `final-21-*` static regression: **362/362 PASS**;
- workspace tests: **31/31 PASS**;
- migration-system tests: **8/8 PASS**;
- Final-21 database-cleanup tests: **6/6 PASS**;
- workspace structure check: **PASS**;
- Final-21 legacy cleanup manifest check: **PASS**;
- migration policy: **83/83 migrations locked across 83 gates**;
- syntax/transpile diagnostics for the three changed Module 21 TypeScript files: **PASS**.

The source archive does not contain installed `node_modules`, so dependency-backed Prisma generation, full workspace TypeScript compilation, live Fastify/PostgreSQL integration, and browser execution are not claimed in this pass.
