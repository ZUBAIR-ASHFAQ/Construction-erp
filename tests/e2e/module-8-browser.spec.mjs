import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass231-module8-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000023100';
const CLIENT_ID = '00000000-0000-4000-8000-000000023101';
const PROJECT_ID = '00000000-0000-4000-8000-000000023102';
const WBS_ID = '00000000-0000-4000-8000-000000023103';
const COST_CODE_ID = '00000000-0000-4000-8000-000000023104';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000023105';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000023106';
const BUDGET_ID = '00000000-0000-4000-8000-000000023107';
const MANAGER_ID = '00000000-0000-4000-8000-000000023110';
const READER_ID = '00000000-0000-4000-8000-000000023111';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000023120';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000023121';
const VENDOR_1_ID = '00000000-0000-4000-8000-000000023130';
const VENDOR_2_ID = '00000000-0000-4000-8000-000000023131';

const MANAGER_EMAIL = 'pass231-module8-manager@example.test';
const READER_EMAIL = 'pass231-module8-reader@example.test';
const PROJECT_CODE = 'PASS231-PROJECT';
const MODULE_8_PERMISSIONS = [
  'procurement.pr.read',
  'procurement.pr.create',
  'procurement.rfq.manage',
  'procurement.quotation.record',
  'procurement.quotation.select'
];
const READ_SUPPORT_PERMISSIONS = ['projects.read', 'wbs.read', 'cost_codes.read'];

let database;

/** Seed one active Project, cost structure, frozen budget, qualified Vendors and focused Module-8 browser roles. */
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
      legalName: 'Pass 231 Module 8 Company Limited',
      displayName: 'Pass 231 Module 8 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 231 Module 8 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 231 Module 8 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS231-CLIENT',
      legalName: 'Pass 231 Client Limited',
      displayName: 'Pass 231 Client',
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
      name: 'Module 8 Browser Project',
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

  await database.vendor.createMany({
    data: [
      {
        id: VENDOR_1_ID,
        companyId: COMPANY_ID,
        code: 'V-231-A',
        legalName: 'Alpha Procurement Supply Limited',
        displayName: 'Alpha Procurement Supply',
        paymentTermsDays: 30,
        currency: 'USD',
        status: 'ACTIVE',
        qualificationStatus: 'QUALIFIED'
      },
      {
        id: VENDOR_2_ID,
        companyId: COMPANY_ID,
        code: 'V-231-B',
        legalName: 'Beta Procurement Supply Limited',
        displayName: 'Beta Procurement Supply',
        paymentTermsDays: 30,
        currency: 'USD',
        status: 'ACTIVE',
        qualificationStatus: 'QUALIFIED'
      }
    ]
  });

  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'procurement.pr', prefix: 'PR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'procurement.rfq', prefix: 'RFQ-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });

  const permissionCodes = [...READ_SUPPORT_PERMISSIONS, ...MODULE_8_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    const domain = code.startsWith('projects.')
      ? 'projects'
      : code.startsWith('wbs.') || code.startsWith('cost_codes.')
        ? 'wbs-cost-codes'
        : 'procurement';
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain },
      create: { code, name: code, domain }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module8-browser-manager', name: 'Module 8 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module8-browser-reader', name: 'Module 8 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...['projects.read', 'procurement.pr.read'].map((code) => ({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) }))
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

/** Open the permission-aware Module-8 workspace from the shared admin shell. */
async function openModule8(page) {
  await page.getByRole('button', { name: 'Procurement & RFQ' }).click();
  await expect(page.getByRole('heading', { name: 'Procurement & RFQ' })).toBeVisible();
}

/** Return true only for one of the eight reviewed Module-8 endpoint shapes or a previously reviewed readback used by this browser workflow. */
function isAllowedModule8Path(method, pathname) {
  if (pathname === '/api/v1/procurement/vendors') return method === 'GET';
  if (pathname === '/api/v1/procurement/requisitions') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/procurement\/requisitions\/[^/]+\/submit$/.test(pathname)) return method === 'POST';
  if (pathname === '/api/v1/procurement/rfqs') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/procurement\/rfqs\/[^/]+$/.test(pathname)) return method === 'GET';
  if (/^\/api\/v1\/procurement\/rfqs\/[^/]+\/issue$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/procurement\/rfqs\/[^/]+\/quotations$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/procurement\/rfqs\/[^/]+\/comparison$/.test(pathname)) return method === 'GET';
  if (/^\/api\/v1\/procurement\/rfqs\/[^/]+\/select-quotation$/.test(pathname)) return method === 'POST';
  return false;
}


