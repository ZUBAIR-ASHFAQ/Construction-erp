import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SERVICE = 'apps/api/src/modules/supplier-payables/supplier-payables.service.ts';
const REPOSITORY = 'apps/api/src/modules/supplier-payables/supplier-payables.repository.ts';

/** Read one project file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one project path exists. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B16.5 adds only the Supplier Invoice service slice while HTTP Payment UI and migration work stay deferred. */
test('B16.5 adds Supplier Invoice service without premature HTTP Payment React or migration work', () => {
  assert.equal(exists(SERVICE), true);
  assert.equal(exists(REPOSITORY), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/index.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(exists('docs/PASS-B16-5-FINAL21-SUPPLIER-INVOICE-SERVICE.md'), true);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b16[_-]?5|supplier_invoice_service/i.test(name)), false);
});

/** Confirm Supplier Invoice read/create/post permissions are revalidated from Administration and authenticated Project scope. */
test('B16.5 revalidates Supplier Invoice permissions and Project visibility server-side', () => {
  const service = read(SERVICE);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodes\(/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /supplier_payables\.read/);
  assert.match(service, /supplier_invoices\.create/);
  assert.match(service, /supplier_invoices\.post/);
  assert.doesNotMatch(service, /companyId:\s*input\.companyId|allowedProjectIds:\s*input\.allowedProjectIds/);
});

/** Confirm draft totals are calculated exactly from lines and tax without floating-point money arithmetic. */
test('B16.5 calculates authoritative Supplier Invoice totals using exact minor-unit arithmetic', () => {
  const service = read(SERVICE);
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /function minorUnitsToMoney/);
  assert.match(service, /function calculateInvoiceTotals/);
  assert.match(service, /lines\.reduce\(\(total, line\) => total \+ moneyToMinorUnits\(line\.amount\), 0n\)/);
  assert.match(service, /subtotal: totals\.subtotal/);
  assert.match(service, /totalAmount: totals\.totalAmount/);
  assert.doesNotMatch(service, /parseFloat|parseInt\([^)]*amount|Number\([^)]*amount|Math\.round/);
});

/** Confirm Vendor Project Procurement Stage and Finance-line ownership are checked before persistence or posting. */
test('B16.5 validates Vendor Project PO Goods Receipt Stage and invoice line accounts', () => {
  const service = read(SERVICE);
  assert.match(service, /private async validateInvoiceDependencies/);
  assert.match(service, /findVendorById/);
  assert.match(service, /findProjectById/);
  assert.match(service, /findPurchaseOrderById/);
  assert.match(service, /PO_ISSUED = 'ISSUED'/);
  assert.match(service, /findGoodsReceiptById/);
  assert.match(service, /GOODS_RECEIPT_RECEIVED = 'RECEIVED'/);
  assert.match(service, /goodsReceipt\.purchaseOrderId !== purchaseOrder\.id/);
  assert.match(service, /findStageById/);
  assert.match(service, /findGlAccountById/);
  assert.match(service, /\['EXPENSE', 'ASSET'\]/);
});

/** Confirm draft creation is idempotent, duplicate-safe and auditable. */
test('B16.5 creates retry-safe Supplier Invoice drafts with duplicate Vendor invoice protection', () => {
  const service = read(SERVICE);
  assert.match(service, /operation: 'supplier-payables\.invoices\.create'/);
  assert.match(service, /findSupplierInvoiceByVendorInvoiceNo/);
  assert.match(service, /DUPLICATE_SUPPLIER_INVOICE/);
  assert.match(service, /createDraftSupplierInvoice/);
  assert.match(service, /action: 'supplier_invoice\.created'/);
  assert.match(service, /statusCode: 201/);
});

/** Confirm invoice posting is row-locked, retry-safe and only permits the controlled DRAFT to POSTED transition. */
test('B16.5 posts Supplier Invoices idempotently without editing or deleting posted history', () => {
  const service = read(SERVICE);
  assert.match(service, /operation: 'supplier-payables\.invoices\.post'/);
  assert.match(service, /lockSupplierInvoiceForWrite/);
  assert.match(service, /if \(hasStatus\(locked\.status, POSTED\)\)/);
  assert.match(service, /if \(!hasStatus\(locked\.status, DRAFT\)\)/);
  assert.match(service, /markSupplierInvoicePosted/);
  assert.doesNotMatch(service, /supplierInvoice\.(?:update|delete)|deleteMany/);
});

