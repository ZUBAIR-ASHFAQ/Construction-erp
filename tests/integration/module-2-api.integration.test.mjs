import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000002400';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000002500';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000002410';
const READER_A_ID = '00000000-0000-4000-8000-000000002411';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000002510';
const ADMIN_ROLE_A_ID = '00000000-0000-4000-8000-000000002420';
const READER_ROLE_A_ID = '00000000-0000-4000-8000-000000002421';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000002520';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000002530';
const OPPORTUNITY_B_ID = '00000000-0000-4000-8000-000000002531';
const PASSWORD = 'Module2-pass-101-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_2_PERMISSIONS = [
  'clients.read',
  'clients.create',
  'clients.update',
  'opportunities.read',
  'opportunities.manage'
];

let contextCounter = 0;

/** Load built runtime packages only when the disposable live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const { ClientsRepository, ClientsService } = await import('../../apps/api/dist/modules/clients/index.js');
  return { testing, buildApp, hashPassword, ClientsRepository, ClientsService };
}

/** Seed two companies, CRM permissions and the minimum identities needed by Module 2 tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_A_ID,
        legalName: 'Module 2 Company A Ltd',
        displayName: 'Module 2 Company A',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 2 Company B Ltd',
        displayName: 'Module 2 Company B',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_2_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: code.split('.')[0] },
      create: { code, name: code, domain: code.split('.')[0] }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'crm-admin', name: 'CRM Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'crm-reader', name: 'CRM Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'crm-admin', name: 'CRM Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_A_ID, permissionId: permission.id })),
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permission.id })),
      { roleId: READER_ROLE_A_ID, permissionId: permissionByCode.get('clients.read') },
      { roleId: READER_ROLE_A_ID, permissionId: permissionByCode.get('opportunities.read') }
    ]
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'crm-admin-a@example.test', name: 'CRM Admin A', status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'crm-reader-a@example.test', name: 'CRM Reader A', status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'crm-admin-b@example.test', name: 'CRM Admin B', status: 'ACTIVE' }
    ]
  });

  await client.authCredential.createMany({
    data: [ADMIN_A_ID, READER_A_ID, ADMIN_B_ID].map((userId) => ({ userId, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: READER_A_ID, roleId: READER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.create({
    data: {
      id: CLIENT_B_ID,
      companyId: COMPANY_B_ID,
      code: 'B-CLIENT-001',
      legalName: 'Foreign Client B Ltd',
      displayName: 'Foreign Client B',
      billingAddress: 'Company B address',
      status: 'ACTIVE',
      creditTermsDays: 15
    }
  });

  await client.opportunity.create({
    data: {
      id: OPPORTUNITY_B_ID,
      companyId: COMPANY_B_ID,
      clientId: CLIENT_B_ID,
      code: 'B-OPP-001',
      name: 'Foreign Opportunity B',
      estimatedValue: '1000.00',
      probability: 25,
      stage: 'LEAD',
      source: 'Referral',
      ownerUserId: ADMIN_B_ID,
      expectedCloseDate: new Date('2026-12-31T00:00:00.000Z')
    }
  });
}

/** Build one fresh Fastify app over the disposable PostgreSQL database. */
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
    await work({ app, client, ...runtime });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in through Module 24A and return the server-issued access token. */
async function signIn(app, email) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one client through the public Module 2 HTTP API. */
async function createClient(app, token, code = 'A-CLIENT-001') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/clients',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      code,
      legalName: `${code} Legal Ltd`,
      displayName: `${code} Display`,
      billingAddress: 'Lahore, Pakistan',
      creditTermsDays: 30
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one opportunity through the public Module 2 HTTP API. */
async function createOpportunity(app, token, clientId, code = 'A-OPP-001') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/opportunities',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      clientId,
      code,
      name: `${code} Commercial Opportunity`,
      estimatedValue: '250000.50',
      probability: 40,
      source: 'Referral',
      ownerUserId: ADMIN_A_ID,
      expectedCloseDate: '2026-12-31'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Run one direct repository/service assertion under trusted request context. */
async function runInCompanyContext(runtime, input, work) {
  contextCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-2-integration-${contextCounter}`,
    correlationId: `module-2-integration-${contextCounter}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: input.permissions,
    projectScope: { kind: 'not-resolved' }
  }, work);
}

