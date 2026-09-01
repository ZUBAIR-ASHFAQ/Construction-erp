import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass331-module21-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000033100';
const CLIENT_ID = '00000000-0000-4000-8000-000000033101';
const PROJECT_ID = '00000000-0000-4000-8000-000000033102';
const WBS_ID = '00000000-0000-4000-8000-000000033103';
const MANAGER_ID = '00000000-0000-4000-8000-000000033110';
const READER_ID = '00000000-0000-4000-8000-000000033111';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000033120';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000033121';

const MANAGER_EMAIL = 'pass331-module21-manager@example.test';
const READER_EMAIL = 'pass331-module21-reader@example.test';
const SCHEDULING_PERMISSIONS = [
  'schedule.read',
  'schedule.manage',
  'schedule.baseline',
  'schedule.progress'
];
const SUPPORT_PERMISSIONS = ['projects.read', 'wbs.read'];
const REVIEWED_OPERATIONS = new Set([
  'GET /api/v1/projects/:projectId/schedule',
  'POST /api/v1/projects/:projectId/schedule',
  'POST /api/v1/projects/:projectId/schedule/activities',
  'PATCH /api/v1/projects/:projectId/schedule/activities/:id',
  'PUT /api/v1/projects/:projectId/schedule/dependencies',
  'POST /api/v1/projects/:projectId/schedule/baseline',
  'POST /api/v1/projects/:projectId/schedule/baseline/reopen',
  'POST /api/v1/projects/:projectId/schedule/progress',
  'GET /api/v1/projects/:projectId/schedule/lookahead'
]);

let database;

/** Seed the smallest Project, WBS and RBAC graph needed for the complete Stage-21 browser workflow. */
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
      legalName: 'Pass 331 Module 21 Company Limited',
      displayName: 'Pass 331 Module 21 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of [...SCHEDULING_PERMISSIONS, ...SUPPORT_PERMISSIONS]) {
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
        code: 'module21-browser-manager',
        name: 'Module 21 Browser Manager',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module21-browser-reader',
        name: 'Module 21 Browser Reader',
        isSystem: false,
        status: 'ACTIVE'
      }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...[...SCHEDULING_PERMISSIONS, ...SUPPORT_PERMISSIONS].map((code) => ({
        roleId: MANAGER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      })),
      ...['schedule.read', 'projects.read'].map((code) => ({
        roleId: READER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 331 Planning Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 331 Schedule Reader', status: 'ACTIVE' }
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
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS331-CLIENT',
      legalName: 'Pass 331 Client Limited',
      displayName: 'Pass 331 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS331-PROJECT',
      name: 'Module 21 Browser Project',
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
      {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        userId: MANAGER_ID,
        projectRole: 'PLANNING_ENGINEER',
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        userId: READER_ID,
        projectRole: 'PROJECT_VIEWER',
        status: 'ACTIVE',
        fromDate
      }
    ]
  });
  await database.wbsNode.create({
    data: {
      id: WBS_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      parentId: null,
      code: 'SCH',
      name: 'Schedule WBS',
      level: 0,
      status: 'ACTIVE',
      sortOrder: 10
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

/** Open Project Scheduling and select the one server-discovered Project used by this browser scenario. */
async function openSchedulingProject(page) {
  await page.getByRole('button', { name: 'Project Scheduling' }).click();
  await expect(page.getByRole('heading', { name: 'Project Scheduling', level: 1 })).toBeVisible();
  await page.getByLabel('Project').selectOption(PROJECT_ID);
  await expect(page.getByRole('heading', { name: 'PASS331-PROJECT · Module 21 Browser Project' })).toBeVisible();
}

/** Return true only when one browser request belongs to the reviewed Stage-21 Scheduling route family. */
function isStage21Request(method, pathname) {
  if (/^\/api\/v1\/projects\/[^/]+\/schedule$/.test(pathname)) return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/projects\/[^/]+\/schedule\/activities$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/projects\/[^/]+\/schedule\/activities\/[^/]+$/.test(pathname)) return method === 'PATCH';
  if (/^\/api\/v1\/projects\/[^/]+\/schedule\/dependencies$/.test(pathname)) return method === 'PUT';
  if (/^\/api\/v1\/projects\/[^/]+\/schedule\/(baseline|progress)$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/projects\/[^/]+\/schedule\/lookahead$/.test(pathname)) return method === 'GET';
  return false;
}

/** Parse one captured browser request body while preserving the bodyless baseline command as null. */
function requestBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Capture only Stage-21 requests so route, idempotency and server-authority assertions stay focused. */
function trackStage21Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!isStage21Request(request.method(), url.pathname)) return;
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

/** Normalize concrete Project and Activity UUIDs into the reviewed Stage-21 operation shape. */
function normalizeStage21Operation(request) {
  const path = request.pathname
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/activities\/[^/]+$/, '/api/v1/projects/:projectId/schedule/activities/:id')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/activities$/, '/api/v1/projects/:projectId/schedule/activities')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/dependencies$/, '/api/v1/projects/:projectId/schedule/dependencies')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/baseline\/reopen$/, '/api/v1/projects/:projectId/schedule/baseline/reopen')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/baseline$/, '/api/v1/projects/:projectId/schedule/baseline')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/progress$/, '/api/v1/projects/:projectId/schedule/progress')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule\/lookahead$/, '/api/v1/projects/:projectId/schedule/lookahead')
    .replace(/^\/api\/v1\/projects\/[^/]+\/schedule$/, '/api/v1/projects/:projectId/schedule');
  return `${request.method} ${path}`;
}

