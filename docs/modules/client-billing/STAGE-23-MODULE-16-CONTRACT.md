# Stage 23 — Module 16 Client Billing Contract

## Purpose

Stage 23 freezes the executable boundary for **Module 16 — Client Billing** before Prisma models, migrations, backend runtime code or React code are generated.

The module manages Project client billing contracts, progress claims, certified values, retention and Client Invoices. It must preserve certified/posted history, calculate financial values without binary floating-point loss and keep Finance posting idempotent when the later Finance source adapter is completed.

The corrected dependency-aware order is:

```text
Stage 22  Module 17  - Change Orders / Variations
Stage 23  Module 16  - Client Billing
Stage 24  Module 19  - RFI & Submittals
Stage 25  Module 20  - Daily Site Reports
Stage 26  Module 15B - Finance Source Adapters
Stage 27  Cross-module Integration Completion
Stage 28  Module 23  - Reports & Analytics
Stage 29  Module 1   - Dashboard
```

Part I remains authoritative for generation order, hard dependencies and deferred integrations. Appendix A remains authoritative for Module-16 workflow, tables, routes, validation, permissions, errors, events and React requirements unless Part I explicitly amends them.

## Stage prerequisite

The direct Stage-23 runtime handoff is genuine Stage-22 live acceptance:

```text
STAGE_22_ACCEPTED_READY_FOR_STAGE_23
```

The Module-16 contract may be reviewed and frozen while that live handoff is pending. That does not authorize Stage-23 production runtime activation or deployment.

The corrected prerequisites are:

```text
Module 5   - Project Management             required
Module 2   - CRM & Client Management        required; Client master owner
Module 15A - Finance Core                   required
Module 4B  - BOQ Project Mapping            optional when BOQ-backed claim lines are used
Module 17  - Change Orders / Variations     optional/as configured for approved variation values
```

Project-scope authorization already exists through Module 24B and must be reused. Stage 23 must not create another Project membership or authorization model.

The Appendix workflow mentions posting AR to Finance. Part I places AP/AR and source-specific Client Invoice posting adapters in **Stage 26 — Module 15B** after the source schemas exist. Stage 23 therefore owns the Client Invoice source record and stable source identity, but must not claim the full AR posting adapter/reconciliation before Stage 26.

## Ownership boundary

Module 16 owns exactly these five source-defined persistence resources:

```text
client_contracts
progress_claims
progress_claim_lines
client_invoices
retention_ledger
```

Existing upstream ownership remains:

```text
companies / audit / outbox / idempotency        Foundation
users / roles / permissions                      Module 24A
Project membership / allowed Project scope       Module 24B
projects / Project lifecycle                     Module 5
clients / Client lifecycle                       Module 2
BOQs / BOQ revisions / BOQ items                 Module 4B when used
Finance Core journals / fiscal periods           Module 15A
approved Change Orders / Change impact evidence  Module 17 when configured
Project budgets / forecasts                      Module 7
Documents / versions / links                     Module 18
```

Later ownership remains:

```text
AR source adapter / reconciliation               Module 15B at Stage 26
cross-module deferred integration proof          Stage 27
reports / analytics                              Module 23
Dashboard                                        Module 1
```

Stage 23 must not create duplicate Client, Project, BOQ, Change Order, Finance journal, payment, Document, Budget, reporting or Dashboard masters.

## Reviewed persistence boundary

### client_contracts

Source-defined fields:

```text
id
company_id
project_id
client_id
contract_no
contract_value
revised_value
billing_method
retention_percent
currency
status
```

Required meaning:

- every Client Contract belongs to exactly one Company and one Module-5 Project;
- `client_id` resolves to the Module-2 Client master in the same Company;
- Project access is revalidated through Module 24B before reads or writes;
- `contract_value`, `revised_value` and retention percentage values use DECIMAL/NUMERIC-safe handling;
- approved Change Orders may affect `revised_value` only through a controlled server-side integration;
- browser input must never directly impersonate Company, actor, Project authorization, approval/posting state or server-calculated revised values.

The source defines `contract_no` but does not define its numbering authority or uniqueness scope. Pass 346 records that gap instead of inventing Company-wide or Project-wide uniqueness.

The source does not enumerate `billing_method` or Client Contract `status` vocabularies.

