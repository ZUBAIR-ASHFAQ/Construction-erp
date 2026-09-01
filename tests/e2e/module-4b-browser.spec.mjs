import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass198-module4b-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000019800';
const CLIENT_ID = '00000000-0000-4000-8000-000000019801';
const TENDER_ID = '00000000-0000-4000-8000-000000019802';
const PROJECT_ID = '00000000-0000-4000-8000-000000019803';
const WBS_ID = '00000000-0000-4000-8000-000000019804';
const COST_CODE_ID = '00000000-0000-4000-8000-000000019805';
const ADMIN_ID = '00000000-0000-4000-8000-000000019810';
const READER_ID = '00000000-0000-4000-8000-000000019811';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000019820';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000019821';

const ADMIN_EMAIL = 'pass198-module4b-admin@example.test';
const READER_EMAIL = 'pass198-module4b-reader@example.test';
const PROJECT_BOQ_CODE = 'PASS198-PROJECT-BOQ';
const TENDER_BOQ_CODE = 'PASS198-TENDER-BOQ';
const BOQ_PERMISSIONS = ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'];
const LOOKUP_PERMISSIONS = ['projects.read', 'tenders.read', 'wbs.read', 'cost_codes.read'];

let database;

/** Seed the smallest Project BOQ browser scenario with one mapped WBS node and Cost Code. */
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
      legalName: 'Pass 198 Module 4B Company Limited',
      displayName: 'Pass 198 Module 4B Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  await database.user.createMany({
    data: [
      { id: ADMIN_ID, companyId: COMPANY_ID, email: ADMIN_EMAIL, name: 'Pass 198 BOQ Admin', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 198 BOQ Project Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [ADMIN_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS198-CLIENT',
      legalName: 'Pass 198 Client Limited',
      displayName: 'Pass 198 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });

  await database.tender.create({
    data: {
      id: TENDER_ID,
      companyId: COMPANY_ID,
      clientId: CLIENT_ID,
      opportunityId: null,
      tenderNo: 'PASS198-TENDER',
      title: 'Pass 198 Tender',
      dueDate: new Date('2027-06-30T00:00:00.000Z'),
      status: 'DRAFT',
      ownerUserId: ADMIN_ID,
      currency: 'USD'
    }
  });

  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS198-PROJECT',
      name: 'Pass 198 Project',
      clientId: CLIENT_ID,
      tenderId: TENDER_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2027-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: ADMIN_ID,
      location: 'Lahore, Pakistan'
    }
  });

  await database.wbsNode.create({
    data: {
      id: WBS_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      parentId: null,
      code: '1.1',
      name: 'Foundation',
      level: 0,
      status: 'ACTIVE',
      sortOrder: 1
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

  const permissionCodes = [...BOQ_PERMISSIONS, ...LOOKUP_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.split('.')[0] },
      create: { code, name: code, domain: code.split('.')[0] }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'pass198-boq-admin', name: 'Pass 198 BOQ Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'pass198-boq-reader', name: 'Pass 198 BOQ Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('boq.read') }
    ]
  });
  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate }
    ]
  });
  await database.projectMember.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      userId: READER_ID,
      projectRole: 'VIEWER',
      status: 'ACTIVE',
      fromDate
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

/** Open the existing permission-aware BOQ workspace. */
async function openBoqWorkspace(page) {
  await page.getByRole('button', { name: 'BOQ Management' }).click();
  await expect(page.getByRole('heading', { name: 'BOQ Management' })).toBeVisible();
}

/** Open one BOQ register row using its stable BOQ code. */
async function openBoq(page, code) {
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
}

/** Record BOQ and reused Project/WBS/Cost Code requests for browser-contract assertions. */
function trackStage10Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const relevant = url.pathname.startsWith('/api/v1/boqs')
      || url.pathname === '/api/v1/projects'
      || url.pathname === '/api/v1/cost-codes'
      || url.pathname === `/api/v1/projects/${PROJECT_ID}/wbs`;
    if (!relevant) return;

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

