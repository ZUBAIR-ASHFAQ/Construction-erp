import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000005000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000005100';
const ADMIN_ID = '00000000-0000-4000-8000-000000005010';
const READER_ID = '00000000-0000-4000-8000-000000005011';
const CREATOR_ID = '00000000-0000-4000-8000-000000005012';
const UPDATER_ID = '00000000-0000-4000-8000-000000005013';
const ACTIVATOR_ID = '00000000-0000-4000-8000-000000005014';
const CLOSER_ID = '00000000-0000-4000-8000-000000005015';
const NO_PERMISSION_ID = '00000000-0000-4000-8000-000000005016';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000005110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000005020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000005021';
const CREATOR_ROLE_ID = '00000000-0000-4000-8000-000000005022';
const UPDATER_ROLE_ID = '00000000-0000-4000-8000-000000005023';
const ACTIVATOR_ROLE_ID = '00000000-0000-4000-8000-000000005024';
const CLOSER_ROLE_ID = '00000000-0000-4000-8000-000000005025';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000005120';
const CLIENT_ID = '00000000-0000-4000-8000-000000005030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000005130';
const TENDER_ID = '00000000-0000-4000-8000-000000005040';
const TENDER_B_ID = '00000000-0000-4000-8000-000000005140';
const PASSWORD = 'Module5-pass-143-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_5_PERMISSIONS = [
  'projects.read',
  'projects.create',
  'projects.update',
  'projects.manage_members',
  'projects.activate',
  'projects.close'
];

let contextCounter = 0;

/** Load built runtime packages only when the disposable live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const { ProjectsRepository, ProjectsService } = await import('../../apps/api/dist/modules/projects/index.js');
  return { testing, buildApp, hashPassword, ProjectsRepository, ProjectsService };
}

/** Seed two companies plus the small permission principals needed by Project integration and security tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 5 Company Ltd',
        displayName: 'Module 5 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 5 Foreign Company Ltd',
        displayName: 'Module 5 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_5_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'projects' },
      create: { code, name: code, domain: 'projects' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'project-admin', name: 'Project Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'project-reader', name: 'Project Reader', isSystem: false, status: 'ACTIVE' },
      { id: CREATOR_ROLE_ID, companyId: COMPANY_ID, code: 'project-creator', name: 'Project Creator', isSystem: false, status: 'ACTIVE' },
      { id: UPDATER_ROLE_ID, companyId: COMPANY_ID, code: 'project-updater', name: 'Project Updater', isSystem: false, status: 'ACTIVE' },
      { id: ACTIVATOR_ROLE_ID, companyId: COMPANY_ID, code: 'project-activator', name: 'Project Activator', isSystem: false, status: 'ACTIVE' },
      { id: CLOSER_ROLE_ID, companyId: COMPANY_ID, code: 'project-closer', name: 'Project Closer', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'project-admin', name: 'Project Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_5_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_5_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('projects.read') },
      { roleId: CREATOR_ROLE_ID, permissionId: permissionByCode.get('projects.create') },
      { roleId: UPDATER_ROLE_ID, permissionId: permissionByCode.get('projects.update') },
      { roleId: ACTIVATOR_ROLE_ID, permissionId: permissionByCode.get('projects.activate') },
      { roleId: CLOSER_ROLE_ID, permissionId: permissionByCode.get('projects.close') }
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'project-admin@example.test', name: 'Project Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'project-reader@example.test', name: 'Project Reader' },
    { id: CREATOR_ID, companyId: COMPANY_ID, email: 'project-creator@example.test', name: 'Project Creator' },
    { id: UPDATER_ID, companyId: COMPANY_ID, email: 'project-updater@example.test', name: 'Project Updater' },
    { id: ACTIVATOR_ID, companyId: COMPANY_ID, email: 'project-activator@example.test', name: 'Project Activator' },
    { id: CLOSER_ID, companyId: COMPANY_ID, email: 'project-closer@example.test', name: 'Project Closer' },
    { id: NO_PERMISSION_ID, companyId: COMPANY_ID, email: 'project-no-permission@example.test', name: 'Project No Permission' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'project-admin-b@example.test', name: 'Project Admin B' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({
    data: users.map((user) => ({ userId: user.id, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: CREATOR_ID, roleId: CREATOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: UPDATER_ID, roleId: UPDATER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: ACTIVATOR_ID, roleId: ACTIVATOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: CLOSER_ID, roleId: CLOSER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'PROJECT-CLIENT-001',
        legalName: 'Project Client Ltd',
        displayName: 'Project Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'PROJECT-CLIENT-B-001',
        legalName: 'Foreign Project Client Ltd',
        displayName: 'Foreign Project Client',
        billingAddress: 'Karachi, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      }
    ]
  });

  await client.tender.createMany({
    data: [
      {
        id: TENDER_ID,
        companyId: COMPANY_ID,
        clientId: CLIENT_ID,
        opportunityId: null,
        tenderNo: 'TENDER-PROJECT-001',
        title: 'Won Tender ready for Project conversion',
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        status: 'WON',
        ownerUserId: ADMIN_ID,
        currency: 'USD'
      },
      {
        id: TENDER_B_ID,
        companyId: COMPANY_B_ID,
        clientId: CLIENT_B_ID,
        opportunityId: null,
        tenderNo: 'TENDER-PROJECT-B-001',
        title: 'Foreign won Tender ready for Project conversion',
        dueDate: new Date('2026-09-30T00:00:00.000Z'),
        status: 'WON',
        ownerUserId: ADMIN_B_ID,
        currency: 'USD'
      }
    ]
  });
}

/** Build one fresh Fastify app over the disposable PostgreSQL integration database. */
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

