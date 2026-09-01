import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass120-tender-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000012000';
const CLIENT_ID = '00000000-0000-4000-8000-000000012001';

const MANAGER_ID = '00000000-0000-4000-8000-000000012010';
const READER_ID = '00000000-0000-4000-8000-000000012011';
const ESTIMATE_EDITOR_ID = '00000000-0000-4000-8000-000000012012';
const SUBMITTER_ID = '00000000-0000-4000-8000-000000012013';
const OUTCOME_MANAGER_ID = '00000000-0000-4000-8000-000000012014';
const NO_ACCESS_ID = '00000000-0000-4000-8000-000000012015';

const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000012020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000012021';
const ESTIMATE_EDITOR_ROLE_ID = '00000000-0000-4000-8000-000000012022';
const SUBMITTER_ROLE_ID = '00000000-0000-4000-8000-000000012023';
const OUTCOME_MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000012024';
const NO_ACCESS_ROLE_ID = '00000000-0000-4000-8000-000000012025';

const MANAGER_EMAIL = 'pass120-tender-manager@example.test';
const READER_EMAIL = 'pass120-tender-reader@example.test';
const ESTIMATE_EDITOR_EMAIL = 'pass120-estimate-editor@example.test';
const SUBMITTER_EMAIL = 'pass120-tender-submitter@example.test';
const OUTCOME_MANAGER_EMAIL = 'pass120-outcome-manager@example.test';
const NO_ACCESS_EMAIL = 'pass120-no-tender-access@example.test';

const PERMISSION_TENDER_ID = '00000000-0000-4000-8000-000000012100';
const PERMISSION_ESTIMATE_ID = '00000000-0000-4000-8000-000000012101';
const SUBMIT_TENDER_ID = '00000000-0000-4000-8000-000000012110';
const SUBMIT_ESTIMATE_ID = '00000000-0000-4000-8000-000000012111';
const LOSS_TENDER_ID = '00000000-0000-4000-8000-000000012120';
const LOSS_ESTIMATE_ID = '00000000-0000-4000-8000-000000012121';
const LOSS_SUBMISSION_ID = '00000000-0000-4000-8000-000000012122';
const CANCEL_TENDER_ID = '00000000-0000-4000-8000-000000012130';

const MAIN_TENDER_NO = 'PASS120-MAIN';
const MAIN_TENDER_TITLE = 'Pass 120 Main Tender';
const PERMISSION_TENDER_NO = 'PASS120-PERMISSIONS';
const SUBMIT_TENDER_NO = 'PASS120-SUBMIT';
const LOSS_TENDER_NO = 'PASS120-LOSS';
const CANCEL_TENDER_NO = 'PASS120-CANCEL';

const MODULE_3_PERMISSIONS = [
  'tenders.read',
  'tenders.create',
  'estimates.edit',
  'tenders.submit',
  'tenders.manage_outcome'
];

let database;

