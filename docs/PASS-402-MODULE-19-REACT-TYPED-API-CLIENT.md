# Pass 402 — Module 19 React Typed API Client

## Purpose

Pass 402 builds on the exact Pass-401 archive and adds only the first browser-side data boundary for **Stage 24 / Module 19 — RFI & Submittals**.

The backend is already accepted through:

- RFI/Submittal persistence;
- strict Zod boundaries;
- Company/Project-scoped repositories;
- service workflow and idempotency;
- Fastify/OpenAPI registration;
- durable RFI response-thread readback;
- durable Submittal revision/review readback.

This pass does not change backend behavior. It creates one typed React API client that maps those accepted contracts into the browser before TanStack Query hooks or UI are generated.

## New production file

```text
apps/web/src/features/rfi-submittals/
└── api/
    └── rfi-submittals-api.ts
```

No other production file changes in Pass 402.

## Exact browser operation surface

The client exposes **11 browser operations**: **4 reads** and **7 writes**.

### RFI reads

```text
listRfis
getRfiDetails
```

These map to:

```text
GET /api/v1/projects/:projectId/rfis
GET /api/v1/rfis/:id
```

The list query accepts only:

```text
page
pageSize
status = OPEN | CLOSED
```

No search, sort, assignee, discipline, date-range or browser-computed overdue query is invented.

### RFI writes

```text
createRfi
respondRfi
closeRfi
reopenRfi
```

These map to the accepted commands:

```text
POST /api/v1/projects/:projectId/rfis
POST /api/v1/rfis/:id/respond
POST /api/v1/rfis/:id/close
POST /api/v1/rfis/:id/reopen
```

Every write accepts an explicit browser-generated Foundation `Idempotency-Key` and sends it through the shared authenticated request transport.

`closeRfi` remains bodyless.

Browser-authored RFI inputs contain only the accepted business fields:

```text
create:
  subject
  question
  discipline
  assignedTo
  dueDate

respond:
  response
  documentId optional

reopen:
  reason
```

The client does not expose Company ownership, Project authorization, RFI numbering, raiser identity, responder identity, response time/type, lifecycle status or close time as writable inputs.

## Submittal reads

```text
listSubmittals
getSubmittalDetails
```

These map to:

```text
GET /api/v1/projects/:projectId/submittals
GET /api/v1/submittals/:id
```

The list query accepts only:

```text
page
pageSize
status
```

No search/sort/user/type/date/overdue query surface is added.

The detail contract preserves the Pass-401 durable hierarchy:

```text
Submittal
└── revisions[]
    └── reviews[]
```

## Submittal writes

```text
createSubmittal
submitSubmittal
reviewSubmittal
```

These map to:

```text
POST /api/v1/projects/:projectId/submittals
POST /api/v1/submittals/:id/submit
POST /api/v1/submittals/:id/reviews
```

Browser-authored fields are limited to:

```text
create:
  title
  submittalType
  specReference optional
  responsibleUserId
  dueDate
  documentId optional

submit:
  documentId optional

review:
  decision
  comments
```

The accepted review vocabulary is typed exactly as:

```text
APPROVED
APPROVED_WITH_COMMENTS
REVISE_RESUBMIT
REJECTED
```

The source does not freeze a complete Submittal status enum. The browser therefore keeps Submittal/revision `status` as a bounded server string while typing only the explicitly reviewed review-decision vocabulary above. No new lifecycle vocabulary is invented.

## Durable readback types

The browser types include the Pass-401 readback repairs directly:

```text
RfiDetail
└── responses[]

SubmittalDetail
└── revisions[]
    └── reviews[]
```

This means the next hook/UI passes can reload detail pages from durable backend history instead of retaining command responses only in local component state.

## Shared transport and security boundary

The client reuses:

```text
../../users-rbac/api/auth-api.js
authenticatedRequest()
```

It does not create a second fetch/auth/token subsystem.

All Project/resource IDs are URL-encoded before insertion into paths.

The browser client does not decide permission or Project scope. The API remains authoritative for:

- Company identity;
- authenticated actor;
- `rfi.*` / `submittals.*` permission checks;
- Module-24B Project visibility;
- same-Project user/Document validation;
- numbering;
- lifecycle transitions;
- append-only history;
- idempotency execution;
- audit/outbox evidence.

## Document boundary

Pass 402 does not invent a new file upload route or RFI attachment table.

Where the accepted Module-19 command already supports a `documentId`, the typed input carries that existing Module-18 reference only. The later React workspace can use the established Document Management feature for upload/access behavior.

## Intentionally absent

Pass 402 adds:

- no React hook;
- no component;
- no page;
- no router/navigation registration;
- no Playwright workflow;
- no new backend API;
- no Prisma model;
- no migration;
- no repository/service change;
- no permission/error/event vocabulary;
- no Module-20 production code.

TanStack Query is intentionally deferred until the client contract is frozen and verified.

## Verification boundary

The focused Pass-402 test verifies:

- all 11 browser operations exist;
- exactly four reads and seven writes are represented;
- list query fields are bounded to accepted inputs;
- browser mutation types do not expose server-owned authority;
- all seven writes send `Idempotency-Key`;
- close remains bodyless;
- the Pass-401 nested readback shape is typed;
- Project/resource IDs are encoded;
- shared authenticated transport is reused;
- no Module-19 backend/database production file changed;
- no hooks/components/pages are generated prematurely;
- all named functions have purpose comments.

The cumulative gate also reruns Pass 401, migration-system and workspace checks.

## Next pass

**Pass 403 — Module 19 TanStack Query Hooks**

The next pass should consume only this typed client, define stable Module-19 query keys, add list/detail queries and command mutations, and invalidate only the affected RFI/Submittal caches. It must not generate the full UI yet.
