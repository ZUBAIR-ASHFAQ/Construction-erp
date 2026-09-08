import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('creating a Client Receipt does not automatically open the detail dialog', () => {
  const workspace = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  const submitBody = workspace.slice(workspace.indexOf('async function submitReceipt('), workspace.indexOf('/** Open the correction dialog'));
  assert.doesNotMatch(submitBody, /setSelectedReceiptId\(created\.id\)/);
  assert.match(workspace, /onClick=\{\(\) => openReceiptDetails\(receipt\.id\)\}>View/);
});

test('posted Client Receipt rows expose an Edit dialog with all payment fields', () => {
  const workspace = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  assert.match(workspace, /openReceiptEditor\(receipt\)/);
  assert.match(workspace, /Edit \{editingReceipt\.receiptNo\}/);
  for (const field of ['clientId', 'projectId', 'stageId', 'receiptDate', 'amount', 'paymentMethod', 'cashBankAccountId', 'clientInvoiceId', 'reference']) {
    assert.match(workspace, new RegExp(`editForm\\.register\\('${field}'`), `missing editable ${field}`);
  }
  assert.match(workspace, /Replacement evidence \(optional\)/);
});

test('Client Receipt corrections are one idempotent server transaction with compensating accounting', () => {
  const schema = read('apps/api/src/modules/client-receipts/client-receipts.schema.ts');
  const routes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
  const service = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  assert.match(schema, /client-receipts\/:id\/correct/);
  assert.match(routes, /operationId: 'correctClientReceipt'/);
  assert.match(service, /operation: 'client-receipts\.correct'/);
  const correction = service.slice(service.indexOf('private async correctClientReceiptOnce'), service.indexOf('/** Compensate the allocation Journal'));
  assert.match(correction, /unallocateClientReceiptOnce/);
  assert.match(correction, /reverseClientReceiptOnce/);
  assert.match(correction, /createClientReceiptOnce/);
  assert.ok(correction.indexOf('unallocateClientReceiptOnce') < correction.indexOf('reverseClientReceiptOnce'));
  assert.ok(correction.indexOf('reverseClientReceiptOnce') < correction.indexOf('createClientReceiptOnce'));
  assert.match(correction, /client_receipt\.corrected/);
});