/** Sign in through Module 24A and return the server-issued access token. */
async function signIn(app, email = 'project-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one Project through the public Stage-7 HTTP API. */
async function createProject(app, token, overrides = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/projects',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      projectCode: 'PRJ-001',
      name: 'Central Office Project',
      clientId: CLIENT_ID,
      tenderId: TENDER_ID,
      currency: 'usd',
      startDate: '2026-10-01',
      plannedEndDate: '2027-10-01',
      projectManagerUserId: ADMIN_ID,
      location: 'Lahore, Pakistan',
      ...overrides
    }
  });
  return response;
}

/** Return the stable public error code from one Fastify response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Verify one public error is stable and does not expose SQL, Prisma or runtime details. */
function assertSafePublicError(response, expectedStatus, expectedCode) {
  assert.equal(response.statusCode, expectedStatus, response.body);
  assert.equal(errorCode(response), expectedCode);

  const body = response.body.toLowerCase();
  for (const forbidden of ['prisma', 'p2002', 'postgresql', 'stack', 'select ', 'insert into ', 'update ']) {
    assert.equal(body.includes(forbidden), false, `public error leaked: ${forbidden}`);
  }
}

/** Run one direct repository/service assertion under trusted authenticated company context. */
async function runInCompanyContext(runtime, input, work) {
  contextCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-5-security-${contextCounter}`,
    correlationId: `module-5-security-${contextCounter}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: input.permissions,
    projectScope: { kind: 'not-resolved' }
  }, work);
}

