import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const REPOSITORY = 'apps/api/src/modules/supplier-payables/supplier-payables.repository.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm the B16.4 repository remains intact after B16.5 adds the approved Supplier Invoice service. */
test('B16.4 repository remains intact while B16.5 adds service and HTTP React migration remain deferred', () => {
  assert.equal(exists(REPOSITORY), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/index.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(exists('docs/PASS-B16-4-FINAL21-SUPPLIER-PAYABLES-REPOSITORY.md'), true);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b16[_-]?4|supplier_payables_repository/i.test(name)), false);
});

/** Confirm the repository supports both normal Prisma and one active transaction client. */
test('B16.4 repository is transaction-ready and always derives Company scope from tenant context', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /import type \{ DatabaseClient, TransactionClient \} from '@construction-erp\/database'/);
  assert.match(repository, /type RepositoryClient = DatabaseClient \| TransactionClient/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /constructor\(private readonly db: RepositoryClient\)/);
  assert.doesNotMatch(repository, /companyId:\s*input\.companyId|companyId:\s*visibility\.companyId/);
});

/** Confirm bounded pagination and trusted Project scope are reused by all register-style reads. */
test('B16.4 bounds repository reads and never widens restricted Project visibility', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /SUPPLIER_PAYABLES_MAX_PAGE_SIZE/);
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /function normalizeAllowedProjectIds/);
  assert.match(repository, /function isProjectAllowed/);
  assert.match(repository, /requiredProjectScopeWhere/);
  assert.match(repository, /optionalProjectScopeWhere/);
  assert.match(repository, /if \(input\.projectId && !isProjectAllowed\(input\.projectId, allowedProjectIds\)\) return \{ items: \[\], total: 0 \}/);
});

/** Confirm dependency lookups preserve Vendor Project Procurement Stage and Finance ownership boundaries. */
test('B16.4 exposes narrow same-company dependency lookups for later service validation', () => {
  const repository = read(REPOSITORY);
  for (const method of [
    'findVendorById',
    'findProjectById',
    'findPurchaseOrderById',
    'findGoodsReceiptById',
    'findStageById',
    'findGlAccountById',
    'findCashBankAccountById'
  ]) {
    assert.match(repository, new RegExp(`async ${method}\\b`), `missing ${method}`);
  }
  assert.match(repository, /where: scope\.where\(\{ id: purchaseOrderId, projectId, vendorId \}\)/);
  assert.match(repository, /where: scope\.where\(\{ id: goodsReceiptId, projectId, vendorId \}\)/);
  assert.match(repository, /where: scope\.where\(\{ id: stageId, projectId \}\)/);
  assert.match(repository, /include: \{ glAccount: true \}/);
});

/** Confirm Supplier Invoice reads and duplicate checks are persistence-only and project scoped. */
test('B16.4 implements bounded Supplier Invoice list detail duplicate and batch lookup', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async findSupplierInvoiceByVendorInvoiceNo\(vendorId: string, invoiceNo: string\)/);
  assert.match(repository, /async listSupplierInvoices\(input: ListSupplierInvoicesRepositoryInput\)/);
  assert.match(repository, /async findSupplierInvoiceById\(invoiceId: string, visibility: SupplierPayablesRepositoryVisibility\)/);
  assert.match(repository, /async findSupplierInvoicesByIds\(invoiceIds: readonly string\[\], visibility: SupplierPayablesRepositoryVisibility\)/);
  assert.match(repository, /supplierInvoice\.findMany/);
  assert.match(repository, /supplierInvoice\.count/);
  assert.match(repository, /include: supplierInvoiceInclude\(\)/);
  assert.match(repository, /orderBy: \[\{ invoiceDate: 'desc' \}, \{ invoiceNo: 'desc' \}, \{ id: 'desc' \}\]/);
});

/** Confirm draft Supplier Invoice creation writes only service-authorized totals and line detail. */
test('B16.4 creates one DRAFT Supplier Invoice with nested lines and no browser-owned company field', () => {
  const repository = read(REPOSITORY);
  const createBlock = repository.match(/async createDraftSupplierInvoice[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(createBlock, /status: 'DRAFT'/);
  assert.match(createBlock, /subtotal: input\.subtotal/);
  assert.match(createBlock, /taxAmount: input\.taxAmount/);
  assert.match(createBlock, /totalAmount: input\.totalAmount/);
  assert.match(createBlock, /lines: \{/);
  assert.match(createBlock, /expenseOrInventoryAccountId: line\.expenseOrInventoryAccountId \?\? null/);
  assert.doesNotMatch(createBlock, /companyId: input\./);
  assert.doesNotMatch(repository, /deleteSupplierInvoice|supplierInvoice\.delete|supplierInvoiceLine\.delete/i);
});

/** Confirm invoice posting has a row lock and one narrow DRAFT to POSTED persistence transition. */
test('B16.4 provides concurrency-safe Supplier Invoice locking and controlled posting persistence', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async lockSupplierInvoiceForWrite/);
  assert.match(repository, /FROM supplier_invoices[\s\S]*FOR UPDATE/);
  assert.match(repository, /async markSupplierInvoicePosted/);
  assert.match(repository, /status: 'DRAFT'/);
  assert.match(repository, /data: \{ status: 'POSTED' \}/);
  assert.doesNotMatch(repository, /POSTED[^\n]+DRAFT|data: \{ status: 'DRAFT' \}.*supplierInvoice\.updateMany/s);
});

/** Confirm Supplier Payments are bounded, scoped and server-numbered at repository input. */
test('B16.4 implements Supplier Payment list create detail and restricted projectless guard', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async listSupplierPayments/);
  assert.match(repository, /async findSupplierPaymentById/);
  assert.match(repository, /async createSupplierPayment/);
  assert.match(repository, /paymentNo: input\.paymentNo/);
  assert.match(repository, /status: input\.status/);
  assert.match(repository, /allowedProjectIds !== null && \(!input\.projectId \|\| !isProjectAllowed\(input\.projectId, allowedProjectIds\)\)/);
  assert.match(repository, /optionalProjectScopeWhere\(allowedProjectIds\)/);
});

