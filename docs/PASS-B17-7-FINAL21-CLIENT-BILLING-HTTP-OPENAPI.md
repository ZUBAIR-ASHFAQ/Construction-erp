# Pass B17.7 - Final-21 Client Billing HTTP / OpenAPI Completion

## Purpose

B17.7 completes the HTTP boundary for Final-21 Module 15 after the persistence, billing-basis, Stage attribution and Finance / AR behavior were stabilized in B17.2-B17.6. The public surface remains the exact nine-route Client Billing contract.

## Changes

- Added unique OpenAPI `operationId`, summary, bearer-security metadata and documented success/error responses to all nine routes.
- Added exact Project/ID path parameter schemas and bounded claim/invoice list query schemas.
- Added request-body JSON Schemas that mirror the existing B17.3 Zod boundaries without accepting Company ownership, actor identity, authoritative totals, document numbering or posting status from the browser.
- Added the required `Idempotency-Key` header contract to all five Client Billing write commands and kept the 200-character Foundation limit.
- Documented the explicit empty finalization command body instead of introducing a generic PATCH transition.
- Documented the stable API error envelope and the Module-15 business codes `CLAIM_NOT_FOUND`, `CLAIM_LOCKED`, `INVOICE_NOT_FOUND`, `INVALID_BILLING_BASIS` and `BILLING_STAGE_INVALID`. Foundation/auth/idempotency/numbering/Finance failures keep their own stable codes.
- Wired the strict B17.3 Zod response schemas into the route handlers before successful responses are sent.
- Corrected the Client Billing authentication pre-handler so `authenticateRequest` receives the configured database client on every protected route.

## Boundaries preserved

- No Prisma schema or migration change.
- No repository or service business-rule change.
- No React change.
- No new helper production file or abstraction.
- No generic CRUD endpoint.
- The exact nine-route boundary is unchanged.
- Existing Stage, Cost + Percentage, invoice persistence and Finance / AR behavior from B17.2-B17.6 is unchanged.

## Next pass

**B17.8 - Client Billing cross-module reconciliation and Documents proof:** verify Client -> Project -> Stage -> Claim -> Invoice -> Finance traceability, Stage billed reconciliation, Module 21 Client Invoice document ownership and source-key/idempotency behavior without double counting.
