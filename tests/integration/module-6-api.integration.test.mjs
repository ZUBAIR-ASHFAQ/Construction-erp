import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000006000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000006100';
const ADMIN_ID = '00000000-0000-4000-8000-000000006010';
const READER_ID = '00000000-0000-4000-8000-000000006011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000006110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000006020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000006021';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000006120';
const CLIENT_ID = '00000000-0000-4000-8000-000000006030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000006130';
const PROJECT_ID = '00000000-0000-4000-8000-000000006040';
const PROJECT_2_ID = '00000000-0000-4000-8000-000000006041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000006140';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000006050';
const INACTIVE_COST_TYPE_ID = '00000000-0000-4000-8000-000000006051';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000006150';
const PASSWORD = 'Module6-pass-182-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_6_PERMISSIONS = [
  'wbs.read',
  'wbs.manage',
  'cost_codes.read',
  'cost_codes.manage',
  'wbs.freeze'
];

let contextCounter = 0;

/** Load built runtime packages only when the disposable live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const { WbsCostCodesRepository, WbsCostCodesService } = await import('../../apps/api/dist/modules/wbs-cost-codes/index.js');
  return { testing, buildApp, hashPassword, WbsCostCodesRepository, WbsCostCodesService };
}

/** Seed the minimum company, identity, Project and Cost Type records needed by Module 6 integration tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 6 Company Ltd',
        displayName: 'Module 6 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 6 Foreign Company Ltd',
        displayName: 'Module 6 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_6_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('cost_codes.') ? 'cost_codes' : 'wbs' },
      create: { code, name: code, domain: code.startsWith('cost_codes.') ? 'cost_codes' : 'wbs' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      {
        id: ADMIN_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'system-admin',
        name: 'System Administrator',
        isSystem: true,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module-6-project-reader',
        name: 'Module 6 Project Reader',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: ADMIN_ROLE_B_ID,
        companyId: COMPANY_B_ID,
        code: 'system-admin',
        name: 'System Administrator',
        isSystem: true,
        status: 'ACTIVE'
      }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_6_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_6_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('wbs.read') }
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module6-admin@example.test', name: 'Module 6 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module6-reader@example.test', name: 'Module 6 Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module6-admin-b@example.test', name: 'Module 6 Admin B' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        userId: ADMIN_ID,
        roleId: ADMIN_ROLE_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_ID,
        userId: READER_ID,
        roleId: READER_ROLE_ID,
        scopeType: 'PROJECT',
        scopeId: PROJECT_ID,
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_B_ID,
        userId: ADMIN_B_ID,
        roleId: ADMIN_ROLE_B_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'MODULE6-CLIENT',
        legalName: 'Module 6 Client Ltd',
        displayName: 'Module 6 Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'MODULE6-FOREIGN-CLIENT',
        legalName: 'Module 6 Foreign Client Ltd',
        displayName: 'Module 6 Foreign Client',
        billingAddress: 'Karachi, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      }
    ]
  });

  await client.project.createMany({
    data: [
      {
        id: PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE6-PROJECT-A',
        name: 'Module 6 Project A',
        clientId: CLIENT_ID,
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
        projectCode: 'MODULE6-PROJECT-B',
        name: 'Module 6 Project B',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_B_ID,
        projectCode: 'MODULE6-FOREIGN-PROJECT',
        name: 'Module 6 Foreign Project',
        clientId: CLIENT_B_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_B_ID,
        location: 'Karachi, Pakistan'
      }
    ]
  });

  await client.projectMember.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      userId: READER_ID,
      projectRole: 'VIEWER',
      status: 'ACTIVE',
      fromDate
    }
  });

  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'LAB', name: 'Labor', status: 'ACTIVE' },
      { id: INACTIVE_COST_TYPE_ID, companyId: COMPANY_ID, code: 'OLD', name: 'Inactive Cost Type', status: 'INACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FOR', name: 'Foreign Cost Type', status: 'ACTIVE' }
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

/** Sign in one seeded user and return the server-issued access token. */
async function signIn(app, email = 'module6-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one WBS node through the reviewed public HTTP endpoint. */
async function createWbsNode(app, token, input) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/projects/${input.projectId ?? PROJECT_ID}/wbs/nodes`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      parentId: input.parentId ?? null,
      code: input.code,
      name: input.name,
      status: input.status ?? 'ACTIVE',
      sortOrder: input.sortOrder ?? 0
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one Company Cost Code through the reviewed public HTTP endpoint. */
async function createCostCode(app, token, code = '1000') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/cost-codes',
    headers: { authorization: `Bearer ${token}` },
    payload: { code, name: `Cost Code ${code}`, category: 'DIRECT', status: 'ACTIVE' }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one Company Cost Type through the repaired Pass-360 HTTP endpoint. */
async function createCostType(app, token, code = 'LAB-NEW') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/cost-types',
    headers: { authorization: `Bearer ${token}` },
    payload: { code, name: `Cost Type ${code}`, status: 'ACTIVE' }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Run direct service work with trusted company and all-Project request scope. */
async function runInAdminContext(runtime, work) {
  contextCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-6-integration-${contextCounter}`,
    correlationId: `module-6-integration-${contextCounter}`,
    actorUserId: ADMIN_ID,
    companyId: COMPANY_ID,
    permissions: MODULE_6_PERMISSIONS,
    projectScope: { kind: 'all' }
  }, work);
}

