# @construction-erp/queue

Foundation Pass 15 provides a durable PostgreSQL-backed queue contract for retryable/background work. PostgreSQL is an implementation choice because the controlling specification requires queues but does not mandate Redis, SQS, BullMQ, or another provider.

## Rules

- `enqueueJob(tx, input)` is transaction-bound and derives company/actor/request metadata from trusted request context.
- Jobs carry a versioned envelope and sanitized JSON payload.
- Workers claim due jobs using `FOR UPDATE SKIP LOCKED` and leases, giving safe concurrent workers and crash recovery.
- Delivery is at-least-once. Job handlers must be idempotent/retry-safe for external effects.
- `failQueueJob()` reschedules until `maxAttempts`, then dead-letters the job.
- Only stable error codes are persisted; exception messages/stacks/secrets are not stored in queue state.
- Queue work is secondary/retryable. The owning business transaction must be correct before a worker runs.
- Project scope is snapshotted as JSON at Foundation stage; no premature Project FK exists.

## Core API

```text
enqueueJob(tx, input)
claimQueueJobs(client, options)
completeQueueJob(client, options)
failQueueJob(client, options)
getQueueDiagnostics(client)
```

The Operations pass may later expose diagnostics through health/readiness/metrics endpoints; this package only provides the internal diagnostic query contract.
