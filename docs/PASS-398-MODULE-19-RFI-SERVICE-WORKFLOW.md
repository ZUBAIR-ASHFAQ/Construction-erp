# Pass 398 — Module 19 RFI Service Workflow

## Purpose

Pass 398 continues Stage 24 / Module 19 from the exact Pass-397 RFI repository baseline. It adds only the RFI business/service workflow required before Pass 399 exposes the five frozen RFI HTTP operations.

The shared Module-19 five-file backend structure remains unchanged. No new production file, Prisma model, migration, repository operation, Fastify route, React feature or Stage-25 / Module-20 behavior is introduced.

## Source boundary preserved

The controlling Module-19 requirements define these RFI validations and workflow rules:

- Project/user/document references must share allowed scope;
- due date cannot be before creation date;
- a closed RFI cannot accept a normal response without reopen;
- `rfi.read`, `rfi.create`, `rfi.respond` and `rfi.close` are the reviewed RFI permissions;
- RFI/submittal numbering must be concurrency-safe;
- responses are append-only historical records;
- the reviewed RFI events are `rfi.created`, `rfi.responded` and `rfi.closed`.

Pass 394 additionally froze the minimum executable RFI lifecycle as:

```text
create -> OPEN
OPEN -> respond -> OPEN
OPEN -> CLOSED
CLOSED -> reopen -> OPEN
```

No acceptance, rejection, reassignment, archive, escalation or generic issue-management workflow is added.

## Production change

Exactly one production file changes:

```text
apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts
```

## RFI list

`listRfis()` now:

- requires `rfi.read`;
- honors server-resolved Company and Module-24B Project scope;
- uses the Pass-397 bounded repository list;
- supports only the already-frozen page/pageSize/status query contract;
- returns browser-safe RFI headers.

No response thread is returned early. Durable `responses[]` readback remains Pass 401.

## RFI create

`createRfi()` now runs through the Foundation idempotency contract and an atomic transaction.

Before persistence it:

- requires `rfi.create`;
- locks and validates the owning Project;
- rejects normal writes to suspended/closed Projects;
- requires `assignedTo` to be an active Company user with active membership in the same Project;
- rejects a due date before the current UTC creation calendar date;
- allocates the RFI number through the existing concurrency-safe Foundation numbering service.

The server derives:

```text
raisedBy = authenticated actor
status = OPEN
closedAt = null
```

After persistence it records:

```text
audit action: rfi.created
outbox event: rfi.created
```

No browser-owned Company, number, actor or lifecycle authority is introduced.

## RFI response

`respondRfi()` runs idempotently and serializes on the RFI header using the Pass-397 `SELECT ... FOR UPDATE` lock.

It:

- requires `rfi.respond` on the owning Project;
- validates the Project remains writable;
- rejects every non-`OPEN` RFI with `RFI_RESPONSE_NOT_ALLOWED`;
- validates an optional response Document is active, versioned and belongs to the same Project;
- derives the responder from authenticated request context;
- derives `respondedAt` from server time;
- uses the minimum internal server-owned response type `RESPONSE`;
- appends exactly one response row through `createRfiResponse()`.

Successful response creation records:

```text
audit action: rfi.responded
outbox event: rfi.responded
```

There remains no response update/delete API or repository method.

## RFI close

`closeRfi()` uses `rfi.close`, the Foundation idempotency contract and the Pass-397 row lock.

The command:

- rejects a missing/out-of-scope RFI as `RFI_NOT_FOUND`;
- rejects an already closed RFI as `RFI_ALREADY_CLOSED` for a genuinely new command;
- persists only `status = CLOSED` and server `closedAt`;
- preserves all historical responses;
- records `rfi.closed` audit evidence and the reviewed `rfi.closed` outbox event atomically.

A retry using the same idempotency key returns the previously committed response through the Foundation idempotency layer rather than attempting a second lifecycle transition.

## RFI reopen

`reopenRfi()` deliberately reuses `rfi.close` authority because the source does not define `rfi.reopen`.

It:

- requires the current RFI to be `CLOSED`;
- uses a normal `BUSINESS_CONFLICT` for an invalid reopen state because Pass 394 forbids inventing a new Module-19 stable error token;
- restores only `status = OPEN`;
- clears `closedAt`;
- preserves all response history;
- records the required reopen reason in audit evidence.

The service intentionally records **no** `rfi.reopened` outbox event because the reviewed Module-19 event list does not define one.

## Preserved accepted behavior

The following accepted production files remain byte-identical to Pass 397:

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql
apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts
apps/api/src/modules/rfi-submittals/index.ts
apps/api/src/app.ts
```

The accepted Submittal backend remains in the same shared Module-19 service file and retains its create/list/submit/review behavior.

## Deliberately deferred after Pass 398

```text
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
