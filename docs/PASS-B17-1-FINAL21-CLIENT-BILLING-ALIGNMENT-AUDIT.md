# Pass B17.1 - Final-21 Client Billing Alignment Audit

## Purpose

Pass B17.1 is a **non-destructive alignment audit** for Final Module 15 - Client Billing. Unlike the previous B15/B16 modules, Client Billing already exists in the active codebase, so this pass does not rebuild it blindly.

The purpose of this pass is to compare the active Prisma, API, service, Finance/Project Cost integration, Documents behavior, React feature, tests, and migration history against the Final 21-module merged requirements and freeze the exact repair boundary for B17.2+.

Controlling Final-21 rules used by this audit:

- Client Billing is Module 15 and follows Supplier Payables in the corrected generation sequence.
- Hard prerequisites are Client Management, Project Management, Project Stages / Progress, Finance & Accounting, and Project Budget & Cost Tracking for Cost + Percentage billing.
- The module owns project billing settings, progress claims, claim lines, Client Invoices, and invoice lines.
- Physical progress, billing progress, billed value, receipt status, and profit remain separate concepts.
- Cost + Percentage billing uses a defined eligible **posted/approved cost basis** plus the configured percentage.
- Client Invoice creation must feed the Finance / Accounts Receivable representation through a stable idempotent source posting.
- Stage references must belong to the same Project.
- No standalone Contract module or generic CRUD expansion may be reintroduced.

## Baseline verification

The B16.10 archive was checked before making any Client Billing production change.

| Check | Result | Notes |
| --- | --- | --- |
| `node --test tests/final-21-*.test.mjs` | PASS | 386/386 Final-21 static tests pass before the B17.1 audit test is added. |
| Active Client Billing backend | PRESENT | Five-file backend exists under `apps/api/src/modules/client-billing/`. |
| Active Client Billing React feature | PRESENT | `api/`, `hooks/`, `components/`, and `pages/` exist. |
| Final-21 Client Billing persistence | PRESENT | `ProjectBillingSetting`, `ProgressClaim`, `ProgressClaimLine`, `ClientInvoice`, and `ClientInvoiceLine` exist. |
| Final-21 route count | PRESENT | The active schema freezes exactly 9 required Client Billing operations. |
| Final-21 permission/error vocabulary | PRESENT | 7 permissions and 5 stable errors match the merged requirements. |
| Standalone Contract ownership | REMOVED | No active `ClientContract` or `RetentionLedger` Prisma model and no Contract route is registered. |
| Dependency-backed build / Prisma validation | NOT RUN | The archive has no installed dependencies. No dependency-backed build claim is made in this pass. |

## B17.1 production-change boundary

This pass intentionally makes **no Client Billing production implementation change and no database migration**.

The existing Client Billing module is sufficiently substantial that the safe approach is to repair it in focused passes. B17.1 records the exact gaps first so that later passes do not accidentally break working claim/invoice history or reintroduce excluded Contract-era behavior.

## What is already aligned

### Active five-file module and React feature

The backend already follows the Final-21 five-file module rule:

- `client-billing.routes.ts`
- `client-billing.service.ts`
- `client-billing.repository.ts`
- `client-billing.schema.ts`
- `index.ts`

The React feature already uses the required four folders:

- `api/`
- `hooks/`
- `components/`
- `pages/`

TanStack Query, React Hook Form, and Zod are already used.

### Final-21 persistence ownership

The active Prisma schema already contains the required Module 15 records:

- `ProjectBillingSetting`
- `ProgressClaim`
- `ProgressClaimLine`
- `ClientInvoice`
- `ClientInvoiceLine`

Client and Project ownership are present on claims/invoices. The active schema no longer exposes a standalone Contract or Retention Ledger model.

### Exact API surface

The active contract already lists exactly these nine Final-21 routes:

1. `GET /api/v1/client-billing/projects/:projectId/settings`
2. `PUT /api/v1/client-billing/projects/:projectId/settings`
3. `GET /api/v1/client-billing/claims`
4. `POST /api/v1/client-billing/claims`
5. `PATCH /api/v1/client-billing/claims/:id`
6. `POST /api/v1/client-billing/claims/:id/finalize`
7. `POST /api/v1/client-billing/claims/:id/invoice`
8. `GET /api/v1/client-billing/invoices`
9. `GET /api/v1/client-billing/invoices/:id`

B17 must preserve this route count. It must not invent a generic invoice POST, DELETE, Contract API, payment API, or manual AR-post endpoint.

### Permissions and stable errors

The active module already uses the Final-21 permission vocabulary:

- `client_billing.read`
- `client_billing.settings.manage`
- `claims.create`
- `claims.edit`
- `claims.finalize`
- `client_invoices.create`
- `client_invoices.read`

The active module also already exposes the five required stable business errors:

- `CLAIM_NOT_FOUND`
- `CLAIM_LOCKED`
- `INVOICE_NOT_FOUND`
- `INVALID_BILLING_BASIS`
- `BILLING_STAGE_INVALID`