test('Module 5 runs the complete Project master and lifecycle workflow with durable history, audit and outbox evidence', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await createProject(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const created = response.json().data;
    assert.equal(created.projectCode, 'PRJ-001');
    assert.equal(created.status, 'DRAFT');
    assert.equal(created.currency, 'USD');
    assert.equal(created.tenderId, TENDER_ID);
    assert.equal(created.companyId, undefined);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects?search=PRJ-001&clientId=${CLIENT_ID}&tenderId=${TENDER_ID}&status=DRAFT&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, created.id);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.project.id, created.id);
    assert.deepEqual(
      response.json().data.statusHistory.map((row) => [row.fromStatus, row.toStatus]),
      [[null, 'DRAFT']]
    );

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: 'Central Office Project - Updated',
        plannedEndDate: '2027-12-15',
        location: 'Lahore District, Pakistan'
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.name, 'Central Office Project - Updated');
    assert.equal(response.json().data.plannedEndDate, '2027-12-15');
    assert.equal(response.json().data.projectCode, 'PRJ-001');
    assert.equal(response.json().data.status, 'DRAFT');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/activate`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/activate`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/suspend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Temporary operational hold.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'SUSPENDED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/suspend`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Retry must not duplicate suspension evidence.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'SUSPENDED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/resume`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Operational hold cleared.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/resume`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Retry must not duplicate resume evidence.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/complete`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'COMPLETED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/complete`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'COMPLETED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'All Stage-7 close checks are clear.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CLOSED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${created.id}/close`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Retry must not duplicate side effects.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CLOSED');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Closed Project must stay controlled' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_PROJECT_STATUS_TRANSITION');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${created.id}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const detail = response.json().data;
    assert.equal(detail.project.status, 'CLOSED');
    assert.deepEqual(
      detail.statusHistory.map((row) => [row.fromStatus, row.toStatus]),
      [
        [null, 'DRAFT'],
        ['DRAFT', 'ACTIVE'],
        ['ACTIVE', 'SUSPENDED'],
        ['SUSPENDED', 'ACTIVE'],
        ['ACTIVE', 'COMPLETED'],
        ['COMPLETED', 'CLOSED']
      ]
    );
    assert.equal(detail.statusHistory[2].reason, 'Temporary operational hold.');
    assert.equal(detail.statusHistory[3].reason, 'Operational hold cleared.');
    assert.equal(detail.statusHistory[5].reason, 'All Stage-7 close checks are clear.');

    const storedProject = await client.project.findUnique({ where: { id: created.id } });
    assert.equal(storedProject.status, 'CLOSED');
    assert.equal(storedProject.projectCode, 'PRJ-001');
    assert.equal(storedProject.name, 'Central Office Project - Updated');

    const history = await client.projectStatusHistory.findMany({ where: { projectId: created.id } });
    assert.equal(history.length, 6);

    const audits = await client.auditLog.findMany({
      where: {
        companyId: COMPANY_ID,
        entityId: created.id,
        action: { in: ['project.created', 'project.updated', 'project.activated', 'project.suspended', 'project.resumed', 'project.completed', 'project.closed'] }
      },
      select: { action: true, actorUserId: true }
    });
    for (const action of ['project.created', 'project.updated', 'project.activated', 'project.suspended', 'project.resumed', 'project.completed', 'project.closed']) {
      assert.equal(audits.filter((row) => row.action === action).length, 1, action);
    }
    assert.equal(audits.every((row) => row.actorUserId === ADMIN_ID), true);

    const outbox = await client.outboxEvent.findMany({
      where: {
        companyId: COMPANY_ID,
        resourceId: created.id,
        eventType: { in: ['project.created', 'project.activated', 'project.completed', 'project.closed'] }
      },
      select: { eventType: true, actorUserId: true }
    });
    for (const eventType of ['project.created', 'project.activated', 'project.completed', 'project.closed']) {
      assert.equal(outbox.filter((row) => row.eventType === eventType).length, 1, eventType);
    }
    assert.equal(outbox.every((row) => row.actorUserId === ADMIN_ID), true);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: created.id, eventType: 'project.updated' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: created.id, eventType: 'project.suspended' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: created.id, eventType: 'project.resumed' } }), 0);
  });
});

test('Module 5 enforces the won-Tender one-primary-Project rule without partial second-Project state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await createProject(app, token, {
      projectCode: 'PRJ-TENDER-PRIMARY',
      name: 'Primary Tender Project'
    });
    assert.equal(response.statusCode, 201, response.body);
    const primaryProjectId = response.json().data.id;

    response = await createProject(app, token, {
      projectCode: 'PRJ-TENDER-DUPLICATE',
      name: 'Duplicate Tender Project'
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
    assert.equal(
      response.json().error.fieldErrors?.some((fieldError) => fieldError.field === 'tenderId'),
      true
    );

    assert.equal(await client.project.count({ where: { companyId: COMPANY_ID } }), 1);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: primaryProjectId } }), 1);
    assert.equal(await client.project.findFirst({ where: { projectCode: 'PRJ-TENDER-DUPLICATE' } }), null);
    assert.equal(await client.auditLog.count({ where: { action: 'project.created', entityType: 'project' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { eventType: 'project.created', resourceType: 'project' } }), 1);
  });
});

test('Module 5 security enforces authentication and the active Stage-7 permission matrix', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'project-reader@example.test');
    const creatorToken = await signIn(app, 'project-creator@example.test');
    const updaterToken = await signIn(app, 'project-updater@example.test');
    const activatorToken = await signIn(app, 'project-activator@example.test');
    const closerToken = await signIn(app, 'project-closer@example.test');
    const noPermissionToken = await signIn(app, 'project-no-permission@example.test');

    let response = await createProject(app, adminToken, {
      projectCode: 'PRJ-SECURITY-BASE',
      name: 'Security Base Project'
    });
    assert.equal(response.statusCode, 201, response.body);
    const projectId = response.json().data.id;

    const protectedRequests = [
      { method: 'GET', url: '/api/v1/projects?page=1&pageSize=10' },
      {
        method: 'POST',
        url: '/api/v1/projects',
        payload: {
          projectCode: 'AUTH-BLOCKED',
          name: 'Authentication blocked',
          clientId: CLIENT_ID,
          currency: 'USD',
          startDate: '2026-10-01',
          plannedEndDate: '2027-10-01',
          projectManagerUserId: ADMIN_ID,
          location: 'Lahore, Pakistan'
        }
      },
      { method: 'GET', url: `/api/v1/projects/${projectId}` },
      { method: 'PATCH', url: `/api/v1/projects/${projectId}`, payload: { name: 'Blocked update' } },
      { method: 'POST', url: `/api/v1/projects/${projectId}/activate`, payload: {} },
      { method: 'POST', url: `/api/v1/projects/${projectId}/suspend`, payload: { reason: 'Blocked suspend' } },
      { method: 'POST', url: `/api/v1/projects/${projectId}/resume`, payload: { reason: 'Blocked resume' } },
      { method: 'POST', url: `/api/v1/projects/${projectId}/complete`, payload: {} },
      { method: 'POST', url: `/api/v1/projects/${projectId}/close`, payload: { reason: 'Blocked close' } }
    ];

    for (const request of protectedRequests) {
      const unauthenticated = await app.inject(request);
      assertSafePublicError(unauthenticated, 401, 'AUTHENTICATION_REQUIRED');

      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${noPermissionToken}` }
      });
      assertSafePublicError(denied, 403, 'FORBIDDEN');
    }

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?page=1&pageSize=10',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await createProject(app, creatorToken, {
      projectCode: 'PRJ-CREATOR-PERMISSION',
      name: 'Creator-only Project',
      tenderId: undefined
    });
    assert.equal(response.statusCode, 201, response.body);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${updaterToken}` },
      payload: { location: 'Updated by projects.update' }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/activate`,
      headers: { authorization: `Bearer ${activatorToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/suspend`,
      headers: { authorization: `Bearer ${closerToken}` },
      payload: { reason: 'Suspended by projects.close authority.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'SUSPENDED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/resume`,
      headers: { authorization: `Bearer ${activatorToken}` },
      payload: { reason: 'Resumed by projects.activate authority.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/complete`,
      headers: { authorization: `Bearer ${closerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'COMPLETED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${projectId}/close`,
      headers: { authorization: `Bearer ${closerToken}` },
      payload: { reason: 'Closed by projects.close authority.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CLOSED');
  });
});