/** Assert Stage-10 browser writes expose only reviewed relationship and commercial fields. */
function assertBrowserAuthorityBoundary(requests) {
  const forbiddenFields = ['companyId', 'actorUserId', 'permissions', 'projectScope', 'costTypeId', 'amount', 'approvedBy'];
  for (const request of requests) {
    const body = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(body).not.toContain(`\"${field}\"`);
  }

  const projectCreate = requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/boqs'
    && request.body?.code === PROJECT_BOQ_CODE);
  expect(Object.keys(projectCreate?.body ?? {}).sort()).toEqual(['code', 'currency', 'projectId', 'title']);

  const tenderCreate = requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/boqs'
    && request.body?.code === TENDER_BOQ_CODE);
  expect(Object.keys(tenderCreate?.body ?? {}).sort()).toEqual(['code', 'currency', 'tenderId', 'title']);

  const itemReplace = requests.find((request) => request.method === 'PUT' && request.pathname.endsWith('/items'));
  expect(Object.keys(itemReplace?.body ?? {})).toEqual(['items']);
  expect(Object.keys(itemReplace?.body?.items?.[0] ?? {}).sort()).toEqual([
    'costCodeId', 'description', 'itemCode', 'parentRowKey', 'quantity', 'rate', 'rowKey', 'unit', 'wbsNodeId'
  ]);
  expect(JSON.stringify(itemReplace?.body ?? {})).not.toContain('projectId');

  const freeze = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/freeze'));
  expect(freeze?.body).toBeNull();
  expect(requests.some((request) => request.method === 'GET' && request.pathname === `/api/v1/projects/${PROJECT_ID}/wbs`)).toBe(true);
  expect(requests.some((request) => request.method === 'GET' && request.pathname === '/api/v1/cost-codes')).toBe(true);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module 4B browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 4B browser workflow creates a Project BOQ and persists WBS/Cost Code item mapping', async ({ page, browser }) => {
  const adminRequests = trackStage10Requests(page);
  await signIn(page, ADMIN_EMAIL);
  await openBoqWorkspace(page);

  const createCard = page.getByRole('heading', { name: 'Create BOQ' }).locator('..');
  await createCard.getByLabel('Project (optional)').selectOption(PROJECT_ID);
  await createCard.getByLabel('BOQ code').fill(PROJECT_BOQ_CODE);
  await createCard.getByLabel('BOQ title').fill('Pass 198 Project BOQ');
  await createCard.getByLabel('Currency').fill('USD');
  await createCard.getByRole('button', { name: 'Create BOQ' }).click();
  await expect(page.getByRole('heading', { name: `${PROJECT_BOQ_CODE} · Pass 198 Project BOQ` })).toBeVisible();
  await expect(page.getByText(PROJECT_ID, { exact: true }).first()).toBeVisible();

  const projectBoq = await database.boq.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: PROJECT_BOQ_CODE } }
  });
  expect(projectBoq).toBeTruthy();
  expect(projectBoq.projectId).toBe(PROJECT_ID);
  expect(projectBoq.tenderId).toBeNull();

  await page.getByLabel('Effective date').fill('2027-02-01');
  await page.getByLabel('Notes').fill('Mapped Project BOQ revision.');
  await page.getByRole('button', { name: 'Create revision' }).click();
  await page.getByLabel('Item 1 code').fill('1.1');
  await page.getByLabel('Item 1 description').fill('Mapped foundation work');
  await page.getByLabel('Item 1 unit').fill('m2');
  await page.getByLabel('Item 1 quantity').fill('2.0000');
  await page.getByLabel('Item 1 rate').fill('15.5000');

  const wbsSelect = page.locator('select[aria-label="Item 1 WBS node"]');
  const costCodeSelect = page.locator('select[aria-label="Item 1 Cost Code"]');
  await expect(wbsSelect).toBeVisible();
  await expect(costCodeSelect).toBeVisible();
  await wbsSelect.selectOption(WBS_ID);
  await costCodeSelect.selectOption(COST_CODE_ID);
  await page.getByRole('button', { name: 'Save item set' }).click();

  await expect(page.getByRole('heading', { name: 'Server-calculated result' })).toBeVisible();
  await expect(page.getByText('Total: USD 31.00', { exact: true })).toBeVisible();
  const savedRow = page.locator('.boq-saved-result').getByRole('row').filter({ hasText: '1.1' });
  await expect(savedRow).toContainText(WBS_ID);
  await expect(savedRow).toContainText(COST_CODE_ID);
  await expect(savedRow).toContainText('31.00');

  const revision = await database.boqRevision.findFirst({
    where: { boqId: projectBoq.id, revisionNo: 1 },
    select: { id: true }
  });
  expect(revision).toBeTruthy();
  const savedItem = await database.boqItem.findFirst({ where: { boqRevisionId: revision.id } });
  expect(savedItem).toMatchObject({ wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID });

  await page.getByRole('button', { name: 'Freeze revision' }).click();
  await expect(page.getByRole('button', { name: 'Revision 1 · FROZEN' })).toBeVisible();
  await expect(page.getByText('This revision is read-only. Frozen revisions cannot be edited.', { exact: true })).toBeVisible();

  await createCard.getByLabel('Tender (optional)').selectOption(TENDER_ID);
  await createCard.getByLabel('Project (optional)').selectOption('');
  await createCard.getByLabel('BOQ code').fill(TENDER_BOQ_CODE);
  await createCard.getByLabel('BOQ title').fill('Pass 198 Tender BOQ');
  await createCard.getByLabel('Currency').fill('USD');
  await createCard.getByRole('button', { name: 'Create BOQ' }).click();
  await expect(page.getByRole('heading', { name: `${TENDER_BOQ_CODE} · Pass 198 Tender BOQ` })).toBeVisible();
  await expect(page.getByText('This is a Tender-only BOQ, so WBS and Cost Code mappings stay unavailable.', { exact: false })).toBeVisible();

  assertBrowserAuthorityBoundary(adminRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openBoqWorkspace(readerPage);
    await openBoq(readerPage, PROJECT_BOQ_CODE);
    await expect(readerPage.getByRole('heading', { name: 'Create BOQ' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Create next revision' })).toHaveCount(0);
    await expect(readerPage.getByText('Your current role can read BOQs but cannot create or edit BOQ revisions.', { exact: true })).toBeVisible();

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const denied = await readerPage.request.post(`${API_BASE_URL}/boqs`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { projectId: PROJECT_ID, code: 'DENIED', title: 'Denied Project BOQ', currency: 'USD' }
    });
    expect(denied.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