/** Build deterministic UUIDs for the disposable operational dataset. */
function makeOperationalUuid(prefix, number) {
  return `${prefix}0000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
}

/** Seed enough CRM rows for PostgreSQL to make meaningful index-plan decisions. */
async function seedOperationalDataset(client) {
  const clientRows = [];
  for (let index = 1; index <= 2400; index += 1) {
    const companyId = index <= 1200 ? COMPANY_A_ID : COMPANY_B_ID;
    const companyCode = companyId === COMPANY_A_ID ? 'A' : 'B';
    clientRows.push({
      id: makeOperationalUuid('1', index),
      companyId,
      code: `PERF-${companyCode}-${String(index).padStart(5, '0')}`,
      legalName: `Performance ${companyCode} Client ${index} Ltd`,
      displayName: `Performance ${companyCode} Client ${String(index).padStart(5, '0')}`,
      billingAddress: `Performance address ${index}`,
      status: index % 5 === 0 ? 'ARCHIVED' : 'ACTIVE',
      creditTermsDays: index % 31
    });
  }
  await client.client.createMany({ data: clientRows });

  const stages = ['LEAD', 'QUALIFIED', 'TENDERING', 'WON', 'LOST'];
  const opportunityRows = [];
  for (let index = 1; index <= 5000; index += 1) {
    const companyId = index <= 2500 ? COMPANY_A_ID : COMPANY_B_ID;
    const companyCode = companyId === COMPANY_A_ID ? 'A' : 'B';
    const clientOffset = companyId === COMPANY_A_ID ? ((index - 1) % 1200) + 1 : ((index - 2501) % 1200) + 1201;
    opportunityRows.push({
      id: makeOperationalUuid('2', index),
      companyId,
      clientId: makeOperationalUuid('1', clientOffset),
      code: `PERF-OPP-${companyCode}-${String(index).padStart(5, '0')}`,
      name: `Performance ${companyCode} Opportunity ${String(index).padStart(5, '0')}`,
      estimatedValue: `${1000 + index}.00`,
      probability: index % 101,
      stage: stages[index % stages.length],
      source: 'Operational verification',
      ownerUserId: companyId === COMPANY_A_ID ? (index % 2 === 0 ? ADMIN_A_ID : READER_A_ID) : ADMIN_B_ID,
      expectedCloseDate: new Date(Date.UTC(2026, index % 12, (index % 27) + 1))
    });
  }
  await client.opportunity.createMany({ data: opportunityRows });

  const noteRows = [];
  for (let index = 1; index <= 2500; index += 1) {
    const opportunityNumber = ((index - 1) % 100) + 1;
    noteRows.push({
      opportunityId: makeOperationalUuid('2', opportunityNumber),
      authorUserId: index % 2 === 0 ? ADMIN_A_ID : READER_A_ID,
      note: `Operational verification note ${index}`,
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, index % 60, index % 60))
    });
  }
  await client.opportunityNote.createMany({ data: noteRows });

  await client.$executeRawUnsafe('ANALYZE clients');
  await client.$executeRawUnsafe('ANALYZE opportunities');
  await client.$executeRawUnsafe('ANALYZE opportunity_notes');
}

/** Run EXPLAIN ANALYZE and return every index name selected by PostgreSQL. */
async function explainIndexNames(client, sql, values = []) {
  const rows = await client.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, ...values);
  const rawPlan = rows[0]?.['QUERY PLAN'];
  const document = typeof rawPlan === 'string' ? JSON.parse(rawPlan) : rawPlan;
  const root = Array.isArray(document) ? document[0]?.Plan : document?.Plan;
  const names = new Set();
  const stack = root ? [root] : [];

  while (stack.length > 0) {
    const node = stack.pop();
    if (node?.['Index Name']) names.add(node['Index Name']);
    for (const child of node?.Plans ?? []) stack.push(child);
  }

  return names;
}

/** Return the stable public error code from one Fastify response. */
function errorCode(response) {
  return response.json().error.code;
}

/** Verify one public error keeps the expected status/code without exposing database internals. */
function assertSafePublicError(response, expectedStatus, expectedCode) {
  assert.equal(response.statusCode, expectedStatus, response.body);
  assert.equal(errorCode(response), expectedCode);

  const body = response.body.toLowerCase();
  for (const forbidden of ['prisma', 'p2002', 'postgresql', 'stack', 'select ', 'insert into ', 'update ']) {
    assert.equal(body.includes(forbidden), false, `public error leaked: ${forbidden}`);
  }
}

test('Module 2 full API workflow persists CRM state, audit and outbox records', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/clients' });
    assert.equal(response.statusCode, 401, response.body);

    const adminToken = await signIn(app, 'crm-admin-a@example.test');
    const createdClient = await createClient(app, adminToken);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'A-CLIENT-001',
        legalName: 'Duplicate Client Ltd',
        displayName: 'Duplicate Client',
        billingAddress: 'Duplicate address'
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'DUPLICATE_CLIENT_CODE');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?search=A-CLIENT&page=1&pageSize=10',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, createdClient.id);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${createdClient.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { displayName: 'Updated Client Display', creditTermsDays: 45 }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.displayName, 'Updated Client Display');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${createdClient.id}/contacts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Primary Contact',
        title: 'Commercial Manager',
        email: ' PRIMARY@EXAMPLE.TEST ',
        phone: '+92 300-1234567',
        isPrimary: true
      }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.contact.email, 'primary@example.test');
    assert.equal(response.json().data.contact.phone, '+923001234567');
    assert.deepEqual(response.json().data.warnings, []);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${createdClient.id}/contacts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Second Primary',
        title: 'Director',
        email: 'second@example.test',
        phone: '+923001111111',
        isPrimary: true
      }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.deepEqual(response.json().data.warnings, ['DUPLICATE_PRIMARY_CONTACT']);

    const opportunity = await createOpportunity(app, adminToken, createdClient.id);
    assert.equal(opportunity.stage, 'LEAD');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/opportunities?stage=LEAD&ownerUserId=${ADMIN_A_ID}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, opportunity.id);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${opportunity.id}/notes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { note: 'Client requested a revised commercial meeting.' }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.authorUserId, ADMIN_A_ID);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/opportunities/${opportunity.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.notes.length, 1);

    for (const targetStage of ['QUALIFIED', 'TENDERING', 'WON']) {
      response = await app.inject({
        method: 'POST',
        url: `/api/v1/opportunities/${opportunity.id}/change-stage`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { targetStage }
      });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.stage, targetStage);
    }

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${opportunity.id}/change-stage`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'LOST' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_OPPORTUNITY_STAGE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${opportunity.id}/reopen`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'QUALIFIED', reason: 'Client reopened commercial discussions.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.stage, 'QUALIFIED');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${createdClient.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.commercialSummary.opportunityCount, 1);
    assert.equal(response.json().data.contacts.length, 2);
    assert.equal('balance' in response.json().data.commercialSummary, false);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${createdClient.id}/archive`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ARCHIVED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${createdClient.id}/archive`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${createdClient.id}/contacts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Blocked Contact',
        title: 'Manager',
        email: 'blocked@example.test',
        phone: '+923002222222'
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CLIENT_IN_USE');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: createdClient.id,
        code: 'BLOCKED-OPP',
        name: 'Blocked Opportunity',
        estimatedValue: '1.00',
        probability: 10,
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: '2026-12-31'
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CLIENT_IN_USE');

    const auditActions = await client.auditLog.findMany({
      where: {
        companyId: COMPANY_A_ID,
        action: { in: ['client.created', 'client.updated', 'client.contact_created', 'client.archived', 'opportunity.created', 'opportunity.stage_changed', 'opportunity.reopened'] }
      },
      select: { action: true, actorUserId: true }
    });
    assert.equal(auditActions.filter((row) => row.action === 'client.created').length, 1);
    assert.equal(auditActions.filter((row) => row.action === 'client.updated').length, 1);
    assert.equal(auditActions.filter((row) => row.action === 'client.contact_created').length, 2);
    assert.equal(auditActions.filter((row) => row.action === 'client.archived').length, 1);
    assert.equal(auditActions.filter((row) => row.action === 'opportunity.created').length, 1);
    assert.equal(auditActions.filter((row) => row.action === 'opportunity.stage_changed').length, 3);
    assert.equal(auditActions.filter((row) => row.action === 'opportunity.reopened').length, 1);
    assert.equal(auditActions.every((row) => row.actorUserId === ADMIN_A_ID), true);

    const outboxEvents = await client.outboxEvent.findMany({
      where: {
        companyId: COMPANY_A_ID,
        eventType: { in: ['client.created', 'client.updated', 'opportunity.created', 'opportunity.stage_changed'] }
      },
      select: { eventType: true, actorUserId: true }
    });
    assert.equal(outboxEvents.filter((row) => row.eventType === 'client.created').length, 1);
    assert.equal(outboxEvents.filter((row) => row.eventType === 'client.updated').length, 2);
    assert.equal(outboxEvents.filter((row) => row.eventType === 'opportunity.created').length, 1);
    assert.equal(outboxEvents.filter((row) => row.eventType === 'opportunity.stage_changed').length, 4);
    assert.equal(outboxEvents.every((row) => row.actorUserId === ADMIN_A_ID), true);
  });
});

test('Module 2 API enforces RBAC, trusted ownership and cross-company isolation', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminAToken = await signIn(app, 'crm-admin-a@example.test');
    const readerAToken = await signIn(app, 'crm-reader-a@example.test');
    const adminBToken = await signIn(app, 'crm-admin-b@example.test');
    const clientA = await createClient(app, adminAToken, 'A-SEC-001');
    const opportunityA = await createOpportunity(app, adminAToken, clientA.id, 'A-SEC-OPP');

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${clientA.id}`,
      headers: { authorization: `Bearer ${readerAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${readerAToken}` },
      payload: {
        code: 'FORBIDDEN',
        legalName: 'Forbidden Ltd',
        displayName: 'Forbidden',
        billingAddress: 'Forbidden address'
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${opportunityA.id}/change-stage`,
      headers: { authorization: `Bearer ${readerAToken}` },
      payload: { targetStage: 'QUALIFIED' }
    });
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/clients/${clientA.id}`,
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'CLIENT_NOT_FOUND');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/opportunities/${opportunityA.id}`,
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'OPPORTUNITY_NOT_FOUND');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/clients/${clientA.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { displayName: 'Cross-company update' }
    });
    assert.equal(response.statusCode, 404, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((row) => row.id === CLIENT_B_ID), false);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((row) => row.id === OPPORTUNITY_B_ID), false);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: CLIENT_B_ID,
        code: 'FOREIGN-CLIENT',
        name: 'Foreign Client Attempt',
        estimatedValue: '100.00',
        probability: 20,
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: '2026-12-31'
      }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'CLIENT_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${clientA.id}/contacts`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        name: 'Invalid Email',
        title: 'Manager',
        email: 'not-an-email',
        phone: '+923003333333'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?pageSize=101',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: clientA.id,
        code: 'INVALID-PROBABILITY',
        name: 'Invalid Probability',
        estimatedValue: '100.00',
        probability: 101,
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: '2026-12-31'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: clientA.id,
        code: 'INVALID-VALUE',
        name: 'Invalid Value',
        estimatedValue: '-1.00',
        probability: 20,
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: '2026-12-31'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: clientA.id,
        code: 'FOREIGN-OWNER',
        name: 'Foreign Owner Attempt',
        estimatedValue: '100.00',
        probability: 20,
        source: 'Referral',
        ownerUserId: ADMIN_B_ID,
        expectedCloseDate: '2026-12-31'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${OPPORTUNITY_B_ID}/notes`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { note: 'Cross-company note attempt' }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'OPPORTUNITY_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        companyId: COMPANY_B_ID,
        code: 'UNTRUSTED-COMPANY',
        legalName: 'Untrusted Company Ltd',
        displayName: 'Untrusted Company',
        billingAddress: 'Untrusted address'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/opportunities',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: clientA.id,
        code: 'UNTRUSTED-STAGE',
        name: 'Untrusted Stage',
        estimatedValue: '100.00',
        probability: 20,
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: '2026-12-31',
        stage: 'WON'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
  });
});

test('Module 2 repository and service re-enforce company scope and permissions', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const adminToken = await signIn(runtime.app, 'crm-admin-a@example.test');
    const clientA = await createClient(runtime.app, adminToken, 'A-DIRECT-001');

    const ownClient = await runInCompanyContext(runtime, {
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      permissions: ['clients.read']
    }, async () => new runtime.ClientsRepository(runtime.client).findClientById(clientA.id));
    assert.equal(ownClient?.id, clientA.id);

    const hiddenForeignClient = await runInCompanyContext(runtime, {
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      permissions: ['clients.read']
    }, async () => new runtime.ClientsRepository(runtime.client).findClientById(CLIENT_B_ID));
    assert.equal(hiddenForeignClient, null);

    await assert.rejects(
      runInCompanyContext(runtime, {
        actorUserId: READER_A_ID,
        companyId: COMPANY_A_ID,
        permissions: ['clients.read']
      }, async () => new runtime.ClientsService(runtime.client).createClient({
        code: 'SERVICE-FORBIDDEN',
        legalName: 'Service Forbidden Ltd',
        displayName: 'Service Forbidden',
        billingAddress: 'Forbidden address',
        creditTermsDays: 0
      })),
      (error) => error?.code === 'FORBIDDEN'
    );

    await assert.rejects(
      runInCompanyContext(runtime, {
        actorUserId: ADMIN_A_ID,
        companyId: COMPANY_A_ID,
        permissions: ['clients.read']
      }, async () => new runtime.ClientsService(runtime.client).getClient(CLIENT_B_ID)),
      (error) => error?.code === 'CLIENT_NOT_FOUND'
    );
  });
});

test('Module 2 security requires authentication on every protected CRM route', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const id = '00000000-0000-4000-8000-000000009999';
    const cases = [
      { method: 'GET', url: '/api/v1/clients' },
      {
        method: 'POST',
        url: '/api/v1/clients',
        payload: { code: 'AUTH-CHECK', legalName: 'Auth Check Ltd', displayName: 'Auth Check', billingAddress: 'Auth check address' }
      },
      { method: 'GET', url: `/api/v1/clients/${id}` },
      { method: 'PATCH', url: `/api/v1/clients/${id}`, payload: { displayName: 'Auth Check' } },
      {
        method: 'POST',
        url: `/api/v1/clients/${id}/contacts`,
        payload: { name: 'Auth Check', title: 'Manager', email: 'auth-check@example.test', phone: '+923001234567' }
      },
      { method: 'POST', url: `/api/v1/clients/${id}/archive`, payload: {} },
      { method: 'GET', url: '/api/v1/opportunities' },
      {
        method: 'POST',
        url: '/api/v1/opportunities',
        payload: {
          clientId: id,
          code: 'AUTH-CHECK-OPP',
          name: 'Auth Check Opportunity',
          estimatedValue: '100.00',
          probability: 20,
          source: 'Referral',
          ownerUserId: id,
          expectedCloseDate: '2026-12-31'
        }
      },
      { method: 'GET', url: `/api/v1/opportunities/${id}` },
      { method: 'POST', url: `/api/v1/opportunities/${id}/change-stage`, payload: { targetStage: 'QUALIFIED' } },
      { method: 'POST', url: `/api/v1/opportunities/${id}/notes`, payload: { note: 'Auth check note' } },
      { method: 'POST', url: `/api/v1/opportunities/${id}/reopen`, payload: { targetStage: 'LEAD', reason: 'Auth check' } }
    ];

    for (const request of cases) {
      const response = await app.inject(request);
      assertSafePublicError(response, 401, 'AUTHENTICATION_REQUIRED');
    }
  });
});

test('Module 2 public errors keep validation and business conflicts free of database details', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'crm-admin-a@example.test');
    const clientA = await createClient(app, adminToken, 'A-SAFE-ERROR');

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/clients',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'A-SAFE-ERROR',
        legalName: 'Duplicate Safe Error Ltd',
        displayName: 'Duplicate Safe Error',
        billingAddress: 'Safe error address'
      }
    });
    assertSafePublicError(response, 409, 'DUPLICATE_CLIENT_CODE');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/clients/${clientA.id}/contacts`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Bad Contact', title: 'Manager', email: 'not-an-email', phone: '+923001234567' }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    const opportunity = await createOpportunity(app, adminToken, clientA.id, 'A-SAFE-OPP');
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/opportunities/${opportunity.id}/change-stage`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { targetStage: 'WON' }
    });
    assertSafePublicError(response, 409, 'INVALID_OPPORTUNITY_STAGE');
  });
});

test('Module 2 database constraints reject invalid values and cross-company relationships', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'crm-admin-a@example.test');
    const clientA = await createClient(app, adminToken, 'A-DB-INTEGRITY');
    const opportunityA = await createOpportunity(app, adminToken, clientA.id, 'A-DB-INTEGRITY-OPP');

    await assert.rejects(client.client.create({
      data: {
        companyId: COMPANY_A_ID,
        code: 'NEGATIVE-CREDIT',
        legalName: 'Negative Credit Ltd',
        displayName: 'Negative Credit',
        billingAddress: 'Invalid address',
        status: 'ACTIVE',
        creditTermsDays: -1
      }
    }));

    await assert.rejects(client.clientContact.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_B_ID,
        name: 'Cross-company Contact',
        title: 'Manager',
        email: 'cross-company@example.test',
        phone: '+923001234567',
        isPrimary: false,
        status: 'ACTIVE'
      }
    }));

    await assert.rejects(client.opportunity.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: clientA.id,
        code: 'FOREIGN-OWNER-DB',
        name: 'Foreign Owner DB Attempt',
        estimatedValue: '100.00',
        probability: 20,
        stage: 'LEAD',
        source: 'Referral',
        ownerUserId: ADMIN_B_ID,
        expectedCloseDate: new Date('2026-12-31T00:00:00.000Z')
      }
    }));

    await assert.rejects(client.opportunity.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: clientA.id,
        code: 'BAD-PROBABILITY-DB',
        name: 'Bad Probability DB Attempt',
        estimatedValue: '100.00',
        probability: 101,
        stage: 'LEAD',
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: new Date('2026-12-31T00:00:00.000Z')
      }
    }));

    await assert.rejects(client.opportunityNote.create({
      data: { opportunityId: opportunityA.id, authorUserId: ADMIN_A_ID, note: '   ' }
    }));
  });
});

test('Module 2 database exposes the reviewed tenant/filter indexes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const rows = await client.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('clients', 'client_contacts', 'opportunities', 'opportunity_notes')
    `);
    const names = new Set(rows.map((row) => row.indexname));

    for (const indexName of [
      'clients_company_code_uq',
      'clients_company_status_idx',
      'clients_company_display_name_idx',
      'client_contacts_company_client_status_idx',
      'opportunities_company_client_created_idx',
      'opportunities_company_stage_close_idx',
      'opportunities_company_owner_stage_idx',
      'opportunity_notes_opportunity_created_idx'
    ]) {
      assert.equal(names.has(indexName), true, indexName);
    }
  });
});

