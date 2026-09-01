import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResourceReference,
  createDocumentReference,
  createDocumentVersionReference,
  createFinancialPostingCommand,
  createStableSourceKey,
  normalizeDecimalString,
  serializeStableSourceKey,
  validateIntegrationProjectScope
} from '../packages/contracts/dist/index.js';

test('stable source key normalization is deterministic and distinguishes line identity', () => {
  const base = createStableSourceKey({ sourceModule: 'Purchase-Orders', sourceType: 'PO', sourceId: 'abc-123' });
  const line = createStableSourceKey({ sourceModule: 'purchase-orders', sourceType: 'po', sourceId: 'abc-123', sourceLineId: 'line-1' });
  assert.equal(base.sourceModule, 'purchase-orders');
  assert.equal(base.sourceType, 'po');
  assert.notEqual(serializeStableSourceKey(base), serializeStableSourceKey(line));
  assert.equal(serializeStableSourceKey(base), serializeStableSourceKey(createStableSourceKey({ sourceModule: 'purchase-orders', sourceType: 'po', sourceId: 'abc-123' })));
});

test('generic resource reference normalizes type while preserving resource identity', () => {
  assert.deepEqual(createResourceReference('Purchase-Order', ' 123e4567-e89b-12d3-a456-426614174000 '), {
    resourceType: 'purchase-order',
    resourceId: '123e4567-e89b-12d3-a456-426614174000'
  });
});

test('document references support document and immutable version targets', () => {
  assert.deepEqual(createDocumentReference('doc-1'), { schemaVersion: 1, kind: 'document', documentId: 'doc-1' });
  assert.deepEqual(createDocumentVersionReference('doc-1', 'ver-2'), {
    schemaVersion: 1,
    kind: 'document-version',
    documentId: 'doc-1',
    versionId: 'ver-2'
  });
});

test('financial command uses normalized decimal strings without floating point conversion', () => {
  const command = createFinancialPostingCommand({
    sourceKey: { sourceModule: 'payroll', sourceType: 'payroll-run', sourceId: 'run-1' },
    postingDate: '2026-08-22',
    currency: 'usd',
    description: 'Payroll posting',
    lines: [
      { lineKey: 'expense', accountId: 'acct-1', debit: '1000.5000', credit: '0', projectId: 'project-1' },
      { lineKey: 'payable', accountId: 'acct-2', debit: '0.00', credit: '1000.5' }
    ]
  });
  assert.equal(command.currency, 'USD');
  assert.equal(command.lines[0]?.debit, '1000.5');
  assert.equal(command.lines[1]?.credit, '1000.5');
  assert.equal(command.lines[0]?.dimensions.projectId, 'project-1');
  assert.equal(command.sourceKey.sourceModule, 'payroll');
});

test('financial command rejects number-like invalid strings and malformed line sides', () => {
  assert.throws(() => normalizeDecimalString('1e3', 'amount'), /decimal string/);
  assert.throws(() => normalizeDecimalString('-1', 'amount'), /decimal string/);
  assert.throws(() => createFinancialPostingCommand({
    sourceKey: { sourceModule: 'finance', sourceType: 'test', sourceId: 'x' },
    postingDate: '2026-02-30',
    currency: 'USD',
    lines: [
      { lineKey: 'a', accountId: '1', debit: '1', credit: '0' },
      { lineKey: 'b', accountId: '2', debit: '1', credit: '1' }
    ]
  }), /valid calendar date|exactly one/);
});

test('restricted event project scope is normalized and deduplicated', () => {
  assert.deepEqual(validateIntegrationProjectScope({ kind: 'restricted', projectIds: ['p1', 'p1', 'p2'] }), {
    kind: 'restricted',
    projectIds: ['p1', 'p2']
  });
  assert.throws(() => validateIntegrationProjectScope({ kind: 'restricted', projectIds: [] }), /at least one/);
});
