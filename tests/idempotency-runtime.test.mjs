import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprintRequest, isSensitiveFingerprintKey } from '../packages/idempotency/dist/fingerprint.js';
import {
  IDEMPOTENCY_REPLAY_BINARY_OMITTED,
  IDEMPOTENCY_REPLAY_REDACTED,
  sanitizeReplayBody,
} from '../packages/idempotency/dist/sanitize.js';

test('fingerprint is stable across object key order and changes with semantic input', () => {
  const a = fingerprintRequest({ amount: 10, lines: [{ code: 'A', qty: 2 }], memo: 'x' });
  const b = fingerprintRequest({ memo: 'x', lines: [{ qty: 2, code: 'A' }], amount: 10 });
  const c = fingerprintRequest({ memo: 'x', lines: [{ qty: 3, code: 'A' }], amount: 10 });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test('fingerprint rejects secret-like, binary and circular inputs', () => {
  assert.throws(() => fingerprintRequest({ accessToken: 'secret' }), /Sensitive field/);
  assert.throws(() => fingerprintRequest({ bytes: new Uint8Array([1, 2]) }), /Binary data/);
  const circular = {};
  circular.self = circular;
  assert.throws(() => fingerprintRequest(circular), /circular references/);
  for (const key of ['passwordHash', 'refresh_token', 'mfaSecret', 'authorization']) {
    assert.equal(isSensitiveFingerprintKey(key), true, key);
  }
});

test('replay sanitizer returns a persistable safe representation', () => {
  const safe = sanitizeReplayBody({
    data: { id: '123', total: 42.5 },
    accessToken: 'never-store-me',
    nested: { api_key: 'secret', ok: true },
    createdAt: new Date('2026-08-22T10:00:00.000Z'),
    attachment: new Uint8Array([1, 2, 3]),
    failure: new Error('DATABASE_URL=postgres://secret'),
  });
  assert.deepEqual(safe, {
    data: { id: '123', total: 42.5 },
    accessToken: IDEMPOTENCY_REPLAY_REDACTED,
    nested: { api_key: IDEMPOTENCY_REPLAY_REDACTED, ok: true },
    createdAt: '2026-08-22T10:00:00.000Z',
    attachment: IDEMPOTENCY_REPLAY_BINARY_OMITTED,
    failure: { name: 'Error' },
  });
});