test('Module 6 full PostgreSQL/Fastify workflow persists hierarchy, mapping, freeze, audit and outbox', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data, {
      nodes: [],
      assignments: [],
      costStructureState: { projectId: PROJECT_ID, status: 'OPEN', revisionNo: 1, frozenAt: null }
    });

    const rootA = await createWbsNode(app, token, { code: 'A', name: 'Root A', sortOrder: 10 });
    const child = await createWbsNode(app, token, { parentId: rootA.id, code: 'A.1', name: 'Child A.1', sortOrder: 10 });
    const grandchild = await createWbsNode(app, token, { parentId: child.id, code: 'A.1.1', name: 'Leaf A.1.1', sortOrder: 10 });
    const rootB = await createWbsNode(app, token, { code: 'B', name: 'Root B', sortOrder: 20 });

    assert.equal(rootA.level, 0);
    assert.equal(child.level, 1);
    assert.equal(grandchild.level, 2);
    assert.equal(rootB.level, 0);
    assert.equal(Object.hasOwn(rootA, 'companyId'), false);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${rootA.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { parentId: rootB.id, name: 'Root A moved below Root B' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.level, 1);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const movedTree = response.json().data.nodes;
    assert.equal(movedTree.find((node) => node.id === rootA.id)?.level, 1);
    assert.equal(movedTree.find((node) => node.id === child.id)?.level, 2);
    assert.equal(movedTree.find((node) => node.id === grandchild.id)?.level, 3);

    const costCode = await createCostCode(app, token);
    assert.equal(costCode.code, '1000');
    assert.equal(Object.hasOwn(costCode, 'companyId'), false);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/cost-codes?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, costCode.id);

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assignments: [{
          wbsNodeId: grandchild.id,
          costCodeId: costCode.id,
          costTypeId: COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.assignments.length, 1);
    assert.equal(response.json().data.assignments[0].projectId, PROJECT_ID);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.assignments.length, 1);
    assert.equal(response.json().data.assignments[0].wbsNodeId, grandchild.id);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.projectId, PROJECT_ID);
    assert.equal(response.json().data.status, 'FROZEN');
    assert.equal(response.json().data.revisionNo, 1);
    assert.match(response.json().data.frozenAt, /^\d{4}-\d{2}-\d{2}T/);

    const durableState = await client.projectCostStructureState.findUnique({ where: { projectId: PROJECT_ID } });
    assert.equal(durableState?.status, 'FROZEN');
    assert.equal(durableState?.revisionNo, 1);
    assert.equal(durableState?.frozenBy, ADMIN_ID);

    const storedNodes = await client.wbsNode.findMany({ where: { projectId: PROJECT_ID }, orderBy: { code: 'asc' } });
    assert.equal(storedNodes.length, 4);
    assert.equal(storedNodes.find((node) => node.id === child.id)?.level, 2);
    assert.equal(storedNodes.find((node) => node.id === grandchild.id)?.level, 3);

    const mappings = await client.projectCostCode.findMany({ where: { projectId: PROJECT_ID } });
    assert.equal(mappings.length, 1);
    assert.equal(mappings[0].costTypeId, COST_TYPE_ID);

    const audits = await client.auditLog.findMany({
      where: {
        companyId: COMPANY_ID,
        action: {
          in: [
            'wbs.node_created',
            'wbs.updated',
            'cost_code.created',
            'project.cost_code_assignments_changed',
            'project.cost_structure_frozen'
          ]
        }
      },
      select: { action: true, actorUserId: true }
    });
    assert.equal(audits.filter((row) => row.action === 'wbs.node_created').length, 4);
    assert.equal(audits.filter((row) => row.action === 'wbs.updated').length, 1);
    assert.equal(audits.filter((row) => row.action === 'cost_code.created').length, 1);
    assert.equal(audits.filter((row) => row.action === 'project.cost_code_assignments_changed').length, 1);
    assert.equal(audits.filter((row) => row.action === 'project.cost_structure_frozen').length, 1);
    assert.equal(audits.every((row) => row.actorUserId === ADMIN_ID), true);

    const events = await client.outboxEvent.findMany({
      where: {
        companyId: COMPANY_ID,
        eventType: { in: ['wbs.node_created', 'wbs.updated', 'cost_code.created', 'project.cost_structure_frozen'] }
      },
      select: { eventType: true, actorUserId: true }
    });
    assert.equal(events.filter((row) => row.eventType === 'wbs.node_created').length, 4);
    assert.equal(events.filter((row) => row.eventType === 'wbs.updated').length, 1);
    assert.equal(events.filter((row) => row.eventType === 'cost_code.created').length, 1);
    assert.equal(events.filter((row) => row.eventType === 'project.cost_structure_frozen').length, 1);
    assert.equal(events.every((row) => row.actorUserId === ADMIN_ID), true);
  });
});


