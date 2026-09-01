import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass220-module7-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000022000';
const CLIENT_ID = '00000000-0000-4000-8000-000000022001';
const PROJECT_ID = '00000000-0000-4000-8000-000000022002';
const WBS_ID = '00000000-0000-4000-8000-000000022003';
const COST_CODE_ID = '00000000-0000-4000-8000-000000022004';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000022005';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000022006';
const OPEN_PERIOD_ID = '00000000-0000-4000-8000-000000022007';
const MANAGER_ID = '00000000-0000-4000-8000-000000022010';
const READER_ID = '00000000-0000-4000-8000-000000022011';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000022020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000022021';

const MANAGER_EMAIL = 'pass220-module7-manager@example.test';
const READER_EMAIL = 'pass220-module7-reader@example.test';
const PROJECT_CODE = 'PASS220-PROJECT';
const MODULE_7_PERMISSIONS = [
  'budgets.read',
  'budgets.create',
  'budgets.edit',
  'budgets.freeze',
  'job_cost.read',
  'forecast.update'
];
const READ_SUPPORT_PERMISSIONS = ['projects.read', 'wbs.read', 'cost_codes.read'];

let database;

/** Seed one active Project with Module-6 cost structure, source costs, Finance period and focused Module-7 browser roles. */
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
      legalName: 'Pass 220 Module 7 Company Limited',
      displayName: 'Pass 220 Module 7 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 220 Module 7 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 220 Module 7 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS220-CLIENT',
      legalName: 'Pass 220 Client Limited',
      displayName: 'Pass 220 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });

  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: PROJECT_CODE,
      name: 'Module 7 Browser Project',
      clientId: CLIENT_ID,
      tenderId: null,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });

  await database.wbsNode.create({
    data: {
      id: WBS_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      parentId: null,
      code: 'A',
      name: 'Project Controls',
      level: 0,
      status: 'ACTIVE',
      sortOrder: 10
    }
  });
  await database.costCode.create({
    data: {
      id: COST_CODE_ID,
      companyId: COMPANY_ID,
      code: '1000',
      name: 'Direct Cost',
      category: 'DIRECT',
      status: 'ACTIVE'
    }
  });
  await database.costType.create({
    data: {
      id: COST_TYPE_ID,
      companyId: COMPANY_ID,
      code: 'LAB',
      name: 'Labor',
      status: 'ACTIVE'
    }
  });
  await database.projectCostCode.create({
    data: {
      id: COST_STRUCTURE_ID,
      projectId: PROJECT_ID,
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID,
      isPostingAllowed: true,
      status: 'ACTIVE'
    }
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

  await database.costCommitment.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'TEST_COMMITMENT',
      sourceId: 'PO-220',
      sourceLineId: 'LINE-1',
      costStructureId: COST_STRUCTURE_ID,
      originalAmount: '500.00',
      remainingAmount: '300.00',
      status: 'OPEN'
    }
  });
  await database.costActual.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'TEST_ACTUAL',
      sourceId: 'GRN-220',
      sourceLineId: 'LINE-1',
      postingDate: new Date('2026-01-10T00:00:00.000Z'),
      costStructureId: COST_STRUCTURE_ID,
      amount: '200.00'
    }
  });

  const permissionCodes = [...READ_SUPPORT_PERMISSIONS, ...MODULE_7_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('projects.') ? 'projects' : code.startsWith('wbs.') || code.startsWith('cost_codes.') ? 'wbs-cost-codes' : 'budgets-job-cost' },
      create: { code, name: code, domain: code.startsWith('projects.') ? 'projects' : code.startsWith('wbs.') || code.startsWith('cost_codes.') ? 'wbs-cost-codes' : 'budgets-job-cost' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module7-browser-manager', name: 'Module 7 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module7-browser-reader', name: 'Module 7 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...[...READ_SUPPORT_PERMISSIONS, 'budgets.read', 'job_cost.read'].map((code) => ({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });
  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
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

/** Open the permission-aware Module-7 workspace. */
async function openModule7(page) {
  await page.getByRole('button', { name: 'Budgeting & Job Costing' }).click();
  await expect(page.getByRole('heading', { name: 'Budgeting & Job Costing' })).toBeVisible();
}

/** Return true only for one of the seven source routes plus the Pass-361 DRAFT recovery read. */
function isAllowedModule7Path(pathname) {
  return pathname === `/api/v1/projects/${PROJECT_ID}/budgets/current`
    || pathname === `/api/v1/projects/${PROJECT_ID}/budgets/draft`
    || pathname === `/api/v1/projects/${PROJECT_ID}/budgets`
    || /^\/api\/v1\/projects\/[^/]+\/budgets\/[^/]+\/lines$/.test(pathname)
    || /^\/api\/v1\/projects\/[^/]+\/budgets\/[^/]+\/freeze$/.test(pathname)
    || pathname === `/api/v1/projects/${PROJECT_ID}/job-cost`
    || pathname === `/api/v1/projects/${PROJECT_ID}/forecast`
    || pathname === `/api/v1/projects/${PROJECT_ID}/job-cost/ledger`;
}

/** Record Module-7 requests so the browser authority and exact route boundary can be verified. */
function trackModule7Requests(page) {
  const requests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith(`/api/v1/projects/${PROJECT_ID}/`)) return;
    if (!url.pathname.includes('/budgets') && !url.pathname.includes('/job-cost') && !url.pathname.endsWith('/forecast')) return;

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

/** Assert browser requests stay inside the reviewed Module-7 contract plus DRAFT recovery and never own server authority. */
function assertModule7AuthorityBoundary(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'versionNo',
    'status',
    'approvedAt',
    'totalCost',
    'totalRevenue',
    'forecastFinalCost',
    'forecastFinalRevenue',
    'committedCost',
    'actualCost',
    'sourceType',
    'sourceId',
    'sourceLineId'
  ];

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedModule7Path(request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const createRequest = requests.find((request) => request.method === 'POST'
    && request.pathname === `/api/v1/projects/${PROJECT_ID}/budgets`);
  expect(Object.keys(createRequest?.body ?? {})).toEqual(['budgetType']);

  const lineRequest = requests.find((request) => request.method === 'PUT' && request.pathname.endsWith('/lines'));
  expect(Object.keys(lineRequest?.body ?? {})).toEqual(['lines']);
  expect(Object.keys(lineRequest?.body?.lines?.[0] ?? {}).sort()).toEqual([
    'amount', 'costCodeId', 'costTypeId', 'quantity', 'revenueAmount', 'unitRate', 'wbsNodeId'
  ]);

  const freezeRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/freeze'));
  expect(freezeRequest?.body).toBeNull();

  const forecastRequest = requests.find((request) => request.method === 'PUT'
    && request.pathname === `/api/v1/projects/${PROJECT_ID}/forecast`);
  expect(Object.keys(forecastRequest?.body ?? {}).sort()).toEqual(['asOfDate', 'lines']);
  expect(Object.keys(forecastRequest?.body?.lines?.[0] ?? {}).sort()).toEqual(['budgetLineId', 'estimateToComplete', 'notes']);

  const ledgerRequests = requests.filter((request) => request.pathname.endsWith('/job-cost/ledger'));
  expect(ledgerRequests.length).toBeGreaterThan(0);
  for (const request of ledgerRequests) expect(request.query).toEqual({ page: '1', pageSize: '25' });

  expect(requests.some((request) => request.pathname.includes('/job-cost/commitments'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/job-cost/actuals'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/reconcile'))).toBe(false);
  expect(requests.some((request) => request.pathname.endsWith('/approve'))).toBe(false);
  expect(requests.some((request) => request.pathname.endsWith('/reopen'))).toBe(false);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module-7 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 7 browser workflow creates, freezes, forecasts and drills into source-derived job cost without authority leakage', async ({ page, browser }) => {
  const managerRequests = trackModule7Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule7(page);

  await page.getByLabel('Project').selectOption(PROJECT_ID);
  await expect(page.getByRole('heading', { name: `${PROJECT_CODE} · Module 7 Browser Project` })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Budget grid' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Create budget version' })).toBeVisible();

  const createSection = page.getByRole('heading', { name: 'Create budget version' }).locator('..');
  await createSection.getByLabel('Budget type').fill('BASELINE');
  await createSection.getByRole('button', { name: 'Create budget version' }).click();
  await expect(page.getByText('Editing budget v1', { exact: true })).toBeVisible();

  const editSection = page.getByRole('heading', { name: 'Edit DRAFT lines' }).locator('..').locator('..').locator('..');
  await editSection.getByRole('button', { name: 'Add line' }).click();
  const editRow = editSection.locator('.module7-budget-edit-table tbody tr').first();
  await editRow.locator('select').nth(0).selectOption(WBS_ID);
  await editRow.locator('select').nth(1).selectOption(COST_CODE_ID);
  await editRow.locator('select').nth(2).selectOption(COST_TYPE_ID);
  await editRow.locator('input').nth(0).fill('10.0000');
  await editRow.locator('input').nth(1).fill('100.0000');
  await editRow.locator('input').nth(2).fill('1000.00');
  await editRow.locator('input').nth(3).fill('1500.00');
  await editSection.getByRole('button', { name: 'Save complete line set' }).click();

  await expect(page.locator('.module7-budget-table tbody tr')).toHaveCount(1);
  await expect(page.getByText('USD 1000', { exact: true })).toBeVisible();
  await expect(page.getByText('USD 1500', { exact: true }).first()).toBeVisible();

  await page.reload();
  await openModule7(page);
  await page.getByLabel('Project').selectOption(PROJECT_ID);
  await expect(page.getByText('Editing budget v1', { exact: true })).toBeVisible();
  const recoveredEditSection = page.getByRole('heading', { name: 'Edit DRAFT lines' }).locator('..').locator('..').locator('..');
  await recoveredEditSection.getByRole('button', { name: 'Request approval / freeze' }).click();
  await expect(page.getByText('Version 1 · FROZEN', { exact: true })).toBeVisible();
  await expect(page.getByText('Editing budget v1', { exact: true })).toHaveCount(0);

  const forecastSection = page.getByRole('heading', { name: 'Forecast assumptions & comments' }).locator('..');
  await expect(forecastSection.getByRole('button', { name: 'Save forecast assumptions' })).toBeVisible();
  await forecastSection.getByLabel('As-of date').fill('2026-01-20');
  const forecastRow = forecastSection.locator('.module7-forecast-table tbody tr').first();
  await forecastRow.locator('input').nth(0).fill('200.00');
  await forecastRow.locator('input').nth(1).fill('January browser forecast');
  await forecastSection.getByRole('button', { name: 'Save forecast assumptions' }).click();
  await expect(page.getByText('Forecast saved for 2026-01-20.', { exact: true })).toBeVisible();

  const jobCostSection = page.getByRole('heading', { name: 'Job-cost position' }).locator('..').locator('..').locator('..');
  await expect(jobCostSection).toContainText('BudgetUSD 1000');
  await expect(jobCostSection).toContainText('CommittedUSD 300');
  await expect(jobCostSection).toContainText('ActualUSD 200');
  await expect(jobCostSection).toContainText('ETCUSD 200');
  await expect(jobCostSection).toContainText('EAC / forecast final costUSD 700');
  await expect(jobCostSection).toContainText('VarianceUSD 300');
  await expect(jobCostSection).toContainText('RevenueUSD 1500');
  await expect(jobCostSection).toContainText('MarginUSD 800');

  const budgetRow = page.locator('.module7-budget-table tbody tr').first();
  await budgetRow.getByRole('button', { name: 'Open' }).click();
  const drilldownSection = page.getByRole('heading', { name: 'Cost-code drilldown' }).locator('..');
  await expect(drilldownSection).toContainText('A');
  await expect(drilldownSection).toContainText('1000');
  await expect(drilldownSection).toContainText(COST_TYPE_ID);
  await expect(drilldownSection).toContainText(COST_STRUCTURE_ID);
  await expect(drilldownSection).toContainText('200');
  await expect(drilldownSection).toContainText('January browser forecast');
  await expect(drilldownSection).toContainText('TEST_COMMITMENT');
  await expect(drilldownSection).toContainText('TEST_ACTUAL');

  const ledgerSection = page.getByRole('heading', { name: 'Job-cost ledger' }).locator('..').locator('..').locator('..');
  await expect(ledgerSection).toContainText('2 row(s)');
  await expect(ledgerSection).toContainText('TEST_COMMITMENT');
  await expect(ledgerSection).toContainText('TEST_ACTUAL');
  await expect(ledgerSection.getByText('No source-derived commitment or actual rows are visible for this Project.')).toHaveCount(0);

  const frozenBudget = await database.projectBudget.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, status: 'FROZEN' },
    include: { lines: true }
  });
  expect(frozenBudget).toBeTruthy();
  expect(frozenBudget.versionNo).toBe(1);
  expect(frozenBudget.lines).toHaveLength(1);
  expect(frozenBudget.totalCost.toString()).toBe('1000');
  expect(frozenBudget.totalRevenue?.toString()).toBe('1500');
  expect(await database.forecastLine.count({ where: { projectId: PROJECT_ID } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'job_cost.source_posted' } })).toBe(0);

  assertModule7AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule7(readerPage);
    await readerPage.getByLabel('Project').selectOption(PROJECT_ID);
    await expect(readerPage.getByText('Version 1 · FROZEN', { exact: true })).toBeVisible();
    await expect(readerPage.getByRole('heading', { name: 'Create budget version' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Save forecast assumptions' })).toHaveCount(0);
    await expect(readerPage.getByText('Your current identity does not expose Company-level forecast.update.', { exact: false })).toBeVisible();

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const deniedCreate = await readerPage.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/budgets`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { budgetType: 'DENIED' }
    });
    expect(deniedCreate.status()).toBe(403);
    const deniedForecast = await readerPage.request.put(`${API_BASE_URL}/projects/${PROJECT_ID}/forecast`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: {
        asOfDate: '2026-01-20',
        lines: [{ budgetLineId: frozenBudget.lines[0].id, estimateToComplete: '1.00', notes: 'Denied' }]
      }
    });
    expect(deniedForecast.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
