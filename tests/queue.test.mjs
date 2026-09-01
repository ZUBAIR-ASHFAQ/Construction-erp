import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000600_foundation_queue_infrastructure/migration.sql',
  'utf8'
);
const enqueueSource = await readFile('packages/queue/src/enqueue.ts', 'utf8');
const workerSource = await readFile('packages/queue/src/worker.ts', 'utf8');
const diagnosticsSource = await readFile('packages/queue/src/diagnostics.ts', 'utf8');
const sanitizeSource = await readFile('packages/queue/src/sanitize.ts', 'utf8');
const typesSource = await readFile('packages/queue/src/types.ts', 'utf8');
const packageJson = JSON.parse(await readFile('packages/queue/package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));

const modelBody = schema.match(/model\s+QueueJob\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('Pass 15 adds the queue workspace package at the current Foundation version', () => {
  assert.equal(packageJson.name, '@construction-erp/queue');
  assert.equal(packageJson.version, '0.16.0');
  assert.equal(apiPackage.dependencies['@construction-erp/queue'], 'workspace:*');
});

test('Foundation owns durable company-scoped queue_jobs without premature user/project FKs', () => {
  assert.match(schema, /model\s+QueueJob\s*\{/);
  assert.match(modelBody, /companyId\s+String\s+@map\("company_id"\)\s+@db\.Uuid/);
  assert.match(modelBody, /company\s+Company\s+@relation/);
  assert.match(modelBody, /@@map\("queue_jobs"\)/);
  assert.match(migration, /CREATE TABLE "queue_jobs"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
  assert.doesNotMatch(migration, /REFERENCES\s+"users"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"projects"/i);
  assert.doesNotMatch(migration, /"project_id"/i);
});

test('queue rows persist a versioned correlation envelope and bounded retry state', () => {
  for (const pattern of [
    /schemaVersion\s+Int\s+@default\(1\)/,
    /actorUserId\s+String\?/,
    /projectScope\s+Json/,
    /queueName\s+String/,
    /jobType\s+String/,
    /requestId\s+String/,
    /correlationId\s+String/,
    /payload\s+Json/,
    /status\s+String\s+@default\("PENDING"\)/,
    /attemptCount\s+Int\s+@default\(0\)/,
    /maxAttempts\s+Int\s+@default\(5\)/,
    /lockedAt\s+DateTime\?/,
    /lockedBy\s+String\?/,
    /completedAt\s+DateTime\?/,
    /deadLetteredAt\s+DateTime\?/
  ]) assert.match(modelBody, pattern);
});

test('enqueueJob is transaction-bound and derives company/actor/request authority from trusted context', () => {
  assert.match(enqueueSource, /TransactionClient/);
  assert.match(enqueueSource, /requireRequestContext/);
  assert.match(enqueueSource, /requireRequestSecurityContext/);
  assert.match(enqueueSource, /companyId:\s*security\.companyId/);
  assert.match(enqueueSource, /actorUserId:\s*security\.actorUserId/);
  assert.match(enqueueSource, /tx\.queueJob\.create/);
  const inputBody = typesSource.match(/export type EnqueueJobInput = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? '';
  assert.doesNotMatch(inputBody, /companyId\s*:/);
  assert.doesNotMatch(inputBody, /actorUserId\s*:/);
});



test('public authentication jobs can be queued without impersonating the target user', () => {
  assert.match(enqueueSource, /enqueueUnauthenticatedJob/);
  assert.match(enqueueSource, /actorUserId:\s*null/);
  assert.match(enqueueSource, /projectScope:\s*\{ kind: 'not-resolved' \}/);
  assert.match(enqueueSource, /trustedCompanyId/);
});

test('queue workers claim concurrently with SKIP LOCKED and stale lease recovery', () => {
  assert.match(workerSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(workerSource, /status = 'PENDING'/);
  assert.match(workerSource, /status = 'PROCESSING'/);
  assert.match(workerSource, /make_interval\(secs =>/);
  assert.match(workerSource, /attempt_count = job\.attempt_count \+ 1/);
  assert.match(workerSource, /attempt_count < max_attempts/);
  assert.match(workerSource, /QUEUE_WORKER_LEASE_EXPIRED/);
  assert.match(workerSource, /attempt_count >= max_attempts/);
});

test('completion requires worker lease ownership', () => {
  assert.match(workerSource, /completeQueueJob/);
  assert.match(workerSource, /status:\s*'PROCESSING'/);
  assert.match(workerSource, /lockedBy:\s*nonBlank\(options\.workerId/);
  assert.match(workerSource, /status:\s*'COMPLETED'/);
  assert.match(workerSource, /completedAt:\s*new Date\(\)/);
});

test('failure policy retries until max attempts then dead-letters', () => {
  assert.match(workerSource, /failQueueJob/);
  assert.match(workerSource, /attempt_count >= max_attempts/);
  assert.match(workerSource, /'DEAD_LETTER'/);
  assert.match(workerSource, /'PENDING'/);
  assert.match(workerSource, /last_error_code/);
  assert.match(workerSource, /stableErrorCode/);
  assert.doesNotMatch(workerSource, /error\.message/);
  assert.doesNotMatch(workerSource, /\.stack/);
});

test('queue payload sanitizer redacts credentials and omits binary/error details', () => {
  for (const pattern of [
    /SENSITIVE_KEY_MARKERS/,
    /'password'/,
    /'token'/,
    /'secret'/,
    /'credential'/,
    /'privatekey'/,
    /'passcode'/,
    /'recoverycode'/,
    /'securityanswer'/,
    /'connectionstring'/,
    /normalized === 'otp'/,
    /QUEUE_REDACTED/,
    /QUEUE_BINARY_OMITTED/,
    /value instanceof Error/
  ]) assert.match(sanitizeSource, pattern);
  assert.doesNotMatch(sanitizeSource, /value\.message/);
  assert.doesNotMatch(sanitizeSource, /value\.stack/);
});

test('database constraints protect queue states, attempts, payload and worker leases', () => {
  for (const marker of [
    'queue_jobs_status_allowed',
    'queue_jobs_attempt_count_nonnegative',
    'queue_jobs_max_attempts_range',
    'queue_jobs_processing_lease_shape',
    'queue_jobs_completed_shape',
    'queue_jobs_dead_letter_shape',
    'queue_jobs_payload_object',
    'queue_jobs_claim_idx',
    'queue_jobs_lease_idx'
  ]) assert.match(migration, new RegExp(marker));
});

test('queue diagnostics expose counts, due jobs and stale-processing jobs without payload inspection', () => {
  assert.match(diagnosticsSource, /groupBy/);
  assert.match(diagnosticsSource, /dueJobs/);
  assert.match(diagnosticsSource, /staleProcessingJobs/);
  assert.match(diagnosticsSource, /status = 'PENDING'/);
  assert.match(diagnosticsSource, /status = 'PROCESSING'/);
  assert.doesNotMatch(diagnosticsSource, /payload/);
});