### Foundation behavior

The active service already reuses Foundation behavior for:

- request security context;
- company / Project scope;
- role and Project permission checks;
- idempotent commands;
- audit records;
- outbox events;
- company-scoped business numbering.

Client ownership is server-derived from the selected Project rather than accepted from the browser.

### Documents

Module 21 already allows `client_invoice` document links and applies Client Invoice read authorization. No duplicate Client Billing file-storage system is required.

## Alignment gaps that B17.2+ must repair

### Gap 1 - Stage ownership is not enforced for claim/invoice lines

**Severity: HIGH**

The Final-21 contract requires every Stage used for billing to belong to the same Project.

Current active behavior:

- `ProgressClaimLine.stageId` is a scalar UUID without a Prisma relation to `ProjectStage`.
- `ClientInvoiceLine.stageId` is a scalar UUID without a Prisma relation to `ProjectStage`.
- `ClientBillingRepository` has no Stage lookup.
- Claim creation/update does not validate `stageId -> Project` ownership.

Impact:

- a claim line can currently carry a Stage ID from another Project or Company;
- stage billing totals cannot be trusted until this is repaired;
- later stage billed/received/profitability views could become inconsistent.

B17.2 should add safe forward-only Stage relationship/integrity support, and later service passes must validate Stage scope before writes.

### Gap 2 - Invoice creation discards Stage billing attribution

**Severity: HIGH**

Current invoice creation collapses a finalized claim into one invoice line with:

- `stageId: null`
- one description
- the full certified subtotal

This loses the Stage allocation carried by progress claim lines.

Final-21 stage financial views require approved invoice lines tagged to Stage to calculate Stage billed value. B17 must preserve claim-line Stage attribution into invoice lines rather than replacing it with a single Project-only line.

### Gap 3 - Cost + Percentage billing basis is not implemented

**Severity: HIGH**

The Project module correctly supports:

- `FIXED_PRICE`
- `COST_PLUS_PERCENTAGE`
- `costPlusPercent`

The Project Budget & Cost module already owns source-derived posted actual costs and exposes actual-cost aggregation.

Current Client Billing finalization does not consume those actual costs. Instead it simply sums browser-entered claim line amounts and applies retention.

That is not sufficient for the Final-21 Cost + Percentage rule. B17 must calculate Cost + Percentage claims from an eligible posted/approved cost basis plus the configured Project percentage. The browser must never be authoritative for the eligible cost base or percentage calculation.

This audit does **not** invent which cost categories are eligible beyond what the merged requirements state. The service repair must use the documented Project/Cost source rules and make any necessary eligibility policy explicit rather than guessing silently.

### Gap 4 - Client Invoice is not posted to Finance / AR

**Severity: CRITICAL**

Current Client Invoice creation intentionally emits:

`financePostingDeferred: true`

and does not call Finance's trusted source-posting seam.

Finance Core now exists and exposes transaction-safe, source-keyed `postSourceJournalInTransaction(...)` behavior. The Final-21 Client Billing workflow requires the Client Invoice to be posted to Finance / AR.

B17 must therefore add one atomic, idempotent accounting effect when the invoice is created/issued. A retry must reuse the same stable source key and must never create duplicate revenue/receivable journals.

The exact account mapping must be derived from valid Finance accounts / invoice-line revenue account policy. This audit does not invent a hidden AR or revenue account code if the current configuration does not define one.

### Gap 5 - Claim deductions / advance recovery are not operational

**Severity: MEDIUM**

The schema contains billing settings for retention and advance recovery, but current finalization always sets:

- deductions = 0
- retention = configured retention percentage

`advanceRecoveryEnabled` is stored but not consumed by claim calculation.

The merged requirements say deductions, retention, and advance recovery are reviewed/applied **if enabled**, but they do not define a complete deduction/advance-recovery formula in this source. B17 must not invent an accounting formula. The later service pass should either implement only source-supported behavior or explicitly preserve unsupported items as configuration/read-only until a business rule exists.

### Gap 6 - OpenAPI is not complete enough for the Final-21 generation contract

**Severity: MEDIUM**

The current route layer authenticates requests and uses Zod parsing, but the Fastify route schemas mostly provide only shared tags/security. They do not publish the complete documented params/query/body/response/error contracts or stable operation IDs used by newer Final-21 modules.

B17 must keep the same 9 routes while upgrading their OpenAPI description and ensuring generated Swagger matches the actual Zod boundary.

### Gap 7 - React Stage and calculation UX is incomplete

**Severity: MEDIUM**

The current React feature works but is not yet fully aligned:

- Stage is entered as a raw Stage UUID rather than selected from the Project's Stage data.
- Cost + Percentage billing has no approved-cost basis preview/calculation view.
- Stage billing lines are not preserved into invoices because the backend currently collapses them.
- billed / received / outstanding UI cannot be fully completed until Module 16 Client Receipts is aligned in B18; B17 should expose correct billed data now and leave receipt-derived figures source-owned by B18.

