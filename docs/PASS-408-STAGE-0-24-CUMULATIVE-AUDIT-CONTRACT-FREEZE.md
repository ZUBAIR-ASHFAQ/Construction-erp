# Pass 408 — Stage 0→24 Cumulative Audit Contract Freeze

## Purpose

Pass 408 is the dedicated **Stage 0→24 cumulative audit contract freeze** on top of the exact Pass-407 archive.

It converts the confirmed Pass-0→407 audit findings into an explicit, dependency-aware repair program before any further production behavior is changed. This pass is **documentation and verification only**. It deliberately changes no production runtime, Prisma model, migration, database relation, repository behavior, service behavior, HTTP route, React behavior, permission, stable error, domain event, worker, queue behavior, configuration value or business workflow.

The controlling source remains the 83-page **Construction ERP — Final Corrected Requirements and Code-Generation Guide**:

- Part I controls generation order, dependency gates, table ownership and deferred integrations.
- Appendix A controls workflows, APIs, validation, authorization, events, UI and detailed acceptance requirements unless Part I explicitly amends them.
- Stage 25 / Module 20 Daily Site Reports must not begin until the current Stage-0→24 state is repaired and re-accepted.

## Baseline and production freeze

- Baseline: **Pass 407 — Stage 24 / Module 19 Final Acceptance Audit**.
- Audited implementation range: **Foundation / Stage 0 through Stage 24 / Module 19**.
- Accepted production snapshot covers `apps/`, `packages/`, `docker/`, `docker-compose.yml`, `tsconfig.base.json`, `eslint.config.mjs` and `playwright.config.mjs`.
- Pass-407 production SHA-256: `d63da857e5dbc43585188139cb80ae77b35a415ae01ef876b7132c6335111494`.
- Pass 408 must keep that production snapshot byte-for-byte unchanged.
- Stage 25 / Module 20 remains blocked.

## Non-negotiable engineering rules frozen by this pass

1. Keep the required stack: React + Vite + TypeScript, Fastify + TypeScript, Prisma ORM and PostgreSQL.
2. Keep the TypeScript monorepo and current `apps/` + `packages/` architecture.
3. Keep every generated backend business module inside its required five-file folder: schema, repository, service, routes and `index.ts`.
4. Do not create helper/service/repository sublayers merely to shorten files.
5. Keep code junior-readable: direct control flow, explicit names, small local helpers only when they remove real duplication.
6. Every named function or method introduced or materially edited must have a short purpose comment.
7. Do not delete a one-reference function merely because it looks unused. First classify it as `KEEP`, `WIRE` or `REMOVE` using source/runtime evidence.
8. Reuse existing APIs, repositories, hooks and Foundation infrastructure before adding a new file or abstraction.
9. Do not invent missing business policy, status vocabulary, permission codes, events, fields, formulas or generic CRUD routes.
10. Keep Stage-26 Finance source adapters and Stage-27 cross-module completion work deferred to their controlling gates.

## Audit result

### Verified intact

The cumulative audit confirms the following are still correct and must not be rewritten during repairs:

- The required technology stack is intact.
- Prisma remains centralized and uses PostgreSQL.
- No Express, NestJS, Drizzle, Sequelize, TypeORM, Mongoose, Knex, Next.js, Redux, Zustand or Axios package dependency is present.
- All 21 currently generated API business-module folders have exactly the required five files.
- All 21 current React features contain `api/`, `hooks/`, `components/` and `pages/`.
- The source-route comparison found no missing original public route through Stage 24, apart from Finance AP/AR/payment work intentionally deferred to Stage 26.
- Route-to-service static review found no called service method missing.
- The maintained workspace guard still verifies a short purpose comment for every named production function/method.
- The focused Pass-407 + migration + workspace acceptance boundary is green.

These items are `KEEP_AS_IS`. Repair passes must not churn them.

---

# Frozen repair findings

## A408-01 — Maintained static runner contains superseded historical assertions

**Decision: `REPAIR_PASS_409`**

The dependency-free maintained runner currently executes historical pass-local tests that intentionally asserted future functionality was absent. Later approved passes implemented that functionality, but those historical negative assertions still run as current regression tests.

The Pass-407 baseline run reported:

- 3,012 tests;
- 2,952 passed;
- 29 failed;
- 31 skipped.

The 29 failures are dominated by Pass-390→405 absence/defer assertions plus one stale Prisma model-list assertion in `tests/database.test.mjs`.

Pass 409 must repair **test supersession hygiene only**. It must not remove approved Module-19 behavior or weaken current regression coverage. Historical tests may remain as historical evidence, but the maintained current runner must stop treating superseded absence assertions as current acceptance requirements.

## A408-02 — Procurement runtime policy configuration is not wired through normal startup

**Decision: `REPAIR_PASS_410`**

`buildApp()` already accepts:

- `procurementRequisitionApprovalDefinitionCode`;
- `procurementRequireRationaleForNonLowestSelection`.

