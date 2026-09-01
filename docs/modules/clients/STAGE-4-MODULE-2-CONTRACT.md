# Module 2 — CRM & Client Management Stage 4 Contract

## Purpose

Module 2 owns the company client master, client contacts, commercial opportunities and opportunity activity notes used later by Tendering, Project Management, Client Billing and Reports.

This document freezes the executable Stage-4 contract before runtime generation begins. It reconciles only the small gaps needed to implement the approved PDF workflow. It does not create another ERP business module or change the approved Module 2 purpose.

Runtime generation must not begin until the consolidated Stage 0–3 live acceptance reports `STAGES_0_3_ACCEPTED_READY_FOR_MODULE_2`.

## Hard prerequisite

Module 2 depends on Module 24A company-scope identity and authorization.

At this stage:

- Module 18 may be reused later for approved document references when a CRM workflow actually needs a file.
- Module 22 is not a mandatory dependency for the base CRM workflow.
- Project Management does not exist yet, so no project membership or project-scoped foreign key is added.
- Tendering does not exist yet, so no tender foreign key is added.
- Client Billing and Finance do not exist yet, so CRM never stores financial balances.

## Module ownership

Module 2 owns exactly these business records:

```text
clients
client_contacts
opportunities
opportunity_notes
```

The centralized Prisma schema and migrations remain under `packages/database/prisma/`.

The backend keeps the required five-file module structure when runtime generation begins:

```text
apps/api/src/modules/clients/
  clients.schema.ts
  clients.repository.ts
  clients.service.ts
  clients.routes.ts
  index.ts
```

The React feature will use only the approved feature directories:

```text
apps/web/src/features/clients/
  api/
  hooks/
  components/
  pages/
```

## Source-required persistence

### clients

Required responsibility:

```text
id
company_id
code
legal_name
display_name
tax_no nullable
billing_address
status
credit_terms_days
created_at
updated_at
```

Execution rules:

- `code` is unique inside one company.
- new clients start `ACTIVE`.
- the Stage-4 client lifecycle is `ACTIVE | ARCHIVED`.
- referenced clients are archived rather than hard deleted.
- archived clients remain readable for history but cannot receive new contacts or opportunities.
- credit terms are a non-negative whole number of days.
- financial balances are never stored on the client row.

### client_contacts

Required responsibility:

```text
id
company_id
client_id
name
title
email
phone
is_primary
status
created_at
updated_at
```

Execution rules:

- every contact belongs to a client in the same company.
- email and phone are normalized at the API boundary.
- new contacts start `ACTIVE`.
- the source requires duplicate-primary-contact warnings. Stage 4 therefore allows the create command to succeed but returns the stable warning code `DUPLICATE_PRIMARY_CONTACT` when another active primary contact already exists. Existing contacts are never silently demoted.
- Stage 4 exposes contact creation only because the approved route table does not define contact edit/delete commands.

### opportunities

Required responsibility:

```text
id
company_id
client_id
code
name
estimated_value
probability
stage
source
owner_user_id
expected_close_date
created_at
updated_at
```

The PDF workflow requires `source` when creating an opportunity even though the table summary omits it. Stage 4 explicitly keeps `source` so the persisted model can satisfy the approved workflow.

Execution rules:

- every opportunity belongs to a client in the same company.
- the owner resolves to an active user in the same company.
- `estimated_value` uses PostgreSQL `NUMERIC/DECIMAL` and cannot be negative.
- `probability` is an integer from 0 through 100.
- a new opportunity starts at `LEAD`; the client cannot set an arbitrary initial stage.
- no `tender_id` or `project_id` is added before those owning modules exist.

### opportunity_notes

Required responsibility:

```text
id
opportunity_id
author_user_id
note
created_at
```

Execution rules:

- company ownership is enforced through the opportunity relationship.
- the author must be an active user in the same company as the opportunity.
- notes are activity history and are not silently rewritten by later stage changes.

## Opportunity stage contract

The approved document names the controlled stages `lead`, `qualified`, `tendering`, `won` and `lost`. Stage 4 fixes those values as:

```text
LEAD
QUALIFIED
TENDERING
WON
LOST
```

The simple allowed progression is:

```text
LEAD       -> QUALIFIED | LOST
QUALIFIED  -> TENDERING | LOST
TENDERING  -> WON | LOST
```

`WON` and `LOST` are terminal for the normal change-stage command.

The source specifically says a won opportunity cannot return to an early stage without an authorized reopen action. The reviewed Stage-4 amendment therefore adds an explicit reopen command for `WON` only. Reopen requires a reason and a target of:

```text
LEAD | QUALIFIED | TENDERING
```

The reopen command uses the existing `opportunities.manage` permission; no extra permission code is invented.

## Public HTTP contract

The seven source-required routes remain unchanged:

```text
GET   /api/v1/clients
POST  /api/v1/clients
GET   /api/v1/clients/:id
PATCH /api/v1/clients/:id
POST  /api/v1/clients/:id/contacts
POST  /api/v1/opportunities
POST  /api/v1/opportunities/:id/change-stage
```

The approved React requirements also require an opportunity pipeline, activity notes and a controlled reopen workflow, but the source route table has no reads/notes/reopen endpoints. The following minimum reconciliation routes are therefore approved for Stage 4:

```text
GET   /api/v1/opportunities
GET   /api/v1/opportunities/:id
POST  /api/v1/opportunities/:id/notes
POST  /api/v1/opportunities/:id/reopen
POST  /api/v1/clients/:id/archive
```

No generic CRUD endpoints are added.

There is intentionally no:

