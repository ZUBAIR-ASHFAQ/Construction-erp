import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const ROUTES = 'apps/api/src/modules/client-receipts/client-receipts.routes.ts';
const SERVICE = 'apps/api/src/modules/client-receipts/client-receipts.service.ts';

/** Read one project text file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B18.7 publishes exactly the six Final-21 Client Receipts routes', () => {
  const routes = read(ROUTES);
  const routeCalls = [...routes.matchAll(/app\.(get|post|patch|put|delete)\('([^']+)'/g)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
  assert.deepEqual(routeCalls, [
    'GET /api/v1/client-receipts',
    'POST /api/v1/client-receipts',
    'GET /api/v1/client-receipts/:id',
    'POST /api/v1/client-receipts/:id/allocations',
    'POST /api/v1/client-receipts/:id/unallocate',
    'POST /api/v1/client-receipts/:id/reverse'
  ]);
});

test('B18.7 registers Client Receipts only when the database runtime dependency exists', () => {
  const app = read('apps/api/src/app.ts');
  const index = read('apps/api/src/modules/client-receipts/index.ts');
  assert.match(index, /export \{ registerClientReceiptsRoutes, type ClientReceiptsRoutesOptions \}/);
  assert.match(app, /import \{ registerClientReceiptsRoutes \} from '\.\/modules\/client-receipts\/index\.js'/);
  const databaseBlock = app.slice(app.indexOf('if (options.database) {'), app.indexOf('if (options.objectStorage) {'));
  assert.match(databaseBlock, /app\.register\(registerClientReceiptsRoutes, \{ database: options\.database \}\)/);
});

test('B18.7 authenticates every route against the configured database', () => {
  const routes = read(ROUTES);
  assert.match(routes, /authenticateRequest\(request, options\.database\)/);
  assert.equal((routes.match(/preHandler: \[authenticate\]/g) ?? []).length, 6);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 6);
});

test('B18.7 documents unique OpenAPI operation ids and stable success envelopes', () => {
  const routes = read(ROUTES);
  const operations = [...routes.matchAll(/operationId: '([^']+)'/g)].map((match) => match[1]);
  assert.equal(operations.length, 6);
  assert.equal(new Set(operations).size, 6);
  assert.match(routes, /function dataEnvelope/);
  assert.match(routes, /200: dataEnvelope\(RECEIPT_LIST\)/);
  assert.equal((routes.match(/201: dataEnvelope\(RECEIPT\)/g) ?? []).length, 2);
  assert.ok((routes.match(/200: dataEnvelope\(RECEIPT\)/g) ?? []).length >= 3);
});

test('B18.7 documents bounded filters, params and command bodies', () => {
  const routes = read(ROUTES);
  assert.match(routes, /querystring: LIST_QUERY/);
  assert.equal((routes.match(/params: ID_PARAMS/g) ?? []).length, 4);
  assert.match(routes, /body: CREATE_BODY/);
  assert.match(routes, /body: ALLOCATE_BODY/);
  assert.match(routes, /body: UNALLOCATE_BODY/);
  assert.match(routes, /body: EMPTY_BODY/);
  assert.match(routes, /pageSize: \{ type: 'integer', minimum: 1, maximum: 100 \}/);
});

test('B18.7 uses the authoritative Zod schemas at every request and response boundary', () => {
  const routes = read(ROUTES);
  for (const symbol of [
    'listClientReceiptsQuerySchema',
    'createClientReceiptBodySchema',
    'clientReceiptIdParamsSchema',
    'allocateClientReceiptBodySchema',
    'unallocateClientReceiptBodySchema',
    'reverseClientReceiptBodySchema',
    'listClientReceiptsResponseSchema',
    'clientReceiptResponseSchema'
  ]) assert.match(routes, new RegExp(symbol));
  assert.match(routes, /function parseRequest/);
});

test('B18.7 requires Foundation idempotency for all four write commands and not for reads', () => {
  const routes = read(ROUTES);
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS/g) ?? []).length, 4);
  assert.match(routes, /'idempotency-key'/);
  assert.match(routes, /maxLength: 200/);
  assert.equal((routes.match(/readIdempotencyKey\(request\)/g) ?? []).length, 4);
});

test('B18.7 documents the shared error envelope and all five stable Module 16 business codes', () => {
  const routes = read(ROUTES);
  const schema = read('apps/api/src/modules/client-receipts/client-receipts.schema.ts');
  assert.match(routes, /400: ERROR, 401: ERROR, 403: ERROR, 404: ERROR, 409: ERROR, 500: ERROR, 503: ERROR/);
  assert.match(routes, /required: \['code', 'message', 'requestId'\]/);
  for (const code of [
    'RECEIPT_NOT_FOUND',
    'ALLOCATION_EXCEEDS_RECEIPT',
    'ALLOCATION_EXCEEDS_INVOICE',
    'RECEIPT_SCOPE_MISMATCH',
    'RECEIPT_LOCKED'
  ]) assert.match(schema, new RegExp(code));
});

test('B18.7 adds the missing permission-scoped receipt register and detail service reads', () => {
  const service = read(SERVICE);
  assert.match(service, /async listClientReceipts\(query: ListClientReceiptsQuery\)/);
  assert.match(service, /'client_receipts\.read'/);
  assert.match(service, /listClientReceipts\(\{/);
  assert.match(service, /items: result\.items\.map\(receiptResponse\)/);
  assert.match(service, /async getClientReceipt\(receiptId: string\)/);
  assert.match(service, /findClientReceiptById\(receiptId, visibility\)/);
  assert.match(service, /RECEIPT_NOT_FOUND/);
});

test('B18.7 keeps ownership and authoritative totals server-derived', () => {
  const routes = read(ROUTES);
  const service = read(SERVICE);
  assert.doesNotMatch(routes, /companyId|actorUserId|allowedProjectIds|allocatedAmount.*body|unallocatedAmount.*body/);
  assert.doesNotMatch(service, /query\.companyId|query\.allowedProjectIds|query\.permissions/);
  assert.match(service, /resolveVisibility\(new AdministrationRepository\(this\.db\), 'client_receipts\.read'/);
});

test('B18.7 leaves the React feature and Module 21 receipt-link integration for their planned passes', () => {
  const evidence = JSON.parse(read('acceptance-evidence/pass-b18-7-client-receipts-http-openapi.json'));
  assert.equal(evidence.reactFeatureAdded, false);
  assert.equal(evidence.documentsIntegrationAdded, false);
  assert.equal(evidence.nextPass, 'B18.8 Client Receipts reconciliation, audit and Documents proof');
});

test('B18.7 adds no migration and preserves the five-file backend module shape', () => {
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b18_7|client_receipts_http|client_receipts_openapi/i.test(name)), false);
  const files = readdirSync(new URL('apps/api/src/modules/client-receipts/', ROOT)).sort();
  assert.deepEqual(files, [
    'client-receipts.repository.ts',
    'client-receipts.routes.ts',
    'client-receipts.schema.ts',
    'client-receipts.service.ts',
    'index.ts'
  ]);
});
