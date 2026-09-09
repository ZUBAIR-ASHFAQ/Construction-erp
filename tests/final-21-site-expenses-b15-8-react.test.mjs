import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const FEATURE = 'apps/web/src/features/site-expenses';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm the Final-21 React feature uses only the required api/hooks/components/pages layout. */
test('B15.8 adds the simple four-part Site Expense React feature structure', () => {
  for (const relativePath of [
    `${FEATURE}/api/site-expenses-api.ts`,
    `${FEATURE}/hooks/site-expenses.ts`,
    `${FEATURE}/components/site-expenses-workspace.tsx`,
    `${FEATURE}/pages/site-expenses-page.tsx`
  ]) {
    assert.equal(exists(relativePath), true, `missing ${relativePath}`);
  }

  const entries = readdirSync(new URL(`../${FEATURE}/`, import.meta.url), { withFileTypes: true })
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(entries, ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the browser client calls exactly the six frozen Site Expense endpoints. */
test('B15.8 typed API client matches the frozen six-route Module 14 contract', () => {
  const api = read(`${FEATURE}/api/site-expenses-api.ts`);
  for (const functionName of [
    'listSiteExpenses',
    'createSiteExpense',
    'getSiteExpense',
    'updateSiteExpense',
    'postSiteExpense',
    'reverseSiteExpense'
  ]) {
    assert.match(api, new RegExp(`export function ${functionName}\\b`));
  }
  assert.match(api, /authenticatedRequest<SiteExpensePage>\(`site-expenses\$\{siteExpenseQuery\(input\)\}`\)/);
  assert.match(api, /`site-expenses\/\$\{encodeURIComponent\(expenseId\)\}`/);
  assert.match(api, /`site-expenses\/\$\{encodeURIComponent\(expenseId\)\}\/post`/);
  assert.match(api, /`site-expenses\/\$\{encodeURIComponent\(expenseId\)\}\/reverse`/);
  assert.doesNotMatch(api, /site-expenses\/categories|method:\s*'DELETE'/);
});

/** Confirm all Site Expense writes keep Foundation idempotency headers in the browser client. */
test('B15.8 sends Idempotency-Key for create update post and reverse', () => {
  const api = read(`${FEATURE}/api/site-expenses-api.ts`);
  assert.match(api, /function siteExpenseCommandHeaders\(\): HeadersInit/);
  assert.match(api, /'Idempotency-Key': crypto\.randomUUID\(\)/);
  assert.equal((api.match(/headers: siteExpenseCommandHeaders\(\)/g) ?? []).length, 4);
});

/** Confirm TanStack Query owns Site Expense server state and posting refreshes Finance and Job Cost reads. */
test('B15.8 uses TanStack Query and invalidates cross-module posting reads', () => {
  const hooks = read(`${FEATURE}/hooks/site-expenses.ts`);
  assert.match(hooks, /useMutation, useQuery, useQueryClient/);
  assert.match(hooks, /SITE_EXPENSE_QUERY_KEY = \['module-14', 'site-expenses'\]/);
  assert.match(hooks, /FINANCE_QUERY_KEY = \['final21', 'finance'\]/);
  assert.match(hooks, /JOB_COST_QUERY_KEY = \['module-9', 'project-budget-cost'\]/);
  assert.match(hooks, /useSiteExpenses/);
  assert.match(hooks, /useSiteExpense/);
  assert.match(hooks, /useCreateSiteExpense/);
  assert.match(hooks, /useUpdateSiteExpense/);
  assert.match(hooks, /usePostSiteExpense/);
  assert.match(hooks, /useReverseSiteExpense/);
});

/** Confirm forms use React Hook Form plus Zod and preserve the CASH/BANK account rule. */
test('B15.8 validates create and edit forms with React Hook Form and Zod', () => {
  const workspace = read(`${FEATURE}/components/site-expenses-workspace.tsx`);
  assert.match(workspace, /zodResolver/);
  assert.match(workspace, /useForm<SiteExpenseFormValues>/);
  assert.match(workspace, /siteExpenseFormSchema/);
  assert.match(workspace, /paymentMode === 'CASH' \|\| value\.paymentMode === 'BANK'/);
  assert.match(workspace, /cashBankAccountId/);
  assert.match(workspace, /amount: moneySchema/);
  assert.match(workspace, /expenseDate: dateSchema/);
});

/** Confirm the page keeps direct entry and adds only a compact immutable Expense List, not the old register workflow. */
test('B15.8 keeps direct expense entry with compact history and no draft register workflow', () => {
  const workspace = read(`${FEATURE}/components/site-expenses-workspace.tsx`);
  assert.match(workspace, /New Site Expense/);
  assert.match(workspace, /Add Site Expense/);
  assert.match(workspace, /Cash \/ Bank account/);
  assert.match(workspace, /createMutation\.mutateAsync\(expenseWriteInput\(values\)\)/);
  assert.match(workspace, /Expense List/);
  assert.match(workspace, /useSiteExpenses\(\{ page: 1, pageSize: 100 \}/);
  assert.doesNotMatch(workspace, /Site Expense register|SiteExpenseRegister|Save Draft Changes|Post Expense|onSelect/);
});

/** Confirm Project Stage Finance and Documents reads are reused instead of duplicating their source APIs. */
test('B15.8 reuses existing Project Stage Finance and Documents hooks for reference selectors', () => {
  const workspace = read(`${FEATURE}/components/site-expenses-workspace.tsx`);
  assert.match(workspace, /useProjects/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /useCashBankAccounts/);
  assert.match(workspace, /useDocuments/);
  assert.match(workspace, /Project-level expense/);
  assert.match(workspace, /Evidence document \(optional\)/);
});

/** Confirm the UI does not invent an unsupported category endpoint absent from the frozen Module 14 contract. */
test('B15.8 handles configured category IDs without inventing category CRUD', () => {
  const workspace = read(`${FEATURE}/components/site-expenses-workspace.tsx`);
  const api = read(`${FEATURE}/api/site-expenses-api.ts`);
  assert.match(workspace, /frozen Module 14 API has no separate category-catalog route/i);
  assert.match(workspace, /Configured expense category UUID/);
  assert.doesNotMatch(api, /categories/);
});

/** Confirm draft/detail/edit controls stay absent while only POSTED expense history can be reversed. */
test('B15.8 posts from create and exposes reversal only for posted expense history', () => {
  const workspace = read(`${FEATURE}/components/site-expenses-workspace.tsx`);
  assert.match(workspace, /Saving posts the expense to Project Cost and Finance immediately/);
  assert.match(workspace, /createMutation\.mutateAsync\(expenseWriteInput\(values\)\)/);
  assert.match(workspace, /useReverseSiteExpense/);
  assert.match(workspace, /expense\.status === 'POSTED'/);
  assert.match(workspace, /reverseMutation\.mutateAsync\(expenseId\)/);
  assert.doesNotMatch(workspace, /SiteExpenseDetail|Save Draft Changes|Post Expense|selectedExpense|selectedId/);
});

/** Confirm page actions are hidden by the five Final Module 14 permissions. */
test('B15.8 binds Site Expense actions to the frozen permission vocabulary', () => {
  const page = read(`${FEATURE}/pages/site-expenses-page.tsx`);
  for (const permission of [
    'site_expenses.read',
    'site_expenses.create',
    'site_expenses.update',
    'site_expenses.post',
    'site_expenses.reverse'
  ]) {
    assert.match(page, new RegExp(`usePermission\\('${permission.replace('.', '\\.')}\\'\\)`));
  }
});

/** Confirm AdminShell navigation exposes Site Expenses only to a plausible authorized scope. */
test('B15.8 registers Site Expense navigation and content in the existing lightweight shell', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(shell, /import \{ SiteExpensesPage \}/);
  assert.match(shell, /hasSiteExpenseCompanyPermission/);
  assert.match(shell, /canUseSiteExpenses/);
  assert.match(shell, /setView\('site-expenses'\)/);
  assert.match(shell, />Site Expenses<\/button>/);
  assert.match(shell, /activeView === 'site-expenses' && <SiteExpensesPage \/>/);
});

/** Confirm B15.8 does not change the frozen backend route count or migration history. */
test('B15.8 is frontend-only and preserves six backend routes plus two Site Expense migrations', () => {
  const routes = read('apps/api/src/modules/site-expenses/site-expenses.routes.ts');
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/site-expenses/g) ?? []).length, 6);

  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.deepEqual(migrations.filter((name) => name.includes('final21_site_expense')).sort(), [
    '20260829001900_final21_site_expenses',
    '20260829002000_final21_site_expense_contract'
  ]);
});

/** Confirm named functions added or changed for B15.8 remain short-purpose commented. */
test('B15.8 keeps changed named functions junior-readable with purpose comments', () => {
  for (const relativePath of [
    `${FEATURE}/api/site-expenses-api.ts`,
    `${FEATURE}/hooks/site-expenses.ts`,
    `${FEATURE}/components/site-expenses-workspace.tsx`,
    `${FEATURE}/pages/site-expenses-page.tsx`,
    'apps/web/src/features/administration/components/admin-shell.tsx',
    'apps/web/src/features/documents-audit/hooks/documents.ts'
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
