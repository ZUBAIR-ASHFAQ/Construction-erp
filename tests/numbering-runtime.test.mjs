import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NUMBER_SEQUENCE_LIMITS,
  normalizeNumberSequenceDefinition,
  normalizeSequenceKey,
} from '../packages/numbering/dist/definition.js';
import {
  NUMBER_SEQUENCE_FORMAT_LIMITS,
  formatAllocatedNumber,
} from '../packages/numbering/dist/format.js';

test('number sequence definition normalizes safe defaults', () => {
  const value = normalizeNumberSequenceDefinition({ sequenceKey: 'purchase-order' });
  assert.deepEqual(value, {
    sequenceKey: 'purchase-order',
    prefix: '',
    suffix: '',
    padWidth: 6,
    nextValue: 1n,
    incrementBy: 1n,
    status: 'ACTIVE',
  });
});

test('namespaced keys and configured formatting are supported deterministically', () => {
  const value = normalizeNumberSequenceDefinition({
    sequenceKey: 'finance.client-invoice',
    prefix: 'INV-',
    suffix: '-A',
    padWidth: 8,
    nextValue: 42n,
    incrementBy: 2n,
  });
  assert.equal(value.sequenceKey, 'finance.client-invoice');
  assert.equal(formatAllocatedNumber(value.nextValue, value.prefix, value.suffix, value.padWidth), 'INV-00000042-A');
});

test('sequence validation rejects unsafe or invalid values', () => {
  for (const key of ['PurchaseOrder', ' purchase order ', '.invoice', 'invoice.', 'a..b']) {
    assert.throws(() => normalizeSequenceKey(key));
  }
  assert.throws(() => normalizeNumberSequenceDefinition({ sequenceKey: 'po', prefix: 'x\n' }), /control characters/);
  assert.throws(() => normalizeNumberSequenceDefinition({ sequenceKey: 'po', padWidth: 0 }), /padWidth/);
  assert.throws(() => normalizeNumberSequenceDefinition({ sequenceKey: 'po', nextValue: 0n }), /nextValue/);
  assert.throws(() => normalizeNumberSequenceDefinition({ sequenceKey: 'po', incrementBy: 0n }), /incrementBy/);
});

test('formatting pads small values but never truncates larger allocated values', () => {
  assert.equal(formatAllocatedNumber(7n, 'PO-', '', 5), 'PO-00007');
  assert.equal(formatAllocatedNumber(123456n, 'PO-', '', 5), 'PO-123456');
});

test('published implementation limits are stable and bounded', () => {
  assert.equal(NUMBER_SEQUENCE_LIMITS.maxAffixLength, 40);
  assert.equal(NUMBER_SEQUENCE_LIMITS.maxPadWidth, 20);
  assert.equal(NUMBER_SEQUENCE_LIMITS.postgresBigIntMax, 9_223_372_036_854_775_807n);
  assert.equal(NUMBER_SEQUENCE_FORMAT_LIMITS.maxFormattedLength, 128);
});
