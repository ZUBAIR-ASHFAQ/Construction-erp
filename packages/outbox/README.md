# @construction-erp/outbox

Foundation Pass 11 transactional outbox infrastructure.

## Core rule

`recordOutboxEvent(tx, input)` receives the **same Prisma `TransactionClient`** used by the owning service mutation and by `recordAudit()` when audit is required. The database change, audit record and outbox row therefore commit or roll back together.

Recording an event performs **no network call** and never waits on a worker. This preserves the requirement that core transaction correctness must not depend on asynchronous processing.

## Stable envelope (schema version 1)

Published events expose only this contract:

- `schemaVersion`
- `eventId`
- `eventType`
- `companyId`
- `actorUserId`
- `projectScope`
- `resource { type, id }`
- `requestId`
- `correlationId`
- `occurredAt`
- `payload`

Company, actor, request correlation and project scope are derived from trusted server-side request context. Callers cannot supply them.

## Delivery model

`claimOutboxBatch()` atomically claims due rows using PostgreSQL `FOR UPDATE SKIP LOCKED`. Claims are leased. A crashed worker's stale `PROCESSING` rows become claimable again after the lease interval.

Delivery is **at-least-once**. Downstream consumers must use `eventId` as the delivery deduplication key. Foundation Pass 12 adds the reusable idempotency infrastructure used by command consumers and later posting adapters.

On successful transport acknowledgement call `markOutboxPublished()`. On retryable failure call `releaseOutboxForRetry()` with a future `retryAt` and a stable error code. On terminal failure call `markOutboxDeadLetter()`.

Only stable error codes are persisted; raw exception messages/stacks are not stored.

## Secret safety

Outbox payloads recursively redact password/token/secret/credential/API-key/cookie/database-URL style fields and omit binary data. Error objects persist only their class/name.

## Dependency gates

`actor_user_id` deliberately has no Administration FK and `project_scope` is JSON because Administration and Project Management/Administration project-scope support do not exist yet. No premature future-table relationship is introduced in this pass.

## Operations diagnostics

Pass 19 adds `getOutboxDiagnostics(client)`, which exposes only aggregate status counts, due events and stale processing leases. It never reads event payloads, resource IDs, tenant IDs or actor IDs.
