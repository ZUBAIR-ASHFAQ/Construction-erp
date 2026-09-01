# Pass 414 — Module 8 Active RFQ Durable Readback / Unused-Hook Repair

Pass 414 closes cumulative audit item A408-05 by wiring the already-existing `useRfq()` durable detail query into the Procurement workspace. The UI now keeps only the active RFQ id in local state, renders and hydrates quotation line identity from current server detail, and no longer copies complete RFQ business objects from list rows or mutation responses. The existing Module-8 API, hooks, backend, Prisma, permissions, errors, events, dependencies and folder structure remain unchanged.

See `docs/PASS-414-MODULE-8-ACTIVE-RFQ-DURABLE-READBACK.md`.

# Pass 413 — Module 10 Durable Inventory Count UI Readback

Pass 413 closes cumulative audit item A408-04 by wiring the already-existing `useInventoryCount()` durable server readback into the Physical Inventory Count UI. The workspace now remembers only the selected count ID across same-session navigation/browser refresh and reloads count status/lines from the backend; it no longer stores the complete `InventoryCount` object in local React state. No Module-10 API, hook, backend, Prisma, permission, error, event, dependency or folder-structure change is introduced.

See `docs/PASS-413-MODULE-10-DURABLE-INVENTORY-COUNT-UI-READBACK.md`.

# Pass 412 — Module 22 Delegation Readback Implementation

Pass 412 implements the single delegation-list amendment frozen in Pass 411. `GET /api/v1/approvals/delegations` now provides bounded Company-scoped pagination through the existing `approval_delegations.manage` authority and existing repository reader. The typed React API, TanStack Query hook, cache invalidation and existing delegation screen now use durable server readback. No Prisma/migration, new repository function, permission, stable error, event, generic delegation CRUD or Module-20 production work is added.

See `docs/PASS-412-MODULE-22-DELEGATION-READBACK-IMPLEMENTATION.md`.

# Pass 411 — Module 22 Delegation Readback Contract Freeze

Pass 411 is a documentation-and-verification-only checkpoint on top of the exact Pass-410 archive. It freezes one narrow read-only amendment for the source-required Approval delegation screen: `GET /api/v1/approvals/delegations` with bounded page/pageSize only, the existing `approval_delegations.manage` permission, server-derived Company scope, and the already-implemented `listDelegationsForCompany()` repository reader. No production code changes, generic delegation CRUD, new permission, new status vocabulary, migration, helper file, or Module-20 work is introduced.

See `docs/PASS-411-MODULE-22-DELEGATION-READBACK-CONTRACT-FREEZE.md`.

# Pass 410 — Procurement Runtime Config Wiring Repair

Pass 410 closes the cumulative Procurement startup-wiring defect. The existing Module-8 approval-definition and non-lowest-selection rationale policies are now loaded by validated server configuration and passed through normal API startup into the already accepted `buildApp()` → Procurement route/service options. No Module-8 business logic, repository, routes, Prisma, permissions, errors, events or frontend behavior changes. Stage-25 / Module-20 remains blocked while the cumulative repair sequence continues with Pass 411.

See `docs/PASS-410-PROCUREMENT-RUNTIME-CONFIG-WIRING-REPAIR.md`.

# Pass 409 — Current Static-Test / Historical Assertion Supersession Hygiene

Pass 409 repairs the cumulative dependency-free static-test boundary without changing production behavior. It preserves every historical test file, marks only superseded Pass-390→405 absence/defer assertions as skipped, updates the centralized Prisma model expectation through Stage 24, and keeps the normal static runner broad. The maintained static suite is green again, while Pass 410 remains the next frozen production repair.

See `docs/PASS-409-CURRENT-STATIC-TEST-HISTORICAL-ASSERTION-SUPERSESSION-HYGIENE.md`.

# Pass 408 — Stage 0→24 Cumulative Audit Contract Freeze

Pass 408 is a documentation-and-verification-only checkpoint on top of the exact Pass-407 archive. It freezes the complete Stage-0→24 audit findings and the Pass-409→427 repair order without changing production code. The required React/Vite/TypeScript + Fastify/TypeScript + Prisma/PostgreSQL stack and five-file backend module structure remain protected; Stage-25 / Module-20 stays blocked until the cumulative repair and final acceptance program completes.

See `docs/PASS-408-STAGE-0-24-CUMULATIVE-AUDIT-CONTRACT-FREEZE.md`.

# Pass 407 — Stage 24 / Module 19 Final Acceptance Audit

Pass 407 is an acceptance-audit-only checkpoint on top of the exact Pass-406 archive. The complete Module-19 core chain remains frozen, but the audit blocks Stage 25 after finding three source-supported gaps that earlier passes did not close: initial RFI attachment linking, immutable Document-version binding for historical RFI/Submittal evidence, and Module-19 assignment/response/review/overdue notifications. The source narrative also mentions RFI location without defining a persistence/API shape, so that ambiguity remains explicit instead of being guessed. No production code changes in Pass 407.

