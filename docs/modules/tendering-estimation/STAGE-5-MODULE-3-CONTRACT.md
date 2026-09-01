# Module 3 — Tendering & Estimation Stage 5 Contract

## Purpose

Module 3 owns tender preparation, versioned commercial estimates, tender submission snapshots and tender outcomes before Project Management, BOQ project mapping or project budgeting exists.

This document freezes the executable Stage-5 contract before runtime generation begins. It preserves the approved PDF scope and reconciles only the small gaps required to make estimate finalization, approval and version comparison executable.

Runtime generation must not begin until Module 2 has genuine live evidence with `STAGE_4_ACCEPTED_READY_FOR_STAGE_5`.

## Hard prerequisites

Module 3 depends on:

- Module 2 — CRM & Client Management for clients and optional opportunities.
- Module 24A — Users/RBAC for authenticated actors, owners and permissions.
- Module 22 — Approval Workflows only when estimate approval is configured.
- Module 18 — Document Management only when a later tender workflow needs approved file references.

At Stage 5:

- Project Management does not exist yet, so no `project_id` is added.
- WBS and Cost Codes do not exist yet, so no WBS/cost-code relationship is added.
- BOQ project mapping does not exist yet.
- Budgeting and Finance do not exist yet, so Module 3 does not post project budgets or journals.
- A won tender is approved downstream input only; it does not create a Project in Stage 5.

## Module ownership

Module 3 owns exactly these business records:

```text
tenders
estimate_versions
estimate_items
tender_submissions
```

The centralized Prisma schema and migrations remain under `packages/database/prisma/`.

When runtime generation begins, the backend must keep exactly the required five-file module structure:

```text
apps/api/src/modules/tendering-estimation/
  tendering-estimation.schema.ts
  tendering-estimation.repository.ts
  tendering-estimation.service.ts
  tendering-estimation.routes.ts
  index.ts
```

The React feature uses only the approved feature directories:

```text
apps/web/src/features/tendering-estimation/
  api/
  hooks/
  components/
  pages/
```

## Source-required persistence

### tenders

Required responsibility:

```text
id
company_id
client_id
opportunity_id nullable
tender_no
title
due_date
status
owner_user_id
currency
created_at
updated_at
```

Execution rules:

- `tender_no` is unique inside one company.
- the client must belong to the authenticated company and must be usable by the CRM lifecycle.
- an optional opportunity must belong to the same company and same client.
- an optional opportunity must be in `QUALIFIED` or `TENDERING`; Module 3 does not directly rewrite Module 2 opportunity state.
- the owner must be an active user in the same company.
- new tenders start `DRAFT`.
- currency uses a normalized three-letter uppercase currency code.
- no Project, WBS, Budget or Finance foreign key is introduced in Stage 5.

### estimate_versions

Required responsibility:

```text
id
tender_id
version_no
status
direct_cost
indirect_cost
contingency
markup
tender_total
created_by
created_at
updated_at
```

Execution rules:

- `version_no` is unique and concurrency-safe inside one tender.
- all money fields use PostgreSQL `NUMERIC/DECIMAL`.
- `direct_cost` and `tender_total` are server-calculated and are never accepted from the browser.
- only `DRAFT` versions are directly editable.
- finalized, approval-pending, approved, rejected and returned versions are immutable.
- corrections create a new version rather than rewriting an immutable version.

### estimate_items

Required responsibility:

```text
id
estimate_version_id
parent_id nullable
description
quantity
unit
labor_cost
material_cost
equipment_cost
subcontract_cost
other_cost
created_at
updated_at
```

Execution rules:

- quantity and all monetary values use decimal-safe persistence and API contracts.
- child items may reference a parent item only inside the same estimate version.
- all cost components are non-negative.
- Stage 5 does not invent a standalone `rate` column because the approved persistence summary does not define one. The five cost-component fields are the approved monetary inputs for each estimate item.
- draft worksheet updates replace the validated item set atomically instead of exposing generic item CRUD endpoints.

