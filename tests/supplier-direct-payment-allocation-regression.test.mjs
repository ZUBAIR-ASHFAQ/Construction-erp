import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
function read(path) { return readFileSync(new URL(path, ROOT), 'utf8'); }

test('direct Supplier Payment allocation refreshes every directly derived payable read model', () => {
  const hooks = read('apps/web/src/features/supplier-payables/hooks/supplier-payables.ts');
  for (const key of [
    "['module-17', 'supplier-payables']",
    "['vendors-subcontractors']",
    "['module-6', 'projects']",
    "['module-19', 'project-profitability']",
    "['module-1', 'dashboard']"
  ]) assert.ok(hooks.includes(key), `missing dependent query key ${key}`);
  assert.match(hooks, /useAllocateSupplierPayment[\s\S]*onSuccess: async \(\) => refreshSupplierPayableReads\(queryClient\)/);
});

test('direct-payment UI exposes pending invoices and keeps a partial payment selected after allocation', () => {
  const workspace = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.match(workspace, /Direct payment \(no invoice\)/);
  assert.match(workspace, /setSelectedPayment\(Number\(created\.remainingAmount\) > 0 \? created : null\)/);
  assert.match(workspace, /const allocationInvoicesQuery = useSupplierInvoices/);
  assert.match(workspace, /props\.canRead && watchedPaymentVendorId !== ''/);
  assert.doesNotMatch(workspace, /props\.canRead && watchedPaymentVendorId !== '' && watchedPaymentProjectId !== ''/);
  assert.match(workspace, /status: 'POSTED'/);
  assert.match(workspace, /filter\(\(invoice\) => Number\(invoice\.outstandingAmount\) > 0\)/);
  assert.match(workspace, /<label>Pending invoice/);
  assert.match(workspace, /allocatePayment\.mutateAsync\(\{ allocations: \[\{ supplierInvoiceId: values\.supplierInvoiceId, amount: values\.amount \}\] \}\)/);
  assert.match(workspace, /const refreshedPayments = await paymentQuery\.refetch\(\)/);
  assert.match(workspace, /setSelectedPayment\(refreshedPayment && Number\(refreshedPayment\.remainingAmount\) > 0 \? refreshedPayment : null\)/);
});

test('backend allocation remains append-only and invoice balances remain allocation-derived', () => {
  const service = read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const repository = read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  assert.match(service, /createSupplierPaymentAllocations\(paymentId, input\.allocations/);
  assert.match(repository, /supplierPaymentAllocation\.create\(/);
  assert.match(repository, /allocations:[\s\S]*supplierPayment: \{ status: 'POSTED' \}/);
  assert.match(service, /alreadyAllocatedPayment \+ requestedPayment > paymentAmount/);
  assert.match(service, /alreadyAllocatedInvoice \+ requestedInvoice > moneyToMinorUnits\(invoice\.totalAmount\)/);
  assert.match(service, /const remainingPayment = minorUnitsToMoney\(paymentAmount - alreadyAllocatedPayment - requestedPayment\)/);
  assert.match(service, /allocatedAmount: minorUnitsToMoney\(allocatedMinorUnits\)/);
  assert.match(service, /outstandingAmount: minorUnitsToMoney\(outstandingMinorUnits\)/);
  const allocationBlock = service.match(/private async allocateSupplierPaymentOnce[\s\S]*?\/\*\* Return bounded Supplier aging/)?.[0] ?? '';
  assert.doesNotMatch(allocationBlock, /postSourceJournalInTransaction/);
});
