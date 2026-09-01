import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/supplier-payables';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B16.9 uses only the required simple React feature layout. */
test('B16.9 adds the four-part Supplier Payables React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/supplier-payables-api.ts`,
    `${FEATURE}/hooks/supplier-payables.ts`,
    `${FEATURE}/components/supplier-payables-workspace.tsx`,
    `${FEATURE}/pages/supplier-payables-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the typed browser client maps to exactly the eight frozen Module 17 endpoints. */
test('B16.9 API client matches the frozen eight-route Supplier Payables contract', () => {
  const api = read(`${FEATURE}/api/supplier-payables-api.ts`);
  for (const functionName of [
    'listSupplierInvoices', 'createSupplierInvoice', 'getSupplierInvoice', 'postSupplierInvoice',
    'listSupplierPayments', 'createSupplierPayment', 'allocateSupplierPayment', 'getSupplierAging'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));
  assert.match(api, /supplier-payables\/invoices/);
  assert.match(api, /supplier-payables\/payments/);
  assert.match(api, /\/allocations/);
  assert.match(api, /supplier-payables\/aging/);
  assert.doesNotMatch(api, /method:\s*'DELETE'|method:\s*'PATCH'/);
});

/** Confirm all four retry-sensitive Supplier Payables commands send Foundation idempotency keys. */
test('B16.9 sends Idempotency-Key on invoice create/post and payment create/allocation', () => {
  const api = read(`${FEATURE}/api/supplier-payables-api.ts`);
  assert.match(api, /function commandHeaders\(\): HeadersInit/);
  assert.match(api, /'Idempotency-Key': crypto\.randomUUID\(\)/);
  assert.equal((api.match(/headers: commandHeaders\(\)/g) ?? []).length, 4);
});

/** Confirm TanStack Query owns AP server state and posting refreshes Finance and Job Cost where required. */
test('B16.9 uses TanStack Query with AP Finance and Job Cost invalidation', () => {
  const hooks = read(`${FEATURE}/hooks/supplier-payables.ts`);
  assert.match(hooks, /SUPPLIER_PAYABLES_QUERY_KEY = \['module-17', 'supplier-payables'\]/);
  assert.match(hooks, /FINANCE_QUERY_KEY = \['final21', 'finance'\]/);
  assert.match(hooks, /JOB_COST_QUERY_KEY = \['module-9', 'project-budget-cost'\]/);
  for (const hook of ['useSupplierInvoices', 'useSupplierInvoice', 'useCreateSupplierInvoice', 'usePostSupplierInvoice', 'useSupplierPayments', 'useCreateSupplierPayment', 'useAllocateSupplierPayment', 'useSupplierAging']) {
    assert.match(hooks, new RegExp(`export function ${hook}\\b`));
  }
});

/** Confirm invoice/payment/allocation forms use React Hook Form and Zod rather than local unvalidated state. */
test('B16.9 validates Supplier Payables write forms with React Hook Form and Zod', () => {
  const workspace = read(`${FEATURE}/components/supplier-payables-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useFieldArray/);
  assert.match(workspace, /useForm<InvoiceFormValues>/);
  assert.match(workspace, /useForm<PaymentFormValues>/);
  assert.match(workspace, /useForm<AllocationFormValues>/);
  assert.match(workspace, /positiveMoneySchema/);
  assert.match(workspace, /Due date cannot be earlier than invoice date/i);
});

/** Confirm reference selectors reuse existing Vendor Project Stage Procurement and Finance APIs. */
test('B16.9 reuses existing source-module reads instead of duplicating masters', () => {
  const workspace = read(`${FEATURE}/components/supplier-payables-workspace.tsx`);
  for (const hook of ['useVendors', 'useProjects', 'useProjectStages', 'useProcurementPurchaseOrders', 'useFinanceAccounts', 'useCashBankAccounts']) {
    assert.match(workspace, new RegExp(`\\b${hook}\\b`));
  }
  assert.match(workspace, /Module 10 has no Goods Receipt list route, so this screen does not invent one/);
});

