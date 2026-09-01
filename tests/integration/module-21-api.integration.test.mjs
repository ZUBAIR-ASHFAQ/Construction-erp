import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000021001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000021002';
const ADMIN_ID = '00000000-0000-4000-8000-000000021010';
const READER_ID = '00000000-0000-4000-8000-000000021011';
const PROJECT_MANAGER_ID = '00000000-0000-4000-8000-000000021012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000021013';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000021020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000021021';
const PROJECT_MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000021022';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000021023';
const CLIENT_ID = '00000000-0000-4000-8000-000000021030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000021031';
const PROJECT_ID = '00000000-0000-4000-8000-000000021040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000021041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000021042';
const WBS_ID = '00000000-0000-4000-8000-000000021050';
const OTHER_WBS_ID = '00000000-0000-4000-8000-000000021051';
const WBS_B_ID = '00000000-0000-4000-8000-000000021052';
const PASSWORD = 'Module21-pass-328-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module21-auth-secret-0123456789abcdef';

const MODULE_21_PERMISSIONS = [
  'schedule.read',
  'schedule.manage',
  'schedule.baseline',
  'schedule.progress'
];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum Company, RBAC, Project, membership and WBS graph needed by Stage-21 Scheduling tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 21 Company Ltd',
        displayName: 'Module 21 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 21 Foreign Company Ltd',
        displayName: 'Module 21 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_21_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'schedule' },
      create: { code, name: code, domain: 'schedule' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-21-admin', name: 'Module 21 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-21-reader', name: 'Module 21 Reader', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'module-21-project-manager', name: 'Module 21 Project Manager', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-21-admin', name: 'Module 21 Foreign Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_21_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('schedule.read') },
      ...MODULE_21_PERMISSIONS.map((code) => ({ roleId: PROJECT_MANAGER_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_21_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module21-admin@example.test', name: 'Module 21 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module21-reader@example.test', name: 'Module 21 Reader' },
    { id: PROJECT_MANAGER_ID, companyId: COMPANY_ID, email: 'module21-project@example.test', name: 'Module 21 Project Manager' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module21-admin-b@example.test', name: 'Module 21 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_MANAGER_ID, roleId: PROJECT_MANAGER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M21-CLIENT', legalName: 'Module 21 Client Ltd', displayName: 'Module 21 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M21-FOREIGN', legalName: 'Module 21 Foreign Client Ltd', displayName: 'Module 21 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M21-A', name: 'Module 21 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M21-OTHER', name: 'Module 21 Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M21-B', name: 'Module 21 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: ADMIN_ID, projectRole: 'PLANNING_ENGINEER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, userId: ADMIN_ID, projectRole: 'PLANNING_ENGINEER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'PROJECT_VIEWER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_MANAGER_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, userId: ADMIN_B_ID, projectRole: 'PLANNING_ENGINEER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.wbsNode.createMany({
    data: [
      { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'SCH', name: 'Schedule WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: OTHER_WBS_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, parentId: null, code: 'SCH', name: 'Other Schedule WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, parentId: null, code: 'SCH', name: 'Foreign Schedule WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
    ]
  });
}

/** Build one fresh Fastify app over the explicitly disposable PostgreSQL integration database. */
async function withApi(work) {
  const runtime = await loadRuntime();
  const environment = runtime.testing.loadFoundationTestEnvironment();
  const client = runtime.testing.createFoundationTestDatabaseClient(environment);
  let app;

  try {
    await client.$connect();
    await runtime.testing.resetFoundationTestData(client);
    await seedScenario(client, runtime.hashPassword);
    app = runtime.buildApp({
      database: client,
      nodeEnv: 'test',
      logLevel: 'silent',
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user through the real Module-24A route and return its access token. */
async function signIn(app, email = 'module21-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Send one reviewed Scheduling mutation with the mandatory Foundation Idempotency-Key. */
async function schedulingWrite(app, token, method, url, payload, key) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key
    },
    payload
  });
}

/** Create one current Schedule through the reviewed public API. */
async function createSchedule(app, token, projectId = PROJECT_ID, key = 'module21-schedule-create') {
  const response = await schedulingWrite(
    app,
    token,
    'POST',
    `/api/v1/projects/${projectId}/schedule`,
    { name: 'Construction Master Schedule', dataDate: '2026-08-01' },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one source-bounded Schedule Activity through the public API. */
async function createActivity(app, token, overrides = {}, key = `module21-activity-${overrides.activityCode ?? 'A100'}`) {
  const projectId = overrides.projectId ?? PROJECT_ID;
  const ownerUserId = overrides.ownerUserId ?? (projectId === PROJECT_B_ID ? ADMIN_B_ID : ADMIN_ID);
  const response = await schedulingWrite(
    app,
    token,
    'POST',
    `/api/v1/projects/${projectId}/schedule/activities`,
    {
      parentId: overrides.parentId === undefined ? null : overrides.parentId,
      activityCode: overrides.activityCode ?? 'A100',
      name: overrides.name ?? 'Mobilization',
      wbsNodeId: overrides.wbsNodeId === undefined ? WBS_ID : overrides.wbsNodeId,
      plannedStart: overrides.plannedStart ?? '2026-08-02',
      plannedFinish: overrides.plannedFinish ?? '2026-08-05',
      milestone: overrides.milestone ?? false,
      ownerUserId,
      ...(overrides.extraBody ?? {})
    },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return one generated Module-21 OpenAPI operation and fail clearly when it is absent. */
function module21OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Install one disposable PostgreSQL trigger that forces a selected Module-21 outbox event to fail. */
async function installModule21OutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_21_test_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 21 forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_21_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_21_test_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_21_test_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-21 outbox failure trigger and helper function. */
async function removeModule21OutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_21_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_21_test_fail_outbox_event()');
}

// Verify the complete reviewed Schedule workflow through real Fastify/service/repository/PostgreSQL boundaries.
test('Module 21 live workflow covers Schedule, Activity, dependencies, baseline, progress and look-ahead', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'SCHEDULE_NOT_FOUND');

    const schedule = await createSchedule(app, token);
    assert.equal(schedule.projectId, PROJECT_ID);
    assert.equal(schedule.status, 'ACTIVE');
    assert.equal(schedule.dataDate, '2026-08-01');
    assert.equal(schedule.activities.length, 0);

    const parent = await createActivity(app, token, {
      activityCode: 'A100',
      name: 'Mobilization',
      plannedStart: '2026-08-02',
      plannedFinish: '2026-08-05'
    }, 'module21-activity-a100');
    const child = await createActivity(app, token, {
      activityCode: 'A200',
      name: 'Foundation Works',
      parentId: parent.id,
      plannedStart: '2026-08-06',
      plannedFinish: '2026-08-12',
      milestone: false
    }, 'module21-activity-a200');
    const milestone = await createActivity(app, token, {
      activityCode: 'M300',
      name: 'Foundation Complete',
      plannedStart: '2026-08-13',
      plannedFinish: '2026-08-13',
      milestone: true
    }, 'module21-activity-m300');

    response = await schedulingWrite(
      app,
      token,
      'PATCH',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities/${child.id}`,
      { name: 'Foundation and Footing Works', milestone: true },
      'module21-activity-update-a200'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.name, 'Foundation and Footing Works');
    assert.equal(response.json().data.milestone, true);

    response = await schedulingWrite(
      app,
      token,
      'PUT',
      `/api/v1/projects/${PROJECT_ID}/schedule/dependencies`,
      {
        dependencies: [
          { predecessorActivityId: parent.id, successorActivityId: child.id, dependencyType: 'FS', lagDays: 0 },
          { predecessorActivityId: child.id, successorActivityId: milestone.id, dependencyType: 'FS', lagDays: 1 }
        ]
      },
      'module21-dependencies'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.dependencies.length, 2);

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/baseline`,
      {},
      'module21-baseline-1'
    );
    assert.equal(response.statusCode, 201, response.body);
    const baseline = response.json().data;
    assert.equal(baseline.baselineNo, 1);
    assert.equal(baseline.snapshotJson.activities.length, 3);
    assert.equal(baseline.snapshotJson.dependencies.length, 2);

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/progress`,
      {
        activityId: parent.id,
        dataDate: '2026-08-05',
        percentComplete: '100.0000',
        actualStart: '2026-08-02',
        actualFinish: '2026-08-05',
        forecastFinish: null,
        remarks: 'Mobilization complete.'
      },
      'module21-progress-a100'
    );
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.percentComplete, '100');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const current = response.json().data;
    assert.equal(current.activities.length, 3);
    assert.equal(current.dependencies.length, 2);
    assert.equal(current.baselines.length, 1);
    assert.equal(current.progressUpdates.length, 1);
    assert.equal(current.baselines[0].snapshotJson.activities.find((item) => item.id === parent.id).percentComplete, '0');
    assert.equal(current.activities.find((item) => item.id === parent.id).percentComplete, '100');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule/lookahead`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.projectId, PROJECT_ID);
    assert.deepEqual(
      response.json().data.activities.map((item) => item.activityCode).sort(),
      ['A100', 'A200', 'M300']
    );

    assert.equal(await client.projectSchedule.count({ where: { projectId: PROJECT_ID } }), 1);
    assert.equal(await client.scheduleActivity.count({ where: { scheduleId: schedule.id } }), 3);
    assert.equal(await client.scheduleDependency.count({ where: { scheduleId: schedule.id } }), 2);
    assert.equal(await client.scheduleBaseline.count({ where: { scheduleId: schedule.id } }), 1);
    assert.equal(await client.scheduleProgressUpdate.count({ where: { scheduleId: schedule.id } }), 1);
  });
});

// Verify service and database boundaries reject duplicate codes, invalid WBS links, hierarchy cycles and dependency cycles.
test('Module 21 live validation and PostgreSQL constraints reject invalid Activity and dependency state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token);
    const first = await createActivity(app, token, { activityCode: 'A100' }, 'module21-validation-a100');
    const second = await createActivity(app, token, { activityCode: 'A200', name: 'Second Activity' }, 'module21-validation-a200');

    let response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities`,
      {
        parentId: null,
        activityCode: 'A100',
        name: 'Duplicate Activity',
        wbsNodeId: WBS_ID,
        plannedStart: '2026-08-06',
        plannedFinish: '2026-08-07',
        milestone: false,
        ownerUserId: ADMIN_ID
      },
      'module21-duplicate-code'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'DUPLICATE_ACTIVITY_CODE');

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities`,
      {
        parentId: null,
        activityCode: 'A300',
        name: 'Wrong WBS',
        wbsNodeId: OTHER_WBS_ID,
        plannedStart: '2026-08-08',
        plannedFinish: '2026-08-09',
        milestone: false,
        ownerUserId: ADMIN_ID
      },
      'module21-wrong-wbs'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await schedulingWrite(
      app,
      token,
      'PATCH',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities/${first.id}`,
      { parentId: second.id },
      'module21-parent-first'
    );
    assert.equal(response.statusCode, 200, response.body);

    response = await schedulingWrite(
      app,
      token,
      'PATCH',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities/${second.id}`,
      { parentId: first.id },
      'module21-parent-cycle'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await schedulingWrite(
      app,
      token,
      'PUT',
      `/api/v1/projects/${PROJECT_ID}/schedule/dependencies`,
      {
        dependencies: [
          { predecessorActivityId: first.id, successorActivityId: second.id, dependencyType: 'FS', lagDays: 0 },
          { predecessorActivityId: second.id, successorActivityId: first.id, dependencyType: 'FS', lagDays: 0 }
        ]
      },
      'module21-dependency-cycle'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'SCHEDULE_DEPENDENCY_CYCLE');

    await assert.rejects(() => client.projectSchedule.create({
      data: {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        name: 'Duplicate Current Schedule',
        status: 'ACTIVE',
        dataDate: new Date('2026-08-01T00:00:00.000Z')
      }
    }));

    await assert.rejects(() => client.scheduleActivity.create({
      data: {
        scheduleId: schedule.id,
        parentId: null,
        activityCode: 'DB-WBS',
        name: 'Direct Wrong WBS',
        wbsNodeId: OTHER_WBS_ID,
        plannedStart: new Date('2026-08-08T00:00:00.000Z'),
        plannedFinish: new Date('2026-08-09T00:00:00.000Z'),
        percentComplete: '0.0000',
        milestone: false,
        status: 'ACTIVE'
      }
    }));
  });
});

// Verify authentication, permission and Project scope checks fail closed without cross-Project/Company leakage.
test('Module 21 live authentication RBAC and Project scope block unauthorized Schedule access and writes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    await createSchedule(app, adminToken);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`
    });
    assert.equal(response.statusCode, 401, response.body);

    const readerToken = await signIn(app, 'module21-reader@example.test');
    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await schedulingWrite(
      app,
      readerToken,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities`,
      {
        parentId: null,
        activityCode: 'DENIED',
        name: 'Denied Activity',
        wbsNodeId: WBS_ID,
        plannedStart: '2026-08-02',
        plannedFinish: '2026-08-03',
        milestone: false,
        ownerUserId: READER_ID
      },
      'module21-reader-denied'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    const projectToken = await signIn(app, 'module21-project@example.test');
    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${projectToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${OTHER_PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${projectToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    const foreignToken = await signIn(app, 'module21-admin-b@example.test');
    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');
  });
});

// Verify strict input authority, idempotent replay and invalid progress handling at the public API boundary.
test('Module 21 live HTTP boundary rejects server-owned fields and safely replays reviewed mutations', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/schedule`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Missing key', dataDate: '2026-08-01' }
    });
    assert.equal(response.statusCode, 400, response.body);

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule`,
      {
        name: 'Forbidden ownership',
        dataDate: '2026-08-01',
        companyId: COMPANY_ID
      },
      'module21-forbidden-company'
    );
    assert.equal(response.statusCode, 400, response.body);

    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-replay-schedule');
    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule`,
      { name: 'Construction Master Schedule', dataDate: '2026-08-01' },
      'module21-replay-schedule'
    );
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.id, schedule.id);
    assert.equal(await client.projectSchedule.count({ where: { projectId: PROJECT_ID } }), 1);

    const activity = await createActivity(app, token, { activityCode: 'A100' }, 'module21-replay-activity');
    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/progress`,
      {
        activityId: activity.id,
        dataDate: '2026-08-03',
        percentComplete: '50.0000',
        actualFinish: '2026-08-03',
        remarks: 'Invalid finish before completion.'
      },
      'module21-invalid-progress'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/schedule/lookahead?weeksAhead=6`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 400, response.body);
  });
});

