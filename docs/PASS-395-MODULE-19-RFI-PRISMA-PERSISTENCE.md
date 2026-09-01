# Pass 395 — Module 19 RFI Prisma Persistence

## Purpose

Pass 395 builds directly on the accepted Pass-394 Module-19 contract/readback freeze and adds only the **RFI persistence foundation** required before RFI boundary schemas, repository, service and HTTP work.

No RFI repository method, service workflow, Fastify route, React feature, permission token, stable error token, event token or Module-20 production code is added in this pass.

## Source-owned persistence added

Exactly the two frozen RFI tables are now represented in Prisma and migration SQL:

```text
rfis
rfi_responses
```

### `rfis`

The persisted source fields are:

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

Persistence integrity now guarantees:

- every `company_id` resolves to the Foundation Company master;
- every RFI Project belongs to the same Company through the composite Project foreign key;
- `raised_by` and `assigned_to` resolve to Users in that same Company;
- `rfi_no` is unique inside Company + Project so the later Foundation numbering service has a collision-safe database boundary;
- Project/status/due-date and assignee/status indexes support the frozen list/register access patterns;
- no RFI attachment column, archive/delete model, generic issue model or lifecycle vocabulary is invented.

Active same-Project assignee membership, due-date lifecycle validation and RFI status-transition rules remain service responsibilities for the later RFI service pass.

### `rfi_responses`

The persisted source fields are:

```text
id
rfi_id
responder_user_id
response
responded_at
response_type
document_id nullable
```

Persistence integrity now guarantees:

- every response references an existing RFI;
- responder and optional Module-18 Document references use direct foreign keys;
- response/thread reads have deterministic RFI/time indexes;
- response rows are protected by PostgreSQL triggers against in-place `UPDATE` and `DELETE`.

The source does not place Company/Project columns on `rfi_responses`. Therefore same-Project Document validation is deliberately not faked at the database layer; it remains an explicit service-layer rule from Pass 394.

## Prisma relationship additions

Only the direct relationships needed by the two source tables were added to existing owners:

```text
Company  -> rfis
Project  -> rfis
User     -> raisedRfis / assignedRfis / rfiResponses
Document -> rfiResponses
Rfi      -> responses
```

No Submittal model or existing Module-19 backend file is changed.

## Deferred after Pass 395

The Pass-394 continuation remains unchanged:

```text
Pass 396 — RFI Zod Boundary Schemas
Pass 397 — RFI Repository Layer
Pass 398 — RFI Service Workflow
Pass 399 — RFI Fastify Routes + OpenAPI
Pass 400 — RFI Backend Integration Verification
Pass 401 — Module 19 Detail/History Readback Repair
Pass 402 — Module 19 React Typed API Client
Pass 403 — Module 19 TanStack Query Hooks
Pass 404 — Module 19 React UI
Pass 405 — Module 19 Routing + Navigation + Permission Guards
Pass 406 — Module 19 Playwright Workflow
Pass 407 — Stage 24 / Module 19 Final Acceptance
```

Stage 25 / Module 20 Daily Site Reports remains untouched until Stage 24 acceptance.
