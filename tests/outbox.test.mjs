import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000300_foundation_transactional_outbox/migration.sql',
  'utf8'
);
const recordSource = await readFile('packages/outbox/src/record.ts', 'utf8');
const publisherSource = await readFile('packages/outbox/src/publisher.ts', 'utf8');
const envelopeSource = await readFile('packages/outbox/src/envelope.ts', 'utf8');
const sanitizeSource = await readFile('packages/outbox/src/sanitize.ts', 'utf8');
const typesSource = await readFile('packages/outbox/src/types.ts', 'utf8');
const integrationEventSource = await readFile('packages/contracts/src/integration-event.ts', 'utf8');

const modelBody = schema.match(/model\s+OutboxEvent\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('Foundation owns durable outbox_events linked only to companies at this gate', () => {
  assert.match(schema, /model\s+OutboxEvent\s*\{/);
  assert.match(modelBody, /companyId\s+String\s+@map\("company_id"\)\s+@db\.Uuid/);
  assert.match(modelBody, /company\s+Company\s+@relation/);
  assert.match(modelBody, /@@map\("outbox_events"\)/);
  assert.match(migration, /CREATE TABLE "outbox_events"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
  assert.doesNotMatch(migration, /REFERENCES\s+"users"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"projects"/i);
  assert.doesNotMatch(migration, /"project_id"/i);
});

test('outbox row persists the stable envelope and retry state', () => {
  for (const pattern of [
    /schemaVersion\s+Int\s+@default\(1\)\s+@map\("schema_version"\)/,
    /actorUserId\s+String\?\s+@map\("actor_user_id"\)/,
    /projectScope\s+Json\s+@map\("project_scope"\)/,
    /eventType\s+String\s+@map\("event_type"\)/,
    /resourceType\s+String\s+@map\("resource_type"\)/,
    /resourceId\s+String\s+@map\("resource_id"\)/,
    /requestId\s+String\s+@map\("request_id"\)/,
    /correlationId\s+String\s+@map\("correlation_id"\)/,
    /payload\s+Json/,
    /status\s+String\s+@default\("PENDING"\)/,
    /availableAt\s+DateTime/,
    /attemptCount\s+Int\s+@default\(0\)/,
    /lockedAt\s+DateTime\?/,
    /lockedBy\s+String\?/,
    /publishedAt\s+DateTime\?/,
  ]) assert.match(modelBody, pattern);
});

test('recordOutboxEvent is transaction-bound and derives authority from trusted request context', () => {
  assert.match(recordSource, /TransactionClient/);
  assert.match(recordSource, /requireRequestContext/);
  assert.match(recordSource, /requireRequestSecurityContext/);
  assert.match(recordSource, /companyId:\s*security\.companyId/);
  assert.match(recordSource, /actorUserId:\s*security\.actorUserId/);
  assert.match(recordSource, /tx\.outboxEvent\.create/);
  const inputBody = typesSource.match(/export type RecordOutboxEventInput = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? '';
  assert.doesNotMatch(inputBody, /companyId\s*:/);
  assert.doesNotMatch(inputBody, /actorUserId\s*:/);
});

test('outbox event types use stable lower-case dotted names', () => {
  assert.match(recordSource, /EVENT_TYPE_PATTERN/);
  assert.match(recordSource, /user\.created/);
});

test('outbox publisher atomically claims with SKIP LOCKED and stale-lease recovery', () => {
  assert.match(publisherSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(publisherSource, /status = 'PENDING'/);
  assert.match(publisherSource, /status = 'PROCESSING'/);
  assert.match(publisherSource, /make_interval\(secs =>/);
  assert.match(publisherSource, /attempt_count = event\.attempt_count \+ 1/);
  assert.match(publisherSource, /client\.\$transaction/);
});

test('publisher completion, retry and dead-letter transitions require worker lease ownership', () => {
  assert.match(publisherSource, /markOutboxPublished/);
  assert.match(publisherSource, /releaseOutboxForRetry/);
  assert.match(publisherSource, /markOutboxDeadLetter/);
  assert.match(publisherSource, /lockedBy:\s*workerId\(options\.workerId\)/);
  assert.match(publisherSource, /status:\s*'PUBLISHED'/);
  assert.match(publisherSource, /status:\s*'DEAD_LETTER'/);
  assert.match(publisherSource, /lastErrorCode:\s*stableErrorCode/);
  assert.doesNotMatch(publisherSource, /error\.message/);
  assert.doesNotMatch(publisherSource, /\.stack/);
});

test('stable envelope exposes eventId as at-least-once consumer deduplication identity', () => {
  assert.match(typesSource, /OutboxEnvelope = IntegrationEventEnvelope/);
  assert.match(integrationEventSource, /schemaVersion/);
  assert.match(integrationEventSource, /eventId:\s*string/);
  assert.match(integrationEventSource, /resource:\s*Readonly/);
  assert.match(integrationEventSource, /requestId:\s*string/);
  assert.match(integrationEventSource, /correlationId:\s*string/);
  assert.match(envelopeSource, /eventId:\s*row\.id/);
  assert.match(envelopeSource, /occurredAt:\s*row\.occurred_at\.toISOString\(\)/);
});

test('outbox payload sanitizer prevents secret/error/binary leakage', () => {
  for (const pattern of [
    /normalized\.includes\('password'\)/,
    /normalized\.includes\('token'\)/,
    /normalized\.includes\('secret'\)/,
    /OUTBOX_REDACTED/,
    /OUTBOX_BINARY_OMITTED/,
    /value instanceof Error/,
  ]) assert.match(sanitizeSource, pattern);
  assert.doesNotMatch(sanitizeSource, /value\.message/);
  assert.doesNotMatch(sanitizeSource, /value\.stack/);
});

test('database protects valid outbox state and worker scan indexes', () => {
  for (const marker of [
    'outbox_events_status_allowed',
    'outbox_events_processing_lease_shape',
    'outbox_events_published_shape',
    'outbox_events_payload_object',
    'outbox_events_delivery_idx',
    'outbox_events_stale_lease_idx',
    'outbox_events_company_occurred_at_idx',
  ]) assert.match(migration, new RegExp(marker));
});
