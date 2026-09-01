import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';
const auditGuard = live && process.env.RUN_MODULE_24A_AUDIT_GUARD === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000000100';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000000200';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000000110';
const READER_A_ID = '00000000-0000-4000-8000-000000000111';
const TARGET_A_ID = '00000000-0000-4000-8000-000000000112';
const TARGET_B_ID = '00000000-0000-4000-8000-000000000210';
const ADMIN_ROLE_A_ID = '00000000-0000-4000-8000-000000000120';
const READER_ROLE_A_ID = '00000000-0000-4000-8000-000000000121';
const PASSWORD = 'Pass33-test-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const ALL_PERMISSIONS = [
  'users.read',
  'users.create',
  'users.update',
  'users.manage',
  'roles.read',
  'roles.manage',
  'sessions.manage'
];

/** Load built runtime packages only when the live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword, createAuthActionToken } = await import('../../apps/api/dist/plugins/authentication.js');
  const { createAdministrationBootstrapIdentityProvisioner } = await import('../../apps/api/dist/modules/administration/administration.service.js');
  const { bootstrapInitialInstallation } = await import('@construction-erp/bootstrap');
  return { testing, buildApp, hashPassword, createAuthActionToken, createAdministrationBootstrapIdentityProvisioner, bootstrapInitialInstallation };
}

/** Seed two companies and the minimum users/roles needed by the API security tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_A_ID,
        legalName: 'Pass 33 Company A Ltd',
        displayName: 'Pass 33 Company A',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Pass 33 Company B Ltd',
        displayName: 'Pass 33 Company B',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of ALL_PERMISSIONS) {
    permissions.push(await client.permission.create({
      data: { code, name: code, domain: code.split('.')[0] }
    }));
  }

  await client.role.createMany({
    data: [
      {
        id: ADMIN_ROLE_A_ID,
        companyId: COMPANY_A_ID,
        code: 'company-admin',
        name: 'Company Admin',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_A_ID,
        companyId: COMPANY_A_ID,
        code: 'user-reader',
        name: 'User Reader',
        isSystem: false,
        status: 'ACTIVE'
      }
    ]
  });

  await client.rolePermission.createMany({
    data: permissions.map((permission) => ({
      roleId: ADMIN_ROLE_A_ID,
      permissionId: permission.id
    }))
  });
  const readPermission = permissions.find((permission) => permission.code === 'users.read');
  assert.ok(readPermission);
  await client.rolePermission.create({
    data: { roleId: READER_ROLE_A_ID, permissionId: readPermission.id }
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'admin-a@example.test', name: 'Admin A', status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'reader-a@example.test', name: 'Reader A', status: 'ACTIVE' },
      { id: TARGET_A_ID, companyId: COMPANY_A_ID, email: 'target-a@example.test', name: 'Target A', status: 'ACTIVE' },
      { id: TARGET_B_ID, companyId: COMPANY_B_ID, email: 'target-b@example.test', name: 'Target B', status: 'ACTIVE' }
    ]
  });

  await client.authCredential.createMany({
    data: [ADMIN_A_ID, READER_A_ID, TARGET_A_ID].map((userId) => ({ userId, passwordHash }))
  });
  await client.userRoleAssignment.createMany({
    data: [
      {
        companyId: COMPANY_A_ID,
        userId: ADMIN_A_ID,
        roleId: ADMIN_ROLE_A_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_A_ID,
        userId: READER_A_ID,
        roleId: READER_ROLE_A_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });
}

/** Build a fresh real Fastify app against the disposable database for one test. */
async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  let app;

  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);
    app = buildApp({
      database: client,
      nodeEnv: 'test',
      logLevel: 'silent',
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET
    });
    await app.ready();
    await work({ app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in through the public HTTP route and return both session credentials. */
async function signInSession(app, email) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Sign in and return only the short-lived Bearer access credential. */
async function signIn(app, email) {
  return (await signInSession(app, email)).accessToken;
}

// Exercise the 13 core approved endpoints through Fastify.inject using the real service/repository stack.
test('Module 24A approved route flow works end to end', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let adminSession = await signInSession(app, 'admin-a@example.test');
    let adminToken = adminSession.accessToken;

    let response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.projectScope.kind, 'not-resolved');

    response = await app.inject({ method: 'GET', url: '/api/v1/users', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'created@example.test', name: 'Created User' }
    });
    assert.equal(response.statusCode, 201, response.body);
    const createdUserId = response.json().data.id;

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${createdUserId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Updated User' }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({ method: 'POST', url: `/api/v1/users/${createdUserId}/activate`, headers: { authorization: `Bearer ${adminToken}` }, payload: {} });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({ method: 'GET', url: '/api/v1/roles', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/roles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { code: 'site-reader', name: 'Site Reader' }
    });
    assert.equal(response.statusCode, 201, response.body);
    const roleId = response.json().data.id;

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/roles/${roleId}/permissions`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { permissionCodes: ['users.read'] }
    });
    assert.equal(response.statusCode, 200, response.body);

    // Pass 35 needs the role list to return the current permission set for the editor.
    response = await app.inject({ method: 'GET', url: '/api/v1/roles?pageSize=100', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.find((role) => role.id === roleId)?.permissionCodes, ['users.read']);

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/users/${createdUserId}/roles`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { assignments: [{ roleId }] }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data[0].scopeType, 'COMPANY');
    assert.equal(response.json().data[0].scopeId, null);

    // Pass 35 needs the user list to return current company-role IDs for safe replacement editing.
    response = await app.inject({ method: 'GET', url: '/api/v1/users?pageSize=100', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.find((user) => user.id === createdUserId)?.roleIds, [roleId]);

    response = await app.inject({ method: 'POST', url: `/api/v1/users/${createdUserId}/deactivate`, headers: { authorization: `Bearer ${adminToken}` }, payload: {} });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: adminSession.refreshToken } });
    assert.equal(response.statusCode, 200, response.body);
    adminSession = response.json().data;
    adminToken = adminSession.accessToken;

    response = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-out', headers: { authorization: `Bearer ${adminToken}` }, payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.revoked, true);
  });
});