/** Confirm Finance owns AP accounting through one balanced source-keyed journal. */
test('B16.5 posts one balanced Finance AP journal with stable source ownership', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /SUPPLIER_PAYABLE_ACCOUNT_CODE = 'SUPPLIER-PAYABLE'/);
  assert.match(service, /INPUT_TAX_ACCOUNT_CODE = 'INPUT-TAX'/);
  assert.match(repository, /async findGlAccountByCode/);
  assert.match(service, /supplierInvoiceFinanceSourceKey\(invoice\.id\)/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /sourceType: 'supplier_invoice'/);
  assert.match(service, /credit: moneyString\(invoice\.totalAmount\)/);
  assert.match(service, /moneyString\(existingJournal\.totalDebit\) !== moneyString\(invoice\.totalAmount\)/);
  assert.match(service, /moneyString\(existingJournal\.totalCredit\) !== moneyString\(invoice\.totalAmount\)/);
});

/** Confirm direct Project Cost is source-derived while PO/receipt-linked material invoices cannot double count operational cost. */
test('B16.5 applies an explicit Project Cost double-counting policy for Supplier Invoices', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /const procurementOwnedCost = Boolean\(invoice\.purchaseOrderId \|\| invoice\.goodsReceiptId\)/);
  assert.match(service, /if \(!procurementOwnedCost\)/);
  assert.match(service, /account\.accountType\.toUpperCase\(\) !== 'EXPENSE'/);
  assert.match(service, /findActiveSubcontractorByVendorId/);
  assert.match(service, /directCostCategory: subcontractor \? 'subcontract' : 'other'/);
  assert.match(service, /supplierInvoiceCostSourceKey\(invoice\.id, line\.id\)/);
  assert.match(repository, /async upsertSupplierInvoiceCostActual/);
  assert.match(repository, /sourceType: 'supplier_invoice'/);
  assert.match(repository, /companyId_sourceKey/);
  assert.doesNotMatch(service, /category:\s*'material'/);
});

/** Confirm posting audit/outbox evidence records Finance and Project Cost source traceability. */
test('B16.5 records Supplier Invoice posting audit and Foundation outbox evidence', () => {
  const service = read(SERVICE);
  assert.match(service, /recordAudit/);
  assert.match(service, /action: 'supplier_invoice\.posted'/);
  assert.match(service, /projectCostPolicy: procurementOwnedCost \? 'operational-source-owned' : 'direct-expense-lines'/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /eventType: 'supplier_invoice\.posted'/);
  assert.match(service, /financeSourceKey/);
  assert.match(service, /projectCostSourceKeys/);
});

/** Confirm B16.5 invoice behavior remains intact while B16.6 adds the approved Payment service slice only. */
test('B16.5 remains intact while B16.6 adds Payment allocation and aging but HTTP and React stay deferred', () => {
  const service = read(SERVICE);
  assert.match(service, /async createSupplierPayment\b/);
  assert.match(service, /async allocateSupplierPayment\b/);
  assert.match(service, /async getSupplierAging\b/);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(read('apps/api/src/app.ts').includes('registerSupplierPayablesRoutes'), true);
});

/** Confirm every named function/method changed by B16.5 has a short purpose comment for junior developers. */
test('B16.5 keeps changed named functions junior-readable with purpose comments', () => {
  for (const path of [SERVICE, REPOSITORY]) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B16.5 documents its no-migration boundary and hands Supplier Payment behavior to B16.6. */
test('B16.5 freezes persistence and hands Supplier Payment allocation logic to B16.6', () => {
  const doc = read('docs/PASS-B16-5-FINAL21-SUPPLIER-INVOICE-SERVICE.md');
  assert.match(doc, /No Prisma model or migration is added in B16\.5/i);
  assert.match(doc, /PO- or Goods-Receipt-linked Supplier Invoice[\s\S]*does \*\*not\*\* create another Project `cost_actual`/i);
  assert.match(doc, /B16\.6 - implement Supplier Payment creation\/posting plus immutable payment allocation/i);
});
