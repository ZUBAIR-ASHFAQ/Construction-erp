# Pass B17.5 - Final-21 Client Billing Claim / Billing-Basis Service Alignment

## Purpose

B17.5 completes the Client Billing claim-side service rules that were deferred after the persistence, boundary, and repository passes. The pass keeps the existing nine HTTP routes and does not yet change Client Invoice Stage persistence at runtime or Finance / AR posting.

## Changes

- Added same-Project/Company Stage validation before claim creation and before draft claim-line replacement.
- Revalidates persisted Stage ownership again when a claim is finalized so historical or externally inserted invalid Stage IDs cannot become certified billing.
- Keeps the Project commercial model authoritative: Client Billing settings may not change a `FIXED_PRICE` Project into `COST_PLUS_PERCENTAGE` or vice versa.
- Rejects claim writes/finalization while billing settings are inactive, while still allowing an authorized user to save an inactive settings record.
- Validates the Project-owned `costPlusPercent` for Cost + Percentage projects.
- For `COST_PLUS_PERCENTAGE`, calculates a server-owned maximum billable basis from source-derived `cost_actuals` posted through the claim period end plus the Project percentage.
- Includes previously finalized claim gross values in the Project ceiling so the same actual-cost basis cannot be certified repeatedly.
- Applies the same cumulative ceiling to each Stage subtotal using Stage-tagged actual costs and previously finalized Stage claim lines, so duplicate/current-or-prior claim lines cannot bypass a Stage basis limit.
- Fixed Price claim line amounts remain user-entered approved billing values; physical progress is not converted into billing automatically.
- Retention remains server-calculated from the configured retention percentage.
- Deductions and advance recovery remain uncalculated because the merged requirements do not define a complete formula. No formula is invented.

## Boundaries preserved

- No Prisma schema or migration change.
- No new repository abstraction or business-owned duplicate table.
- No public route change.
- No React change.
- No Client Invoice Stage-copy behavior yet; that remains B17.6.
- No Finance / AR journal posting yet; that remains the following invoice-posting pass.
- No physical-progress field is used as a billing amount.

## Next pass

**B17.6 - Client Invoice Stage preservation and Finance / AR integration preparation/execution:** preserve finalized claim Stage lines into the issued invoice and replace the deferred Finance flag with the trusted source-posting flow.
