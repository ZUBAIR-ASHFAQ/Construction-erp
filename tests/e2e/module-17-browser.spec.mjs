import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass344-module17-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000034400';
const CLIENT_ID = '00000000-0000-4000-8000-000000034401';
const PROJECT_ID = '00000000-0000-4000-8000-000000034402';
const WBS_ID = '00000000-0000-4000-8000-000000034403';
const COST_CODE_ID = '00000000-0000-4000-8000-000000034404';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000034405';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000034406';
const BUDGET_ID = '00000000-0000-4000-8000-000000034407';
const MANAGER_ID = '00000000-0000-4000-8000-000000034410';
const READER_ID = '00000000-0000-4000-8000-000000034411';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000034420';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000034421';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000034430';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000034431';

const MANAGER_EMAIL = 'pass344-module17-manager@example.test';
const READER_EMAIL = 'pass344-module17-reader@example.test';
const APPROVAL_DEFINITION_CODE = 'CHANGE_REQUEST';
const CHANGE_PERMISSIONS = [
  'changes.read',
  'changes.create',
  'changes.estimate',
  'changes.submit',
  'changes.approve',
  'changes.apply'
];
const SUPPORT_PERMISSIONS = ['projects.read', 'approvals.inbox.read', 'approvals.act'];
const REVIEWED_OPERATIONS = new Set([
  'GET /api/v1/change-orders',
  'POST /api/v1/change-orders/requests',
  'PUT /api/v1/change-orders/requests/:id/lines',
  'POST /api/v1/change-orders/requests/:id/submit',
  'POST /api/v1/change-orders/requests/:id/approve',
  'POST /api/v1/change-orders/requests/:id/reject',
  'GET /api/v1/change-orders/:id/impact'
]);

let database;

/** Seed the smallest Project, cost structure, frozen Budget, approval and RBAC graph needed for the Stage-22 browser workflow. */
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
      legalName: 'Pass 344 Module 17 Company Limited',
      displayName: 'Pass 344 Module 17 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of [...CHANGE_PERMISSIONS, ...SUPPORT_PERMISSIONS]) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.split('.')[0] },
      create: { code, name: code, domain: code.split('.')[0] }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      {
        id: MANAGER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module17-browser-manager',
        name: 'Module 17 Browser Manager',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module17-browser-reader',
        name: 'Module 17 Browser Reader',
        isSystem: false,
        status: 'ACTIVE'
      }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...[...CHANGE_PERMISSIONS, ...SUPPORT_PERMISSIONS].map((code) => ({
        roleId: MANAGER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      })),
      ...['changes.read', 'projects.read'].map((code) => ({
        roleId: READER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 344 Change Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 344 Change Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });
  await database.userRoleAssignment.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        userId: MANAGER_ID,
        roleId: MANAGER_ROLE_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_ID,
        userId: READER_ID,
        roleId: READER_ROLE_ID,
        scopeType: 'PROJECT',
        scopeId: PROJECT_ID,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS344-CLIENT',
      legalName: 'Pass 344 Client Limited',
      displayName: 'Pass 344 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS344-PROJECT',
      name: 'Module 17 Browser Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });
  await database.projectMember.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      userId: READER_ID,
      projectRole: 'PROJECT_VIEWER',
      status: 'ACTIVE',
      fromDate
    }
  });

  await database.wbsNode.create({
    data: {
      id: WBS_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      parentId: null,
      code: 'CHG',
      name: 'Change WBS',
      level: 0,
      status: 'ACTIVE',
      sortOrder: 10
    }
  });
  await database.costCode.create({
    data: {
      id: COST_CODE_ID,
      companyId: COMPANY_ID,
      code: '3440',
      name: 'Variation Cost',
      category: 'DIRECT',
      status: 'ACTIVE'
    }
  });
  await database.costType.create({
    data: {
      id: COST_TYPE_ID,
      companyId: COMPANY_ID,
      code: 'VAR',
      name: 'Variation',
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

  await database.projectBudget.create({
    data: {
      id: BUDGET_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      versionNo: 1,
      budgetType: 'BASELINE',
      status: 'FROZEN',
      approvedAt: new Date('2026-01-10T00:00:00.000Z'),
      totalCost: '1000.00',
      totalRevenue: '1500.00'
    }
  });
  await database.budgetLine.create({
    data: {
      budgetId: BUDGET_ID,
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID,
      quantity: null,
      unitRate: null,
      amount: '1000.00',
      revenueAmount: '1500.00'
    }
  });

  await database.numberSequence.create({
    data: {
      companyId: COMPANY_ID,
      sequenceKey: 'change-request',
      prefix: 'CR-',
      suffix: '',
      padWidth: 4,
      nextValue: 1n,
      incrementBy: 1n,
      status: 'ACTIVE'
    }
  });

  await database.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: APPROVAL_DEFINITION_CODE,
      name: 'Pass 344 Change Request Approval',
      resourceType: 'change_request',
      conditionJson: [],
      status: 'ACTIVE',
      versionNo: 1,
      steps: {
        create: [{
          id: APPROVAL_STEP_ID,
          stepNo: 1,
          approverType: 'USER',
          approverRef: MANAGER_ID,
          minApprovals: 1,
          conditionJson: null,
          reminderAfterMinutes: null,
          escalateAfterMinutes: null,
          expireAfterMinutes: null
        }]
      }
    }
  });
}

