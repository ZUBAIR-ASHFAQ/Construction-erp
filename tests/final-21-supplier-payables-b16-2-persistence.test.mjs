import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MIGRATION = 'packages/database/prisma/migrations/20260829002100_final21_supplier_payables/migration.sql';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Extract one Prisma model block for focused persistence assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm B16.2 persistence remains intact while the approved B16.3-B16.5 layers are added. */
test('B16.2 keeps four Supplier Payables models through B16.5 service work', () => {
  for (const model of ['SupplierInvoice', 'SupplierInvoiceLine', 'SupplierPayment', 'SupplierPaymentAllocation']) {
    assert.ok(prismaModel(model), `missing ${model}`);
  }
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.schema.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(exists(MIGRATION), true);
});

/** Confirm Supplier Invoice matches the controlling Final-21 persistence fields and exact money types. */
test('B16.2 stores the required Supplier Invoice fields with vendor invoice uniqueness', () => {
  const model = prismaModel('SupplierInvoice');
  for (const field of ['companyId', 'vendorId', 'projectId', 'invoiceNo', 'invoiceDate', 'status', 'subtotal', 'taxAmount', 'totalAmount']) {
    assert.match(model, new RegExp(`\\b${field}\\s+`), `missing ${field}`);
  }
  for (const optional of ['dueDate', 'purchaseOrderId', 'goodsReceiptId']) {
    assert.match(model, new RegExp(`\\b${optional}\\s+[^\\n]*\\?`), `missing optional ${optional}`);
  }
  assert.match(model, /subtotal\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(model, /taxAmount\s+Decimal\s+@map\("tax_amount"\) @db\.Decimal\(18, 2\)/);
  assert.match(model, /totalAmount\s+Decimal\s+@map\("total_amount"\) @db\.Decimal\(18, 2\)/);
  assert.match(model, /@@unique\(\[companyId, vendorId, invoiceNo\]/);
  assert.doesNotMatch(model, /outstanding|payableBalance|journalId|costActualId/);
});

/** Confirm Supplier Invoice persistence uses existing Vendor, Project and Procurement ownership. */
test('B16.2 enforces Supplier Invoice company vendor project PO and goods receipt scope', () => {
  const invoice = prismaModel('SupplierInvoice');
  const po = prismaModel('PurchaseOrder');
  const receipt = prismaModel('GoodsReceipt');
  assert.match(invoice, /vendor\s+Vendor\s+@relation\(fields: \[vendorId, companyId\], references: \[id, companyId\]/);
  assert.match(invoice, /project\s+Project\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(invoice, /purchaseOrder\s+PurchaseOrder\?\s+@relation\(fields: \[purchaseOrderId, companyId, projectId, vendorId\], references: \[id, companyId, projectId, vendorId\]/);
  assert.match(invoice, /goodsReceipt\s+GoodsReceipt\?\s+@relation\(fields: \[goodsReceiptId, companyId, projectId, vendorId\], references: \[id, companyId, projectId, vendorId\]/);
  assert.match(po, /@@unique\(\[id, companyId, projectId, vendorId\]/);
  assert.match(receipt, /@@unique\(\[id, companyId, projectId, vendorId\]/);
});

/** Confirm invoice lines remain simple and carry only the approved optional Stage/Finance dimensions. */
test('B16.2 stores Supplier Invoice lines without duplicating invoice company or project totals', () => {
  const model = prismaModel('SupplierInvoiceLine');
  assert.match(model, /supplierInvoiceId\s+String/);
  assert.match(model, /stageId\s+String\?/);
  assert.match(model, /description\s+String/);
  assert.match(model, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(model, /expenseOrInventoryAccountId\s+String\?/);
  assert.match(model, /supplierInvoice\s+SupplierInvoice\s+@relation/);
  assert.match(model, /stage\s+ProjectStage\?/);
  assert.match(model, /expenseOrInventoryAccount\s+GlAccount\?/);
  assert.doesNotMatch(model, /companyId|projectId|costActualId|outstanding/);
});

/** Confirm Supplier Payment owns only AP payment persistence and Finance Cash/Bank linkage. */
test('B16.2 stores company-numbered Supplier Payments with optional Project and same-company Cash Bank ownership', () => {
  const model = prismaModel('SupplierPayment');
  for (const field of ['companyId', 'vendorId', 'paymentNo', 'paymentDate', 'amount', 'cashBankAccountId', 'status']) {
    assert.match(model, new RegExp(`\\b${field}\\s+`), `missing ${field}`);
  }
  assert.match(model, /projectId\s+String\?/);
  assert.match(model, /reference\s+String\?/);
  assert.match(model, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(model, /vendor\s+Vendor\s+@relation\(fields: \[vendorId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /project\s+Project\?\s+@relation\(fields: \[projectId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /cashBankAccount\s+CashBankAccount\s+@relation\(fields: \[cashBankAccountId, companyId\], references: \[id, companyId\]/);
  assert.match(model, /@@unique\(\[companyId, paymentNo\]/);
  assert.doesNotMatch(model, /availableAmount|payableBalance|journalId/);
});

/** Confirm allocation history is source data rather than a manually stored Supplier balance. */
test('B16.2 stores append-oriented Supplier Payment allocations with precise positive money', () => {
  const model = prismaModel('SupplierPaymentAllocation');
  assert.match(model, /supplierPaymentId\s+String/);
  assert.match(model, /supplierInvoiceId\s+String/);
  assert.match(model, /amount\s+Decimal\s+@db\.Decimal\(18, 2\)/);
  assert.match(model, /allocatedAt\s+DateTime/);
  assert.match(model, /supplierPayment\s+SupplierPayment\s+@relation/);
  assert.match(model, /supplierInvoice\s+SupplierInvoice\s+@relation/);
  assert.doesNotMatch(model, /outstanding|remaining|balance/);
});

/** Confirm one forward migration creates only the four required AP tables plus supporting ownership indexes. */
test('B16.2 migration creates four Supplier Payables tables with hard money and ownership constraints', () => {
  const migration = read(MIGRATION);
  assert.equal((migration.match(/CREATE TABLE /g) ?? []).length, 4);
  for (const table of ['supplier_invoices', 'supplier_invoice_lines', 'supplier_payments', 'supplier_payment_allocations']) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(migration, /supplier_invoices_company_vendor_invoice_no_uq/);
  assert.match(migration, /supplier_invoice_lines_amount_positive" CHECK \("amount" > 0\)/);
  assert.match(migration, /supplier_payments_amount_positive" CHECK \("amount" > 0\)/);
  assert.match(migration, /supplier_payment_allocations_amount_positive" CHECK \("amount" > 0\)/);
  assert.match(migration, /FOREIGN KEY \("purchase_order_id", "company_id", "project_id", "vendor_id"\)/);
  assert.match(migration, /FOREIGN KEY \("goods_receipt_id", "company_id", "project_id", "vendor_id"\)/);
  assert.match(migration, /FOREIGN KEY \("cash_bank_account_id", "company_id"\) REFERENCES "cash_bank_accounts"/);
  assert.doesNotMatch(migration, /INSERT INTO "permissions"|CREATE TRIGGER|CREATE FUNCTION/);
});

/** Confirm migration policy locks B16.2 without changing historical migration history. */
test('B16.2 registers one new forward migration in gate and checksum manifests', () => {
  const gates = read('packages/database/prisma/migration-gates.json');
  const checksums = read('packages/database/prisma/migration-checksums.json');
  assert.match(gates, /final-21-pass-b16-2-supplier-payables-persistence/);
  assert.match(gates, /20260829002100_final21_supplier_payables/);
  assert.match(checksums, /20260829002100_final21_supplier_payables/);
});

/** Confirm B16.2 documents service-enforced cross-row invariants instead of inventing duplicate persistence fields. */
test('B16.2 hands off request schemas permissions errors and cross-row validation to B16.3 plus later service passes', () => {
  const doc = read('docs/PASS-B16-2-FINAL21-SUPPLIER-PAYABLES-PERSISTENCE.md');
  assert.match(doc, /B16\.3 - add Supplier Payables Zod boundary schemas, stable permissions and stable error vocabulary only/i);
  assert.match(doc, /does not add Zod schemas, repositories, services, Fastify routes, permissions, React UI/i);
  assert.match(doc, /Goods Receipt.*referenced Purchase Order.*service/is);
  assert.match(doc, /Stage.*Supplier Invoice Project.*service/is);
  assert.match(doc, /allocation.*same Company and Vendor.*service/is);
});