test('Module 2 concurrent client and stage commands leave one committed business result', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'crm-admin-a@example.test');
    const duplicatePayload = {
      code: 'A-RACE-001',
      legalName: 'Concurrent Client Ltd',
      displayName: 'Concurrent Client',
      billingAddress: 'Concurrent address',
      creditTermsDays: 0
    };

    const clientResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/v1/clients',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: duplicatePayload
      }),
      app.inject({
        method: 'POST',
        url: '/api/v1/clients',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: duplicatePayload
      })
    ]);

    assert.deepEqual(clientResponses.map((response) => response.statusCode).sort(), [201, 409]);
    assert.equal(await client.client.count({ where: { companyId: COMPANY_A_ID, code: 'A-RACE-001' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_A_ID, action: 'client.created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, eventType: 'client.created' } }), 1);

    const clientA = await createClient(app, adminToken, 'A-RACE-002');
    const opportunity = await createOpportunity(app, adminToken, clientA.id, 'A-RACE-OPP');

    const stageResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/opportunities/${opportunity.id}/change-stage`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { targetStage: 'QUALIFIED' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/opportunities/${opportunity.id}/change-stage`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { targetStage: 'QUALIFIED' }
      })
    ]);

    assert.deepEqual(stageResponses.map((response) => response.statusCode).sort(), [200, 409]);
    const storedOpportunity = await client.opportunity.findUnique({ where: { id: opportunity.id } });
    assert.equal(storedOpportunity?.stage, 'QUALIFIED');
    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_A_ID, action: 'opportunity.stage_changed', entityId: opportunity.id }
    }), 1);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_A_ID, eventType: 'opportunity.stage_changed', resourceId: opportunity.id }
    }), 1);
  });
});

