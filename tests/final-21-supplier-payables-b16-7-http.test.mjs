import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BACKEND = 'apps/api/src/modules/supplier-payables';
const ROUTES = `${BACKEND}/supplier-payables.routes.ts`;
const INDEX = `${BACKEND}/index.ts`;

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B16.7 completes the required five-file Supplier Payables backend without adding React early. */
test('B16.7 completes the five-file Supplier Payables backend and keeps React deferred', () => {
  assert.deepEqual(readdirSync(new URL(`../${BACKEND}`, import.meta.url)).sort(), [
    'index.ts',
    'supplier-payables.repository.ts',
    'supplier-payables.routes.ts',
    'supplier-payables.schema.ts',
    'supplier-payables.service.ts'
  ]);
  assert.equal(exists('apps/web/src/features/supplier-payables'), true);
});

/** Confirm the runtime route layer implements exactly the eight frozen Final Module 17 endpoints. */
test('B16.7 registers exactly the eight Supplier Payables routes and no generic CRUD additions', () => {
  const routes = read(ROUTES);
  const expected = [
    "app.get('/api/v1/supplier-payables/invoices'",
    "app.post('/api/v1/supplier-payables/invoices'",
    "app.get('/api/v1/supplier-payables/invoices/:id'",
    "app.post('/api/v1/supplier-payables/invoices/:id/post'",
    "app.get('/api/v1/supplier-payables/payments'",
    "app.post('/api/v1/supplier-payables/payments'",
    "app.post('/api/v1/supplier-payables/payments/:id/allocations'",
    "app.get('/api/v1/supplier-payables/aging'"
  ];
  for (const route of expected) assert.ok(routes.includes(route), `missing ${route}`);
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/supplier-payables/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /app\.patch\(|app\.put\(|app\.delete\(|\/payments\/:id\/post|\/reverse|\/credit|\/archive/);
});

/** Confirm all eight routes authenticate and use the frozen Zod request/response schemas. */
test('B16.7 authenticates all routes and validates HTTP boundaries through B16.3 schemas', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 8);
  for (const schemaName of [
    'listSupplierInvoicesQuerySchema',
    'listSupplierInvoicesResponseSchema',
    'createSupplierInvoiceBodySchema',
    'postSupplierInvoiceBodySchema',
    'listSupplierPaymentsQuerySchema',
    'listSupplierPaymentsResponseSchema',
    'createSupplierPaymentBodySchema',
    'allocateSupplierPaymentBodySchema',
    'supplierAgingQuerySchema',
    'supplierAgingResponseSchema',
    'supplierPayablesIdParamsSchema',
    'supplierInvoiceResponseSchema',
    'supplierPaymentResponseSchema',
    'supplierPaymentAllocationResponseSchema'
  ]) {
    assert.ok(routes.includes(schemaName), `missing ${schemaName}`);
  }
  assert.match(routes, /code: 'INVALID_REQUEST'/);
  assert.match(routes, /fieldErrors:/);
});

/** Confirm the four retry-sensitive Supplier Payables commands require Foundation Idempotency-Key. */
test('B16.7 requires Idempotency-Key on invoice create post payment create and allocation commands', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 4);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 4);
  assert.match(routes, /required: \['idempotency-key'\]/);
  assert.match(routes, /maxLength: 200/);
});

/** Confirm create payment and allocation HTTP semantics match the service decisions without inventing a payment-post route. */
test('B16.7 preserves atomic Supplier Payment creation and append-only allocation HTTP semantics', () => {
  const routes = read(ROUTES);
  assert.match(routes, /summary: 'Create and post a Supplier Payment'/);
  assert.match(routes, /service\.createSupplierPayment\(body, readIdempotencyKey\(request\)\)/);
  assert.match(routes, /service\.allocateSupplierPayment\(params\.id, body, readIdempotencyKey\(request\)\)/);
  assert.equal((routes.match(/reply\.code\(201\)\.send\(\{ data \}\)/g) ?? []).length, 3);
  assert.doesNotMatch(routes, /payments\/:id\/post/);
});

/** Confirm full Fastify JSON-schema metadata documents params query bodies responses and bearer security. */
test('B16.7 publishes complete Supplier Payables OpenAPI route metadata', () => {
  const routes = read(ROUTES);
  const operationIds = [...routes.matchAll(/operationId: '([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(operationIds, [
    'listSupplierInvoices',
    'createSupplierInvoice',
    'getSupplierInvoice',
    'postSupplierInvoice',
    'listSupplierPayments',
    'createSupplierPayment',
    'allocateSupplierPayment',
    'getSupplierAging'
  ]);
  assert.equal(new Set(operationIds).size, 8);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 8);
  assert.equal((routes.match(/tags: \['Supplier Payables'\]/g) ?? []).length, 8);
  assert.match(routes, /querystring: LIST_INVOICES_QUERY_JSON_SCHEMA/);
  assert.match(routes, /body: CREATE_INVOICE_BODY_JSON_SCHEMA/);
  assert.match(routes, /params: SUPPLIER_PAYABLES_ID_PARAMS_JSON_SCHEMA/);
  assert.match(routes, /body: CREATE_PAYMENT_BODY_JSON_SCHEMA/);
  assert.match(routes, /body: ALLOCATE_PAYMENT_BODY_JSON_SCHEMA/);
  assert.match(routes, /querystring: AGING_QUERY_JSON_SCHEMA/);
  assert.match(routes, /response: \{ 201: ALLOCATION_LIST_SUCCESS_JSON_SCHEMA/);
  assert.match(routes, /\.\.\.COMMON_RESPONSES/);
});

/** Confirm the module barrel exposes the existing layers plus the new HTTP registration. */
test('B16.7 adds one simple Supplier Payables module barrel', () => {
  const index = read(INDEX);
  assert.match(index, /SupplierPayablesRepository/);
  assert.match(index, /SupplierPayablesService/);
  assert.match(index, /registerSupplierPayablesRoutes/);
  assert.match(index, /SupplierPayablesRoutesOptions/);
  assert.match(index, /SUPPLIER_PAYABLES_HTTP_ROUTES/);
  assert.match(index, /supplierAgingResponseSchema/);
});

/** Confirm app.ts registers Supplier Payables only in the database-backed module graph. */
test('B16.7 registers Supplier Payables with the Fastify application and generated OpenAPI graph', () => {
  const app = read('apps/api/src/app.ts');
  assert.match(app, /import \{ registerSupplierPayablesRoutes \} from '\.\/modules\/supplier-payables\/index\.js';/);
  assert.match(app, /app\.register\(registerSupplierPayablesRoutes, \{ database: options\.database \}\);/);
  assert.match(app, /app\.register\(swagger/);
  assert.match(app, /app\.get\('\/openapi\.json'/);
});

/** Confirm B16.7 is HTTP-only and does not mutate the frozen Supplier Payables database contract. */
test('B16.7 adds no Supplier Payables migration', () => {
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  const supplierPayablesMigrations = migrations.filter((name) => name.includes('final21_supplier_payables'));
  assert.deepEqual(supplierPayablesMigrations.sort(), [
    '20260829002100_final21_supplier_payables',
    '20260829002200_final21_supplier_payables_contract'
  ]);
});

/** Confirm every named helper and route registration function added by B16.7 has a short purpose comment. */
test('B16.7 keeps HTTP functions junior-readable with purpose comments', () => {
  const lines = read(ROUTES).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
    if (!isFunction) continue;
    const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
    assert.match(previous, /\/\*\*[^]*\*\//, `${ROUTES}:${index + 1} needs a short purpose comment`);
  }
});
