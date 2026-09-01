import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000004600';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000004700';
const ADMIN_ID = '00000000-0000-4000-8000-000000004610';
const PROJECT_EDITOR_ID = '00000000-0000-4000-8000-000000004611';
const PROJECT_READER_ID = '00000000-0000-4000-8000-000000004612';
const MEMBER_ONLY_ID = '00000000-0000-4000-8000-000000004613';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000004710';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000004620';
const PROJECT_EDITOR_ROLE_ID = '00000000-0000-4000-8000-000000004621';
const PROJECT_READER_ROLE_ID = '00000000-0000-4000-8000-000000004622';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000004720';
const CLIENT_ID = '00000000-0000-4000-8000-000000004630';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000004730';
const TENDER_ID = '00000000-0000-4000-8000-000000004640';
const TENDER_B_ID = '00000000-0000-4000-8000-000000004740';
const PROJECT_ID = '00000000-0000-4000-8000-000000004650';
const PROJECT_2_ID = '00000000-0000-4000-8000-000000004651';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000004750';
const WBS_ID = '00000000-0000-4000-8000-000000004660';
const WBS_2_ID = '00000000-0000-4000-8000-000000004661';
const WBS_B_ID = '00000000-0000-4000-8000-000000004760';
const COST_CODE_ID = '00000000-0000-4000-8000-000000004670';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000004770';
const PASSWORD = 'Module4b-pass-196-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const BOQ_PERMISSIONS = ['boq.read', 'boq.create', 'boq.edit', 'boq.freeze', 'boq.export'];

/** Load built runtime packages only when the disposable PostgreSQL gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest Stage-10 Company, Project, WBS, Cost Code and permission scenario. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 4B Company Ltd',
        displayName: 'Module 4B Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 4B Foreign Company Ltd',
        displayName: 'Module 4B Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of BOQ_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'boq' },
      create: { code, name: code, domain: 'boq' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: PROJECT_EDITOR_ROLE_ID, companyId: COMPANY_ID, code: 'boq-project-editor', name: 'BOQ Project Editor', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_READER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-project-reader', name: 'BOQ Project Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...BOQ_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...BOQ_PERMISSIONS.map((code) => ({ roleId: PROJECT_EDITOR_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: PROJECT_READER_ROLE_ID, permissionId: permissionByCode.get('boq.read') },
      ...BOQ_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module4b-admin@example.test', name: 'Module 4B Admin' },
    { id: PROJECT_EDITOR_ID, companyId: COMPANY_ID, email: 'module4b-editor@example.test', name: 'Module 4B Project Editor' },
    { id: PROJECT_READER_ID, companyId: COMPANY_ID, email: 'module4b-reader@example.test', name: 'Module 4B Project Reader' },
    { id: MEMBER_ONLY_ID, companyId: COMPANY_ID, email: 'module4b-member@example.test', name: 'Module 4B Member Only' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module4b-admin-b@example.test', name: 'Module 4B Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_EDITOR_ID, roleId: PROJECT_EDITOR_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_READER_ID, roleId: PROJECT_READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'MODULE4B-CLIENT',
        legalName: 'Module 4B Client Ltd',
        displayName: 'Module 4B Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'MODULE4B-FOREIGN-CLIENT',
        legalName: 'Module 4B Foreign Client Ltd',
        displayName: 'Module 4B Foreign Client',
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
        tenderNo: 'MODULE4B-TENDER-A',
        title: 'Module 4B Tender A',
        dueDate: new Date('2026-11-30T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_ID,
        currency: 'USD'
      },
      {
        id: TENDER_B_ID,
        companyId: COMPANY_B_ID,
        clientId: CLIENT_B_ID,
        opportunityId: null,
        tenderNo: 'MODULE4B-TENDER-B',
        title: 'Module 4B Tender B',
        dueDate: new Date('2026-11-30T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_B_ID,
        currency: 'USD'
      }
    ]
  });

  await client.project.createMany({
    data: [
      {
        id: PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE4B-PROJECT-A',
        name: 'Module 4B Project A',
        clientId: CLIENT_ID,
        tenderId: TENDER_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_2_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE4B-PROJECT-B',
        name: 'Module 4B Project B',
        clientId: CLIENT_ID,
        tenderId: null,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Islamabad, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_B_ID,
        projectCode: 'MODULE4B-FOREIGN-PROJECT',
        name: 'Module 4B Foreign Project',
        clientId: CLIENT_B_ID,
        tenderId: TENDER_B_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_B_ID,
        location: 'Karachi, Pakistan'
      }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_EDITOR_ID, projectRole: 'EDITOR', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_READER_ID, projectRole: 'VIEWER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: MEMBER_ONLY_ID, projectRole: 'MEMBER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.wbsNode.createMany({
    data: [
      { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Project A WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_2_ID, companyId: COMPANY_ID, projectId: PROJECT_2_ID, parentId: null, code: 'B', name: 'Project B WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, parentId: null, code: 'F', name: 'Foreign WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
    ]
  });

  await client.costCode.createMany({
    data: [
      { id: COST_CODE_ID, companyId: COMPANY_ID, code: '1000', name: 'Direct Cost', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9000', name: 'Foreign Cost', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });
}

/** Build one fresh Fastify app over the explicitly disposable PostgreSQL database. */
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

