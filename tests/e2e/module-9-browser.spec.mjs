import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass242-module9-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000024200';
const CLIENT_ID = '00000000-0000-4000-8000-000000024201';
const PROJECT_ID = '00000000-0000-4000-8000-000000024202';
const WBS_ID = '00000000-0000-4000-8000-000000024203';
const COST_CODE_ID = '00000000-0000-4000-8000-000000024204';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000024205';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000024206';
const BUDGET_ID = '00000000-0000-4000-8000-000000024207';
const MANAGER_ID = '00000000-0000-4000-8000-000000024210';
const READER_ID = '00000000-0000-4000-8000-000000024211';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000024220';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000024221';
const VENDOR_ID = '00000000-0000-4000-8000-000000024230';
const RFQ_ID = '00000000-0000-4000-8000-000000024231';
const QUOTATION_ID = '00000000-0000-4000-8000-000000024232';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000024240';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000024241';

const MANAGER_EMAIL = 'pass242-module9-manager@example.test';
const READER_EMAIL = 'pass242-module9-reader@example.test';
const PROJECT_CODE = 'PASS242-PROJECT';
const MODULE_9_PERMISSIONS = [
  'purchase_orders.read',
  'purchase_orders.create',
  'purchase_orders.edit',
  'purchase_orders.submit',
  'purchase_orders.issue',
  'purchase_orders.revise',
  'purchase_orders.direct_purchase'
];
const SUPPORT_PERMISSIONS = [
  'projects.read',
  'wbs.read',
  'cost_codes.read',
  'job_cost.read',
  'approvals.inbox.read',
  'approvals.act'
];

let database;

/** Seed one complete Stage-14 browser dependency graph with a selected quotation, frozen budget and PO approval workflow. */
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
      legalName: 'Pass 242 Module 9 Company Limited',
      displayName: 'Pass 242 Module 9 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 242 Module 9 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 242 Module 9 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS242-CLIENT',
      legalName: 'Pass 242 Client Limited',
      displayName: 'Pass 242 Client',
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
      name: 'Module 9 Browser Project',
      clientId: CLIENT_ID,
      tenderId: null,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
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
      name: 'Procurement',
      level: 0,
      status: 'ACTIVE',
      sortOrder: 10
    }
  });
  await database.costCode.create({
    data: {
      id: COST_CODE_ID,
      companyId: COMPANY_ID,
      code: '2000',
      name: 'Materials',
      category: 'DIRECT',
      status: 'ACTIVE'
    }
  });
  await database.costType.create({
    data: {
      id: COST_TYPE_ID,
      companyId: COMPANY_ID,
      code: 'MAT',
      name: 'Material',
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
      approvedAt: new Date('2026-08-01T00:00:00.000Z'),
      totalCost: '50000.00',
      totalRevenue: '65000.00'
    }
  });

  await database.vendor.create({
    data: {
      id: VENDOR_ID,
      companyId: COMPANY_ID,
      code: 'V-242',
      legalName: 'Pass 242 Selected Vendor Limited',
      displayName: 'Pass 242 Selected Vendor',
      paymentTermsDays: 30,
      currency: 'USD',
      status: 'ACTIVE',
      qualificationStatus: 'QUALIFIED'
    }
  });
  await database.rfq.create({
    data: {
      id: RFQ_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      rfqNo: 'RFQ-242',
      requisitionId: null,
      issueDate: new Date('2026-08-20T00:00:00.000Z'),
      dueDate: new Date('2026-08-25T00:00:00.000Z'),
      status: 'SELECTED',
      buyerUserId: MANAGER_ID
    }
  });
  await database.rfqVendor.create({
    data: {
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      invitedAt: new Date('2026-08-20T08:00:00.000Z'),
      responseStatus: 'RESPONDED'
    }
  });
  await database.supplierQuotation.create({
    data: {
      id: QUOTATION_ID,
      rfqId: RFQ_ID,
      vendorId: VENDOR_ID,
      quoteNo: 'PASS242-SELECTED',
      quoteDate: new Date('2026-08-21T00:00:00.000Z'),
      validUntil: new Date('2099-12-31T00:00:00.000Z'),
      subtotal: '200.00',
      tax: '10.00',
      total: '210.00',
      leadTimeDays: 7,
      status: 'SELECTED'
    }
  });

  await database.numberSequence.create({
    data: {
      companyId: COMPANY_ID,
      sequenceKey: 'purchase-order',
      prefix: 'PO-',
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
      code: 'PURCHASE_ORDER',
      name: 'Purchase Order Approval',
      resourceType: 'purchase_order',
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

  const permissionCodes = [...SUPPORT_PERMISSIONS, ...MODULE_9_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    const domain = code.startsWith('purchase_orders.')
      ? 'purchase-orders'
      : code.startsWith('approvals.')
        ? 'approvals'
        : code.startsWith('projects.')
          ? 'projects'
          : code.startsWith('wbs.') || code.startsWith('cost_codes.')
            ? 'wbs-cost-codes'
            : 'budgets-job-cost';
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain },
      create: { code, name: code, domain }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module9-browser-manager', name: 'Module 9 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module9-browser-reader', name: 'Module 9 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...['projects.read', 'purchase_orders.read'].map((code) => ({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });
  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });
}

/** Sign in through the real shared Module-24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the permission-aware Purchase Orders workspace from the shared admin shell. */
async function openModule9(page) {
  await page.getByRole('button', { name: 'Purchase Orders' }).click();
  await expect(page.getByRole('heading', { name: 'Purchase Orders' })).toBeVisible();
}

/** Return true only for one of the eight reviewed Stage-14 Purchase Order endpoint shapes. */
function isAllowedModule9Path(method, pathname) {
  if (pathname === '/api/v1/purchase-orders') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/purchase-orders\/[^/]+$/.test(pathname)) return method === 'GET' || method === 'PATCH';
  if (/^\/api\/v1\/purchase-orders\/[^/]+\/(?:submit|issue|revise|cancel)$/.test(pathname)) return method === 'POST';
  return false;
}

