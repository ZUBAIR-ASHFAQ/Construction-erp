import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Extract one Prisma model block for focused dependency checks. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start; index < schema.length; index += 1) {
    if (schema[index] === '{') depth += 1;
    if (schema[index] === '}') {
      depth -= 1;
      if (depth === 0) return schema.slice(start, index + 1);
    }
  }
  return '';
}

/** Confirm the B16.1 audit boundary remains intact through the approved B16.2-B16.5 passes. */
test('B16.1 baseline remains intact through B16.5 Supplier Invoice service work', () => {
  assert.equal(exists('docs/PASS-B16-1-FINAL21-SUPPLIER-PAYABLES-BASELINE-AUDIT.md'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.schema.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['SupplierInvoice', 'SupplierInvoiceLine', 'SupplierPayment', 'SupplierPaymentAllocation']) {
    assert.match(prisma, new RegExp(`model ${model}\\b`));
  }
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.includes('20260829002100_final21_supplier_payables'), true);
  assert.equal(migrations.includes('20260829002200_final21_supplier_payables_contract'), true);
});

/** Confirm every hard Final-21 Supplier Payables prerequisite is active before B16.2. */
test('B16.1 confirms Vendor Procurement Finance Budget and Site Expense predecessor modules are registered', () => {
  const app = read('apps/api/src/app.ts');
  for (const registration of [
    'registerVendorsSubcontractorsRoutes',
    'registerProcurementRoutes',
    'registerFinanceRoutes',
    'registerBudgetsJobCostRoutes',
    'registerSiteExpensesRoutes'
  ]) {
    assert.ok(app.includes(registration), `missing prerequisite ${registration}`);
  }
  assert.equal(app.includes('registerSupplierPayablesRoutes'), true);
});

/** Confirm Vendor master is the only active supplier identity B16 must reference. */
test('B16.1 confirms Vendor master provides company-scoped supplier ownership', () => {
  const vendor = prismaModel('Vendor');
  const repository = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  assert.match(vendor, /companyId\s+String/);
  assert.match(vendor, /@@unique\(\[id, companyId\]/);
  assert.match(vendor, /@@unique\(\[companyId, code\]/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /async findVendorById\(vendorId: string\)/);
});

/** Confirm Procurement exposes the PO and receipt ownership data required for AP matching. */
test('B16.1 confirms Procurement is ready for Supplier Invoice PO and Goods Receipt matching', () => {
  const purchaseOrder = prismaModel('PurchaseOrder');
  const purchaseOrderItem = prismaModel('PurchaseOrderItem');
  const goodsReceipt = prismaModel('GoodsReceipt');
  const repository = read('apps/api/src/modules/procurement/procurement.repository.ts');
  assert.match(purchaseOrder, /projectId\s+String/);
  assert.match(purchaseOrder, /vendorId\s+String/);
  assert.match(purchaseOrder, /@@unique\(\[id, companyId, projectId\]/);
  assert.match(purchaseOrderItem, /invoicedAmount\s+Decimal/);
  assert.match(goodsReceipt, /vendorId\s+String/);
  assert.match(goodsReceipt, /purchaseOrderId\s+String/);
  assert.match(goodsReceipt, /project\s+Project\s+@relation\(fields: \[projectId, companyId\]/);
  assert.match(repository, /async findPurchaseOrderById\(purchaseOrderId: string, visibility: ProjectVisibility\)/);
  assert.match(repository, /async findGoodsReceiptById\(goodsReceiptId: string, visibility: ProjectVisibility\)/);
});

/** Confirm Finance already provides the atomic source-posting and Cash/Bank ownership seams. */
test('B16.1 confirms Finance is ready for AP invoice and supplier payment posting', () => {
  const finance = read('apps/api/src/modules/finance/finance.service.ts');
  const cashBank = prismaModel('CashBankAccount');
  assert.match(finance, /async postSourceJournalInTransaction\(tx: TransactionClient/);
  assert.match(finance, /sourceKey: string/);
  assert.match(finance, /JOURNAL_UNBALANCED/);
  assert.match(cashBank, /companyId\s+String/);
  assert.match(cashBank, /glAccountId\s+String/);
  assert.match(cashBank, /@@unique\(\[id, companyId\]/);
});

/** Confirm Project Cost supports source-keyed policy-controlled Supplier Payables integration. */
test('B16.1 confirms Project Cost is source-keyed and has final categories needed to avoid AP double counting', () => {
  const budgetSchema = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts');
  const commitment = prismaModel('CostCommitment');
  const actual = prismaModel('CostActual');
  for (const category of ["'material'", "'subcontract'", "'other'"]) assert.ok(budgetSchema.includes(category));
  assert.match(commitment, /sourceKey\s+String/);
  assert.match(commitment, /@@unique\(\[companyId, sourceKey\]/);
  assert.match(actual, /sourceKey\s+String/);
  assert.match(actual, /@@unique\(\[companyId, sourceKey\]/);
});

/** Confirm Foundation can generate supplier payment numbers without inventing a second numbering system. */
test('B16.1 confirms Foundation numbering already reserves supplier-payment', () => {
  const numbering = read('packages/numbering/src/types.ts');
  assert.match(numbering, /'supplier-payment'/);
  assert.match(numbering, /FOUNDATION_REQUIRED_SEQUENCE_KEYS/);
});

/** Confirm Documents core remains available and the later approved B16.8 Supplier Invoice link integration is present. */
test('B16.1 Documents prerequisite remains valid after the approved B16.8 Supplier Invoice integration', () => {
  const documents = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  assert.match(documents, /DOCUMENT_LINK_RESOURCE_TYPES/);
  assert.match(documents, /'site_expense'/);
  assert.match(documents, /'supplier_invoice'/);
});

/** Confirm the audit freezes the exact four-table B16.2 handoff and AP invariants. */
test('B16.1 hands off only the four required Supplier Payables persistence models to B16.2', () => {
  const audit = read('docs/PASS-B16-1-FINAL21-SUPPLIER-PAYABLES-BASELINE-AUDIT.md');
  assert.match(audit, /B16\.2 - add the Final-21 `supplier_invoices`, `supplier_invoice_lines`, `supplier_payments`, and `supplier_payment_allocations` Prisma models plus one forward migration/i);
  assert.match(audit, /No Supplier Payables runtime, API, UI, or database migration is intentionally implemented here/i);
  assert.match(audit, /Supplier payable = posted invoice - allocated payments\/credits/i);
  assert.match(audit, /must not blindly create a second Project cost/i);
  assert.match(audit, /supplier-payment/);
});