/** Sign in one seeded user and return the server-issued access token. */
async function signIn(app, email = 'module4b-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one BOQ through the existing reviewed Module-4 create operation. */
async function createBoq(app, token, payload) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/boqs',
    headers: { authorization: `Bearer ${token}` },
    payload
  });
  return response;
}

/** Create the next BOQ revision through the existing reviewed command. */
async function createRevision(app, token, boqId) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/boqs/${boqId}/revisions`,
    headers: { authorization: `Bearer ${token}` },
    payload: { effectiveDate: '2026-09-01', notes: 'Stage-10 mapped revision' }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Replace one complete BOQ item set through the existing reviewed command. */
async function replaceItems(app, token, boqId, revisionId, items) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/boqs/${boqId}/revisions/${revisionId}/items`,
    headers: { authorization: `Bearer ${token}` },
    payload: { items }
  });
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Return one standard mapped item payload while allowing relationship overrides. */
function mappedItem(overrides = {}) {
  return {
    rowKey: 'row-1',
    itemCode: 'ITEM-001',
    description: 'Mapped BOQ item',
    unit: 'm2',
    quantity: '2.0000',
    rate: '15.5000',
    wbsNodeId: WBS_ID,
    costCodeId: COST_CODE_ID,
    ...overrides
  };
}

