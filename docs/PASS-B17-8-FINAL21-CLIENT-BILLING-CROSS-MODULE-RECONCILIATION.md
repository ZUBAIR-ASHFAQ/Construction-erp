# Pass B17.8 - Final-21 Client Billing Cross-Module Reconciliation and Documents Proof

## Purpose

B17.8 proves and hardens the Final-21 ownership path from Client -> Project -> Stage -> Claim -> Client Invoice -> Finance while keeping Documents, Stage financials and accounting under their existing source modules. The pass does not add a new Client Billing endpoint or duplicate another module's totals.

## Changes

- Added one forward-only migration with a fail-closed preflight for existing Progress Claims and Client Invoices whose Client, Project, Company or optional Claim ownership does not reconcile.
- Added a small database owner-scope trigger shared by Progress Claims and Client Invoices so direct persistence cannot bypass the Project-owned Client chain used by the service layer.
- Restored the final-scope Client Invoice/Claim ownership protection that the earlier Contract-era cleanup intentionally removed with the standalone Contract model.
- Confirmed Progress Claim and Client Invoice Stage ownership remains enforced by B17.2 line foreign keys/scope triggers and B17.5 service checks.
- Confirmed Project Stage billed values read issued/posted `client_invoice_lines` only. Stage billing does not sum Progress Claims or Finance Journal lines, so the accounting representation cannot double-count the billing source.
- Confirmed the Client Invoice Finance source key remains `client_invoice:<invoiceId>`, is Company-unique in Finance, and is checked before posting or retry completion.
- Confirmed Finance revenue lines carry the same Project and optional Stage dimensions as the immutable invoice lines while the receivable line remains Project-level.
- Confirmed Module 21 already allow-lists `client_invoice`, resolves the same-Company Project owner, requires Client Billing read permission, prevents cross-Project document links, and stores retry-safe generic document links rather than adding document ownership to Client Billing.

## Boundaries preserved

- Historical migrations are unchanged.
- No Client Billing route was added; the exact nine-route API remains intact.
- No Client Billing frontend behavior was changed.
- No Project Stage financial total is stored on `project_stages`.
- No Finance journal or Document link is duplicated into Client Billing persistence.
- No new repository/service abstraction was introduced where an existing source-module seam already exists.

## Reconciliation ownership

- **Client/Project ownership:** Project is authoritative; Claim and Invoice use that same Client and Company.
- **Stage billed:** Module 7 reads issued/posted Client Invoice lines tagged to the Stage.
- **Accounting:** Module 18 owns the journal created from the stable Client Invoice source key.
- **Documents:** Module 21 owns file/version/link metadata for Client Invoice evidence.
- **No double counting:** Billing source values come from Client Invoice lines; Finance is their accounting representation, not another billing source.

## Next pass

**B17.9 - Client Billing React completion:** replace raw Stage identifiers with Project Stage selection, make Fixed Price / Cost + Percentage basis visible, and preserve Stage attribution in Claim/Invoice UI without inventing Client Receipt values before Module 16.
