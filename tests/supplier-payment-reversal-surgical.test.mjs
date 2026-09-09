import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const BACKEND = 'apps/api/src/modules/supplier-payables';
const WEB = 'apps/web/src/features/supplier-payables';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('supplier payment reversal adds one explicit idempotent API command and REVERSED status', () => {
  const schema = read(`${BACKEND}/supplier-payables.schema.ts`);
  const routes = read(`${BACKEND}/supplier-payables.routes.ts`);
  assert.match(schema, /'POST', route: '\/api\/v1\/supplier-payables\/payments\/:id\/reverse'/);
  assert.match(schema, /SUPPLIER_PAYMENT_STATUS_VALUES = Object\.freeze\(\['DRAFT', 'POSTED', 'REVERSED'\]/);
  assert.match(schema, /reverseSupplierPaymentBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(routes, /app\.post\('\/api\/v1\/supplier-payables\/payments\/:id\/reverse'/);
  assert.match(routes, /operationId: 'reverseSupplierPayment'/);
  assert.match(routes, /headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/);
  assert.match(routes, /service\.reverseSupplierPayment\(params\.id, readIdempotencyKey\(request\)\)/);
});

test('supplier payment reversal is atomic compensating accounting and preserves immutable allocation history', () => {
  const service = read(`${BACKEND}/supplier-payables.service.ts`);
  const repository = read(`${BACKEND}/supplier-payables.repository.ts`);
  const reversal = service.match(/private async reverseSupplierPaymentOnce[\s\S]*?\n  \}\n\n  \/\*\* Allocate one POSTED Supplier Payment/)?.[0] ?? '';
  assert.match(service, /operation: 'supplier-payables\.payments\.reverse'/);
  assert.match(reversal, /lockSupplierPaymentForWrite/);
  assert.match(reversal, /Only POSTED Supplier Payments can be reversed/);
  assert.match(reversal, /findJournalBySourceKey\(originalSourceKey\)/);
  assert.match(reversal, /postSourceReversalInTransaction\(tx/);
  assert.match(reversal, /reversalSourceType: SUPPLIER_PAYMENT_REVERSAL_SOURCE_TYPE/);
  assert.match(reversal, /markSupplierPaymentReversed/);
  assert.match(reversal, /supplier_payment\.reversed/);
  assert.match(repository, /status: 'POSTED'[\s\S]*data: \{ status: 'REVERSED' \}/);
  assert.doesNotMatch(reversal, /supplierPaymentAllocation\.(?:delete|deleteMany|update|updateMany)/);
});

test('reversed payment allocations stop affecting supplier invoice outstanding and aging while history remains', () => {
  const repository = read(`${BACKEND}/supplier-payables.repository.ts`);
  const service = read(`${BACKEND}/supplier-payables.service.ts`);
  assert.match(repository, /allocations:\s*\{\s*where: \{ supplierPayment: \{ status: 'POSTED' \} \}/);
  assert.match(repository, /supplierPayment: \{ companyId: scope\.companyId, status: 'POSTED' \}/);
  assert.match(service, /const isReversed = hasStatus\(row\.status, REVERSED\)/);
  assert.match(service, /const allocated = isReversed \? 0n/);
  assert.match(service, /const remaining = isReversed \? 0n/);
});

test('all direct project cost profitability and billing consumers already exclude reversed Supplier Payments', () => {
  const projects = read('apps/api/src/modules/projects/projects.repository.ts');
  const jobCost = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts');
  const billing = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const profitability = read('apps/api/src/modules/project-profitability/project-profitability.repository.ts');
  assert.match(projects, /supplierPayment\.aggregate\([\s\S]*?status: 'POSTED'/);
  assert.match(jobCost, /supplierPayment\.aggregate\(\{ where: scope\.where\(\{ projectId, status: 'POSTED' \}\)/);
  assert.match(billing, /const paymentWhere = \{ projectId, status: 'POSTED'/);
  assert.match(profitability, /supplierPayment\.findMany\([\s\S]*?status: 'POSTED'/);
});

test('supplier payment UI exposes Reverse only for posted payments and refreshes affected read models', () => {
  const api = read(`${WEB}/api/supplier-payables-api.ts`);
  const hooks = read(`${WEB}/hooks/supplier-payables.ts`);
  const workspace = read(`${WEB}/components/supplier-payables-workspace.tsx`);
  assert.match(api, /export type SupplierPaymentStatus = 'DRAFT' \| 'POSTED' \| 'REVERSED'/);
  assert.match(api, /export function reverseSupplierPayment/);
  assert.match(api, /payments\/\$\{encodeURIComponent\(paymentId\)\}\/reverse/);
  assert.match(hooks, /export function useReverseSupplierPayment/);
  for (const key of ['SUPPLIER_PAYABLES_QUERY_KEY', 'FINANCE_QUERY_KEY', 'JOB_COST_QUERY_KEY', 'PROJECTS_QUERY_KEY', 'PROJECT_PROFITABILITY_QUERY_KEY', 'DASHBOARD_QUERY_KEY', 'CLIENT_BILLING_QUERY_KEY', 'REPORTS_QUERY_KEY']) {
    assert.ok(hooks.includes(key), `missing cache invalidation dependency ${key}`);
  }
  assert.match(workspace, /payment\.status === 'POSTED'[\s\S]*?Reversing…' : 'Reverse'/);
  assert.match(workspace, /value="REVERSED">Reversed<\/option>/);
  assert.match(workspace, /reversePayment\.mutateAsync\(payment\.id\)/);
});

test('payment reversal needs no Prisma or migration change because SupplierPayment status is string-backed', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  const paymentModel = prisma.match(/model SupplierPayment \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(paymentModel, /status\s+String\s+@default\("DRAFT"\)\s+@db\.VarChar\(32\)/);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.deepEqual(migrations.filter((name) => name.includes('final21_supplier_payables')).sort(), [
    '20260829002100_final21_supplier_payables',
    '20260829002200_final21_supplier_payables_contract'
  ]);
});
