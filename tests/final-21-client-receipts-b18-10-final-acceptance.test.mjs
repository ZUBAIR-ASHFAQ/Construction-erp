import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'apps/api/src/modules/client-receipts';
const FEATURE = 'apps/web/src/features/client-receipts';
const LIVE = 'tests/integration/final-21-client-receipts-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-client-receipts-browser.spec.mjs';

/** Read one project file as UTF-8 text. */
function read(relativePath) { return readFileSync(path.join(ROOT, relativePath), 'utf8'); }

/** Count literal matches without adding another production abstraction. */
function count(text, pattern) { return [...text.matchAll(pattern)].length; }

test('B18.10 freezes the simple Client Receipts module structure', () => {
  assert.deepEqual(readdirSync(path.join(ROOT, MODULE)).sort(), ['client-receipts.repository.ts', 'client-receipts.routes.ts', 'client-receipts.schema.ts', 'client-receipts.service.ts', 'index.ts']);
  assert.deepEqual(readdirSync(path.join(ROOT, FEATURE)).sort(), ['api', 'components', 'hooks', 'pages']);
});

test('B18.10 freezes exactly six Client Receipts HTTP operations', () => {
  const routes = read(`${MODULE}/client-receipts.routes.ts`);
  assert.equal(count(routes, /app\.(?:get|post|put|patch|delete)\('/g), 6);
  for (const operationId of ['listClientReceipts', 'createClientReceipt', 'getClientReceipt', 'allocateClientReceipt', 'unallocateClientReceipt', 'reverseClientReceipt']) assert.match(routes, new RegExp(`operationId: '${operationId}'`));
  assert.equal(count(routes, /headers: IDEMPOTENCY_HEADERS/g), 4);
});

test('B18.10 freezes Client Receipts persistence and adds no migration', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  assert.match(schema, /model ClientReceipt \{/); assert.match(schema, /model ClientReceiptAllocation \{/);
  assert.doesNotMatch(schema, /model ProjectProfitability/);
  const doc = read('docs/PASS-B18-10-FINAL21-CLIENT-RECEIPTS-FINAL-ACCEPTANCE.md');
  assert.match(doc, /adds no database migration/i);
});

test('B18.10 freezes receipt Finance and reconciliation invariants', () => {
  const service = read(`${MODULE}/client-receipts.service.ts`);
  assert.match(service, /CLIENT-ADVANCE/); assert.match(service, /CLIENT-RECEIVABLE/);
  assert.match(service, /client_receipt:/); assert.match(service, /client_receipt_allocation:/);
  assert.match(service, /client_receipt_allocation_reversal:/); assert.match(service, /client_receipt_reversal:/);
  assert.doesNotMatch(service, /CLIENT-REVENUE/);
  const stage = read('apps/api/src/modules/project-stages/project-stages.service.ts');
  assert.match(stage, /allocatedReceiptAmount/); assert.match(stage, /advanceAmount/); assert.match(stage, /outstandingAmount/);
});

test('B18.10 freezes allocation concurrency and immutable correction rules', () => {
  const repository = read(`${MODULE}/client-receipts.repository.ts`);
  const service = read(`${MODULE}/client-receipts.service.ts`);
  assert.match(repository, /FOR UPDATE/); assert.match(service, /ALLOCATION_EXCEEDS_RECEIPT/); assert.match(service, /ALLOCATION_EXCEEDS_INVOICE/);
  assert.match(service, /RECEIPT_LOCKED/); assert.match(service, /unallocateClientReceipt/); assert.match(service, /reverseClientReceipt/);
});

test('B18.10 freezes authorization, errors, idempotency and Documents boundaries', () => {
  const schema = read(`${MODULE}/client-receipts.schema.ts`); const service = read(`${MODULE}/client-receipts.service.ts`); const docs = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  for (const permission of ['client_receipts.read', 'client_receipts.create', 'client_receipts.allocate', 'client_receipts.reverse']) assert.match(schema, new RegExp(permission.replace('.', '\\.')));
  for (const code of ['RECEIPT_NOT_FOUND', 'ALLOCATION_EXCEEDS_RECEIPT', 'ALLOCATION_EXCEEDS_INVOICE', 'RECEIPT_SCOPE_MISMATCH', 'RECEIPT_LOCKED']) assert.match(schema, new RegExp(code));
  assert.match(service, /executeIdempotentCommand/); assert.match(docs, /client_receipt/);
});

test('B18.10 freezes the Client Receipts React workflow', () => {
  const component = read(`${FEATURE}/components/client-receipts-workspace.tsx`); const hooks = read(`${FEATURE}/hooks/client-receipts.ts`);
  for (const text of ['New Client Receipt', 'Create & post receipt', 'Allocate receipt', 'Unallocate', 'Reverse receipt', 'does not treat cash received as profit']) assert.match(component, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(hooks, /useCreateClientReceipt/); assert.match(hooks, /useAllocateClientReceipt/); assert.match(hooks, /useUnallocateClientReceipt/); assert.match(hooks, /useReverseClientReceipt/);
});

test('B18.10 adds guarded live integration and Playwright workflow coverage', () => {
  const live = read(LIVE); const e2e = read(E2E); const config = read('playwright.config.mjs'); const pkg = JSON.parse(read('package.json'));
  for (const text of ['random advance', 'concurrent allocations', 'closed Finance period', 'OpenAPI exposes exactly six']) assert.match(live, new RegExp(text, 'i'));
  for (const text of ['advance -> allocate -> unallocate -> reverse', 'Idempotency-Key', 'does not treat cash received as profit']) assert.match(e2e, new RegExp(text, 'i'));
  assert.match(config, /RUN_FINAL_21_CLIENT_RECEIPTS_E2E/);
  assert.ok(pkg.scripts['test:integration:final-21-client-receipts']); assert.ok(pkg.scripts['test:e2e:final-21-client-receipts']); assert.ok(pkg.scripts['final-21-client-receipts:b18-10:gate']);
});

test('B18.10 keeps one Client Receipts runtime and hands off to Module 19 Project Profitability', () => {
  assert.equal(readdirSync(path.join(ROOT, 'apps/api/src/modules')).filter((name) => /receipt/i.test(name) && name !== 'client-receipts').length, 0);
  assert.equal(readdirSync(path.join(ROOT, 'apps/web/src/features')).filter((name) => /receipt/i.test(name) && name !== 'client-receipts').length, 0);
  const doc = read('docs/PASS-B18-10-FINAL21-CLIENT-RECEIPTS-FINAL-ACCEPTANCE.md'); assert.match(doc, /B19\.1 - Module 19 Project Profitability alignment audit/);
});

test('B18.10 keeps new verification functions junior-readable with purpose comments', () => {
  for (const relativePath of [LIVE, E2E]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      assert.match(lines.slice(Math.max(0, index - 4), index).join('\n'), /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

test('B18.10 records final acceptance evidence and B19 handoff', () => {
  const doc = read('docs/PASS-B18-10-FINAL21-CLIENT-RECEIPTS-FINAL-ACCEPTANCE.md'); const evidence = JSON.parse(read('acceptance-evidence/pass-b18-10-client-receipts-final-acceptance.json'));
  for (const text of ['Invoice payment', 'random advance', 'concurren', 'compensating', 'Project Profitability']) assert.match(doc, new RegExp(text, 'i'));
  assert.equal(evidence.pass, 'B18.10'); assert.equal(evidence.publicRouteCount, 6); assert.equal(evidence.idempotentWriteCount, 4); assert.equal(evidence.databaseMigrationAdded, false); assert.equal(evidence.moduleFrozen, true);
  assert.equal(evidence.nextPass, 'B19.1 Module 19 Project Profitability alignment audit');
});