See `docs/PASS-407-STAGE-24-MODULE-19-FINAL-ACCEPTANCE.md`.

# Pass 406 — Module 19 Playwright Workflow

Pass 406 builds on the exact Pass-405 archive and adds the Stage-24 browser workflow for RFI create → respond → close → reopen and Submittal create → submit → REVISE_RESUBMIT → revision-2 resubmit, plus reload/readback and read-only denied-action coverage. The accepted Module-19 backend/database/core React contracts remain unchanged; only the obsolete forward-looking Playwright note in the Module-19 page is refreshed. Stage-25 / Module-20 production work remains deferred.

See `docs/PASS-406-MODULE-19-PLAYWRIGHT-WORKFLOW.md`.

# Pass 405 — Module 19 Routing + Navigation + Permission Guards

Pass 405 builds on the exact Pass-404 archive and registers the accepted Stage-24 RFI & Submittals page in the existing permission-aware AdminShell. The workspace is visible only through the reviewed Module-19 permission set or an assigned restricted Project scope, and its Document links now open the existing Module-18 Document Management workspace when authorized. No new router dependency, backend/database behavior, business form, or Module-20 production code is added.

See `docs/PASS-405-MODULE-19-ROUTING-NAVIGATION-PERMISSION-GUARDS.md`.

# Pass 404 — Module 19 Accessible Permission-Aware React UI

Pass 404 builds on the exact Pass-403 archive and adds the source-bounded Stage-24 React workspace: Project-scoped RFI register/detail/append-only thread, current-page overdue view, create/respond/close/reopen actions, Submittal register, durable revision/review package, create/submit/review forms, Project-member assignment choices and Module-18 Document navigation. React Hook Form + Zod own write forms and TanStack Query remains the durable server-state owner. Router/navigation, Playwright, backend/database behavior and Module-20 remain unchanged.

See `docs/PASS-404-MODULE-19-ACCESSIBLE-PERMISSION-AWARE-REACT-UI.md`.

# Pass 403 — Module 19 TanStack Query Hooks + Cache Invalidation

Pass 403 builds on the exact Pass-402 archive and adds only the TanStack Query server-state layer for the accepted Module-19 RFI/Submittal browser API. It provides four read hooks and seven command hooks with stable resource-specific query keys, fresh idempotency keys per write, and precise register/detail invalidation. No component, page, router/navigation, backend/database behavior or Module-20 production code is added.

See `docs/PASS-403-MODULE-19-TANSTACK-QUERY-HOOKS.md`.

# Pass 402 — Module 19 React Typed API Client

Pass 402 builds on the exact Pass-401 archive and adds only the typed browser API boundary for the accepted 11 Module-19 RFI/Submittal operations, including the two durable detail/history readbacks. All seven writes carry Foundation idempotency keys, Project/resource IDs are encoded, and server-owned Company/actor/scope/numbering/lifecycle authority stays out of browser mutation inputs. No hooks, UI, backend/database change, or Module-20 production code is added.

See `docs/PASS-402-MODULE-19-REACT-TYPED-API-CLIENT.md`.

# Pass 401 — Module 19 Detail/History Readback Repair

Pass 401 builds on the exact Pass-400 archive and implements only the two read-only repairs frozen in Pass 394: `GET /api/v1/rfis/:id` returns the authorized RFI plus ordered append-only `responses[]`, and `GET /api/v1/submittals/:id` returns the authorized Submittal plus ordered `revisions[]` with nested append-only `reviews[]`. The existing read permissions, Company/Project scope, persistence and repository helpers are reused. No Prisma model, migration, repository method, permission, stable error, event, React code or Module-20 production code is added.

See `docs/PASS-401-MODULE-19-DETAIL-HISTORY-READBACK.md`.

# Pass 400 — Module 19 RFI Backend Integration Verification

Pass 400 builds on the exact Pass-399 archive and adds only verification infrastructure for the five RFI operations. It introduces a disposable PostgreSQL + Fastify.inject suite covering workflow, idempotency, concurrency-safe numbering, Company/Project and permission isolation, same-Project assignee/Document validation, append-only response history and audit/outbox rollback. No production runtime behavior changes; the two frozen detail/history reads remain deferred to Pass 401 and Stage-25 Daily Site Reports remains untouched.

See `docs/PASS-400-MODULE-19-RFI-BACKEND-INTEGRATION-VERIFICATION.md`.

# Pass 399 — Module 19 RFI Fastify Routes + OpenAPI

