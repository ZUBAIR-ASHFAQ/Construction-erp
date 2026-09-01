# Pass B18.7 - Final-21 Client Receipts Fastify Routes and OpenAPI

## Purpose

B18.7 publishes Final Module 16 - Client Receipts / Payments through the exact six required Fastify endpoints. The pass keeps the B18.2 persistence model and B18.5/B18.6 accounting rules unchanged while adding authenticated HTTP boundaries, stable response envelopes, idempotency headers and complete OpenAPI metadata.

## Exact public route surface

Only these routes are registered:

- `GET /api/v1/client-receipts`
- `POST /api/v1/client-receipts`
- `GET /api/v1/client-receipts/:id`
- `POST /api/v1/client-receipts/:id/allocations`
- `POST /api/v1/client-receipts/:id/unallocate`
- `POST /api/v1/client-receipts/:id/reverse`

No generic CRUD route is added.

## Authentication and authorization

Every route uses the existing bearer authentication plugin with the configured database. Company, actor and Project scope continue to come from authenticated request context. The route layer never accepts ownership or authoritative totals from the browser.

The service now exposes the two read operations needed by the GET routes:

- `listClientReceipts()` resolves `client_receipts.read`, applies bounded filters and Project visibility, then returns source-derived allocation totals;
- `getClientReceipt()` resolves the same read permission and returns `RECEIPT_NOT_FOUND` when the receipt is outside the visible Company/Project scope.

Write permissions remain owned by the existing B18.5/B18.6 service commands.

## Boundary validation

Fastify JSON schemas document the same boundaries already enforced by the B18.3 Zod schemas. Route handlers still parse requests and responses through those authoritative Zod schemas so OpenAPI metadata does not become a second business-rule implementation.

Documented filters include Client, Project, optional Stage, receipt status/type, payment method, date range and bounded pagination.

## Idempotency

All four write commands require `Idempotency-Key` with the Foundation 200-character limit:

- create/post receipt;
- allocate receipt;
- unallocate receipt;
- reverse receipt.

GET routes do not require an idempotency key.

## OpenAPI and stable errors

All six endpoints include:

- unique `operationId`;
- summary and `Client Receipts` tag;
- bearer security metadata;
- params/query/body schemas where applicable;
- success response envelope;
- standard `400`, `401`, `403`, `404`, `409`, `500` and `503` error envelopes.

The documented Module 16 business errors remain:

- `RECEIPT_NOT_FOUND`
- `ALLOCATION_EXCEEDS_RECEIPT`
- `ALLOCATION_EXCEEDS_INVOICE`
- `RECEIPT_SCOPE_MISMATCH`
- `RECEIPT_LOCKED`

Foundation authentication, idempotency, numbering and Finance errors retain their own stable codes.

## Runtime registration

`registerClientReceiptsRoutes` is exported through the module index and registered in `apps/api/src/app.ts` only when a database dependency is supplied, matching the other database-backed business modules.

## Scope intentionally deferred

B18.7 does not add a Prisma migration, change receipt accounting, add the React feature, or add the Module 21 `client_receipt` resource type. Those cross-module reconciliation and Documents checks belong to B18.8, while the React feature remains B18.9.

## Next pass

**B18.8 - Client Receipts reconciliation, audit and Documents proof:** prove billed/received/allocated/advance/outstanding separation, Stage non-double-counting, source-key idempotency, reversal traceability, and add the authorized Module 21 `client_receipt` document-link resource integration.

## Verification

- B18.7 focused tests: **12/12 PASS**
- B18.1-B18.7 focused tests: **80/80 PASS**
- B18.7 cumulative gate: **108/108 PASS**
- Final-21 static suite: **587/587 PASS**
- Current Foundation + Final-21 static suite: **692/692 PASS**
- Workspace / required stack check: **PASS**
- Migration policy: **88/88 migrations locked across 88 gates**
- Function-purpose-comment gate: **PASS**
- Modified TypeScript syntax checks: **PASS**
- Dependency-backed Prisma/TypeScript/Vite build: **not claimed** because the source archive has no installed `node_modules`; `verify:toolchain` correctly stops at `prisma: not found`.