test('Module 4B full PostgreSQL/Fastify workflow persists Project BOQs and WBS/Cost Code mappings', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const tenderOnlyResponse = await createBoq(app, token, {
      tenderId: TENDER_ID,
      code: 'BOQ-TENDER-ONLY',
      title: 'Tender-only BOQ',
      currency: 'usd'
    });
    assert.equal(tenderOnlyResponse.statusCode, 201, tenderOnlyResponse.body);
    assert.equal(tenderOnlyResponse.json().data.projectId, null);

    const projectOnlyResponse = await createBoq(app, token, {
      projectId: PROJECT_ID,
      code: 'BOQ-PROJECT-ONLY',
      title: 'Project-only BOQ',
      currency: 'usd'
    });
    assert.equal(projectOnlyResponse.statusCode, 201, projectOnlyResponse.body);
    const projectBoq = projectOnlyResponse.json().data;
    assert.equal(projectBoq.tenderId, null);
    assert.equal(projectBoq.projectId, PROJECT_ID);

    const combinedResponse = await createBoq(app, token, {
      tenderId: TENDER_ID,
      projectId: PROJECT_ID,
      code: 'BOQ-COMBINED',
      title: 'Tender and Project BOQ',
      currency: 'usd'
    });
    assert.equal(combinedResponse.statusCode, 201, combinedResponse.body);
    assert.equal(combinedResponse.json().data.tenderId, TENDER_ID);
    assert.equal(combinedResponse.json().data.projectId, PROJECT_ID);

    const revision = await createRevision(app, token, projectBoq.id);
    const replaceResponse = await replaceItems(app, token, projectBoq.id, revision.id, [mappedItem()]);
    assert.equal(replaceResponse.statusCode, 200, replaceResponse.body);
    assert.equal(replaceResponse.json().data.items[0].wbsNodeId, WBS_ID);
    assert.equal(replaceResponse.json().data.items[0].costCodeId, COST_CODE_ID);
    assert.equal(replaceResponse.json().data.items[0].amount, '31.00');

    const storedItem = await client.boqItem.findFirstOrThrow({ where: { boqRevisionId: revision.id } });
    assert.equal(storedItem.wbsNodeId, WBS_ID);
    assert.equal(storedItem.costCodeId, COST_CODE_ID);

    const freezeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${projectBoq.id}/revisions/${revision.id}/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(freezeResponse.statusCode, 200, freezeResponse.body);
    assert.equal(freezeResponse.json().data.revision.status, 'FROZEN');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?page=1&pageSize=20',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(listResponse.statusCode, 200, listResponse.body);
    assert.equal(listResponse.json().data.total, 3);

    const audits = await client.auditLog.findMany({
      where: { companyId: COMPANY_ID, entityId: { in: [projectBoq.id, revision.id] } },
      select: { action: true, afterValue: true, actorUserId: true }
    });
    assert.ok(audits.some((row) => row.action === 'boq.created' && row.afterValue?.projectId === PROJECT_ID));
    assert.ok(audits.some((row) => row.action === 'boq.items_replaced' && row.afterValue?.projectId === PROJECT_ID));
    assert.ok(audits.every((row) => row.actorUserId === ADMIN_ID));

    const events = await client.outboxEvent.findMany({
      where: { companyId: COMPANY_ID, resourceId: { in: [projectBoq.id, revision.id] } },
      select: { eventType: true, payload: true }
    });
    assert.ok(events.some((row) => row.eventType === 'boq.created' && row.payload?.projectId === PROJECT_ID));
    assert.ok(events.some((row) => row.eventType === 'boq.revision_created' && row.payload?.projectId === PROJECT_ID));
    assert.ok(events.some((row) => row.eventType === 'boq.revision_frozen' && row.payload?.projectId === PROJECT_ID));
  });
});