No duplicate Stage, Project, Finance, or receipt master should be created in Client Billing.

## Dependency readiness

### Module 4 - Client Management

**READY**

Project ownership already supplies the Client used by claims/invoices. Client balances remain source-derived and must not be copied into Client Billing.

### Module 6 - Project Management

**READY**

Project exposes the authoritative Client, Project model/value, `FIXED_PRICE` / `COST_PLUS_PERCENTAGE`, and Cost + Percentage percent.

### Module 7 - Project Stages / Progress

**READY FOR INTEGRATION; CURRENT CLIENT BILLING DOES NOT USE ITS VALIDATION SEAM**

`ProjectStagesRepository.findStage(projectId, stageId)` already exists. B17 should reuse the Project Stage owner rather than inventing a second Stage table or accepting arbitrary Stage IDs.

Physical progress remains separate from billing progress. B17 must not automatically convert physical progress into an invoice unless the configured billing policy explicitly allows it.

### Module 9 - Project Budget & Cost Tracking

**READY FOR COST + PERCENTAGE BASIS**

The Budget/Job Cost repository already exposes source-derived actual-cost aggregation. B17 must reuse this source for Cost + Percentage calculations instead of trusting user-entered cost totals.

### Module 18 - Finance & Accounting

**READY FOR CLIENT INVOICE AR POSTING**

Finance already provides:

- `postSourceJournalInTransaction(...)`;
- stable source-key idempotency;
- open-period enforcement;
- active account validation;
- Project/Stage dimensions;
- balanced journal enforcement;
- audit/outbox on posted journals.

B17 should use this seam inside the Client Invoice business transaction.

### Module 21 - Documents & Audit

**READY**

`client_invoice` is already a supported document-link resource. No new Client Billing file table is required.

## Migration / history audit

The existing Client Billing data originated from older Module-16/Contract-era migrations and was already aligned forward by the Final-21 migration `20260829000400_final21_client_billing_without_contract` plus subsequent safe cleanup.

B17 must:

- preserve all historical migrations;
- never edit the old Module-16 migration files;
- use only forward migrations for new Stage/Finance integrity constraints if required;
- preserve existing Claim and Client Invoice IDs/history;
- avoid reintroducing `client_contracts`, BOQ, WBS, retention-ledger ownership, Change Order, or Approval Workflow dependencies.

Historical `module-16` docs/tests/scripts are legacy evidence and are not the controlling Final-21 scope. They should not be used to restore superseded Contract-era behavior.

## Frozen B17 repair order

### B17.2 - Persistence integrity alignment

Repair only database relationships/constraints/indexes required for safe Project/Stage/Finance ownership while preserving historical Claim/Invoice data. Use a forward migration only if needed.

### B17.3 - Boundary contract alignment

Tighten Zod request/response schemas without changing the exact nine-route public API. Align optional/derived fields and preserve the seven permissions/five stable errors.

### B17.4 - Repository alignment

Add only the persistence reads/locks needed for Stage validation, cost-basis reads, invoice-line preservation, and Finance account/source checks. Keep business calculations in the service.

### B17.5 - Claim / billing-basis service alignment

Implement same-Project Stage validation, Fixed Price rules, Cost + Percentage approved-cost calculations, retention handling, and supported deductions/advance-recovery behavior without conflating physical progress and billing progress.

### B17.6 - Client Invoice + Finance / AR integration

Preserve Stage-aware invoice lines and atomically post one idempotent Finance accounting effect using a stable Client Invoice source key.

### B17.7 - HTTP / OpenAPI alignment

Keep exactly nine routes and add complete Fastify schema/OpenAPI coverage, stable validation/error envelopes, authentication, permission and idempotency requirements.

### B17.8 - Cross-module / Documents / reconciliation verification

Verify Client -> Project -> Stage -> Claim -> Invoice -> Finance traceability, Client Invoice evidence linking, source-key ownership, Stage billed values, and no double counting.

### B17.9 - React alignment

Replace raw Stage IDs with existing Stage reads, add Fixed Price / Cost + Percentage calculation visibility, preserve Stage invoice detail, and keep future receipt/outstanding figures source-owned by Module 16.

### B17.10 - Integration, E2E and final freeze

Prove negative permissions, cross-company/Project isolation, idempotency, Stage mismatch rejection, Cost + Percentage basis, Finance rollback, invoice immutability, OpenAPI, Playwright, and full Final-21 regression before advancing to B18 Client Receipts / Payments.

## B17.1 acceptance result

**PASS - alignment baseline is understood and safe to repair.**

The existing Client Billing module is not discarded. Its correct Final-21 structure, route surface, permissions, persistence, idempotency, audit/outbox and React foundation are retained. B17.2+ will focus only on the concrete gaps recorded above.

## Next pass

**B17.2 - Client Billing persistence integrity alignment: add/repair only the Project Stage and Finance relationship constraints/indexes needed by the Final-21 billing workflow, using forward migration(s) and preserving all historical data/migrations.**
