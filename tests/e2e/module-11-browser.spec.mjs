import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass264-module11-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000026400';
const CLIENT_ID = '00000000-0000-4000-8000-000000026401';
const PROJECT_ID = '00000000-0000-4000-8000-000000026402';
const WBS_ID = '00000000-0000-4000-8000-000000026403';
const COST_CODE_ID = '00000000-0000-4000-8000-000000026404';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000026405';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000026406';
const MANAGER_ID = '00000000-0000-4000-8000-000000026410';
const READER_ID = '00000000-0000-4000-8000-000000026411';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000026420';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000026421';
const VENDOR_ID = '00000000-0000-4000-8000-000000026430';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000026440';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000026441';

const MANAGER_EMAIL = 'pass264-module11-manager@example.test';
const READER_EMAIL = 'pass264-module11-reader@example.test';
const APPROVAL_DEFINITION_CODE = 'SUBCONTRACT_EXECUTION';
const MODULE_11_PERMISSIONS = [
  'subcontractors.read',
  'subcontractors.manage',
  'subcontracts.read',
  'subcontracts.create',
  'subcontracts.execute',
  'subcontracts.certify',
  'subcontracts.close'
];
const DEPENDENCY_PERMISSIONS = ['approvals.inbox.read', 'approvals.act', 'job_cost.read'];

let database;

/** Seed the smallest Stage-16 graph needed for the complete subcontract browser workflow and a restricted reader. */
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
      legalName: 'Pass 264 Module 11 Company Limited',
      displayName: 'Pass 264 Module 11 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissionCodes = [...MODULE_11_PERMISSIONS, ...DEPENDENCY_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('subcontract') ? 'subcontracts' : code.startsWith('approvals.') ? 'approvals' : 'job-cost' },
      create: { code, name: code, domain: code.startsWith('subcontract') ? 'subcontracts' : code.startsWith('approvals.') ? 'approvals' : 'job-cost' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module11-browser-manager', name: 'Module 11 Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module11-browser-reader', name: 'Module 11 Browser Reader', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...permissionCodes.map((code) => ({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...['subcontractors.read', 'subcontracts.read'].map((code) => ({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 264 Module 11 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 264 Module 11 Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });
  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS264-CLIENT',
      legalName: 'Pass 264 Client Limited',
      displayName: 'Pass 264 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS264-PROJECT',
      name: 'Module 11 Browser Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });
  await database.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: MANAGER_ID, projectRole: 'COMMERCIAL_MANAGER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'READER', status: 'ACTIVE', fromDate }
    ]
  });

  await database.wbsNode.create({
    data: { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'SUB', name: 'Subcontract Works', level: 0, status: 'ACTIVE', sortOrder: 10 }
  });
  await database.costCode.create({
    data: { id: COST_CODE_ID, companyId: COMPANY_ID, code: 'SUB-264', name: 'Subcontract Work', category: 'DIRECT', status: 'ACTIVE' }
  });
  await database.costType.create({
    data: { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'SUB', name: 'Subcontract', status: 'ACTIVE' }
  });
  await database.projectCostCode.create({
    data: { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' }
  });

  await database.vendor.create({
    data: {
      id: VENDOR_ID,
      companyId: COMPANY_ID,
      code: 'V-264',
      legalName: 'Pass 264 Vendor Limited',
      displayName: 'Pass 264 Vendor',
      paymentTermsDays: 30,
      currency: 'USD',
      status: 'ACTIVE',
      qualificationStatus: 'QUALIFIED'
    }
  });
  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'subcontract', prefix: 'SC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'subcontract-payment-application', prefix: 'SCA-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });

  await database.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: APPROVAL_DEFINITION_CODE,
      name: 'Subcontract Execution Approval',
      resourceType: 'subcontract',
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

/** Sign in through the real shared Module-24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the permission-aware Subcontractor Management workspace from the shared admin shell. */
async function openModule11(page) {
  await page.getByRole('button', { name: 'Subcontractor Management' }).click();
  await expect(page.getByRole('heading', { name: 'Subcontractor Management' })).toBeVisible();
}

/** Return true only for one of the eight reviewed Stage-16 Module-11 operation shapes. */
function isAllowedModule11Path(method, pathname) {
  if (pathname === '/api/v1/subcontractors') return method === 'GET' || method === 'POST';
  if (pathname === '/api/v1/subcontracts') return method === 'POST';
  if (/^\/api\/v1\/subcontracts\/[^/]+$/.test(pathname)) return method === 'PATCH';
  if (/^\/api\/v1\/subcontracts\/[^/]+\/(?:execute|close)$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/subcontracts\/[^/]+\/payment-applications$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/subcontracts\/[^/]+\/payment-applications\/[^/]+\/certify$/.test(pathname)) return method === 'POST';
  return false;
}

