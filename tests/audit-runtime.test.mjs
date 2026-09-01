import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUDIT_BINARY_OMITTED,
  AUDIT_REDACTED,
  isSensitiveAuditKey,
  sanitizeAuditSnapshot,
} from '../packages/audit/dist/sanitize.js';

test('audit sanitizer recursively redacts credentials while retaining useful before/after state', () => {
  const safe = sanitizeAuditSnapshot({
    status: 'ACTIVE',
    nested: {
      password: 'plain-secret',
      refreshToken: 'refresh-secret',
      api_key: 'api-secret',
      sessionCookie: 'cookie-secret',
      profile: { displayName: 'Site Manager' },
    },
    changedAt: new Date('2026-08-22T10:00:00.000Z'),
    amount: 125.5,
  });

  assert.equal(safe.status, 'ACTIVE');
  assert.deepEqual(safe.nested, {
    password: AUDIT_REDACTED,
    refreshToken: AUDIT_REDACTED,
    api_key: AUDIT_REDACTED,
    sessionCookie: AUDIT_REDACTED,
    profile: { displayName: 'Site Manager' },
  });
  assert.equal(safe.changedAt, '2026-08-22T10:00:00.000Z');
  assert.equal(safe.amount, 125.5);
});

test('audit sanitizer never copies exception messages/stacks or binary values', () => {
  const safe = sanitizeAuditSnapshot({
    failure: new Error('DATABASE_URL=postgres://secret'),
    attachment: new Uint8Array([1, 2, 3]),
  });

  assert.deepEqual(safe.failure, { name: 'Error' });
  assert.equal(safe.attachment, AUDIT_BINARY_OMITTED);
});

test('audit sanitizer rejects circular/non-finite snapshots and recognizes sensitive aliases', () => {
  const circular = {};
  circular.self = circular;
  assert.throws(() => sanitizeAuditSnapshot(circular), /circular references/);
  assert.throws(() => sanitizeAuditSnapshot({ bad: Number.POSITIVE_INFINITY }), /non-finite/);
  for (const key of ['passwordHash', 'access_token', 'mfaSecret', 'oneTimeToken', 'sessionCookie', 'primaryDatabaseUrl']) {
    assert.equal(isSensitiveAuditKey(key), true, key);
  }
});
