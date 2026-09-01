import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCHEMA = 'apps/api/src/modules/supplier-payables/supplier-payables.schema.ts';
const MIGRATION = 'packages/database/prisma/migrations/20260829002200_final21_supplier_payables_contract/migration.sql';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm the B16.3 contract remains intact after the approved B16.4-B16.5 backend passes. */
test('B16.3 contract remains intact while B16.5 adds invoice service and HTTP stays deferred', () => {
  assert.equal(exists(SCHEMA), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts'), true);
  assert.equal(exists('apps/api/src/modules/supplier-payables/index.ts'), true);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
  assert.equal(exists(MIGRATION), true);
});

/** Confirm the exact eight Final Module 17 routes are frozen without generic CRUD expansion. */
test('B16.3 freezes exactly the eight Supplier Payables HTTP operations', () => {
  const schema = read(SCHEMA);
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
  assert.equal((schema.match(/method: '(?:GET|POST|PATCH|PUT|DELETE)', route: '\/api\/v1\/supplier-payables/g) ?? []).length, 8);
  assert.doesNotMatch(schema, /PATCH', route: '\/api\/v1\/supplier-payables|DELETE', route: '\/api\/v1\/supplier-payables|\/reverse'|\/approve'/i);
});

/** Confirm the exact Module 17 permission and stable error vocabularies. */
test('B16.3 exposes the exact Supplier Payables permissions and stable errors', () => {
  const schema = read(SCHEMA);
  const permissions = [
    'supplier_payables.read',
    'supplier_invoices.create',
    'supplier_invoices.post',
    'supplier_payments.create',
    'supplier_payments.allocate'
  ];
  const errors = [
    'SUPPLIER_INVOICE_NOT_FOUND',
    'DUPLICATE_SUPPLIER_INVOICE',
    'PAYMENT_ALLOCATION_INVALID',
    'SUPPLIER_SCOPE_MISMATCH'
  ];
  for (const permission of permissions) assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  for (const code of errors) assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  assert.match(schema, /createSupplierPayablesError/);
  assert.match(schema, /SUPPLIER_INVOICE_NOT_FOUND'\) return new NotFoundError/);
  assert.match(schema, /return new ConflictError\(\{ code, message \}\)/);
});

/** Confirm client requests cannot provide company, permission, posting, numbering or authoritative total fields. */
test('B16.3 keeps trusted ownership numbering status totals and allocation timestamp server-owned', () => {
  const schema = read(SCHEMA);
  for (const field of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'allowedProjectIds', 'status', 'subtotal', 'totalAmount', 'paymentNo', 'allocatedAt']) {
    assert.match(schema, new RegExp(`'${field}'`));
  }
  const invoiceCreate = schema.match(/createSupplierInvoiceBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)\.superRefine/)?.[0] ?? '';
  for (const forbidden of ['companyId:', 'status:', 'subtotal:', 'totalAmount:', 'paymentNo:', 'allocatedAt:']) {
    assert.equal(invoiceCreate.includes(forbidden), false, `invoice create body must not accept ${forbidden}`);
  }
  const paymentCreate = schema.match(/createSupplierPaymentBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  for (const forbidden of ['companyId:', 'status:', 'paymentNo:', 'allocatedAt:']) {
    assert.equal(paymentCreate.includes(forbidden), false, `payment create body must not accept ${forbidden}`);
  }
});

/** Confirm Supplier Invoice input uses Vendor/Project/PO/receipt scope, line detail, precise money and valid dates. */
test('B16.3 validates Supplier Invoice business input without trusting browser totals', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /vendorId: uuidSchema/);
  assert.match(schema, /projectId: uuidSchema/);
  assert.match(schema, /invoiceNo: invoiceNoSchema/);
  assert.match(schema, /purchaseOrderId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /goodsReceiptId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /stageId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /expenseOrInventoryAccountId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /lines: z\.array\(supplierInvoiceLineInputSchema\)\.min\(1\)\.max\(500\)/);
  assert.match(schema, /exactPositiveMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /exactNonNegativeMoneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /dueDate cannot precede invoiceDate/);
  assert.match(schema, /date must be a valid calendar date/);
});

/** Confirm Supplier Payment and allocation requests are explicit, positive and bounded. */
test('B16.3 validates Supplier Payment cash bank ownership fields and one-or-many allocations', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /createSupplierPaymentBodySchema = z\.object\(\{/);
  assert.match(schema, /cashBankAccountId: uuidSchema/);
  assert.match(schema, /amount: exactPositiveMoneySchema/);
  assert.match(schema, /supplierInvoiceId: uuidSchema/);
  assert.match(schema, /allocations: z\.array\(supplierPaymentAllocationInputSchema\)\.min\(1\)\.max\(500\)/);
  assert.match(schema, /Each Supplier Invoice may appear only once in one allocation command/);
  assert.doesNotMatch(schema, /allocation.*outstandingAmount.*input|remainingAmount.*input/i);
});

/** Confirm list and aging boundaries are permission-ready, bounded and formula-free. */
test('B16.3 bounds Supplier Payables list and aging filters without accepting browser formulas', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /SUPPLIER_PAYABLES_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(SUPPLIER_PAYABLES_MAX_PAGE_SIZE\)/);
  assert.match(schema, /supplierAgingQuerySchema = z\.object\(\{/);
  assert.match(schema, /asOfDate: dateSchema\.optional\(\)/);
  assert.match(schema, /outstandingAmount: z\.string\(\)/);
  assert.match(schema, /ageDays: z\.number\(\)\.int\(\)\.min\(0\)/);
  const agingQuery = schema.match(/supplierAgingQuerySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.doesNotMatch(agingQuery, /formula|expression|bucketFormula|userFormula/i);
});

/** Confirm response contracts keep payable and aging values derived rather than request-editable persistence. */
test('B16.3 models server-calculated invoice totals and derived aging output', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /supplierInvoiceResponseSchema[\s\S]*subtotal: z\.string\(\)[\s\S]*taxAmount: z\.string\(\)[\s\S]*totalAmount: z\.string\(\)/);
  assert.match(schema, /supplierAgingRowResponseSchema[\s\S]*allocatedAmount: z\.string\(\)[\s\S]*outstandingAmount: z\.string\(\)/);
  assert.match(schema, /supplierPaymentAllocationResponseSchema[\s\S]*allocatedAt: z\.string\(\)\.datetime/);
});

/** Confirm the forward migration only seeds permissions and upgrades conventional system administrators. */
test('B16.3 permission migration adds no AP table trigger function or runtime posting logic', () => {
  const migration = read(MIGRATION);
  for (const permission of ['supplier_payables.read', 'supplier_invoices.create', 'supplier_invoices.post', 'supplier_payments.create', 'supplier_payments.allocate']) {
    assert.equal((migration.match(new RegExp(permission.replace('.', '\\.'), 'g')) ?? []).length >= 2, true, `permission ${permission} must be seeded and granted`);
  }
  assert.match(migration, /INSERT INTO "permissions"/);
  assert.match(migration, /role\."code" = 'system-admin'/);
  assert.match(migration, /role\."is_system" = TRUE/);
  assert.match(migration, /ON CONFLICT DO NOTHING/);
  assert.doesNotMatch(migration, /CREATE TABLE|ALTER TABLE|DROP TABLE|CREATE TRIGGER|CREATE FUNCTION|INSERT INTO "journals"/);
});

/** Confirm migration gate/checksum metadata adds B16.3 while preserving B16.2. */
test('B16.3 registers one permission-only forward migration and preserves B16.2 lock', () => {
  const gates = read('packages/database/prisma/migration-gates.json');
  const checksums = read('packages/database/prisma/migration-checksums.json');
  assert.match(gates, /final-21-pass-b16-2-supplier-payables-persistence/);
  assert.match(gates, /final-21-pass-b16-3-supplier-payables-contract/);
  assert.match(gates, /20260829002100_final21_supplier_payables/);
  assert.match(gates, /20260829002200_final21_supplier_payables_contract/);
  assert.match(checksums, /20260829002100_final21_supplier_payables/);
  assert.match(checksums, /20260829002200_final21_supplier_payables_contract/);
});

/** Confirm the B16.3 handoff is fulfilled by B16.4 without mixing service or HTTP logic into the contract. */
test('B16.3 documents B16.4 as repository-only next work', () => {
  const doc = read('docs/PASS-B16-3-FINAL21-SUPPLIER-PAYABLES-CONTRACT.md');
  assert.match(doc, /B16\.4 - implement the company\/project-scoped Supplier Payables repository only/i);
  assert.match(doc, /does not add a repository, service, Fastify route registration, React feature/i);
  assert.match(doc, /posting, Finance, Project Cost and payment-allocation business logic remain deferred/i);
});