/** Record real Module-9 requests so browser authority and route-surface assertions can inspect the workflow. */
function trackModule9Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/purchase-orders')) return;

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

/** Assert browser writes stay inside the reviewed eight-operation contract and never own server-calculated PO state. */
function assertModule9AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedModule9Path(request.method, request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of [
      'companyId',
      'actorUserId',
      'permissions',
      'allowedProjectIds',
      'poNo',
      'status',
      'subtotal',
      'tax',
      'total',
      'lineTotal',
      'receivedQty',
      'invoicedAmount',
      'revisionNo',
      'approvedAt',
      'createdBy',
      'commitmentId',
      'approvalDecision'
    ]) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const listRequests = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/purchase-orders');
  expect(listRequests.length).toBeGreaterThan(0);
  for (const request of listRequests) {
    expect(request.query.projectId).toBe(PROJECT_ID);
    expect(request.query.page).toBe('1');
    expect(request.query.pageSize).toBe('25');
  }

  const createRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/purchase-orders');
  expect(Object.keys(createRequest?.body ?? {}).sort()).toEqual([
    'currency', 'deliveryAddress', 'items', 'orderDate', 'projectId', 'quotationId', 'terms', 'vendorId'
  ]);
  expect(Object.keys(createRequest?.body?.items?.[0] ?? {}).sort()).toEqual([
    'costCodeId', 'costTypeId', 'description', 'quantity', 'taxRate', 'unit', 'unitRate', 'wbsNodeId'
  ]);

  const submitRequests = requests.filter((request) => request.pathname.endsWith('/submit'));
  expect(submitRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of submitRequests) expect(request.body).toBeNull();

  const issueRequest = requests.find((request) => request.pathname.endsWith('/issue'));
  expect(issueRequest?.body).toBeNull();

  const revisionRequest = requests.find((request) => request.pathname.endsWith('/revise'));
  expect(Object.keys(revisionRequest?.body ?? {}).sort()).toEqual(['deliveryAddress', 'reason']);

  const cancellationRequest = requests.find((request) => request.pathname.endsWith('/cancel'));
  expect(Object.keys(cancellationRequest?.body ?? {})).toEqual(['reason']);

  expect(requests.some((request) => request.pathname.includes('/receipt'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/invoice'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/approve'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/commitments'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/finance'))).toBe(false);
}

