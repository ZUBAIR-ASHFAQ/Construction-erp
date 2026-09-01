import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = 'pass60-doc-admin@example.test';
const READER_EMAIL = 'pass60-doc-reader@example.test';
const PROJECT_EDITOR_EMAIL = 'pass170-project-doc-editor@example.test';
const PASSWORD = 'Pass60-document-password!';
const DOCUMENT_TITLE = 'Pass 60 Site Note';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';

const COMPANY_ID = '00000000-0000-4000-8000-000000006000';
const ADMIN_ID = '00000000-0000-4000-8000-000000006010';
const READER_ID = '00000000-0000-4000-8000-000000006011';
const PROJECT_EDITOR_ID = '00000000-0000-4000-8000-000000006012';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000006020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000006021';
const PROJECT_DOCUMENT_ROLE_ID = '00000000-0000-4000-8000-000000006022';
const CLIENT_ID = '00000000-0000-4000-8000-000000006030';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000006040';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000006041';
const PROJECT_B_DOCUMENT_ID = '00000000-0000-4000-8000-000000006050';
const DOCUMENT_PERMISSIONS = [
  'documents.read',
  'documents.upload',
  'documents.version',
  'documents.link',
  'documents.archive',
  'documents.project.read'
];

let database;

/** Seed two simple users: a document administrator and a read-only document user. */
async function seedUsers() {
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
      legalName: 'Pass 60 Document Company Ltd',
      displayName: 'Pass 60 Document Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of DOCUMENT_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'documents' },
      create: { code, name: code, domain: 'documents' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'document-admin', name: 'Document Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'document-reader', name: 'Document Reader', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_DOCUMENT_ROLE_ID, companyId: COMPANY_ID, code: 'project-document-editor', name: 'Project Document Editor', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await database.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_ID, permissionId: permission.id })),
      {
        roleId: READER_ROLE_ID,
        permissionId: permissions.find((permission) => permission.code === 'documents.read').id
      },
      ...permissions
        .filter((permission) => ['documents.project.read', 'documents.upload', 'documents.version', 'documents.link', 'documents.archive'].includes(permission.code))
        .map((permission) => ({ roleId: PROJECT_DOCUMENT_ROLE_ID, permissionId: permission.id }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: ADMIN_ID, companyId: COMPANY_ID, email: ADMIN_EMAIL, name: 'Pass 60 Document Admin', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 60 Document Reader', status: 'ACTIVE' },
      { id: PROJECT_EDITOR_ID, companyId: COMPANY_ID, email: PROJECT_EDITOR_EMAIL, name: 'Pass 170 Project Document Editor', status: 'ACTIVE' }
    ]
  });

  await database.authCredential.createMany({
    data: [
      { userId: ADMIN_ID, passwordHash },
      { userId: READER_ID, passwordHash }
    ]
  });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });


  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS170-CLIENT',
      legalName: 'Pass 170 Client Ltd',
      displayName: 'Pass 170 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });

  await database.project.createMany({
    data: [
      {
        id: PROJECT_A_ID,
        companyId: COMPANY_ID,
        projectCode: 'PASS170-A',
        name: 'Pass 170 Project A',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: fromDate,
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_ID,
        projectCode: 'PASS170-B',
        name: 'Pass 170 Project B',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: fromDate,
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Islamabad, Pakistan'
      }
    ]
  });

  await database.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_A_ID, userId: PROJECT_EDITOR_ID, projectRole: 'DOCUMENT_EDITOR', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_B_ID, userId: PROJECT_EDITOR_ID, projectRole: 'DOCUMENT_VIEWER', status: 'ACTIVE', fromDate }
    ]
  });

  await database.userRoleAssignment.create({
    data: {
      companyId: COMPANY_ID,
      userId: PROJECT_EDITOR_ID,
      roleId: PROJECT_DOCUMENT_ROLE_ID,
      scopeType: 'PROJECT',
      scopeId: PROJECT_A_ID,
      status: 'ACTIVE',
      fromDate
    }
  });

  await database.document.create({
    data: {
      id: PROJECT_B_DOCUMENT_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_B_ID,
      title: 'Pass 170 Project B Hidden Drawing',
      category: 'drawing',
      status: 'active',
      ownerUserId: ADMIN_ID
    }
  });
}

