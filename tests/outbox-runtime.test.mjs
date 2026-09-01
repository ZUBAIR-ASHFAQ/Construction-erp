import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSensitiveOutboxKey,
  OUTBOX_BINARY_OMITTED,
  OUTBOX_REDACTED,
  sanitizeOutboxPayload,
} from '../packages/outbox/dist/sanitize.js';

test('outbox sanitizer preserves useful event data while redacting credentials recursively', () => {
  const safe = sanitizeOutboxPayload({
    status: 'APPROVED',
    amount: 500.25,
    nested: {
      passwordHash: 'hash',
      accessToken: 'token',
      api_key: 'key',
      details: { source: 'purchase-order' },
    },
    postedAt: new Date('2026-08-22T10:00:00.000Z'),
  });

  assert.equal(safe.status, 'APPROVED');
  assert.equal(safe.amount, 500.25);
  assert.deepEqual(safe.nested, {
    passwordHash: OUTBOX_REDACTED,
    accessToken: OUTBOX_REDACTED,
    api_key: OUTBOX_REDACTED,
    details: { source: 'purchase-order' },
  });
  assert.equal(safe.postedAt, '2026-08-22T10:00:00.000Z');
});

test('outbox sanitizer does not persist exception messages or binary payloads', () => {
  const safe = sanitizeOutboxPayload({
    failure: new Error('DATABASE_URL=postgres://secret'),
    bytes: new Uint8Array([1, 2, 3]),
  });
  assert.deepEqual(safe.failure, { name: 'Error' });
  assert.equal(safe.bytes, OUTBOX_BINARY_OMITTED);
});

test('outbox sanitizer rejects unsafe shapes and detects sensitive aliases', () => {
  const circular = {};
  circular.self = circular;
  assert.throws(() => sanitizeOutboxPayload(circular), /circular references/);
  assert.throws(() => sanitizeOutboxPayload({ bad: Number.NaN }), /non-finite/);
  for (const key of ['refresh_token', 'mfaSecret', 'sessionCookie', 'primaryDatabaseUrl']) {
    assert.equal(isSensitiveOutboxKey(key), true, key);
  }
});