/** Record real Module-11 browser requests so route, idempotency and server-authority boundaries can be asserted. */
function trackModule11Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/subcontract')) return;

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
      body,
      idempotencyKey: request.headers()['idempotency-key'] ?? null
    });
  });
  return requests;
}

/** Assert browser writes stay inside the reviewed eight operations and never own server-calculated subcontract state. */
function assertModule11AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedModule11Path(request.method, request.pathname)).toBe(true);
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of [
      'companyId',
      'actorUserId',
      'permissions',
      'allowedProjectIds',
      'subcontractNo',
      'applicationNo',
      'status',
      'originalValue',
      'revisedValue',
      'claimedAmount',
      'certifiedAmount',
      'retentionAmount',
      'previousQty',
      'approvalDefinitionCode',
      'approvalStatus',
      'commitmentAmount',
      'financePostingState'
    ]) expect(serializedBody).not.toContain(`\"${field}\"`);

    if (request.method !== 'GET') expect(request.idempotencyKey).toBeTruthy();
  }

  const registerRequests = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/subcontractors');
  expect(registerRequests.length).toBeGreaterThan(0);
  for (const request of registerRequests) {
    expect(request.query.page).toBe('1');
    expect(request.query.pageSize).toBe('25');
  }

  const subcontractorCreate = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/subcontractors');
  expect(Object.keys(subcontractorCreate?.body ?? {}).sort()).toEqual([
    'code', 'complianceStatus', 'contactJson', 'legalName', 'taxNo', 'vendorId'
  ]);

  const subcontractCreate = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/subcontracts');
  expect(Object.keys(subcontractCreate?.body ?? {}).sort()).toEqual([
    'currency', 'endDate', 'items', 'projectId', 'retentionPercent', 'startDate', 'subcontractorId'
  ]);
  expect(Object.keys(subcontractCreate?.body?.items?.[0] ?? {}).sort()).toEqual([
    'amount', 'costCodeId', 'costTypeId', 'description', 'quantity', 'rate', 'unit', 'wbsNodeId'
  ]);

  const draftPatch = requests.find((request) => request.method === 'PATCH');
  expect(Object.keys(draftPatch?.body ?? {})).toEqual(['endDate']);

  const executeRequests = requests.filter((request) => request.pathname.endsWith('/execute'));
  expect(executeRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of executeRequests) expect(request.body).toBeNull();

  const applicationRequest = requests.find((request) => request.pathname.endsWith('/payment-applications'));
  expect(Object.keys(applicationRequest?.body ?? {}).sort()).toEqual(['lines', 'periodFrom', 'periodTo']);
  expect(Object.keys(applicationRequest?.body?.lines?.[0] ?? {}).sort()).toEqual(['currentQty', 'currentValue', 'subcontractItemId']);

  const certificationRequest = requests.find((request) => request.pathname.endsWith('/certify'));
  expect(Object.keys(certificationRequest?.body ?? {})).toEqual(['lines']);
  expect(Object.keys(certificationRequest?.body?.lines?.[0] ?? {}).sort()).toEqual(['certifiedValue', 'subcontractItemId']);

  const closeRequest = requests.find((request) => request.pathname.endsWith('/close'));
  expect(closeRequest?.body).toBeNull();

  expect(requests.some((request) => request.pathname.includes('/approve'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/revisions'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/retention/release'))).toBe(false);
  expect(requests.some((request) => request.pathname.includes('/finance'))).toBe(false);
}

