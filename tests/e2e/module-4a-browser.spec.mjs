import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass134-boq-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000013400';
const CLIENT_ID = '00000000-0000-4000-8000-000000013401';
const TENDER_ID = '00000000-0000-4000-8000-000000013402';

const MANAGER_ID = '00000000-0000-4000-8000-000000013410';
const READER_ID = '00000000-0000-4000-8000-000000013411';
const EDITOR_ID = '00000000-0000-4000-8000-000000013412';
const FREEZER_ID = '00000000-0000-4000-8000-000000013413';
const EXPORTER_ID = '00000000-0000-4000-8000-000000013414';
const NO_BOQ_ID = '00000000-0000-4000-8000-000000013415';

const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000013420';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000013421';
const EDITOR_ROLE_ID = '00000000-0000-4000-8000-000000013422';
const FREEZER_ROLE_ID = '00000000-0000-4000-8000-000000013423';
const EXPORTER_ROLE_ID = '00000000-0000-4000-8000-000000013424';
const NO_BOQ_ROLE_ID = '00000000-0000-4000-8000-000000013425';

const MANAGER_EMAIL = 'pass134-boq-manager@example.test';
const READER_EMAIL = 'pass134-boq-reader@example.test';
const EDITOR_EMAIL = 'pass134-boq-editor@example.test';
const FREEZER_EMAIL = 'pass134-boq-freezer@example.test';
const EXPORTER_EMAIL = 'pass134-boq-exporter@example.test';
const NO_BOQ_EMAIL = 'pass134-no-boq@example.test';

const BOQ_CODE = 'PASS134-BOQ';
const BOQ_TITLE = 'Pass 134 Commercial BOQ';
const TENDER_NO = 'PASS134-TENDER';
const MODULE_4A_PERMISSIONS = ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'];

let database;

