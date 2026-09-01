import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass209-Finance-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000020900';
const ADMIN_ID = '00000000-0000-4000-8000-000000020910';
const VIEWER_ID = '00000000-0000-4000-8000-000000020911';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000020920';
const VIEWER_ROLE_ID = '00000000-0000-4000-8000-000000020921';
const CASH_ACCOUNT_ID = '00000000-0000-4000-8000-000000020930';
const EXPENSE_ACCOUNT_ID = '00000000-0000-4000-8000-000000020931';
const OPEN_PERIOD_ID = '00000000-0000-4000-8000-000000020940';
const ADMIN_EMAIL = 'pass209-finance-admin@example.test';
const VIEWER_EMAIL = 'pass209-finance-viewer@example.test';
const FINANCE_PERMISSIONS = [
  'finance.accounts.read',
  'finance.journals.read',
  'finance.journals.create',
  'finance.journals.post',
  'finance.periods.close',
  'finance.reports.read'
];

let database;

/** Seed one small Company-level Finance scenario for the real browser workflow. */
async function seedScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);

  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'Pass 209 Finance Company Limited',
      displayName: 'Pass 209 Finance Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of FINANCE_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'finance' },
      create: { code, name: code, domain: 'finance' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'pass209-finance-admin', name: 'Pass 209 Finance Admin', isSystem: false, status: 'ACTIVE' },
      { id: VIEWER_ROLE_ID, companyId: COMPANY_ID, code: 'pass209-finance-viewer', name: 'Pass 209 Finance Viewer', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await database.rolePermission.createMany({
    data: [
      ...FINANCE_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: VIEWER_ROLE_ID, permissionId: permissionByCode.get('finance.accounts.read') },
      { roleId: VIEWER_ROLE_ID, permissionId: permissionByCode.get('finance.reports.read') }
    ]
  });

  await database.user.createMany({
    data: [
      { id: ADMIN_ID, companyId: COMPANY_ID, email: ADMIN_EMAIL, name: 'Pass 209 Finance Admin', status: 'ACTIVE' },
      { id: VIEWER_ID, companyId: COMPANY_ID, email: VIEWER_EMAIL, name: 'Pass 209 Finance Viewer', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [ADMIN_ID, VIEWER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: VIEWER_ID, roleId: VIEWER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await database.glAccount.createMany({
    data: [
      { id: CASH_ACCOUNT_ID, companyId: COMPANY_ID, accountCode: '1000', name: 'Cash', accountType: 'ASSET', parentId: null, status: 'ACTIVE' },
      { id: EXPENSE_ACCOUNT_ID, companyId: COMPANY_ID, accountCode: '5000', name: 'Project Expense', accountType: 'EXPENSE', parentId: null, status: 'ACTIVE' }
    ]
  });

  await database.fiscalPeriod.create({
    data: {
      id: OPEN_PERIOD_ID,
      companyId: COMPANY_ID,
      fiscalYear: 2026,
      periodNo: 1,
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-01-31T00:00:00.000Z'),
      status: 'OPEN'
    }
  });

  await database.numberSequence.create({
    data: {
      companyId: COMPANY_ID,
      sequenceKey: 'finance.journal',
      prefix: 'JRN-209-',
      suffix: '',
      padWidth: 4,
      nextValue: 1n,
      incrementBy: 1n,
      status: 'ACTIVE'
    }
  });
}

/** Sign in through the real shared authentication form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the permission-aware Finance Core workspace. */
async function openFinance(page) {
  await page.getByRole('button', { name: 'Finance Core' }).click();
  await expect(page.getByRole('heading', { name: 'Finance Core' })).toBeVisible();
}

/** Record Finance requests so the browser-owned authority boundary can be verified. */
function trackFinanceRequests(page) {
  const requests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/finance/')) return;

    let body = null;
    if (request.postData()) {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }

    requests.push({
      method: request.method(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body
    });
  });

  return requests;
}

/** Assert Finance browser calls stay inside the reviewed six-operation Stage-11 contract. */
function assertFinanceAuthorityBoundary(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'journalNo',
    'periodId',
    'sourceType',
    'sourceId',
    'status',
    'totalDebit',
    'totalCredit'
  ];
  const allowedPath = (pathname) => pathname === '/api/v1/finance/accounts'
    || pathname === '/api/v1/finance/journals'
    || /^\/api\/v1\/finance\/journals\/[^/]+\/(post|reverse)$/.test(pathname)
    || pathname === '/api/v1/finance/trial-balance'
    || /^\/api\/v1\/finance\/periods\/[^/]+\/close$/.test(pathname);

  for (const request of requests) {
    expect(allowedPath(request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const createRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/finance/journals');
  expect(Object.keys(createRequest?.body ?? {}).sort()).toEqual(['description', 'lines', 'postingDate']);
  for (const line of createRequest?.body?.lines ?? []) {
    expect(Object.keys(line).sort()).toEqual(['accountId', 'credit', 'debit', 'description']);
  }

  const bodylessCommands = requests.filter((request) => request.method === 'POST' && (
    request.pathname.endsWith('/post')
    || request.pathname.endsWith('/reverse')
    || request.pathname.endsWith('/close')
  ));
  expect(bodylessCommands).toHaveLength(3);
  for (const command of bodylessCommands) expect(command.body).toBeNull();

  const accountsRequest = requests.find((request) => request.pathname === '/api/v1/finance/accounts');
  expect(accountsRequest?.query).toEqual({ page: '1', pageSize: '25' });
  const trialBalanceRequest = requests.find((request) => request.pathname === '/api/v1/finance/trial-balance');
  expect(trialBalanceRequest?.query).toEqual({ periodId: OPEN_PERIOD_ID });

  expect(requests.some((request) => request.pathname.includes('/ap/'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/ar/'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/payments'))).toBe(false);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after the Finance browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 15A browser workflow creates, posts, reports, reverses and closes without browser authority leakage', async ({ page, browser }) => {
  const adminRequests = trackFinanceRequests(page);
  await signIn(page, ADMIN_EMAIL);
  await openFinance(page);

  const accountsSection = page.getByRole('heading', { name: 'Chart of Accounts' }).locator('..').locator('..');
  await expect(accountsSection.getByRole('row').filter({ hasText: '1000Cash' })).toBeVisible();
  await expect(accountsSection.getByRole('row').filter({ hasText: '5000Project Expense' })).toBeVisible();

  const journalSection = page.getByRole('heading', { name: 'Manual journal' }).locator('..');
  await journalSection.getByLabel('Posting date').fill('2026-01-15');
  await journalSection.getByLabel('Description').fill('Pass 209 exact decimal journal');

  const firstRow = journalSection.locator('.finance-journal-table tbody tr').nth(0);
  await firstRow.locator('input').nth(0).fill(CASH_ACCOUNT_ID);
  await firstRow.locator('input').nth(3).fill('125.45');
  await firstRow.locator('input').nth(4).fill('0.00');
  await firstRow.locator('input').nth(5).fill('Cash debit');

  await journalSection.getByRole('button', { name: 'Add line' }).click();
  const secondRow = journalSection.locator('.finance-journal-table tbody tr').nth(1);
  await secondRow.locator('input').nth(0).fill(EXPENSE_ACCOUNT_ID);
  await secondRow.locator('input').nth(3).fill('0.00');
  await secondRow.locator('input').nth(4).fill('125.45');
  await secondRow.locator('input').nth(5).fill('Expense credit');
  await journalSection.getByRole('button', { name: 'Create draft journal' }).click();

  const readback = page.locator('.finance-journal-readback');
  await expect(readback.getByRole('heading', { name: 'Latest server journal readback' })).toBeVisible();
  await expect(readback).toContainText('JRN-209-0001');
  await expect(readback).toContainText('DRAFT');
  await expect(readback).toContainText(OPEN_PERIOD_ID);
  await expect(readback).toContainText('125.45');

  const journal = await database.journal.findFirst({
    where: { companyId: COMPANY_ID, journalNo: 'JRN-209-0001' },
    include: { lines: true }
  });
  expect(journal).toBeTruthy();
  expect(journal.status).toBe('DRAFT');
  expect(journal.periodId).toBe(OPEN_PERIOD_ID);
  expect(journal.totalDebit.toString()).toBe('125.45');
  expect(journal.totalCredit.toString()).toBe('125.45');
  expect(journal.lines).toHaveLength(2);

  const commandSection = page.getByRole('heading', { name: 'Post or reverse journal' }).locator('..');
  await commandSection.getByRole('button', { name: 'Post journal' }).click();
  await expect(readback).toContainText('POSTED');

  const trialSection = page.getByRole('heading', { name: 'Trial balance' }).locator('..');
  await trialSection.getByLabel('Fiscal period ID').fill(OPEN_PERIOD_ID);
  await trialSection.getByRole('button', { name: 'Run trial balance' }).click();
  await expect(trialSection.getByRole('row').filter({ hasText: '1000Cash' })).toContainText('125.45');
  await expect(trialSection.getByRole('row').filter({ hasText: '5000Project Expense' })).toContainText('125.45');
  await expect(trialSection.getByRole('row').filter({ hasText: 'Total' })).toContainText('125.45');

  await commandSection.getByRole('button', { name: 'Reverse journal' }).click();
  await expect(readback).toContainText('JRN-209-0002');
  await expect(readback).toContainText('POSTED');

  const originalJournal = await database.journal.findUnique({ where: { id: journal.id } });
  const reversalJournal = await database.journal.findFirst({
    where: { companyId: COMPANY_ID, sourceType: 'REVERSAL', sourceId: journal.id }
  });
  expect(originalJournal?.status).toBe('REVERSED');
  expect(reversalJournal?.journalNo).toBe('JRN-209-0002');
  expect(reversalJournal?.status).toBe('POSTED');

  const closeSection = page.getByRole('heading', { name: 'Period close' }).locator('..');
  await closeSection.getByLabel('Fiscal period ID').fill(OPEN_PERIOD_ID);
  await closeSection.getByRole('button', { name: 'Close period' }).click();
  await expect(closeSection.getByText('Period 2026-1 is CLOSED.', { exact: true })).toBeVisible();
  expect((await database.fiscalPeriod.findUnique({ where: { id: OPEN_PERIOD_ID } }))?.status).toBe('CLOSED');

  assertFinanceAuthorityBoundary(adminRequests);

  const viewerContext = await browser.newContext({ baseURL: WEB_URL });
  const viewerPage = await viewerContext.newPage();
  try {
    await signIn(viewerPage, VIEWER_EMAIL);
    await openFinance(viewerPage);
    await expect(viewerPage.getByRole('heading', { name: 'Chart of Accounts' })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Create draft journal' })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Post journal' })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Reverse journal' })).toHaveCount(0);
    await expect(viewerPage.getByRole('button', { name: 'Run trial balance' })).toBeVisible();
    await expect(viewerPage.getByRole('button', { name: 'Close period' })).toHaveCount(0);

    const viewerToken = await viewerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(viewerToken).toBeTruthy();
    const denied = await viewerPage.request.post(`${API_BASE_URL}/finance/journals`, {
      headers: { authorization: `Bearer ${viewerToken}` },
      data: {
        postingDate: '2026-01-15',
        description: 'Viewer must not create journals',
        lines: [
          { accountId: CASH_ACCOUNT_ID, debit: '1.00', credit: '0.00', description: 'Debit' },
          { accountId: EXPENSE_ACCOUNT_ID, debit: '0.00', credit: '1.00', description: 'Credit' }
        ]
      }
    });
    expect(denied.status()).toBe(403);
  } finally {
    await viewerContext.close();
  }
});