/** Approve the submitted Purchase Order through the real Module-22 browser inbox. */
async function approvePurchaseOrderInUi(page, purchaseOrderId) {
  await page.getByRole('button', { name: 'Approvals' }).click();
  await expect(page.getByRole('heading', { name: 'Approval Workflows' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: purchaseOrderId });
  await expect(row).toBeVisible();
  await row.getByRole('button').click();
  await page.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Comment/).fill('Approved in Pass 242 browser verification');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.approval-summary').getByText('APPROVED', { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module-9 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 9 browser workflow covers quotation-backed draft, approval, issue, commitment visibility, controlled revision/cancel and permission denial', async ({ page, browser }) => {
  const managerRequests = trackModule9Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule9(page);

  await page.getByLabel('Project').selectOption(PROJECT_ID);
  const createSection = page.getByRole('heading', { name: 'Create draft PO' }).locator('..');
  await createSection.getByLabel('Vendor UUID').fill(VENDOR_ID);
  await createSection.getByLabel('Selected quotation UUID').fill(QUOTATION_ID);
  await createSection.getByLabel('Order date').fill('2026-08-24');
  await createSection.getByLabel('Delivery address').fill('Pass 242 Project Site, Lahore');
  await createSection.getByLabel('Terms').fill('Net 30 days');
  const line = createSection.locator('.module9-line-card').first();
  await line.getByLabel('Description').fill('Structural steel supply');
  await line.getByLabel('Quantity').fill('2.0000');
  await line.getByLabel('Unit').fill('ton');
  await line.getByLabel('Unit rate').fill('100.0000');
  await line.getByLabel('Tax rate %').fill('5.0000');
  await line.getByLabel('Project cost structure').selectOption(COST_STRUCTURE_ID);
  await createSection.getByRole('button', { name: 'Create draft PO' }).click();

  await expect(page.getByRole('heading', { name: 'PO-0001' })).toBeVisible();
  const selectedCard = page.locator('.module9-detail-card');
  await expect(selectedCard).toContainText('USD 210.00 · DRAFT');
  const created = await database.purchaseOrder.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, poNo: 'PO-0001' },
    include: { items: true }
  });
  expect(created).toBeTruthy();
  expect(created.items).toHaveLength(1);
  expect(created.total.toString()).toBe('210');

  await page.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(selectedCard).toContainText('PENDING_APPROVAL');
  const approvalSection = page.getByRole('heading', { name: 'Approval timeline' }).locator('..');
  await expect(approvalSection).toContainText('Purchase Order Approval');
  await expect(approvalSection).toContainText('PENDING');

  await approvePurchaseOrderInUi(page, created.id);

  await openModule9(page);
  await page.getByLabel('Project').selectOption(PROJECT_ID);
  const registerRow = page.locator('.module9-register-table tbody tr').filter({ hasText: 'PO-0001' });
  await expect(registerRow).toContainText('PENDING_APPROVAL');
  await registerRow.getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Refresh approval status' }).click();
  await expect(page.locator('.module9-detail-card')).toContainText('APPROVED');
  await page.getByRole('button', { name: 'Issue PO' }).click();
  await expect(page.locator('.module9-detail-card')).toContainText('ISSUED');

  const commitmentSection = page.getByRole('heading', { name: 'Commitment status' }).locator('..');
  await expect(commitmentSection).toContainText('USD 210.00');
  await expect(commitmentSection).toContainText('ACTIVE');
  const issuedCommitment = await database.costCommitment.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: created.id }
  });
  expect(issuedCommitment).toBeTruthy();
  expect(issuedCommitment.remainingAmount.toString()).toBe('210');

  const revisionSection = page.getByRole('heading', { name: 'Controlled revision' }).locator('..');
  await revisionSection.getByLabel('Reason').fill('Update controlled delivery location');
  await revisionSection.getByLabel('Delivery address').fill('Pass 242 Revised Project Site, Lahore');
  await revisionSection.getByRole('button', { name: 'Create revision' }).click();
  const revisionHistory = page.getByRole('heading', { name: 'Controlled revision history' }).locator('..');
  await expect(revisionHistory).toContainText('Update controlled delivery location');
  await expect(revisionHistory).toContainText('210.00');
  const revisionLineDetails = revisionHistory.locator('details').filter({ hasText: 'Revision 1 line snapshots' });
  await revisionLineDetails.locator('summary').click();
  await expect(revisionLineDetails).toContainText('BEFORE');
  await expect(revisionLineDetails).toContainText('AFTER');
  expect(await database.purchaseOrderRevision.count({ where: { purchaseOrderId: created.id } })).toBe(1);
  expect(await database.purchaseOrderRevisionItem.count()).toBeGreaterThanOrEqual(2);

  const cancelSection = page.getByRole('heading', { name: 'Cancel remaining commitment' }).locator('..');
  await cancelSection.getByLabel('Cancellation reason').fill('Procurement scope cancelled after approved design change');
  await cancelSection.getByRole('button', { name: 'Cancel PO' }).click();
  await expect(page.locator('.module9-detail-card')).toContainText('CANCELLED');
  const cancellationEvidence = page.getByRole('heading', { name: 'Cancellation evidence' }).locator('..');
  await expect(cancellationEvidence).toContainText('Procurement scope cancelled after approved design change');
  await expect(cancellationEvidence).toContainText(ADMIN_ID);
  const persistedCancellation = await database.purchaseOrder.findFirstOrThrow({ where: { id: created.id } });
  expect(persistedCancellation.cancelReason).toBe('Procurement scope cancelled after approved design change');
  expect(persistedCancellation.cancelledBy).toBe(ADMIN_ID);
  expect(persistedCancellation.cancelledAt).toBeTruthy();
  const cancelledCommitment = await database.costCommitment.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: created.id }
  });
  expect(cancelledCommitment.remainingAmount.toString()).toBe('0');
  expect(cancelledCommitment.status).toBe('CANCELLED');

  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.created' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.submitted' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.issued' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.revised' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.cancelled' } })).toBe(1);
  expect(await database.journal.count({ where: { companyId: COMPANY_ID } })).toBe(0);

  const directCreateSection = page.getByRole('heading', { name: 'Create draft PO' }).locator('..');
  await directCreateSection.getByLabel('Procurement source').selectOption('DIRECT_PURCHASE');
  await directCreateSection.getByLabel('Vendor UUID').fill(VENDOR_ID);
  await directCreateSection.getByLabel('Direct-purchase reason').fill('Urgent site safety requirement approved for exception processing');
  await directCreateSection.getByLabel('Order date').fill('2026-08-25');
  await directCreateSection.getByLabel('Delivery address').fill('Pass 364 Direct Purchase Site, Lahore');
  await directCreateSection.getByLabel('Terms').fill('Immediate delivery');
  const directLine = directCreateSection.locator('.module9-line-card').first();
  await directLine.getByLabel('Description').fill('Emergency site material');
  await directLine.getByLabel('Quantity').fill('1.0000');
  await directLine.getByLabel('Unit').fill('ea');
  await directLine.getByLabel('Unit rate').fill('50.0000');
  await directLine.getByLabel('Tax rate %').fill('0.0000');
  await directLine.getByLabel('Project cost structure').selectOption(COST_STRUCTURE_ID);
  await directCreateSection.getByRole('button', { name: 'Create draft PO' }).click();
  await expect(page.getByRole('heading', { name: 'PO-0002' })).toBeVisible();
  const directPurchase = await database.purchaseOrder.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, poNo: 'PO-0002' }
  });
  expect(directPurchase?.quotationId).toBeNull();
  expect(directPurchase?.directPurchaseReason).toBe('Urgent site safety requirement approved for exception processing');

  assertModule9AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule9(readerPage);
    await readerPage.getByLabel('Project').selectOption(PROJECT_ID);
    const readerRow = readerPage.locator('.module9-register-table tbody tr').filter({ hasText: 'PO-0001' });
    await expect(readerRow).toBeVisible();
    await readerRow.getByRole('button', { name: 'Open' }).click();
    await expect(readerPage.getByRole('heading', { name: 'PO-0001' })).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create draft PO' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Submit for approval' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Refresh approval status' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Issue PO' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Controlled revision' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Cancel remaining commitment' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const deniedCreate = await readerPage.request.post(`${API_BASE_URL}/purchase-orders`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: {
        projectId: PROJECT_ID,
        vendorId: VENDOR_ID,
        quotationId: QUOTATION_ID,
        orderDate: '2026-08-25',
        currency: 'USD',
        deliveryAddress: 'Denied browser create',
        terms: 'Denied',
        items: [{
          description: 'Denied item',
          quantity: '1.0000',
          unit: 'ea',
          unitRate: '210.0000',
          taxRate: '0.0000',
          wbsNodeId: WBS_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID
        }]
      }
    });
    expect(deniedCreate.status()).toBe(403);

    const deniedCancel = await readerPage.request.post(`${API_BASE_URL}/purchase-orders/${created.id}/cancel`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { reason: 'Denied cancellation' }
    });
    expect(deniedCancel.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
