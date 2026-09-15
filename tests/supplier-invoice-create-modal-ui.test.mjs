import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('Supplier Invoices page opens the complete existing invoice flow in the shared professional modal', () => {
  const page = read('apps/web/src/features/supplier-payables/pages/supplier-payables-page.tsx');
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  const styles = read('apps/web/src/styles.css');

  assert.match(page, /initialTab === 'invoices' && canCreateInvoice/);
  assert.match(page, /aria-haspopup="dialog"/);
  assert.match(page, />New invoice<\/button>/);
  assert.match(page, /createInvoiceModalOpen=\{initialTab === 'invoices' && createInvoiceOpen\}/);
  assert.match(page, /onCloseCreateInvoiceModal=\{\(\) => setCreateInvoiceOpen\(false\)\}/);

  assert.match(workspace, /props\.initialTab === 'invoices' && props\.canCreateInvoice && props\.createInvoiceModalOpen/);
  assert.match(workspace, /aria-labelledby="supplier-invoice-create-title"/);
  assert.match(workspace, /finance-modal finance-modal-wide client-payment-create-modal/);
  assert.match(workspace, /className="client-payment-create-grid"/);
  for (const label of [
    'Vendor',
    'Project',
    'Supplier invoice no.',
    'Invoice date',
    'Due date (optional)',
    'Purchase Order (optional)',
    'Goods Receipt (optional)',
    'Tax amount',
    'Supplier invoice image / PDF (required)',
    'Description',
    'Amount'
  ]) {
    assert.ok(workspace.includes(label), `missing invoice field ${label}`);
  }
  assert.match(workspace, />Add line<\/button>/);
  assert.match(workspace, /Remove line/);
  assert.match(workspace, /closeCreateInvoiceModal\(\)/);
  assert.match(workspace, /invoiceForm\.reset\(EMPTY_INVOICE_FORM\)/);
  assert.match(workspace, /setInvoiceImage\(null\)/);
  assert.match(workspace, /props\.onCloseCreateInvoiceModal\(\)/);
  assert.match(workspace, /if \(props\.initialTab === 'invoices'\) props\.onCloseCreateInvoiceModal\(\);/);
  assert.match(workspace, /onMouseDown=\{\(event\) => \{ if \(event\.target === event\.currentTarget\) closeCreateInvoiceModal\(\); \}\}/);
  assert.match(workspace, /event\.key === 'Escape'/);
  assert.match(workspace, /props\.canCreateInvoice && props\.initialTab !== 'invoices'/);

  assert.match(styles, /\.client-payment-create-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?\.client-payment-create-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});