/** Sign in through the real Module-24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the Change Orders / Variations workspace through the existing permission-aware admin navigation. */
async function openChangeOrders(page) {
  await page.getByRole('button', { name: 'Change Orders / Variations' }).click();
  await expect(page.getByRole('heading', { name: 'Change Orders / Variations', level: 1 })).toBeVisible();
}

/** Create one Change Request from the reviewed browser form and wait for its server number to appear. */
async function createChangeInUi(page, input) {
  const createSection = page.getByRole('heading', { name: 'Create Change Request' }).locator('..');
  await createSection.getByLabel('Project').selectOption(PROJECT_ID);
  await createSection.getByLabel('Change type').fill(input.changeType);
  await createSection.getByLabel('Title').fill(input.title);
  await createSection.getByLabel('Description').fill(input.description);
  await createSection.getByLabel('Reason').fill(input.reason);
  await createSection.getByRole('button', { name: 'Create Change Request' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`${input.expectedChangeNo} · ${input.title}`) })).toBeVisible();
}

/** Add one fully cost-coded estimate line through the complete reviewed PUT replacement workflow. */
async function saveEstimateInUi(page, input) {
  const estimateSection = page.getByRole('heading', { name: 'Cost / revenue impact worksheet' }).locator('..');
  await estimateSection.getByRole('button', { name: 'Add line' }).click();
  const line = estimateSection.getByRole('group', { name: 'Estimate line 1' });
  await line.getByLabel('Description').fill(input.description);
  await line.getByLabel('Cost amount').fill(input.costAmount);
  await line.getByLabel('Revenue amount').fill(input.revenueAmount);
  await line.getByLabel('WBS node UUID').fill(WBS_ID);
  await line.getByLabel('Cost Code UUID').fill(COST_CODE_ID);
  await line.getByLabel('Cost Type UUID').fill(COST_TYPE_ID);
  await estimateSection.getByRole('button', { name: 'Save complete estimate' }).click();
  const request = await database.changeRequest.findFirstOrThrow({ where: { changeNo: input.changeNo } });
  await expect.poll(async () => database.changeRequestLine.count({ where: { changeRequestId: request.id } })).toBe(1);
}

/** Approve or reject the pending Module-22 request through the existing Approval Workflows UI. */
async function actOnApprovalInUi(page, changeRequestId, action, comment) {
  const approvalSection = page.getByRole('heading', { name: 'Approval state' }).locator('..');
  await approvalSection.getByRole('button', { name: 'Open Approval Workflows' }).click();
  await expect(page.getByRole('heading', { name: 'Approval Workflows', level: 1 })).toBeVisible();

  const row = page.getByRole('row').filter({ hasText: changeRequestId });
  await expect(row).toBeVisible();
  await row.getByRole('button').click();

  const actionLabel = action === 'APPROVE' ? 'Approve' : 'Reject';
  await page.getByRole('button', { name: actionLabel }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Comment/).fill(comment);
  await dialog.getByRole('button', { name: actionLabel }).click();
  await expect(page.locator('.approval-summary').getByText(action === 'APPROVE' ? 'APPROVED' : 'REJECTED', { exact: true })).toBeVisible();
}

