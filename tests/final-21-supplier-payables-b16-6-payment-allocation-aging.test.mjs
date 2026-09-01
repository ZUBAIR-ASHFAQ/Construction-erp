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

/** Confirm B16.6 adds only Payment/allocation/aging service behavior without HTTP, React or migration expansion. */
test('B16.6 adds Supplier Payment service behavior while routes React and migrations stay deferred', () => {
  assert.equal(exists(SERVICE), true);
  assert.equal(exists(REPOSITORY), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/index.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(exists('docs/PASS-B16-6-FINAL21-SUPPLIER-PAYMENT-ALLOCATION-AGING.md'), true);
  assert.equal(exists('acceptance-evidence/pass-b16-6-supplier-payment-allocation-aging.json'), true);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b16[_-]?6|supplier_payment.*service|allocation.*aging/i.test(name)), false);
});

/** Confirm the create-payment command uses Foundation numbering and atomically returns a posted payment. */
test('B16.6 creates server-numbered Supplier Payments through the existing Foundation sequence', () => {
  const service = read(SERVICE);
  assert.match(service, /allocateCompanyNumber/);
  assert.match(service, /SUPPLIER_PAYMENT_SEQUENCE_KEY = 'supplier-payment'/);
  assert.match(service, /operation: 'supplier-payables\.payments\.create'/);
  assert.match(service, /paymentNo: number\.formatted/);
  assert.match(service, /status: DRAFT/);
  assert.match(service, /markSupplierPaymentPosted/);
  assert.match(service, /statusCode: 201/);
});