test('Pass 359 durable freeze blocks WBS and mapping writes until controlled reopen', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const node = await createWbsNode(app, token, { code: 'LOCK', name: 'Freeze Guard Node' });
    const costCode = await createCostCode(app, token, 'LOCK-COST');

    let response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assignments: [{
          wbsNodeId: node.id,
          costCodeId: costCode.id,
          costTypeId: COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const firstFreeze = response.json().data;
    assert.equal(firstFreeze.status, 'FROZEN');
    assert.equal(firstFreeze.revisionNo, 1);

    const blockedRequests = [
      {
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        payload: { parentId: null, code: 'BLOCKED', name: 'Blocked', status: 'ACTIVE', sortOrder: 0 }
      },
      {
        method: 'PATCH',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${node.id}`,
        payload: { name: 'Blocked rename' }
      },
      {
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        payload: { assignments: [] }
      }
    ];
    for (const blocked of blockedRequests) {
      const blockedResponse = await app.inject({
        ...blocked,
        headers: { authorization: `Bearer ${token}` }
      });
      assert.equal(blockedResponse.statusCode, 409, blockedResponse.body);
      assert.equal(errorCode(blockedResponse), 'WBS_COST_STRUCTURE_FROZEN');
    }

    await assert.rejects(
      client.$executeRawUnsafe(
        `UPDATE "wbs_nodes" SET "name" = 'DIRECT-BLOCKED' WHERE "id" = '${node.id}'::uuid`
      ),
      /Project cost structure is frozen/
    );
    await assert.rejects(
      client.$executeRawUnsafe(
        `DELETE FROM "project_cost_codes" WHERE "project_id" = '${PROJECT_ID}'::uuid`
      ),
      /Project cost structure is frozen/
    );

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.revisionNo, 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'project.cost_structure_frozen' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'project.cost_structure_frozen' } }), 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/reopen`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data, {
      projectId: PROJECT_ID,
      status: 'OPEN',
      revisionNo: 2,
      frozenAt: null
    });

    const reopenedState = await client.projectCostStructureState.findUnique({ where: { projectId: PROJECT_ID } });
    assert.equal(reopenedState?.status, 'OPEN');
    assert.equal(reopenedState?.revisionNo, 2);
    assert.equal(reopenedState?.frozenAt, null);
    assert.equal(reopenedState?.frozenBy, null);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'project.cost_structure_reopened' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'project.cost_structure_reopened' } }), 1);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${node.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { name: 'Editable after reopen' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.name, 'Editable after reopen');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/reopen`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.revisionNo, 2);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'project.cost_structure_reopened' } }), 1);
  });
});

test('Pass 360 Cost Type and archive lifecycle preserve history and block archived masters from new mappings', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const authorization = { authorization: `Bearer ${token}` };
    const node = await createWbsNode(app, token, { code: 'LIFE-WBS', name: 'Lifecycle WBS' });
    const costCode = await createCostCode(app, token, 'LIFE-COST');
    const costType = await createCostType(app, token, 'LIFE-TYPE');
    const mapping = {
      wbsNodeId: node.id,
      costCodeId: costCode.id,
      costTypeId: costType.id,
      isPostingAllowed: true,
      status: 'ACTIVE'
    };

    let response = await app.inject({ method: 'GET', url: '/api/v1/cost-types?page=1&pageSize=100', headers: authorization });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === costType.id), true);

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: authorization,
      payload: { assignments: [mapping] }
    });
    assert.equal(response.statusCode, 200, response.body);

    for (const [resource, id, table] of [
      ['cost-types', costType.id, 'costType'],
      ['cost-codes', costCode.id, 'costCode']
    ]) {
      response = await app.inject({ method: 'POST', url: `/api/v1/${resource}/${id}/archive`, headers: authorization });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.status, 'ARCHIVED');
      assert.equal((await client[table].findUnique({ where: { id } }))?.status, 'ARCHIVED');
      assert.equal(await client.projectCostCode.count({ where: { projectId: PROJECT_ID } }), 1);

      const blockedMapping = await app.inject({
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        headers: authorization,
        payload: { assignments: [mapping] }
      });
      assert.equal(blockedMapping.statusCode, 400, blockedMapping.body);
      assert.equal(errorCode(blockedMapping), 'INVALID_POSTING_COMBINATION');
      assert.equal(await client.projectCostCode.count({ where: { projectId: PROJECT_ID } }), 1);

      response = await app.inject({ method: 'POST', url: `/api/v1/${resource}/${id}/restore`, headers: authorization });
      assert.equal(response.statusCode, 200, response.body);
      assert.equal(response.json().data.status, 'ACTIVE');
    }

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${node.id}/archive`,
      headers: authorization
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ARCHIVED');
    assert.equal((await client.wbsNode.findUnique({ where: { id: node.id } }))?.status, 'ARCHIVED');
    assert.equal(await client.projectCostCode.count({ where: { projectId: PROJECT_ID } }), 1);

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: authorization,
      payload: { assignments: [mapping] }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_POSTING_COMBINATION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${node.id}/restore`,
      headers: authorization
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: authorization,
      payload: { assignments: [mapping] }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({ method: 'POST', url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`, headers: authorization });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${node.id}/archive`,
      headers: authorization
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'WBS_COST_STRUCTURE_FROZEN');

    response = await app.inject({ method: 'POST', url: `/api/v1/cost-types/${COST_TYPE_B_ID}/archive`, headers: authorization });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'RESOURCE_NOT_FOUND');

    assert.equal(await client.costType.count({ where: { id: costType.id } }), 1);
    assert.equal(await client.costCode.count({ where: { id: costCode.id } }), 1);
    assert.equal(await client.wbsNode.count({ where: { id: node.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: costType.id, action: 'cost_type.created' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: costType.id, action: 'cost_type.status_changed' } }), 2);
    assert.equal(await client.auditLog.count({ where: { entityId: costCode.id, action: 'cost_code.status_changed' } }), 2);
  });
});

test('Module 6 rejects duplicate hierarchy, cycles and invalid posting combinations without partial mapping state', { skip: !live }, async () => {
  await withApi(async ({ app, client, testing, WbsCostCodesService }) => {
    const token = await signIn(app);
    const rootA = await createWbsNode(app, token, { code: 'A', name: 'Root A' });
    const child = await createWbsNode(app, token, { parentId: rootA.id, code: 'A.1', name: 'Child A.1' });
    const rootB = await createWbsNode(app, token, { code: 'B', name: 'Root B' });
    const foreignProjectNode = await createWbsNode(app, token, { projectId: PROJECT_2_ID, code: 'P2', name: 'Project 2 Root' });
    const costCode = await createCostCode(app, token, '2000');

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
      headers: { authorization: `Bearer ${token}` },
      payload: { parentId: null, code: 'A', name: 'Duplicate Root A', status: 'ACTIVE', sortOrder: 2 }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'DUPLICATE_WBS_CODE');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${rootA.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { parentId: child.id }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'WBS_CYCLE_DETECTED');

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assignments: [{
          wbsNodeId: rootB.id,
          costCodeId: costCode.id,
          costTypeId: COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const originalMappingId = response.json().data.assignments[0].id;

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assignments: [{
          wbsNodeId: foreignProjectNode.id,
          costCodeId: costCode.id,
          costTypeId: COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_POSTING_COMBINATION');

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        assignments: [{
          wbsNodeId: rootB.id,
          costCodeId: costCode.id,
          costTypeId: INACTIVE_COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_POSTING_COMBINATION');

    const afterValidationFailures = await client.projectCostCode.findMany({ where: { projectId: PROJECT_ID } });
    assert.equal(afterValidationFailures.length, 1);
    assert.equal(afterValidationFailures[0].id, originalMappingId);

    await runInAdminContext({ testing }, async () => {
      const service = new WbsCostCodesService(client);
      await assert.rejects(service.replaceProjectCostCodeAssignments(PROJECT_ID, {
        assignments: [
          {
            wbsNodeId: rootB.id,
            costCodeId: costCode.id,
            costTypeId: COST_TYPE_ID,
            isPostingAllowed: true,
            status: 'ACTIVE'
          },
          {
            wbsNodeId: rootB.id,
            costCodeId: costCode.id,
            costTypeId: COST_TYPE_ID,
            isPostingAllowed: false,
            status: 'ACTIVE'
          }
        ]
      }));
    });

    const afterDatabaseRollback = await client.projectCostCode.findMany({ where: { projectId: PROJECT_ID } });
    assert.equal(afterDatabaseRollback.length, 1);
    assert.equal(afterDatabaseRollback[0].id, originalMappingId);

    const mappingAudits = await client.auditLog.count({
      where: { companyId: COMPANY_ID, entityId: PROJECT_ID, action: 'project.cost_code_assignments_changed' }
    });
    assert.equal(mappingAudits, 1);
  });
});

test('Module 6 HTTP boundary rejects invalid authority/input and one missing Project permission', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module6-reader@example.test');

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`
    });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/projects/not-a-uuid/wbs',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'AUTHORITY',
        name: 'Rejected authority input',
        status: 'ACTIVE',
        sortOrder: 0,
        level: 99,
        companyId: COMPANY_B_ID
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { code: 'NO-WRITE', name: 'Reader cannot create', status: 'ACTIVE', sortOrder: 0 }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_B_ID}/wbs`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
  });
});

test('Module 6 security enforces authentication, permissions and exact Project scope', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module6-reader@example.test');
    const root = await createWbsNode(app, adminToken, { code: 'SEC-ROOT', name: 'Security root' });
    const costCode = await createCostCode(app, adminToken, 'SEC-1000');

    const protectedRequests = [
      { method: 'GET', url: `/api/v1/projects/${PROJECT_ID}/wbs` },
      {
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        payload: { code: 'SEC-NO-AUTH', name: 'No auth', status: 'ACTIVE', sortOrder: 0 }
      },
      {
        method: 'PATCH',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${root.id}`,
        payload: { name: 'No auth update' }
      },
      { method: 'GET', url: '/api/v1/cost-codes?page=1&pageSize=10' },
      {
        method: 'POST',
        url: '/api/v1/cost-codes',
        payload: { code: 'SEC-NO-AUTH-COST', name: 'No auth', category: 'DIRECT', status: 'ACTIVE' }
      },
      {
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        payload: {
          assignments: [{
            wbsNodeId: root.id,
            costCodeId: costCode.id,
            costTypeId: COST_TYPE_ID,
            isPostingAllowed: true,
            status: 'ACTIVE'
          }]
        }
      },
      { method: 'POST', url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`, payload: {} }
    ];

    for (const request of protectedRequests) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 401, response.body);
      assert.equal(errorCode(response), 'AUTHENTICATION_REQUIRED');
    }

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/wbs`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    const readerDeniedRequests = [
      {
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        payload: { code: 'SEC-READER-WRITE', name: 'Reader write', status: 'ACTIVE', sortOrder: 0 }
      },
      {
        method: 'PATCH',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes/${root.id}`,
        payload: { name: 'Reader update' }
      },
      { method: 'GET', url: '/api/v1/cost-codes?page=1&pageSize=10' },
      {
        method: 'POST',
        url: '/api/v1/cost-codes',
        payload: { code: 'SEC-READER-COST', name: 'Reader cost code', category: 'DIRECT', status: 'ACTIVE' }
      },
      {
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        payload: { assignments: [] }
      },
      { method: 'POST', url: `/api/v1/projects/${PROJECT_ID}/wbs/freeze`, payload: {} }
    ];

    for (const request of readerDeniedRequests) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${readerToken}` }
      });
      assert.equal(denied.statusCode, 403, denied.body);
      assert.equal(errorCode(denied), 'FORBIDDEN');
    }

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_2_ID}/wbs`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');
  });
});

test('Module 6 security isolates companies and rejects client-owned authority at HTTP, repository and service boundaries', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client, WbsCostCodesRepository, WbsCostCodesService } = runtime;
    const adminAToken = await signIn(app);
    const adminBToken = await signIn(app, 'module6-admin-b@example.test');
    const readerToken = await signIn(app, 'module6-reader@example.test');

    const rootA = await createWbsNode(app, adminAToken, { code: 'SEC-A', name: 'Company A root' });
    const rootB = await createWbsNode(app, adminBToken, {
      projectId: PROJECT_B_ID,
      code: 'SEC-B',
      name: 'Company B root'
    });
    const costCodeA = await createCostCode(app, adminAToken, 'SEC-A-COST');
    const costCodeB = await createCostCode(app, adminBToken, 'SEC-B-COST');

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_B_ID}/wbs`,
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/cost-codes?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === costCodeA.id), true);
    assert.equal(response.json().data.items.some((item) => item.id === costCodeB.id), false);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/cost-codes?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === costCodeA.id), false);
    assert.equal(response.json().data.items.some((item) => item.id === costCodeB.id), true);

    const authorityFields = [
      ['companyId', COMPANY_B_ID],
      ['actorUserId', ADMIN_B_ID],
      ['permissions', ['wbs.manage']],
      ['projectScope', { kind: 'all' }]
    ];

    for (const [field, value] of authorityFields) {
      response = await app.inject({
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        headers: { authorization: `Bearer ${adminAToken}` },
        payload: {
          code: `AUTH-${field}`,
          name: `Rejected ${field}`,
          status: 'ACTIVE',
          sortOrder: 0,
          [field]: value
        }
      });
      assert.equal(response.statusCode, 400, response.body);
      assert.equal(errorCode(response), 'INVALID_REQUEST');
    }

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        assignments: [{
          projectId: PROJECT_2_ID,
          wbsNodeId: rootA.id,
          costCodeId: costCodeA.id,
          costTypeId: COST_TYPE_ID,
          isPostingAllowed: true,
          status: 'ACTIVE'
        }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/cost-codes?page=1&pageSize=10&companyId=${COMPANY_B_ID}`,
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_2_ID}/wbs`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    await runInAdminContext(runtime, async () => {
      const repository = new WbsCostCodesRepository(client);
      assert.equal(await repository.findProjectById(PROJECT_B_ID), null);
      assert.deepEqual(await repository.listWbsNodes(PROJECT_B_ID), []);
      assert.deepEqual(await repository.listProjectCostCodeAssignments(PROJECT_B_ID), []);

      const costCodes = await repository.listCostCodes({ skip: 0, take: 100 });
      assert.equal(costCodes.items.some((item) => item.id === costCodeA.id), true);
      assert.equal(costCodes.items.some((item) => item.id === costCodeB.id), false);

      await assert.rejects(
        new WbsCostCodesService(client).getWbsTree(PROJECT_B_ID),
        (error) => error?.statusCode === 404
      );
    });

    await runtime.testing.runWithAuthenticatedTestContext({
      requestId: 'module-6-security-reader-direct',
      correlationId: 'module-6-security-reader-direct',
      actorUserId: READER_ID,
      companyId: COMPANY_ID,
      permissions: ['wbs.read'],
      projectScope: { kind: 'restricted', projectIds: [PROJECT_ID] }
    }, async () => {
      const service = new WbsCostCodesService(client);
      await assert.rejects(service.getWbsTree(PROJECT_2_ID), (error) => error?.statusCode === 403);
      await assert.rejects(
        service.createWbsNode(PROJECT_ID, {
          parentId: null,
          code: 'DIRECT-READER-WRITE',
          name: 'Direct reader write',
          status: 'ACTIVE',
          sortOrder: 0
        }),
        (error) => error?.statusCode === 403
      );
      await assert.rejects(service.listCostCodes({ page: 1, pageSize: 10 }), (error) => error?.statusCode === 403);
    });

    assert.notEqual(rootA.id, rootB.id);
  });
});