### tender_submissions

Required responsibility:

```text
id
tender_id
estimate_version_id
submitted_at
submitted_by
submitted_amount
validity_date
outcome
created_at
updated_at
```

Execution rules:

- the estimate version must belong to the same tender.
- `submitted_at` and `submitted_by` are server-owned.
- `submitted_amount` is copied server-side from the eligible estimate version's `tender_total`.
- a submission is an immutable commercial snapshot; later corrections require a new estimate version and an explicitly reviewed future resubmission workflow.
- retries of the same submit command must not create duplicate equivalent submission state.

## Commercial calculation contract

The Stage-5 estimate calculation is intentionally simple and explicit.

For each estimate item:

```text
item_direct_cost =
  labor_cost
  + material_cost
  + equipment_cost
  + subcontract_cost
  + other_cost
```

For one estimate version:

```text
direct_cost = sum(item_direct_cost)

tender_total =
  direct_cost
  + indirect_cost
  + contingency
  + markup
```

`indirect_cost`, `contingency` and `markup` are monetary adjustment amounts in Stage 5 because the approved table contract defines monetary fields and does not define separate percentage fields.

The browser may display provisional calculations for usability, but persisted totals are always recalculated by the service.

## Estimate lifecycle

The source requires draft-only editing and an approved/final estimate before tender submission. Stage 5 fixes the smallest lifecycle needed to execute that rule:

```text
DRAFT
  ├─ finalize without configured approval -> FINAL
  └─ finalize with configured approval    -> PENDING_APPROVAL

PENDING_APPROVAL
  ├─ approval completed -> APPROVED
  ├─ approval rejected  -> REJECTED
  └─ approval returned  -> RETURNED
```

Rules:

- only `DRAFT` is editable.
- `FINAL` and `APPROVED` are eligible for tender submission.
- `PENDING_APPROVAL`, `REJECTED` and `RETURNED` are not eligible for submission.
- a rejected or returned estimate is not rewritten; the estimator creates a new version.
- the browser never chooses the approval definition. Module 3 resolves any configured Module 22 approval contract server-side.
- approval request creation uses Module 22's transaction-aware internal service so estimate state, audit and outbox behavior remain atomic.

## Tender lifecycle

The controlled Stage-5 tender states are:

```text
DRAFT
SUBMITTED
WON
LOST
CANCELLED
```

Allowed transitions:

```text
DRAFT      -> SUBMITTED | CANCELLED
SUBMITTED  -> WON | LOST | CANCELLED
```

`WON`, `LOST` and `CANCELLED` are terminal inside Stage 5.

Rules:

- `SUBMITTED` requires an eligible `FINAL` or `APPROVED` estimate and a valid client reference.
- the submit command creates the immutable `tender_submissions` snapshot.
- the outcome command records `WON`, `LOST` or `CANCELLED` according to the allowed current state.
- a WON tender becomes approved input for later Project Management/BOQ/Budgeting stages but creates no downstream row here.

## Submission outcome contract

`tender_submissions.outcome` uses:

```text
PENDING
WON
LOST
CANCELLED
```

A newly submitted tender snapshot starts `PENDING`.

The tender outcome command updates the tender lifecycle and matching submission outcome in one transaction when a submission exists.

## Public HTTP contract

The seven source-required routes remain unchanged:

```text
GET   /api/v1/tenders
POST  /api/v1/tenders
GET   /api/v1/tenders/:id
POST  /api/v1/tenders/:id/estimates
PATCH /api/v1/tenders/:id/estimates/:versionId
POST  /api/v1/tenders/:id/submit
POST  /api/v1/tenders/:id/outcome
```

Two minimum reconciliation routes are approved because the source requires estimate finalization before submission and the React UI requires version comparison:

```text
POST /api/v1/tenders/:id/estimates/:versionId/finalize
GET  /api/v1/tenders/:id/estimates/:versionId
```

No generic CRUD routes are added.

There is intentionally no:

