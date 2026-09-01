# Pass B18.8 - Final-21 Client Receipts Reconciliation, Audit and Documents Proof

## Purpose

B18.8 wires Module 16 into existing Client, Project and Project Stage read surfaces without creating duplicate financial source-of-truth fields. It also adds `client_receipt` to the existing Module 21 document-link authorization seam.

## Reconciliation rules implemented

- **Billed** remains owned by issued/posted Client Invoice values from Module 15.
- **Received** is posted Client Receipt cash from Module 16.
- **Allocated** is the active allocation amount from posted Client Receipts to Client Invoices.
- **Advance / unallocated** is `received - allocated`.
- **Outstanding** is `billed - allocated`; unallocated advances do not reduce Invoice outstanding.
- A reversed Receipt is excluded from current received/allocated summaries because only `POSTED` receipts participate.
- Cash received is not profit and is not a second revenue source. Receipt creation continues to debit Cash/Bank and credit Client Advance/Unapplied until allocation reclassifies that amount against Client Receivable.

## Stage attribution and no double counting

Stage billed remains sourced only from issued/posted `client_invoice_lines`. Stage receipt reporting uses the explicit `client_receipts.stage_id` attribution. A tagged receipt contributes its cash once to Stage received; its active allocations are shown separately and are not added again to received. Stage outstanding subtracts only allocated Stage receipt cash.

An untagged receipt remains Project-level for Stage reporting. The system does not infer a Stage from a multi-line Invoice because one receipt allocation has no line-level Stage split. This avoids guessing and prevents double counting across direct Stage tags and Invoice allocation.

## Client and Project summaries

- Client detail now returns a source-derived receipt summary with received, allocated, advance and outstanding values while preserving the existing issued/posted billing summary.
- Project detail now returns permission-safe `billingSummary` and `receiptSummary`. Client Billing and Client Receipt values are exposed only when the corresponding effective Project/company permissions are available.
- No Client, Project or Stage table stores these derived totals.

## Finance and audit traceability

The existing Finance source keys remain the reconciliation anchors:

- `client_receipt:<receiptId>`
- `client_receipt_allocation:<allocationId>`
- `client_receipt_allocation_reversal:<allocationId>`
- `client_receipt_reversal:<receiptId>`

Finance keeps the Company-unique source-key constraint. Module 16 continues to re-read posted source Journals before completing transactional commands. Existing audit and outbox events remain the immutable business trace for receipt posting, allocation, allocation reversal and receipt reversal.

## Module 21 Documents integration

`DOCUMENT_LINK_RESOURCE_TYPES` now allow-lists `client_receipt`. Module 21 resolves the Receipt inside the authenticated Company, carries its Project and optional Stage onto the generic Document Link, and requires `client_receipts.read` for that exact Project before link or unlink work. File/version/storage logic remains entirely inside Module 21.

## Boundaries preserved

- No Prisma model changed and no migration was added.
- Historical migrations were not modified.
- The Client Receipts API remains exactly six routes.
- No Client Receipts React feature was added in this pass.
- No manual received, allocated, advance, outstanding or profit total is persisted.
- No new production file or cross-module service abstraction was introduced.

## Next pass

**B18.9 - Client Receipts React completion:** build the required `api/`, `hooks/`, `components/` and `pages/` feature using real Client, Project, Stage, Invoice and Cash/Bank selectors and the source-derived balances finalized here.