/** Record Module-8 HTTP requests so browser authority and route-surface assertions can inspect the real workflow. */
function trackModule8Requests(page) {
  const requests = [];

  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/procurement/')) return;

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

/** Assert the browser stays inside the reviewed Module-8 contract and never sends server-owned procurement authority. */
function assertModule8AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedModule8Path(request.method, request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of [
      'companyId',
      'actorUserId',
      'permissions',
      'projectScope',
      'requestedBy',
      'buyerUserId',
      'prNo',
      'rfqNo',
      'status',
      'subtotal',
      'responseStatus',
      'invitedAt',
      'financialCommitmentCreated'
    ]) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const listRequests = requests.filter((request) => request.method === 'GET'
    && request.pathname === '/api/v1/procurement/requisitions');
  expect(listRequests.length).toBeGreaterThan(0);
  for (const request of listRequests) {
    expect(request.query).toEqual({ projectId: PROJECT_ID, page: '1', pageSize: '25' });
  }

  const createPr = requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/procurement/requisitions');
  expect(Object.keys(createPr?.body ?? {}).sort()).toEqual(['items', 'projectId', 'purpose', 'requiredDate']);
  expect(Object.keys(createPr?.body?.items?.[0] ?? {}).sort()).toEqual([
    'costCodeId', 'costTypeId', 'description', 'estimatedRate', 'quantity', 'unit', 'wbsNodeId'
  ]);

  const submitPr = requests.find((request) => request.pathname.endsWith('/submit'));
  expect(submitPr?.body).toBeNull();

  const createRfq = requests.find((request) => request.method === 'POST'
    && request.pathname === '/api/v1/procurement/rfqs');
  expect(Object.keys(createRfq?.body ?? {}).sort()).toEqual(['dueDate', 'issueDate', 'projectId', 'requisitionId']);

  const issueRfq = requests.find((request) => request.pathname.endsWith('/issue'));
  expect(Object.keys(issueRfq?.body ?? {})).toEqual(['vendorIds']);
  expect(issueRfq?.body?.vendorIds).toEqual([VENDOR_1_ID, VENDOR_2_ID]);

  const quotationRequests = requests.filter((request) => request.pathname.endsWith('/quotations'));
  expect(quotationRequests).toHaveLength(2);
  for (const request of quotationRequests) {
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['items', 'leadTimeDays', 'quoteDate', 'quoteNo', 'validUntil', 'vendorId']);
    expect(Object.keys(request.body?.items?.[0] ?? {}).sort()).toEqual(['discount', 'quantity', 'rfqItemId', 'tax', 'unitRate']);
    expect(JSON.stringify(request.body)).not.toContain('"total"');
  }

  const comparisonRequests = requests.filter((request) => request.pathname.endsWith('/comparison'));
  expect(comparisonRequests.length).toBeGreaterThan(0);
  for (const request of comparisonRequests) expect(request.query).toEqual({});

  const selectionRequest = requests.find((request) => request.pathname.endsWith('/select-quotation'));
  expect(Object.keys(selectionRequest?.body ?? {}).sort()).toEqual(['quotationId', 'rationale']);
  expect(selectionRequest?.body?.rationale).toBe('Lowest comparable stored total and acceptable lead time.');

  const vendorReads = requests.filter((request) => request.pathname === '/api/v1/procurement/vendors');
  expect(vendorReads.length).toBeGreaterThan(0);
  for (const request of vendorReads) {
    expect(request.method).toBe('GET');
    expect(request.query).toEqual({ page: '1', pageSize: '100' });
  }

  const rfqListReads = requests.filter((request) => request.method === 'GET'
    && request.pathname === '/api/v1/procurement/rfqs');
  expect(rfqListReads.length).toBeGreaterThan(0);
  for (const request of rfqListReads) {
    expect(request.query).toEqual({ projectId: PROJECT_ID, page: '1', pageSize: '25' });
  }

  const rfqDetailReads = requests.filter((request) => request.method === 'GET'
    && /^\/api\/v1\/procurement\/rfqs\/[^/]+$/.test(request.pathname));
  expect(rfqDetailReads.length).toBeGreaterThan(0);
  for (const request of rfqDetailReads) expect(request.query).toEqual({});

  expect(requests.some((request) => request.pathname.includes('/vendor-contacts'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/convert-to-po'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/commitments'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/journals'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/payables'))).toBe(false);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module-8 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 8 browser workflow creates a requisition, issues an RFQ, compares quotations and selects pre-commitment without authority leakage', async ({ page, browser }) => {
  const managerRequests = trackModule8Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule8(page);

  await page.getByLabel('Project').selectOption(PROJECT_ID);
  await expect(page.getByRole('heading', { name: `${PROJECT_CODE} · Module 8 Browser Project` })).toBeVisible();
  await expect(page.getByText('Pre-commitment', { exact: true })).toBeVisible();

  const requisitionSection = page.getByRole('heading', { name: 'Create purchase requisition' }).locator('..');
  await requisitionSection.getByLabel('Required date').fill('2026-09-15');
  await requisitionSection.getByLabel('Purpose').fill('Concrete materials for foundation works');
  const requisitionRow = requisitionSection.locator('.module8-editor-table tbody tr').first();
  await requisitionRow.locator('input').nth(0).fill('Ready-mix concrete');
  await requisitionRow.locator('input').nth(1).fill('10');
  await requisitionRow.locator('input').nth(2).fill('m3');
  await requisitionRow.locator('input').nth(3).fill('125.50');
  await requisitionRow.locator('select').selectOption(COST_STRUCTURE_ID);
  await requisitionSection.getByRole('button', { name: 'Create requisition' }).click();

  const registerSection = page.getByRole('heading', { name: 'Purchase requisition register' }).locator('..').locator('..');
  await expect(registerSection).toContainText('PR-0001');
  await expect(registerSection).toContainText('Concrete materials for foundation works');
  const registerRow = registerSection.locator('.module8-requisition-table tbody tr').filter({ hasText: 'PR-0001' });
  await registerRow.getByRole('button', { name: 'Submit' }).click();
  await expect(registerRow).toContainText('SUBMITTED');

  const rfqSection = page.getByRole('heading', { name: 'RFQ builder & Vendor invitation' }).locator('..');
  await expect(rfqSection).toContainText('Selected requisition: PR-0001 · SUBMITTED');
  await rfqSection.getByLabel('Issue date').fill('2026-09-01');
  await rfqSection.getByLabel('Due date').fill('2026-09-10');
  await rfqSection.getByRole('button', { name: 'Create RFQ' }).click();
  await expect(rfqSection).toContainText('RFQ-0001');
  await expect(rfqSection).toContainText('DRAFT');

  const vendorForm = rfqSection.locator('.module8-vendor-form');
  await vendorForm.getByLabel('Vendor').selectOption(VENDOR_1_ID);
  await vendorForm.getByRole('button', { name: 'Add Vendor' }).click();
  await vendorForm.getByLabel('Vendor').nth(1).selectOption(VENDOR_2_ID);
  await vendorForm.getByRole('button', { name: 'Issue RFQ' }).click();
  await expect(rfqSection).toContainText('ISSUED');

  // Prove the active RFQ is recovered from the durable list and detail endpoint after browser reload.
  await page.reload();
  await openModule8(page);
  await page.getByLabel('Project').selectOption(PROJECT_ID);
  const existingRfqSection = page.getByRole('heading', { name: 'Existing RFQs' }).locator('..');
  const existingRfqRow = existingRfqSection.locator('tbody tr').filter({ hasText: 'RFQ-0001' });
  await existingRfqRow.getByRole('button', { name: 'Open' }).click();
  await expect(rfqSection).toContainText('RFQ-0001');
  await expect(rfqSection).toContainText('ISSUED');

  const rfqItem = await database.rfqItem.findFirst({
    where: {
      rfq: { companyId: COMPANY_ID, projectId: PROJECT_ID, rfqNo: 'RFQ-0001' }
    }
  });
  expect(rfqItem).toBeTruthy();

  const quotationSection = page.getByRole('heading', { name: 'Supplier quotation entry / local import' }).locator('..');
  await quotationSection.getByLabel('Invited Vendor UUID').fill(VENDOR_1_ID);
  await quotationSection.getByLabel('Supplier quote no.').fill('ALPHA-231');
  await quotationSection.getByLabel('Quote date').fill('2026-09-02');
  await quotationSection.getByLabel('Valid until').fill('2099-12-31');
  await quotationSection.getByLabel('Lead time days').fill('7');
  const firstQuotationRow = quotationSection.locator('.module8-editor-table tbody tr').first();
  await expect(firstQuotationRow).toContainText(rfqItem.id);
  const editableQuotationInputs = firstQuotationRow.locator('input:not([type="hidden"])');
  await editableQuotationInputs.nth(0).fill('2');
  await editableQuotationInputs.nth(1).fill('100');
  await editableQuotationInputs.nth(2).fill('5');
  await editableQuotationInputs.nth(3).fill('10');
  await quotationSection.getByRole('button', { name: 'Record quotation' }).click();
  await expect(quotationSection).toContainText('Quotation ALPHA-231 recorded with server total USD 205.00.');

  await quotationSection.getByLabel('Invited Vendor UUID').fill(VENDOR_2_ID);
  await quotationSection.getByLabel('Supplier quote no.').fill('BETA-231');
  await quotationSection.getByLabel('Quote date').fill('2026-09-02');
  await quotationSection.getByLabel('Valid until').fill('2099-12-31');
  await quotationSection.getByLabel('Lead time days').fill('5');
  await quotationSection.getByLabel('Local JSON line import').fill(JSON.stringify([{
    rfqItemId: rfqItem.id,
    quantity: '2',
    unitRate: '90',
    discount: '0',
    tax: '5'
  }]));
  await quotationSection.getByRole('button', { name: 'Load lines into form' }).click();
  await quotationSection.getByRole('button', { name: 'Record quotation' }).click();
  await expect(quotationSection).toContainText('Quotation BETA-231 recorded with server total USD 185.00.');

  const comparisonSection = page.getByRole('heading', { name: 'Quotation comparison & selection approval' }).locator('..');
  await expect(comparisonSection.locator('.module8-comparison-table tbody tr')).toHaveCount(2);
  const betaRow = comparisonSection.locator('.module8-comparison-table tbody tr').filter({ hasText: 'BETA-231' });
  const alphaRow = comparisonSection.locator('.module8-comparison-table tbody tr').filter({ hasText: 'ALPHA-231' });
  await expect(betaRow).toContainText('USD 185.00');
  await expect(betaRow).toContainText('Lowest stored total');
  await expect(alphaRow).toContainText('USD 205.00');
  await comparisonSection.getByLabel('Selection rationale / non-lowest exception reason when policy requires').fill('Lowest comparable stored total and acceptable lead time.');
  await betaRow.getByRole('button', { name: 'Select' }).click();
  await expect(comparisonSection).toContainText('Selected quotation BETA-231. No financial commitment is created by this selection.');
  await expect(betaRow).toContainText('SELECTED');

  const requisition = await database.purchaseRequisition.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, prNo: 'PR-0001' },
    include: { items: true }
  });
  const rfq = await database.rfq.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, rfqNo: 'RFQ-0001' },
    include: { items: true, vendors: true, quotations: { include: { items: true } } }
  });
  expect(requisition?.status).toBe('SUBMITTED');
  expect(requisition?.items).toHaveLength(1);
  expect(rfq?.items).toHaveLength(1);
  expect(rfq?.items[0]?.requisitionItemId).toBe(requisition?.items[0]?.id);
  expect(requisition?.items[0]?.quantity.toString()).toBe('10');
  expect(requisition?.items[0]?.estimatedRate?.toString()).toBe('125.5');
  expect(rfq?.status).toBe('SELECTED');
  expect(rfq?.vendors).toHaveLength(2);
  expect(rfq?.quotations).toHaveLength(2);
  const selectedQuotation = rfq?.quotations.find((quotation) => quotation.status === 'SELECTED');
  expect(selectedQuotation?.quoteNo).toBe('BETA-231');
  expect(selectedQuotation?.subtotal.toString()).toBe('180');
  expect(selectedQuotation?.tax.toString()).toBe('5');
  expect(selectedQuotation?.total.toString()).toBe('185');
  expect(await database.costCommitment.count({ where: { companyId: COMPANY_ID, projectId: PROJECT_ID } })).toBe(0);
  expect(await database.journal.count({ where: { companyId: COMPANY_ID } })).toBe(0);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'purchase_requisition.submitted' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfq.issued' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'supplier_quotation.received' } })).toBe(2);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfq.quotation_selected' } })).toBe(1);

  assertModule8AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule8(readerPage);
    await readerPage.getByLabel('Project').selectOption(PROJECT_ID);
    await expect(readerPage.getByText('PR-0001', { exact: true })).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create requisition' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create RFQ' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Record quotation' })).toHaveCount(0);
    await expect(readerPage.getByText('Company-level procurement.pr.create is not visible', { exact: false })).toBeVisible();
    await expect(readerPage.getByText('Company-level procurement.rfq.manage is not visible', { exact: false })).toBeVisible();

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const deniedCreate = await readerPage.request.post(`${API_BASE_URL}/procurement/requisitions`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: {
        projectId: PROJECT_ID,
        requiredDate: '2026-09-20',
        purpose: 'Denied browser request',
        items: [{
          description: 'Denied item',
          quantity: '1',
          unit: 'ea',
          estimatedRate: '1.00',
          wbsNodeId: WBS_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID
        }]
      }
    });
    expect(deniedCreate.status()).toBe(403);

    const deniedSelect = await readerPage.request.post(`${API_BASE_URL}/procurement/rfqs/${rfq.id}/select-quotation`, {
      headers: { authorization: `Bearer ${readerToken}` },
      data: { quotationId: selectedQuotation.id, rationale: 'Denied' }
    });
    expect(deniedSelect.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