```text
DELETE /api/v1/tenders/:id
PATCH  /api/v1/tenders/:id/status
DELETE /api/v1/tenders/:id/estimates/:versionId
generic estimate-item CRUD
Project conversion API
BOQ creation API
Budget posting API
Finance posting API
```

## Read behavior

`GET /api/v1/tenders` provides bounded server-side pagination, search and indexed filters such as status, client, owner and due-date window.

`GET /api/v1/tenders/:id` returns the tender, client/opportunity references, current submission/outcome summary, latest eligible estimate summary and lightweight estimate-version summaries needed to select versions for comparison.

`GET /api/v1/tenders/:id/estimates/:versionId` returns one company-scoped estimate version with its item breakdown. The React version-comparison UI can request the selected versions independently instead of requiring another generic report endpoint.

## Write behavior

Client-supplied ownership/security fields are never trusted. Public bodies must not accept:

```text
companyId
actorUserId
permissions
projectScope
server-calculated directCost
server-calculated tenderTotal
server-owned lifecycle state
submittedBy
submittedAt
submittedAmount
```

`POST /api/v1/tenders` may accept the business fields needed for a tender, including `clientId`, optional `opportunityId`, `tenderNo`, `title`, `dueDate`, `ownerUserId` and `currency`.

`POST /api/v1/tenders/:id/estimates` creates the next DRAFT version with a validated item set and commercial adjustment amounts. It does not accept a client-selected version number or server-calculated totals.

`PATCH /api/v1/tenders/:id/estimates/:versionId` may update only a DRAFT estimate. The command replaces the validated draft item set and adjustment amounts atomically, then recalculates totals server-side.

`POST /api/v1/tenders/:id/estimates/:versionId/finalize` locks the DRAFT version. Without configured approval it becomes `FINAL`; with configured approval it becomes `PENDING_APPROVAL` and creates the Module 22 request in the same transaction.

`POST /api/v1/tenders/:id/submit` accepts only submission business input such as `estimateVersionId` and `validityDate`. The server derives the actor, timestamp and submitted amount.

`POST /api/v1/tenders/:id/outcome` accepts the reviewed outcome value and optional reason/notes needed for audit. It does not permit arbitrary status assignment.

## Permissions

Use only the source-defined stable permissions:

```text
tenders.read
tenders.create
estimates.edit
tenders.submit
tenders.manage_outcome
```

Route permission checks must be repeated by service/resource policy before sensitive writes.

No extra permission is created merely for the reconciliation finalize/read route:

- estimate read uses `tenders.read`.
- estimate creation/edit/finalize uses `estimates.edit`.

## Stable errors

The source-required stable errors remain:

```text
TENDER_NOT_FOUND
DUPLICATE_TENDER_NUMBER
ESTIMATE_VERSION_LOCKED
TENDER_NOT_READY_FOR_SUBMISSION
INVALID_TENDER_TRANSITION
```

The minimum reconciliation adds only:

```text
ESTIMATE_VERSION_NOT_FOUND
```

Validation failures continue to use the shared stable validation envelope rather than leaking Prisma/PostgreSQL details.

## Audit and outbox contract

Audit important business changes, including:

- tender creation;
- estimate version creation;
- commercial adjustment changes;
- estimate finalization/approval outcome;
- tender submission;
- final tender outcome.

Use the source-defined domain events only:

```text
tender.created
estimate.version_created
tender.submitted
tender.won
tender.lost
```

No `tender.cancelled`, `estimate.finalized` or item-level event is invented in Stage 5.

Sensitive mutations keep business state, audit and outbox writes in the same transaction.

## Approval integration boundary

Module 3 never duplicates approval definitions, steps, requests, actions or delegations.

When approval is configured:

1. Module 3 validates and locks the DRAFT estimate for approval.
2. The same owning transaction calls Module 22 `requestApprovalInTransaction(...)` with a stable source key and immutable estimate summary.
3. Module 22 owns approver resolution and approval history.
4. Module 3 consumes the terminal result and updates only its own estimate lifecycle.
5. Retries reuse the stable source identity and must not create duplicate approval requests.