test('Module 5 security hides foreign-company Projects and rejects client-owned authority at HTTP, repository and service boundaries', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client, ProjectsRepository, ProjectsService } = runtime;
    const adminAToken = await signIn(app);
    const adminBToken = await signIn(app, 'project-admin-b@example.test');

    let response = await createProject(app, adminAToken, {
      projectCode: 'PRJ-COMPANY-A',
      name: 'Company A Project'
    });
    assert.equal(response.statusCode, 201, response.body);
    const projectA = response.json().data;

    response = await createProject(app, adminBToken, {
      projectCode: 'PRJ-COMPANY-B',
      name: 'Company B Project',
      clientId: CLIENT_B_ID,
      tenderId: TENDER_B_ID,
      projectManagerUserId: ADMIN_B_ID,
      location: 'Karachi, Pakistan'
    });
    assert.equal(response.statusCode, 201, response.body);
    const projectB = response.json().data;

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((row) => row.id === projectB.id), false);

    const foreignProjectRequests = [
      { method: 'GET', url: `/api/v1/projects/${projectB.id}` },
      { method: 'PATCH', url: `/api/v1/projects/${projectB.id}`, payload: { name: 'Foreign update blocked' } },
      { method: 'POST', url: `/api/v1/projects/${projectB.id}/activate`, payload: {} },
      { method: 'POST', url: `/api/v1/projects/${projectB.id}/suspend`, payload: { reason: 'Foreign suspend blocked' } },
      { method: 'POST', url: `/api/v1/projects/${projectB.id}/resume`, payload: { reason: 'Foreign resume blocked' } },
      { method: 'POST', url: `/api/v1/projects/${projectB.id}/complete`, payload: {} },
      { method: 'POST', url: `/api/v1/projects/${projectB.id}/close`, payload: { reason: 'Foreign close blocked' } }
    ];

    for (const request of foreignProjectRequests) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${adminAToken}` }
      });
      assertSafePublicError(denied, 404, 'PROJECT_NOT_FOUND');
    }

    for (const foreignInput of [
      { projectCode: 'PRJ-FOREIGN-CLIENT', clientId: CLIENT_B_ID, tenderId: undefined },
      { projectCode: 'PRJ-FOREIGN-TENDER', tenderId: TENDER_B_ID },
      { projectCode: 'PRJ-FOREIGN-MANAGER', projectManagerUserId: ADMIN_B_ID, tenderId: undefined }
    ]) {
      const denied = await createProject(app, adminAToken, foreignInput);
      assertSafePublicError(denied, 400, 'INVALID_REQUEST');
    }

    const authorityRequests = [
      {
        method: 'POST',
        url: '/api/v1/projects',
        payload: {
          projectCode: 'PRJ-UNTRUSTED-AUTHORITY',
          name: 'Untrusted Project authority',
          clientId: CLIENT_ID,
          currency: 'USD',
          startDate: '2026-10-01',
          plannedEndDate: '2027-10-01',
          projectManagerUserId: ADMIN_ID,
          location: 'Lahore, Pakistan',
          companyId: COMPANY_B_ID,
          actorUserId: ADMIN_B_ID,
          permissions: ['projects.close'],
          projectScope: { kind: 'all' },
          status: 'CLOSED'
        }
      },
      {
        method: 'PATCH',
        url: `/api/v1/projects/${projectA.id}`,
        payload: {
          name: 'Untrusted PATCH authority',
          companyId: COMPANY_B_ID,
          status: 'CLOSED',
          changedBy: ADMIN_B_ID,
          statusHistory: []
        }
      },
      {
        method: 'POST',
        url: `/api/v1/projects/${projectA.id}/activate`,
        payload: { status: 'ACTIVE', actorUserId: ADMIN_B_ID }
      },
      {
        method: 'POST',
        url: `/api/v1/projects/${projectA.id}/suspend`,
        payload: { reason: 'Valid reason', status: 'SUSPENDED' }
      },
      {
        method: 'POST',
        url: `/api/v1/projects/${projectA.id}/resume`,
        payload: { reason: 'Valid reason', changedBy: ADMIN_B_ID }
      },
      {
        method: 'POST',
        url: `/api/v1/projects/${projectA.id}/complete`,
        payload: { status: 'COMPLETED' }
      },
      {
        method: 'POST',
        url: `/api/v1/projects/${projectA.id}/close`,
        payload: { reason: 'Valid reason', changedBy: ADMIN_B_ID, status: 'CLOSED' }
      }
    ];

    for (const request of authorityRequests) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${adminAToken}` }
      });
      assertSafePublicError(denied, 400, 'INVALID_REQUEST');
    }

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects?companyId=${COMPANY_B_ID}`,
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects?pageSize=101',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    await runInCompanyContext(runtime, {
      actorUserId: ADMIN_ID,
      companyId: COMPANY_ID,
      permissions: MODULE_5_PERMISSIONS
    }, async () => {
      const repository = new ProjectsRepository(client);
      assert.equal(await repository.findProjectById(projectB.id), null);
      assert.equal((await repository.listProjects({ skip: 0, take: 100 })).items.some((row) => row.id === projectB.id), false);

      const service = new ProjectsService(client);
      await assert.rejects(
        service.getProject(projectB.id),
        (error) => error?.code === 'PROJECT_NOT_FOUND'
      );
      await assert.rejects(
        service.createProject({
          projectCode: 'PRJ-DIRECT-FOREIGN',
          name: 'Direct foreign Client Project',
          clientId: CLIENT_B_ID,
          currency: 'USD',
          startDate: '2026-10-01',
          plannedEndDate: '2027-10-01',
          projectManagerUserId: ADMIN_ID,
          location: 'Lahore, Pakistan'
        }),
        (error) => error?.code === 'INVALID_REQUEST'
      );
    });

    await runInCompanyContext(runtime, {
      actorUserId: READER_ID,
      companyId: COMPANY_ID,
      permissions: ['projects.read']
    }, async () => {
      await assert.rejects(
        new ProjectsService(client).createProject({
          projectCode: 'PRJ-DIRECT-FORBIDDEN',
          name: 'Direct forbidden Project',
          clientId: CLIENT_ID,
          currency: 'USD',
          startDate: '2026-10-01',
          plannedEndDate: '2027-10-01',
          projectManagerUserId: ADMIN_ID,
          location: 'Lahore, Pakistan'
        }),
        (error) => error?.statusCode === 403
      );
    });
  });
});

test('Module 5 security attacks the live Stage-7 database constraints and reviewed indexes directly', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const projectA = await client.project.create({
      data: {
        id: '00000000-0000-4000-8000-000000005200',
        companyId: COMPANY_ID,
        projectCode: 'DB-PRJ-A',
        name: 'Database Project A',
        clientId: CLIENT_ID,
        tenderId: TENDER_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    });

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-FOREIGN-CLIENT',
        name: 'Foreign Client must fail',
        clientId: CLIENT_B_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-FOREIGN-TENDER',
        name: 'Foreign Tender must fail',
        clientId: CLIENT_ID,
        tenderId: TENDER_B_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-FOREIGN-MANAGER',
        name: 'Foreign manager must fail',
        clientId: CLIENT_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_B_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: projectA.projectCode,
        name: 'Duplicate code must fail',
        clientId: CLIENT_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-BAD-CURRENCY',
        name: 'Lowercase currency must fail',
        clientId: CLIENT_ID,
        status: 'DRAFT',
        currency: 'usd',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-BAD-DATES',
        name: 'Invalid dates must fail',
        clientId: CLIENT_ID,
        status: 'DRAFT',
        currency: 'USD',
        startDate: new Date('2027-10-02T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.project.create({
      data: {
        companyId: COMPANY_ID,
        projectCode: 'DB-BAD-STATUS',
        name: 'Invalid status must fail',
        clientId: CLIENT_ID,
        status: 'BROKEN',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-10-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }
    }));

    await assert.rejects(client.projectStatusHistory.create({
      data: {
        projectId: projectA.id,
        fromStatus: 'DRAFT',
        toStatus: 'DRAFT',
        changedBy: ADMIN_ID,
        reason: 'Same-status history must fail'
      }
    }));

    await assert.rejects(client.projectStatusHistory.create({
      data: {
        projectId: projectA.id,
        fromStatus: 'DRAFT',
        toStatus: 'BROKEN',
        changedBy: ADMIN_ID,
        reason: 'Unknown target status must fail'
      }
    }));

    await assert.rejects(client.projectStatusHistory.create({
      data: {
        projectId: projectA.id,
        fromStatus: 'DRAFT',
        toStatus: 'ACTIVE',
        changedBy: '00000000-0000-4000-8000-000000005999',
        reason: 'Unknown actor must fail'
      }
    }));

    const indexRows = await client.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('projects', 'project_status_history')
    `;
    const indexes = new Set(indexRows.map((row) => row.indexname));
    for (const indexName of [
      'projects_company_project_code_uq',
      'projects_id_company_uq',
      'projects_company_status_planned_end_idx',
      'projects_company_client_status_idx',
      'projects_company_tender_idx',
      'projects_company_manager_status_idx',
      'project_status_history_project_changed_idx',
      'project_status_history_changed_by_changed_idx'
    ]) assert.equal(indexes.has(indexName), true, indexName);

    const constraintRows = await client.$queryRaw<Array<{ conname: string }>>`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid IN ('projects'::regclass, 'project_status_history'::regclass)
    `;
    const constraints = new Set(constraintRows.map((row) => row.conname));
    for (const constraintName of [
      'projects_currency_format',
      'projects_dates_valid',
      'projects_status_allowed',
      'projects_company_id_fkey',
      'projects_client_company_fkey',
      'projects_tender_company_fkey',
      'projects_manager_company_fkey',
      'project_status_history_status_changed',
      'project_status_history_project_id_fkey',
      'project_status_history_changed_by_fkey'
    ]) assert.equal(constraints.has(constraintName), true, constraintName);
  });
});