/** Seed one company, one Tender and focused Module 4A browser permission roles. */
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
      legalName: 'Pass 134 BOQ Company Ltd',
      displayName: 'Pass 134 BOQ Company',
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
      code: 'PASS134-CLIENT',
      legalName: 'Pass 134 Client (Private) Limited',
      displayName: 'Pass 134 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });

  const users = [
    { id: MANAGER_ID, email: MANAGER_EMAIL, name: 'Pass 134 BOQ Manager' },
    { id: READER_ID, email: READER_EMAIL, name: 'Pass 134 BOQ Reader' },
    { id: EDITOR_ID, email: EDITOR_EMAIL, name: 'Pass 134 BOQ Editor' },
    { id: FREEZER_ID, email: FREEZER_EMAIL, name: 'Pass 134 BOQ Freezer' },
    { id: EXPORTER_ID, email: EXPORTER_EMAIL, name: 'Pass 134 BOQ Exporter' },
    { id: NO_BOQ_ID, email: NO_BOQ_EMAIL, name: 'Pass 134 Tender Reader' }
  ];

  await database.user.createMany({
    data: users.map((user) => ({ ...user, companyId: COMPANY_ID, status: 'ACTIVE' }))
  });
  await database.authCredential.createMany({
    data: users.map((user) => ({ userId: user.id, passwordHash }))
  });

  await database.tender.create({
    data: {
      id: TENDER_ID,
      companyId: COMPANY_ID,
      clientId: CLIENT_ID,
      tenderNo: TENDER_NO,
      title: 'Pass 134 Tender',
      dueDate: new Date('2027-08-31T00:00:00.000Z'),
      status: 'DRAFT',
      ownerUserId: MANAGER_ID,
      currency: 'PKR'
    }
  });

  const permissionCodes = [...MODULE_4A_PERMISSIONS, 'tenders.read'];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('boq.') ? 'boq' : 'tendering' },
      create: { code, name: code, domain: code.startsWith('boq.') ? 'boq' : 'tendering' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-manager', name: 'BOQ Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-reader', name: 'BOQ Reader', isSystem: false, status: 'ACTIVE' },
      { id: EDITOR_ROLE_ID, companyId: COMPANY_ID, code: 'boq-editor', name: 'BOQ Editor', isSystem: false, status: 'ACTIVE' },
      { id: FREEZER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-freezer', name: 'BOQ Freezer', isSystem: false, status: 'ACTIVE' },
      { id: EXPORTER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-exporter', name: 'BOQ Exporter', isSystem: false, status: 'ACTIVE' },
      { id: NO_BOQ_ROLE_ID, companyId: COMPANY_ID, code: 'tender-only', name: 'Tender Only', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const rolePermissions = [];
  for (const code of [...MODULE_4A_PERMISSIONS, 'tenders.read']) {
    rolePermissions.push({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['boq.read']) {
    rolePermissions.push({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['boq.read', 'boq.edit']) {
    rolePermissions.push({ roleId: EDITOR_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['boq.read', 'boq.edit', 'boq.freeze']) {
    rolePermissions.push({ roleId: FREEZER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['boq.read', 'boq.edit', 'boq.export']) {
    rolePermissions.push({ roleId: EXPORTER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  rolePermissions.push({ roleId: NO_BOQ_ROLE_ID, permissionId: permissionByCode.get('tenders.read') });
  await database.rolePermission.createMany({ data: rolePermissions });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: EDITOR_ID, roleId: EDITOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: FREEZER_ID, roleId: FREEZER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: EXPORTER_ID, roleId: EXPORTER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: NO_BOQ_ID, roleId: NO_BOQ_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });
}

/** Sign in through the real Module 24A form and wait for the authenticated shell. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the BOQ workspace from the shared permission-aware navigation. */
async function openBoqWorkspace(page) {
  await page.getByRole('button', { name: 'BOQ Management' }).click();
  await expect(page.getByRole('heading', { name: 'BOQ Management' })).toBeVisible();
}

/** Open one BOQ row by its stable BOQ code. */
async function openBoq(page, code) {
  const row = page.getByRole('row').filter({ hasText: code });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
}

/** Create one revision and save one simple item so permission-specific actions can be inspected. */
async function createSimpleRevision(page, effectiveDate, itemCode) {
  await page.getByLabel('Effective date').fill(effectiveDate);
  await page.getByLabel('Notes').fill(`Browser permission check for ${itemCode}.`);
  await page.getByRole('button', { name: 'Create revision' }).click();
  await page.getByLabel('Item 1 code').fill(itemCode);
  await page.getByLabel('Item 1 description').fill(`${itemCode} browser item`);
  await page.getByLabel('Item 1 unit').fill('item');
  await page.getByLabel('Item 1 quantity').fill('1.0000');
  await page.getByLabel('Item 1 rate').fill('10.0000');
  await page.getByRole('button', { name: 'Save item set' }).click();
  await expect(page.getByRole('heading', { name: 'Server-calculated result' })).toBeVisible();
}

/** Record Module 4A browser requests for server-owned authority assertions. */
function trackModule4aRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/boqs')) return;

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

/** Verify BOQ browser writes contain only reviewed business fields and never server-owned authority. */
function assertServerOwnedAuthority(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'projectId',
    'wbsNodeId',
    'costCodeId',
    'status',
    'currentRevisionId',
    'revisionNo',
    'approvedBy',
    'amount',
    'id',
    'parentId'
  ];

  for (const request of requests) {
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(serializedBody).not.toContain(`\"${field}\"`);
  }

  const createBoqRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/boqs');
  expect(Object.keys(createBoqRequest?.body ?? {}).sort()).toEqual(['code', 'currency', 'tenderId', 'title']);

  const revisionRequests = requests.filter((request) => request.method === 'POST' && /\/api\/v1\/boqs\/[^/]+\/revisions$/.test(request.pathname));
  expect(revisionRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of revisionRequests) expect(Object.keys(request.body ?? {}).sort()).toEqual(['effectiveDate', 'notes']);

  const itemRequests = requests.filter((request) => request.method === 'PUT' && request.pathname.endsWith('/items'));
  expect(itemRequests.length).toBeGreaterThanOrEqual(2);
  for (const request of itemRequests) {
    expect(Object.keys(request.body ?? {})).toEqual(['items']);
    for (const item of request.body.items) {
      expect(Object.keys(item).sort()).toEqual([
        'description', 'itemCode', 'parentRowKey', 'quantity', 'rate', 'rowKey', 'unit'
      ]);
    }
  }

  const freezeRequests = requests.filter((request) => request.method === 'POST' && request.pathname.endsWith('/freeze'));
  expect(freezeRequests).toHaveLength(1);
  expect(freezeRequests[0].body).toBeNull();

  const exportRequests = requests.filter((request) => request.method === 'GET' && request.pathname.endsWith('/export'));
  expect(exportRequests).toHaveLength(1);
  expect(exportRequests[0].body).toBeNull();
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module 4A browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 4A browser workflow covers hierarchy, totals, freeze, export, comparison and permissions', async ({ page, browser }) => {
  const managerRequests = trackModule4aRequests(page);
  await signIn(page, MANAGER_EMAIL);
  await openBoqWorkspace(page);

  // Create one Tender-linked BOQ using only reviewed Stage-6 business fields.
  const createCard = page.getByRole('heading', { name: 'Create BOQ' }).locator('..');
  await createCard.getByLabel('Tender').selectOption(TENDER_ID);
  await createCard.getByLabel('BOQ code').fill(BOQ_CODE);
  await createCard.getByLabel('BOQ title').fill(BOQ_TITLE);
  await createCard.getByLabel('Currency').fill('PKR');
  await createCard.getByRole('button', { name: 'Create BOQ' }).click();
  await expect(page.getByRole('heading', { name: `${BOQ_CODE} · ${BOQ_TITLE}` })).toBeVisible();

  const boq = await database.boq.findUnique({ where: { companyId_code: { companyId: COMPANY_ID, code: BOQ_CODE } } });
  expect(boq).toBeTruthy();

  // Create Revision 1, persist a parent/child hierarchy and verify the exact server-owned total.
  await page.getByLabel('Effective date').fill('2027-01-15');
  await page.getByLabel('Notes').fill('Initial commercial revision.');
  await page.getByRole('button', { name: 'Create revision' }).click();
  await page.getByLabel('Import BOQ CSV').setInputFiles({
    name: 'pass171-boq-items.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'item_code,parent_item_code,description,unit,quantity,rate',
      '1.0,,Foundation works,m3,2.5000,100.1250',
      '1.1,1.0,Foundation child item,m3,3.3333,10.0050'
    ].join('\n'))
  });
  await expect(page.getByLabel('Item 1 code')).toHaveValue('1.0');
  await expect(page.getByLabel('Item 2 code')).toHaveValue('1.1');
  await expect(page.getByLabel('Item 2 parent').locator('option:checked')).toHaveText('1.0');
  await page.getByRole('button', { name: 'Save item set' }).click();
  await expect(page.getByText('Total: PKR 283.66', { exact: true })).toBeVisible();
  const savedResult = page.locator('.boq-saved-result');
  await expect(savedResult.getByRole('row').filter({ hasText: '1.0' })).toContainText('250.31');
  await expect(savedResult.getByRole('row').filter({ hasText: '1.1' })).toContainText('33.35');

  const revisionOne = await database.boqRevision.findFirst({
    where: { boqId: boq.id, revisionNo: 1 },
    select: { id: true }
  });
  expect(revisionOne).toBeTruthy();
  const revisionOneItems = await database.boqItem.findMany({ where: { boqRevisionId: revisionOne.id } });
  const parentItem = revisionOneItems.find((item) => item.itemCode === '1.0');
  const childItem = revisionOneItems.find((item) => item.itemCode === '1.1');
  expect(parentItem).toBeTruthy();
  expect(childItem?.parentId).toBe(parentItem.id);

  // Freeze Revision 1 and prove the browser cannot continue editing its immutable snapshot.
  await page.getByRole('button', { name: 'Freeze revision' }).click();
  await expect(page.getByRole('button', { name: 'Revision 1 · FROZEN' })).toBeVisible();
  await expect(page.getByText('This revision is read-only. Frozen revisions cannot be edited.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save item set' })).toHaveCount(0);
  expect((await database.boqRevision.findUnique({ where: { id: revisionOne.id } }))?.approvedBy).toBe(MANAGER_ID);

  // Export the authorized frozen revision through the existing CSV action.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`${BOQ_CODE}-revision-1.csv`);

  // Create Revision 2, save a changed amount and compare the two server snapshots.
  await page.getByLabel('Effective date').fill('2027-02-15');
  await page.getByLabel('Notes').fill('Revised quantity and rate.');
  await page.getByRole('button', { name: 'Create revision' }).click();
  await page.getByLabel('Item 1 code').fill('1.0');
  await page.getByLabel('Item 1 description').fill('Revised foundation works');
  await page.getByLabel('Item 1 unit').fill('m3');
  await page.getByLabel('Item 1 quantity').fill('4.0000');
  await page.getByLabel('Item 1 rate').fill('125.0000');
  await page.getByRole('button', { name: 'Save item set' }).click();
  await expect(page.getByText('Total: PKR 500.00', { exact: true })).toBeVisible();

  const revisionTwo = await database.boqRevision.findFirst({
    where: { boqId: boq.id, revisionNo: 2 },
    select: { id: true }
  });
  expect(revisionTwo).toBeTruthy();
  await page.getByLabel('Earlier revision').selectOption(revisionOne.id);
  await page.getByLabel('Later revision').selectOption(revisionTwo.id);
  const comparison = page.locator('section[aria-labelledby="boq-comparison-title"]');
  await expect(comparison).toContainText('Revision 1: PKR 283.66');
  await expect(comparison).toContainText('Revision 2: PKR 500.00');
  await expect(comparison.getByRole('row').filter({ hasText: '1.0' })).toContainText('2.5000 × 100.1250 = 250.31');
  await expect(comparison.getByRole('row').filter({ hasText: '1.0' })).toContainText('4.0000 × 125.0000 = 500.00');

  // Reload the browser and prove history/comparison now come back from durable server reads.
  await page.reload();
  await expect(page.locator('.topbar')).toContainText(MANAGER_EMAIL);
  await openBoqWorkspace(page);
  await openBoq(page, BOQ_CODE);
  await expect(page.getByRole('heading', { name: 'Durable revision history' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revision 1 · FROZEN' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Revision 2 · DRAFT' })).toBeVisible();
  await page.getByLabel('Earlier revision').selectOption(revisionOne.id);
  await page.getByLabel('Later revision').selectOption(revisionTwo.id);
  const reloadedComparison = page.locator('section[aria-labelledby="boq-comparison-title"]');
  await expect(reloadedComparison).toContainText('Revision 1: PKR 283.66');
  await expect(reloadedComparison).toContainText('Revision 2: PKR 500.00');

  assertServerOwnedAuthority(managerRequests);

  // A read-only user can open BOQs but gets no create/revision controls; the API independently rejects a write.
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await signIn(readerPage, READER_EMAIL);
  await openBoqWorkspace(readerPage);
  await openBoq(readerPage, BOQ_CODE);
  await expect(readerPage.getByRole('heading', { name: 'Create BOQ' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Create next revision' })).toHaveCount(0);
  await expect(readerPage.getByText('Your current role can read BOQs but cannot create or edit BOQ revisions.', { exact: true })).toBeVisible();
  const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(readerToken).toBeTruthy();
  const forbiddenCreate = await readerPage.request.post(`${API_BASE_URL}/boqs`, {
    headers: { authorization: `Bearer ${readerToken}` },
    data: { tenderId: TENDER_ID, code: 'FORBIDDEN', title: 'Forbidden BOQ', currency: 'PKR' }
  });
  expect(forbiddenCreate.status()).toBe(403);

  // An editor can build a DRAFT revision but does not receive freeze or export controls.
  const editorContext = await browser.newContext();
  const editorPage = await editorContext.newPage();
  await signIn(editorPage, EDITOR_EMAIL);
  await openBoqWorkspace(editorPage);
  await openBoq(editorPage, BOQ_CODE);
  await createSimpleRevision(editorPage, '2027-03-15', 'EDITOR');
  await expect(editorPage.getByRole('button', { name: 'Freeze revision' })).toHaveCount(0);
  await expect(editorPage.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);
  const editorRevision = await database.boqRevision.findFirst({ where: { boqId: boq.id, revisionNo: 3 }, select: { id: true } });
  expect(editorRevision).toBeTruthy();
  const editorToken = await editorPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  const forbiddenFreeze = await editorPage.request.post(`${API_BASE_URL}/boqs/${boq.id}/revisions/${editorRevision.id}/freeze`, {
    headers: { authorization: `Bearer ${editorToken}` }
  });
  expect(forbiddenFreeze.status()).toBe(403);

  // A freezer role includes edit only to establish a DRAFT; it sees freeze but not export.
  const freezerContext = await browser.newContext();
  const freezerPage = await freezerContext.newPage();
  await signIn(freezerPage, FREEZER_EMAIL);
  await openBoqWorkspace(freezerPage);
  await openBoq(freezerPage, BOQ_CODE);
  await createSimpleRevision(freezerPage, '2027-04-15', 'FREEZER');
  await expect(freezerPage.getByRole('button', { name: 'Freeze revision' })).toBeVisible();
  await expect(freezerPage.getByRole('button', { name: 'Export CSV' })).toHaveCount(0);

  // An exporter role includes edit only to establish a stored revision snapshot; it sees export but not freeze.
  const exporterContext = await browser.newContext();
  const exporterPage = await exporterContext.newPage();
  await signIn(exporterPage, EXPORTER_EMAIL);
  await openBoqWorkspace(exporterPage);
  await openBoq(exporterPage, BOQ_CODE);
  await createSimpleRevision(exporterPage, '2027-05-15', 'EXPORTER');
  await expect(exporterPage.getByRole('button', { name: 'Export CSV' })).toBeVisible();
  await expect(exporterPage.getByRole('button', { name: 'Freeze revision' })).toHaveCount(0);

  // A user with an unrelated Tender permission gets no BOQ navigation and causes no BOQ API request.
  const noBoqContext = await browser.newContext();
  const noBoqPage = await noBoqContext.newPage();
  const noBoqRequests = trackModule4aRequests(noBoqPage);
  await signIn(noBoqPage, NO_BOQ_EMAIL);
  await expect(noBoqPage.getByRole('button', { name: 'Tendering & Estimation' })).toBeVisible();
  await expect(noBoqPage.getByRole('button', { name: 'BOQ Management' })).toHaveCount(0);
  expect(noBoqRequests).toHaveLength(0);

  await readerContext.close();
  await editorContext.close();
  await freezerContext.close();
  await exporterContext.close();
  await noBoqContext.close();
});
