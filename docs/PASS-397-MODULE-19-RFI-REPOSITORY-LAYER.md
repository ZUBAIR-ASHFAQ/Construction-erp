# Pass 397 — Module 19 RFI Repository Layer

## Purpose

Pass 397 continues Stage 24 / Module 19 from the exact Pass-396 project. It adds only the persistence-facing RFI repository layer required before the Pass-398 service workflow.

This pass does not add RFI business decisions, HTTP routes, detail/history API amendments, React behavior or any Stage-25 / Module-20 production code.

## Production change

Exactly one production file changes:

```text
apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts
```

The shared five-file Module-19 folder remains intact. No new production file or abstraction is introduced.

## Added repository inputs

The repository now exposes focused typed inputs for:

```text
ListRfisRepositoryInput
CreateRfiRepositoryInput
CreateRfiResponseRepositoryInput
UpdateRfiLifecycleRepositoryInput
```

Company ownership is never accepted from browser/business input. `requireCompanyRepositoryScope()` supplies Company scope at repository execution time. Project visibility is passed only as trusted server-resolved Module-24B scope.

## Added RFI repository operations

### `listRfis`

Lists one visible Project's RFIs with:

- mandatory Company scope;
- exact Project scope;
- optional status filter;
- existing Module-19 bounded pagination guard;
- deterministic `dueDate -> rfiNo -> id` ordering.

A Project outside trusted visibility returns an empty page rather than leaking whether rows exist.

### `findRfiById`

Finds one RFI only inside the current Company and then re-checks trusted Project visibility. It returns `null` for cross-Company or out-of-scope Project records.

### `createRfi`

Persists the source-owned RFI header after the service has already supplied validated server-owned values:

```text
projectId
rfiNo
subject
question
discipline
status
raisedBy
assignedTo
dueDate
```

`companyId` comes from repository scope. `closedAt` begins as `null`.

The repository does not allocate numbers, decide status, validate the assignee, validate the due date or emit audit/outbox evidence. Those remain Pass-398 service responsibilities.

### `lockRfiForWrite`

Uses `SELECT ... FOR UPDATE` on the Company-scoped RFI header so Pass-398 response/close/reopen commands can serialize on one record before applying lifecycle rules.

The lock returns only the fields needed for command decisions:

```text
id
projectId
status
assignedTo
dueDate
closedAt
```

### `createRfiResponse`

Appends one `rfi_responses` row only after verifying that the parent RFI is visible to the trusted Company/Project scope.

It persists only:

```text
rfiId
responderUserId
response
respondedAt
responseType
documentId optional
```

The repository provides no update/delete operation for RFI responses. PostgreSQL append-only protection from Pass 395 remains authoritative as defense in depth.

### `listRfiResponses`

Reads response history for one visible RFI in deterministic `respondedAt -> id` order. This is repository preparation only. Pass 397 does **not** expose the history through HTTP and does not add the Pass-401 `responses[]` detail contract early.

### `updateRfiLifecycle`

Persists only the `status` and `closedAt` values already selected by the service. It does not decide whether an RFI may close/reopen and does not accept an arbitrary patch object.

## Deliberately deferred service rules

Pass 398 still owns all business decisions, including:

- `rfi.read`, `rfi.create`, `rfi.respond` and `rfi.close` authorization;
- active/writable Project checks;
- same-Project active assignee validation;
- due-date validation;
- same-Project active Document/version validation;
- concurrency-safe RFI number allocation;
- `OPEN -> CLOSED -> OPEN` lifecycle rules;
- closed-RFI response rejection;
- responder identity and response-type selection;
- idempotency;
- audit records;
- outbox events.

No lifecycle constant such as `OPEN` or `CLOSED` is hard-coded in the repository.

## Readback boundary

Pass 394 froze two later read-only amendments:

```text
GET /api/v1/rfis/:id
GET /api/v1/submittals/:id
```

Pass 397 does not register either route and does not create an RFI detail response schema. The repository response-history read is only the persistence primitive that Pass 401 may later consume after the service/HTTP contract is ready.

## Preserved accepted behavior

The following accepted production files remain byte-identical to Pass 396:

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql
apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts
apps/api/src/modules/rfi-submittals/index.ts
```

Existing Submittal repository operations remain in the same file and keep their behavior.

## Deferred after Pass 397

```text
Pass 398 — RFI Service Workflow
Pass 399 — RFI Fastify Routes + OpenAPI
Pass 400 — RFI Backend Integration Verification
Pass 401 — Module-19 Detail/History Readback Repair
Pass 402 — Module-19 React Typed API Client
Pass 403 — Module-19 TanStack Query Hooks
Pass 404 — Module-19 React UI
Pass 405 — Module-19 Routing + Navigation + Permission Guards
Pass 406 — Module-19 Playwright Workflow
Pass 407 — Stage 24 / Module 19 Final Acceptance
```

Stage 25 / Module 20 Daily Site Reports remains untouched.