/** Return one generated Project OpenAPI operation and fail clearly when it is missing. */
function projectOpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Read the documented stable error-code enum for one generated Project response. */
function projectOpenApiErrorCodes(operation, statusCode) {
  const schema = operation.responses?.[String(statusCode)]?.content?.['application/json']?.schema;
  assert.ok(schema, `Missing OpenAPI ${statusCode} response schema`);
  assert.deepEqual(schema.required, ['error']);
  assert.equal(Object.hasOwn(schema.properties ?? {}, 'requestId'), false);
  const errorSchema = schema.properties?.error;
  assert.ok(errorSchema);
  assert.deepEqual(errorSchema.required, ['code', 'message', 'requestId']);
  return errorSchema.properties?.code?.enum ?? [];
}

test('Module 5 API contract preserves seven source operations plus the two Pass-366 lifecycle repair operations', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();

    assert.equal(document.openapi, '3.0.3');
    assert.equal(document.info?.version, '0.38.0');
    assert.deepEqual(document.components?.securitySchemes?.bearerAuth, {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'opaque-access-token'
    });

    const expectedOperations = [
      ['GET', '/api/v1/projects', 'module5ListProjects'],
      ['POST', '/api/v1/projects', 'module5CreateProject'],
      ['GET', '/api/v1/projects/{id}', 'module5GetProject'],
      ['PATCH', '/api/v1/projects/{id}', 'module5UpdateProject'],
      ['POST', '/api/v1/projects/{id}/activate', 'module5ActivateProject'],
      ['POST', '/api/v1/projects/{id}/suspend', 'module5SuspendProject'],
      ['POST', '/api/v1/projects/{id}/resume', 'module5ResumeProject'],
      ['POST', '/api/v1/projects/{id}/complete', 'module5CompleteProject'],
      ['POST', '/api/v1/projects/{id}/close', 'module5CloseProject']
    ];
    const actualOperations = [];

    for (const [method, route, operationId] of expectedOperations) {
      const operation = projectOpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actualOperations.push(`${method} ${route}`);
    }

    const documentedProjectOperations = [];
    const documentedModule5Operations = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      if (!route.startsWith('/api/v1/projects')) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem[method];
        if (!operation) continue;
        const operationKey = `${method.toUpperCase()} ${route}`;
        documentedProjectOperations.push(operationKey);
        if (operation.operationId?.startsWith('module5')) documentedModule5Operations.push(operationKey);
      }
    }
    assert.deepEqual(documentedModule5Operations.sort(), actualOperations.sort());
    assert.equal(documentedProjectOperations.includes('PUT /api/v1/projects/{id}/members'), true);
    for (const forbiddenPart of ['/reopen', '/status']) {
      assert.equal(documentedProjectOperations.some((route) => route.includes(forbiddenPart)), false, forbiddenPart);
    }
    assert.equal(documentedProjectOperations.some((route) => route.startsWith('DELETE ')), false);

    const create = projectOpenApiOperation(document, '/api/v1/projects', 'POST');
    const createBody = create.requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    assert.deepEqual(createBody.required, [
      'projectCode', 'name', 'clientId', 'currency', 'startDate',
      'plannedEndDate', 'projectManagerUserId', 'location'
    ]);
    assert.deepEqual(Object.keys(createBody.properties).sort(), [
      'clientId', 'currency', 'location', 'name', 'plannedEndDate',
      'projectCode', 'projectManagerUserId', 'startDate', 'tenderId'
    ]);

    const update = projectOpenApiOperation(document, '/api/v1/projects/{id}', 'PATCH');
    const updateBody = update.requestBody.content['application/json'].schema;
    assert.equal(updateBody.additionalProperties, false);
    assert.equal(updateBody.minProperties, 1);
    assert.deepEqual(Object.keys(updateBody.properties).sort(), [
      'clientId', 'currency', 'location', 'name', 'plannedEndDate',
      'projectManagerUserId', 'startDate', 'tenderId'
    ]);

    for (const forbiddenField of [
      'companyId', 'actorUserId', 'permissions', 'projectScope', 'status',
      'statusHistory', 'changedBy', 'createdAt', 'updatedAt'
    ]) {
      assert.equal(Object.hasOwn(createBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(updateBody.properties, forbiddenField), false, forbiddenField);
    }
    assert.equal(Object.hasOwn(updateBody.properties, 'projectCode'), false);

    const activate = projectOpenApiOperation(document, '/api/v1/projects/{id}/activate', 'POST');
    const suspend = projectOpenApiOperation(document, '/api/v1/projects/{id}/suspend', 'POST');
    const resume = projectOpenApiOperation(document, '/api/v1/projects/{id}/resume', 'POST');
    const complete = projectOpenApiOperation(document, '/api/v1/projects/{id}/complete', 'POST');
    assert.equal(activate.requestBody, undefined);
    assert.equal(complete.requestBody, undefined);
    for (const operation of [suspend, resume]) {
      const body = operation.requestBody.content['application/json'].schema;
      assert.equal(body.additionalProperties, false);
      assert.deepEqual(Object.keys(body.properties), ['reason']);
    }

    const close = projectOpenApiOperation(document, '/api/v1/projects/{id}/close', 'POST');
    const closeBody = close.requestBody.content['application/json'].schema;
    assert.equal(closeBody.additionalProperties, false);
    assert.deepEqual(Object.keys(closeBody.properties), ['reason']);

    assert.deepEqual(projectOpenApiErrorCodes(create, 400), ['INVALID_REQUEST']);
    assert.deepEqual(projectOpenApiErrorCodes(create, 401), ['AUTHENTICATION_REQUIRED']);
    assert.deepEqual(projectOpenApiErrorCodes(create, 403), ['FORBIDDEN']);
    assert.deepEqual(projectOpenApiErrorCodes(create, 409), ['DUPLICATE_PROJECT_CODE']);

    const detail = projectOpenApiOperation(document, '/api/v1/projects/{id}', 'GET');
    assert.deepEqual(projectOpenApiErrorCodes(detail, 404), ['PROJECT_NOT_FOUND']);
    assert.deepEqual(projectOpenApiErrorCodes(update, 409), ['INVALID_PROJECT_STATUS_TRANSITION']);
    assert.deepEqual(projectOpenApiErrorCodes(activate, 409), ['INVALID_PROJECT_STATUS_TRANSITION']);
    assert.deepEqual(projectOpenApiErrorCodes(suspend, 409), ['INVALID_PROJECT_STATUS_TRANSITION']);
    assert.deepEqual(projectOpenApiErrorCodes(resume, 409), ['INVALID_PROJECT_STATUS_TRANSITION']);
    assert.deepEqual(projectOpenApiErrorCodes(complete, 409), ['INVALID_PROJECT_STATUS_TRANSITION']);
    assert.deepEqual(projectOpenApiErrorCodes(close, 409), [
      'PROJECT_NOT_READY_TO_CLOSE',
      'INVALID_PROJECT_STATUS_TRANSITION'
    ]);

    const createSuccess = create.responses['201'].content['application/json'].schema;
    assert.deepEqual(createSuccess.required, ['data']);
    assert.equal(createSuccess.properties.data.additionalProperties, false);
    assert.equal(Object.hasOwn(createSuccess.properties.data.properties, 'companyId'), false);

    const detailSuccess = detail.responses['200'].content['application/json'].schema;
    assert.deepEqual(detailSuccess.required, ['data']);
    assert.deepEqual(detailSuccess.properties.data.required, ['project', 'statusHistory']);
    assert.equal(Object.hasOwn(detailSuccess.properties.data.properties.project.properties, 'companyId'), false);

    assert.deepEqual(projectOpenApiErrorCodes(create, 403), ['FORBIDDEN']);
    for (const operation of [
      projectOpenApiOperation(document, '/api/v1/projects', 'GET'),
      detail,
      update,
      activate,
      complete,
      close
    ]) {
      assert.deepEqual(projectOpenApiErrorCodes(operation, 403), ['FORBIDDEN', 'PROJECT_SCOPE_FORBIDDEN']);
    }
  });
});