/** Seed one company, one active Client and focused Module 3 permission scenarios for browser verification. */
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
      legalName: 'Pass 120 Tender Company Ltd',
      displayName: 'Pass 120 Tender Company',
      status: 'ACTIVE',
      baseCurrency: 'PKR',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS120-CLIENT',
      legalName: 'Pass 120 Client (Private) Limited',
      displayName: 'Pass 120 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });

  const permissions = [];
  for (const code of MODULE_3_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'tendering' },
      create: { code, name: code, domain: 'tendering' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'tender-manager', name: 'Tender Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'tender-reader', name: 'Tender Reader', isSystem: false, status: 'ACTIVE' },
      { id: ESTIMATE_EDITOR_ROLE_ID, companyId: COMPANY_ID, code: 'estimate-editor', name: 'Estimate Editor', isSystem: false, status: 'ACTIVE' },
      { id: SUBMITTER_ROLE_ID, companyId: COMPANY_ID, code: 'tender-submitter', name: 'Tender Submitter', isSystem: false, status: 'ACTIVE' },
      { id: OUTCOME_MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'outcome-manager', name: 'Outcome Manager', isSystem: false, status: 'ACTIVE' },
      { id: NO_ACCESS_ROLE_ID, companyId: COMPANY_ID, code: 'no-tender-access', name: 'No Tender Access', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await database.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: MANAGER_ROLE_ID, permissionId: permission.id })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('tenders.read') },
      { roleId: ESTIMATE_EDITOR_ROLE_ID, permissionId: permissionByCode.get('tenders.read') },
      { roleId: ESTIMATE_EDITOR_ROLE_ID, permissionId: permissionByCode.get('estimates.edit') },
      { roleId: SUBMITTER_ROLE_ID, permissionId: permissionByCode.get('tenders.read') },
      { roleId: SUBMITTER_ROLE_ID, permissionId: permissionByCode.get('tenders.submit') },
      { roleId: OUTCOME_MANAGER_ROLE_ID, permissionId: permissionByCode.get('tenders.read') },
      { roleId: OUTCOME_MANAGER_ROLE_ID, permissionId: permissionByCode.get('tenders.manage_outcome') }
    ]
  });

  const users = [
    { id: MANAGER_ID, email: MANAGER_EMAIL, name: 'Pass 120 Tender Manager' },
    { id: READER_ID, email: READER_EMAIL, name: 'Pass 120 Tender Reader' },
    { id: ESTIMATE_EDITOR_ID, email: ESTIMATE_EDITOR_EMAIL, name: 'Pass 120 Estimate Editor' },
    { id: SUBMITTER_ID, email: SUBMITTER_EMAIL, name: 'Pass 120 Tender Submitter' },
    { id: OUTCOME_MANAGER_ID, email: OUTCOME_MANAGER_EMAIL, name: 'Pass 120 Outcome Manager' },
    { id: NO_ACCESS_ID, email: NO_ACCESS_EMAIL, name: 'Pass 120 No Tender Access' }
  ];
  await database.user.createMany({
    data: users.map((user) => ({ ...user, companyId: COMPANY_ID, status: 'ACTIVE' }))
  });
  await database.authCredential.createMany({
    data: users.map((user) => ({ userId: user.id, passwordHash }))
  });
  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: ESTIMATE_EDITOR_ID, roleId: ESTIMATE_EDITOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: SUBMITTER_ID, roleId: SUBMITTER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: OUTCOME_MANAGER_ID, roleId: OUTCOME_MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: NO_ACCESS_ID, roleId: NO_ACCESS_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await database.tender.createMany({
    data: [
      { id: PERMISSION_TENDER_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, tenderNo: PERMISSION_TENDER_NO, title: 'Permission Test Tender', dueDate: new Date('2027-05-01T00:00:00.000Z'), status: 'DRAFT', ownerUserId: MANAGER_ID, currency: 'PKR' },
      { id: SUBMIT_TENDER_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, tenderNo: SUBMIT_TENDER_NO, title: 'Submit Permission Tender', dueDate: new Date('2027-05-02T00:00:00.000Z'), status: 'DRAFT', ownerUserId: MANAGER_ID, currency: 'PKR' },
      { id: LOSS_TENDER_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, tenderNo: LOSS_TENDER_NO, title: 'Loss Outcome Tender', dueDate: new Date('2027-05-03T00:00:00.000Z'), status: 'SUBMITTED', ownerUserId: MANAGER_ID, currency: 'PKR' },
      { id: CANCEL_TENDER_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, tenderNo: CANCEL_TENDER_NO, title: 'Cancel Outcome Tender', dueDate: new Date('2027-05-04T00:00:00.000Z'), status: 'DRAFT', ownerUserId: MANAGER_ID, currency: 'PKR' }
    ]
  });

  await database.estimateVersion.createMany({
    data: [
      { id: PERMISSION_ESTIMATE_ID, tenderId: PERMISSION_TENDER_ID, versionNo: 1, status: 'DRAFT', directCost: '100.00', indirectCost: '10.00', contingency: '5.00', markup: '5.00', tenderTotal: '120.00', createdBy: MANAGER_ID },
      { id: SUBMIT_ESTIMATE_ID, tenderId: SUBMIT_TENDER_ID, versionNo: 1, status: 'FINAL', directCost: '200.00', indirectCost: '20.00', contingency: '10.00', markup: '10.00', tenderTotal: '240.00', createdBy: MANAGER_ID },
      { id: LOSS_ESTIMATE_ID, tenderId: LOSS_TENDER_ID, versionNo: 1, status: 'FINAL', directCost: '300.00', indirectCost: '30.00', contingency: '15.00', markup: '15.00', tenderTotal: '360.00', createdBy: MANAGER_ID }
    ]
  });

  await database.estimateItem.create({
    data: {
      estimateVersionId: PERMISSION_ESTIMATE_ID,
      description: 'Seeded permission-test item',
      quantity: '1.0000',
      unit: 'LS',
      laborCost: '100.00',
      materialCost: '0.00',
      equipmentCost: '0.00',
      subcontractCost: '0.00',
      otherCost: '0.00'
    }
  });

  await database.tenderSubmission.create({
    data: {
      id: LOSS_SUBMISSION_ID,
      tenderId: LOSS_TENDER_ID,
      estimateVersionId: LOSS_ESTIMATE_ID,
      submittedBy: MANAGER_ID,
      submittedAmount: '360.00',
      validityDate: new Date('2027-06-30T00:00:00.000Z'),
      outcome: 'PENDING'
    }
  });
}

