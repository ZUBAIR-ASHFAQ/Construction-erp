# Pass B17.4 - Final-21 Client Billing Repository Completion

## Purpose

B17.4 adds only the persistence reads and write shapes required by the next Client Billing service/integration passes. Business calculations, Stage rejection, Cost + Percentage policy, and Finance posting remain service-owned.

## Changes

- Added a Company/Project-scoped Stage lookup for validating claim line Stage IDs without trusting browser ownership.
- Added source-derived `cost_actuals` reads for whole-Project and requested-Stage Cost + Percentage billing basis work.
- Added same-Company General Ledger account lookup by ID and stable account code for later AR/revenue posting validation.
- Changed Client Invoice persistence to accept a complete line set with `stageId`, description, amount and optional revenue account so later invoice creation can preserve finalized claim Stage attribution.
- Kept the current service behavior unchanged by passing its existing single Project-level invoice line through the new repository line contract. Stage-preserving runtime behavior belongs to B17.6.
- Reused the existing Finance repository/service seam for future source-key and journal ownership checks instead of duplicating Finance-owned journal logic inside Client Billing.

## Boundaries preserved

- No Prisma model or migration change.
- No route/schema/React change.
- No Cost + Percentage calculation in the repository.
- No Client Invoice Finance journal is posted in this pass.
- No generic CRUD or new public endpoint is added.
- Every new named function has a short purpose comment.

## Next pass

**B17.5 - Claim / billing-basis service alignment:** validate same-Project Stages and implement the supported Fixed Price / Cost + Percentage basis and retention rules using these repository reads.