// Verify concurrent Project creation and lifecycle retries leave one complete durable result per business transition.
test('Module 5 operational concurrency serializes Project creation and lifecycle retries', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const duplicateCodePayload = {
      projectCode: 'OPS-DUPLICATE-001',
      name: 'Concurrent duplicate code Project',
      clientId: CLIENT_ID,
      currency: 'USD',
      startDate: '2026-10-01',
      plannedEndDate: '2027-10-01',
      projectManagerUserId: ADMIN_ID,
      location: 'Lahore, Pakistan'
    };
    const duplicateCodeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: duplicateCodePayload
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/projects',
        headers: { authorization: `Bearer ${token}` },
        payload: duplicateCodePayload
      })
    ]);

    assert.deepEqual(duplicateCodeResponses.map((response) => response.statusCode).sort(), [201, 409]);
    const duplicateCodeWinner = duplicateCodeResponses.find((response) => response.statusCode === 201);
    const duplicateCodeLoser = duplicateCodeResponses.find((response) => response.statusCode === 409);
    assert.ok(duplicateCodeWinner);
    assert.ok(duplicateCodeLoser);
    assert.equal(errorCode(duplicateCodeLoser), 'DUPLICATE_PROJECT_CODE');
    const duplicateCodeProject = duplicateCodeWinner.json().data;
    assert.equal(await client.project.count({ where: { companyId: COMPANY_ID, projectCode: 'OPS-DUPLICATE-001' } }), 1);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: duplicateCodeProject.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: duplicateCodeProject.id, action: 'project.created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: duplicateCodeProject.id, eventType: 'project.created' } }), 1);

    const tenderResponses = await Promise.all([
      createProject(app, token, { projectCode: 'OPS-TENDER-A', name: 'Concurrent Tender Project A' }),
      createProject(app, token, { projectCode: 'OPS-TENDER-B', name: 'Concurrent Tender Project B' })
    ]);
    assert.deepEqual(tenderResponses.map((response) => response.statusCode).sort(), [201, 400]);
    const tenderWinner = tenderResponses.find((response) => response.statusCode === 201);
    const tenderLoser = tenderResponses.find((response) => response.statusCode === 400);
    assert.ok(tenderWinner);
    assert.ok(tenderLoser);
    assert.equal(errorCode(tenderLoser), 'INVALID_REQUEST');
    const project = tenderWinner.json().data;
    assert.equal(await client.project.count({ where: { companyId: COMPANY_ID, tenderId: TENDER_ID } }), 1);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.created' } }), 1);

    const activationResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/activate`,
        headers: { authorization: `Bearer ${token}` }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/activate`,
        headers: { authorization: `Bearer ${token}` }
      })
    ]);
    assert.deepEqual(activationResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id, fromStatus: 'DRAFT', toStatus: 'ACTIVE' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.activated' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.activated' } }), 1);

    const suspensionResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/suspend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent operational hold' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/suspend`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent operational hold' }
      })
    ]);
    assert.deepEqual(suspensionResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id, fromStatus: 'ACTIVE', toStatus: 'SUSPENDED' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.suspended' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.suspended' } }), 0);

    const resumeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/resume`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent hold cleared' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/resume`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent hold cleared' }
      })
    ]);
    assert.deepEqual(resumeResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id, fromStatus: 'SUSPENDED', toStatus: 'ACTIVE' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.resumed' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.resumed' } }), 0);

    const completionResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/complete`,
        headers: { authorization: `Bearer ${token}` }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/complete`,
        headers: { authorization: `Bearer ${token}` }
      })
    ]);
    assert.deepEqual(completionResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id, fromStatus: 'ACTIVE', toStatus: 'COMPLETED' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.completed' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.completed' } }), 1);

    const closeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/close`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Operational concurrency close' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${project.id}/close`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Operational concurrency close' }
      })
    ]);
    assert.deepEqual(closeResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id, fromStatus: 'COMPLETED', toStatus: 'CLOSED' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: project.id, action: 'project.closed' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: project.id, eventType: 'project.closed' } }), 1);
    assert.equal(await client.projectStatusHistory.count({ where: { projectId: project.id } }), 6);

    const persisted = await client.project.findUniqueOrThrow({ where: { id: project.id } });
    assert.equal(persisted.status, 'CLOSED');
  });
});

