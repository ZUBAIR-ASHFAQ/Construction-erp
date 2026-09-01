import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass148-project-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000014800';
const CLIENT_ID = '00000000-0000-4000-8000-000000014801';
const TENDER_ID = '00000000-0000-4000-8000-000000014802';
const DRAFT_PROJECT_ID = '00000000-0000-4000-8000-000000014803';
const ACTIVE_PROJECT_ID = '00000000-0000-4000-8000-000000014804';

const MANAGER_ID = '00000000-0000-4000-8000-000000014810';
const READER_ID = '00000000-0000-4000-8000-000000014811';
const UPDATER_ID = '00000000-0000-4000-8000-000000014812';
const ACTIVATOR_ID = '00000000-0000-4000-8000-000000014813';
const CLOSER_ID = '00000000-0000-4000-8000-000000014814';
const NO_PROJECT_ID = '00000000-0000-4000-8000-000000014815';

const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000014820';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000014821';
const UPDATER_ROLE_ID = '00000000-0000-4000-8000-000000014822';
const ACTIVATOR_ROLE_ID = '00000000-0000-4000-8000-000000014823';
const CLOSER_ROLE_ID = '00000000-0000-4000-8000-000000014824';

const MANAGER_EMAIL = 'pass148-project-manager@example.test';
const READER_EMAIL = 'pass148-project-reader@example.test';
const UPDATER_EMAIL = 'pass148-project-updater@example.test';
const ACTIVATOR_EMAIL = 'pass148-project-activator@example.test';
const CLOSER_EMAIL = 'pass148-project-closer@example.test';
const NO_PROJECT_EMAIL = 'pass148-no-project@example.test';

const PROJECT_CODE = 'PASS148-PROJECT';
const DRAFT_PROJECT_CODE = 'PASS148-DRAFT';
const ACTIVE_PROJECT_CODE = 'PASS148-ACTIVE';
const PROJECT_PERMISSIONS = ['projects.read', 'projects.create', 'projects.update', 'projects.activate', 'projects.close'];
const SUPPORT_PERMISSIONS = ['clients.read', 'tenders.read', 'users.read'];

let database;

