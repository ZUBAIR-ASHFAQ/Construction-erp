import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const DOCUMENTS = 'apps/api/src/modules/documents-audit';
const SUPPLIER_PAYABLES = 'apps/api/src/modules/supplier-payables';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm Module 21 now recognizes Supplier Invoice as an allow-listed evidence target. */
test('B16.8 allows documents to link to Supplier Invoice resources', () => {
  const schema = read(`${DOCUMENTS}/documents-audit.schema.ts`);
  const resourceTypes = schema.match(/DOCUMENT_LINK_RESOURCE_TYPES = Object\.freeze\(\[[\s\S]*?\] as const\)/)?.[0] ?? '';
  for (const resourceType of ['project', 'employee', 'project_stage', 'client_invoice', 'supplier_invoice', 'site_expense']) {
    assert.match(resourceTypes, new RegExp(`'${resourceType}'`));
  }
  assert.match(schema, /resourceType: z\.enum\(DOCUMENT_LINK_RESOURCE_TYPES\)/);
});

/** Confirm Supplier Invoice document targets are resolved only through same-Company persistence. */
test('B16.8 resolves Supplier Invoice evidence with persisted Company and Project ownership', () => {
  const repository = read(`${DOCUMENTS}/documents-audit.repository.ts`);
  const method = repository.match(/async findLinkableResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /requireCompanyRepositoryScope\(\)/);
  assert.match(method, /resourceType === 'supplier_invoice'/);
  assert.match(method, /this\.db\.supplierInvoice\.findFirst/);
  assert.match(method, /scope\.where\(\{ id: resourceId \}\)/);
  assert.match(method, /select: \{ id: true, projectId: true \}/);
  assert.match(method, /projectId: invoice\.projectId, stageId: null/);
});

/** Confirm link and unlink operations require Supplier Payables read authority for the exact invoice Project. */
test('B16.8 protects Supplier Invoice evidence with Supplier Payables Project permission checks', () => {
  const service = read(`${DOCUMENTS}/documents-audit.service.ts`);
  assert.match(service, /private async requireLinkedProjectPermission/);
  assert.match(service, /resourceType === 'supplier_invoice'[\s\S]*?'supplier_payables\.read'/);
  assert.match(service, /link\.linkedResourceType === 'supplier_invoice'[\s\S]*?'supplier_payables\.read'/);
  assert.match(service, /findEffectivePermissionCodesForProject\(projectId/);
  assert.match(service, /DOCUMENT_SCOPE_FORBIDDEN/);
});

/** Confirm Project-scoped documents cannot be attached to Supplier Invoices from another Project. */
test('B16.8 keeps cross-Project Supplier Invoice document links forbidden', () => {
  const service = read(`${DOCUMENTS}/documents-audit.service.ts`);
  const method = service.match(/async linkDocumentToResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /document\.projectId && resource\.projectId && document\.projectId !== resource\.projectId/);
  assert.match(method, /requireProjectPermission\(usersRepository, resource\.projectId, 'documents\.link'/);
  assert.match(method, /projectId: resource\.projectId \?\? document\.projectId/);
});

/** Confirm Supplier Invoice posting remains traceable to Procurement, Finance and Project Cost without material double counting. */
test('B16.8 preserves Supplier Invoice Procurement Finance and Project Cost integration invariants', () => {
  const service = read(`${SUPPLIER_PAYABLES}/supplier-payables.service.ts`);
  assert.match(service, /findPurchaseOrderById/);
  assert.match(service, /findGoodsReceiptById/);
  assert.match(service, /goodsReceipt\.purchaseOrderId !== purchaseOrder\.id/);
  assert.match(service, /supplierInvoiceFinanceSourceKey\(invoice\.id\)/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /const procurementOwnedCost = Boolean\(invoice\.purchaseOrderId \|\| invoice\.goodsReceiptId\)/);
  assert.match(service, /projectCostPolicy: procurementOwnedCost \? 'operational-source-owned' : 'direct-expense-lines'/);
});

/** Confirm Supplier Payment and allocation keep AP Cash Bank and subledger effects separate. */
test('B16.8 preserves Supplier Payment Finance posting and allocation-only subledger behavior', () => {
  const service = read(`${SUPPLIER_PAYABLES}/supplier-payables.service.ts`);
  assert.match(service, /supplierPaymentFinanceSourceKey\(created\.id\)/);
  assert.match(service, /sourceType: SUPPLIER_PAYMENT_SOURCE_TYPE/);
  assert.match(service, /accountId: payable\.id[\s\S]*debit: amount[\s\S]*credit: ZERO_MONEY/);
  assert.match(service, /accountId: cashBank\.glAccount\.id[\s\S]*debit: ZERO_MONEY[\s\S]*credit: amount/);
  const allocationBlock = service.match(/private async allocateSupplierPaymentOnce[\s\S]*?\n  \}\n\n  \/\*\* Return bounded Supplier aging/)?.[0] ?? '';
  assert.match(allocationBlock, /createSupplierPaymentAllocations/);
  assert.doesNotMatch(allocationBlock, /postSourceJournalInTransaction|upsertSupplierInvoiceCostActual/);
});

/** Confirm Supplier payable and aging remain derived from posted invoice/allocation history instead of stored balance fields. */
test('B16.8 keeps Supplier Payable outstanding and aging source-derived', () => {
  const service = read(`${SUPPLIER_PAYABLES}/supplier-payables.service.ts`);
  const repository = read(`${SUPPLIER_PAYABLES}/supplier-payables.repository.ts`);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(service, /outstandingMinorUnits = totalMinorUnits > allocatedMinorUnits \? totalMinorUnits - allocatedMinorUnits : 0n/);
  assert.doesNotMatch(prisma, /supplierPayableBalance|outstandingAmount\s+Decimal|remainingPayment\s+Decimal/);
});

/** Confirm B16.8 changes integration authorization only and does not expand routes persistence or React scope. */
test('B16.8 keeps the frozen eight-route and two-migration Supplier Payables surface', () => {
  const routes = read(`${SUPPLIER_PAYABLES}/supplier-payables.routes.ts`);
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/supplier-payables/g) ?? []).length, 8);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  const supplierPayablesMigrations = migrations.filter((name) => name.includes('final21_supplier_payables'));
  assert.deepEqual(supplierPayablesMigrations.sort(), [
    '20260829002100_final21_supplier_payables',
    '20260829002200_final21_supplier_payables_contract'
  ]);
});