/** Sign in through the real Module 24A form and wait until the authenticated workspace is visible. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Record Module 3 browser requests so ownership and lifecycle authority can be verified after the workflow. */
function trackModule3Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/tenders')) return;

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

/** Verify browser writes never contain tenant, actor, lifecycle, calculated-total or approval authority. */
function assertServerOwnedAuthority(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'directCost',
    'tenderTotal',
    'versionNo',
    'status',
    'approvalDefinitionCode',
    'submittedAmount',
    'submittedBy',
    'submittedAt'
  ];

  for (const request of requests) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) continue;
    for (const field of forbiddenFields) expect(request.body).not.toHaveProperty(field);
  }

  const createTenderRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/tenders');
  expect(Object.keys(createTenderRequest?.body ?? {}).sort()).toEqual([
    'clientId', 'currency', 'dueDate', 'opportunityId', 'ownerUserId', 'tenderNo', 'title'
  ]);

  const estimateWrites = requests.filter((request) => (
    (request.method === 'POST' || request.method === 'PATCH')
    && /\/api\/v1\/tenders\/[^/]+\/estimates$|\/api\/v1\/tenders\/[^/]+\/estimates\/[^/]+$/.test(request.pathname)
  ));
  expect(estimateWrites.length).toBeGreaterThanOrEqual(3);
  for (const request of estimateWrites) {
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['contingency', 'indirectCost', 'items', 'markup']);
    expect(Object.keys(request.body.items[0]).sort()).toEqual([
      'description', 'equipmentCost', 'laborCost', 'materialCost', 'otherCost', 'quantity', 'subcontractCost', 'unit'
    ]);
  }

  const finalizeRequests = requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/finalize'));
  expect(finalizeRequests).toHaveLength(2);
  for (const request of finalizeRequests) expect(request.body).toBeNull();

  const submitRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/submit'));
  expect(Object.keys(submitRequest?.body ?? {}).sort()).toEqual(['estimateVersionId', 'validityDate']);

  const outcomeRequests = requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/outcome'));
  expect(outcomeRequests).toHaveLength(3);
  for (const request of outcomeRequests) {
    expect(Object.keys(request.body ?? {}).sort()).toEqual(['outcome', 'reason']);
  }
}

/** Open one Tender row by its stable Tender number. */
async function openTender(page, tenderNo) {
  const row = page.getByRole('row').filter({ hasText: tenderNo });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
}