// Verify protected endpoints reject missing sessions and service permissions remain authoritative.
test('authentication and permission failures use stable safe errors', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/users' });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, 'AUTH_SESSION_EXPIRED');

    response = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email: 'admin-a@example.test', password: 'wrong-password' } });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, 'AUTH_INVALID_CREDENTIALS');

    const readerToken = await signIn(app, 'reader-a@example.test');
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { email: 'forbidden@example.test', name: 'Forbidden User' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'FORBIDDEN');
  });
});

// Prove Company A cannot read/update Company B records and cannot spoof tenant authority by header.
test('cross-company API access is isolated and client company headers are ignored', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'admin-a@example.test');

    let response = await app.inject({ method: 'GET', url: '/api/v1/users?pageSize=100', headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    const ids = response.json().data.items.map((item) => item.id);
    assert.ok(ids.includes(ADMIN_A_ID));
    assert.ok(!ids.includes(TARGET_B_ID));

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/users/${TARGET_B_ID}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Should Not Change' }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'USER_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}`, 'x-company-id': COMPANY_B_ID },
      payload: { email: 'header-spoof@example.test', name: 'Header Spoof' }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.companyId, COMPANY_A_ID);
    assert.equal(await client.user.count({ where: { companyId: COMPANY_B_ID, email: 'header-spoof@example.test' } }), 0);
  });
});

// Prove project membership is still a hard Stage-1 rejection until Module 24B.
test('project-scoped role assignment is rejected during Module 24A', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'admin-a@example.test');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/users/${TARGET_A_ID}/roles`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        assignments: [{
          roleId: ADMIN_ROLE_A_ID,
          scopeType: 'PROJECT',
          scopeId: '00000000-0000-4000-8000-000000000999'
        }]
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, 'INVALID_SCOPE_ASSIGNMENT');
  });
});

// Prove user deactivation revokes previously valid sessions immediately.
test('deactivating a user invalidates that user session', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'admin-a@example.test');
    const targetToken = await signIn(app, 'target-a@example.test');

    let response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${targetToken}` } });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({ method: 'POST', url: `/api/v1/users/${TARGET_A_ID}/deactivate`, headers: { authorization: `Bearer ${adminToken}` }, payload: {} });
    assert.equal(response.statusCode, 200, response.body);
    assert.ok(response.json().data.revokedSessionCount >= 1);

    response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${targetToken}` } });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, 'AUTH_SESSION_EXPIRED');
  });
});