/** Confirm payment creation revalidates Vendor Project and Cash Bank ownership from server-side state. */
test('B16.6 validates Supplier Payment scope and Finance Cash Bank dependencies', () => {
  const service = read(SERVICE);
  assert.match(service, /resolveVisibility\(users, 'supplier_payments\.create'/);
  assert.match(service, /requireProjectPermission\(users, input\.projectId, 'supplier_payments\.create'/);
  assert.match(service, /hasCompanyPermission\(users, 'supplier_payments\.create'/);
  assert.match(service, /findVendorById\(input\.vendorId\)/);
  assert.match(service, /findProjectById\(input\.projectId, visibility\)/);
  assert.match(service, /findCashBankAccountById\(input\.cashBankAccountId\)/);
  assert.match(service, /\['CASH', 'BANK'\]/);
  assert.match(service, /cashBank\.glAccount\.status/);
});

/** Confirm payment accounting reduces Supplier Payable and Cash Bank through one source-keyed balanced Finance journal. */
test('B16.6 posts Supplier Payment to Finance exactly once with AP debit and Cash Bank credit', () => {
  const service = read(SERVICE);
  assert.match(service, /function supplierPaymentFinanceSourceKey/);
  assert.match(service, /return `supplier_payment:\$\{paymentId\}`/);
  assert.match(service, /sourceType: SUPPLIER_PAYMENT_SOURCE_TYPE/);
  assert.match(service, /accountId: payable\.id[\s\S]*debit: amount[\s\S]*credit: ZERO_MONEY/);
  assert.match(service, /accountId: cashBank\.glAccount\.id[\s\S]*debit: ZERO_MONEY[\s\S]*credit: amount/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /moneyString\(existingJournal\.totalDebit\) !== amount/);
  assert.match(service, /moneyString\(existingJournal\.totalCredit\) !== amount/);
});

/** Confirm payment posting emits only traceable audit/outbox evidence and does not write a separate AP balance. */
test('B16.6 records Supplier Payment posting audit and outbox without stored balance shortcuts', () => {
  const service = read(SERVICE);
  const schema = read('packages/database/prisma/schema.prisma');
  assert.match(service, /action: 'supplier_payment\.posted'/);
  assert.match(service, /eventType: 'supplier_payment\.posted'/);
  assert.match(service, /financeSourceKey/);
  assert.doesNotMatch(schema, /supplierPayableBalance|remainingPayment\s+Decimal|outstandingAmount\s+Decimal/);
});

/** Confirm allocations are retry-safe, append-only and require a POSTED payment plus POSTED same-Vendor invoices. */
test('B16.6 allocates only POSTED Supplier Payments to POSTED same-Vendor invoices', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(service, /operation: 'supplier-payables\.payments\.allocate'/);
  assert.match(service, /lockSupplierPaymentForWrite/);
  assert.match(service, /!hasStatus\(payment\.status, POSTED\)/);
  assert.match(service, /lockSupplierInvoiceForWrite/);
  assert.match(service, /!hasStatus\(invoice\.status, POSTED\)/);
  assert.match(service, /invoice\.vendorId !== payment\.vendorId/);
  assert.match(service, /payment\.projectId !== null && invoice\.projectId !== payment\.projectId/);
  assert.match(service, /invoiceIds\.length !== input\.allocations\.length/);
  assert.match(repository, /supplierPaymentAllocation\.create\(/);
  assert.doesNotMatch(repository, /supplierPaymentAllocation\.(?:update|delete)/);
});

/** Confirm allocation commands use deterministic invoice locking to protect concurrent outstanding calculations. */
test('B16.6 locks allocation invoices in deterministic order before deriving balances', () => {
  const service = read(SERVICE);
  assert.match(service, /const invoiceIds = \[\.\.\.new Set\([^;]+\)\]\.sort\(\)/);
  const lockIndex = service.indexOf('lockSupplierInvoiceForWrite(invoiceId, visibility)');
  const paymentSumIndex = service.indexOf('sumAllocatedAmountForSupplierPayment(paymentId)');
  const invoiceSumIndex = service.indexOf('sumAllocatedAmountForSupplierInvoice(invoice.id)');
  assert.ok(lockIndex >= 0 && paymentSumIndex > lockIndex && invoiceSumIndex > lockIndex);
});

/** Confirm allocation cannot exceed either remaining payment or remaining invoice outstanding. */
test('B16.6 derives both allocation limits with exact money arithmetic', () => {
  const service = read(SERVICE);
  assert.match(service, /alreadyAllocatedPayment \+ requestedPayment > paymentAmount/);
  assert.match(service, /alreadyAllocatedInvoice \+ requestedInvoice > moneyToMinorUnits\(invoice\.totalAmount\)/);
  assert.match(service, /PAYMENT_ALLOCATION_INVALID/);
  assert.doesNotMatch(service, /parseFloat|Number\([^)]*amount|Math\.round/);
});

/** Confirm allocation itself does not create a second cash/AP Finance posting. */
test('B16.6 allocation updates subledger history only and does not double-post Finance', () => {
  const service = read(SERVICE);
  const block = service.match(/private async allocateSupplierPaymentOnce[\s\S]*?\n  \}\n\n  \/\*\* Return bounded Supplier aging/)?.[0] ?? '';
  assert.match(block, /createSupplierPaymentAllocations/);
  assert.match(block, /action: 'supplier_payment\.allocated'/);
  assert.match(block, /eventType: 'supplier_payment\.allocated'/);
  assert.doesNotMatch(block, /postSourceJournalInTransaction|journal|costActual|upsertSupplierInvoiceCostActual/);
});

/** Confirm aging uses only posted invoices and allocations from posted payments through the requested as-of date. */
test('B16.6 aging is source-derived from posted invoice and posted payment allocation history', () => {
  const service = read(SERVICE);
  const repository = read(REPOSITORY);
  assert.match(repository, /status: 'POSTED'/);
  assert.match(repository, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(service, /listSupplierAgingSources/);
  assert.match(service, /allocatedThrough: endOfInputDate\(asOfDateText\)/);
  assert.match(service, /allocatedMinorUnits/);
  assert.match(service, /outstandingMinorUnits = totalMinorUnits > allocatedMinorUnits \? totalMinorUnits - allocatedMinorUnits : 0n/);
});

/** Confirm B16.6 freezes a deterministic minimal age-days rule without inventing aging buckets. */
test('B16.6 ageDays uses due date fallback and does not add unsupported browser formulas or buckets', () => {
  const service = read(SERVICE);
  const schema = read('apps/api/src/modules/supplier-payables/supplier-payables.schema.ts');
  assert.match(service, /const basis = dueDate \?\? invoiceDate/);
  assert.match(service, /Math\.max\(0, Math\.floor/);
  assert.match(schema, /asOfDate: dateSchema\.optional\(\)/);
  assert.doesNotMatch(schema, /\b(?:bucket|formula|expression)\s*:/i);
});

/** Confirm every named function and method touched by the Supplier Payables service remains purpose-commented. */
test('B16.6 keeps changed named functions junior-readable with purpose comments', () => {
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

/** Confirm B16.6 documentation records source-supported rules and hands exact Fastify route work to B16.7. */
test('B16.6 documents implementation decisions and hands exact eight-route HTTP work to B16.7', () => {
  const doc = read('docs/PASS-B16-6-FINAL21-SUPPLIER-PAYMENT-ALLOCATION-AGING.md');
  assert.match(doc, /no separate Supplier Payment post route/i);
  assert.match(doc, /create and post the payment atomically/i);
  assert.match(doc, /ageDays/i);
  assert.match(doc, /due date/i);
  assert.match(doc, /B16\.7/i);
  assert.match(doc, /exact eight-route/i);
  assert.match(doc, /No Prisma model or migration is added in B16\.6/i);
});