test('Module 6 security attacks live ownership and mapping constraints directly', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminAToken = await signIn(app);
    const adminBToken = await signIn(app, 'module6-admin-b@example.test');
    const rootA = await createWbsNode(app, adminAToken, { code: 'DB-SEC-A', name: 'Database security root A' });
    const foreignCostCode = await createCostCode(app, adminBToken, 'DB-SEC-B-COST');

    await assert.rejects(client.wbsNode.create({
      data: {
        companyId: COMPANY_B_ID,
        projectId: PROJECT_ID,
        parentId: null,
        code: 'DB-CROSS-COMPANY',
        name: 'Cross-company WBS must fail',
        level: 0,
        status: 'ACTIVE',
        sortOrder: 0
      }
    }));

    await assert.rejects(client.wbsNode.create({
      data: {
        companyId: COMPANY_ID,
        projectId: PROJECT_2_ID,
        parentId: rootA.id,
        code: 'DB-CROSS-PROJECT-PARENT',
        name: 'Cross-project parent must fail',
        level: 1,
        status: 'ACTIVE',
        sortOrder: 0
      }
    }));

    await assert.rejects(client.wbsNode.create({
      data: {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        parentId: null,
        code: rootA.code,
        name: 'Duplicate root code must fail',
        level: 0,
        status: 'ACTIVE',
        sortOrder: 0
      }
    }));

    await assert.rejects(client.projectCostCode.create({
      data: {
        projectId: PROJECT_ID,
        wbsNodeId: rootA.id,
        costCodeId: foreignCostCode.id,
        costTypeId: COST_TYPE_ID,
        isPostingAllowed: true,
        status: 'ACTIVE'
      }
    }));

    await assert.rejects(client.projectCostCode.create({
      data: {
        projectId: PROJECT_2_ID,
        wbsNodeId: rootA.id,
        costCodeId: (await client.costCode.findFirstOrThrow({ where: { companyId: COMPANY_ID } })).id,
        costTypeId: COST_TYPE_ID,
        isPostingAllowed: true,
        status: 'ACTIVE'
      }
    }));
  });
});


