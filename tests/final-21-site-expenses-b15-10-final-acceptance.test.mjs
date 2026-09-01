import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/site-expenses';
const web = 'apps/web/src/features/site-expenses';

/** Confirm Final Module 14 remains one simple five-file backend and four-folder React feature. */
test('B15.10 freezes the simple Final-21 Site Expense module structure', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'index.ts',
    'site-expenses.repository.ts',
    'site-expenses.routes.ts',
    'site-expenses.schema.ts',
    'site-expenses.service.ts'
  ]);
  assert.deepEqual(readdirSync(new URL(`../${web}`, import.meta.url)).sort(), ['api', 'components', 'hooks', 'pages']);
});

/** Confirm the public HTTP contract is still exactly the six routes required by Final Module 14. */
test('B15.10 freezes exactly six Site Expense operations with no generic CRUD expansion', () => {
  const schema = read(`${backend}/site-expenses.schema.ts`);
  const expected = [
    "GET', route: '/api/v1/site-expenses'",
    "POST', route: '/api/v1/site-expenses'",
    "GET', route: '/api/v1/site-expenses/:id'",
    "PATCH', route: '/api/v1/site-expenses/:id'",
    "POST', route: '/api/v1/site-expenses/:id/post'",
    "POST', route: '/api/v1/site-expenses/:id/reverse'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/site-expenses/g) ?? []).length, 6);
  assert.doesNotMatch(schema, /DELETE'.*site-expenses|\/approve|\/archive|\/categories/);
});

/** Confirm Site Expense persistence and forward migrations stay within the approved two-table scope. */
test('B15.10 freezes Site Expense persistence and preserves migration history', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model ExpenseCategory \{/);
  assert.match(prisma, /model SiteExpense \{/);
  assert.match(prisma, /@@map\("expense_categories"\)/);
  assert.match(prisma, /@@map\("site_expenses"\)/);
  assert.equal(existsSync(new URL('../packages/database/prisma/migrations/20260829001900_final21_site_expenses/migration.sql', import.meta.url)), true);
  assert.equal(existsSync(new URL('../packages/database/prisma/migrations/20260829002000_final21_site_expense_contract/migration.sql', import.meta.url)), true);
  const matching = readdirSync(new URL('../packages/database/prisma/migrations', import.meta.url)).filter((name) => /site_expense/i.test(name));
  assert.deepEqual(matching.sort(), ['20260829001900_final21_site_expenses', '20260829002000_final21_site_expense_contract']);
});

/** Confirm posting and reversal keep Finance and Project Cost source history deterministic and compensating. */
test('B15.10 freezes atomic idempotent Site Expense posting and reversal invariants', () => {
  const service = read(`${backend}/site-expenses.service.ts`);
  assert.match(service, /site_expense:\$\{expenseId\}/);
  assert.match(service, /site_expense_reversal:\$\{expenseId\}/);
  assert.match(service, /postSourceJournalInTransaction/);
  assert.match(service, /costActual/);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.doesNotMatch(service, /deleteMany\(|delete\(/);
});

/** Confirm the frozen permission, error and event vocabulary remains present at the module boundary. */
test('B15.10 freezes Site Expense permissions stable errors and domain events', () => {
  const schema = read(`${backend}/site-expenses.schema.ts`);
  const service = read(`${backend}/site-expenses.service.ts`);
  for (const code of ['site_expenses.read', 'site_expenses.create', 'site_expenses.update', 'site_expenses.post', 'site_expenses.reverse']) {
    assert.ok(schema.includes(`'${code}'`), `missing permission ${code}`);
  }
  for (const code of ['EXPENSE_NOT_FOUND', 'EXPENSE_LOCKED', 'INVALID_EXPENSE_ACCOUNT', 'INVALID_EXPENSE_STAGE']) {
    assert.ok(schema.includes(`'${code}'`), `missing error ${code}`);
  }
  for (const event of ['site_expense.created', 'site_expense.posted', 'site_expense.reversed']) {
    assert.ok(service.includes(`'${event}'`), `missing event ${event}`);
  }
});

/** Confirm Module 21 remains the evidence owner and Site Expense does not duplicate file storage. */
test('B15.10 freezes secure Site Expense evidence integration through Documents', () => {
  const documentService = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  const documentRepository = read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
  const siteRepository = read(`${backend}/site-expenses.repository.ts`);
  assert.match(documentService, /site_expense/);
  assert.match(documentRepository, /siteExpense/);
  assert.match(siteRepository, /findProjectEvidenceDocument/);
  assert.doesNotMatch(siteRepository, /storageKey|signedUrl|Buffer|Blob/);
});

/** Confirm the React surface preserves controlled draft, post and reversal behavior without adding source ownership. */
test('B15.10 freezes the permission-aware Site Expense React workflow', () => {
  const workspace = read(`${web}/components/site-expenses-workspace.tsx`);
  const api = read(`${web}/api/site-expenses-api.ts`);
  const hooks = read(`${web}/hooks/site-expenses.ts`);
  const page = read(`${web}/pages/site-expenses-page.tsx`);
  assert.match(workspace, /New Site Expense/);
  assert.match(workspace, /Create Draft Expense/);
  assert.match(workspace, /Post Expense/);
  assert.match(workspace, /Reverse Expense/);
  assert.match(workspace, /Posted history is immutable/);
  assert.match(api, /Idempotency-Key/);
  assert.match(hooks, /usePostSiteExpense/);
  assert.match(hooks, /useReverseSiteExpense/);
  assert.match(page, /site_expenses\.post/);
  assert.match(page, /site_expenses\.reverse/);
});

/** Confirm a real Playwright workflow is wired as the final browser acceptance gate before B16. */
test('B15.10 adds the Final-21 Site Expense Playwright acceptance workflow', () => {
  const spec = read('tests/e2e/final-21-site-expenses-browser.spec.mjs');
  const config = read('playwright.config.mjs');
  const pkg = JSON.parse(read('package.json'));
  assert.match(spec, /Create Draft Expense/);
  assert.match(spec, /Post Expense/);
  assert.match(spec, /Reverse Expense/);
  assert.match(spec, /site_expense_reversal:/);
  assert.match(config, /RUN_FINAL_21_SITE_EXPENSES_E2E/);
  assert.match(config, /final-21-site-expenses-browser\.spec\.mjs/);
  assert.ok(pkg.scripts['test:e2e:final-21-site-expenses']);
});

/** Confirm no excluded Final-21 business scope is reintroduced by Site Expense completion. */
test('B15.10 does not reintroduce excluded modules or duplicate Site Expense runtimes', () => {
  for (const path of [
    'apps/api/src/modules/site-expense-approvals',
    'apps/api/src/modules/site-expense-categories',
    'apps/web/src/features/site-expense-approvals',
    'apps/web/src/features/site-expense-categories'
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} should not exist`);
  const app = read('apps/api/src/app.ts');
  assert.equal((app.match(/registerSiteExpensesRoutes/g) ?? []).length >= 2, true);
  assert.doesNotMatch(app, /registerSiteExpenseApprovals|registerSiteExpenseCategories/);
});

/** Confirm changed B15 named functions and methods keep short purpose comments for junior readability. */
test('B15.10 keeps Site Expense named functions junior-readable with purpose comments', () => {
  const paths = [
    `${backend}/site-expenses.schema.ts`,
    `${backend}/site-expenses.repository.ts`,
    `${backend}/site-expenses.service.ts`,
    `${backend}/site-expenses.routes.ts`,
    `${web}/api/site-expenses-api.ts`,
    `${web}/hooks/site-expenses.ts`,
    `${web}/components/site-expenses-workspace.tsx`,
    `${web}/pages/site-expenses-page.tsx`
  ];
  for (const path of paths) {
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
