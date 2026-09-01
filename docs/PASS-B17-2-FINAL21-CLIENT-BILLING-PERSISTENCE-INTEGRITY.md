# Pass B17.2 - Final-21 Client Billing Persistence Integrity

## Purpose

B17.2 repairs only the persistence integrity identified by the B17.1 Client Billing audit. It does not change Client Billing repositories, services, routes, or React behavior.

The controlling rules are simple: billing Stage references must resolve to the existing Project Stage owner, invoice revenue-account references must resolve to Finance, and historical claims/invoices must not be rewritten or guessed.

## Changes

- Added a real optional `ProjectStage` relation for `ProgressClaimLine.stageId`.
- Added a real optional `ProjectStage` relation for `ClientInvoiceLine.stageId`.
- Added a real optional `GlAccount` relation for `ClientInvoiceLine.revenueAccountId`.
- Added Stage-first indexes required by Stage billing reads and an account index for Finance integration.
- Added one forward migration only. Historical migrations remain unchanged.
- Added a fail-closed preflight for existing non-null Stage/account references. Invalid legacy rows block migration for explicit remediation instead of being deleted, nulled, or silently reassigned.
- Added one shared database scope function with two triggers so future claim/invoice lines cannot persist a Stage from another Project/Company, and invoice lines cannot persist a revenue account from another Company.
- Kept Project/Company ownership on the claim/invoice headers. No duplicate Project, Company, Stage, or Finance master columns/tables were added to billing lines.

## Historical-data rule

B17.2 does not backfill Stage attribution into old invoices that were historically collapsed to Project-only invoice lines. Guessing that allocation would rewrite financial history. Later invoice creation will preserve Stage detail for new invoices; existing history remains as originally posted.

## Deferred runtime work

This pass intentionally does not:

- add repository Stage or Finance lookup functions;
- reject Stage mismatch with the stable `BILLING_STAGE_INVALID` service error before database execution;
- calculate Cost + Percentage billing;
- preserve claim Stage allocation into new invoice lines;
- post Client Invoices to Finance / AR;
- change the nine public routes or React UI.

Those responsibilities remain in the frozen B17 sequence.

## Verification target

B17.2 is accepted when the Prisma relations, forward migration, fail-closed preflight, foreign keys, scope triggers, indexes, migration gate/checksum and Final-21 regression tests all pass without changing runtime billing behavior.

## Next pass

**B17.3 - Client Billing boundary contract alignment:** tighten Zod request/response schemas and derived-field boundaries while keeping exactly the same nine public Client Billing routes.
