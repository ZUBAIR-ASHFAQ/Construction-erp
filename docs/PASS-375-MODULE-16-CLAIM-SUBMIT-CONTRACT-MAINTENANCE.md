# Pass 375 — Module 16 Claim Submission and Contract Maintenance

Pass 375 closes repair items M16-01 and M16-02 on top of the exact Pass-374 baseline.

## Scope

The original seven Stage-23 Module-16 routes remain frozen in `MODULE_16_HTTP_ROUTES`. Pass 375 adds only two focused repair routes in `MODULE_16_PASS_375_HTTP_ROUTES`:

- `PATCH /api/v1/client-billing/contracts/:id`
- `POST /api/v1/client-billing/claims/:id/submit`

No new Module-16 permission, stable business error, domain event, Prisma model or migration is added.

## Client Contract maintenance

The Contract update command reuses `client_contracts.manage` and accepts the complete editable commercial-term set: original Contract value, billing method, retention percentage and currency. Project, Client, Contract number, lifecycle state and revised value remain server-owned.

Commercial terms are locked as soon as any Progress Claim leaves DRAFT. If original Contract value changes before that point, revised value follows the new original value only when no external approved revision is already reflected. If revised value already differs from original value, the original value cannot be changed through this repair command.

The command records `client_contract.updated` audit evidence but does not invent a new domain event.

## Explicit Progress Claim submission

A Progress Claim now follows the durable lifecycle:

`DRAFT -> SUBMITTED -> CERTIFIED`

Submission reuses `client_claims.create`, is bodyless and idempotent, validates that at least one saved Claim line exists, rechecks cumulative BOQ quantity history, calculates previous/current/gross values on the server and rejects a cumulative gross value above the Contract revised value.

Submission records the existing `progress_claim.submitted` audit/outbox evidence exactly once. Certification now requires `SUBMITTED`; it no longer creates implicit submission evidence. Submitted and certified worksheets are immutable because line replacement remains DRAFT-only.

## Deferred boundaries

Pass 375 does not implement Client Invoice payment/AR settlement. That remains Stage 26 Finance Source Adapters.

Pass 375 does not implement Change Order -> Client Contract revised-value mapping. That remains Stage 27 Cross-module Integration Completion.

## Simplicity boundary

The existing five-file backend module and four-file React feature remain unchanged. No helper/service/repository layer is added. Every new named production function has a short purpose comment.