Pass 399 builds on the exact Pass-398 archive and exposes exactly the five reviewed RFI Fastify operations with strict request/response validation, Foundation idempotency headers for writes and explicit OpenAPI schemas. Verification also repairs the pre-existing Pass-395 migration gate/checksum bookkeeping gap without changing migration SQL. The existing four Submittal routes and module registration are preserved; detail/history readback, React and Stage-25 Daily Site Reports remain deferred.

See `docs/PASS-399-MODULE-19-RFI-FASTIFY-ROUTES-OPENAPI.md`.

# Pass 398 — Module 19 RFI Service Workflow

Pass 398 builds on the exact Pass-397 archive and adds only the RFI service workflow for permission-aware list/create/respond/close/reopen, including server-owned numbering/actor/lifecycle, same-Project assignee/Document validation, serialized lifecycle commands, idempotency, audit and the reviewed RFI outbox events. RFI Fastify routes, detail/history HTTP readback, React and Stage-25 Daily Site Reports remain deferred.

See `docs/PASS-398-MODULE-19-RFI-SERVICE-WORKFLOW.md`.

# Pass 397 — Module 19 RFI Repository Layer

Pass 397 builds on the exact Pass-396 archive and adds only the Company/Project-scoped RFI repository operations for bounded list/find/create, serialized command locking, append-only response insertion/history and service-chosen close/reopen persistence. RFI business workflow, Fastify routes, detail HTTP readback, React and Stage-25 Daily Site Reports remain deferred.

See `docs/PASS-397-MODULE-19-RFI-REPOSITORY-LAYER.md`.

# Pass 396 — Module 19 RFI Zod Boundary Schemas

Pass 396 builds on the exact Pass-395 archive and adds only the strict RFI list/create/respond/close/reopen Zod request/response contracts plus the minimum `OPEN`/`CLOSED` lifecycle vocabulary. RFI repository/service/routes/detail readback/React and Stage-25 Daily Site Reports remain deferred.

See `docs/PASS-396-MODULE-19-RFI-ZOD-BOUNDARY-SCHEMAS.md`.

# Pass 395 — Module 19 RFI Prisma Persistence

Pass 395 builds on the accepted Pass-394 freeze and adds only the two source-owned RFI persistence models/tables, their direct foreign keys/indexes and PostgreSQL append-only response protection. RFI schemas/repository/service/routes/React and Stage-25 Daily Site Reports remain deferred.

See `docs/PASS-395-MODULE-19-RFI-PRISMA-PERSISTENCE.md`.

# Pass 394 — Module 19 Remaining Contract + Readback Freeze

Pass 394 is a documentation-and-verification-only Stage-24 checkpoint on top of the exact Pass-393 baseline. It freezes the remaining RFI persistence/API/lifecycle boundary and exactly two later detail/history readback repairs required by the source React UI, without changing production code.

See `docs/PASS-394-MODULE-19-REMAINING-CONTRACT-READBACK-FREEZE.md`.

# Pass 393 — Module 19 Submittal Backend Verification

Pass 393 is the verification-only backend checkpoint for the Pass-390→392 Submittal implementation. It adds disposable PostgreSQL/Fastify coverage for workflow, security, concurrency, append-only history and audit/outbox rollback without changing production business behavior.

See `docs/PASS-393-MODULE-19-SUBMITTAL-BACKEND-VERIFICATION.md`.

# Pass 392 — Module 19 Submittal HTTP Routes + Backend Registration

Pass 392 builds on the exact Pass-391 archive. It exposes exactly the four approved Submittal Fastify operations, adds response validation, completes the required five-file backend folder and registers Module 19 with the shared API. RFI routes and React remain deferred.

See `docs/PASS-392-MODULE-19-SUBMITTAL-HTTP-REGISTRATION.md`.

# Pass 391 — Module 19 Submittal Service Workflow

Pass 391 builds on the exact Pass-390 archive. It adds the permission-aware, idempotent and transaction-safe Submittal service workflow for create/list/submit/review, including same-Project user/Document validation, append-only review history, audit/outbox evidence and revise/resubmit revision creation. Fastify routes/index, RFI work and React remain deferred.

# Pass 390 — Module 19 Submittal Repository Layer

Pass 390 begins Stage 24 from the exact Pass-379 accepted baseline. Because the supplied baseline did not contain the planned Pass-388/389 Submittal persistence/schema prerequisites, this archive includes only those minimum prerequisites together with the Pass-390 repository layer. Service/routes/RFI/React work remains deferred.

See `docs/PASS-390-MODULE-19-SUBMITTAL-REPOSITORY.md`.

# Pass 379 — Stage 0→23 Final Repair Acceptance

