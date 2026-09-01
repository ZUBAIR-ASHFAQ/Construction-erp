# Pass B17.9 - Final-21 Client Billing React Completion

## Purpose

B17.9 completes the Module 15 React feature without changing the frozen nine-route backend contract. The browser now uses permitted Project Stage reads for Stage-aware claim entry, explains the Project-owned Fixed Price / Cost + Percentage basis, preserves Stage attribution in Claim and Client Invoice views, and does not invent Client Receipt balances before Module 16 exists.

## Implemented

- Kept the required `api/`, `hooks/`, `components/`, and `pages/` Client Billing feature structure.
- Tightened browser API types to the confirmed Final-21 billing method, settings, Claim and Client Invoice status vocabularies.
- Reused the existing Module 7 `useProjectStages` read instead of accepting raw Stage UUID entry.
- Stage selectors are limited to the selected Project and show Project-level billing as the explicit no-Stage option.
- When Stage read permission is unavailable, existing Stage attribution is preserved as a restricted linked Stage instead of exposing or requiring a raw UUID.
- Displayed the Project Management commercial model as the authoritative billing basis.
- Fixed Price explains that Project value is a reference and physical progress does not automatically create billing.
- Cost + Percentage explains that the server validates Claim amounts against posted Project/Stage actual cost through the Claim period end plus the Project percentage.
- Billing settings no longer present the Project billing method as an editable browser-owned value.
- Claim rows now display Stage attribution, billing progress, gross, retention and net certified values returned by the API.
- Client Invoice rows display the immutable Stage-aware invoice lines created from the finalized Claim.
- Client Invoice creation refreshes Client Billing, Project Stage, and Finance TanStack Query state because one invoice affects all three read surfaces.
- React Hook Form + Zod continue to own browser write-form validation, and Claim amount validation now matches the positive-money API boundary with a 500-line limit.

## Deliberate boundaries

- No backend route, service, repository, Prisma model, migration or database table was added or changed.
- Physical Stage progress remains owned by Module 7 and is not used as an automatic browser billing formula.
- Cost + Percentage ceilings remain server-derived from posted actual cost. The browser only explains the basis; it does not calculate authoritative eligible cost.
- Invoice total is shown as billed source data. Received, advance, allocated and outstanding amounts are not fabricated in Module 15.
- Module 16 Client Receipts / Payments will own cash receipt, advance and allocation history in the next module sequence.
- No new frontend helper file or state store was added.

## Next pass

**B17.10 - Client Billing final integration / E2E / freeze:** prove Project -> Stage -> Claim -> Invoice -> Finance behavior with negative permissions, cross-Company isolation, idempotency, Cost + Percentage reconciliation, OpenAPI and browser workflow coverage before beginning Module 16 Client Receipts / Payments.