The workflow says to maintain billing terms, but the reviewed API exposes only contract list/create operations and no contract update command. Stage 23 must not invent a generic update route during contract freeze.

### progress_claims

Source-defined fields:

```text
id
contract_id
claim_no
period_end
status
gross_value
previous_value
current_value
retention_amount
deduction_amount
certified_value
```

Required meaning:

- every Progress Claim belongs to exactly one Client Contract;
- the owning Contract determines Company, Project, Client, currency and retention policy;
- cumulative claimed quantity/value must never fall below previously certified values;
- financial totals use DECIMAL/NUMERIC and are calculated server-side from reviewed claim inputs and Contract policy;
- previously certified history cannot be rewritten by later draft claims;
- certified claims are immutable.

The source requires concurrency-safe claim numbering but does not define the numbering sequence scope or exact token format. Stage 23 must use the existing Foundation numbering contract in later passes without inventing undocumented display semantics.

The workflow says “review and submit claim”, and the source defines the event `progress_claim.submitted`, but the reviewed API contains no explicit claim-submit route. Pass 346 records this mismatch; no extra `/submit` endpoint is invented.

The source does not enumerate Progress Claim status values or define the exact transition at which `progress_claim.submitted` is emitted.

### progress_claim_lines

Source-defined fields:

```text
id
claim_id
boq_item_id nullable
description
contract_qty nullable
cumulative_qty nullable
current_qty nullable
rate nullable
current_value
```

Required meaning:

- every line belongs to exactly one Progress Claim;
- optional `boq_item_id` uses the existing Module-4B Project-mapped BOQ boundary and must not point to another Project;
- quantity, rate and value fields use exact DECIMAL/NUMERIC handling;
- cumulative quantity/value cannot regress below previously certified history;
- browser-supplied line values do not authorize certified totals, retention, deductions or Invoice totals.

The route uses `PUT /claims/:id/lines` and describes it as updating draft claim lines. The source does not explicitly define replace-all versus merge semantics, item IDs in the request body or partial line update rules. A later schema/service pass must freeze one simple executable interpretation without inventing generic line CRUD routes.

The source does not define how BOQ quantity/rate, milestone billing or manually described claim lines are combined when `billing_method` differs. That policy remains explicit rather than guessed.

### client_invoices

Source-defined fields:

```text
id
company_id
project_id
contract_id
claim_id nullable
invoice_no
invoice_date
due_date
gross_amount
retention_amount
tax_amount
total_receivable
status
```

Required meaning:

- a Claim-based Client Invoice is generated from the reviewed `/claims/:id/invoice` command;
- where certification is required by the configured billing method, Invoice creation requires a certified/approved Claim;
- retrying Invoice creation for the same eligible source must not create duplicate financial source records;
- Invoice numbering is concurrency-safe;
- gross, retention, tax and receivable totals use exact decimal arithmetic;
- certified Claims and posted Invoices are immutable;
- the originating Client Invoice must provide a stable source identity for the later Module-15B AR posting adapter.

The database shape allows `claim_id nullable`, but the reviewed API defines no standalone Client Invoice create command. Stage 23 must not invent non-Claim Invoice creation merely because the column is nullable.

The source does not define Invoice status vocabulary, invoice-number scope/format, due-date derivation, tax policy, tax-rate inputs or payment-term derivation. Those gaps remain recorded.

### retention_ledger

Source-defined fields:

```text
id
company_id
project_id
source_type
source_id
direction
amount
released_amount
status
```

Required meaning:

- retention activity belongs to the same Company and Project as its billing source;
- retention amounts use exact decimal arithmetic;
- release must never exceed available approved retention;
- prior certified/invoiced history remains unchanged when retention is released;
- retention release is an explicit controlled command and produces durable audit/outbox evidence.

The source does not enumerate `source_type`, `direction` or retention `status` vocabularies. It also does not define whether the release command is full or partial, the request body, release date authority or separate approval requirements. Pass 346 does not invent those details.

## Change Order boundary

The corrected sequence generates Module 17 immediately before Module 16 so approved variation values can be consumed by Client Billing when configured.

The source requires:

```text
approved Change Orders -> controlled revised Client Contract value
certified Claim values -> include approved variations when applicable
```

Stage 23 therefore freezes these rules:

