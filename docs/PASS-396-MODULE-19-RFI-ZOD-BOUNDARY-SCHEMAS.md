# Pass 396 — Module 19 RFI Zod Boundary Schemas

## Purpose

Pass 396 builds directly on the accepted Pass-395 RFI persistence baseline and adds only the strict TypeScript/Zod boundary contracts required by the five frozen source RFI operations.

It does not add RFI repository behavior, service orchestration, Fastify routes, OpenAPI registration, detail/history GET endpoints, React code or Stage-25 Daily Site Reports.

## Source operations covered

The frozen source RFI surface remains exactly:

```text
GET  /api/v1/projects/:projectId/rfis
POST /api/v1/projects/:projectId/rfis
POST /api/v1/rfis/:id/respond
POST /api/v1/rfis/:id/close
POST /api/v1/rfis/:id/reopen
```

Pass 396 adds request/response schemas for those operations only.

## Minimum executable RFI lifecycle vocabulary

The source does not publish an RFI status enum. Pass 394 explicitly allowed only the minimum lifecycle needed by create/respond/close/reopen, so Pass 396 freezes exactly:

```text
OPEN
CLOSED
```

No generic issue-management status engine, acceptance status, rejection status, escalation status or archive status is added.

## Request boundary

### Project list

`listRfisQuerySchema` accepts only:

```text
page      optional positive integer
pageSize  optional positive integer, maximum 100
status    optional OPEN | CLOSED
```

Project ownership still comes from `/projects/:projectId` and server-resolved request scope.

### Create

`createRfiBodySchema` accepts only browser-authored business fields:

```text
subject
question
discipline
assignedTo
dueDate
```

It does not accept `companyId`, `projectId`, `rfiNo`, `raisedBy`, `status`, `closedAt`, permissions or actor identity.

### Respond

`respondRfiBodySchema` accepts only:

```text
response
documentId optional
```

`responderUserId`, `respondedAt` and `responseType` remain server-owned.

### Close

`closeRfiBodySchema` represents the frozen bodyless close command. It accepts an omitted body or an empty JSON object and rejects authored fields.

### Reopen

`reopenRfiBodySchema` requires only:

```text
reason
```

The reason exists for service/audit evidence. It does not introduce a new persisted RFI column or an `rfi.reopened` domain event.

## Response boundary

`rfiResponseSchema` is the browser-safe persisted header:

```text
id
projectId
rfiNo
subject
question
discipline
status
raisedBy
assignedTo
dueDate
closedAt
```

Company ownership remains intentionally absent from the browser response contract.

`rfiResponseEntrySchema` exposes one append-only response record:

```text
id
rfiId
responderUserId
response
respondedAt
responseType
documentId
```

The response type is readable but not browser-writable because the requirements define the persisted field without publishing a client-authored vocabulary.

The command responses are deliberately narrow:

```text
list      -> bounded RFI header list
create    -> created RFI header
respond   -> RFI header + newly appended response row
close     -> resulting RFI header
reopen    -> resulting RFI header
```

Pass 396 does not add a `responses[]` detail payload. The two explicit detail/history amendments frozen in Pass 394 remain deferred until Pass 401.

## Preserved accepted behavior

Pass 396 leaves these Pass-395/Pass-393 production areas byte-identical:

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql
apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts
apps/api/src/modules/rfi-submittals/index.ts
```

The existing accepted Submittal Zod schemas remain present in the same shared five-file Module-19 backend folder.

## Deferred after Pass 396

```text
Pass 397 — RFI Repository Layer
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

Stage 25 / Module 20 remains untouched.