Approval delivery/reminders/escalation remain Module 22/Foundation responsibilities.

## React Stage-5 scope

The React feature must eventually provide:

```text
Tender register
Tender create/detail
Estimate worksheet
Cost summary
Estimate version comparison
Commercial adjustments
Approval status
Tender submission
Bid outcome
```

TanStack Query owns server state. React Hook Form + Zod handle forms. Permission-aware controls improve UX, while the API remains authoritative.

The UI must not create Project, BOQ, Budget or Finance records in Stage 5.

## Pass 121 operational verification

Before the final Stage-5 gate, the maintained real-PostgreSQL suite must prove the lifecycle works correctly under retries and concurrent requests without adding another runtime abstraction.

Required live checks:

- two concurrent estimate-version creates under one DRAFT Tender produce distinct sequential `version_no` values;
- two concurrent finalization attempts produce one successful state change and one stable locked-version conflict;
- identical concurrent submission retries preserve one `tender_submissions` snapshot, one submission audit record and one `tender.submitted` outbox event;
- identical concurrent terminal outcome retries preserve one outcome audit record and at most one source-defined WON/LOST outbox event;
- approval-enabled concurrent finalization creates one Module 22 approval request for the estimate source;
- representative bounded Tender and estimate reads are measured with PostgreSQL `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and use the reviewed Stage-5 indexes;
- the existing transaction rollback scenario remains green;
- the existing migration verifier applies the complete schema from zero and upgrades from the immediately previous supported migration gate before operational verification runs.

No fixed millisecond benchmark is part of Stage 5 because CI/database hardware varies. The performance proof is bounded query shape plus measured PostgreSQL planner/index evidence, not a brittle wall-clock threshold.

## Pass 122 final Stage-5 acceptance gate

The maintained Stage-5 acceptance surface is:

```text
module-3:gate             static acceptance and evidence
module-3:gate:live        guarded full live gate
module-3:acceptance:live  convenience wrapper that loads reviewed test/migration env files
```

Static acceptance rechecks the Module 2 static prerequisite, all maintained Module 3 contract/static tests, workspace/stack constraints, migration policy and integration/Playwright syntax. It may pass while a prior live prerequisite is still pending, but it must record that pending state rather than claiming deployment readiness.

Live Stage-5 acceptance requires genuine `STAGE_4_ACCEPTED_READY_FOR_STAGE_5` evidence from Module 2, a package lock, explicitly disposable PostgreSQL test and migration databases, and isolated Module 3 Playwright mode. It then runs clean install, typecheck, lint, Prisma validation/generation, clean plus previous-schema migration verification, build, database preparation, the full Module 3 PostgreSQL backend/security/operational suite, and the Module 3 browser workflow.

Only that complete successful live gate may write:

```text
STAGE_5_ACCEPTED_READY_FOR_STAGE_6
```

A missing or blocked Module 2 live result must produce blocked Stage-5 live evidence. Static evidence never substitutes for a required live prerequisite.

## Stage-5 generation order

After this contract pass, generate Module 3 in this order:

```text
1. Prisma models, constraints, indexes and reviewed migration
2. tendering-estimation.schema.ts
3. tendering-estimation.repository.ts
4. tendering-estimation.service.ts
5. tendering-estimation.routes.ts
6. index.ts and app registration
7. repository/service/Fastify integration tests
8. security, isolation and database-integrity verification
9. OpenAPI verification
10. React tender register
11. React estimate/version/commercial workflow
12. Playwright main workflow and permission tests
13. performance/concurrency/operational verification
14. final Stage-5 acceptance gate
```

Do not advance to Module 4A until Stage 5 is genuinely accepted.

## Stage-5 exit condition

The final Stage-5 acceptance must prove:

```text
STAGE_5_ACCEPTED_READY_FOR_STAGE_6
```

The next dependency-safe generation stage is Module 4A — BOQ Commercial Core.