/** Return one generated Module 6 OpenAPI operation and fail clearly when it is missing. */
function module6OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Read the documented stable error-code enum for one generated Module 6 response. */
function module6OpenApiErrorCodes(operation, statusCode) {
  const schema = operation.responses?.[String(statusCode)]?.content?.['application/json']?.schema;
  assert.ok(schema, `Missing OpenAPI ${statusCode} response schema`);
  assert.deepEqual(schema.required, ['error']);
  assert.equal(Object.hasOwn(schema.properties ?? {}, 'requestId'), false);

  const errorSchema = schema.properties?.error;
  assert.ok(errorSchema, `Missing OpenAPI ${statusCode} error envelope`);
  assert.deepEqual(errorSchema.required, ['code', 'message', 'requestId']);
  return errorSchema.properties?.code?.enum ?? [];
}

/** Return one generated success data schema for focused public-field assertions. */
function module6OpenApiDataSchema(operation, statusCode) {
  const schema = operation.responses?.[String(statusCode)]?.content?.['application/json']?.schema;
  assert.ok(schema, `Missing OpenAPI ${statusCode} success schema`);
  assert.deepEqual(schema.required, ['data']);
  return schema.properties?.data;
}

test('Module 6 API contract exposes the seven source operations plus the Pass 359 reopen repair with stable schemas', { skip: !live }, async () => {
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
      ['GET', '/api/v1/projects/{projectId}/wbs', 'module6GetWbsTree'],
      ['POST', '/api/v1/projects/{projectId}/wbs/nodes', 'module6CreateWbsNode'],
      ['PATCH', '/api/v1/projects/{projectId}/wbs/nodes/{id}', 'module6UpdateWbsNode'],
      ['POST', '/api/v1/projects/{projectId}/wbs/nodes/{id}/archive', 'module6ArchiveWbsNode'],
      ['POST', '/api/v1/projects/{projectId}/wbs/nodes/{id}/restore', 'module6RestoreWbsNode'],
      ['GET', '/api/v1/cost-codes', 'module6ListCostCodes'],
      ['POST', '/api/v1/cost-codes', 'module6CreateCostCode'],
      ['POST', '/api/v1/cost-codes/{id}/archive', 'module6ArchiveCostCode'],
      ['POST', '/api/v1/cost-codes/{id}/restore', 'module6RestoreCostCode'],
      ['GET', '/api/v1/cost-types', 'module6ListCostTypes'],
      ['POST', '/api/v1/cost-types', 'module6CreateCostType'],
      ['POST', '/api/v1/cost-types/{id}/archive', 'module6ArchiveCostType'],
      ['POST', '/api/v1/cost-types/{id}/restore', 'module6RestoreCostType'],
      ['PUT', '/api/v1/projects/{projectId}/cost-code-assignments', 'module6ReplaceProjectCostCodeAssignments'],
      ['POST', '/api/v1/projects/{projectId}/wbs/freeze', 'module6FreezeWbs'],
      ['POST', '/api/v1/projects/{projectId}/wbs/reopen', 'module6ReopenWbs']
    ];
    const actualOperations = [];

    for (const [method, route, operationId] of expectedOperations) {
      const operation = module6OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actualOperations.push(`${method} ${route}`);
    }

    const documentedModule6Operations = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem[method];
        if (operation?.operationId?.startsWith('module6')) {
          documentedModule6Operations.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(documentedModule6Operations.sort(), actualOperations.sort());

    for (const forbiddenPath of [
      '/api/v1/projects/{projectId}/wbs/archive'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }
    assert.equal(documentedModule6Operations.some((operation) => operation.startsWith('DELETE ')), false);

    const createNode = module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs/nodes', 'POST');
    const createNodeBody = createNode.requestBody.content['application/json'].schema;
    assert.equal(createNodeBody.additionalProperties, false);
    assert.deepEqual(createNodeBody.required, ['code', 'name', 'status', 'sortOrder']);
    assert.deepEqual(Object.keys(createNodeBody.properties).sort(), ['code', 'name', 'parentId', 'sortOrder', 'status']);

    const updateNode = module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs/nodes/{id}', 'PATCH');
    const updateNodeBody = updateNode.requestBody.content['application/json'].schema;
    assert.equal(updateNodeBody.additionalProperties, false);
    assert.equal(updateNodeBody.minProperties, 1);
    assert.deepEqual(Object.keys(updateNodeBody.properties).sort(), ['code', 'name', 'parentId', 'sortOrder', 'status']);

    const createCostCode = module6OpenApiOperation(document, '/api/v1/cost-codes', 'POST');
    const createCostCodeBody = createCostCode.requestBody.content['application/json'].schema;
    assert.equal(createCostCodeBody.additionalProperties, false);
    assert.deepEqual(createCostCodeBody.required, ['code', 'name', 'category', 'status']);
    assert.deepEqual(Object.keys(createCostCodeBody.properties).sort(), ['category', 'code', 'name', 'status']);

    const createCostType = module6OpenApiOperation(document, '/api/v1/cost-types', 'POST');
    const createCostTypeBody = createCostType.requestBody.content['application/json'].schema;
    assert.equal(createCostTypeBody.additionalProperties, false);
    assert.deepEqual(createCostTypeBody.required, ['code', 'name', 'status']);
    assert.deepEqual(Object.keys(createCostTypeBody.properties).sort(), ['code', 'name', 'status']);

    const replaceMappings = module6OpenApiOperation(
      document,
      '/api/v1/projects/{projectId}/cost-code-assignments',
      'PUT'
    );
    const mappingBody = replaceMappings.requestBody.content['application/json'].schema;
    assert.equal(mappingBody.additionalProperties, false);
    assert.deepEqual(mappingBody.required, ['assignments']);
    const mappingItem = mappingBody.properties.assignments.items;
    assert.equal(mappingItem.additionalProperties, false);
    assert.deepEqual(mappingItem.required, ['wbsNodeId', 'costCodeId', 'costTypeId', 'isPostingAllowed', 'status']);
    assert.deepEqual(Object.keys(mappingItem.properties).sort(), [
      'costCodeId', 'costTypeId', 'isPostingAllowed', 'status', 'wbsNodeId'
    ]);

    for (const forbiddenField of [
      'companyId', 'actorUserId', 'permissions', 'projectScope',
      'effectivePermissions', 'projectId', 'level'
    ]) {
      assert.equal(Object.hasOwn(createNodeBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(updateNodeBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(createCostCodeBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(createCostTypeBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(mappingItem.properties, forbiddenField), false, forbiddenField);
    }

    const freeze = module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs/freeze', 'POST');
    const reopen = module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs/reopen', 'POST');
    const archiveWbs = module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs/nodes/{id}/archive', 'POST');
    const archiveCostCode = module6OpenApiOperation(document, '/api/v1/cost-codes/{id}/archive', 'POST');
    const archiveCostType = module6OpenApiOperation(document, '/api/v1/cost-types/{id}/archive', 'POST');
    assert.equal(freeze.requestBody, undefined);
    assert.equal(reopen.requestBody, undefined);
    assert.equal(archiveWbs.requestBody, undefined);
    assert.equal(archiveCostCode.requestBody, undefined);
    assert.equal(archiveCostType.requestBody, undefined);

    const treeData = module6OpenApiDataSchema(
      module6OpenApiOperation(document, '/api/v1/projects/{projectId}/wbs', 'GET'),
      200
    );
    assert.deepEqual(treeData.required, ['nodes', 'assignments', 'costStructureState']);
    assert.deepEqual(treeData.properties.costStructureState.required, ['projectId', 'status', 'revisionNo', 'frozenAt']);
    assert.equal(Object.hasOwn(treeData.properties.nodes.items.properties, 'companyId'), false);
    assert.equal(Object.hasOwn(treeData.properties.nodes.items.properties, 'level'), true);
    assert.equal(Object.hasOwn(treeData.properties.assignments.items.properties, 'companyId'), false);

    const costCodeListData = module6OpenApiDataSchema(
      module6OpenApiOperation(document, '/api/v1/cost-codes', 'GET'),
      200
    );
    assert.deepEqual(costCodeListData.required, ['items', 'total', 'page', 'pageSize']);
    assert.equal(Object.hasOwn(costCodeListData.properties.items.items.properties, 'companyId'), false);

    const costTypeListData = module6OpenApiDataSchema(
      module6OpenApiOperation(document, '/api/v1/cost-types', 'GET'),
      200
    );
    assert.deepEqual(costTypeListData.required, ['items', 'total', 'page', 'pageSize']);
    assert.equal(Object.hasOwn(costTypeListData.properties.items.items.properties, 'companyId'), false);

    assert.deepEqual(module6OpenApiErrorCodes(createNode, 409), ['DUPLICATE_WBS_CODE', 'WBS_COST_STRUCTURE_FROZEN']);
    assert.deepEqual(module6OpenApiErrorCodes(updateNode, 409), ['DUPLICATE_WBS_CODE', 'WBS_COST_STRUCTURE_FROZEN']);
    assert.deepEqual(module6OpenApiErrorCodes(replaceMappings, 409), ['WBS_COST_STRUCTURE_FROZEN']);
    assert.deepEqual(module6OpenApiErrorCodes(updateNode, 400), ['INVALID_REQUEST', 'WBS_CYCLE_DETECTED']);
    assert.deepEqual(module6OpenApiErrorCodes(updateNode, 404), ['RESOURCE_NOT_FOUND', 'WBS_NODE_NOT_FOUND']);
    assert.deepEqual(module6OpenApiErrorCodes(replaceMappings, 400), ['INVALID_REQUEST', 'INVALID_POSTING_COMBINATION']);
    assert.deepEqual(module6OpenApiErrorCodes(createCostCode, 409), ['BUSINESS_CONFLICT']);
    assert.deepEqual(module6OpenApiErrorCodes(createCostType, 409), ['BUSINESS_CONFLICT']);
    assert.deepEqual(module6OpenApiErrorCodes(archiveWbs, 409), ['WBS_COST_STRUCTURE_FROZEN']);

    for (const [method, route] of expectedOperations.map(([method, route]) => [method, route])) {
      const operation = module6OpenApiOperation(document, route, method);
      assert.deepEqual(module6OpenApiErrorCodes(operation, 401), ['AUTHENTICATION_REQUIRED']);
      assert.deepEqual(module6OpenApiErrorCodes(operation, 403), ['FORBIDDEN']);
      assert.deepEqual(module6OpenApiErrorCodes(operation, 500), ['INTERNAL_SERVER_ERROR']);
    }

    const exposedCodes = new Set();
    for (const [method, route] of expectedOperations.map(([method, route]) => [method, route])) {
      const operation = module6OpenApiOperation(document, route, method);
      for (const statusCode of Object.keys(operation.responses ?? {})) {
        if (Number(statusCode) < 400) continue;
        for (const code of module6OpenApiErrorCodes(operation, statusCode)) exposedCodes.add(code);
      }
    }
    for (const code of ['WBS_NODE_NOT_FOUND', 'DUPLICATE_WBS_CODE', 'WBS_CYCLE_DETECTED', 'INVALID_POSTING_COMBINATION']) {
      assert.equal(exposedCodes.has(code), true, code);
    }
    assert.equal(exposedCodes.has('COST_CODE_IN_USE'), false);
  });
});

// Prove concurrent Module 6 writes serialize cleanly and failed duplicates leave no partial side effects.
test('Module 6 operational concurrency keeps duplicate creates and mapping replacement atomic', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const authorization = { authorization: `Bearer ${token}` };

    const duplicateWbsPayload = {
      parentId: null,
      code: 'OPS-DUP-WBS',
      name: 'Concurrent duplicate WBS',
      status: 'ACTIVE',
      sortOrder: 10
    };
    const duplicateWbsResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        headers: authorization,
        payload: duplicateWbsPayload
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/projects/${PROJECT_ID}/wbs/nodes`,
        headers: authorization,
        payload: duplicateWbsPayload
      })
    ]);

    assert.deepEqual(duplicateWbsResponses.map((response) => response.statusCode).sort(), [201, 409]);
    const wbsWinner = duplicateWbsResponses.find((response) => response.statusCode === 201);
    const wbsLoser = duplicateWbsResponses.find((response) => response.statusCode === 409);
    assert.ok(wbsWinner);
    assert.ok(wbsLoser);
    assert.equal(errorCode(wbsLoser), 'DUPLICATE_WBS_CODE');
    const winningWbs = wbsWinner.json().data;
    assert.equal(await client.wbsNode.count({ where: { projectId: PROJECT_ID, parentId: null, code: 'OPS-DUP-WBS' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: winningWbs.id, action: 'wbs.node_created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: winningWbs.id, eventType: 'wbs.node_created' } }), 1);

    const duplicateCostCodePayload = {
      code: 'OPS-DUP-COST',
      name: 'Concurrent duplicate Cost Code',
      category: 'DIRECT',
      status: 'ACTIVE'
    };
    const duplicateCostCodeResponses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/cost-codes', headers: authorization, payload: duplicateCostCodePayload }),
      app.inject({ method: 'POST', url: '/api/v1/cost-codes', headers: authorization, payload: duplicateCostCodePayload })
    ]);

    assert.deepEqual(duplicateCostCodeResponses.map((response) => response.statusCode).sort(), [201, 409]);
    const costCodeWinner = duplicateCostCodeResponses.find((response) => response.statusCode === 201);
    assert.ok(costCodeWinner);
    const winningCostCode = costCodeWinner.json().data;
    assert.equal(await client.costCode.count({ where: { companyId: COMPANY_ID, code: 'OPS-DUP-COST' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: winningCostCode.id, action: 'cost_code.created' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: winningCostCode.id, eventType: 'cost_code.created' } }), 1);

    const wbsA = await createWbsNode(app, token, { code: 'OPS-MAP-A', name: 'Mapping node A', sortOrder: 20 });
    const wbsB = await createWbsNode(app, token, { code: 'OPS-MAP-B', name: 'Mapping node B', sortOrder: 30 });
    const costCodeA = await createCostCode(app, token, 'OPS-MAP-100');
    const costCodeB = await createCostCode(app, token, 'OPS-MAP-200');

    const mappingSetA = [
      { wbsNodeId: wbsA.id, costCodeId: costCodeA.id, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { wbsNodeId: wbsB.id, costCodeId: costCodeB.id, costTypeId: COST_TYPE_ID, isPostingAllowed: false, status: 'ACTIVE' }
    ];
    const mappingSetB = [
      { wbsNodeId: wbsB.id, costCodeId: costCodeA.id, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ];

    const mappingResponses = await Promise.all([
      app.inject({
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        headers: authorization,
        payload: { assignments: mappingSetA }
      }),
      app.inject({
        method: 'PUT',
        url: `/api/v1/projects/${PROJECT_ID}/cost-code-assignments`,
        headers: authorization,
        payload: { assignments: mappingSetB }
      })
    ]);

    assert.deepEqual(mappingResponses.map((response) => response.statusCode).sort(), [200, 200]);
    const persistedMappings = await client.projectCostCode.findMany({
      where: { projectId: PROJECT_ID },
      orderBy: [{ wbsNodeId: 'asc' }, { costCodeId: 'asc' }, { costTypeId: 'asc' }]
    });
    const persistedShape = persistedMappings.map((mapping) => ({
      wbsNodeId: mapping.wbsNodeId,
      costCodeId: mapping.costCodeId,
      costTypeId: mapping.costTypeId,
      isPostingAllowed: mapping.isPostingAllowed,
      status: mapping.status
    }));
    const candidateShapes = [mappingSetA, mappingSetB].map((set) => [...set].sort((left, right) => {
      const leftKey = `${left.wbsNodeId}:${left.costCodeId}:${left.costTypeId}`;
      const rightKey = `${right.wbsNodeId}:${right.costCodeId}:${right.costTypeId}`;
      return leftKey.localeCompare(rightKey);
    }));

    assert.equal(candidateShapes.some((candidate) => JSON.stringify(candidate) === JSON.stringify(persistedShape)), true);
    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_ID, entityType: 'project', entityId: PROJECT_ID, action: 'project.cost_code_assignments_changed' }
    }), 2);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, resourceId: PROJECT_ID, eventType: 'project.cost_code_assignments_changed' }
    }), 0);
  });
});

// Verify reviewed Module 6 indexes can support the bounded WBS, mapping and Company Cost Code read paths.
test('Module 6 operational query plans can use reviewed read-path indexes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const wbsPlanRows = await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, code, level, sort_order
        FROM wbs_nodes
        WHERE project_id = '${PROJECT_ID}'::uuid
          AND parent_id IS NULL
        ORDER BY sort_order ASC
        LIMIT 50
      `);
      const wbsPlan = JSON.stringify(wbsPlanRows);
      assert.match(wbsPlan, /wbs_nodes_project_parent_sort_idx/);

      const mappingPlanRows = await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT wbs_node_id, cost_code_id, cost_type_id
        FROM project_cost_codes
        WHERE project_id = '${PROJECT_ID}'::uuid
        ORDER BY wbs_node_id ASC, cost_code_id ASC, cost_type_id ASC
        LIMIT 50
      `);
      const mappingPlan = JSON.stringify(mappingPlanRows);
      assert.match(mappingPlan, /project_cost_codes_combination_uq/);

      const costCodePlanRows = await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, code
        FROM cost_codes
        WHERE company_id = '${COMPANY_ID}'::uuid
        ORDER BY code ASC
        LIMIT 50
      `);
      const costCodePlan = JSON.stringify(costCodePlanRows);
      assert.match(costCodePlan, /cost_codes_company_code_uq/);
    });
  });
});