/** Fill the shared estimate worksheet editor with one simple reviewed item. */
async function fillEstimateWorksheet(page, values) {
  await page.getByLabel('Indirect cost').fill(values.indirectCost);
  await page.getByLabel('Contingency').fill(values.contingency);
  await page.getByLabel('Markup').fill(values.markup);
  await page.getByLabel('Item 1 description').fill(values.description);
  await page.getByLabel('Item 1 quantity').fill(values.quantity);
  await page.getByLabel('Item 1 unit').fill(values.unit);
  await page.getByLabel('Item 1 labor cost').fill(values.laborCost);
  await page.getByLabel('Item 1 material cost').fill(values.materialCost);
  await page.getByLabel('Item 1 equipment cost').fill(values.equipmentCost);
  await page.getByLabel('Item 1 subcontract cost').fill(values.subcontractCost);
  await page.getByLabel('Item 1 other cost').fill(values.otherCost);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module 3 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 3 browser workflow covers estimate versions, comparison, submission, outcomes and permission enforcement', async ({ page, browser }) => {
  const managerRequests = trackModule3Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await expect(page.getByRole('heading', { name: 'Tendering & Estimation' })).toBeVisible();

  // Create the primary Tender through the real browser form using business input only.
  const createTenderCard = page.getByRole('heading', { name: 'Create Tender' }).locator('..');
  await createTenderCard.getByLabel('Client').fill(CLIENT_ID);
  await createTenderCard.getByLabel('Tender number').fill(MAIN_TENDER_NO);
  await createTenderCard.getByLabel('Tender title').fill(MAIN_TENDER_TITLE);
  await createTenderCard.getByLabel('Due date').fill('2027-04-30');
  await createTenderCard.getByLabel('Owner user ID').fill(MANAGER_ID);
  await createTenderCard.getByLabel('Currency').fill('PKR');
  await createTenderCard.getByRole('button', { name: 'Create Tender' }).click();
  await expect(page.getByRole('heading', { name: MAIN_TENDER_TITLE })).toBeVisible();
  await expect(page.getByText('Tender status: DRAFT', { exact: true })).toBeVisible();

  const mainTender = await database.tender.findUnique({
    where: { companyId_tenderNo: { companyId: COMPANY_ID, tenderNo: MAIN_TENDER_NO } }
  });
  expect(mainTender).toBeTruthy();

  // Build V1, verify server-owned totals, edit the DRAFT, then finalize it.
  await page.getByRole('button', { name: 'Create estimate version' }).click();
  await fillEstimateWorksheet(page, {
    description: 'Version 1 foundation works',
    quantity: '2.5000',
    unit: 'm3',
    laborCost: '100.10',
    materialCost: '200.20',
    equipmentCost: '300.30',
    subcontractCost: '400.40',
    otherCost: '500.50',
    indirectCost: '10.10',
    contingency: '20.20',
    markup: '30.30'
  });
  await page.getByRole('button', { name: 'Create version' }).click();
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 1501.5');
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 1562.1');

  await page.getByRole('button', { name: 'Edit selected draft' }).click();
  await page.getByLabel('Item 1 labor cost').fill('110.10');
  await page.getByLabel('Indirect cost').fill('11.10');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 1511.5');
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 1573.1');

  await page.getByRole('button', { name: 'Finalize estimate' }).click();
  await expect(page.getByText('Finalized without approval workflow', { exact: true })).toBeVisible();
  const versionOne = await database.estimateVersion.findFirst({
    where: { tenderId: mainTender.id, versionNo: 1 },
    select: { id: true }
  });
  expect(versionOne).toBeTruthy();
  await expect(page.getByLabel('Review version')).toHaveValue(versionOne.id);

  // Build and finalize V2, then compare the two immutable commercial snapshots side by side.
  await page.getByRole('button', { name: 'Create estimate version' }).click();
  await fillEstimateWorksheet(page, {
    description: 'Version 2 revised commercial works',
    quantity: '3.0000',
    unit: 'm3',
    laborCost: '200.00',
    materialCost: '300.00',
    equipmentCost: '400.00',
    subcontractCost: '500.00',
    otherCost: '600.00',
    indirectCost: '20.00',
    contingency: '30.00',
    markup: '50.00'
  });
  await page.getByRole('button', { name: 'Create version' }).click();
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 2000');
  await expect(page.locator('section[aria-labelledby="estimate-workspace-title"]')).toContainText('PKR 2100');
  await page.getByRole('button', { name: 'Finalize estimate' }).click();
  await expect(page.getByLabel('Review version')).toContainText('Version 2 · FINAL');

  await page.getByLabel('Compare with').selectOption(versionOne.id);
  const comparison = page.locator('section[aria-labelledby="estimate-comparison-title"]');
  await expect(comparison.getByRole('columnheader', { name: 'Version 2' })).toBeVisible();
  await expect(comparison.getByRole('columnheader', { name: 'Version 1' })).toBeVisible();
  const comparisonTotal = comparison.getByRole('row').filter({ hasText: 'Tender total' });
  await expect(comparisonTotal).toContainText('2100');
  await expect(comparisonTotal).toContainText('1573.1');

  // Submit V2 and prove the immutable submission uses the server-owned commercial amount.
  const versionTwo = await database.estimateVersion.findFirst({
    where: { tenderId: mainTender.id, versionNo: 2 },
    select: { id: true }
  });
  expect(versionTwo).toBeTruthy();
  const submitCard = page.getByRole('heading', { name: 'Submit Tender' }).locator('..');
  await submitCard.getByLabel('Estimate version').selectOption(versionTwo.id);
  await submitCard.getByLabel('Validity date').fill('2027-06-30');
  await submitCard.getByRole('button', { name: 'Submit Tender' }).click();
  await expect(page.getByText('Tender status: SUBMITTED', { exact: true })).toBeVisible();
  const submissionSection = page.locator('section[aria-labelledby="tender-commercial-actions-title"]');
  await expect(submissionSection).toContainText('PKR 2100');
  await expect(submissionSection).toContainText('PENDING');

  // Exercise every reviewed terminal outcome: WON for the browser-created Tender, LOST and CANCELLED for prepared lifecycle states.
  const outcomeCard = page.getByRole('heading', { name: 'Record outcome' }).locator('..');
  await outcomeCard.getByLabel('Outcome').selectOption('WON');
  await outcomeCard.getByLabel('Reason (optional)').fill('Client issued the award letter.');
  await outcomeCard.getByRole('button', { name: 'Record outcome' }).click();
  await expect(page.getByText('Tender status: WON', { exact: true })).toBeVisible();
  await expect(submissionSection).toContainText('WON');

  await openTender(page, LOSS_TENDER_NO);
  const lossOutcomeCard = page.getByRole('heading', { name: 'Record outcome' }).locator('..');
  await lossOutcomeCard.getByLabel('Outcome').selectOption('LOST');
  await lossOutcomeCard.getByLabel('Reason (optional)').fill('Another evaluated bid was selected.');
  await lossOutcomeCard.getByRole('button', { name: 'Record outcome' }).click();
  await expect(page.getByText('Tender status: LOST', { exact: true })).toBeVisible();

  await openTender(page, CANCEL_TENDER_NO);
  const cancelOutcomeCard = page.getByRole('heading', { name: 'Record outcome' }).locator('..');
  await cancelOutcomeCard.getByLabel('Outcome').selectOption('CANCELLED');
  await cancelOutcomeCard.getByLabel('Reason (optional)').fill('Client withdrew the tender invitation.');
  await cancelOutcomeCard.getByRole('button', { name: 'Record outcome' }).click();
  await expect(page.getByText('Tender status: CANCELLED', { exact: true })).toBeVisible();

  assertServerOwnedAuthority(managerRequests);

  const persistedMainTender = await database.tender.findUnique({ where: { id: mainTender.id } });
  const persistedMainVersions = await database.estimateVersion.findMany({ where: { tenderId: mainTender.id }, orderBy: { versionNo: 'asc' } });
  const persistedMainSubmission = await database.tenderSubmission.findUnique({ where: { tenderId: mainTender.id } });
  expect(persistedMainTender?.status).toBe('WON');
  expect(persistedMainVersions.map((version) => version.status)).toEqual(['FINAL', 'FINAL']);
  expect(persistedMainVersions.map((version) => version.tenderTotal.toFixed(2))).toEqual(['1573.10', '2100.00']);
  expect(persistedMainSubmission?.submittedAmount.toFixed(2)).toBe('2100.00');
  expect(persistedMainSubmission?.submittedBy).toBe(MANAGER_ID);
  expect(persistedMainSubmission?.outcome).toBe('WON');
  expect((await database.tender.findUnique({ where: { id: LOSS_TENDER_ID } }))?.status).toBe('LOST');
  expect((await database.tender.findUnique({ where: { id: CANCEL_TENDER_ID } }))?.status).toBe('CANCELLED');

  // A read-only user can inspect a live DRAFT Tender but gets no mutation controls; the API independently rejects a write.
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await signIn(readerPage, READER_EMAIL);
  await openTender(readerPage, PERMISSION_TENDER_NO);
  await expect(readerPage.getByRole('heading', { name: 'Create Tender' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Create estimate version' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Edit selected draft' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Finalize estimate' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Submit Tender' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Record outcome' })).toHaveCount(0);
  await expect(readerPage.getByText('Your current role has read-only commercial access.', { exact: true })).toBeVisible();
  const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(readerToken).toBeTruthy();
  const forbiddenEstimateCreate = await readerPage.request.post(`${API_BASE_URL}/tenders/${PERMISSION_TENDER_ID}/estimates`, {
    headers: { authorization: `Bearer ${readerToken}` },
    data: {
      indirectCost: '0.00',
      contingency: '0.00',
      markup: '0.00',
      items: [{ description: 'Forbidden', quantity: '1.0000', unit: 'LS', laborCost: '1.00', materialCost: '0.00', equipmentCost: '0.00', subcontractCost: '0.00', otherCost: '0.00' }]
    }
  });
  expect(forbiddenEstimateCreate.status()).toBe(403);

  // An estimate editor gets only the reviewed estimate controls and cannot submit through the API.
  const estimateEditorContext = await browser.newContext();
  const estimateEditorPage = await estimateEditorContext.newPage();
  await signIn(estimateEditorPage, ESTIMATE_EDITOR_EMAIL);
  await openTender(estimateEditorPage, PERMISSION_TENDER_NO);
  await expect(estimateEditorPage.getByRole('button', { name: 'Create estimate version' })).toBeVisible();
  await expect(estimateEditorPage.getByRole('button', { name: 'Edit selected draft' })).toBeVisible();
  await expect(estimateEditorPage.getByRole('button', { name: 'Finalize estimate' })).toBeVisible();
  await expect(estimateEditorPage.getByRole('heading', { name: 'Submit Tender' })).toHaveCount(0);
  await expect(estimateEditorPage.getByRole('heading', { name: 'Record outcome' })).toHaveCount(0);
  const estimateEditorToken = await estimateEditorPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(estimateEditorToken).toBeTruthy();
  const forbiddenSubmit = await estimateEditorPage.request.post(`${API_BASE_URL}/tenders/${SUBMIT_TENDER_ID}/submit`, {
    headers: { authorization: `Bearer ${estimateEditorToken}` },
    data: { estimateVersionId: SUBMIT_ESTIMATE_ID, validityDate: '2027-06-30' }
  });
  expect(forbiddenSubmit.status()).toBe(403);

  // A submitter sees the submission command only and cannot record an outcome through the API.
  const submitterContext = await browser.newContext();
  const submitterPage = await submitterContext.newPage();
  await signIn(submitterPage, SUBMITTER_EMAIL);
  await openTender(submitterPage, SUBMIT_TENDER_NO);
  await expect(submitterPage.getByRole('button', { name: 'Create estimate version' })).toHaveCount(0);
  await expect(submitterPage.getByRole('heading', { name: 'Submit Tender' })).toBeVisible();
  await expect(submitterPage.getByRole('heading', { name: 'Record outcome' })).toHaveCount(0);
  const submitterToken = await submitterPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(submitterToken).toBeTruthy();
  const forbiddenOutcome = await submitterPage.request.post(`${API_BASE_URL}/tenders/${SUBMIT_TENDER_ID}/outcome`, {
    headers: { authorization: `Bearer ${submitterToken}` },
    data: { outcome: 'CANCELLED', reason: 'Forbidden role test.' }
  });
  expect(forbiddenOutcome.status()).toBe(403);

  // An outcome manager sees only the explicit outcome command for a DRAFT Tender.
  const outcomeManagerContext = await browser.newContext();
  const outcomeManagerPage = await outcomeManagerContext.newPage();
  await signIn(outcomeManagerPage, OUTCOME_MANAGER_EMAIL);
  await openTender(outcomeManagerPage, PERMISSION_TENDER_NO);
  await expect(outcomeManagerPage.getByRole('button', { name: 'Create estimate version' })).toHaveCount(0);
  await expect(outcomeManagerPage.getByRole('heading', { name: 'Submit Tender' })).toHaveCount(0);
  await expect(outcomeManagerPage.getByRole('heading', { name: 'Record outcome' })).toBeVisible();

  // A user without tenders.read gets no navigation and causes no Module 3 Tender request.
  const noAccessContext = await browser.newContext();
  const noAccessPage = await noAccessContext.newPage();
  const noAccessRequests = trackModule3Requests(noAccessPage);
  await signIn(noAccessPage, NO_ACCESS_EMAIL);
  await expect(noAccessPage.getByRole('heading', { name: 'No module access' })).toBeVisible();
  await expect(noAccessPage.getByRole('button', { name: 'Tendering & Estimation' })).toHaveCount(0);
  expect(noAccessRequests).toHaveLength(0);

  await readerContext.close();
  await estimateEditorContext.close();
  await submitterContext.close();
  await outcomeManagerContext.close();
  await noAccessContext.close();
});