test('Module 2 operational queries use reviewed indexes and bounded stable pagination', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    await seedOperationalDataset(client);

    const targetClientId = makeOperationalUuid('1', 411);
    const targetOpportunityId = makeOperationalUuid('2', 41);
    const planChecks = [
      {
        label: 'client code lookup',
        expected: ['clients_company_code_uq'],
        sql: 'SELECT id FROM clients WHERE company_id = $1::uuid AND code = $2 LIMIT 1',
        values: [COMPANY_A_ID, 'PERF-A-00411']
      },
      {
        label: 'client ordered list',
        expected: ['clients_company_display_name_idx'],
        sql: 'SELECT id, display_name FROM clients WHERE company_id = $1::uuid ORDER BY display_name ASC, id ASC LIMIT 50',
        values: [COMPANY_A_ID]
      },
      {
        label: 'client detail',
        expected: ['clients_pkey', 'clients_id_company_uq'],
        sql: 'SELECT id FROM clients WHERE id = $1::uuid AND company_id = $2::uuid LIMIT 1',
        values: [targetClientId, COMPANY_A_ID]
      },
      {
        label: 'opportunity stage pipeline',
        expected: ['opportunities_company_stage_close_idx'],
        sql: "SELECT id FROM opportunities WHERE company_id = $1::uuid AND stage = 'QUALIFIED' ORDER BY expected_close_date ASC, created_at DESC, id ASC LIMIT 50",
        values: [COMPANY_A_ID]
      },
      {
        label: 'opportunity owner/stage filter',
        expected: ['opportunities_company_owner_stage_idx'],
        sql: "SELECT id FROM opportunities WHERE company_id = $1::uuid AND owner_user_id = $2::uuid AND stage = 'QUALIFIED' LIMIT 50",
        values: [COMPANY_A_ID, READER_A_ID]
      },
      {
        label: 'opportunity activity history',
        expected: ['opportunity_notes_opportunity_created_idx'],
        sql: 'SELECT id, note FROM opportunity_notes WHERE opportunity_id = $1::uuid ORDER BY created_at ASC LIMIT 50',
        values: [targetOpportunityId]
      }
    ];

    for (const check of planChecks) {
      const indexNames = await explainIndexNames(client, check.sql, check.values);
      assert.equal(
        check.expected.some((indexName) => indexNames.has(indexName)),
        true,
        `${check.label} plan used [${[...indexNames].join(', ')}] instead of ${check.expected.join(' or ')}`
      );
    }

    const adminToken = await signIn(app, 'crm-admin-a@example.test');
    const firstClientPage = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?page=1&pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const secondClientPage = await app.inject({
      method: 'GET',
      url: '/api/v1/clients?page=2&pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(firstClientPage.statusCode, 200, firstClientPage.body);
    assert.equal(secondClientPage.statusCode, 200, secondClientPage.body);
    assert.equal(firstClientPage.json().data.items.length, 50);
    assert.equal(secondClientPage.json().data.items.length, 50);
    const firstClientIds = new Set(firstClientPage.json().data.items.map((item) => item.id));
    assert.equal(secondClientPage.json().data.items.some((item) => firstClientIds.has(item.id)), false);

    const firstOpportunityPage = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?stage=QUALIFIED&page=1&pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const secondOpportunityPage = await app.inject({
      method: 'GET',
      url: '/api/v1/opportunities?stage=QUALIFIED&page=2&pageSize=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(firstOpportunityPage.statusCode, 200, firstOpportunityPage.body);
    assert.equal(secondOpportunityPage.statusCode, 200, secondOpportunityPage.body);
    assert.equal(firstOpportunityPage.json().data.items.length, 50);
    assert.equal(secondOpportunityPage.json().data.items.length, 50);
    const firstOpportunityIds = new Set(firstOpportunityPage.json().data.items.map((item) => item.id));
    assert.equal(secondOpportunityPage.json().data.items.some((item) => firstOpportunityIds.has(item.id)), false);
  });
});

