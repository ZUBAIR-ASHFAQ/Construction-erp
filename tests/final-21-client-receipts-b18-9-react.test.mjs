import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/client-receipts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm B18.9 adds only the required four-part Client Receipts React feature. */
test('B18.9 adds the simple four-part Client Receipts React feature', () => {
  for (const relativePath of [
    `${FEATURE}/api/client-receipts-api.ts`,
    `${FEATURE}/hooks/client-receipts.ts`,
    `${FEATURE}/components/client-receipts-workspace.tsx`,
    `${FEATURE}/pages/client-receipts-page.tsx`
  ]) assert.equal(exists(relativePath), true, `missing ${relativePath}`);

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the browser client uses exactly the six Module 16 routes. */
test('B18.9 keeps the exact six Client Receipts API operations', () => {
  const api = read(`${FEATURE}/api/client-receipts-api.ts`);
  for (const functionName of [
    'listClientReceipts', 'createClientReceipt', 'getClientReceipt',
    'allocateClientReceipt', 'unallocateClientReceipt', 'reverseClientReceipt'
  ]) assert.match(api, new RegExp(`export function ${functionName}\\b`));
  assert.match(api, /ClientReceiptPaymentMethod = 'CASH' \| 'BANK'/);
  assert.match(api, /ClientReceiptType = 'ADVANCE' \| 'INVOICE_PAYMENT'/);
  assert.match(api, /ClientReceiptStatus = 'POSTED' \| 'REVERSED'/);
  assert.equal((api.match(/authenticatedRequest<[^>]+>\(`?client-receipts/g) ?? []).length >= 1, true);
  assert.doesNotMatch(api, /method:\s*'PATCH'|method:\s*'PUT'|method:\s*'DELETE'/);
});

/** Confirm new Receipt creation uses real source-module selectors rather than raw UUID entry. */
test('B18.9 uses Client Project Stage and Cash Bank selectors without raw IDs', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /useClients\(/);
  assert.match(workspace, /useProjects\(/);
  assert.match(workspace, /useProjectStages\(/);
  assert.match(workspace, /useCashBankAccounts\(/);
  assert.match(workspace, /Select client/);
  assert.match(workspace, /Select project/);
  assert.match(workspace, /Stage \(optional\)/);
  assert.match(workspace, /Select matching account/);
  assert.doesNotMatch(workspace, /Client ID|Project ID|Stage ID|Cash.*Account ID|placeholder="UUID|Enter a valid UUID/);
});

/** Confirm payment method and Cash Bank account selection stay consistent with Finance ownership. */
test('B18.9 filters Cash Bank accounts by the selected payment method', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /receiptPaymentMethod = receiptForm\.watch\('paymentMethod'\)/);
  assert.match(workspace, /account\.accountType\.toUpperCase\(\) === receiptPaymentMethod/);
  assert.match(workspace, /Balance \{displayMoney\(account\.balance\)\}/);
  assert.match(workspace, /receiptForm\.setValue\('cashBankAccountId', ''\)/);
});

/** Confirm the UI displays server-derived received allocated and advance values without treating cash as profit. */
test('B18.9 displays source-derived Receipt balances and keeps cash separate from profit', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /receipt\.allocatedAmount/);
  assert.match(workspace, /receipt\.unallocatedAmount/);
  assert.match(workspace, /Advance \/ unallocated/);
  assert.match(workspace, /It is not profit/);
  assert.match(workspace, /This screen does not treat cash received as profit/);
  assert.doesNotMatch(workspace, /Number\([^)]*amount[^)]*\)\s*-\s*Number\([^)]*allocatedAmount/);
  assert.doesNotMatch(workspace, /profitAmount|profitTotal|receivedAmount\s*[-+*/]/);
});

/** Confirm allocation uses issued Client Invoice selection and leaves authoritative outstanding on the server. */
test('B18.9 allocates only through issued Invoice selectors and server outstanding checks', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /allocationInvoicesQuery = useClientInvoices\(\{[\s\S]*?projectId: allocationProjectId[\s\S]*?status: 'ISSUED'/);
  assert.match(workspace, /status: 'ISSUED'/);
  assert.match(workspace, /Select invoice/);
  assert.match(workspace, /server rechecks current Invoice outstanding and prevents over-allocation/);
  assert.match(workspace, /this UI does not accept raw Invoice IDs/);
  assert.doesNotMatch(workspace, /invoiceOutstanding\s*=|totalAmount\s*-\s*allocated/);
});

/** Confirm allocation reversal and Receipt reversal use controlled commands and visible current allocations. */
test('B18.9 exposes controlled allocation and receipt reversal actions', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /useUnallocateClientReceipt/);
  assert.match(workspace, />Unallocate</);
  assert.match(workspace, /useReverseClientReceipt/);
  assert.match(workspace, />Reverse receipt</);
  assert.match(workspace, /receiptDetailQuery\.data\.allocations\.length === 0/);
  assert.doesNotMatch(workspace, /splice\(|filter\([^)]*allocation.*set|method:\s*'DELETE'/);
});

/** Confirm successful Client Receipt commands refresh every dependent financial read family. */
test('B18.9 refreshes Receipt Billing Stage Finance and Client reads after commands', () => {
  const hooks = read(`${FEATURE}/hooks/client-receipts.ts`);
  for (const token of [
    "CLIENT_RECEIPTS_QUERY_KEY = ['module-16', 'client-receipts']",
    "CLIENT_BILLING_QUERY_KEY = ['client-billing']",
    "PROJECT_STAGES_QUERY_KEY = ['module-7', 'project-stages']",
    "FINANCE_QUERY_KEY = ['final21', 'finance']",
    "CLIENTS_QUERY_KEY = ['clients']"
  ]) assert.ok(hooks.includes(token), `missing ${token}`);
  assert.match(hooks, /refreshReceiptEffects/);
});

/** Confirm the workspace is permission-aware and is integrated into the existing shell without a new router. */
test('B18.9 integrates Client Receipts into the permission-aware shell', () => {
  const page = read(`${FEATURE}/pages/client-receipts-page.tsx`);
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(page, /client_receipts\.read/);
  assert.match(page, /client_receipts\.create/);
  assert.match(page, /client_receipts\.allocate/);
  assert.match(page, /client_receipts\.reverse/);
  assert.match(shell, /ClientReceiptsPage/);
  assert.match(shell, /'client-receipts'/);
  assert.match(shell, /Client Receipts \/ Payments/);
  assert.doesNotMatch(shell, /react-router|BrowserRouter|Routes>/);
});

/** Confirm browser write forms use React Hook Form plus Zod and stay bounded by server contracts. */
test('B18.9 uses React Hook Form plus Zod for Receipt and allocation writes', () => {
  const workspace = read(`${FEATURE}/components/client-receipts-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm<ReceiptForm>/);
  assert.match(workspace, /useForm<AllocationForm>/);
  assert.match(workspace, /positiveMoneySchema/);
  assert.match(workspace, /z\.enum\(\['CASH', 'BANK'\]\)/);
  assert.match(workspace, /z\.enum\(\['ADVANCE', 'INVOICE_PAYMENT'\]\)/);
});

/** Confirm B18.9 is frontend-only and does not change backend routes or database migrations. */
test('B18.9 changes no Client Receipts backend route or migration surface', () => {
  const routes = read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/client-receipts/g) ?? []).length, 6);
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /b18_9|client_receipts.*react/i.test(name)), false);
});

/** Confirm every named frontend function changed in B18.9 keeps a short purpose comment. */
test('B18.9 keeps changed named functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${FEATURE}/api/client-receipts-api.ts`,
    `${FEATURE}/hooks/client-receipts.ts`,
    `${FEATURE}/components/client-receipts-workspace.tsx`,
    `${FEATURE}/pages/client-receipts-page.tsx`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

/** Confirm B18.9 records frontend boundaries and hands final verification to B18.10. */
test('B18.9 records React evidence and hands final verification to B18.10', () => {
  const doc = read('docs/PASS-B18-9-FINAL21-CLIENT-RECEIPTS-REACT.md');
  const evidence = read('acceptance-evidence/pass-b18-9-client-receipts-react.json');
  assert.match(doc, /React Hook Form/i);
  assert.match(doc, /advance \/ unallocated/i);
  assert.match(doc, /B18\.10/i);
  assert.match(evidence, /"databaseMigrationAdded": false/);
  assert.match(evidence, /"backendRouteCount": 6/);
});