// Verify immutable baseline/progress history and the reviewed audit/outbox event boundary.
test('Module 21 live audit outbox and immutable history preserve baseline and progress evidence', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-evidence-schedule');
    const activity = await createActivity(app, token, { activityCode: 'M100', milestone: false }, 'module21-evidence-activity');

    let response = await schedulingWrite(
      app,
      token,
      'PATCH',
      `/api/v1/projects/${PROJECT_ID}/schedule/activities/${activity.id}`,
      { milestone: true },
      'module21-evidence-milestone'
    );
    assert.equal(response.statusCode, 200, response.body);

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/baseline`,
      {},
      'module21-evidence-baseline'
    );
    assert.equal(response.statusCode, 201, response.body);
    const baselineId = response.json().data.id;

    response = await schedulingWrite(
      app,
      token,
      'POST',
      `/api/v1/projects/${PROJECT_ID}/schedule/progress`,
      {
        activityId: activity.id,
        dataDate: '2026-08-04',
        percentComplete: '25.0000',
        remarks: 'First measured progress.'
      },
      'module21-evidence-progress'
    );
    assert.equal(response.statusCode, 201, response.body);
    const progressId = response.json().data.id;

    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.created', entityId: schedule.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.activity_updated', entityId: activity.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.baselined', entityId: schedule.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.progress_updated', entityId: activity.id } }), 1);

    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.created', resourceId: schedule.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.milestone_changed', resourceId: activity.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.baselined', resourceId: schedule.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.progress_updated', resourceId: activity.id } }), 1);

    await assert.rejects(() => client.scheduleBaseline.update({
      where: { id: baselineId },
      data: { baselineNo: 99 }
    }));
    await assert.rejects(() => client.scheduleProgressUpdate.update({
      where: { id: progressId },
      data: { remarks: 'Mutation must fail.' }
    }));
  });
});

// Verify generated OpenAPI contains exactly the reviewed operations and no browser-owned Schedule authority.
test('Module 21 live OpenAPI exposes exactly eight reviewed operations with bearer security and six idempotent writes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/projects/{projectId}/schedule', 'module21GetProjectSchedule'],
      ['POST', '/api/v1/projects/{projectId}/schedule', 'module21CreateProjectSchedule'],
      ['POST', '/api/v1/projects/{projectId}/schedule/activities', 'module21CreateScheduleActivity'],
      ['PATCH', '/api/v1/projects/{projectId}/schedule/activities/{id}', 'module21UpdateScheduleActivity'],
      ['PUT', '/api/v1/projects/{projectId}/schedule/dependencies', 'module21ReplaceScheduleDependencies'],
      ['POST', '/api/v1/projects/{projectId}/schedule/baseline', 'module21CreateScheduleBaseline'],
      ['POST', '/api/v1/projects/{projectId}/schedule/progress', 'module21RecordScheduleProgress'],
      ['GET', '/api/v1/projects/{projectId}/schedule/lookahead', 'module21GetScheduleLookahead']
    ];

    const documented = [];
    for (const [method, route, operationId] of expected) {
      const operation = module21OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const actualModule21 = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module21')) {
          actualModule21.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(actualModule21.sort(), documented.sort());

    for (const [method, route] of expected.filter(([method]) => ['POST', 'PATCH', 'PUT'].includes(method))) {
      const parameters = module21OpenApiOperation(document, route, method).parameters ?? [];
      const idempotency = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');
      assert.ok(idempotency, `${method} ${route} must require Idempotency-Key`);
      assert.equal(idempotency.required, true);
    }

    const createBody = module21OpenApiOperation(document, '/api/v1/projects/{projectId}/schedule', 'POST')
      .requestBody.content['application/json'].schema;
    for (const field of ['companyId', 'actorUserId', 'status', 'baselineAt', 'baselineNo', 'createdBy']) {
      assert.equal(Object.hasOwn(createBody.properties, field), false, field);
    }

    const progressBody = module21OpenApiOperation(document, '/api/v1/projects/{projectId}/schedule/progress', 'POST')
      .requestBody.content['application/json'].schema;
    for (const field of ['companyId', 'scheduleId', 'updatedBy', 'status']) {
      assert.equal(Object.hasOwn(progressBody.properties, field), false, field);
    }
    assert.equal(progressBody.properties.percentComplete.type, 'string');

    const baselineBody = module21OpenApiOperation(document, '/api/v1/projects/{projectId}/schedule/baseline', 'POST')
      .requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(baselineBody.properties ?? {}), []);

    const lookahead = module21OpenApiOperation(document, '/api/v1/projects/{projectId}/schedule/lookahead', 'GET');
    assert.equal((lookahead.parameters ?? []).some((parameter) => parameter.in === 'query'), false);

    for (const forbiddenPath of [
      '/api/v1/projects/{projectId}/schedule/delete',
      '/api/v1/projects/{projectId}/schedule/reopen',
      '/api/v1/projects/{projectId}/schedule/import',
      '/api/v1/projects/{projectId}/schedule/critical-path',
      '/api/v1/projects/{projectId}/schedule/resources'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }
  });
});


// Verify same-key Schedule creation is replay-safe under concurrent requests.
test('Module 21 operational same-key Schedule create leaves one Schedule audit outbox and idempotency result', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const key = 'module21-ops-schedule-same-key';
    const url = `/api/v1/projects/${PROJECT_ID}/schedule`;
    const payload = { name: 'Operational Schedule', dataDate: '2026-08-01' };

    const responses = await Promise.all([
      schedulingWrite(app, token, 'POST', url, payload, key),
      schedulingWrite(app, token, 'POST', url, payload, key)
    ]);
    assert.equal(responses.some((response) => response.statusCode === 201), true);
    for (const response of responses) {
      assert.equal([201, 409].includes(response.statusCode), true, response.body);
      if (response.statusCode === 409) assert.equal(errorCode(response), 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
    }

    const replay = await schedulingWrite(app, token, 'POST', url, payload, key);
    assert.equal(replay.statusCode, 201, replay.body);
    const scheduleId = replay.json().data.id;
    assert.equal(await client.projectSchedule.count({ where: { projectId: PROJECT_ID } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.created', entityId: scheduleId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.created', resourceId: scheduleId } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'scheduling.schedule-create', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);
  });
});

// Verify different request keys cannot create two current Schedules for one Project.
test('Module 21 operational concurrent different-key Schedule create commits one current Schedule', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const url = `/api/v1/projects/${PROJECT_ID}/schedule`;
    const payload = { name: 'Operational Schedule', dataDate: '2026-08-01' };
    const responses = await Promise.all([
      schedulingWrite(app, token, 'POST', url, payload, 'module21-ops-schedule-a'),
      schedulingWrite(app, token, 'POST', url, payload, 'module21-ops-schedule-b')
    ]);

    assert.deepEqual(responses.map((response) => response.statusCode).sort((a, b) => a - b), [201, 409]);
    assert.equal(await client.projectSchedule.count({ where: { projectId: PROJECT_ID } }), 1);
    const schedule = await client.projectSchedule.findFirstOrThrow({ where: { projectId: PROJECT_ID } });
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.created', entityId: schedule.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.created', resourceId: schedule.id } }), 1);
  });
});

// Verify baseline numbering remains server-owned when two baseline commands arrive together.
test('Module 21 operational concurrent baselines allocate unique increasing server-owned numbers', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-ops-baseline-schedule');
    await createActivity(app, token, { activityCode: 'B100' }, 'module21-ops-baseline-activity');
    const url = `/api/v1/projects/${PROJECT_ID}/schedule/baseline`;

    const responses = await Promise.all([
      schedulingWrite(app, token, 'POST', url, {}, 'module21-ops-baseline-a'),
      schedulingWrite(app, token, 'POST', url, {}, 'module21-ops-baseline-b')
    ]);
    assert.deepEqual(responses.map((response) => response.statusCode), [201, 201]);
    assert.deepEqual(responses.map((response) => response.json().data.baselineNo).sort((a, b) => a - b), [1, 2]);
    assert.equal(await client.scheduleBaseline.count({ where: { scheduleId: schedule.id } }), 2);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.baselined', entityId: schedule.id } }), 2);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.baselined', resourceId: schedule.id } }), 2);
  });
});

// Verify same-key progress commands never duplicate current state, history or event evidence.
test('Module 21 operational same-key progress leaves one history row one Activity update and one audit outbox result', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-ops-progress-schedule');
    const activity = await createActivity(app, token, { activityCode: 'P100' }, 'module21-ops-progress-activity');
    const key = 'module21-ops-progress-same-key';
    const url = `/api/v1/projects/${PROJECT_ID}/schedule/progress`;
    const payload = {
      activityId: activity.id,
      dataDate: '2026-08-04',
      percentComplete: '40.0000',
      forecastFinish: '2026-08-06',
      remarks: 'Operational progress.'
    };

    const responses = await Promise.all([
      schedulingWrite(app, token, 'POST', url, payload, key),
      schedulingWrite(app, token, 'POST', url, payload, key)
    ]);
    assert.equal(responses.some((response) => response.statusCode === 201), true);
    for (const response of responses) {
      assert.equal([201, 409].includes(response.statusCode), true, response.body);
      if (response.statusCode === 409) assert.equal(errorCode(response), 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
    }

    const replay = await schedulingWrite(app, token, 'POST', url, payload, key);
    assert.equal(replay.statusCode, 201, replay.body);
    const persistedActivity = await client.scheduleActivity.findUniqueOrThrow({ where: { id: activity.id } });
    assert.equal(persistedActivity.percentComplete.toString(), '40');
    assert.equal(await client.scheduleProgressUpdate.count({ where: { scheduleId: schedule.id, activityId: activity.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.progress_updated', entityId: activity.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.progress_updated', resourceId: activity.id } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'scheduling.progress-record', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);
  });
});

// Verify the PostgreSQL dependency trigger serializes direct concurrent edges before a cycle can commit.
test('Module 21 operational concurrent direct dependency inserts cannot commit a cycle', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-ops-cycle-schedule');
    const first = await createActivity(app, token, { activityCode: 'C100' }, 'module21-ops-cycle-first');
    const second = await createActivity(app, token, { activityCode: 'C200' }, 'module21-ops-cycle-second');

    const results = await Promise.allSettled([
      client.$transaction((tx) => tx.scheduleDependency.create({
        data: { scheduleId: schedule.id, predecessorActivityId: first.id, successorActivityId: second.id, dependencyType: 'FS', lagDays: 0 }
      })),
      client.$transaction((tx) => tx.scheduleDependency.create({
        data: { scheduleId: schedule.id, predecessorActivityId: second.id, successorActivityId: first.id, dependencyType: 'FS', lagDays: 0 }
      }))
    ]);

    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
    assert.equal(await client.scheduleDependency.count({ where: { scheduleId: schedule.id } }), 1);
  });
});

// Verify reviewed Stage-21 database constraints remain authoritative below the service layer.
test('Module 21 operational Stage-21 PostgreSQL constraints reject invalid scope actor dependency and progress state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-ops-db-schedule');
    const first = await createActivity(app, token, { activityCode: 'D100' }, 'module21-ops-db-first');
    const second = await createActivity(app, token, { activityCode: 'D200' }, 'module21-ops-db-second');

    await assert.rejects(() => client.scheduleDependency.create({
      data: { scheduleId: schedule.id, predecessorActivityId: first.id, successorActivityId: second.id, dependencyType: 'SS', lagDays: 0 }
    }));
    await assert.rejects(() => client.scheduleDependency.create({
      data: { scheduleId: schedule.id, predecessorActivityId: first.id, successorActivityId: second.id, dependencyType: 'FS', lagDays: -1 }
    }));
    await assert.rejects(() => client.scheduleBaseline.create({
      data: { scheduleId: schedule.id, baselineNo: 1, createdBy: ADMIN_B_ID, snapshotJson: { schedule: {}, activities: [], dependencies: [] } }
    }), /creator must belong to the Schedule Company/);
    await assert.rejects(() => client.scheduleProgressUpdate.create({
      data: {
        scheduleId: schedule.id,
        activityId: first.id,
        dataDate: new Date('2026-08-04T00:00:00.000Z'),
        percentComplete: '20.0000',
        forecastFinish: null,
        remarks: 'Wrong updater Company.',
        updatedBy: ADMIN_B_ID
      }
    }), /updater must belong to the Schedule Company/);
    await assert.rejects(() => client.scheduleActivity.create({
      data: {
        scheduleId: schedule.id,
        parentId: null,
        activityCode: 'D300',
        name: 'Invalid direct completion',
        wbsNodeId: WBS_ID,
        plannedStart: new Date('2026-08-05T00:00:00.000Z'),
        plannedFinish: new Date('2026-08-06T00:00:00.000Z'),
        actualStart: new Date('2026-08-05T00:00:00.000Z'),
        actualFinish: new Date('2026-08-06T00:00:00.000Z'),
        percentComplete: '50.0000',
        milestone: false,
        status: 'ACTIVE'
      }
    }));
  });
});

// Verify a late progress event failure rolls back current Activity state and every durable side effect.
test('Module 21 operational forced progress outbox failure rolls back Activity history audit and idempotency state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const schedule = await createSchedule(app, token, PROJECT_ID, 'module21-ops-rollback-schedule');
    const activity = await createActivity(app, token, { activityCode: 'R100' }, 'module21-ops-rollback-activity');
    const key = 'module21-ops-rollback-progress';

    try {
      await installModule21OutboxFailure(client, 'schedule.progress_updated');
      const failed = await schedulingWrite(
        app,
        token,
        'POST',
        `/api/v1/projects/${PROJECT_ID}/schedule/progress`,
        {
          activityId: activity.id,
          dataDate: '2026-08-04',
          percentComplete: '55.0000',
          forecastFinish: '2026-08-06',
          remarks: 'This transaction must roll back.'
        },
        key
      );
      assert.equal(failed.statusCode, 500, failed.body);

      const persistedActivity = await client.scheduleActivity.findUniqueOrThrow({ where: { id: activity.id } });
      assert.equal(persistedActivity.percentComplete.toString(), '0');
      assert.equal(await client.scheduleProgressUpdate.count({ where: { scheduleId: schedule.id, activityId: activity.id } }), 0);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'schedule.progress_updated', entityId: activity.id } }), 0);
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'schedule.progress_updated', resourceId: activity.id } }), 0);
      assert.equal(await client.idempotencyRecord.count({
        where: { companyId: COMPANY_ID, operation: 'scheduling.progress-record', idempotencyKey: key }
      }), 0);
    } finally {
      await removeModule21OutboxFailure(client);
    }
  });
});

// Verify every Stage-21 Scheduling query family retains the reviewed supporting indexes.
test('Module 21 operational Stage-21 Scheduling indexes are deployed', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const indexes = await client.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN (
          'project_schedules',
          'schedule_activities',
          'schedule_dependencies',
          'schedule_baselines',
          'schedule_progress_updates'
        )
      ORDER BY indexname
    `);
    const indexNames = new Set(indexes.map((row) => row.indexname));
    for (const name of [
      'project_schedules_project_uq',
      'project_schedules_company_status_idx',
      'project_schedules_company_data_date_idx',
      'schedule_activities_schedule_code_uq',
      'schedule_activities_schedule_parent_idx',
      'schedule_activities_schedule_planned_dates_idx',
      'schedule_activities_schedule_milestone_status_idx',
      'schedule_activities_wbs_node_idx',
      'schedule_dependencies_schedule_predecessor_idx',
      'schedule_dependencies_schedule_successor_idx',
      'schedule_baselines_schedule_no_uq',
      'schedule_baselines_schedule_created_idx',
      'schedule_baselines_creator_created_idx',
      'schedule_progress_updates_schedule_date_idx',
      'schedule_progress_updates_activity_date_idx',
      'schedule_progress_updates_updater_date_idx'
    ]) {
      assert.equal(indexNames.has(name), true, `Missing Stage-21 Scheduling index: ${name}`);
    }
  });
});