1. Browser requests cannot directly set an authoritative approved Change amount on the Client Contract.
2. Module 17 remains the owner of approved Change Orders and impact evidence.
3. Module 16 may consume only approved, same-Company, same-Project Change values through a reviewed server integration.
4. Applying the same approved variation to a Contract/Claim more than once is forbidden.
5. The exact Change-to-Contract adapter/source-key structure is not fully defined by Appendix A and remains subject to later implementation review and Stage-27 end-to-end proof.

## Finance / AR boundary

Module 15A Finance Core already exists, but Part I defers AP/AR and source-specific adapters to Module 15B at Stage 26.

Therefore Stage 23 freezes this split:

```text
Stage 23 Module 16
- owns Client Contract, Claim, Invoice and Retention source records
- freezes immutable certified/issued history
- keeps stable Client Invoice source identity
- records Module-16 audit/outbox events

Stage 26 Module 15B
- posts the Client Invoice into AR
- uses a stable source key
- prevents duplicate AR posting
- reconciles source Invoice to Finance state
```

A successful Stage-23 Invoice issue must not falsely claim that the later AR adapter has already posted unless Stage 26 exists and confirms it.

Stage 27 must prove the corrected `Claim -> Invoice -> AR` chain end to end, including approved variation values and stable idempotent source identity.

## Route boundary

The reviewed public API contains exactly seven operations:

```text
GET  /api/v1/client-billing/contracts
POST /api/v1/client-billing/contracts
POST /api/v1/client-billing/contracts/:id/claims
PUT  /api/v1/client-billing/claims/:id/lines
POST /api/v1/client-billing/claims/:id/certify
POST /api/v1/client-billing/claims/:id/invoice
POST /api/v1/client-billing/retention/:id/release
```

No generic CRUD endpoints are generated automatically.

Pass 346 specifically does **not** invent:

```text
GET    /api/v1/client-billing/contracts/:id
PATCH  /api/v1/client-billing/contracts/:id
DELETE /api/v1/client-billing/contracts/:id
GET    /api/v1/client-billing/claims/:id
POST   /api/v1/client-billing/claims/:id/submit
PATCH  /api/v1/client-billing/claims/:id
DELETE /api/v1/client-billing/claims/:id
POST   /api/v1/client-billing/invoices
PATCH  /api/v1/client-billing/invoices/:id
POST   /api/v1/client-billing/invoices/:id/post-ar
POST   /api/v1/client-billing/payments
```

The lack of detail/update/payment routes is recorded rather than silently repaired with undocumented endpoints.

## Request and response authority

All normal Module-16 routes require an active authenticated session.

The server derives or revalidates:

```text
company identity
actor identity
permissions
allowed Project scope
Client ownership
Contract/Claim/Invoice lifecycle state
claim/invoice numbering
previous certified values
retention/deduction policy values
server-owned totals
certification state
AR source identity/posting state
```

The browser may send only reviewed business inputs after strict Zod validation. Dates, UUIDs, decimals and any later frozen enums are normalized at the API boundary. Financial decimals are serialized without precision loss.

All endpoints use the existing consistent API envelope and stable error handling. SQL details, stack traces and unauthorized records must not leak.

## Authorization boundary

The source-defined stable permission family is exactly:

```text
client_billing.read
client_contracts.manage
client_claims.create
client_claims.certify
client_invoices.issue
client_retention.release
```

Route-level checks must be revalidated by service/resource policy before sensitive writes. UI permission hiding is convenience only; API authorization remains authoritative.

Pass 346 does not invent separate edit, submit, tax, payment, AR-posting or Change-application permissions.

## Stable business errors

The source-defined Module-16 errors are exactly:

```text
CLIENT_CONTRACT_NOT_FOUND
CLAIM_INVALID_CUMULATIVE_VALUE
CLAIM_NOT_CERTIFIED
CLIENT_INVOICE_ALREADY_CREATED
RETENTION_RELEASE_NOT_ALLOWED
```

Later passes may use existing shared validation/auth/not-found infrastructure where appropriate, but must not rename these reviewed Module-16 business codes.

The source does not define a separate stable error for duplicate Contract/Claim/Invoice number collisions, missing BOQ mapping, invalid Client scope, closed Project, tax policy or Finance adapter unavailability. Pass 346 records those gaps instead of inventing public error codes.

