import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Procurement requests Supplier Payables read access only for settlement values', async () => {
  const page = await read('apps/web/src/features/procurement/pages/procurement-page.tsx');
  assert.match(page, /usePermission\('supplier_payables\.read'\)/);
  assert.match(page, /canReadSupplierPayables=\{canReadSupplierPayables\}/);
});

test('Procurement loads every PO page and every project Supplier Invoice page', async () => {
  const procurementApi = await read('apps/web/src/features/procurement/api/procurement-api.ts');
  const supplierApi = await read('apps/web/src/features/supplier-payables/api/supplier-payables-api.ts');
  assert.match(procurementApi, /export async function listAllPurchaseOrders\(projectId: string\)/);
  assert.match(procurementApi, /for \(let page = 2; items\.length < firstPage\.total; page \+= 1\)/);
  assert.match(supplierApi, /export async function listAllSupplierInvoices/);
  assert.match(supplierApi, /for \(let page = 2; items\.length < firstPage\.total; page \+= 1\)/);
});

test('Goods Receipt register joins invoices by goodsReceiptId and displays paid and remaining amounts', async () => {
  const workspace = await read('apps/web/src/features/procurement/components/procurement-workspace.tsx');
  assert.match(workspace, /purchaseOrder\.goodsReceipts\.map\(\(receipt\) => \(\{ purchaseOrder, receipt \}\)\)/);
  assert.match(workspace, /grouped\.get\(invoice\.goodsReceiptId\)/);
  assert.match(workspace, /sumInvoiceMoney\(linkedInvoices, 'allocatedAmount'\)/);
  assert.match(workspace, /receiptMinorUnits - paidMinorUnits/);
  assert.match(workspace, /invoice\.outstandingAmount/);
  assert.match(workspace, /<th>Goods receipt<\/th>.*<th>Invoiced<\/th>.*<th>Paid<\/th>.*<th>Remaining<\/th>/s);
});

test('Supplier settlement values remain permission-gated in Procurement', async () => {
  const workspace = await read('apps/web/src/features/procurement/components/procurement-workspace.tsx');
  assert.match(workspace, /!props\.canReadSupplierPayables \? 'Restricted'.*invoicedMinorUnits/s);
  assert.match(workspace, /Supplier Payables read permission required\./);
});

test('Backend read models already expose the authoritative receipt and posted-payment settlement sources', async () => {
  const procurementService = await read('apps/api/src/modules/procurement/procurement.service.ts');
  const supplierService = await read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
  const supplierRepository = await read('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts');
  assert.match(procurementService, /goodsReceipts: row\.goodsReceipts\.map/);
  assert.match(procurementService, /receivedAmount: goodsReceiptAmount\(receipt\.items\)/);
  assert.match(supplierService, /goodsReceiptId: row\.goodsReceiptId/);
  assert.match(supplierService, /allocatedAmount: minorUnitsToMoney\(allocatedMinorUnits\)/);
  assert.match(supplierService, /outstandingAmount: minorUnitsToMoney\(outstandingMinorUnits\)/);
  assert.match(supplierRepository, /allocations:\s*\{\s*where: \{ supplierPayment: \{ status: 'POSTED' \} \}/s);
});