Pass 379 is the final `ACCEPTANCE_ONLY` checkpoint for the complete pre-Stage-24 repair program. It changes no production runtime, Prisma model, migration, public API, permission, stable error, event or business workflow. It proves the accepted production snapshot remains unchanged, all repair evidence through Pass 378 is present, policy-required behavior remains fail-closed, Stage-26/27 integrations remain deferred and the project is ready to begin Stage 24 — Module 19 RFI & Submittals.

See `docs/PASS-379-STAGE-0-23-FINAL-REPAIR-ACCEPTANCE.md`.

# Pass 377 — Module 17 Change Request Withdraw + Immutable History

Pass 377 closes M17-01 on top of the exact Pass-376 baseline. A DRAFT or SUBMITTED Change Request can now be withdrawn with a required reason, server-owned actor/time evidence and PostgreSQL-enforced terminal immutability. The repair reuses `changes.submit`, creates no Change target impact and keeps Stage-27 Client Contract/Subcontract/Schedule adapters deferred.

See `docs/PASS-377-MODULE-17-WITHDRAW-HISTORY.md`.

# Pass 372 — Module 12 Equipment History, Transfer and Archive

Pass 372 closes M12-03 and M12-04 on top of the exact Pass-371 baseline. Equipment now has bounded assignment, usage and maintenance history readback plus an atomic Project-to-Project transfer command and a bodyless archive/dispose lifecycle that preserves historical rows.

The required React + Vite + TypeScript / Fastify + TypeScript / Prisma / PostgreSQL modular-monolith structure remains unchanged. No new Module-12 table, migration, permission, stable error, domain event, service layer, repository layer or helper subsystem was introduced.

M12-05 remains policy-required. Rental calendars, idle/fuel costing, maintenance intervals, maintenance work orders, disposal valuation and advanced fleet planning are not invented.

See `docs/PASS-372-MODULE-12-HISTORY-TRANSFER-ARCHIVE.md` for the focused repair boundary.

# Pass 374 — Module 15A Finance Core Management and Readback

Pass 374 closes the three planned Finance Core repair items before Stage 24: minimum Chart-of-Accounts management, fiscal-period setup/list/reopen and durable Journal/General Ledger readback. It preserves the six reviewed Stage-11 routes separately, adds no Finance table or migration, adds no new permission/error/event vocabulary and keeps AP/AR/payments/source adapters deferred to Stage 26.

See `docs/PASS-374-MODULE-15A-FINANCE-CORE-MANAGEMENT-READBACK.md`.

Pass 374 also cleans the cumulative verification boundary by marking 25 pre-Pass-373 HR/Payroll absence assertions as superseded. This is test-only maintenance; no Module 13/14 production behavior changes in Pass 374.

# Pass 375 — Module 16 Claim Submit and Contract Maintenance

Pass 375 closes M16-01 and M16-02 with an explicit durable `DRAFT -> SUBMITTED -> CERTIFIED` Progress Claim lifecycle and controlled Client Contract term maintenance. It adds exactly two repair routes, no Prisma model/migration, no permission/error/event vocabulary and keeps Client Invoice -> AR at Stage 26 plus Change Order -> Client Contract mapping at Stage 27.

See `docs/PASS-375-MODULE-16-CLAIM-SUBMIT-CONTRACT-MAINTENANCE.md`.


# Pass 376 — Module 21 Activity Owner/Duration + Baseline Reopen

Pass 376 closes M21-01 and M21-02. Activities now reference an active same-Project member owner, planned duration is derived from planned dates without inventing a work-calendar engine, and current planning becomes baseline-locked until the existing `schedule.baseline` authority explicitly reopens it. Historical baseline snapshots remain immutable and the next baseline creates the controlled revision.

See `docs/PASS-376-MODULE-21-ACTIVITY-OWNER-DURATION-BASELINE-REOPEN.md`.

# Pass 378 — Stage 0→23 Code-Quality / Readability / Duplication Audit

Pass 378 is the frozen `QUALITY_ONLY` checkpoint after the repair series through Pass 377. It changes no production runtime, Prisma model, migration, API, permission, stable error, event or business workflow. It re-verifies the exact production snapshot, the approved five-file backend module structure and the global purpose-comment rule, while refusing speculative service splitting or cosmetic abstraction churn.

See `docs/PASS-378-STAGE-0-23-CODE-QUALITY-AUDIT.md`.

# Pass 415 — Module 19 Initial Attachment + Immutable Document-Version Contract Freeze

Pass 415 freezes the minimum source-backed repair for initial RFI Document links and exact immutable Document-version evidence on RFI responses/Submittal submissions. It is documentation + verification only: production remains byte-identical to Pass 414, no route/permission/error/event/table is added, legacy history is not guessed, and Stage 25 remains blocked until the repair sequence is accepted.

See `docs/PASS-415-MODULE-19-ATTACHMENT-IMMUTABLE-DOCUMENT-VERSION-CONTRACT-FREEZE.md`.