/** Seed one company, Project source records and focused Stage-7 browser permission roles. */
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
      legalName: 'Pass 148 Project Company Ltd',
      displayName: 'Pass 148 Project Company',
      status: 'ACTIVE',
      baseCurrency: 'PKR',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  const users = [
    { id: MANAGER_ID, email: MANAGER_EMAIL, name: 'Pass 148 Project Manager' },
    { id: READER_ID, email: READER_EMAIL, name: 'Pass 148 Project Reader' },
    { id: UPDATER_ID, email: UPDATER_EMAIL, name: 'Pass 148 Project Updater' },
    { id: ACTIVATOR_ID, email: ACTIVATOR_EMAIL, name: 'Pass 148 Project Activator' },
    { id: CLOSER_ID, email: CLOSER_EMAIL, name: 'Pass 148 Project Closer' },
    { id: NO_PROJECT_ID, email: NO_PROJECT_EMAIL, name: 'Pass 148 No Project Access' }
  ];

  await database.user.createMany({
    data: users.map((user) => ({ ...user, companyId: COMPANY_ID, status: 'ACTIVE' }))
  });
  await database.authCredential.createMany({
    data: users.map((user) => ({ userId: user.id, passwordHash }))
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS148-CLIENT',
      legalName: 'Pass 148 Client (Private) Limited',
      displayName: 'Pass 148 Client',
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
      tenderNo: 'PASS148-TENDER',
      title: 'Pass 148 Won Tender',
      dueDate: new Date('2027-08-31T00:00:00.000Z'),
      status: 'WON',
      ownerUserId: MANAGER_ID,
      currency: 'PKR'
    }
  });

  const permissionCodes = [...PROJECT_PERMISSIONS, ...SUPPORT_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    const domain = code.startsWith('projects.')
      ? 'projects'
      : code.startsWith('clients.')
        ? 'clients'
        : code.startsWith('tenders.')
          ? 'tendering'
          : 'users';
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain },
      create: { code, name: code, domain }
    }));
  }

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'project-browser-manager', name: 'Project Browser Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'project-browser-reader', name: 'Project Browser Reader', isSystem: false, status: 'ACTIVE' },
      { id: UPDATER_ROLE_ID, companyId: COMPANY_ID, code: 'project-browser-updater', name: 'Project Browser Updater', isSystem: false, status: 'ACTIVE' },
      { id: ACTIVATOR_ROLE_ID, companyId: COMPANY_ID, code: 'project-browser-activator', name: 'Project Browser Activator', isSystem: false, status: 'ACTIVE' },
      { id: CLOSER_ROLE_ID, companyId: COMPANY_ID, code: 'project-browser-closer', name: 'Project Browser Closer', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  const rolePermissions = [];
  for (const code of [...PROJECT_PERMISSIONS, ...SUPPORT_PERMISSIONS]) {
    rolePermissions.push({ roleId: MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['projects.read']) {
    rolePermissions.push({ roleId: READER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['projects.read', 'projects.update']) {
    rolePermissions.push({ roleId: UPDATER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['projects.read', 'projects.activate']) {
    rolePermissions.push({ roleId: ACTIVATOR_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  for (const code of ['projects.read', 'projects.close']) {
    rolePermissions.push({ roleId: CLOSER_ROLE_ID, permissionId: permissionByCode.get(code) });
  }
  await database.rolePermission.createMany({ data: rolePermissions });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: UPDATER_ID, roleId: UPDATER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: ACTIVATOR_ID, roleId: ACTIVATOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: CLOSER_ID, roleId: CLOSER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await database.project.createMany({
    data: [
      {
        id: DRAFT_PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: DRAFT_PROJECT_CODE,
        name: 'Permission Draft Project',
        clientId: CLIENT_ID,
        tenderId: null,
        status: 'DRAFT',
        currency: 'PKR',
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
        projectManagerUserId: MANAGER_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: ACTIVE_PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: ACTIVE_PROJECT_CODE,
        name: 'Permission Active Project',
        clientId: CLIENT_ID,
        tenderId: null,
        status: 'ACTIVE',
        currency: 'PKR',
        startDate: new Date('2027-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
        projectManagerUserId: MANAGER_ID,
        location: 'Islamabad, Pakistan'
      }
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

/** Open the Project Management workspace from the permission-aware shared navigation. */
async function openProjectWorkspace(page) {
  await page.getByRole('button', { name: 'Project Management' }).click();
  await expect(page.getByRole('heading', { name: 'Project Management' })).toBeVisible();
}

/** Open one Project register row by its stable Project code. */
async function openProject(page, projectCode) {
  const row = page.getByRole('row').filter({ hasText: projectCode });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(`^${projectCode} ·`) })).toBeVisible();
}

/** Record Project API requests so the browser authority boundary can be asserted. */
function trackProjectRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/projects')) return;

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

/** Verify Project browser writes use only reviewed business fields and never server-owned authority. */
function assertServerOwnedAuthority(requests) {
  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'status',
    'statusHistory',
    'changedBy',
    'createdAt',
    'updatedAt'
  ];

  const writeRequests = requests.filter((request) => ['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method));
  for (const request of writeRequests) {
    const serializedBody = JSON.stringify(request.body ?? {});
    for (const field of forbiddenFields) expect(serializedBody).not.toContain(`\"${field}\"`);
    expect(request.pathname).not.toContain('/members');
  }

  const createRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/projects');
  expect(Object.keys(createRequest?.body ?? {}).sort()).toEqual([
    'clientId',
    'currency',
    'location',
    'name',
    'plannedEndDate',
    'projectCode',
    'projectManagerUserId',
    'startDate',
    'tenderId'
  ]);

  const updateRequest = requests.find((request) => request.method === 'PATCH' && /^\/api\/v1\/projects\/[^/]+$/.test(request.pathname));
  expect(Object.keys(updateRequest?.body ?? {}).sort()).toEqual([
    'clientId',
    'currency',
    'location',
    'name',
    'plannedEndDate',
    'projectManagerUserId',
    'startDate',
    'tenderId'
  ]);
  expect(updateRequest?.body).not.toHaveProperty('projectCode');

  const activateRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/activate'));
  const completeRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/complete'));
  const closeRequest = requests.find((request) => request.method === 'POST' && request.pathname.endsWith('/close'));
  expect(activateRequest?.body).toBeNull();
  expect(completeRequest?.body).toBeNull();
  expect(Object.keys(closeRequest?.body ?? {})).toEqual(['reason']);
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Module 5 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 5 browser workflow covers Project master, lifecycle, source summary and permissions', async ({ page, browser }) => {
  const managerRequests = trackProjectRequests(page);
  await signIn(page, MANAGER_EMAIL);
  await openProjectWorkspace(page);

  // Create a Tender-linked DRAFT Project through the real Stage-7 form.
  const createCard = page.getByRole('heading', { name: 'Create Project' }).locator('..');
  await createCard.getByLabel('Project code').fill(PROJECT_CODE);
  await createCard.getByLabel('Project name').fill('Pass 148 Main Project');
  await createCard.getByLabel('Client').selectOption(CLIENT_ID);
  await createCard.getByLabel('WON Tender (optional)').selectOption(TENDER_ID);
  await createCard.getByLabel('Currency').fill('pkr');
  await createCard.getByLabel('Start date').fill('2027-02-01');
  await createCard.getByLabel('Planned end date').fill('2028-01-31');
  await createCard.getByLabel('Project Manager').selectOption(MANAGER_ID);
  await createCard.getByLabel('Location').fill('Lahore, Pakistan');
  await createCard.getByRole('button', { name: 'Create Project' }).click();

  const detail = page.locator('section[aria-labelledby="project-detail-title"]');
  await expect(detail.getByRole('heading', { name: `${PROJECT_CODE} · Pass 148 Main Project` })).toBeVisible();
  await expect(detail).toContainText('DRAFT');
  await expect(detail.getByRole('heading', { name: 'Commercial / source summary' })).toBeVisible();
  await expect(detail).toContainText('PASS148-CLIENT · Pass 148 Client');
  await expect(detail).toContainText('PASS148-TENDER · Pass 148 Won Tender');

  const project = await database.project.findUnique({
    where: { companyId_projectCode: { companyId: COMPANY_ID, projectCode: PROJECT_CODE } }
  });
  expect(project).toBeTruthy();
  expect(project.tenderId).toBe(TENDER_ID);
  expect(project.status).toBe('DRAFT');

  // Update editable Project master fields without allowing the browser to change code or lifecycle state.
  const editSection = detail.getByRole('heading', { name: 'Edit Project' }).locator('..');
  await editSection.getByLabel('Project name').fill('Pass 148 Main Project Updated');
  await editSection.getByLabel('Planned end date').fill('2028-03-31');
  await editSection.getByLabel('Location').fill('Lahore District, Pakistan');
  await editSection.getByRole('button', { name: 'Save Project' }).click();
  await expect(detail.getByRole('heading', { name: `${PROJECT_CODE} · Pass 148 Main Project Updated` })).toBeVisible();
  await expect(detail).toContainText('2028-03-31');
  await expect(detail).toContainText('Lahore District, Pakistan');

  // Exercise the complete reviewed lifecycle with explicit command endpoints.
  await detail.getByRole('button', { name: 'Activate Project' }).click();
  await expect(detail).toContainText('ACTIVE');
  await detail.getByLabel('Suspension reason (optional)').fill('Pass 366 browser operational hold.');
  await detail.getByRole('button', { name: 'Suspend Project' }).click();
  await expect(detail).toContainText('SUSPENDED');
  await expect(detail.getByText('Suspended Projects remain visible for administration, but normal downstream operational transactions stay blocked until an authorized resume.', { exact: true })).toBeVisible();
  await detail.getByLabel('Resume reason (optional)').fill('Pass 366 browser operational hold cleared.');
  await detail.getByRole('button', { name: 'Resume Project' }).click();
  await expect(detail).toContainText('ACTIVE');
  await detail.getByRole('button', { name: 'Complete Project' }).click();
  await expect(detail).toContainText('COMPLETED');
  await detail.getByLabel('Close reason (optional)').fill('Pass 148 browser lifecycle is complete.');
  await detail.getByRole('button', { name: 'Close Project' }).click();
  await expect(detail).toContainText('CLOSED');
  await expect(detail.getByText('Closed Projects are read-only in normal Stage-7 workflows.', { exact: true })).toBeVisible();
  await expect(detail.getByRole('heading', { name: 'Edit Project' })).toHaveCount(0);

  const historySection = detail.locator('.project-history-section');
  const historyRows = historySection.getByRole('row');
  await expect(historyRows).toHaveCount(7);
  await expect(historyRows.nth(1)).toContainText('Created');
  await expect(historyRows.nth(1)).toContainText('DRAFT');
  await expect(historyRows.nth(2)).toContainText('DRAFT');
  await expect(historyRows.nth(2)).toContainText('ACTIVE');
  await expect(historyRows.nth(3)).toContainText('ACTIVE');
  await expect(historyRows.nth(3)).toContainText('SUSPENDED');
  await expect(historyRows.nth(3)).toContainText('Pass 366 browser operational hold.');
  await expect(historyRows.nth(4)).toContainText('SUSPENDED');
  await expect(historyRows.nth(4)).toContainText('ACTIVE');
  await expect(historyRows.nth(4)).toContainText('Pass 366 browser operational hold cleared.');
  await expect(historyRows.nth(5)).toContainText('ACTIVE');
  await expect(historyRows.nth(5)).toContainText('COMPLETED');
  await expect(historyRows.nth(6)).toContainText('COMPLETED');
  await expect(historyRows.nth(6)).toContainText('CLOSED');
  await expect(historyRows.nth(6)).toContainText('Pass 148 browser lifecycle is complete.');

  const storedProject = await database.project.findUnique({ where: { id: project.id } });
  expect(storedProject.status).toBe('CLOSED');
  expect(storedProject.projectCode).toBe(PROJECT_CODE);
  expect(storedProject.name).toBe('Pass 148 Main Project Updated');
  expect(storedProject.location).toBe('Lahore District, Pakistan');

  const statusHistory = await database.projectStatusHistory.findMany({ where: { projectId: project.id } });
  expect(statusHistory.map((row) => [row.fromStatus, row.toStatus])).toEqual([
    [null, 'DRAFT'],
    ['DRAFT', 'ACTIVE'],
    ['ACTIVE', 'SUSPENDED'],
    ['SUSPENDED', 'ACTIVE'],
    ['ACTIVE', 'COMPLETED'],
    ['COMPLETED', 'CLOSED']
  ]);
  expect(statusHistory[2].reason).toBe('Pass 366 browser operational hold.');
  expect(statusHistory[3].reason).toBe('Pass 366 browser operational hold cleared.');
  expect(statusHistory[5].reason).toBe('Pass 148 browser lifecycle is complete.');

  const audits = await database.auditLog.findMany({
    where: {
      companyId: COMPANY_ID,
      entityId: project.id,
      action: { in: ['project.created', 'project.updated', 'project.activated', 'project.suspended', 'project.resumed', 'project.completed', 'project.closed'] }
    },
    select: { action: true, actorUserId: true }
  });
  for (const action of ['project.created', 'project.updated', 'project.activated', 'project.suspended', 'project.resumed', 'project.completed', 'project.closed']) {
    expect(audits.filter((row) => row.action === action)).toHaveLength(1);
  }
  expect(audits.every((row) => row.actorUserId === MANAGER_ID)).toBe(true);

  const outbox = await database.outboxEvent.findMany({
    where: {
      companyId: COMPANY_ID,
      resourceId: project.id,
      eventType: { in: ['project.created', 'project.activated', 'project.completed', 'project.closed'] }
    },
    select: { eventType: true, actorUserId: true }
  });
  for (const eventType of ['project.created', 'project.activated', 'project.completed', 'project.closed']) {
    expect(outbox.filter((row) => row.eventType === eventType)).toHaveLength(1);
  }
  expect(outbox.every((row) => row.actorUserId === MANAGER_ID)).toBe(true);
  expect(await database.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.updated' } })).toBe(0);
  expect(await database.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.suspended' } })).toBe(0);
  expect(await database.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.resumed' } })).toBe(0);

  assertServerOwnedAuthority(managerRequests);

  // A read-only user can inspect Projects but has no create/edit/lifecycle controls; the API still denies mutation.
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await signIn(readerPage, READER_EMAIL);
  await openProjectWorkspace(readerPage);
  await openProject(readerPage, DRAFT_PROJECT_CODE);
  await expect(readerPage.getByRole('heading', { name: 'Create Project' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Edit Project' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Activate Project' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Suspend Project' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Resume Project' })).toHaveCount(0);
  await expect(readerPage.getByText('Your current role does not include Project lifecycle authority.', { exact: true })).toBeVisible();
  const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  const forbiddenCreate = await readerPage.request.post(`${API_BASE_URL}/projects`, {
    headers: { authorization: `Bearer ${readerToken}` },
    data: {
      projectCode: 'PASS148-FORBIDDEN',
      name: 'Forbidden reader Project',
      clientId: CLIENT_ID,
      currency: 'PKR',
      startDate: '2027-04-01',
      plannedEndDate: '2027-12-31',
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });
  expect(forbiddenCreate.status()).toBe(403);
  const forbiddenUpdate = await readerPage.request.patch(`${API_BASE_URL}/projects/${DRAFT_PROJECT_ID}`, {
    headers: { authorization: `Bearer ${readerToken}` },
    data: { name: 'Forbidden reader update' }
  });
  expect(forbiddenUpdate.status()).toBe(403);

  // An updater gets only normal master-data editing and cannot activate through the API.
  const updaterContext = await browser.newContext();
  const updaterPage = await updaterContext.newPage();
  await signIn(updaterPage, UPDATER_EMAIL);
  await openProjectWorkspace(updaterPage);
  await openProject(updaterPage, DRAFT_PROJECT_CODE);
  await expect(updaterPage.getByRole('heading', { name: 'Edit Project' })).toBeVisible();
  await expect(updaterPage.getByRole('button', { name: 'Activate Project' })).toHaveCount(0);
  await expect(updaterPage.getByRole('button', { name: 'Suspend Project' })).toHaveCount(0);
  await expect(updaterPage.getByRole('button', { name: 'Resume Project' })).toHaveCount(0);
  await expect(updaterPage.getByText('Your current role does not include Project lifecycle authority.', { exact: true })).toBeVisible();
  const updaterToken = await updaterPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  const forbiddenActivate = await updaterPage.request.post(`${API_BASE_URL}/projects/${DRAFT_PROJECT_ID}/activate`, {
    headers: { authorization: `Bearer ${updaterToken}` }
  });
  expect(forbiddenActivate.status()).toBe(403);

  // An activator gets the DRAFT activation command but no edit/complete/close authority.
  const activatorContext = await browser.newContext();
  const activatorPage = await activatorContext.newPage();
  await signIn(activatorPage, ACTIVATOR_EMAIL);
  await openProjectWorkspace(activatorPage);
  await openProject(activatorPage, DRAFT_PROJECT_CODE);
  await expect(activatorPage.getByRole('heading', { name: 'Edit Project' })).toHaveCount(0);
  await expect(activatorPage.getByRole('button', { name: 'Activate Project' })).toBeVisible();
  await activatorPage.getByRole('button', { name: 'Activate Project' }).click();
  await expect(activatorPage.locator('section[aria-labelledby="project-detail-title"]')).toContainText('ACTIVE');
  await expect(activatorPage.getByRole('button', { name: 'Complete Project' })).toHaveCount(0);
  await expect(activatorPage.getByRole('button', { name: 'Suspend Project' })).toHaveCount(0);

  // A closer can complete and close an ACTIVE Project but has no normal edit or activation controls.
  const closerContext = await browser.newContext();
  const closerPage = await closerContext.newPage();
  await signIn(closerPage, CLOSER_EMAIL);
  await openProjectWorkspace(closerPage);
  await openProject(closerPage, ACTIVE_PROJECT_CODE);
  await expect(closerPage.getByRole('heading', { name: 'Edit Project' })).toHaveCount(0);
  await expect(closerPage.getByRole('button', { name: 'Activate Project' })).toHaveCount(0);
  await expect(closerPage.getByRole('button', { name: 'Resume Project' })).toHaveCount(0);
  await expect(closerPage.getByRole('button', { name: 'Suspend Project' })).toBeVisible();
  await expect(closerPage.getByRole('button', { name: 'Complete Project' })).toBeVisible();
  await closerPage.getByRole('button', { name: 'Complete Project' }).click();
  await expect(closerPage.getByLabel('Close reason (optional)')).toBeVisible();
  await closerPage.getByLabel('Close reason (optional)').fill('Closer permission workflow complete.');
  await closerPage.getByRole('button', { name: 'Close Project' }).click();
  await expect(closerPage.getByText('Closed Projects are read-only in normal Stage-7 workflows.', { exact: true })).toBeVisible();

  // A user without projects.read sees no Project navigation and causes no Project API request.
  const noProjectContext = await browser.newContext();
  const noProjectPage = await noProjectContext.newPage();
  const noProjectRequests = trackProjectRequests(noProjectPage);
  await signIn(noProjectPage, NO_PROJECT_EMAIL);
  await expect(noProjectPage.getByRole('heading', { name: 'No module access' })).toBeVisible();
  await expect(noProjectPage.getByRole('button', { name: 'Project Management' })).toHaveCount(0);
  expect(noProjectRequests).toHaveLength(0);

  await readerContext.close();
  await updaterContext.close();
  await activatorContext.close();
  await closerContext.close();
  await noProjectContext.close();
});
