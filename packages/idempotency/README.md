# @construction-erp/idempotency

Foundation Pass 12 reusable idempotency contract for retry-safe business commands.

## Scope

The package persists successful command results by trusted `companyId` + stable operation + caller-provided idempotency key. Raw request bodies are never stored; a deterministic SHA-256 fingerprint of normalized non-secret command input is persisted instead.

Use it at the service/transaction boundary:

```text
executeIdempotentCommand(client, input, async (tx) => {
  business mutation using tx
  optional recordAudit(tx, ...)
  optional recordOutboxEvent(tx, ...)
  return { statusCode, body }
})
```

The business mutation, audit/outbox records and idempotency completion record commit together. A thrown error rolls back all of them.

## Concurrency behavior

A PostgreSQL transaction-scoped advisory lock is derived from `companyId + operation + idempotencyKey`.

- concurrent duplicate while first request is running -> `IDEMPOTENCY_REQUEST_IN_PROGRESS` (409, retryable);
- same key + same fingerprint after success -> safe replay of the stored successful result;
- same key + different fingerprint -> `IDEMPOTENCY_KEY_REUSED` (409);
- a rolled-back/crashed transaction leaves no committed `IN_PROGRESS` reservation.

## Safety

- company identity comes only from trusted request context;
- operation names are stable lower-case dotted names;
- keys are bounded and reject control characters;
- fingerprint input rejects secret-like fields, binary data, Error objects, cycles and unsafe object types;
- only the SHA-256 fingerprint is stored, never the raw request;
- replay bodies are recursively secret-redacted and the first execution receives the same sanitized representation that later retries replay;
- only successful HTTP 2xx command results are persisted as completed responses.

Credential/authentication endpoints should not use this generic command-idempotency facility.

## Persistence window

Default retention is seven days, bounded from one minute to thirty days. Expired records can be deleted by `deleteExpiredIdempotencyRecords()`. This retention is an implementation default for the Foundation scaffold, not a business-module requirement from the source guide; a later deployment policy may tune it within the supported bounds.
