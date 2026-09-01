# Pass 401 — Module 19 Detail/History Readback Repair

## Purpose

Pass 401 implements only the two narrow read-only amendments frozen by Pass 394 so the required Module-19 React detail/history experience can survive browser reloads without making the Project register payloads carry every historical row.

The original nine Module-19 source operations remain unchanged. Pass 401 adds exactly:

```text
GET /api/v1/rfis/:id
GET /api/v1/submittals/:id
```

No generic CRUD route is added.

## RFI detail read

`GET /api/v1/rfis/:id`:

- requires the existing `rfi.read` permission;
- resolves Company and allowed Project scope server-side;
- returns the browser-safe RFI header;
- adds ordered append-only `responses[]` using the existing repository read helper;
- keeps optional response `documentId` references as stored evidence;
- performs no write, audit mutation, outbox event or idempotency claim.

The detail response shape is:

```text
RFI header
└── responses[]
    ├── responderUserId
    ├── response
    ├── respondedAt
    ├── responseType
    └── documentId
```

## Submittal detail read

`GET /api/v1/submittals/:id`:

- requires the existing `submittals.read` permission;
- resolves Company and allowed Project scope server-side;
- returns the browser-safe Submittal header;
- adds ordered `revisions[]` using the existing repository revision helper;
- adds each revision's ordered append-only `reviews[]` using the existing review helper;
- performs no write, audit mutation, outbox event or idempotency claim.

The detail response shape is:

```text
Submittal header
└── revisions[]
    ├── revisionNo
    ├── submittedAt
    ├── submittedBy
    ├── status
    ├── documentId
    └── reviews[]
        ├── reviewerUserId
        ├── decision
        ├── comments
        └── reviewedAt
```

## Scope and data-integrity boundary

Pass 401 deliberately reuses the existing Module-19 persistence and repository helpers. It adds:

- no Prisma model;
- no migration;
- no repository method;
- no permission token;
- no stable error code;
- no domain event;
- no write command;
- no React code;
- no Module-20 production code.

The RFI response order remains `respondedAt`, then `id`. Submittal revisions remain ordered by `revisionNo`, then `id`. Reviews remain ordered by `reviewedAt`, then `id`.

## HTTP/OpenAPI behavior

Both detail routes:

- authenticate through the existing Module-19 Fastify boundary;
- validate UUID path parameters through the existing strict Zod params schemas;
- validate the service response with new strict Zod detail schemas;
- publish explicit OpenAPI success and error schemas;
- do not require an `Idempotency-Key` because they are read-only.

The public Module-19 route count therefore becomes:

```text
9 original source operations
+ 2 frozen readback repairs
= 11 routes
```

## Verification

Pass 401 adds focused static verification and extends both existing disposable PostgreSQL/Fastify integration suites with durable detail readback assertions.

The live suites now verify, when `RUN_FOUNDATION_DB_TESTS=1` and dependencies/PostgreSQL are available:

- RFI detail returns ordered response history after respond/close/reopen/respond;
- Submittal detail returns ordered revision history and nested review history after revise/resubmit;
- a same-Project read-only user can load detail;
- a foreign Company/Project user cannot read detail.

When the dependency-backed live environment is unavailable, these live scenarios are retained but are not claimed as executed.

## Next pass

```text
Pass 402 — Module 19 React Typed API Client
```

The React client may now consume durable RFI thread and Submittal revision/review readback. Stage 25 / Module 20 Daily Site Reports remains untouched.
