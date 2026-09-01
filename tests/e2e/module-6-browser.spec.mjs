import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass187-module6-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000018700';
const CLIENT_ID = '00000000-0000-4000-8000-000000018701';
const PROJECT_ID = '00000000-0000-4000-8000-000000018702';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000018703';
const MANAGER_ID = '00000000-0000-4000-8000-000000018710';
const READER_ID = '00000000-0000-4000-8000-000000018711';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000018720';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000018721';

const MANAGER_EMAIL = 'pass187-module6-manager@example.test';
const READER_EMAIL = 'pass187-module6-reader@example.test';
const PROJECT_CODE = 'PASS187-PROJECT';
const COST_CODE = 'PASS187-LABOR';
const MODULE_6_PERMISSIONS = ['wbs.read', 'wbs.manage', 'wbs.freeze', 'cost_codes.read', 'cost_codes.manage'];

let database;

/** Seed one active Project, one existing Cost Type and focused Module 6 browser roles. */
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
      legalName: 'Pass 187 Module 6 Company Limited',
      displayName: 'Pass 187 Module 6 Company',
      status: 'ACTIVE',
      baseCurrency: 'PKR',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 187 Module 6 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 187 Module 6 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS187-CLIENT',
      legalName: 'Pass 187 Client Limited',
      displayName: 'Pass 187 Client',
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
      name: 'Module 6 Browser Project',
      clientId: CLIENT_ID,
      tenderId: null,
      status: 'ACTIVE',
      currency: 'PKR',
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });

  await database.costType.create({
    data: {
      id: COST_TYPE_ID,
      companyId: COMPANY_ID,
      code: 'LABOR',
      name: 'Labor',
      status: 'ACTIVE'
    }
  });

  const permissionCodes = ['projects.read', ...MODULE_6_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('projects.') ? 'projects' : 'wbs-cost-codes' },
      create: { code, name: code, domain: code.startsWith('projects.') ? 'projects' : 'wbs-cost-codes' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module6-browser-manager', name: 'Module 6 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module6-browser-reader', name: 'Module 6 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...['projects.read', 'wbs.read', 'cost_codes.read'].map((code) => ({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) }))
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

/** Open the permission-aware Module 6 workspace. */
async function openModule6(page) {
  await page.getByRole('button', { name: 'WBS & Cost Codes' }).click();
  await expect(page.getByRole('heading', { name: 'WBS & Cost Codes' })).toBeVisible();
}

/** Record Module 6 API calls so browser-owned authority fields can be rejected by the test. */
function trackModule6Requests(page) {
  const requests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    const isModule6Path = url.pathname.startsWith('/api/v1/cost-codes')
      || url.pathname.startsWith('/api/v1/cost-types')
      || url.pathname.includes(`/api/v1/projects/${PROJECT_ID}/wbs`)
      || url.pathname.includes(`/api/v1/projects/${PROJECT_ID}/cost-code-assignments`);
    if (!isModule6Path) return;

    let body = null;
    if (request.postData()) {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }

    requests.push({ method: request.method(), pathname: url.pathname, body });
  });

  return requests;
}

