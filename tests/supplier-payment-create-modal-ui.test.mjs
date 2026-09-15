import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('Supplier New Payment page opens the existing payment form in the shared professional modal', () => {
  const page = read('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const styles = read('apps/web/src/styles.css');

  assert.match(page, /initialTab === 'payments' && canCreatePayment/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, />New payment<\/button>/);
  assert.match(page, /createPaymentModalOpen=\{initialTab === 'payments' && createPaymentOpen\}/);
  assert.match(page, /onCloseCreatePaymentModal=\{\(\) => setCreatePaymentOpen\(false\)\}/);

  assert.match(workspace, /props\.initialTab === 'payments' && props\.canCreatePayment && props\.createPaymentModalOpen/);
  assert.match(workspace, /aria-labelledby="supplier-payment-create-title"/);
  assert.match(workspace, /finance-modal finance-modal-wide client-payment-create-modal/);
  assert.match(workspace, /className="client-payment-create-grid"/);
  for (const label of ['Vendor', 'Project (optional)', 'Invoice (optional)', 'Payment date', 'Payment amount (partial or full)', 'Cash / Bank account', 'Reference (optional)']) {
    assert.ok(workspace.includes(label), `missing payment field ${label}`);
  }
  assert.match(workspace, /closeCreatePaymentModal\(\)/);
  assert.match(workspace, /paymentForm\.reset\(EMPTY_PAYMENT_FORM\)/);
  assert.match(workspace, /props\.onCloseCreatePaymentModal\(\)/);
  assert.match(workspace, /setSelectedPayment\(Number\(created\.remainingAmount\) > 0 \? created : null\);\s*closeCreatePaymentModal\(\);/);
  assert.match(workspace, /onMouseDown=\{\(event\) => \{ if \(event\.target === event\.currentTarget\) closeCreatePaymentModal\(\); \}\}/);
  assert.match(workspace, /event\.key === 'Escape'/);
  assert.match(workspace, /props\.canCreatePayment && props\.initialTab !== 'payments'/);

  assert.match(styles, /\.client-payment-create-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.client-payment-create-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