/** Approve one pending subcontract execution through the real Module-22 browser inbox. */
async function approveSubcontractInUi(page, subcontractId) {
  await page.getByRole('button', { name: 'Approvals' }).click();
  await expect(page.getByRole('heading', { name: 'Approval Workflows' })).toBeVisible();
  const row = page.getByRole('row').filter({ hasText: subcontractId });
  await expect(row).toBeVisible();
  await row.getByRole('button').click();
  await page.getByRole('button', { name: 'Approve' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Comment/).fill('Approved in Pass 264 browser verification');
  await dialog.getByRole('button', { name: 'Approve' }).click();
  await expect(page.locator('.approval-summary').getByText('APPROVED', { exact: true })).toBeVisible();
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module-11 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 11 browser workflow covers vendor linkage, draft edit, approval, execution commitment, application, certification, closeout and permission denial', async ({ page, browser }) => {
  const managerRequests = trackModule11Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openModule11(page);

  const subcontractorSection = page.getByRole('heading', { name: 'Subcontractor register' }).locator('..');
  const subcontractorForm = subcontractorSection.getByRole('heading', { name: 'Create subcontractor' }).locator('..');
  await subcontractorForm.getByLabel('Code').fill('SCON-264');
  await subcontractorForm.getByLabel('Legal name').fill('Pass 264 Subcontractor Limited');
  await subcontractorForm.getByLabel('Existing Vendor UUID (optional)').fill(VENDOR_ID);
  await subcontractorForm.getByLabel('Tax number (optional)').fill('NTN-PASS264');
  await subcontractorForm.getByLabel('Compliance status').fill('APPROVED');
  await subcontractorForm.getByLabel('Contact JSON object').fill('{"name":"Commercial Contact","email":"pass264@example.test"}');
  await subcontractorForm.getByRole('button', { name: 'Create subcontractor' }).click();
  await expect(subcontractorSection).toContainText('SCON-264');
  await expect(subcontractorSection).toContainText(VENDOR_ID);

  const subcontractor = await database.subcontractor.findFirst({ where: { companyId: COMPANY_ID, code: 'SCON-264' } });
  expect(subcontractor).toBeTruthy();
  expect(subcontractor.vendorId).toBe(VENDOR_ID);

  const createSection = page.getByRole('heading', { name: 'Draft subcontract & scope' }).locator('..');
  await createSection.getByLabel('Project UUID').fill(PROJECT_ID);
  await createSection.getByLabel('Subcontractor UUID').fill(subcontractor.id);
  await createSection.getByLabel('Start date').fill('2026-08-25');
  await createSection.getByLabel('End date (optional)').fill('2026-12-31');
  await createSection.getByLabel('Retention %').fill('0.0000');
  await createSection.getByLabel('Currency').fill('USD');
  const scopeLine = createSection.locator('.module11-line-card').first();
  await scopeLine.getByLabel('Description').fill('Concrete structural subcontract scope');
  await scopeLine.getByLabel('Quantity').fill('10.0000');
  await scopeLine.getByLabel('Unit').fill('lot');
  await scopeLine.getByLabel('Rate').fill('100.0000');
  await scopeLine.getByLabel('Amount').fill('1000.00');
  await scopeLine.getByLabel('WBS node UUID').fill(WBS_ID);
  await scopeLine.getByLabel('Cost code UUID').fill(COST_CODE_ID);
  await scopeLine.getByLabel('Cost type UUID').fill(COST_TYPE_ID);
  await createSection.getByRole('button', { name: 'Create draft subcontract' }).click();

  const currentSection = page.getByRole('heading', { name: 'Current subcontract command readback' }).locator('..');
  await expect(currentSection).toContainText('SC-0001');
  await expect(currentSection).toContainText('DRAFT');
  await expect(currentSection).toContainText('1000.00 USD');

  const subcontract = await database.subcontract.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, subcontractNo: 'SC-0001' },
    include: { items: true }
  });
  expect(subcontract).toBeTruthy();
  expect(subcontract.items).toHaveLength(1);
  expect(subcontract.originalValue.toString()).toBe('1000');
  const itemId = subcontract.items[0].id;

  const editSection = page.getByRole('heading', { name: 'Edit DRAFT subcontract' }).locator('..');
  await editSection.getByLabel('End date (optional)').fill('2027-01-31');
  await editSection.getByRole('button', { name: 'Save DRAFT changes' }).click();
  await expect(currentSection).toContainText('2027-01-31');

  const executionSection = page.getByRole('heading', { name: 'Approval & execution' }).locator('..');
  await executionSection.getByRole('button', { name: 'Execute / recheck approval' }).click();
  await expect.poll(async () => database.approvalRequest.count({
    where: { companyId: COMPANY_ID, resourceType: 'subcontract', resourceId: subcontract.id }
  })).toBe(1);
  await expect(executionSection).toContainText('PENDING');

  await approveSubcontractInUi(page, subcontract.id);

  await openModule11(page);
  const resumedExecutionSection = page.getByRole('heading', { name: 'Approval & execution' }).locator('..');
  await resumedExecutionSection.getByLabel('Current subcontract UUID').fill(subcontract.id);
  await resumedExecutionSection.getByRole('button', { name: 'Execute / recheck approval' }).click();

  const executedSection = page.getByRole('heading', { name: 'Current subcontract command readback' }).locator('..');
  await expect(executedSection).toContainText('EXECUTED');
  const commitmentSection = page.getByRole('heading', { name: 'Commitment summary' }).locator('..');
  await expect(commitmentSection).toContainText('1000.00');
  await expect(commitmentSection).toContainText('ACTIVE');

  const commitment = await database.costCommitment.findFirst({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'subcontract', sourceId: subcontract.id }
  });
  expect(commitment).toBeTruthy();
  expect(commitment.originalAmount.toString()).toBe('1000');
  expect(commitment.remainingAmount.toString()).toBe('1000');

  const applicationSection = page.getByRole('heading', { name: 'Progress application' }).locator('..');
  await applicationSection.getByLabel('Period from').fill('2026-08-01');
  await applicationSection.getByLabel('Period to').fill('2026-08-31');
  await applicationSection.getByRole('button', { name: 'Add progress line' }).click();
  const progressLine = applicationSection.locator('.module11-line-card').first();
  await progressLine.getByLabel('Subcontract item UUID').fill(itemId);
  await progressLine.getByLabel('Current quantity').fill('10.0000');
  await progressLine.getByLabel('Current value').fill('1000.00');
  await applicationSection.getByRole('button', { name: 'Submit progress application' }).click();

  const retentionSection = page.getByRole('heading', { name: 'Progress certification & retention snapshot' }).locator('..');
  await expect(retentionSection).toContainText('SCA-0001');
  await expect(retentionSection).toContainText('SUBMITTED');
  await expect(retentionSection).toContainText('1000.00');

  const application = await database.subcontractPaymentApplication.findFirst({
    where: { subcontractId: subcontract.id, applicationNo: 'SCA-0001' },
    include: { lines: true }
  });
  expect(application).toBeTruthy();
  expect(application.lines).toHaveLength(1);

  const certificationSection = page.getByRole('heading', { name: 'QS certification' }).locator('..');
  await certificationSection.getByRole('button', { name: 'Add certification line' }).click();
  const certificationLine = certificationSection.locator('.module11-line-card').first();
  await certificationLine.getByLabel('Subcontract item UUID').fill(itemId);
  await certificationLine.getByLabel('Certified value').fill('1000.00');
  await certificationSection.getByRole('button', { name: 'Certify application' }).click();

  await expect(retentionSection).toContainText('CERTIFIED');
  await expect(retentionSection).toContainText('Certified1000.00');
  await expect(retentionSection).toContainText('Retention0.00');

  const closeSection = page.getByRole('heading', { name: 'Final closeout' }).locator('..');
  await closeSection.getByRole('button', { name: 'Close subcontract' }).click();
  await expect(page.getByRole('heading', { name: 'Current subcontract command readback' }).locator('..')).toContainText('CLOSED');

  const persistedSubcontract = await database.subcontract.findUnique({ where: { id: subcontract.id } });
  expect(persistedSubcontract.status).toBe('CLOSED');
  expect(await database.costCommitment.count({ where: { companyId: COMPANY_ID, sourceType: 'subcontract', sourceId: subcontract.id } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: subcontract.id, eventType: 'subcontract.executed' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: application.id, eventType: 'subcontract.payment_application_submitted' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: application.id, eventType: 'subcontract.payment_certified' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: subcontract.id, eventType: 'subcontract.closed' } })).toBe(1);
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'subcontract.revised' } })).toBe(0);
  expect(await database.costActual.count({ where: { companyId: COMPANY_ID, sourceType: { startsWith: 'subcontract' } } })).toBe(0);
  expect(await database.journal.count({ where: { companyId: COMPANY_ID } })).toBe(0);

  assertModule11AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openModule11(readerPage);
    const readerRegister = readerPage.getByRole('heading', { name: 'Subcontractor register' }).locator('..');
    await expect(readerRegister).toContainText('SCON-264');
    await expect(readerPage.getByRole('button', { name: 'Create subcontractor' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create draft subcontract' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Save DRAFT changes' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Execute / recheck approval' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Submit progress application' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Certify application' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Close subcontract' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const deniedCreate = await readerPage.request.post(`${API_BASE_URL}/subcontracts`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass264-reader-denied-create'
      },
      data: {
        projectId: PROJECT_ID,
        subcontractorId: subcontractor.id,
        startDate: '2026-08-25',
        endDate: '2026-12-31',
        retentionPercent: '0.0000',
        currency: 'USD',
        items: [{
          description: 'Denied scope',
          quantity: '1.0000',
          unit: 'lot',
          rate: '100.0000',
          amount: '100.00',
          wbsNodeId: WBS_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID
        }]
      }
    });
    expect(deniedCreate.status()).toBe(403);

    const deniedExecute = await readerPage.request.post(`${API_BASE_URL}/subcontracts/${subcontract.id}/execute`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass264-reader-denied-execute'
      }
    });
    expect(deniedExecute.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