/** Confirm invoice UI covers draft creation, PO/receipt traceability, stage lines and explicit posting. */
test('B16.9 renders the Supplier Invoice workflow and keeps posting explicit', () => {
  const workspace = read(`${FEATURE}/components/supplier-payables-workspace.tsx`);
  assert.match(workspace, /New Supplier Invoice/);
  assert.match(workspace, /purchaseOrderId/);
  assert.match(workspace, /goodsReceiptId/);
  assert.match(workspace, /stageId/);
  assert.match(workspace, /expenseOrInventoryAccountId/);
  assert.match(workspace, /Post Supplier Invoice/);
  assert.doesNotMatch(workspace, /Delete Supplier Invoice|Edit posted invoice/);
});

/** Confirm payment UI covers create/post and allocation without inventing a payment-post route. */
test('B16.9 renders Supplier Payment entry and allocation using the existing command model', () => {
  const workspace = read(`${FEATURE}/components/supplier-payables-workspace.tsx`);
  assert.match(workspace, /Create & post payment/);
  assert.match(workspace, /Allocate payment/);
  assert.match(workspace, /server prevents allocations above either the remaining payment or invoice outstanding/i);
  const api = read(`${FEATURE}/api/supplier-payables-api.ts`);
  assert.doesNotMatch(api, /payments\/\$\{[^}]+\}\/post|supplier-payables\/payments\/[^'`]+\/post/);
});

/** Confirm outstanding and aging stay source-derived and expose project/stage traceability without browser formulas. */
test('B16.9 renders source-derived outstanding aging and stage invoice detail', () => {
  const workspace = read(`${FEATURE}/components/supplier-payables-workspace.tsx`);
  assert.match(workspace, /Outstanding &amp; Aging/);
  assert.match(workspace, /Outstanding is derived from POSTED Supplier Invoices minus immutable POSTED-payment allocations/);
  assert.match(workspace, /row\.outstandingAmount/);
  assert.match(workspace, /row\.ageDays/);
  assert.match(workspace, /line\.stageId/);
});

/** Confirm the page and shell expose Supplier Payables using the frozen permission vocabulary. */
test('B16.9 binds navigation and actions to Supplier Payables permissions', () => {
  const page = read(`${FEATURE}/pages/supplier-payables-page.tsx`);
  for (const permission of ['supplier_payables.read', 'supplier_invoices.create', 'supplier_invoices.post', 'supplier_payments.create', 'supplier_payments.allocate']) {
    assert.match(page, new RegExp(permission.replace('.', '\\.')));
  }
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(shell, /import \{ SupplierPayablesPage \}/);
  assert.match(shell, /canUseSupplierPayables/);
  assert.match(shell, /setView\('supplier-payables'\)/);
  assert.match(shell, />Supplier Payables<\/button>/);
  assert.match(shell, /activeView === 'supplier-payables' && <SupplierPayablesPage \/>/);
});

/** Confirm B16.9 changes no backend route or migration surface. */
test('B16.9 is frontend-only and preserves eight routes plus two Supplier Payables migrations', () => {
  const routes = read('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/supplier-payables/g) ?? []).length, 8);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.deepEqual(migrations.filter((name) => name.includes('final21_supplier_payables')).sort(), [
    '20260829002100_final21_supplier_payables',
    '20260829002200_final21_supplier_payables_contract'
  ]);
});

/** Confirm every named frontend function added or changed in B16.9 has a short purpose comment. */
test('B16.9 keeps changed named functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${FEATURE}/api/supplier-payables-api.ts`,
    `${FEATURE}/hooks/supplier-payables.ts`,
    `${FEATURE}/components/supplier-payables-workspace.tsx`,
    `${FEATURE}/pages/supplier-payables-page.tsx`,
    'apps/web/src/features/administration/components/admin-shell.tsx'
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B16.9 records its frontend acceptance evidence and hands verification to B16.10. */
test('B16.9 records acceptance evidence and hands final verification to B16.10', () => {
  const doc = read('docs/PASS-B16-9-FINAL21-SUPPLIER-PAYABLES-REACT.md');
  const evidence = read('acceptance-evidence/pass-b16-9-supplier-payables-react.json');
  assert.match(doc, /B16\.10/i);
  assert.match(doc, /TanStack Query/i);
  assert.match(doc, /React Hook Form \+ Zod/i);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"backendRouteCount": 8/);
});