// Verify reviewed PostgreSQL indexes support bounded Project register and lifecycle-history reads without timing thresholds.
test('Module 5 operational query plans use reviewed indexes for Project and lifecycle-history reads', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await client.project.createMany({
      data: Array.from({ length: 2400 }, (_, index) => ({
        companyId: COMPANY_ID,
        projectCode: `OPS-PERF-${String(index).padStart(5, '0')}`,
        name: `Operational Project ${index}`,
        clientId: CLIENT_ID,
        tenderId: null,
        status: index % 2 === 0 ? 'ACTIVE' : 'DRAFT',
        currency: 'USD',
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        plannedEndDate: new Date(Date.UTC(2027, 0, 1 + (index % 300))),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      }))
    });
    await client.$executeRawUnsafe('ANALYZE projects');

    const projectPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, project_code, planned_end_date
      FROM projects
      WHERE company_id = '${COMPANY_ID}'::uuid
        AND status = 'ACTIVE'
      ORDER BY planned_end_date ASC
      LIMIT 50
    `);
    const projectPlan = JSON.stringify(projectPlanRows);
    assert.match(projectPlan, /projects_company_status_planned_end_idx/);
    assert.match(projectPlan, /Execution Time/);

    const project = await client.project.findFirstOrThrow({
      where: { companyId: COMPANY_ID, projectCode: 'OPS-PERF-00000' }
    });
    await client.projectStatusHistory.createMany({
      data: Array.from({ length: 600 }, (_, index) => ({
        projectId: project.id,
        fromStatus: index % 2 === 0 ? 'DRAFT' : 'ACTIVE',
        toStatus: index % 2 === 0 ? 'ACTIVE' : 'COMPLETED',
        changedBy: ADMIN_ID,
        reason: `Operational history ${index + 1}`,
        changedAt: new Date(Date.UTC(2026, 0, 1, 0, index))
      }))
    });
    await client.$executeRawUnsafe('ANALYZE project_status_history');

    const historyPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, to_status, changed_at
      FROM project_status_history
      WHERE project_id = '${project.id}'::uuid
      ORDER BY changed_at DESC
      LIMIT 50
    `);
    const historyPlan = JSON.stringify(historyPlanRows);
    assert.match(historyPlan, /project_status_history_project_changed_idx/);
    assert.match(historyPlan, /Execution Time/);
  });
});