// Prove refresh rotation invalidates the previous token and preserves the replacement token.
test('refresh rotates access and refresh credentials and rejects old credentials', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const oldSession = await signInSession(app, 'admin-a@example.test');
    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldSession.refreshToken }
    });
    assert.equal(response.statusCode, 200, response.body);
    const newSession = response.json().data;
    assert.notEqual(newSession.accessToken, oldSession.accessToken);
    assert.notEqual(newSession.refreshToken, oldSession.refreshToken);

    response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${oldSession.accessToken}` } });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken: oldSession.refreshToken } });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({ method: 'GET', url: '/api/v1/auth/me', headers: { authorization: `Bearer ${newSession.accessToken}` } });
    assert.equal(response.statusCode, 200, response.body);
  });
});




/** Build a signed action token from server state for the completion API integration test. */
async function actionTokenForUser(client, email, purpose) {
  const { createAuthActionToken } = await loadRuntime();
  const user = await client.user.findFirst({ where: { email } });
  assert.ok(user?.authActionNonce);
  assert.equal(user.authActionPurpose, purpose);
  assert.ok(user.authActionExpiresAt);

  return createAuthActionToken({
    userId: user.id,
    purpose,
    nonce: user.authActionNonce,
    expiresAt: user.authActionExpiresAt
  }, AUTH_ACTION_TOKEN_SECRET);
}

// Pass 40 verifies that users can onboard and recover credentials through product APIs only.
test('Module 24A invitation and password recovery work without direct credential writes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'admin-a@example.test');
    const invitePassword = 'Pass40-invited-password!';
    const resetPassword = 'Pass40-reset-password!';

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { email: 'pass40-invited@example.test', name: 'Pass 40 Invited User' }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.status, 'INACTIVE');

    const invitedUser = await client.user.findFirst({ where: { email: 'pass40-invited@example.test' } });
    const invitationJobs = await client.queueJob.findMany({
      where: { queueName: 'auth-notifications', jobType: 'auth.invitation' },
      orderBy: { createdAt: 'desc' }
    });
    const invitationJob = invitationJobs.find((job) => job.payload?.userId === invitedUser?.id);
    assert.ok(invitationJob);
    assert.equal(invitationJob.payload.actionNonce, invitedUser?.authActionNonce);

    const invitationToken = await actionTokenForUser(
      client,
      'pass40-invited@example.test',
      'INVITATION'
    );
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/invitations/accept',
      payload: { token: invitationToken, password: invitePassword }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.completed, true);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'pass40-invited@example.test', password: invitePassword }
    });
    assert.equal(response.statusCode, 200, response.body);
    const firstAccessToken = response.json().data.accessToken;

    const resetJobsBeforeMissingUser = await client.queueJob.count({
      where: { queueName: 'auth-notifications', jobType: 'auth.password-reset' }
    });
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'missing-user@example.test' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.accepted, true);
    assert.equal(await client.queueJob.count({
      where: { queueName: 'auth-notifications', jobType: 'auth.password-reset' }
    }), resetJobsBeforeMissingUser);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { email: 'pass40-invited@example.test' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.accepted, true);

    const resetUser = await client.user.findFirst({ where: { email: 'pass40-invited@example.test' } });
    const resetJobs = await client.queueJob.findMany({
      where: { queueName: 'auth-notifications', jobType: 'auth.password-reset' },
      orderBy: { createdAt: 'desc' }
    });
    const resetJob = resetJobs.find((job) => job.payload?.userId === resetUser?.id);
    assert.ok(resetJob);
    assert.equal(resetJob.actorUserId, null);
    assert.equal(resetJob.payload.actionNonce, resetUser?.authActionNonce);

    const passwordResetToken = await actionTokenForUser(
      client,
      'pass40-invited@example.test',
      'PASSWORD_RESET'
    );
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/complete',
      payload: { token: passwordResetToken, password: resetPassword }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.completed, true);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${firstAccessToken}` }
    });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'pass40-invited@example.test', password: invitePassword }
    });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'pass40-invited@example.test', password: resetPassword }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/complete',
      payload: { token: passwordResetToken, password: resetPassword }
    });
    assert.equal(response.statusCode, 401, response.body);
  });
});

// Pass 37 audit guards are intentionally opt-in. They describe the security and onboarding behavior
// that later repair passes must make green without changing current business code in this pass.

/** Create an empty disposable database client for bootstrap-focused audit checks. */
async function withEmptyDatabase(work) {
  const { testing, ...runtime } = await loadRuntime();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);

  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await work({ client, ...runtime });
  } finally {
    await client.$disconnect();
  }
}