The Procurement service already consumes the corresponding options. However, `packages/config/src/server.ts` does not load either setting and `apps/api/src/main.ts` does not pass either setting into `buildApp()`.

Pass 410 must add the smallest validated configuration wiring from server environment/config → `main.ts` → `buildApp()` → existing Procurement service options. It must not create a Procurement policy subsystem, new database table, new permission, or new approval workflow.

## A408-03 — Approval delegation creation exists but durable delegation readback is unresolved

**Decision: `FREEZE_PASS_411`, `IMPLEMENT_PASS_412`**

The source UI requires a delegation screen. Current code can create a delegation, and `listDelegationsForCompany()` already exists in the repository, but there is no approved GET readback route/API/hook/list UI.

Pass 411 must freeze the smallest permission-safe read contract required for the existing delegation screen. Pass 412 may then wire the existing repository capability through service/route/API/hook/UI. No generic delegation CRUD, delete or edit flow is authorized by this freeze.

## A408-04 — Inventory-count durable readback exists but the UI keeps the active count only in local state

**Decision: `WIRE_PASS_413`**

`getInventoryCount()` and `useInventoryCount()` already exist. `PhysicalInventoryCount` does not consume that hook; it keeps the created count in local `useState` only.

Pass 413 must reuse the existing durable readback so a selected count can be reloaded/reopened after navigation or browser refresh. No new Inventory endpoint, table, repository function or count subsystem is required.

## A408-05 — RFQ durable detail hook exists but the active RFQ is copied from list/local mutation state

**Decision: `WIRE_PASS_414`**

`useRfq()` already exists but is not consumed by the Procurement workspace. The active RFQ is kept in local `Rfq` state and can be copied from the RFQ list row.

Pass 414 must use the existing durable RFQ detail read for the active RFQ or, only if runtime/source proof shows it is truly redundant, remove the unused detail hook/API. The preferred repair is `WIRE`, because the existing UI explicitly promises durable RFQ readback after reload.

## A408-06 — Initial RFI attachments are not linked through Module 18

**Decision: `FREEZE_PASS_415`, `IMPLEMENT_PASS_416`**

The Module-19 workflow creates an RFI with attachments. Current create-RFI input does not link initial Documents, even though Module 18 already owns `DocumentLink` behavior.

Pass 415 must freeze the minimum attachment-link contract using existing Module-18 ownership. Pass 416 must reuse existing Document-link persistence/service capability rather than create a Module-19 attachment table or file subsystem.

The source mentions RFI `location` but does not define a persistence/API field. That ambiguity remains unresolved and must not be guessed during this repair.

## A408-07 — RFI/Submittal historical evidence is not bound to the exact immutable Document version

**Decision: `FREEZE_PASS_415`, `IMPLEMENT_PASS_416`**

Current RFI responses and Submittal revisions persist a Document header ID. The source requires immutable Document versions where decision history requires it.

Pass 415 must freeze whether historical Module-19 evidence stores the exact `DocumentVersion.id` directly or through the narrowest existing Module-18 relation that guarantees immutable version identity. Pass 416 must preserve prior history and must not rewrite old evidence to a newer Document version.

## A408-08 — Source-required business notifications are incomplete across accepted modules

**Decision: `FREEZE_PASS_417`, `INFRA_PASS_418`, `PRODUCERS_PASS_419_421`**

The project currently has only:

- `auth-notification.worker.ts`;
- `approval-timing.worker.ts`.

The source also requires business notifications for accepted workflows including:

- BOQ revision submission/freeze reviewers;
- Project membership and lifecycle recipients;
- Budget approval/threshold/over-budget recipients;
- Procurement approval/RFQ due/vendor-selection recipients;
- internal Purchase Order issue/revision/approval recipients;
- Subcontract application/certification/retention milestones;
- Workforce pending-timesheet and appropriate rejection/approval recipients;
- Client Billing certification/invoice due-overdue/retention recipients;
- Change Order pending/approval/rejection recipients;
- Module-19 new assignment, response, review decision and overdue recipients.

Pass 417 must classify each source notification as mandatory, conditional/configured or external-integration-only and freeze one shared Foundation-based delivery contract. It must **not** create a 25th business module.

Pass 418 may add one small reusable notification delivery worker/configuration path on top of Foundation outbox/queue primitives. Passes 419→421 then add only thin producers in the owning business services/workers. Conditional wording such as “where appropriate”, “subject to policy” or “through approved integration” remains conditional; no policy may be invented.

## A408-09 — One-reference production functions require proof before deletion

**Decision: `PROOF_PASS_422`, `CLEANUP_PASS_423`**

The cumulative audit found the following production names appearing only at their definition:

- `listDocumentLinks`
- `linkDocumentToResource`
- `findGoodsReceiptById`
- `countPayrollCalculationExceptions`
- `findApprovalRequestForCompany`
- `findActiveDelegation`
- `listDelegationsForCompany`
- `resolveRestrictedProjectScope`
- `listScheduleBaselines`
- `listScheduleProgressUpdates`
- `listChangeRequestLines`
- `listEstimateItems`
- `listProgressClaimLines`
- `listRetentionEntriesForSourceIds`
- `findRetentionLedgerBySource`
- `findTimesheetById`
- `useRfq`
- `useInventoryCount`