/** Assert Module 6 browser writes contain reviewed business fields only. */
function assertBrowserAuthorityBoundary(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'effectivePermissions',
    'createdBy',
    'updatedBy',
    'level'
  ];

  for (const request of requests) {
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const costCodeCreate = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/cost-codes');
  expect(Object.keys(costCodeCreate?.body ?? {}).sort()).toEqual(['category', 'code', 'name', 'status']);

  const costTypeCreate = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/cost-types');
  expect(Object.keys(costTypeCreate?.body ?? {}).sort()).toEqual(['code', 'name', 'status']);

  const wbsCreates = requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/wbs/nodes'));
  expect(wbsCreates).toHaveLength(2);
  for (const request of wbsCreates) {
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['code', 'name', 'parentId', 'sortOrder', 'status']);
  }

  const mappingReplace = requests.find((request) => request.method === 'PUT' && request.pathname.endsWith('/cost-code-assignments'));
  expect(Object.keys(mappingReplace?.body ?? {})).toEqual(['assignments']);
  expect(Object.keys(mappingReplace?.body?.assignments?.[0] ?? {}).sort()).toEqual([
    'costCodeId', 'costTypeId', 'isPostingAllowed', 'status', 'wbsNodeId'
  ]);
  expect(JSON.stringify(mappingReplace?.body ?? {})).not.toContain('projectId');

  const freezeRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/wbs/freeze'));
  const reopenRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/wbs/reopen'));
  const lifecycleRequests = requests.filter((request) => request.method === 'POST' && /\/(archive|restore)$/.test(request.pathname));
  expect(freezeRequest?.body).toBeNull();
  expect(reopenRequest?.body).toBeNull();
  expect(lifecycleRequests.length).toBeGreaterThanOrEqual(6);
  for (const request of lifecycleRequests) expect(request.body).toBeNull();
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module 6 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 6 browser workflow covers WBS, Cost Code, mapping, durable freeze/reopen and permissions', async ({ page, browser }) => {
  const managerRequests = trackModule6Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule6(page);

  await page.getByLabel('Project').selectOption(PROJECT_ID);
  await expect(page.getByRole('heading', { name: 'WBS tree' })).toBeVisible();
  await expect(page.getByText('No WBS nodes exist for this Project yet.')).toBeVisible();

  const costCodeCard = page.getByRole('heading', { name: 'Company Cost Code master' }).locator('..').locator('..');
  const createCostCode = costCodeCard.getByRole('heading', { name: 'Create Cost Code' }).locator('..');
  await createCostCode.getByLabel('Code').fill(COST_CODE);
  await createCostCode.getByLabel('Name').fill('Project Labor');
  await createCostCode.getByLabel('Category').fill('DIRECT');
  await createCostCode.getByLabel('Status').fill('ACTIVE');
  await createCostCode.getByRole('button', { name: 'Create Cost Code' }).click();
  await expect(costCodeCard.getByRole('row').filter({ hasText: COST_CODE })).toBeVisible();

  const costCode = await database.costCode.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: COST_CODE } }
  });
  expect(costCode).toBeTruthy();

  const costCodeRow = costCodeCard.getByRole('row').filter({ hasText: COST_CODE });
  await costCodeRow.getByRole('button', { name: 'Archive' }).click();
  await expect(costCodeRow).toContainText('ARCHIVED');
  await costCodeRow.getByRole('button', { name: 'Restore' }).click();
  await expect(costCodeRow).toContainText('ACTIVE');

  const costTypeCard = page.getByRole('heading', { name: 'Company Cost Type master' }).locator('..').locator('..');
  const createCostType = costTypeCard.getByRole('heading', { name: 'Create Cost Type' }).locator('..');
  await createCostType.getByLabel('Code').fill('PASS360-MATERIAL');
  await createCostType.getByLabel('Name').fill('Material');
  await createCostType.getByLabel('Status').fill('ACTIVE');
  await createCostType.getByRole('button', { name: 'Create Cost Type' }).click();
  const costTypeRow = costTypeCard.getByRole('row').filter({ hasText: 'PASS360-MATERIAL' });
  await expect(costTypeRow).toBeVisible();

  const createdCostType = await database.costType.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: 'PASS360-MATERIAL' } }
  });
  expect(createdCostType).toBeTruthy();
  await costTypeRow.getByRole('button', { name: 'Archive' }).click();
  await expect(costTypeRow).toContainText('ARCHIVED');
  await costTypeRow.getByRole('button', { name: 'Restore' }).click();
  await expect(costTypeRow).toContainText('ACTIVE');

  const createWbsSection = page.getByRole('heading', { name: 'Create WBS node' }).locator('..');
  await createWbsSection.getByLabel('Code').fill('1');
  await createWbsSection.getByLabel('Name').fill('Main Works');
  await createWbsSection.getByLabel('Status').fill('ACTIVE');
  await createWbsSection.getByLabel('Sort order').fill('1');
  await createWbsSection.getByRole('button', { name: 'Create node' }).click();
  await expect(page.getByRole('row').filter({ hasText: '1Main Works' })).toBeVisible();

  const rootNode = await database.wbsNode.findFirst({ where: { projectId: PROJECT_ID, code: '1' } });
  expect(rootNode).toBeTruthy();
  expect(rootNode.level).toBe(0);

  await createWbsSection.getByLabel('Parent').selectOption(rootNode.id);
  await createWbsSection.getByLabel('Code').fill('1.1');
  await createWbsSection.getByLabel('Name').fill('Foundation');
  await createWbsSection.getByLabel('Status').fill('ACTIVE');
  await createWbsSection.getByLabel('Sort order').fill('1');
  await createWbsSection.getByRole('button', { name: 'Create node' }).click();
  await expect(page.getByRole('row').filter({ hasText: '1.1Foundation' })).toBeVisible();

  const childNode = await database.wbsNode.findFirst({ where: { projectId: PROJECT_ID, code: '1.1' } });
  expect(childNode).toBeTruthy();
  expect(childNode.parentId).toBe(rootNode.id);
  expect(childNode.level).toBe(1);

  const childRow = page.getByRole('row').filter({ hasText: '1.1Foundation' });
  await childRow.getByRole('button', { name: 'Archive' }).click();
  await expect(childRow).toContainText('ARCHIVED');
  await childRow.getByRole('button', { name: 'Restore' }).click();
  await expect(childRow).toContainText('ACTIVE');

  const rootRow = page.getByRole('row').filter({ hasText: '1Main Works' });
  await rootRow.getByRole('button', { name: 'Edit' }).click();
  const editSection = page.getByRole('heading', { name: 'Edit selected node' }).locator('..');
  await editSection.getByLabel('Parent').selectOption(childNode.id);
  await editSection.getByRole('button', { name: 'Save node' }).click();
  await expect(editSection.getByRole('alert')).toContainText('hierarchy cycle');
  await editSection.getByLabel('Parent').selectOption('');

  await page.getByRole('button', { name: 'Add mapping' }).click();
  const mappingTable = page.locator('.module6-mapping-table');
  const mappingRow = mappingTable.locator('tbody tr').first();
  await mappingRow.locator('select').selectOption(childNode.id);
  await mappingRow.locator('input[placeholder="Cost Code UUID"]').fill(costCode.id);
  await mappingRow.locator('input[placeholder="Cost Type UUID"]').fill(createdCostType.id);
  await mappingRow.locator('input[type="checkbox"]').check();
  await mappingRow.locator('input').last().fill('ACTIVE');
  await page.getByRole('button', { name: 'Save complete mapping set' }).click();
  await expect.poll(async () => database.projectCostCode.count({ where: { projectId: PROJECT_ID } })).toBe(1);

  const savedMapping = await database.projectCostCode.findFirst({ where: { projectId: PROJECT_ID } });
  expect(savedMapping).toMatchObject({
    wbsNodeId: childNode.id,
    costCodeId: costCode.id,
    costTypeId: createdCostType.id,
    isPostingAllowed: true,
    status: 'ACTIVE'
  });

  await page.getByRole('button', { name: 'Freeze cost structure' }).click();
  await expect(page.getByText(/FROZEN · revision 1/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reopen cost structure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create node' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add mapping' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save complete mapping set' })).toHaveCount(0);

  const frozenState = await database.projectCostStructureState.findUnique({ where: { projectId: PROJECT_ID } });
  expect(frozenState).toMatchObject({ status: 'FROZEN', revisionNo: 1, frozenBy: MANAGER_ID });

  await page.getByRole('button', { name: 'Reopen cost structure' }).click();
  await expect(page.getByText('OPEN · revision 2')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Freeze cost structure' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create node' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add mapping' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save complete mapping set' })).toBeVisible();

  const reopenedState = await database.projectCostStructureState.findUnique({ where: { projectId: PROJECT_ID } });
  expect(reopenedState).toMatchObject({ status: 'OPEN', revisionNo: 2, frozenAt: null, frozenBy: null });

  const auditActions = await database.auditLog.findMany({
    where: { companyId: COMPANY_ID, action: { in: ['wbs.node_created', 'project.cost_code_assignments_changed', 'project.cost_structure_frozen', 'project.cost_structure_reopened'] } },
    select: { action: true }
  });
  expect(auditActions.filter((row) => row.action === 'wbs.node_created')).toHaveLength(2);
  expect(auditActions.some((row) => row.action === 'project.cost_code_assignments_changed')).toBe(true);
  expect(auditActions.some((row) => row.action === 'project.cost_structure_frozen')).toBe(true);
  expect(auditActions.some((row) => row.action === 'project.cost_structure_reopened')).toBe(true);

  const outboxEvents = await database.outboxEvent.findMany({
    where: { companyId: COMPANY_ID, eventType: { in: ['wbs.node_created', 'cost_code.created', 'project.cost_structure_frozen', 'project.cost_structure_reopened'] } },
    select: { eventType: true }
  });
  expect(outboxEvents.filter((row) => row.eventType === 'wbs.node_created')).toHaveLength(2);
  expect(outboxEvents.some((row) => row.eventType === 'cost_code.created')).toBe(true);
  expect(outboxEvents.some((row) => row.eventType === 'project.cost_structure_frozen')).toBe(true);
  expect(outboxEvents.some((row) => row.eventType === 'project.cost_structure_reopened')).toBe(true);

  assertBrowserAuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule6(readerPage);
    await readerPage.getByLabel('Project').selectOption(PROJECT_ID);
    await expect(readerPage.getByRole('row').filter({ hasText: '1.1Foundation' })).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create Cost Code' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create Cost Type' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Archive' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Restore' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create node' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Add mapping' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Save complete mapping set' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Freeze cost structure' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    const denied = await readerPage.request.post(`${API_BASE_URL}/cost-codes`, {
      headers: { Authorization: `Bearer ${readerToken}` },
      data: { code: 'DENIED', name: 'Denied', category: 'DIRECT', status: 'ACTIVE' }
    });
    expect(denied.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