// Pass 38 guard: the real Foundation bootstrap must create a usable full-permission administrator.
test('Pass 37 audit guard: bootstrap administrator receives every Module 24A permission', { skip: !auditGuard }, async () => {
  await withEmptyDatabase(async ({
    client,
    bootstrapInitialInstallation,
    createAdministrationBootstrapIdentityProvisioner
  }) => {
    const result = await bootstrapInitialInstallation(
      client,
      {
        bootstrapKey: 'pass-37-audit-bootstrap',
        company: {
          legalName: 'Pass 37 Audit Company Ltd',
          displayName: 'Pass 37 Audit Company',
          status: 'ACTIVE',
          baseCurrency: 'USD',
          timeZone: 'UTC',
          locale: 'en-US',
          fiscalSettings: { fiscalYearStartMonth: 1 }
        },
        configuration: { environmentLabel: 'test' },
        numberSequences: [
          { sequenceKey: 'project' },
          { sequenceKey: 'purchase-order' },
          { sequenceKey: 'client-invoice' },
          { sequenceKey: 'client-receipt' },
          { sequenceKey: 'supplier-payment' }
        ],
        identity: {
          administrator: {
            email: 'pass37-bootstrap-admin@example.test',
            name: 'Pass 37 Bootstrap Administrator',
            roleCodes: ['system-admin']
          },
          systemRoles: [{ code: 'system-admin', name: 'System Administrator' }]
        }
      },
      createAdministrationBootstrapIdentityProvisioner(PASSWORD)
    );

    const roleId = result.systemRoleIdsByCode?.['system-admin'];
    assert.ok(roleId, 'bootstrap must return the system-admin role id');

    const rolePermissions = await client.rolePermission.findMany({
      where: { roleId },
      include: { permission: true }
    });
    const actualCodes = rolePermissions.map((item) => item.permission.code).sort();
    assert.deepEqual(actualCodes, [...ALL_PERMISSIONS].sort());
  });
});

// Pass 38 guard: a limited role administrator must not grant a permission they do not own.
test('Pass 37 audit guard: role manager cannot grant permissions beyond own authority', { skip: !auditGuard }, async () => {
  await withApi(async ({ app, client }) => {
    const roleManage = await client.permission.findUnique({ where: { code: 'roles.manage' } });
    assert.ok(roleManage);
    await client.rolePermission.create({
      data: { roleId: READER_ROLE_A_ID, permissionId: roleManage.id }
    });

    const readerToken = await signIn(app, 'reader-a@example.test');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/roles/${READER_ROLE_A_ID}/permissions`,
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { permissionCodes: ['users.read', 'roles.manage', 'sessions.manage'] }
    });

    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'FORBIDDEN');
  });
});

// Pass 38 guard: a limited user administrator must not assign a more powerful role.
test('Pass 37 audit guard: user manager cannot assign roles beyond own authority', { skip: !auditGuard }, async () => {
  await withApi(async ({ app, client }) => {
    const usersManage = await client.permission.findUnique({ where: { code: 'users.manage' } });
    assert.ok(usersManage);
    await client.rolePermission.create({
      data: { roleId: READER_ROLE_A_ID, permissionId: usersManage.id }
    });

    const readerToken = await signIn(app, 'reader-a@example.test');
    const response = await app.inject({
      method: 'PUT',
      url: `/api/v1/users/${TARGET_A_ID}/roles`,
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { assignments: [{ roleId: ADMIN_ROLE_A_ID }] }
    });

    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'FORBIDDEN');
  });
});

// Red guard: refresh credentials and bearer access credentials must be separate secrets.
test('Pass 37 audit guard: refresh token cannot authenticate protected APIs', { skip: !auditGuard }, async () => {
  await withApi(async ({ app }) => {
    const signInResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'admin-a@example.test', password: PASSWORD }
    });
    assert.equal(signInResponse.statusCode, 200, signInResponse.body);

    const { accessToken, refreshToken } = signInResponse.json().data;
    assert.equal(typeof accessToken, 'string', 'sign-in must return a separate access token');
    assert.equal(typeof refreshToken, 'string', 'sign-in must return a refresh token');
    assert.notEqual(accessToken, refreshToken, 'access and refresh tokens must be different');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${refreshToken}` }
    });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: `Bearer ${accessToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
  });
});