/** Sign in through the real browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Document Management' })).toBeVisible();
}

test.beforeAll(async () => {
  await seedUsers();
});

test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 18 browser workflow covers upload, download, versioning and lifecycle permissions', async ({ page, browser }) => {
  await signIn(page, ADMIN_EMAIL);

  // Create and open a real document folder instead of typing a raw folder UUID.
  const folderCard = page.getByRole('heading', { name: 'Folder / document browser' }).locator('..').locator('..');
  await folderCard.getByLabel('New folder name').fill('Site Notes');
  await folderCard.getByLabel('Folder category').fill('site');
  await folderCard.getByRole('button', { name: 'Create folder' }).click();
  await expect(folderCard.getByRole('button', { name: 'Site Notes' })).toBeVisible();
  await folderCard.getByRole('button', { name: 'Site Notes' }).click();
  await expect(folderCard.getByText('Current folder: Site Notes')).toBeVisible();

  // Upload version 1 through the browser -> signed object-storage URL -> completion workflow.
  const uploadCard = page.getByRole('heading', { name: 'Upload document' }).locator('..');
  await uploadCard.getByLabel('Title').fill(DOCUMENT_TITLE);
  await uploadCard.getByLabel('Category').fill('site-note');
  await uploadCard.locator('input[type="file"]').setInputFiles({
    name: 'site-note-v1.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Pass 60 version one')
  });
  await uploadCard.getByRole('button', { name: 'Upload document' }).click();

  await expect(page.getByRole('heading', { name: DOCUMENT_TITLE })).toBeVisible();
  const versionTable = page.getByRole('heading', { name: 'Version history' }).locator('..');
  await expect(versionTable.getByRole('row').filter({ hasText: 'v1' })).toBeVisible();

  // Ask the API for an authorized signed download URL and verify the stored bytes.
  const downloadResponsePromise = page.waitForResponse((response) =>
    response.request().method() === 'GET'
      && response.url().includes('/api/v1/documents/')
      && response.url().endsWith('/download')
  );
  await page.getByRole('button', { name: 'Open / download' }).click();
  const downloadResponse = await downloadResponsePromise;
  expect(downloadResponse.status()).toBe(200);
  const downloadPayload = await downloadResponse.json();
  const storedVersionOne = await page.request.get(downloadPayload.data.url);
  expect(storedVersionOne.status()).toBe(200);
  expect(await storedVersionOne.text()).toBe('Pass 60 version one');

  // Upload version 2 and confirm version 1 remains in the immutable history.
  const versionCard = page.getByRole('heading', { name: 'Upload new version' }).locator('..');
  await versionCard.getByLabel('Revision code').fill('R2');
  await versionCard.locator('input[type="file"]').setInputFiles({
    name: 'site-note-v2.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Pass 60 version two')
  });
  await versionCard.getByRole('button', { name: 'Upload next version' }).click();

  await expect(versionTable.getByRole('row').filter({ hasText: 'v1' })).toBeVisible();
  await expect(versionTable.getByRole('row').filter({ hasText: 'v2' })).toBeVisible();
  await expect(versionTable.getByText('R2', { exact: true })).toBeVisible();

  // Archive and restore the metadata without deleting the stored versions.
  await page.getByRole('button', { name: 'Archive' }).click();
  await expect(page.locator('.document-meta').getByText('archived', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Restore' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload new version' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Restore' }).click();
  await expect(page.locator('.document-meta').getByText('active', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload new version' })).toBeVisible();

  // A read-only user can see/download documents but cannot use or bypass write actions.
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await signIn(readerPage, READER_EMAIL);

  await expect(readerPage.getByRole('heading', { name: 'Upload document' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Create folder' })).toHaveCount(0);
  await readerPage.getByRole('button', { name: DOCUMENT_TITLE }).click();
  await expect(readerPage.getByRole('button', { name: 'Open / download' })).toBeVisible();
  await expect(readerPage.getByRole('heading', { name: 'Upload new version' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Archive' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Restore' })).toHaveCount(0);

  const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(readerToken).toBeTruthy();

  const documentId = await database.document.findFirst({
    where: { companyId: COMPANY_ID, title: DOCUMENT_TITLE },
    select: { id: true }
  });
  expect(documentId).toBeTruthy();

  const forbiddenArchive = await readerPage.request.post(`${API_BASE_URL}/documents/${documentId.id}/archive`, {
    headers: {
      Authorization: `Bearer ${readerToken}`,
      'Idempotency-Key': 'pass60-reader-forbidden-archive'
    },
    data: {}
  });
  expect(forbiddenArchive.status()).toBe(403);

  await readerContext.close();
});


test('Pass 170 browser uses the Project selector and keeps Project-B documents outside Project-A authority', async ({ page }) => {
  await signIn(page, PROJECT_EDITOR_EMAIL);

  await expect(page.getByRole('heading', { name: 'Document Management' })).toBeVisible();
  const uploadCard = page.getByRole('heading', { name: 'Upload document' }).locator('..');
  await expect(uploadCard.getByLabel('Document Project')).toBeVisible();
  await expect(uploadCard.getByLabel('Document Project').locator(`option[value="${PROJECT_A_ID}"]`)).toHaveCount(1);
  await expect(uploadCard.getByLabel('Document Project').locator(`option[value="${PROJECT_B_ID}"]`)).toHaveCount(0);

  const filterCard = page.getByRole('heading', { name: 'Documents' }).locator('..');
  await expect(filterCard.getByLabel('Project filter').locator(`option[value="${PROJECT_A_ID}"]`)).toHaveCount(1);
  await expect(filterCard.getByLabel('Project filter').locator(`option[value="${PROJECT_B_ID}"]`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Pass 170 Project B Hidden Drawing' })).toHaveCount(0);

  const uploadRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/documents/uploads/init')
  );
  await uploadCard.getByLabel('Document Project').selectOption(PROJECT_A_ID);
  await uploadCard.getByLabel('Title').fill('Pass 170 Project A Drawing');
  await uploadCard.getByLabel('Category').fill('drawing');
  await uploadCard.locator('input[type="file"]').setInputFiles({
    name: 'pass170-project-a.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Pass 170 Project A file')
  });
  await uploadCard.getByRole('button', { name: 'Upload document' }).click();
  const uploadRequest = await uploadRequestPromise;
  const uploadBody = uploadRequest.postDataJSON();
  expect(uploadBody.projectId).toBe(PROJECT_A_ID);
  for (const forbiddenField of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'changedBy']) {
    expect(Object.hasOwn(uploadBody, forbiddenField)).toBe(false);
  }

  await expect(page.getByRole('heading', { name: 'Pass 170 Project A Drawing' })).toBeVisible();
  await expect(page.locator('.document-meta').getByText(PROJECT_A_ID, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Upload new version' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive' })).toBeVisible();

  const folderCard = page.getByRole('heading', { name: 'Folder / document browser' }).locator('..').locator('..');
  const folderRequestPromise = page.waitForRequest((request) =>
    request.method() === 'POST' && request.url().endsWith('/api/v1/documents/folders')
  );
  await folderCard.getByLabel('Folder Project').selectOption(PROJECT_A_ID);
  await folderCard.getByLabel('New folder name').fill('Project A Drawings');
  await folderCard.getByLabel('Folder category').fill('drawing');
  await folderCard.getByRole('button', { name: 'Create folder' }).click();
  const folderBody = (await folderRequestPromise).postDataJSON();
  expect(folderBody.projectId).toBe(PROJECT_A_ID);

  const token = await page.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(token).toBeTruthy();
  const forbiddenFilter = await page.request.get(`${API_BASE_URL}/documents?projectId=${PROJECT_B_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(forbiddenFilter.status()).toBe(403);
  expect((await forbiddenFilter.json()).error.code).toBe('DOCUMENT_SCOPE_FORBIDDEN');

  const forbiddenDirectRead = await page.request.get(`${API_BASE_URL}/documents/${PROJECT_B_DOCUMENT_ID}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  expect(forbiddenDirectRead.status()).toBe(403);
  expect((await forbiddenDirectRead.json()).error.code).toBe('DOCUMENT_SCOPE_FORBIDDEN');
});