Pass 422 must classify each item as `KEEP`, `WIRE` or `REMOVE` with source/runtime/test evidence. Pass 423 may delete only proven `REMOVE` items and should wire already-approved capabilities rather than duplicate them.

## A408-10 — Several source files are too large for the preferred readability target

**Decision: `SIMPLIFY_PASS_423_424`**

Current large files include:

- `inventory.service.ts` — 1,826 lines;
- `subcontracts.service.ts` — 1,573;
- `administration.service.ts` — 1,437;
- `purchase-orders.service.ts` — 1,380;
- `hr-payroll.service.ts` — 1,352;
- `procurement.service.ts` — 1,268;
- `client-billing.service.ts` — 1,158;
- `approvals.service.ts` — 1,126;
- `inventory-workspace.tsx` — 1,049;
- `inventory.routes.ts` — 1,014;
- `subcontracts-workspace.tsx` — 875;
- `purchase-orders-workspace.tsx` — 874.

This is a readability warning, not permission to redesign the architecture.

Pass 423 should shorten backend code **in place** by removing proven dead code, flattening needless nesting, reusing existing helpers and keeping repository/service ownership explicit. Do not split a required five-file backend module into managers/use-cases/helpers solely to reduce line count.

Pass 424 may split only genuinely independent frontend sections into a few cohesive components inside the existing feature `components/` folder. Do not create one-file-per-function abstractions or new folder layers.

## A408-11 — Full dependency-backed and live verification is still pending

**Decision: `VERIFY_PASS_425_427`**

The archive intentionally contains no installed `node_modules` and no package lockfile. This audit therefore does not claim a dependency-backed Vite build, Prisma generate/validate, live PostgreSQL integration execution or Playwright browser execution.

Pass 425 must make all maintained current static/type/build/Prisma/migration checks green when dependencies are available. Pass 426 must run the live PostgreSQL/Fastify.inject and Playwright regression sweep through Stage 24. Pass 427 is the audit-only final Stage-0→24 acceptance/handoff gate.

---

# Deferred boundaries that remain unchanged

## Stage 26 — Module 15B Finance Source Adapters

Do not pull AP/AR/source-specific posting adapters forward merely because cumulative repair work is open. Finance Core remains valid before source-adapter completion; Finance completion remains Stage 26.

## Stage 27 — Cross-module Integration Completion

Do not silently finish BOQ award linkage, Change target adapters, deferred Finance adapters or reporting-source integration inside the repair passes unless the controlling Stage-27 contract explicitly assigns that work.

---

# Approved repair sequence

| Pass | Repair boundary |
| --- | --- |
| 409 | Current static-test / historical assertion supersession hygiene |
| 410 | Procurement runtime configuration + approval/rationale policy wiring |
| 411 | Module-22 delegation readback contract freeze |
| 412 | Module-22 delegation readback implementation |
| 413 | Module-10 durable inventory-count UI readback wiring |
| 414 | Module-8 durable active-RFQ readback / unused-hook repair |
| 415 | Module-19 attachment + immutable-version contract freeze |
| 416 | Module-19 attachment/version implementation |
| 417 | Cross-module business-notification contract freeze |
| 418 | Shared business-notification delivery infrastructure |
| 419 | BOQ + Projects + Budget + Change notification producers |
| 420 | Procurement + Purchase Orders + Subcontracts notification producers |
| 421 | Workforce + Client Billing + Module-19 notifications and overdue producer |
| 422 | Dead-code / one-reference function proof audit |
| 423 | Proven dead-code cleanup + in-place backend simplification |
| 424 | Selective frontend readability/file-length cleanup |
| 425 | Full maintained static/type/build/Prisma/migration verification |
| 426 | Live PostgreSQL/Fastify.inject + Playwright regression sweep through Stage 24 |
| 427 | Stage 0→24 final acceptance and Stage-25 handoff |

No Stage-25 / Module-20 production file may be introduced before Pass 427 accepts the repaired cumulative state.

## Pass-408 exit criteria

Pass 408 is complete only when all of the following are true:

- the exact Pass-407 production snapshot is unchanged;
- required stack and module-folder architecture are still intact;
- the current static-test debt is frozen as test-harness debt rather than “fixed” by reverting approved behavior;
- Procurement configuration wiring defect is frozen for Pass 410;
- Approval delegation, Inventory count and RFQ durable-readback gaps are frozen without inventing extra APIs prematurely;
- the three Module-19 blockers remain explicitly frozen for Passes 415→416;
- the cross-module notification repair is frozen without creating a new business module;
- one-reference functions are protected from blind deletion until Pass 422;
- readability cleanup is constrained to simple, source-compatible changes;
- the repair sequence through Pass 427 is fixed;
- Stage 25 remains blocked.

**Pass 408 result: CONTRACT FREEZE ACCEPTED. Production repair has not started yet.**