```text
DELETE /api/v1/clients/:id
DELETE /api/v1/opportunities/:id
PATCH  /api/v1/opportunities/:id
contact generic CRUD
project membership API
tender conversion API
billing/finance API
```

## Read behavior

`GET /api/v1/clients` provides server-side pagination, bounded page size, search and indexed filters.

`GET /api/v1/clients/:id` returns the client master, contacts and an approved Module-2-only commercial summary. Until downstream modules exist, the summary may use CRM opportunity data but must not invent Finance, Billing, Tender or Project balances.

`GET /api/v1/opportunities` supports the pipeline with bounded pagination and documented filters for:

```text
clientId
stage
ownerUserId
search
page
pageSize
```

`GET /api/v1/opportunities/:id` returns the opportunity and its activity notes inside the caller's company scope.

## Write behavior

Client-supplied ownership/security fields are never trusted. In particular, public bodies must not accept:

```text
companyId
actorUserId
permissions
projectScope
server-owned lifecycle state
server-owned calculated totals
```

`POST /api/v1/clients/:id/archive` is a bodyless lifecycle command. It changes the client to `ARCHIVED`, creates the audit record in the same transaction and uses the existing `client.updated` event rather than inventing another event code.

`POST /api/v1/opportunities/:id/change-stage` accepts only the requested next normal stage and applies the controlled transition map.

`POST /api/v1/opportunities/:id/reopen` accepts only:

```text
targetStage
reason
```

and works only for a currently `WON` opportunity.

## Permissions

Use the stable permission codes from the approved source:

```text
clients.read
clients.create
clients.update
opportunities.read
opportunities.manage
```

Mapping:

- client list/detail require `clients.read`;
- client create requires `clients.create`;
- client update/archive/contact creation require `clients.update`;
- opportunity list/detail require `opportunities.read`;
- opportunity create, stage change, notes and reopen require `opportunities.manage`.

Route checks must still be revalidated by service/resource policy.

## Stable errors and warnings

Keep the source-required stable errors:

```text
CLIENT_NOT_FOUND
DUPLICATE_CLIENT_CODE
INVALID_OPPORTUNITY_STAGE
CLIENT_IN_USE
```

The reconciled opportunity read/action routes require one additional not-found code:

```text
OPPORTUNITY_NOT_FOUND
```

Primary-contact duplication is a warning, not a new business failure:

```text
DUPLICATE_PRIMARY_CONTACT
```

Normal validation and authorization continue to use the shared Foundation error envelope without leaking SQL, stack traces or foreign-company records.

## Events, audit and notifications

Use only the source-defined CRM domain events:

```text
client.created
client.updated
opportunity.created
opportunity.stage_changed
```

Sensitive business changes write audit and outbox records in the same transaction as the owning change.

Audit at minimum:

- client create/update/archive;
- opportunity creation;
- initial opportunity ownership captured with opportunity creation;
- stage changes;
- reopen actions.

Opportunity assignment/stage notifications remain optional asynchronous behavior. Stage 4 does not add a new notification business module or worker until a real notification requirement is implemented.

## Company isolation

Every repository method derives company ownership from trusted request/service context.

Normal relationship rules use direct UUID foreign keys and same-company validation where both sides carry company ownership.

Cross-company reads and writes must behave as not found/forbidden according to the shared security contract and must be covered by negative tests.

Project scope is deliberately absent until Project Management and Module 24B exist.

## Deferred integrations

The following are explicitly deferred:

```text
Opportunity -> Tender conversion/link
Won Opportunity -> Project link
Client -> Client Billing
Client -> Accounts Receivable / Finance balances
Project-scoped client/opportunity authorization
CRM document attachment workflows that are not yet required
```

Later modules must use reviewed migrations/integration contracts when their owning tables exist. Stage 4 must not create placeholder foreign keys to missing tables.

## React scope

The future React feature must cover:

- client list/detail;
- create/edit/archive client actions;
- contacts;
- opportunity pipeline;
- stage filters;
- opportunity creation/detail;
- activity notes;
- ownership display/selection;
- controlled stage changes;
- authorized reopen action.

Tender/Project links appear only after those modules exist. The UI must never fake downstream records.

TanStack Query owns server state. React Hook Form + Zod handle forms. Permission-aware UI hides unavailable actions while the API remains authoritative.

## Stage-4 generation order

After this contract is frozen, Module 2 is generated in the approved order:

1. Prisma models, constraints, indexes and migration.
2. Zod schemas and inferred request types.
3. Company-scoped repository methods.
4. Service transactions, business invariants, audit and outbox.
5. Fastify routes and module registration.
6. Repository/service/Fastify integration tests with negative authorization and company-isolation coverage.
7. OpenAPI and stable error verification.
8. React API/hooks/pages/forms.
9. Playwright main-workflow and permission tests.
10. Performance/concurrency/operational verification and final Stage-4 acceptance.

## Final Stage-4 acceptance

The maintained final gate reuses the reviewed repository checks instead of creating another business layer or test framework.

Static closure:

```bash
npm run module-2:gate
```

Live closure:

```bash
npm run module-2:acceptance:live
```

The live gate requires accepted Module 22 Stage-3 evidence and explicitly disposable test/migration databases. It verifies the clean install, TypeScript, lint, Prisma validation/generation, clean-and-previous migrations, build, Module 2 PostgreSQL integration/operational suite and the isolated Playwright CRM workflow.

A successful live run writes:

```text
module-2-evidence/stage-4-live.json
status = STAGE_4_ACCEPTED_READY_FOR_STAGE_5
```

Only that status closes Module 2 and permits the next dependency-aware module: **Module 3 — Tendering & Estimation**.