test('Module 4B security enforces exact Project permissions and atomic mapping scope', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const editorToken = await signIn(app, 'module4b-editor@example.test');
    const readerToken = await signIn(app, 'module4b-reader@example.test');
    const memberToken = await signIn(app, 'module4b-member@example.test');
    const foreignToken = await signIn(app, 'module4b-admin-b@example.test');

    const projectAResponse = await createBoq(app, adminToken, {
      projectId: PROJECT_ID,
      code: 'BOQ-PROJECT-A',
      title: 'Project A BOQ',
      currency: 'USD'
    });
    assert.equal(projectAResponse.statusCode, 201, projectAResponse.body);
    const projectABoq = projectAResponse.json().data;

    const projectBResponse = await createBoq(app, adminToken, {
      projectId: PROJECT_2_ID,
      code: 'BOQ-PROJECT-B',
      title: 'Project B BOQ',
      currency: 'USD'
    });
    assert.equal(projectBResponse.statusCode, 201, projectBResponse.body);

    const tenderOnlyResponse = await createBoq(app, adminToken, {
      tenderId: TENDER_ID,
      code: 'BOQ-COMPANY-TENDER',
      title: 'Company Tender BOQ',
      currency: 'USD'
    });
    assert.equal(tenderOnlyResponse.statusCode, 201, tenderOnlyResponse.body);

    const foreignResponse = await createBoq(app, foreignToken, {
      projectId: PROJECT_B_ID,
      code: 'BOQ-FOREIGN',
      title: 'Foreign BOQ',
      currency: 'USD'
    });
    assert.equal(foreignResponse.statusCode, 201, foreignResponse.body);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?page=1&pageSize=20',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((boq) => boq.id), [projectABoq.id]);

    response = await createBoq(app, editorToken, {
      projectId: PROJECT_ID,
      code: 'BOQ-EDITOR-A',
      title: 'Editor Project A BOQ',
      currency: 'USD'
    });
    assert.equal(response.statusCode, 201, response.body);

    response = await createBoq(app, editorToken, {
      projectId: PROJECT_2_ID,
      code: 'BOQ-EDITOR-B',
      title: 'Editor Project B BOQ',
      currency: 'USD'
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createBoq(app, editorToken, {
      tenderId: TENDER_ID,
      code: 'BOQ-EDITOR-TENDER',
      title: 'Editor Tender-only BOQ',
      currency: 'USD'
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createBoq(app, memberToken, {
      projectId: PROJECT_ID,
      code: 'BOQ-MEMBER-ONLY',
      title: 'Membership without permission',
      currency: 'USD'
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createBoq(app, adminToken, {
      projectId: PROJECT_B_ID,
      code: 'BOQ-CROSS-COMPANY',
      title: 'Cross-company Project attack',
      currency: 'USD'
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BOQ_SCOPE_CONFLICT');

    const revision = await createRevision(app, adminToken, projectABoq.id);
    response = await replaceItems(app, adminToken, projectABoq.id, revision.id, [mappedItem()]);
    assert.equal(response.statusCode, 200, response.body);

    response = await replaceItems(app, adminToken, projectABoq.id, revision.id, [mappedItem({ wbsNodeId: WBS_2_ID })]);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BOQ_SCOPE_CONFLICT');

    response = await replaceItems(app, adminToken, projectABoq.id, revision.id, [mappedItem({ costCodeId: COST_CODE_B_ID })]);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BOQ_SCOPE_CONFLICT');

    const persistedAfterFailures = await client.boqItem.findMany({ where: { boqRevisionId: revision.id } });
    assert.equal(persistedAfterFailures.length, 1);
    assert.equal(persistedAfterFailures[0].wbsNodeId, WBS_ID);
    assert.equal(persistedAfterFailures[0].costCodeId, COST_CODE_ID);

    const tenderOnlyRevision = await createRevision(app, adminToken, tenderOnlyResponse.json().data.id);
    response = await replaceItems(app, adminToken, tenderOnlyResponse.json().data.id, tenderOnlyRevision.id, [mappedItem()]);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BOQ_SCOPE_CONFLICT');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/boqs',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        projectId: PROJECT_ID,
        companyId: COMPANY_B_ID,
        code: 'BOQ-AUTHORITY-ATTACK',
        title: 'Authority field attack',
        currency: 'USD'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await replaceItems(app, adminToken, projectABoq.id, revision.id, [{
      ...mappedItem(),
      projectId: PROJECT_2_ID
    }]);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    await assert.rejects(
      client.boq.create({
        data: {
          companyId: COMPANY_ID,
          tenderId: null,
          projectId: PROJECT_B_ID,
          code: 'DB-CROSS-COMPANY-PROJECT',
          title: 'Database cross-company Project attack',
          currency: 'USD',
          status: 'ACTIVE'
        }
      })
    );

    await assert.rejects(
      client.boqItem.create({
        data: {
          boqRevisionId: revision.id,
          parentId: null,
          itemCode: 'DB-WBS-ATTACK',
          description: 'Database WBS scope attack',
          unit: 'm2',
          quantity: '1.0000',
          rate: '1.0000',
          amount: '1.00',
          wbsNodeId: WBS_2_ID,
          costCodeId: COST_CODE_ID
        }
      })
    );

    await assert.rejects(
      client.boqItem.create({
        data: {
          boqRevisionId: revision.id,
          parentId: null,
          itemCode: 'DB-COST-ATTACK',
          description: 'Database Cost Code scope attack',
          unit: 'm2',
          quantity: '1.0000',
          rate: '1.0000',
          amount: '1.00',
          wbsNodeId: WBS_ID,
          costCodeId: COST_CODE_B_ID
        }
      })
    );
  });
});

// Verify Stage-10 Project BOQ creation and mapped item replacement remain atomic under concurrent requests.
test('Module 4B operational concurrency keeps Project BOQ creation and mapped item replacement atomic', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const duplicateResponses = await Promise.all([
      createBoq(app, token, {
        projectId: PROJECT_ID,
        code: 'OPS-PROJECT-DUPLICATE',
        title: 'Concurrent Project BOQ A',
        currency: 'USD'
      }),
      createBoq(app, token, {
        projectId: PROJECT_ID,
        code: 'OPS-PROJECT-DUPLICATE',
        title: 'Concurrent Project BOQ B',
        currency: 'USD'
      })
    ]);

    assert.deepEqual(duplicateResponses.map((response) => response.statusCode).sort(), [201, 409]);
    const duplicateLoser = duplicateResponses.find((response) => response.statusCode === 409);
    assert.ok(duplicateLoser);
    assert.equal(errorCode(duplicateLoser), 'BOQ_SCOPE_CONFLICT');

    const persistedBoqs = await client.boq.findMany({
      where: { companyId: COMPANY_ID, code: 'OPS-PROJECT-DUPLICATE' }
    });
    assert.equal(persistedBoqs.length, 1);
    const boq = persistedBoqs[0];
    assert.equal(boq.projectId, PROJECT_ID);
    assert.equal(await client.auditLog.count({ where: { entityId: boq.id, action: 'boq.created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: boq.id, eventType: 'boq.created' } }), 1);

    const revision = await createRevision(app, token, boq.id);
    const replacementResponses = await Promise.all([
      replaceItems(app, token, boq.id, revision.id, [
        mappedItem({ rowKey: 'ops-a-1', itemCode: 'OPS-A-1', description: 'Mapped set A first row', quantity: '1.0000', rate: '10.0000' }),
        mappedItem({ rowKey: 'ops-a-2', itemCode: 'OPS-A-2', description: 'Mapped set A second row', quantity: '2.0000', rate: '10.0000' })
      ]),
      replaceItems(app, token, boq.id, revision.id, [
        mappedItem({ rowKey: 'ops-b-1', itemCode: 'OPS-B-1', description: 'Mapped set B first row', quantity: '3.0000', rate: '10.0000' }),
        mappedItem({ rowKey: 'ops-b-2', itemCode: 'OPS-B-2', description: 'Mapped set B second row', quantity: '4.0000', rate: '10.0000' })
      ])
    ]);

    assert.deepEqual(replacementResponses.map((response) => response.statusCode).sort(), [200, 200]);
    const persistedItems = await client.boqItem.findMany({
      where: { boqRevisionId: revision.id },
      orderBy: { itemCode: 'asc' }
    });
    assert.equal(persistedItems.length, 2);
    const finalCodes = persistedItems.map((item) => item.itemCode);
    const finalSetIsA = finalCodes.join(',') === 'OPS-A-1,OPS-A-2';
    const finalSetIsB = finalCodes.join(',') === 'OPS-B-1,OPS-B-2';
    assert.equal(finalSetIsA || finalSetIsB, true);
    assert.equal(persistedItems.every((item) => item.wbsNodeId === WBS_ID), true);
    assert.equal(persistedItems.every((item) => item.costCodeId === COST_CODE_ID), true);
  });
});

// Verify the new Stage-10 relationship indexes support Project BOQ and mapping lookups without timing thresholds.
test('Module 4B operational query plans use Stage-10 Project and mapping indexes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await client.boq.createMany({
      data: Array.from({ length: 2400 }, (_, index) => ({
        companyId: COMPANY_ID,
        tenderId: null,
        projectId: PROJECT_ID,
        code: `OPS-PROJECT-${String(index).padStart(5, '0')}`,
        title: `Stage-10 operational Project BOQ ${index}`,
        currency: 'USD',
        status: 'ACTIVE'
      }))
    });
    await client.$executeRawUnsafe('ANALYZE boqs');

    const projectPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, code
      FROM boqs
      WHERE company_id = '${COMPANY_ID}'::uuid
        AND project_id = '${PROJECT_ID}'::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const projectPlan = JSON.stringify(projectPlanRows);
    assert.match(projectPlan, /boqs_company_project_created_idx/);
    assert.match(projectPlan, /Execution Time/);

    const boq = await client.boq.findFirstOrThrow({
      where: { companyId: COMPANY_ID, code: 'OPS-PROJECT-00000' }
    });
    const revision = await client.boqRevision.create({
      data: {
        boqId: boq.id,
        revisionNo: 1,
        status: 'DRAFT',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        notes: 'Stage-10 operational index verification'
      }
    });

    const itemData = [];
    for (let index = 0; index < 2200; index += 1) {
      itemData.push({
        boqRevisionId: revision.id,
        itemCode: `OPS-UNMAPPED-${String(index).padStart(5, '0')}`,
        description: 'Unmapped operational row',
        unit: 'lot',
        quantity: '1.0000',
        rate: '1.0000',
        amount: '1.00'
      });
    }
    for (let index = 0; index < 100; index += 1) {
      itemData.push({
        boqRevisionId: revision.id,
        itemCode: `OPS-WBS-${String(index).padStart(5, '0')}`,
        description: 'WBS mapped operational row',
        unit: 'lot',
        quantity: '1.0000',
        rate: '1.0000',
        amount: '1.00',
        wbsNodeId: WBS_ID
      });
      itemData.push({
        boqRevisionId: revision.id,
        itemCode: `OPS-COST-${String(index).padStart(5, '0')}`,
        description: 'Cost Code mapped operational row',
        unit: 'lot',
        quantity: '1.0000',
        rate: '1.0000',
        amount: '1.00',
        costCodeId: COST_CODE_ID
      });
    }
    await client.boqItem.createMany({ data: itemData });
    await client.$executeRawUnsafe('ANALYZE boq_items');

    const wbsPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM boq_items
      WHERE wbs_node_id = '${WBS_ID}'::uuid
      LIMIT 50
    `);
    const wbsPlan = JSON.stringify(wbsPlanRows);
    assert.match(wbsPlan, /boq_items_wbs_node_idx/);
    assert.match(wbsPlan, /Execution Time/);

    const costCodePlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM boq_items
      WHERE cost_code_id = '${COST_CODE_ID}'::uuid
      LIMIT 50
    `);
    const costCodePlan = JSON.stringify(costCodePlanRows);
    assert.match(costCodePlan, /boq_items_cost_code_idx/);
    assert.match(costCodePlan, /Execution Time/);
  });
});

