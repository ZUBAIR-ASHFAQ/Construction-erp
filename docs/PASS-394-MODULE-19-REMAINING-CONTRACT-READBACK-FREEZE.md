# Pass 394 — Module 19 Remaining Contract + Readback Freeze

## Purpose

Pass 394 is a **documentation-and-verification-only** Stage-24 checkpoint on top of the exact Pass-393 Submittal backend verification baseline.

It freezes the remaining executable boundary for **Module 19 — RFI & Submittals** before any RFI Prisma persistence, RFI service/routes, additional readback route, or React code is written.

Pass 394 changes no production runtime, Prisma model, migration, repository behavior, service behavior, Fastify route, React feature, permission code, stable error code, event type, status transition, audit behavior, or outbox behavior.

The Pass-393 production snapshot SHA-256 carried into this freeze is:

```text
30bf0f7a93f41dfb250cc9c674607f79c4ac9c1b75a093360641ba1a55a49332
```

## Controlling source boundary

Part I of the Final Corrected Construction ERP requirements controls generation order, dependency gates, ownership and deferred integrations. Appendix A controls Module-19 workflow, tables, API routes, validation, authorization, events, UI and acceptance requirements unless Part I explicitly amends them.

Stage 24 remains before Stage 25 Daily Site Reports. Module 19 must therefore be completed and accepted before Module 20 production work begins.

## Existing Pass-393 baseline

The supplied Pass-393 archive already contains the verified Submittal backend for these four source-defined operations:

```text
GET  /api/v1/projects/:projectId/submittals
POST /api/v1/projects/:projectId/submittals
POST /api/v1/submittals/:id/submit
POST /api/v1/submittals/:id/reviews
```

It already persists:

```text
submittals
submittal_revisions
submittal_reviews
```

It already freezes the eight source permission codes, six source stable errors and five source events in `rfi-submittals.schema.ts`.

Pass 394 does not rewrite that accepted Submittal backend.

# Remaining RFI contract

## Exact source-owned persistence

The RFI half of Module 19 owns exactly the two source-defined tables below:

```text
rfis
rfi_responses
```

### `rfis`

Source fields:

```text
id
company_id
project_id
rfi_no
subject
question
discipline
status
raised_by
assigned_to
due_date
closed_at nullable
```

Frozen authority rules:

- `company_id` comes only from authenticated Foundation request context.
- `project_id` comes from the Project-scoped URL and must be inside Module-24B allowed Project scope.
- `rfi_no` is server allocated through the existing concurrency-safe Foundation numbering contract using Project scope.
- `raised_by` is the authenticated actor and is never accepted from the browser.
- `status` and `closed_at` are server-owned lifecycle state.
- `assigned_to` must resolve to an active user who has active access to the same Project.
- `due_date` cannot precede the RFI creation calendar date.
- RFI rows are not hard-deleted by the first Stage-24 implementation.

The source does not enumerate an RFI status vocabulary. The next schema/service passes may use only the minimum executable lifecycle needed by the reviewed create/respond/close/reopen workflow and must not create a broad issue-management status engine.

### `rfi_responses`

Source fields:

```text
id
rfi_id
responder_user_id
response
responded_at
response_type
document_id nullable
```

Frozen authority rules:

- the response belongs to exactly one visible RFI;
- `responder_user_id` and `responded_at` are server-derived;
- response history is append-only evidence and is never updated/deleted in place;
- an optional `document_id` must belong to an active same-Project Document that has a current version;
- a closed RFI rejects normal response creation until an authorized reopen succeeds;
- `response_type` remains server-owned because the source defines the field but does not publish a browser-authored type vocabulary.

No third RFI response-history table, generic comment table, issue table or attachment table is authorized.

## Exact source RFI HTTP surface

The original Module-19 source defines exactly these five RFI operations:

```text
GET  /api/v1/projects/:projectId/rfis
POST /api/v1/projects/:projectId/rfis
POST /api/v1/rfis/:id/respond
POST /api/v1/rfis/:id/close
POST /api/v1/rfis/:id/reopen
```

Pass 394 freezes their first-scope semantics as follows.

### List RFIs

```text
GET /api/v1/projects/:projectId/rfis
```

Uses `rfi.read`.

Minimum query boundary:

```text
page      optional positive integer
pageSize  optional positive integer, maximum 100
status    optional bounded status filter
```

The route is Project scoped. Company and allowed Project scope remain server-derived.

### Create RFI

```text
POST /api/v1/projects/:projectId/rfis
```

Uses `rfi.create` and a Foundation `Idempotency-Key`.

Minimum browser-authored body:

```text
subject
question
discipline
assignedTo
dueDate
```

The browser must not send Company, RFI number, actor, status, close time, permission or Project-ownership authority.

The workflow mentions initial attachments, but the source `rfis` table contains no document/version column. Pass 394 therefore does **not** invent an RFI attachment column or a second attachment table. Initial-RFI attachment persistence remains an explicit Module-18 document-link integration gap to resolve before the React acceptance pass. Response-level `document_id` remains source-defined and can be implemented without changing the RFI table.

### Respond to RFI

```text
POST /api/v1/rfis/:id/respond
```

Uses `rfi.respond` and a Foundation `Idempotency-Key`.

Minimum browser-authored body:

```text
response
documentId optional
```

The responder identity, response time and internal response type are server-owned.

### Close RFI

```text
POST /api/v1/rfis/:id/close
```

Uses `rfi.close` and a Foundation `Idempotency-Key`.

