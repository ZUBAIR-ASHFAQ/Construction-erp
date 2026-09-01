# Stage 2 - Pass 2.5 Reliability Layer

Status: COMPLETE for source/static hardening. Dependency-backed typecheck and live database proof remain blocked by the Stage-0 environment limits.

## What was checked from code

- Read the common API error envelope and Fastify error handler.
- Read request-ID/correlation handling and structured request lifecycle logging.
- Read the shared transaction helper and current transaction call sites.
- Read persisted idempotency execution, fingerprinting, replay sanitization and cleanup.
- Read transactional outbox recording, claiming, retry/dead-letter transitions and diagnostics.
- Read durable queue enqueue, claim, retry/dead-letter behavior and diagnostics.
- Read both background workers and searched all current external `fetch()` and queue-enqueue call sites.
- Confirmed external webhook calls exist only in background workers. Business-service transactions do not call those webhooks directly.
- Confirmed current durable queue use is limited to authentication follow-up and approval timing/notification work, which is retryable/secondary work rather than core transaction correctness.

## Real gaps found and fixed

1. Hidden 5xx field-error leakage
   - `toApiErrorEnvelope()` hid a private 5xx message/code but could still include `fieldErrors` from the same error.
   - Hidden server errors now omit field-level details as well.

2. Structured-log secret aliases
   - Custom log sanitization matched a fixed set of exact field names, so aliases such as `smtpPassword`, `clientCredential`, `privateKeyPem` or `connectionString` could pass through.
   - Secret-bearing key markers are now matched conservatively while normal IDs such as `companyId` remain visible.

3. Provider-controlled safe-error metadata
   - `toSafeErrorLog()` accepted arbitrary `name` and `category` strings from unknown errors.
   - Error names now require a small safe identifier shape and categories are limited to the known Foundation categories.

4. Queue payload redaction gap
   - Queue payload sanitization was weaker than audit/outbox/idempotency sanitization and did not cover credential/private-key/passcode/recovery/security-answer/connection-string/OTP aliases.
   - Queue redaction now covers the same important secret families without adding a new abstraction.

5. Worker logging was not Pino
   - Both durable background workers used `console.info/error` even though Foundation requires structured Pino logging.
   - Added one small shared `createStructuredLogger()` helper in the existing logging package and switched both workers to it.
   - `pino` is now an explicit dependency of the logging package rather than relying on a transitive Fastify dependency.

## Reliability parts verified without code change

- Request IDs are server-generated UUIDs and correlation headers are bounded/validated before reuse.
- Fastify automatic request logging is disabled; lifecycle logs avoid request bodies, query values and raw headers.
- `withTransaction()` keeps business transaction orchestration in services instead of routes.
- Idempotency is company-scoped, transaction-bound, fingerprinted, advisory-lock protected and replay-safe.
- Outbox insertion requires the caller transaction and trusted request/security context.
- Outbox and queue workers use `FOR UPDATE SKIP LOCKED` and stale-lease recovery.
- Queue failures persist stable error codes rather than exception messages/stacks.
- Queue work is not required to make the owning business transaction correct.

## Files changed

- `packages/errors/src/envelope.ts`
- `packages/logging/package.json`
- `packages/logging/src/index.ts`
- `packages/logging/src/logger.ts`
- `packages/logging/src/redaction.ts`
- `packages/logging/src/safe-error.ts`
- `packages/queue/src/sanitize.ts`
- `apps/api/src/workers/auth-notification.worker.ts`
- `apps/api/src/workers/approval-timing.worker.ts`
- focused existing regression tests
- this pass record

## Validation

- Focused reliability source tests: 43 passed, 0 failed.
- `npm run check:workspace`: PASS.
- `npm run test:static`: 3,015 passed, 0 failed, 87 skipped.
- `npm run foundation:gate`: PASS, including 8/8 Foundation acceptance checks.
- Existing function-comment policy: PASS.
- Direct TypeScript check for `@construction-erp/logging`: BLOCKED because `pino` cannot be installed in the current no-network dependency environment already recorded in Stage 0.4.
- Live database transaction/idempotency/outbox/queue verification: BLOCKED because this environment still has no usable database/dependency setup.

## Pass 2.5 exit decision

The static reliability layer is hardened enough to proceed. The next pass can focus on audit/security behavior. Before production release, dependencies must be installed and the normal typecheck/build plus live database Foundation gate must pass.