/** Prove browser Scheduling writes stay inside the exact reviewed operations and never author server-owned state. */
function assertStage21AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  const seen = new Set(requests.map(normalizeStage21Operation));
  for (const operation of REVIEWED_OPERATIONS) expect(seen.has(operation)).toBe(true);
  for (const operation of seen) expect(REVIEWED_OPERATIONS.has(operation)).toBe(true);

  const writes = requests.filter((request) => ['POST', 'PATCH', 'PUT'].includes(request.method));
  for (const request of writes) expect(request.idempotencyKey).toBeTruthy();

  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'scheduleId',
    'status',
    'baselineAt',
    'baselineNo',
    'snapshotJson',
    'createdAt',
    'createdBy',
    'updatedBy',
    'ownerUserId',
    'durationDays',
    'criticalPath',
    'totalFloat',
    'freeFloat',
    'resourceId'
  ];
  for (const request of requests.filter((item) => item.body !== null)) {
    const serialized = JSON.stringify(request.body);
    for (const field of forbiddenFields) expect(serialized).not.toContain(`\"${field}\"`);
  }

  const scheduleCreate = requests.find((request) => (
    request.method === 'POST' && /^\/api\/v1\/projects\/[^/]+\/schedule$/.test(request.pathname)
  ));
  expect(Object.keys(scheduleCreate?.body ?? {}).sort()).toEqual(['dataDate', 'name']);

  const activityCreates = requests.filter((request) => (
    request.method === 'POST' && /\/schedule\/activities$/.test(request.pathname)
  ));
  expect(activityCreates).toHaveLength(2);
  for (const request of activityCreates) {
    const serialized = JSON.stringify(request.body ?? {});
    for (const field of ['actualStart', 'actualFinish', 'percentComplete']) {
      expect(serialized).not.toContain(`\"${field}\"`);
    }
  }

  const activityPatch = requests.find((request) => request.method === 'PATCH');
  expect(Object.keys(activityPatch?.body ?? {}).sort()).toEqual([
    'activityCode', 'milestone', 'name', 'parentId', 'plannedFinish', 'plannedStart', 'wbsNodeId'
  ]);

  const dependencyWrite = requests.find((request) => request.pathname.endsWith('/dependencies'));
  expect(dependencyWrite?.body?.dependencies).toHaveLength(1);
  expect(dependencyWrite?.body?.dependencies?.[0]?.dependencyType).toBe('FS');
  expect(dependencyWrite?.body?.dependencies?.[0]?.lagDays).toBe(2);

  const baselineWrite = requests.find((request) => request.pathname.endsWith('/baseline'));
  expect(baselineWrite?.body).toBeNull();

  const progressWrite = requests.find((request) => request.pathname.endsWith('/progress'));
  expect(progressWrite?.body?.percentComplete).toBe('35.5000');
  expect(progressWrite?.body?.activityId).toBeTruthy();

  const lookaheadReads = requests.filter((request) => request.pathname.endsWith('/lookahead'));
  expect(lookaheadReads.length).toBeGreaterThan(0);
  for (const request of lookaheadReads) expect(request.query).toEqual({});
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Stage-21 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 21 browser workflow covers Schedule, Activities, dependency, baseline, progress, look-ahead and permission denial', async ({ page, browser }) => {
  const managerRequests = trackStage21Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openSchedulingProject(page);

  const createScheduleSection = page.getByRole('heading', { name: 'Create current Schedule' }).locator('..');
  await createScheduleSection.getByLabel('Schedule name').fill('Pass 331 Construction Master Schedule');
  await createScheduleSection.getByLabel('Data date (optional)').fill('2026-08-01');
  await createScheduleSection.getByRole('button', { name: 'Create Schedule' }).click();
  await expect(page.getByText('Pass 331 Construction Master Schedule', { exact: true })).toBeVisible();

  const schedule = await database.projectSchedule.findFirstOrThrow({ where: { projectId: PROJECT_ID } });
  expect(schedule.status).toBe('ACTIVE');
  expect(schedule.dataDate?.toISOString().slice(0, 10)).toBe('2026-08-01');

  const createActivitySection = page.getByRole('heading', { name: 'Create Activity' }).locator('..');
  await createActivitySection.getByLabel('Activity code').fill('A100');
  await createActivitySection.getByLabel('Name').fill('Site mobilization');
  await createActivitySection.getByLabel('Optional WBS').selectOption(WBS_ID);
  await createActivitySection.getByLabel('Owner').selectOption(MANAGER_ID);
  await createActivitySection.getByLabel('Planned start').fill('2026-08-01');
  await createActivitySection.getByLabel('Planned finish').fill('2026-08-05');
  await createActivitySection.getByRole('button', { name: 'Create Activity' }).click();
  await expect(page.locator('section[aria-labelledby="module21-activities-title"]')).toContainText('A100');

  const firstActivity = await database.scheduleActivity.findFirstOrThrow({
    where: { scheduleId: schedule.id, activityCode: 'A100' }
  });

  await createActivitySection.getByLabel('Parent Activity').selectOption(firstActivity.id);
  await createActivitySection.getByLabel('Activity code').fill('A200');
  await createActivitySection.getByLabel('Name').fill('Foundation works');
  await createActivitySection.getByLabel('Optional WBS').selectOption(WBS_ID);
  await createActivitySection.getByLabel('Owner').selectOption(MANAGER_ID);
  await createActivitySection.getByLabel('Planned start').fill('2026-08-06');
  await createActivitySection.getByLabel('Planned finish').fill('2026-08-12');
  await createActivitySection.getByRole('button', { name: 'Create Activity' }).click();
  await expect(page.locator('section[aria-labelledby="module21-activities-title"]')).toContainText('A200');

  const secondActivity = await database.scheduleActivity.findFirstOrThrow({
    where: { scheduleId: schedule.id, activityCode: 'A200' }
  });
  expect(secondActivity.parentId).toBe(firstActivity.id);
  expect(secondActivity.wbsNodeId).toBe(WBS_ID);

  const dependencySection = page.locator('section[aria-labelledby="module21-dependencies-title"]');
  await dependencySection.getByRole('button', { name: 'Add dependency' }).click();
  const dependencyGroup = dependencySection.getByRole('group', { name: 'Dependency 1' });
  await dependencyGroup.getByLabel('Predecessor').selectOption(firstActivity.id);
  await dependencyGroup.getByLabel('Successor').selectOption(secondActivity.id);
  await dependencyGroup.getByLabel('Lag days').fill('2');
  await expect(dependencyGroup.getByLabel('Type')).toHaveValue('FS');
  await dependencySection.getByRole('button', { name: 'Save complete dependency set' }).click();
  await expect.poll(async () => database.scheduleDependency.count({ where: { scheduleId: schedule.id } })).toBe(1);

  const dependency = await database.scheduleDependency.findFirstOrThrow({ where: { scheduleId: schedule.id } });
  expect(dependency.predecessorActivityId).toBe(firstActivity.id);
  expect(dependency.successorActivityId).toBe(secondActivity.id);
  expect(dependency.dependencyType).toBe('FS');
  expect(dependency.lagDays).toBe(2);

  const baselineSection = page.locator('section[aria-labelledby="module21-baseline-title"]');
  await baselineSection.getByRole('button', { name: 'Create baseline' }).click();
  await expect(baselineSection).toContainText(/Latest baseline:\s*#1/);
  const baseline = await database.scheduleBaseline.findFirstOrThrow({ where: { scheduleId: schedule.id } });
  expect(baseline.baselineNo).toBe(1);
  expect(baseline.createdBy).toBe(MANAGER_ID);
  await baselineSection.getByRole('button', { name: 'Reopen planning' }).click();
  await expect(baselineSection).toContainText('Planning is open');

  const activitiesSection = page.locator('section[aria-labelledby="module21-activities-title"]');
  const firstActivityRow = activitiesSection.getByRole('row').filter({ hasText: 'A100' });
  await firstActivityRow.getByRole('button', { name: 'Edit' }).click();
  const editActivitySection = page.getByRole('heading', { name: 'Edit Activity' }).locator('..');
  await editActivitySection.getByLabel('Planned finish').fill('2026-08-07');
  await editActivitySection.getByLabel('Milestone').check();
  await editActivitySection.getByRole('button', { name: 'Save Activity' }).click();
  await expect(firstActivityRow).toContainText('2026-08-07');
  await expect(firstActivityRow).toContainText('Milestone');

  await baselineSection.getByRole('button', { name: 'Create revised baseline' }).click();
  await expect(baselineSection).toContainText(/Latest baseline:\s*#2/);
  expect(await database.scheduleBaseline.count({ where: { scheduleId: schedule.id } })).toBe(2);

  const progressSection = page.locator('section[aria-labelledby="module21-progress-title"]');
  await progressSection.getByLabel('Activity').selectOption(firstActivity.id);
  await progressSection.getByLabel('Data date').fill('2026-08-04');
  await progressSection.getByLabel('Percent complete').fill('35.5000');
  await progressSection.getByLabel('Forecast finish').fill('2026-08-08');
  await progressSection.getByLabel('Actual start').fill('2026-08-01');
  await progressSection.getByLabel('Remarks').fill('Pass 331 measured site mobilization progress');
  await progressSection.getByRole('button', { name: 'Record progress' }).click();
  await expect(progressSection).toContainText('Pass 331 measured site mobilization progress');

  const progress = await database.scheduleProgressUpdate.findFirstOrThrow({
    where: { scheduleId: schedule.id, activityId: firstActivity.id }
  });
  expect(progress.updatedBy).toBe(MANAGER_ID);
  expect(progress.percentComplete.toString()).toBe('35.5');
  expect(progress.forecastFinish?.toISOString().slice(0, 10)).toBe('2026-08-08');

  const currentActivity = await database.scheduleActivity.findUniqueOrThrow({ where: { id: firstActivity.id } });
  expect(currentActivity.plannedFinish.toISOString().slice(0, 10)).toBe('2026-08-07');
  expect(currentActivity.milestone).toBe(true);
  expect(currentActivity.percentComplete.toString()).toBe('35.5');
  expect(currentActivity.actualStart?.toISOString().slice(0, 10)).toBe('2026-08-01');

  const snapshot = baseline.snapshotJson;
  expect(snapshot.schedule.id).toBe(schedule.id);
  expect(snapshot.dependencies).toHaveLength(1);
  const frozenFirstActivity = snapshot.activities.find((activity) => activity.id === firstActivity.id);
  expect(frozenFirstActivity?.plannedFinish).toBe('2026-08-05');
  expect(frozenFirstActivity?.milestone).toBe(false);
  expect(frozenFirstActivity?.actualStart).toBeNull();

  const baselineRow = baselineSection.getByRole('row').filter({ hasText: 'A100' });
  await expect(baselineRow).toContainText('2026-08-05');
  await expect(baselineRow).toContainText('2026-08-07');

  const ganttSection = page.locator('section[aria-labelledby="module21-gantt-title"]');
  await expect(ganttSection).toContainText('A100');
  await expect(ganttSection).toContainText('A200');
  await expect(ganttSection).toContainText('35.5%');

  const lookaheadSection = page.locator('section[aria-labelledby="module21-lookahead-title"]');
  await expect(lookaheadSection).toContainText('A100');
  await expect(lookaheadSection).toContainText('A200');
  await expect(lookaheadSection).toContainText('35.5%');

  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.created' } })).toBe(1);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.activity_created' } })).toBe(2);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.dependencies_replaced' } })).toBe(1);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.baselined' } })).toBe(2);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.baseline_reopened' } })).toBe(1);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.activity_updated' } })).toBe(1);
  expect(await database.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.progress_updated' } })).toBe(1);

  for (const eventType of ['schedule.created', 'schedule.milestone_changed', 'schedule.progress_updated']) {
    expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } })).toBe(1);
  }
  expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.baselined' } })).toBe(2);

  assertStage21AuthorityBoundary(managerRequests);

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openSchedulingProject(readerPage);

    await expect(readerPage.locator('section[aria-labelledby="module21-activities-title"]')).toContainText('A100');
    await expect(readerPage.getByRole('heading', { name: 'Create Activity' })).toHaveCount(0);
    await expect(readerPage.getByRole('heading', { name: 'Edit Activity' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Save complete dependency set' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Create baseline' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Record progress' })).toHaveCount(0);
    await expect(readerPage.locator('[aria-labelledby="module21-dependencies-title"]')).toContainText('schedule.manage is required to change dependencies.');
    await expect(readerPage.getByText('schedule.baseline is required to create a new baseline.')).toBeVisible();
    await expect(readerPage.getByText('schedule.progress is required to record progress.')).toBeVisible();

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();

    const allowedRead = await readerPage.request.get(`${API_BASE_URL}/projects/${PROJECT_ID}/schedule`, {
      headers: { authorization: `Bearer ${readerToken}` }
    });
    expect(allowedRead.status()).toBe(200);

    const deniedActivity = await readerPage.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/schedule/activities`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass331-reader-denied-activity'
      },
      data: {
        activityCode: 'DENIED',
        name: 'Denied Activity',
        plannedStart: '2026-08-10',
        plannedFinish: '2026-08-11',
        milestone: false,
        ownerUserId: READER_ID
      }
    });
    expect(deniedActivity.status()).toBe(403);

    const deniedBaseline = await readerPage.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/schedule/baseline`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass331-reader-denied-baseline'
      }
    });
    expect(deniedBaseline.status()).toBe(403);

    const deniedProgress = await readerPage.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/schedule/progress`, {
      headers: {
        authorization: `Bearer ${readerToken}`,
        'Idempotency-Key': 'pass331-reader-denied-progress'
      },
      data: {
        activityId: firstActivity.id,
        dataDate: '2026-08-05',
        percentComplete: '50.0000',
        remarks: 'Reader must not write progress.'
      }
    });
    expect(deniedProgress.status()).toBe(403);
  } finally {
    await readerContext.close();
  }
});