## Events, audit and outbox

The source-defined Module-16 events are exactly:

```text
client_contract.created
progress_claim.submitted
progress_claim.certified
client_invoice.issued
client_retention.released
```

Sensitive writes record Foundation audit/outbox evidence after successful business validation. Core transaction correctness must not depend on a background worker.

Audit evidence must include actor user ID, Company/Project scope, entity ID, request ID and important before/after values, without logging passwords, tokens or secret material.

The missing explicit claim-submit API means Pass 346 does not yet guess which command emits `progress_claim.submitted`; the later service pass must resolve that only within the reviewed seven-route boundary.

## Immutability and idempotency

Stage 23 freezes these source rules:

- certified Claims are immutable;
- posted/issued financial history is corrected by controlled later mechanisms rather than destructive edits;
- Client Invoices are generated once from their eligible source;
- AR posting later uses a stable source key and is idempotent;
- retention release cannot rewrite prior certified Claim or issued Invoice values;
- concurrent claim/invoice numbering must not create duplicates;
- duplicate command retries must not create duplicate Claims, Invoices, retention releases, audit records or outbox transitions.

The source does not define public reversal/cancel/reopen commands for Module 16. None are invented in Pass 346.

## React boundary

The reviewed React feature path is:

```text
apps/web/src/features/client-billing/
  api/
  hooks/
  components/
  pages/
```

Minimum UI later includes:

```text
Contract summary
Progress Claim worksheet
Cumulative valuation
Retention / deductions
Invoice generation
Payment / retention status
```

TanStack Query owns server state. React Hook Form + Zod handle forms. The UI hides unauthorized actions, but the API remains authoritative.

Payment status is read from the appropriate Finance/billing source boundary; Pass 346 does not create a Module-16 payment master or payment-write API because none is defined.

## Source ambiguities deliberately left visible

Pass 346 records these unresolved source points instead of silently filling them with model assumptions:

1. Client Contract number authority, format and uniqueness scope are not defined.
2. Claim number authority, format and uniqueness scope are not defined beyond concurrency safety.
3. Invoice number authority, format and uniqueness scope are not defined beyond concurrency safety.
4. `billing_method` vocabulary is not enumerated.
5. Client Contract, Progress Claim, Client Invoice and retention status vocabularies are not enumerated.
6. The workflow says Claims are submitted and defines `progress_claim.submitted`, but no submit route exists.
7. Contract terms are described as maintained, but no Contract update route exists.
8. `PUT /claims/:id/lines` replace-all versus merge semantics are not explicitly defined.
9. No Contract, Claim or Invoice detail GET route is defined.
10. Contract list filters and response shape beyond validated pagination are not defined.
11. Create Contract, create Claim, certify, invoice and retention-release command bodies are not fully enumerated.
12. Exact calculation rules for gross/current/previous/certified values across billing methods are not fully defined.
13. Exact retention and deduction calculation policy inputs are not fully defined.
14. Tax calculation policy, tax rate source and due-date derivation are not defined.
15. BOQ quantity/rate versus milestone/manual billing behavior is not fully defined.
16. Approved Change Order to `revised_value` adapter/source-key semantics are not fully defined.
17. The database permits nullable Invoice `claim_id`, but no standalone Invoice-create API exists.
18. Retention `source_type`, `direction`, `status` and partial/full release semantics are not enumerated.
19. Payment tracking is required in workflow/UI, but Module 16 defines no payment table or payment command.
20. Full AR posting belongs to Stage-26 Module 15B, so Stage 23 must not claim it is complete.
21. No Module-16 reversal/cancel/reopen API or correction workflow is defined.
22. No Module-22 Approval Workflow hard dependency is defined for Client Billing certification; Pass 346 does not invent one.
23. No dedicated Module-16 stable errors are defined for numbering collisions, invalid Client/BOQ scope, closed Project or deferred AR adapter state.

## Pass 346 deliverable boundary

Pass 346 is a contract-freeze pass only.

It may add:

```text
this contract document
one simple contract verifier
one focused static test file
one evidence JSON generated by the verifier
minimal package/workspace/README registration
```

It must not add:

```text
Client Billing Prisma models
Stage-23 migration
client-billing.schema.ts
client-billing.repository.ts
client-billing.service.ts
client-billing.routes.ts
client-billing/index.ts
React Client Billing feature
new public routes
new permissions
Finance 15B AR adapter
payment model/API
new Change Order adapter implementation
```