/** Return true only when one browser request belongs to the reviewed Stage-22 Change Orders route family. */
function isStage22Request(method, pathname) {
  if (pathname === '/api/v1/change-orders') return method === 'GET';
  if (pathname === '/api/v1/change-orders/requests') return method === 'POST';
  if (/^\/api\/v1\/change-orders\/requests\/[^/]+\/lines$/.test(pathname)) return method === 'PUT';
  if (/^\/api\/v1\/change-orders\/requests\/[^/]+\/(submit|approve|reject)$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/change-orders\/[^/]+\/impact$/.test(pathname)) return method === 'GET';
  return false;
}

/** Parse one captured request body while keeping bodyless submit and reject commands as null. */
function requestBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Capture only Module-17 requests so API surface and browser-authority assertions stay focused. */
function trackStage22Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!isStage22Request(request.method(), url.pathname)) return;
    requests.push({
      method: request.method(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: requestBody(request),
      idempotencyKey: request.headers()['idempotency-key'] ?? null
    });
  });
  return requests;
}

/** Normalize concrete Change Request and Change Order UUIDs into the seven reviewed Stage-22 operations. */
function normalizeStage22Operation(request) {
  const path = request.pathname
    .replace(/^\/api\/v1\/change-orders\/requests\/[^/]+\/lines$/, '/api/v1/change-orders/requests/:id/lines')
    .replace(/^\/api\/v1\/change-orders\/requests\/[^/]+\/submit$/, '/api/v1/change-orders/requests/:id/submit')
    .replace(/^\/api\/v1\/change-orders\/requests\/[^/]+\/approve$/, '/api/v1/change-orders/requests/:id/approve')
    .replace(/^\/api\/v1\/change-orders\/requests\/[^/]+\/reject$/, '/api/v1/change-orders/requests/:id/reject')
    .replace(/^\/api\/v1\/change-orders\/[^/]+\/impact$/, '/api/v1/change-orders/:id/impact');
  return `${request.method} ${path}`;
}

