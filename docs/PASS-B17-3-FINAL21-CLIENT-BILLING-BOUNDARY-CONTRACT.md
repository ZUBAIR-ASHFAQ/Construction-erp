# Pass B17.3 - Final-21 Client Billing Boundary Contract

## Purpose

B17.3 tightens only the Client Billing Zod boundary contract. It does not change Prisma, repositories, services, routes, or React behavior.

The contract keeps the exact nine Final-21 Client Billing routes while making browser-controlled fields explicit, bounded and predictable before the later repository/service/OpenAPI passes.

## Changes

- Restricted `billingMethod` to the two Project commercial models already owned by Project Management: `FIXED_PRICE` and `COST_PLUS_PERCENTAGE`.
- Added named, confirmed lifecycle vocabularies for billing settings, Progress Claims and the currently issued Client Invoice state.
- Added one explicit server-owned request-field catalog covering Company/actor/project-scope authority, Client derivation, numbering, statuses, calculated claim totals, calculated invoice totals and posting metadata.
- Upgraded date validation from format-only checking to real `YYYY-MM-DD` calendar-date validation.
- Split money validation into exact positive request money and exact non-negative serialized/calculated money.
- Kept percentage precision at four decimal places and the valid `0..100` range.
- Bounded claim line arrays to 500 entries while preserving empty DRAFT claim creation/editing for the later finalize-time business rule.
- Added due-date ordering validation at the request boundary.
- Added strict response schemas for Project billing settings, claim lines, Progress Claims, invoice lines, Client Invoices and paginated claim/invoice lists.
- Kept all request objects `.strict()` so `companyId`, `clientId`, claim/invoice numbers, status, totals and posting ownership cannot be supplied through undocumented body fields.

## Intentionally deferred

This pass does not:

- query or validate Stage ownership in the repository/service;
- calculate Cost + Percentage claim basis;
- preserve claim Stage lines into new Client Invoice lines;
- post Client Invoices to Finance / AR;
- wire the response schemas into Fastify OpenAPI;
- change the React Stage selector or calculation presentation.

Those concerns remain separated into the following B17 passes so each change stays small and reviewable.

## Next pass

**B17.4 - Client Billing repository completion:** add only the repository reads/writes required for same-Project Stage validation, approved Cost + Percentage basis, Stage-preserving invoice creation and Finance integration support. Business calculations remain in the service.
