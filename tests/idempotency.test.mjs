import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000400_foundation_idempotency_infrastructure/migration.sql',
  'utf8',
);
const executeSource = await readFile('packages/idempotency/src/execute.ts', 'utf8');
const fingerprintSource = await readFile('packages/idempotency/src/fingerprint.ts', 'utf8');
const sanitizeSource = await readFile('packages/idempotency/src/sanitize.ts', 'utf8');
const cleanupSource = await readFile('packages/idempotency/src/cleanup.ts', 'utf8');
const typesSource = await readFile('packages/idempotency/src/types.ts', 'utf8');
const modelBody = schema.match(/model\s+IdempotencyRecord\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('Foundation owns company-scoped idempotency_records without premature future-module FKs', () => {
  assert.match(schema, /model\s+IdempotencyRecord\s*\{/);
  assert.match(modelBody, /companyId\s+String\s+@map\("company_id"\)\s+@db\.Uuid/);
  assert.match(modelBody, /company\s+Company\s+@relation/);
  assert.match(modelBody, /@@map\("idempotency_records"\)/);
  assert.match(migration, /CREATE TABLE "idempotency_records"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
  assert.doesNotMatch(migration, /REFERENCES\s+"users"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"projects"/i);
  assert.doesNotMatch(migration, /"project_id"/i);
});

test('idempotency persistence stores fingerprint and replay result rather than the raw request', () => {
  for (const pattern of [
    /operation\s+String/,
    /idempotencyKey\s+String\s+@map\("idempotency_key"\)/,
    /requestFingerprint\s+String\s+@map\("request_fingerprint"\)\s+@db\.Char\(64\)/,
    /status\s+String\s+@default\("IN_PROGRESS"\)/,
    /requestId\s+String\s+@map\("request_id"\)/,
    /correlationId\s+String\s+@map\("correlation_id"\)/,
    /responseStatus\s+Int\?/,
    /responseBody\s+Json\?/,
    /completedAt\s+DateTime\?/,
    /expiresAt\s+DateTime/,
  ]) assert.match(modelBody, pattern);
  assert.doesNotMatch(modelBody, /requestBody/i);
  assert.doesNotMatch(modelBody, /rawRequest/i);
});

test('company + operation + idempotency key is unique', () => {
  assert.match(modelBody, /@@unique\(\[companyId, operation, idempotencyKey\]/);
  assert.match(migration, /CREATE UNIQUE INDEX "idempotency_records_company_operation_key_uq"/);
});

test('command identity and company authority are derived safely', () => {
  assert.match(executeSource, /requireRequestContext/);
  assert.match(executeSource, /requireRequestSecurityContext/);
  assert.match(executeSource, /companyId:\s*security\.companyId/);
  assert.match(executeSource, /OPERATION_PATTERN/);
  assert.match(executeSource, /normalizeIdempotencyKey/);
  assert.match(executeSource, /CONTROL_CHARACTER_PATTERN/);
  const inputBody = typesSource.match(/export type ExecuteIdempotentCommandInput = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? '';
  assert.doesNotMatch(inputBody, /companyId\s*:/);
  assert.doesNotMatch(inputBody, /actorUserId\s*:/);
});

test('concurrent duplicate protection uses transaction-scoped PostgreSQL advisory locking', () => {
  assert.match(executeSource, /pg_try_advisory_xact_lock/);
  assert.match(executeSource, /hashtextextended/);
  assert.match(executeSource, /client\.\$transaction/);
  assert.match(executeSource, /IDEMPOTENCY_REQUEST_IN_PROGRESS/);
  assert.match(executeSource, /retryable:\s*true/);
});

test('same key with a different normalized request is rejected', () => {
  assert.match(executeSource, /existing\.requestFingerprint !== requestFingerprint/);
  assert.match(executeSource, /IDEMPOTENCY_KEY_REUSED/);
});

test('successful completed requests are replayed without rerunning work', () => {
  assert.match(executeSource, /kind:\s*'replayed'/);
  assert.match(executeSource, /existing\.responseStatus/);
  assert.match(executeSource, /existing\.responseBody/);
  assert.match(executeSource, /kind:\s*'executed'/);
  assert.match(executeSource, /await work\(tx\)/);
  assert.match(executeSource, /status:\s*'COMPLETED'/);
});

test('business work and idempotency completion share one transaction', () => {
  assert.match(executeSource, /client\.\$transaction\(async \(tx\)/);
  assert.match(executeSource, /tx\.idempotencyRecord\.create/);
  assert.match(executeSource, /await work\(tx\)/);
  assert.match(executeSource, /tx\.idempotencyRecord\.update/);
  assert.doesNotMatch(executeSource, /new PrismaClient/);
});

test('fingerprinting is deterministic SHA-256 and rejects sensitive or unsafe input', () => {
  assert.match(fingerprintSource, /createHash\('sha256'\)/);
  assert.match(fingerprintSource, /Object\.entries/);
  assert.match(fingerprintSource, /\.sort\(\(\[a\], \[b\]\)/);
  assert.match(fingerprintSource, /isSensitiveFingerprintKey/);
  assert.match(fingerprintSource, /Sensitive field/);
  assert.match(fingerprintSource, /Binary data must not be included/);
  assert.match(fingerprintSource, /circular references/);
});

test('replay response sanitizer redacts secrets and unsafe diagnostic values', () => {
  for (const pattern of [
    /password/,
    /token/,
    /secret/,
    /IDEMPOTENCY_REPLAY_REDACTED/,
    /IDEMPOTENCY_REPLAY_BINARY_OMITTED/,
    /value instanceof Error/,
  ]) assert.match(sanitizeSource, pattern);
  assert.doesNotMatch(sanitizeSource, /value\.message/);
  assert.doesNotMatch(sanitizeSource, /value\.stack/);
});

test('database constraints enforce valid status/completion/fingerprint/expiry shapes', () => {
  for (const marker of [
    'idempotency_records_status_allowed',
    'idempotency_records_operation_format',
    'idempotency_records_key_shape',
    'idempotency_records_fingerprint_shape',
    'idempotency_records_response_status_shape',
    'idempotency_records_completion_shape',
    'idempotency_records_expiry_after_creation',
    'idempotency_records_status_expires_at_idx',
  ]) assert.match(migration, new RegExp(marker));
});

test('cleanup removes only expired completed records with SKIP LOCKED', () => {
  assert.match(cleanupSource, /status = 'COMPLETED'/);
  assert.match(cleanupSource, /expires_at <= CURRENT_TIMESTAMP/);
  assert.match(cleanupSource, /FOR UPDATE SKIP LOCKED/);
  assert.match(cleanupSource, /DELETE FROM idempotency_records/);
});