/** Prove the browser uses all seven reviewed operations, retry keys on writes and no server-owned authority fields. */
function assertStage22AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  const seen = new Set(requests.map(normalizeStage22Operation));
  for (const operation of REVIEWED_OPERATIONS) expect(seen.has(operation)).toBe(true);
  for (const operation of seen) expect(REVIEWED_OPERATIONS.has(operation)).toBe(true);

  const writes = requests.filter((request) => ['POST', 'PUT'].includes(request.method));
  for (const request of writes) expect(request.idempotencyKey).toBeTruthy();

  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'changeNo',
    'status',
    'requestedBy',
    'requestedAt',
    'approvedCost',
    'approvedRevenue',
    'approvedAt',
    'changeOrderId',
    'targetType',
    'targetId',
    'amountDelta',
    'quantityDelta',
    'appliedAt'
  ];
  for (const request of requests.filter((item) => item.body !== null)) {
    const serialized = JSON.stringify(request.body);
    for (const field of forbiddenFields) expect(serialized).not.toContain(`\"${field}\"`);
  }

  const createWrites = requests.filter((request) => request.pathname === '/api/v1/change-orders/requests');
  expect(createWrites).toHaveLength(2);
  for (const request of createWrites) {
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['changeType', 'description', 'projectId', 'reason', 'title']);
  }

  const lineWrites = requests.filter((request) => request.pathname.endsWith('/lines'));
  expect(lineWrites).toHaveLength(2);
  for (const request of lineWrites) expect(request.body?.lines).toHaveLength(1);

  const submitWrites = requests.filter((request) => request.pathname.endsWith('/submit'));
  expect(submitWrites).toHaveLength(2);
  for (const request of submitWrites) expect(request.body).toBeNull();

  const approveWrite = requests.find((request) => request.pathname.endsWith('/approve'));
  expect(Object.keys(approveWrite?.body ?? {})).toEqual(['effectiveDate']);
  expect(approveWrite?.body?.effectiveDate).toBe('2026-08-26');

  const rejectWrite = requests.find((request) => request.pathname.endsWith('/reject'));
  expect(rejectWrite?.body).toBeNull();

  const listReads = requests.filter((request) => request.pathname === '/api/v1/change-orders');
  expect(listReads.length).toBeGreaterThan(0);
  for (const request of listReads) expect(request.query).toEqual({ page: '1', pageSize: '25' });

  const impactReads = requests.filter((request) => request.pathname.endsWith('/impact'));
  expect(impactReads.length).toBeGreaterThan(0);
  for (const request of impactReads) expect(request.query).toEqual({});
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Stage-22 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 17 browser workflow covers estimate, approval, atomic impact, rejection and permission denial', async ({ page, browser }) => {
  const managerRequests = trackStage22Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openChangeOrders(page);

  await createChangeInUi(page, {
    expectedChangeNo: 'CR-0001',
    changeType: 'CLIENT_VARIATION',
    title: 'Foundation scope variation',
    description: 'Additional foundation scope requested by the client.',
    reason: 'Issued design change.'
  });
  const approvedRequest = await database.changeRequest.findFirstOrThrow({ where: { changeNo: 'CR-0001' } });

  await saveEstimateInUi(page, {
    changeNo: 'CR-0001',
    description: 'Additional reinforced concrete work',
    costAmount: '125.50',
    revenueAmount: '175.75'
  });

  const approvalSection = page.getByRole('heading', { name: 'Approval state' }).locator('..');
  await approvalSection.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(page.getByText('Pending Module-22 decision')).toBeVisible();
  expect((await database.changeRequest.findUniqueOrThrow({ where: { id: approvedRequest.id } })).status).toBe('SUBMITTED');

  await actOnApprovalInUi(page, approvedRequest.id, 'APPROVE', 'Approved in Pass 344 browser test');
  await openChangeOrders(page);
  const approvedRow = page.getByRole('row').filter({ hasText: 'CR-0001' });
  await approvedRow.getByRole('button', { name: 'Open' }).click();
  const decisionSection = page.getByRole('heading', { name: 'Approval state' }).locator('..');
  await decisionSection.getByLabel('Effective date').fill('2026-08-26');
  await decisionSection.getByRole('button', { name: 'Approve & apply impact' }).click();
  await expect(page.getByText('APPROVED', { exact: true }).first()).toBeVisible();

  const approvedChange = await database.changeRequest.findUniqueOrThrow({
    where: { id: approvedRequest.id },
    include: { changeOrder: { include: { impacts: true } } }
  });
  expect(approvedChange.status).toBe('APPROVED');
  expect(approvedChange.changeOrder?.approvedCost.toString()).toBe('125.50');
  expect(approvedChange.changeOrder?.approvedRevenue.toString()).toBe('175.75');
  expect(approvedChange.changeOrder?.impacts).toHaveLength(4);
  expect(approvedChange.changeOrder?.impacts.every((impact) => impact.status === 'APPLIED' && impact.appliedAt !== null)).toBe(true);

  const approvedImpactSection = page.getByRole('heading', { name: 'Applied-impact summary' }).locator('..');
  await expect(approvedImpactSection).toContainText('125.50');
  await expect(approvedImpactSection).toContainText('175.75');
  for (const targetType of ['PROJECT_BUDGET_COST', 'PROJECT_BUDGET_REVENUE', 'PROJECT_FORECAST_COST', 'PROJECT_FORECAST_REVENUE']) {
    await expect(approvedImpactSection).toContainText(targetType);
  }

  const budgets = await database.projectBudget.findMany({
    where: { projectId: PROJECT_ID },
    orderBy: [{ versionNo: 'asc' }]
  });
  expect(budgets).toHaveLength(2);
  expect(budgets[1].versionNo).toBe(2);
  expect(budgets[1].status).toBe('FROZEN');
  expect(budgets[1].totalCost.toString()).toBe('1125.50');
  expect(budgets[1].totalRevenue?.toString()).toBe('1675.75');

  const forecasts = await database.forecastLine.findMany({
    where: { projectId: PROJECT_ID, asOfDate: new Date('2026-08-26T00:00:00.000Z') }
  });
  expect(forecasts).toHaveLength(1);
  expect(forecasts[0].estimateToComplete.toString()).toBe('125.50');
  expect(forecasts[0].forecastFinalRevenue?.toString()).toBe('175.75');

  await createChangeInUi(page, {
    expectedChangeNo: 'CR-0002',
    changeType: 'SITE_CONDITION',
    title: 'Rejected temporary works variation',
    description: 'Temporary works change proposed for review.',
    reason: 'Site condition review.'
  });
  const rejectedRequest = await database.changeRequest.findFirstOrThrow({ where: { changeNo: 'CR-0002' } });

  await saveEstimateInUi(page, {
    changeNo: 'CR-0002',
    description: 'Temporary works adjustment',
    costAmount: '50.00',
    revenueAmount: '75.00'
  });
  const rejectedApprovalSection = page.getByRole('heading', { name: 'Approval state' }).locator('..');
  await rejectedApprovalSection.getByRole('button', { name: 'Submit for approval' }).click();
  await actOnApprovalInUi(page, rejectedRequest.id, 'REJECT', 'Rejected in Pass 344 browser test');
  await openChangeOrders(page);
  const rejectedRow = page.getByRole('row').filter({ hasText: 'CR-0002' });
  await rejectedRow.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Record rejection' }).click();
  await expect(page.getByText('REJECTED', { exact: true }).first()).toBeVisible();

  const rejectedChange = await database.changeRequest.findUniqueOrThrow({
    where: { id: rejectedRequest.id },
    include: { changeOrder: true }
  });
  expect(rejectedChange.status).toBe('REJECTED');
  expect(rejectedChange.changeOrder).toBeNull();
  expect(await database.projectBudget.count({ where: { projectId: PROJECT_ID } })).toBe(2);

  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.approved' } })).toBe(1);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.impact_applied' } })).toBe(1);
  for (const [eventType, expectedCount] of [
    ['change_request.created', 2],
    ['change_request.submitted', 2],
    ['change_order.approved', 1],
    ['change_order.impact_applied', 1],
    ['change_request.rejected', 1]
  ]) {
    expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } })).toBe(expectedCount);
  }

  assertStage22AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openChangeOrders(readerPage);

    await expect(readerPage.getByRole('row').filter({ hasText: 'CR-0001' })).toBeVisible();
    await expect(readerPage.getByRole('row').filter({ hasText: 'CR-0002' })).toBeVisible();
    await expect(readerPage.getByText('changes.create is required for this command.')).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create Change Request' })).toHaveCount(0);

    await readerPage.getByRole('row').filter({ hasText: 'CR-0001' }).getByRole('button', { name: 'Open' }).click();
    await expect(readerPage.getByRole('heading', { name: 'Cost / revenue impact worksheet' }).locator('..')).toContainText('read-only');
    await expect(readerPage.getByRole('button', { name: 'Add line' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Save complete estimate' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Approve & apply impact' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Record rejection' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();

    const allowedRead = await readerPage.request.get(`${API_BASE_URL}/change-orders?page=1&pageSize=25`, {
      headers: { authorization: `Bearer ${readerToken}` }
    });
    expect(allowedRead.status()).toBe(200);

    const deniedCreate = await readerPage.request.post(`${API_BASE_URL}/change-orders/requests`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass344-reader-denied-create'
      },
      data: {
        projectId: PROJECT_ID,
        changeType: 'DENIED',
        title: 'Denied reader change',
        description: 'The reader must not create this Change Request.',
        reason: 'Permission-negative verification.'
      }
    });
    expect(deniedCreate.status()).toBe(403);

    const deniedLines = await readerPage.request.put(`${API_BASE_URL}/change-orders/requests/${rejectedRequest.id}/lines`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass344-reader-denied-lines'
      },
      data: { lines: [] }
    });
    expect(deniedLines.status()).toBe(403);

    const deniedApprove = await readerPage.request.post(`${API_BASE_URL}/change-orders/requests/${rejectedRequest.id}/approve`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass344-reader-denied-approve'
      },
      data: { effectiveDate: '2026-08-26' }
    });
    expect(deniedApprove.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
