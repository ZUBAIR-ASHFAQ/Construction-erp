import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  'packages/database/prisma/migrations/20260828000200_foundation_audit_security_hardening/migration.sql',
  'utf8'
);
const sanitizer = await readFile('packages/audit/src/sanitize.ts', 'utf8');
const recordSource = await readFile('packages/audit/src/record.ts', 'utf8');

/** Assert that one literal security token is present in the audit sanitizer source. */
function includesSanitizerToken(token) {
  assert.ok(sanitizer.includes(token), `Missing audit sanitizer token: ${token}`);
}

test('Pass 2.6 makes audit_logs append-only at the database boundary', () => {
  assert.match(migration, /CREATE FUNCTION "prevent_audit_log_mutation"\(\)/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "audit_logs"/);
  assert.match(migration, /RAISE EXCEPTION 'audit_logs is append-only/);
  assert.match(migration, /EXECUTE FUNCTION "prevent_audit_log_mutation"\(\)/);
});

test('Pass 2.6 expands credential and signed-access redaction without a new sanitizer abstraction', () => {
  for (const token of [
    "normalized.includes('accesskey')",
    "normalized.includes('signingkey')",
    "normalized.includes('encryptionkey')",
    "normalized.includes('authorization')",
    "normalized.includes('bearer')",
    "normalized.includes('jwt')",
    "normalized.includes('signedurl')",
    "normalized.includes('presignedurl')",
    "normalized.includes('storagekey')",
  ]) includesSanitizerToken(token);

  assert.match(sanitizer, /output\[key\] = AUDIT_REDACTED/);
});

test('Pass 2.6 keeps audit authority server-derived and transaction-bound', () => {
  assert.match(recordSource, /requireRequestContext\(\)/);
  assert.match(recordSource, /requireRequestSecurityContext\(\)/);
  assert.match(recordSource, /companyId: security\.companyId/);
  assert.match(recordSource, /actorUserId: security\.actorUserId/);
  assert.match(recordSource, /tx\.auditLog\.create/);
});
