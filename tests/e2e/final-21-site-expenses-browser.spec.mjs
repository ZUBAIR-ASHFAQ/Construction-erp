import { expect, test } from '@playwright/test';

const PASSWORD = 'Final21-B15.10-browser-password!';
const COMPANY_ID = '00000000-0000-4000-8000-000000015100';
const USER_ID = '00000000-0000-4000-8000-000000015101';
const ROLE_ID = '00000000-0000-4000-8000-000000015102';
const CLIENT_ID = '00000000-0000-4000-8000-000000015103';
const PROJECT_ID = '00000000-0000-4000-8000-000000015104';
const STAGE_ID = '00000000-0000-4000-8000-000000015105';
const EXPENSE_GL_ID = '00000000-0000-4000-8000-000000015106';
const BANK_GL_ID = '00000000-0000-4000-8000-000000015107';
const BANK_ID = '00000000-0000-4000-8000-000000015108';
const CATEGORY_ID = '00000000-0000-4000-8000-000000015109';
const PERIOD_ID = '00000000-0000-4000-8000-000000015110';
const EMAIL = 'b15-10-site-expense@example.test';

const PERMISSIONS = [
  'site_expenses.read',
  'site_expenses.create',
  'site_expenses.update',
  'site_expenses.post',
  'site_expenses.reverse',
  'projects.read',
  'stages.read',
  'finance.read'
];

let database;

/** Seed the smallest Final-21 Project, Stage and Finance graph required by the Site Expense browser workflow. */
async function seedSiteExpenseBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'B15.10 Site Expense Browser Ltd',
      displayName: 'B15.10 Site Expense Browser',
      status: 'ACTIVE',
      baseCurrency: 'PKR',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  const permissions = [];
  for (const code of PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { description: code, domain: code.split('.')[0] },
      create: { code, description: code, domain: code.split('.')[0] }
    }));
  }

  await database.role.create({
    data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'b15-10-manager', name: 'B15.10 Manager', isSystem: false, status: 'ACTIVE' }
  });
  await database.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: ROLE_ID, permissionCode: permission.code }))
  });
  await database.user.create({
    data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B15.10 Manager', passwordHash, status: 'ACTIVE' }
  });
  await database.userRole.create({
    data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' }
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'B1510-CLIENT',
      legalName: 'B15.10 Client Ltd',
      displayName: 'B15.10 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE'
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'B1510-PROJECT',
      name: 'B15.10 Construction Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'PKR',
      projectModel: 'FIXED_PRICE',
      projectValue: '50000000.00',
      startDate: new Date('2026-07-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-06-30T00:00:00.000Z'),
      projectManagerUserId: USER_ID
    }
  });
  await database.projectStage.create({
    data: {
      id: STAGE_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      code: 'GREY',
      name: 'Grey Structure',
      sequenceNo: 1,
      weightPercent: '40.0000',
      plannedAmount: '20000000.00',
      status: 'ACTIVE'
    }
  });

  await database.glAccount.createMany({
    data: [
      { id: EXPENSE_GL_ID, companyId: COMPANY_ID, accountCode: 'SITE-EXPENSE', name: 'Site Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: BANK_GL_ID, companyId: COMPANY_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' }
    ]
  });
  await database.cashBankAccount.create({
    data: { id: BANK_ID, companyId: COMPANY_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_ID, status: 'ACTIVE' }
  });
  await database.expenseCategory.create({
    data: { id: CATEGORY_ID, companyId: COMPANY_ID, code: 'FUEL', name: 'Fuel', defaultGlAccountId: EXPENSE_GL_ID, status: 'ACTIVE' }
  });
  await database.fiscalPeriod.create({
    data: { id: PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' }
  });
  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'site-expense', prefix: 'SE-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
}

/** Sign in through the shared Final-21 browser authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture Site Expense browser calls so the frozen six-route authority boundary can be verified. */
function trackSiteExpenseRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/site-expenses')) return;
    requests.push({
      method: request.method(),
      pathname: url.pathname,
      idempotencyKey: request.headers()['idempotency-key'] ?? null
    });
  });
  return requests;
}

/** Return true only for one of the six frozen Final Module 14 API operations. */
function isAllowedSiteExpensePath(method, pathname) {
  if (pathname === '/api/v1/site-expenses') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/site-expenses\/[^/]+$/.test(pathname)) return method === 'GET' || method === 'PATCH';
  if (/^\/api\/v1\/site-expenses\/[^/]+\/(?:post|reverse)$/.test(pathname)) return method === 'POST';
  return false;
}

test.beforeAll(async () => {
  await seedSiteExpenseBrowserScenario();
});

test.afterAll(async () => {
  await database?.$disconnect();
});

test('Final-21 Site Expense create, post and reverse browser workflow preserves Finance and Job Cost history', async ({ page }) => {
  const requests = trackSiteExpenseRequests(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Site Expenses' }).click();
  await expect(page.getByRole('heading', { name: 'Site Expense Management' })).toBeVisible();

  const form = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'New Site Expense' }) }).locator('form');
  await form.getByLabel('Project').selectOption(PROJECT_ID);
  await form.getByLabel('Stage (optional)').selectOption(STAGE_ID);
  await form.getByLabel('Expense date').fill('2026-08-29');
  await form.getByLabel('Expense category ID').fill(CATEGORY_ID);
  await form.getByLabel('Description').fill('Diesel for site generator');
  await form.getByLabel('Amount').fill('12500.00');
  await form.getByLabel('Payment treatment').selectOption('BANK');
  await form.getByLabel('Cash / Bank account').selectOption(BANK_ID);
  await form.getByRole('button', { name: 'Create Draft Expense' }).click();

  const detail = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'SE-00001' }) });
  await expect(detail).toBeVisible();
  await expect(detail.getByText('DRAFT', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Post Expense' }).click();
  await expect(detail.getByText('POSTED', { exact: true })).toBeVisible();
  await detail.getByRole('button', { name: 'Reverse Expense' }).click();
  await expect(detail.getByText('REVERSED', { exact: true })).toBeVisible();

  const expense = await database.siteExpense.findFirstOrThrow({ where: { companyId: COMPANY_ID, expenseNo: 'SE-00001' } });
  const costRows = await database.costActual.findMany({
    where: { companyId: COMPANY_ID, sourceKey: { in: [`site_expense:${expense.id}`, `site_expense_reversal:${expense.id}`] } },
    orderBy: { sourceKey: 'asc' }
  });
  const journals = await database.journal.findMany({
    where: { companyId: COMPANY_ID, sourceKey: { in: [`site_expense:${expense.id}`, `site_expense_reversal:${expense.id}`] } },
    include: { lines: true },
    orderBy: { sourceKey: 'asc' }
  });

  expect(expense.status).toBe('REVERSED');
  expect(costRows).toHaveLength(2);
  expect(costRows.reduce((sum, row) => sum + Number(row.amount), 0)).toBe(0);
  expect(journals).toHaveLength(2);
  for (const journal of journals) {
    const debit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBe(credit);
  }

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedSiteExpensePath(request.method, request.pathname)).toBe(true);
    if (request.method !== 'GET') expect(request.idempotencyKey).toBeTruthy();
  }
});