The first-scope command is bodyless. The server closes the current open RFI, stores `closed_at`, writes audit evidence and records the reviewed `rfi.closed` outbox event exactly once.

Retrying a successfully closed RFI must be idempotent through the Foundation command contract. A non-idempotent second close against an already-closed RFI maps to the reviewed `RFI_ALREADY_CLOSED` conflict.

### Reopen RFI

```text
POST /api/v1/rfis/:id/reopen
```

Uses the existing `rfi.close` lifecycle authority rather than inventing `rfi.reopen`.

Minimum browser-authored body:

```text
reason
```

The reopen must:

- require the RFI to be currently closed;
- restore only the minimum open lifecycle state;
- clear the current `closed_at` marker without deleting historical response/audit evidence;
- audit the reason, actor and request ID;
- not invent an `rfi.reopened` event because the reviewed source event list does not define one.

The source does not define a dedicated reopen stable error. Invalid reopen state therefore uses the existing stable business-conflict envelope without adding a new Module-19 error token.

# RFI lifecycle freeze

The first executable RFI lifecycle is deliberately small:

```text
create -> open
open -> respond (append-only response, RFI remains open)
open -> close
closed -> reopen -> open
```

No assign/reassign command, accept-response command, reject-response command, delete command, archive command, escalation workflow, SLA engine or generic issue-management state machine is introduced.

The source workflow says a requester may accept a response or reopen according to policy, but the reviewed route table exposes no separate accept-response endpoint. For the first Stage-24 implementation, the existing `close` command is the only explicit completion action. A separate acceptance command is not invented.

# RFI permissions, errors and events

Pass 394 preserves the already-frozen source vocabulary exactly.

Permissions:

```text
rfi.read
rfi.create
rfi.respond
rfi.close
submittals.read
submittals.create
submittals.submit
submittals.review
```

Stable Module-19 errors:

```text
RFI_NOT_FOUND
RFI_ALREADY_CLOSED
RFI_RESPONSE_NOT_ALLOWED
SUBMITTAL_NOT_FOUND
SUBMITTAL_REVISION_NOT_SUBMITTED
REVIEWER_NOT_AUTHORIZED
```

Events:

```text
rfi.created
rfi.responded
rfi.closed
submittal.submitted
submittal.reviewed
```

No permission/error/event token is added by Pass 394.

# Readback source-gap resolution

## The source gap

The reviewed source route table gives only Project list reads for RFIs and Submittals, while the required React feature explicitly includes:

```text
RFI register/detail/thread
Submittal register
revision package
reviewer decision panel
attachment links
```

The current Pass-393 Submittal list returns only header rows. Although repository helpers can read Submittal revisions/reviews internally, there is no browser-safe durable detail/history GET after reload. RFI response-thread readback has the same problem once RFI persistence exists.

Returning every response/revision/review for every row in a bounded Project list would make list payloads increasingly expensive and would mix register and detail responsibilities. Pass 394 therefore rejects that workaround.

## Frozen narrow readback amendment

Pass 394 authorizes exactly **two narrow read-only amendments** for a later dedicated implementation pass:

```text
GET /api/v1/rfis/:id
GET /api/v1/submittals/:id
```

These are not part of the original nine Module-19 source routes. They are explicit readback repairs required to make the source-mandated React detail/history UI durable after reload.

They must obey these limits:

### RFI detail read

```text
GET /api/v1/rfis/:id
```

- requires `rfi.read`;
- enforces Company + allowed Project scope before returning anything;
- returns one browser-safe RFI header plus its ordered append-only `responses[]`;
- may include already-authorized Module-18 attachment-link metadata only through the existing Document contract;
- does not mutate state and emits no domain event.

### Submittal detail read

```text
GET /api/v1/submittals/:id
```

- requires `submittals.read`;
- enforces Company + allowed Project scope;
- returns one browser-safe Submittal header plus ordered `revisions[]`;
- each revision may include its ordered append-only `reviews[]`;
- uses the existing Submittal persistence and repository read helpers; no new table is required;
- does not mutate state and emits no domain event.

No generic Module-19 detail CRUD, response update/delete, revision edit/delete, review update/delete or arbitrary resource browser is authorized.

# Implementation order after Pass 394

The Stage-24 continuation remains:

```text
Pass 395  RFI Prisma persistence
Pass 396  RFI Zod boundary schemas
Pass 397  RFI repository layer
Pass 398  RFI service workflow
Pass 399  RFI Fastify routes + OpenAPI
Pass 400  RFI backend integration verification
Pass 401  Module-19 detail/history readback amendment
Pass 402  Module-19 React typed API client
Pass 403  Module-19 TanStack Query hooks
Pass 404  Module-19 React UI
Pass 405  Module-19 routing/navigation/permission guards
Pass 406  Module-19 Playwright workflow
Pass 407  Stage-24 / Module-19 final acceptance
```

No Pass before 401 may silently add the two readback amendments. No Module-20 production file may be added before Pass 407 accepts Stage 24.

# Pass-394 acceptance boundary

Pass 394 is accepted only when:

- the Pass-393 production snapshot remains byte-for-byte unchanged;
- the original four Submittal routes remain the only Module-19 routes currently registered;
- no RFI Prisma model/table/migration is added yet;
- no RFI production schema/repository/service/route implementation is added yet;
- the exact five source RFI routes are frozen;
- the two readback repairs are documented but not implemented;
- no new Module-19 permission, stable error or event vocabulary appears;
- RFI and Submittal React work remains absent;
- Stage-25 Daily Site Reports remains deferred.