/** Confirm B16.8 adds no duplicate file-storage or Supplier Payables-specific document endpoint. */
test('B16.8 reuses Module 21 instead of duplicating Supplier Invoice file storage', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const routes = read(`${SUPPLIER_PAYABLES}/supplier-payables.routes.ts`);
  const invoiceModel = prisma.match(/model SupplierInvoice \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(invoiceModel, /blob|binary|storageKey|fileUrl|publicUrl/i);
  assert.doesNotMatch(routes, /upload|download|document|attachment/i);
  assert.match(read(`${DOCUMENTS}/documents-audit.routes.ts`), /\/api\/v1\/documents\/:id\/links/);
});

/** Confirm every named function touched by B16.8 remains purpose-commented for junior developers. */
test('B16.8 keeps changed functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${DOCUMENTS}/documents-audit.service.ts`,
    `${DOCUMENTS}/documents-audit.repository.ts`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line)
        || /^\s*(?:private\s+|public\s+|protected\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B16.8 documents its no-expansion boundary and hands React work to B16.9. */
test('B16.8 records acceptance evidence and hands Supplier Payables React work to B16.9', () => {
  const doc = read('docs/PASS-B16-8-FINAL21-SUPPLIER-PAYABLES-INTEGRATION-DOCUMENTS.md');
  const evidence = read('acceptance-evidence/pass-b16-8-supplier-payables-integration-documents.json');
  assert.match(doc, /`supplier_invoice` is a strict Module 21 link resource type/i);
  assert.match(doc, /does not add:[\s\S]*a Prisma model or migration/i);
  assert.match(doc, /B16\.9 - Supplier Payables React/i);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"resourceType": "supplier_invoice"/);
  assert.match(evidence, /"requiredBusinessPermission": "supplier_payables\.read"/);
});
