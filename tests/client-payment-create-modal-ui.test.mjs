import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one project file used by the focused Client Payment modal regression checks. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('Client New Payment uses an upper-right action and opens the existing receipt form in a modal', () => {
  const page = read('apps/web/src/features/client-receipts/pages/client-receipts-page.tsx');
  const workspace = read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  const styles = read('apps/web/src/styles.css');

  assert.match(page, /client-payment-page-heading/);
  assert.match(page, /client-payment-new-button/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, />New payment<\/button>/);
  assert.match(page, /createModalOpen=\{createPaymentOpen\}/);

  assert.match(workspace, /props\.createModalOpen/);
  assert.match(workspace, /role="dialog"/);
  assert.match(workspace, /aria-labelledby="client-payment-create-title"/);
  assert.match(workspace, /client-payment-create-grid/);
  for (const label of [
    'Client',
    'Project',
    'Stage (optional)',
    'Receipt date',
    'Amount',
    'Payment method',
    'Cash / Bank account',
    'Pending Client Invoice (optional)',
    'Reference (optional)',
    'Payment evidence (optional)'
  ]) assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(workspace, /Create & post receipt/);
  assert.match(workspace, /closeCreateReceiptModal\(\)/);

  assert.match(styles, /\.client-payment-page-heading\s*\{[^}]*justify-content:\s*space-between/s);
  assert.match(styles, /\.client-payment-create-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.client-payment-create-grid\s*\{[^}]*grid-template-columns:\s*1fr/s);
});

test('Client New Payment keeps the existing backend receipt contract unchanged', () => {
  const routes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
  const schema = read('apps/api/src/modules/client-receipts/client-receipts.schema.ts');
  const service = read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
  const repository = read('apps/api/src/modules/client-receipts/client-receipts.repository.ts');

  assert.match(routes, /app\.post\('\/api\/v1\/client-receipts'/);
  assert.match(schema, /createClientReceiptBodySchema/);
  assert.match(service, /async createClientReceipt\(/);
  assert.match(repository, /async createClientReceipt\(/);
});