test('Module 4B live OpenAPI keeps six source operations plus Pass-367 readback while documenting Stage-10 relationships', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();

    const boqOperations = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      if (!route.startsWith('/api/v1/boqs')) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]) boqOperations.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.equal(boqOperations.length, 8);

    const createBody = document.paths['/api/v1/boqs'].post.requestBody.content['application/json'].schema;
    assert.deepEqual(createBody.required, ['code', 'title', 'currency']);
    assert.deepEqual(Object.keys(createBody.properties).sort(), ['code', 'currency', 'projectId', 'tenderId', 'title']);
    assert.deepEqual(createBody.anyOf, [{ required: ['tenderId'] }, { required: ['projectId'] }]);

    const replaceBody = document.paths['/api/v1/boqs/{id}/revisions/{revId}/items'].put.requestBody.content['application/json'].schema;
    const itemSchema = replaceBody.properties.items.items;
    assert.equal(Object.hasOwn(itemSchema.properties, 'wbsNodeId'), true);
    assert.equal(Object.hasOwn(itemSchema.properties, 'costCodeId'), true);
    assert.equal(Object.hasOwn(itemSchema.properties, 'projectId'), false);
    assert.equal(Object.hasOwn(itemSchema.properties, 'costTypeId'), false);
    assert.equal(Object.hasOwn(itemSchema.properties, 'amount'), false);
  });
});
