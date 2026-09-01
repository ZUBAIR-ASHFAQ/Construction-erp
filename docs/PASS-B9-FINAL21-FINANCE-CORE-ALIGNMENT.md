# Pass B9 — Final-21 Finance Core Alignment

## Purpose

Pass B9 makes Module 18 the central accounting engine required by the Final 21-module Construction ERP. It keeps the existing five-file Finance backend, removes Finance's active dependency on the legacy Project Cost Structure, and adds the missing Cash/Bank and reconciliation persistence.

## Implemented

- Kept the Finance backend to `routes`, `service`, `repository`, `schema`, and `index` only.
- Replaced Journal-line `costStructureId` with optional `stageId` while retaining optional `projectId`.
- Added stable `sourceKey`, `createdBy`, and `postedAt` Journal fields.
- Added `cash_bank_accounts` and `bank_reconciliations`.
- Migrated obvious historical CASH/BANK GL accounts into Cash/Bank master rows.
- Automatically creates a minimal Cash/Bank master when a new GL account is explicitly typed `CASH` or `BANK`.
- Added Company/Project/Stage database integrity checks for Journal lines.
- Added Company-safe reconciliation actor validation.
- Added exact Final-21 permissions, errors, events, and HTTP routes.
- Manual Journals remain draft until explicitly posted.
- Posting verifies an open fiscal period, active GL accounts, Project/Stage ownership and exact debit/credit balance.
- Posted Journals are never edited or deleted; reversal creates a compensating posted Journal.
- Added `postSourceJournal()` so later source modules can post one idempotent accounting effect by stable source key.
- Cash/Bank balances are derived from posted Journal lines rather than stored as editable balances.
- Reconciliation snapshots use a server-derived posted balance as of the statement date.
- Updated React Finance API/hooks/page to use the exact final routes, Stage dimensions, Cash/Bank, reconciliation, ledger, trial balance and period close.
- Removed active Finance frontend calls for account lifecycle CRUD, period create/reopen, Journal-detail alias, and `/general-ledger`.
- Preserved Budget's existing `findFiscalPeriodsForPostingDate()` dependency for B10.

## Deliberately deferred

- Client Billing source posting is connected in B17 after billing final hardening.
- Client Receipts, Supplier Payables, Payroll and Site Expenses will call the B9 source-posting contract in their own passes.
- P&L, Balance Sheet and Cash Flow remain downstream reporting/read-model work after source modules stabilize.
- Legacy WBS/Cost Code persistence outside Finance is not deleted in B9 because Inventory/Equipment still require their dedicated later cleanup passes.

## Safety rules

- Historical migrations are unchanged.
- The B9 database change is a new forward migration only.
- Company scope is mandatory in repositories.
- Project and Stage scope is revalidated in services and at the database boundary.
- Source keys and HTTP idempotency prevent duplicate accounting effects.
- Financial decimal values are serialized as strings to avoid precision loss.