## Exit criteria

Pass 346 is complete when:

- the five source-owned persistence resources are frozen;
- all seven reviewed APIs are frozen without extras;
- all six reviewed permissions are frozen without extras;
- all five stable errors are preserved;
- all five source events are preserved;
- Module 5, Module 2 and Module 15A prerequisites remain intact;
- optional/as-configured BOQ and Change Order boundaries are explicit;
- Module 24B Project scope is reused;
- certified/issued history remains immutable;
- cumulative-claim, retention and concurrency-safe numbering rules are recorded;
- Stage-26 AR adapter ownership is explicit;
- Stage-27 Claim -> Invoice -> AR proof remains required;
- source ambiguities remain visible instead of being guessed;
- no Client Billing production runtime or database migration is generated early;
- the contract gate, workspace check and migration policy pass.

The next reviewed pass is:

```text
Pass 347 — Module 16 Client Billing Prisma models, constraints, indexes and Stage-23 migration.
```

## Pass 347 persistence checkpoint

Pass 347 implements the reviewed Stage-23 persistence boundary without changing the seven-route HTTP contract.

The centralized Prisma schema now contains exactly these five Module-16 models:

```text
ClientContract
ProgressClaim
ProgressClaimLine
ClientInvoice
RetentionLedger
```

The reviewed migration is:

```text
20260826000300_module_16_client_billing_core
```

The persistence decisions stay deliberately narrow:

- Client Contracts use same-Company Project and Client foreign keys.
- Contract, Claim, Invoice and Retention financial amounts use exact PostgreSQL DECIMAL values.
- Optional BOQ-backed Claim lines are checked against the Client Contract Project and Company.
- Contract, Claim and Invoice number columns receive lookup indexes only; no undocumented uniqueness scope is invented.
- A Claim can produce at most one Client Invoice through a unique nullable `claim_id` source key.
- An Invoice claim must belong to the same Client Contract as the Invoice.
- Client Invoice identity, dates and financial values cannot be rewritten after creation; later lifecycle `status` progression remains possible for Stage-26 integration.
- Once a Claim has an Invoice, the Claim header and Claim lines cannot be rewritten or deleted.
- Certified-Claim immutability before Invoice creation remains a later service lifecycle rule because the source does not enumerate a certified-status token.
- Retention `released_amount` cannot exceed retained `amount`, cannot move backwards, and source identity/value cannot be rewritten.
- Retention source/direction/status vocabularies remain string-backed.
- No payment table, AR table/adapter, Change-to-Contract adapter, API schema, repository, service, route or React feature is created in Pass 347.

Cumulative Claim validation that depends on previously certified business state remains for the repository/service transaction passes instead of being approximated with an unsafe database-only guess.

The next reviewed pass is:

```text
Pass 348 — Module 16 strict Zod/API schemas for the seven reviewed Client Billing operations.
```


## Pass 348 strict API schema checkpoint

Pass 348 adds only `apps/api/src/modules/client-billing/client-billing.schema.ts` and the directly related schema verification evidence. The seven public routes, six permissions, five stable errors and five source events remain unchanged.

The strict executable request boundary is intentionally small:

```text
GET contracts
  -> page, pageSize only (maximum 100)

POST contracts
  -> projectId, clientId, contractValue, billingMethod, retentionPercent, currency

POST contracts/:id/claims
  -> periodEnd

PUT claims/:id/lines
  -> complete replacement of lines[]
  -> each line: boqItemId?, description, contractQty?, cumulativeQty?, currentQty?, rate?, currentValue

POST claims/:id/certify
  -> certifiedValue

POST claims/:id/invoice
  -> invoiceDate, dueDate

POST retention/:id/release
  -> bodyless
```

This boundary does not make browser input authoritative for Company, actor, allowed Project scope, Contract/Claim/Invoice numbering, revised Contract value, Claim header totals, retention/deduction totals, Invoice tax/receivable totals, lifecycle status, retention release amount or Stage-26 AR posting state.

The reviewed `PUT` Claim-line route is frozen as **complete draft-line replacement**. This keeps the source's single PUT command simple and avoids inventing line IDs, merge semantics or extra line CRUD routes.

