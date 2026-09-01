import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000200_foundation_audit_infrastructure/migration.sql',
  'utf8'
);
const recordSource = await readFile('packages/audit/src/record.ts', 'utf8');
const sanitizeSource = await readFile('packages/audit/src/sanitize.ts', 'utf8');
const typesSource = await readFile('packages/audit/src/types.ts', 'utf8');

const modelBody = schema.match(/model\s+AuditLog\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';

test('Foundation owns a persistent audit_logs table linked to companies', () => {
  assert.match(schema, /model\s+AuditLog\s*\{/);
  assert.match(modelBody, /companyId\s+String\s+@map\("company_id"\)\s+@db\.Uuid/);
  assert.match(modelBody, /company\s+Company\s+@relation/);
  assert.match(modelBody, /@@map\("audit_logs"\)/);
  assert.match(migration, /CREATE TABLE "audit_logs"/);
  assert.match(migration, /FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/);
});

test('audit persistence captures required actor, scope, entity, request and before/after fields', () => {
  for (const pattern of [
    /actorUserId\s+String\?\s+@map\("actor_user_id"\)/,
    /projectScope\s+Json\s+@map\("project_scope"\)/,
    /entityType\s+String\s+@map\("entity_type"\)/,
    /entityId\s+String\s+@map\("entity_id"\)/,
    /requestId\s+String\s+@map\("request_id"\)/,
    /correlationId\s+String\s+@map\("correlation_id"\)/,
    /beforeValue\s+Json\?\s+@map\("before_value"\)/,
    /afterValue\s+Json\?\s+@map\("after_value"\)/,
  ]) assert.match(modelBody, pattern);
});

test('Pass 10 does not create premature Users/RBAC or Project Management foreign keys', () => {
  assert.doesNotMatch(migration, /REFERENCES\s+"users"/i);
  assert.doesNotMatch(migration, /REFERENCES\s+"projects"/i);
  assert.doesNotMatch(migration, /"project_id"/i);
  assert.match(migration, /actor_user_id.*without a foreign key/is);
  assert.match(migration, /Project scope is stored as JSON/i);
});

test('audit writes derive authority from request context and use the caller transaction', () => {
  assert.match(recordSource, /TransactionClient/);
  assert.match(recordSource, /requireRequestContext/);
  assert.match(recordSource, /requireRequestSecurityContext/);
  assert.match(recordSource, /companyId:\s*security\.companyId/);
  assert.match(recordSource, /actorUserId:\s*security\.actorUserId/);
  assert.match(recordSource, /tx\.auditLog\.create/);
  assert.doesNotMatch(typesSource, /companyId\s*:/);
  assert.doesNotMatch(typesSource, /actorUserId\s*:/);
});

test('audit snapshot sanitizer removes password/token/secret material recursively', () => {
  assert.match(sanitizeSource, /normalized\.includes\('password'\)/);
  assert.match(sanitizeSource, /normalized\.includes\('token'\)/);
  assert.match(sanitizeSource, /normalized\.includes\('secret'\)/);
  assert.match(sanitizeSource, /normalized\.includes\('credential'\)/);
  assert.match(sanitizeSource, /AUDIT_REDACTED/);
  assert.match(sanitizeSource, /Object\.entries/);
  assert.doesNotMatch(recordSource, /JSON\.stringify\(input\)/);
});

test('audit snapshots avoid exception messages/stacks and binary payloads', () => {
  assert.match(sanitizeSource, /value instanceof Error/);
  assert.match(sanitizeSource, /name: value\.name/);
  assert.match(sanitizeSource, /AUDIT_BINARY_OMITTED/);
  assert.doesNotMatch(sanitizeSource, /value\.message/);
  assert.doesNotMatch(sanitizeSource, /value\.stack/);
});

test('audit table has bounded lookup indexes for company/entity/actor/request correlation', () => {
  for (const index of [
    'audit_logs_company_created_at_idx',
    'audit_logs_entity_created_at_idx',
    'audit_logs_actor_created_at_idx',
    'audit_logs_request_id_idx',
    'audit_logs_correlation_id_idx',
  ]) assert.match(migration, new RegExp(index));
});
