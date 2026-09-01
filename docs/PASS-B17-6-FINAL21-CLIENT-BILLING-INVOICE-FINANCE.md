# Pass B17.6 - Final-21 Client Invoice Stage Preservation and Finance / AR Posting

## Purpose

B17.6 completes the Client Invoice source-posting path required by Final-21 Module 15. A finalized claim now creates Stage-aware invoice lines and the same idempotent business transaction posts the issued invoice to Module 18 Finance / AR.

## Changes

- Preserves each finalized claim line's `stageId` and description when creating Client Invoice lines.
- Allocates the certified net amount across claim lines deterministically, so retention remains reflected in the invoice total without losing Stage attribution.
- Requires configured active `CLIENT-RECEIVABLE` (`ASSET`) and `CLIENT-REVENUE` (`REVENUE`) GL accounts before an invoice can be issued.
- Stores the resolved default revenue account on newly created Client Invoice lines.
- Reconciles finalized claim gross/net totals before invoice persistence.
- Reconciles immutable invoice line totals before Finance posting.
- Posts one balanced Finance Journal in the same transaction:
  - debit Client Receivable for the invoice total;
  - credit revenue by invoice line while preserving Project and optional Stage dimensions.
- Uses stable source identity `client_invoice:<invoiceId>` and rejects a conflicting existing Finance source.
- Reuses Module 18 `FinanceService.postSourceJournalInTransaction(...)`; Client Billing does not duplicate Journal persistence.
- If a historical invoice exists without its Finance source Journal, a new idempotent invoice command can safely complete the missing Finance posting. An existing matching Journal is reused.
- Emits both `client_invoice.created` and `client_invoice.posted` evidence for a new invoice and records the Finance source key.
- Removes the former `financePostingDeferred` marker.

## Boundaries preserved

- No Prisma schema change.
- No migration added.
- No new public route; the Client Billing surface remains exactly nine routes.
- No generic CRUD endpoint.
- No repository-owned accounting calculations or Journal writes.
- No tax formula or tax-account policy is invented; the current generated Client Invoice tax remains zero.
- No Client Receipt allocation behavior is added; that belongs to Module 16.
- No React change in this pass.

## Next pass

**B17.7 - Client Billing HTTP / OpenAPI completion:** document the existing nine routes with complete params, query, body, response, security, idempotency, and stable error contracts without changing business behavior.
