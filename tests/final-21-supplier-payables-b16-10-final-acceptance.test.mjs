import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BACKEND = 'apps/api/src/modules/supplier-payables';
const WEB = 'apps/web/src/features/supplier-payables';
const LIVE = 'tests/integration/final-21-supplier-payables-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-supplier-payables-browser.spec.mjs';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Freeze the simple five-file backend and four-folder React Module 17 structure. */
test('B16.10 freezes the simple Supplier Payables module structure', () => {
  assert.deepEqual(readdirSync(new URL(`../${BACKEND}`, import.meta.url)).sort(), [
    'index.ts',
    'supplier-payables.repository.ts',
    'supplier-payables.routes.ts',
    'supplier-payables.schema.ts',
    'supplier-payables.service.ts'
  ]);
  assert.deepEqual(readdirSync(new URL(`../${WEB}`, import.meta.url)).sort(), ['api', 'components', 'hooks', 'pages']);
});

/** Freeze exactly the eight Final Module 17 operations and reject generic CRUD expansion. */
test('B16.10 freezes exactly eight Supplier Payables HTTP operations', () => {
  const schema = read(`${BACKEND}/supplier-payables.schema.ts`);
  const expected = [
    "GET', route: '/api/v1/supplier-payables/invoices'",
    "POST', route: '/api/v1/supplier-payables/invoices'",
    "GET', route: '/api/v1/supplier-payables/invoices/:id'",
    "POST', route: '/api/v1/supplier-payables/invoices/:id/post'",
    "GET', route: '/api/v1/supplier-payables/payments'",
    "POST', route: '/api/v1/supplier-payables/payments'",
    "POST', route: '/api/v1/supplier-payables/payments/:id/allocations'",
    "GET', route: '/api/v1/supplier-payables/aging'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/supplier-payables/g) ?? []).length, 8);
  assert.doesNotMatch(schema, /\/reverse|\/delete|\/archive|payments\/:id\/post|PATCH'.*supplier-payables|DELETE'.*supplier-payables/);
});

/** Freeze only the four required Supplier Payables models and two forward migrations. */
test('B16.10 freezes Supplier Payables persistence and migration history', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['SupplierInvoice', 'SupplierInvoiceLine', 'SupplierPayment', 'SupplierPaymentAllocation']) {
    assert.match(prisma, new RegExp(`model ${model} \\{`));
  }
  for (const table of ['supplier_invoices', 'supplier_invoice_lines', 'supplier_payments', 'supplier_payment_allocations']) {
    assert.match(prisma, new RegExp(`@@map\\("${table}"\\)`));
  }
  assert.doesNotMatch(prisma, /supplierPayableBalance|remainingPayment\s+Decimal|outstandingAmount\s+Decimal/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.deepEqual(migrations.filter((name) => name.includes('final21_supplier_payables')).sort(), [
    '20260829002100_final21_supplier_payables',
    '20260829002200_final21_supplier_payables_contract'
  ]);
});

