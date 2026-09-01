# Pass 399 — Module 19 RFI Fastify Routes + OpenAPI

Pass 399 builds on the exact Pass-398 archive and exposes the five reviewed RFI operations through the already-registered Module-19 Fastify module. It adds HTTP validation, response validation and OpenAPI schemas only; the accepted RFI persistence/schema/repository/service behavior is not changed.

## Source-approved RFI HTTP surface

Exactly these five RFI operations are exposed:

```text
GET  /api/v1/projects/:projectId/rfis
POST /api/v1/projects/:projectId/rfis
POST /api/v1/rfis/:id/respond
POST /api/v1/rfis/:id/close
POST /api/v1/rfis/:id/reopen
```

Together with the four accepted Submittal operations from Pass 392, the shared Module-19 route file now contains nine source-approved operations.

The two Pass-394 readback amendments remain deferred:

```text
GET /api/v1/rfis/:id
GET /api/v1/submittals/:id
```

No generic CRUD endpoint, edit endpoint, delete endpoint or response-history endpoint is added in this pass.

## HTTP boundary

Every RFI route authenticates before service execution and reuses the strict Pass-396 Zod contracts.

The RFI list accepts only bounded `page`, `pageSize` and the minimum `OPEN` / `CLOSED` status filter.

RFI creation accepts only:

```text
subject
question
discipline
assignedTo
dueDate
```

RFI response accepts only:

```text
response
documentId optional
```

Close is bodyless; an empty JSON object is tolerated by the existing strict close schema, while additional body fields are rejected.

Reopen accepts only:

```text
reason
```

Company ownership, Project scope, RFI number, actor/responder identity, lifecycle status and timestamps continue to be server-owned by the Pass-398 service.

## Idempotency

All four RFI write commands require the Foundation `Idempotency-Key` header:

```text
create
respond
close
reopen
```

The GET register does not require an idempotency key.

## OpenAPI

The five RFI operations publish explicit request and response schemas, including:

- UUID Project/RFI path parameters;
- bounded list pagination;
- exact RFI status enum;
- strict create/respond/reopen bodies;
- bodyless close semantics;
- browser-safe RFI header responses;
- append-only response evidence for `respond`;
- stable authentication, authorization, validation, not-found, conflict and internal-error envelopes.

The RFI-specific documented error surface includes `RFI_NOT_FOUND`, `RFI_ALREADY_CLOSED` and `RFI_RESPONSE_NOT_ALLOWED` without adding new stable business codes.

## Existing Module-19 registration

No second Fastify module or registration layer is created. `registerRfiSubmittalsRoutes` was already exported by `index.ts` and registered by `app.ts` in Pass 392, so the new routes become active through the existing registration point.

## Production delta

Only one production file changes:

```text
apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts
```

The following accepted production files remain byte-identical to Pass 398:

```text
packages/database/prisma/schema.prisma
packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql
apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts
apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts
apps/api/src/modules/rfi-submittals/index.ts
apps/api/src/app.ts
```

The accepted Submittal live-integration file also remains unchanged.

## Migration verification metadata repair

Pass-399 verification exposed a pre-existing Pass-395 bookkeeping gap: the RFI migration existed and its SQL was unchanged, but it had not been added to the central migration gate/checksum manifests. Pass 399 repairs only that verification metadata and updates the existing migration-system assertion so the repository-wide static migration policy check succeeds again. No migration SQL or Prisma model is changed.

## Deferred after Pass 399

```text
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