/** Confirm payment posting and allocation readiness use locks and source-derived sums rather than stored balances. */
test('B16.4 provides payment lock posting transition and derived allocation sums without balance columns', () => {
  const repository = read(REPOSITORY);
  assert.match(repository, /async lockSupplierPaymentForWrite/);
  assert.match(repository, /FROM supplier_payments[\s\S]*FOR UPDATE/);
  assert.match(repository, /async markSupplierPaymentPosted/);
  assert.match(repository, /async sumAllocatedAmountForSupplierInvoice/);
  assert.match(repository, /async sumAllocatedAmountForSupplierPayment/);
  assert.match(repository, /supplierPaymentAllocation\.aggregate/);
  assert.doesNotMatch(repository, /storedOutstanding|remainingPayment|payableBalance|outstandingBalance/);
});

/** Confirm allocation persistence is append-only and rechecks Company/Project-visible payment and invoices. */
test('B16.4 appends Supplier Payment allocations only after scoped payment and invoice reads', () => {
  const repository = read(REPOSITORY);
  const allocationBlock = repository.match(/async createSupplierPaymentAllocations[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(allocationBlock, /findSupplierPaymentById\(paymentId/);
  assert.match(allocationBlock, /findSupplierInvoicesByIds\(invoiceIds/);
  assert.match(allocationBlock, /visibleInvoices\.length !== new Set\(invoiceIds\)\.size/);
  assert.match(allocationBlock, /supplierPaymentAllocation\.create\(/);
  assert.doesNotMatch(allocationBlock, /supplierPaymentAllocation\.(?:update|delete)/);
});

/** Confirm aging remains a bounded source read and does not invent report formulas in the repository. */
test('B16.4 reads posted as-of aging sources with allocation timestamps but leaves calculations to service', () => {
  const repository = read(REPOSITORY);
  const agingBlock = repository.match(/async listSupplierAgingSources[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(agingBlock, /status: 'POSTED'/);
  assert.match(agingBlock, /invoiceDate: \{ lte: input\.invoiceDateThrough \}/);
  assert.match(agingBlock, /allocatedAt: \{ lte: input\.allocatedThrough \}/);
  assert.match(agingBlock, /skip: input\.skip/);
  assert.match(agingBlock, /take: input\.take/);
  assert.doesNotMatch(agingBlock, /ageDays|outstandingAmount|bucket|Date\.now|Math\./);
});

/** Confirm repository work does not absorb service, accounting, audit, outbox, HTTP or UI ownership. */
test('B16.4 keeps business side effects out of the repository', () => {
  const repository = read(REPOSITORY);
  assert.doesNotMatch(repository, /FinanceService|postSourceJournal|writeAudit|audit_logs|outbox|idempotency/i);
  assert.match(repository, /async upsertSupplierInvoiceCostActual/);
  assert.doesNotMatch(repository, /Fastify|route\(|registerSupplierPayablesRoutes|TanStack|React/);
  assert.doesNotMatch(repository, /supplierPayable\s*=|profit|journal\.create|journalLine\.create/i);
});

/** Confirm every B16.4 named repository/helper function has an immediately preceding purpose comment. */
test('B16.4 keeps named functions commented for junior-developer readability', () => {
  const repository = read(REPOSITORY);
  const names = [
    'assertPageWindow',
    'normalizeAllowedProjectIds',
    'isProjectAllowed',
    'requiredProjectScopeWhere',
    'optionalProjectScopeWhere',
    'supplierInvoiceInclude',
    'findVendorById',
    'findProjectById',
    'findPurchaseOrderById',
    'findGoodsReceiptById',
    'findStageById',
    'findGlAccountById',
    'findCashBankAccountById',
    'findSupplierInvoiceByVendorInvoiceNo',
    'listSupplierInvoices',
    'findSupplierInvoiceById',
    'findSupplierInvoicesByIds',
    'createDraftSupplierInvoice',
    'lockSupplierInvoiceForWrite',
    'markSupplierInvoicePosted',
    'sumAllocatedAmountForSupplierInvoice',
    'listSupplierPayments',
    'findSupplierPaymentById',
    'createSupplierPayment',
    'lockSupplierPaymentForWrite',
    'markSupplierPaymentPosted',
    'sumAllocatedAmountForSupplierPayment',
    'createSupplierPaymentAllocations',
    'listSupplierAgingSources'
  ];
  for (const name of names) {
    const pattern = new RegExp(`/\\*\\*[\\s\\S]{0,220}?\\*/\\s+(?:async\\s+)?(?:function\\s+)?${name}\\b`);
    assert.match(repository, pattern, `missing purpose comment for ${name}`);
  }
});

/** Confirm B16.4 documentation hands only Supplier Invoice service behavior to B16.5. */
test('B16.4 handoff keeps Finance Project Cost and business validation in B16.5', () => {
  const doc = read('docs/PASS-B16-4-FINAL21-SUPPLIER-PAYABLES-REPOSITORY.md');
  assert.match(doc, /B16\.5 - implement Supplier Invoice service logic/i);
  assert.match(doc, /must not blindly create a second Project actual cost/i);
  assert.match(doc, /does \*\*not\*\* implement:[\s\S]*Supplier Payables service/i);
  assert.match(doc, /adds no migration/i);
});