/** Freeze invoice posting ownership, idempotency and Procurement double-count protection. */
test('B16.10 freezes Supplier Invoice Finance and Project Cost invariants', () => {
  const service = read(`${BACKEND}/supplier-payables.service.ts`);
  assert.match(service, /supplier_invoice:\$\{invoiceId\}/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /const procurementOwnedCost = Boolean\(invoice\.purchaseOrderId \|\| invoice\.goodsReceiptId\)/);
  assert.match(service, /upsertSupplierInvoiceCostActual/);
  assert.match(service, /projectCostPolicy: procurementOwnedCost \? 'operational-source-owned' : 'direct-expense-lines'/);
  assert.match(service, /supplier_invoice\.posted/);
  assert.doesNotMatch(service, /deleteMany\(|\.delete\(/);
});

/** Freeze payment posting, append-only allocation and source-derived aging behavior. */
test('B16.10 freezes Supplier Payment allocation and aging invariants', () => {
  const service = read(`${BACKEND}/supplier-payables.service.ts`);
  const repository = read(`${BACKEND}/supplier-payables.repository.ts`);
  assert.match(service, /supplier_payment:\$\{paymentId\}/);
  assert.match(service, /supplier_payment\.posted/);
  assert.match(service, /supplier_payment\.allocated/);
  assert.match(service, /alreadyAllocatedPayment \+ requestedPayment > paymentAmount/);
  assert.match(service, /alreadyAllocatedInvoice \+ requestedInvoice > moneyToMinorUnits\(invoice\.totalAmount\)/);
  assert.match(service, /outstandingMinorUnits = totalMinorUnits > allocatedMinorUnits \? totalMinorUnits - allocatedMinorUnits : 0n/);
  assert.match(repository, /createSupplierPaymentAllocations/);
  assert.doesNotMatch(repository, /update.*SupplierPaymentAllocation|delete.*SupplierPaymentAllocation/i);
});

/** Freeze the exact permissions, stable errors and Module 21 Supplier Invoice evidence boundary. */
test('B16.10 freezes Supplier Payables authorization errors and document integration', () => {
  const schema = read(`${BACKEND}/supplier-payables.schema.ts`);
  for (const code of ['supplier_payables.read', 'supplier_invoices.create', 'supplier_invoices.post', 'supplier_payments.create', 'supplier_payments.allocate']) {
    assert.ok(schema.includes(`'${code}'`), `missing permission ${code}`);
  }
  for (const code of ['SUPPLIER_INVOICE_NOT_FOUND', 'DUPLICATE_SUPPLIER_INVOICE', 'PAYMENT_ALLOCATION_INVALID', 'SUPPLIER_SCOPE_MISMATCH']) {
    assert.ok(schema.includes(`'${code}'`), `missing error ${code}`);
  }
  const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  const documentService = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  assert.match(documentSchema, /'supplier_invoice'/);
  assert.match(documentService, /resourceType === 'supplier_invoice'[\s\S]*?'supplier_payables\.read'/);
});

/** Freeze the permission-aware browser workflow without moving accounting authority into React. */
test('B16.10 freezes the Supplier Payables React workflow', () => {
  const workspace = read(`${WEB}/components/supplier-payables-workspace.tsx`);
  const api = read(`${WEB}/api/supplier-payables-api.ts`);
  const hooks = read(`${WEB}/hooks/supplier-payables.ts`);
  const page = read(`${WEB}/pages/supplier-payables-page.tsx`);
  for (const token of ['New Supplier Invoice', 'Create invoice', 'Post Supplier Invoice', 'New Supplier Payment', 'Create & post payment', 'Allocate payment', 'Supplier Outstanding &amp; Aging']) {
    assert.ok(workspace.includes(token), `missing UI token ${token}`);
  }
  assert.match(api, /Idempotency-Key/);
  assert.match(hooks, /useSupplierAging/);
  assert.match(hooks, /useAllocateSupplierPayment/);
  assert.match(page, /supplier_invoices\.post/);
  assert.match(page, /supplier_payments\.allocate/);
  assert.doesNotMatch(workspace, /authoritative.*profit|editable.*outstanding/i);
});

/** Require executable live API and browser gates for the final Supplier Payables workflow. */
test('B16.10 adds guarded live integration and Playwright workflow coverage', () => {
  assert.equal(exists(LIVE), true);
  assert.equal(exists(E2E), true);
  const live = read(LIVE);
  const e2e = read(E2E);
  const config = read('playwright.config.mjs');
  const pkg = JSON.parse(read('package.json'));
  for (const token of ['createFoundationTestDatabaseClient', 'buildApp', 'app.inject', 'PAYMENT_ALLOCATION_INVALID', '/openapi.json']) {
    assert.ok(live.includes(token), `missing live verification token ${token}`);
  }
  for (const token of ['Create invoice', 'Post Supplier Invoice', 'Create & post payment', 'Allocate payment', 'Supplier Outstanding & Aging']) {
    assert.ok(e2e.includes(token), `missing browser workflow token ${token}`);
  }
  assert.match(config, /RUN_FINAL_21_SUPPLIER_PAYABLES_E2E/);
  assert.match(config, /final-21-supplier-payables-browser\.spec\.mjs/);
  assert.ok(pkg.scripts['test:integration:final-21-supplier-payables']);
  assert.ok(pkg.scripts['test:e2e:final-21-supplier-payables']);
  assert.ok(pkg.scripts['final-21-supplier-payables:b16-10:gate']);
});

/** Freeze the exact source-only Module 17 runtime and avoid parallel AP implementations. */
test('B16.10 does not introduce duplicate Supplier Payables runtimes or unsupported workflows', () => {
  for (const path of [
    'apps/api/src/modules/accounts-payable',
    'apps/api/src/modules/supplier-invoice-approvals',
    'apps/api/src/modules/supplier-payment-reversals',
    'apps/web/src/features/accounts-payable',
    'apps/web/src/features/supplier-invoice-approvals'
  ]) assert.equal(exists(path), false, `${path} should not exist`);
  const app = read('apps/api/src/app.ts');
  assert.match(app, /registerSupplierPayablesRoutes/);
  assert.doesNotMatch(app, /registerAccountsPayable|registerSupplierInvoiceApprovals/);
});

/** Keep changed Module 17 named functions purpose-commented for junior readability. */
test('B16.10 keeps Supplier Payables named functions junior-readable with purpose comments', () => {
  const paths = [
    `${BACKEND}/supplier-payables.schema.ts`,
    `${BACKEND}/supplier-payables.repository.ts`,
    `${BACKEND}/supplier-payables.service.ts`,
    `${BACKEND}/supplier-payables.routes.ts`,
    `${WEB}/api/supplier-payables-api.ts`,
    `${WEB}/hooks/supplier-payables.ts`,
    `${WEB}/components/supplier-payables-workspace.tsx`,
    `${WEB}/pages/supplier-payables-page.tsx`,
    LIVE,
    E2E
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+|public\s+|protected\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Record final acceptance evidence and hand the sequence to Module 15 Client Billing. */
test('B16.10 records the final Supplier Payables freeze and B17 handoff', () => {
  const doc = read('docs/PASS-B16-10-FINAL21-SUPPLIER-PAYABLES-FINAL-ACCEPTANCE.md');
  const evidence = read('acceptance-evidence/pass-b16-10-supplier-payables-final-acceptance.json');
  assert.match(doc, /Supplier Invoice -> Payable -> Supplier Payment -> Allocation -> Outstanding\/Aging/);
  assert.match(doc, /B17.*Module 15.*Client Billing/i);
  assert.match(evidence, /"routeCount": 8/);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"nextPass": "B17\.1/);
});