Because the source defines no Contract/Claim/Invoice detail GET route, the bounded Contract register readback carries the source-owned nested Claim, Claim-line, optional Claim Invoice and Retention Ledger state needed by the later React workspace. No extra detail endpoint is created.

Certification accepts only `certifiedValue`. Previous certified values, Claim header totals, retention and deductions remain server-side service calculations/validations. The schema does not attempt to encode cumulative-history rules that require database state.

Invoice generation accepts `invoiceDate` and `dueDate` only. Invoice number, gross amount, retained amount, tax amount, total receivable and status remain server-owned. Tax calculation and due-date derivation policy are still unresolved source gaps; Pass 348 does not invent a browser tax field or a tax-rate policy.

Retention release is bodyless because the source does not define partial-release amount/date fields. No partial-release request field is invented. The service/repository passes must enforce that a release cannot exceed the currently releasable approved retention.

All financial, quantity and rate values cross the API as exact decimal strings. `billing_method`, lifecycle statuses, retention source/direction/status values and number formats remain string-backed because the source does not enumerate public tokens.

The source still defines `progress_claim.submitted` without a submit route. Pass 348 does not invent `/claims/:id/submit` and does not freeze the event timing yet. Full Client Invoice -> AR posting remains Stage-26 Module 15B, with Stage-27 end-to-end proof still required.

The next reviewed pass is:

```text
Pass 349 — Module 16 Company/Project-scoped Client Billing repository primitives.
```

## Pass 351 Invoice and Retention checkpoint

Pass 351 completes the reviewed Stage-23 service commands that issue a Client Invoice from one certified Progress Claim and release retained value. It does not add public routes yet; HTTP exposure remains Pass 352.

The executable decisions stay narrow:

- `POST /claims/:id/invoice` requires the existing implementation-private `CERTIFIED` Claim state and `client_invoices.issue` permission.
- Invoice numbering uses the existing Foundation sequence key `client-invoice`; this does not claim a source-defined public numbering scope or display rule.
- `gross_amount` uses the Claim's certified value, while certified retention and deduction amounts reduce `total_receivable`.
- The source does not define tax inputs or a tax policy, so Pass 351 keeps `tax_amount = 0.00` instead of inventing a rate or tax engine.
- `due_date` must not precede `invoice_date`; no additional due-date derivation policy is invented.
- one Claim can issue at most one Client Invoice; the database unique source key and service conflict check both remain active.
- the Invoice outbox payload carries stable source key `client-invoice:<invoice-id>` for the later Stage-26 AR adapter, but Stage 23 does not post AR early.
- positive retained value creates one server-owned Retention Ledger row keyed to the issued Client Invoice.
- because the reviewed retention release request is bodyless, Pass 351 interprets it as full release of the remaining approved retained amount. Partial-release amount/date fields are not invented.
- repeating an already-complete release returns the current released row without creating another audit/outbox transition.
- Contract-register readback now includes the Retention rows attached to its issued Claim Invoices, avoiding an undocumented detail endpoint.

The Retention source/direction/status tokens used by this service are implementation-private strings only:

```text
CLIENT_INVOICE
WITHHELD
HELD
RELEASED
```

They are not promoted into new public enums because Appendix A does not enumerate those vocabularies.

### Approved Change boundary remains fail-closed

Pass 351 does not guess which Client Contract should receive a Project-level approved Change revenue amount. Module 17 currently owns the approved Change Order and its impact evidence, but the source does not define the Change-to-Client-Contract target mapping/source-key structure. Applying every Project Change to every Contract would be incorrect when a Project has more than one billing Contract.

Therefore no unsafe `revised_value` mutation or invented `CLIENT_CONTRACT` Change target token is generated here. Approved Change values remain a reviewed Stage-27 integration proof item, where the exact target mapping and idempotent source identity must be available before Contract value is changed.

### Finance boundary remains deferred

Pass 351 creates the stable Client Invoice source record only. Full AR posting and reconciliation remain Stage-26 Module 15B. Stage 27 still has to prove `Claim -> Invoice -> AR`, including approved variations and stable source identity.

The next reviewed pass is:

```text
Pass 352 — Module 16 Fastify routes, module registration, authentication/RBAC, exact seven-route HTTP surface and OpenAPI verification.
```

