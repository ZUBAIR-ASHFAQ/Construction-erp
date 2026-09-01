import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000017001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000017002';
const ADMIN_ID = '00000000-0000-4000-8000-000000017010';
const READER_ID = '00000000-0000-4000-8000-000000017011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000017012';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000017020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000017021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000017022';
const CLIENT_ID = '00000000-0000-4000-8000-000000017030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000017031';
const PROJECT_ID = '00000000-0000-4000-8000-000000017040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000017041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000017042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000017043';
const WBS_ID = '00000000-0000-4000-8000-000000017050';
const OTHER_WBS_ID = '00000000-0000-4000-8000-000000017051';
const WBS_B_ID = '00000000-0000-4000-8000-000000017052';
const COST_CODE_ID = '00000000-0000-4000-8000-000000017060';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000017061';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000017070';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000017071';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000017080';
const OTHER_COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000017081';
const COST_STRUCTURE_B_ID = '00000000-0000-4000-8000-000000017082';
const BUDGET_ID = '00000000-0000-4000-8000-000000017090';
const OTHER_BUDGET_ID = '00000000-0000-4000-8000-000000017091';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000017100';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000017101';
const APPROVAL_DEFINITION_CODE = 'CHANGE_REQUEST';
const PASSWORD = 'Module17-pass-341-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module17-auth-secret-0123456789abcdef';

const MODULE_17_PERMISSIONS = [
  'changes.read',
  'changes.create',
  'changes.estimate',
  'changes.submit',
  'changes.approve',
  'changes.apply'
];
const APPROVAL_PERMISSIONS = ['approvals.inbox.read', 'approvals.act'];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest two-Company Project, RBAC, Budget and Approval graph needed by Module 17. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 17 Company Ltd',
        displayName: 'Module 17 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 17 Foreign Company Ltd',
        displayName: 'Module 17 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const allPermissions = [...MODULE_17_PERMISSIONS, ...APPROVAL_PERMISSIONS];
  const permissions = [];
  for (const code of allPermissions) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('changes.') ? 'change-orders' : 'approvals' },
      create: { code, name: code, domain: code.startsWith('changes.') ? 'change-orders' : 'approvals' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-17-admin', name: 'Module 17 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-17-reader', name: 'Module 17 Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-17-admin', name: 'Module 17 Foreign Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...allPermissions.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('changes.read') },
      ...MODULE_17_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module17-admin@example.test', name: 'Module 17 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module17-reader@example.test', name: 'Module 17 Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module17-admin-b@example.test', name: 'Module 17 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M17-CLIENT', legalName: 'Module 17 Client Ltd', displayName: 'Module 17 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M17-CLIENT-B', legalName: 'Module 17 Foreign Client Ltd', displayName: 'Module 17 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M17-A', name: 'Module 17 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M17-OTHER', name: 'Module 17 Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: CLOSED_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M17-CLOSED', name: 'Module 17 Closed Project', clientId: CLIENT_ID, status: 'CLOSED', currency: 'USD', startDate: new Date('2025-01-01T00:00:00.000Z'), plannedEndDate: new Date('2025-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M17-B', name: 'Module 17 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.create({
    data: { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'PROJECT_VIEWER', status: 'ACTIVE', fromDate }
  });

  await client.wbsNode.createMany({
    data: [
      { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'CHG', name: 'Change WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: OTHER_WBS_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, parentId: null, code: 'CHG', name: 'Other Change WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, parentId: null, code: 'CHG', name: 'Foreign Change WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
    ]
  });
  await client.costCode.createMany({
    data: [
      { id: COST_CODE_ID, companyId: COMPANY_ID, code: '1700', name: 'Variation Cost', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9700', name: 'Foreign Variation Cost', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });
  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'VAR', name: 'Variation', status: 'ACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FVR', name: 'Foreign Variation', status: 'ACTIVE' }
    ]
  });
  await client.projectCostCode.createMany({
    data: [
      { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: OTHER_COST_STRUCTURE_ID, projectId: OTHER_PROJECT_ID, wbsNodeId: OTHER_WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_B_ID, projectId: PROJECT_B_ID, wbsNodeId: WBS_B_ID, costCodeId: COST_CODE_B_ID, costTypeId: COST_TYPE_B_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ]
  });

  await client.projectBudget.createMany({
    data: [
      { id: BUDGET_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, versionNo: 1, budgetType: 'BASELINE', status: 'FROZEN', approvedAt: new Date('2026-01-10T00:00:00.000Z'), totalCost: '1000.00', totalRevenue: '1500.00' },
      { id: OTHER_BUDGET_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, versionNo: 1, budgetType: 'BASELINE', status: 'FROZEN', approvedAt: new Date('2026-01-10T00:00:00.000Z'), totalCost: '500.00', totalRevenue: '800.00' }
    ]
  });
  await client.budgetLine.createMany({
    data: [
      { budgetId: BUDGET_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, quantity: null, unitRate: null, amount: '1000.00', revenueAmount: '1500.00' },
      { budgetId: OTHER_BUDGET_ID, wbsNodeId: OTHER_WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, quantity: null, unitRate: null, amount: '500.00', revenueAmount: '800.00' }
    ]
  });

  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'change-request', prefix: 'CR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'change-request', prefix: 'CRB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });

  await client.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: APPROVAL_DEFINITION_CODE,
      name: 'Change Request Approval',
      resourceType: 'change_request',
      conditionJson: [],
      status: 'ACTIVE',
      versionNo: 1,
      steps: {
        create: [{
          id: APPROVAL_STEP_ID,
          stepNo: 1,
          approverType: 'USER',
          approverRef: ADMIN_ID,
          minApprovals: 1,
          conditionJson: null,
          reminderAfterMinutes: null,
          escalateAfterMinutes: null,
          expireAfterMinutes: null
        }]
      }
    }
  });
}

/** Build one fresh Fastify app over the explicitly disposable PostgreSQL integration database. */
async function withApi(work, options = {}) {
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
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET,
      changeRequestApprovalDefinitionCode: APPROVAL_DEFINITION_CODE,
      ...options
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user through the real Module-24A route and return its access token. */
async function signIn(app, email = 'module17-admin@example.test') {
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

/** Send one reviewed Change Order mutation with the mandatory Foundation Idempotency-Key. */
async function changeWrite(app, token, method, url, payload, key) {
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

/** Create one server-numbered Change Request through the reviewed public API. */
async function createChangeRequest(app, token, overrides = {}, key = 'module17-create-request') {
  const response = await changeWrite(
    app,
    token,
    'POST',
    '/api/v1/change-orders/requests',
    {
      projectId: overrides.projectId ?? PROJECT_ID,
      changeType: overrides.changeType ?? 'CLIENT_VARIATION',
      title: overrides.title ?? 'Foundation scope variation',
      description: overrides.description ?? 'Additional foundation scope requested by the client.',
      reason: overrides.reason ?? 'Issued design change.',
      ...(overrides.extraBody ?? {})
    },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Replace one Change Request estimate with a single complete Project cost-structure line. */
async function replaceChangeLines(app, token, changeRequestId, overrides = {}, key = 'module17-replace-lines') {
  const response = await changeWrite(
    app,
    token,
    'PUT',
    `/api/v1/change-orders/requests/${changeRequestId}/lines`,
    {
      lines: [{
        wbsNodeId: overrides.wbsNodeId ?? WBS_ID,
        costCodeId: overrides.costCodeId ?? COST_CODE_ID,
        costTypeId: overrides.costTypeId ?? COST_TYPE_ID,
        description: overrides.description ?? 'Additional reinforced concrete work',
        costAmount: overrides.costAmount ?? '125.50',
        revenueAmount: overrides.revenueAmount ?? '175.75',
        boqItemId: null
      }]
    },
    key
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Submit one Change Request through the reviewed Module-17 command. */
async function submitChangeRequest(app, token, changeRequestId, key = 'module17-submit-request') {
  const response = await changeWrite(
    app,
    token,
    'POST',
    `/api/v1/change-orders/requests/${changeRequestId}/submit`,
    {},
    key
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Resolve the Module-22 Approval Request created for one Change Request. */
async function findApprovalRequest(client, changeRequestId) {
  return client.approvalRequest.findFirstOrThrow({
    where: { companyId: COMPANY_ID, resourceType: 'change_request', resourceId: changeRequestId },
    orderBy: [{ requestedAt: 'desc' }, { id: 'desc' }]
  });
}

/** Complete the current Module-22 approval step through its real public action route. */
async function actOnApproval(app, token, approvalRequestId, action, key) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/approvals/requests/${approvalRequestId}/actions`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key
    },
    payload: { action, comment: `${action} from Module 17 integration verification.` }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Prepare one submitted Change Request with valid exact-decimal estimate lines. */
async function prepareSubmittedChange(app, client, token, suffix) {
  const request = await createChangeRequest(app, token, { title: `Change ${suffix}` }, `module17-${suffix}-create`);
  await replaceChangeLines(app, token, request.id, {}, `module17-${suffix}-lines`);
  const submitted = await submitChangeRequest(app, token, request.id, `module17-${suffix}-submit`);
  const approval = await findApprovalRequest(client, request.id);
  return { request: submitted, approval };
}

/** Return one generated Module-17 OpenAPI operation and fail clearly when it is absent. */
function module17OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Install one disposable PostgreSQL trigger that forces a selected Module-17 outbox event to fail. */
async function installModule17OutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_17_test_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 17 forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_17_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_17_test_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_17_test_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-17 outbox failure trigger and helper function. */
async function removeModule17OutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_17_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_17_test_fail_outbox_event()');
}

// Verify the complete reviewed Change workflow through real Fastify, service, repository and PostgreSQL boundaries.
test('Module 17 live workflow creates estimates, approval, formal Change Order and mandatory Budget impacts', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const request = await createChangeRequest(app, token);
    assert.equal(request.projectId, PROJECT_ID);
    assert.equal(request.changeNo, 'CR-0001');
    assert.equal(request.status, 'DRAFT');
    assert.equal(request.requestedBy, ADMIN_ID);
    assert.deepEqual(request.lines, []);
    assert.equal(request.changeOrder, null);

    const estimated = await replaceChangeLines(app, token, request.id);
    assert.equal(estimated.lines.length, 1);
    assert.equal(estimated.lines[0].costAmount, '125.50');
    assert.equal(estimated.lines[0].revenueAmount, '175.75');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/change-orders?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, request.id);

    const submitted = await submitChangeRequest(app, token, request.id);
    assert.equal(submitted.status, 'SUBMITTED');
    const approval = await findApprovalRequest(client, request.id);
    assert.equal(approval.status, 'PENDING');

    response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26' },
      'module17-approve-before-module22'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CHANGE_APPROVAL_REQUIRED');
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 0);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 1);

    const approvalAction = await actOnApproval(app, token, approval.id, 'APPROVE', 'module17-module22-approve');
    assert.equal(approvalAction.status, 'APPROVED');

    response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26' },
      'module17-change-approve'
    );
    assert.equal(response.statusCode, 200, response.body);
    const approved = response.json().data;
    assert.equal(approved.status, 'APPROVED');
    assert.equal(approved.changeOrder.approvedCost, '125.50');
    assert.equal(approved.changeOrder.approvedRevenue, '175.75');
    assert.equal(approved.changeOrder.effectiveDate, '2026-08-26');

    const budgets = await client.projectBudget.findMany({
      where: { projectId: PROJECT_ID },
      orderBy: [{ versionNo: 'asc' }],
      include: { lines: { orderBy: [{ id: 'asc' }] } }
    });
    assert.equal(budgets.length, 2);
    assert.equal(budgets[1].versionNo, 2);
    assert.equal(budgets[1].status, 'FROZEN');
    assert.equal(budgets[1].totalCost.toString(), '1125.50');
    assert.equal(budgets[1].totalRevenue.toString(), '1675.75');
    assert.equal(budgets[1].lines.length, 2);

    const forecasts = await client.forecastLine.findMany({
      where: { projectId: PROJECT_ID, asOfDate: new Date('2026-08-26T00:00:00.000Z') }
    });
    assert.equal(forecasts.length, 1);
    assert.equal(forecasts[0].estimateToComplete.toString(), '125.50');
    assert.equal(forecasts[0].forecastFinalRevenue.toString(), '175.75');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/change-orders/${approved.changeOrder.id}/impact`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const impact = response.json().data;
    assert.equal(impact.changeOrder.id, approved.changeOrder.id);
    assert.equal(impact.impacts.length, 4);
    assert.deepEqual(
      impact.impacts.map((item) => item.targetType).sort(),
      ['PROJECT_BUDGET_COST', 'PROJECT_BUDGET_REVENUE', 'PROJECT_FORECAST_COST', 'PROJECT_FORECAST_REVENUE'].sort()
    );
    assert.ok(impact.impacts.every((item) => item.status === 'APPLIED' && item.appliedAt !== null));

    for (const eventType of [
      'change_request.created',
      'change_request.submitted',
      'change_order.approved',
      'change_order.impact_applied'
    ]) {
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } }), 1, eventType);
    }
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.approved', entityId: approved.changeOrder.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.impact_applied', entityId: approved.changeOrder.id } }), 1);
  });
});

// Verify authentication, negative RBAC, Project scope and Company isolation fail closed.
test('Module 17 live security blocks unauthorized writes and cross-Project or cross-Company records', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    await createChangeRequest(app, adminToken, {}, 'module17-security-project-a');
    await createChangeRequest(app, adminToken, { projectId: OTHER_PROJECT_ID, title: 'Other Project Change' }, 'module17-security-project-b');

    let response = await app.inject({ method: 'GET', url: '/api/v1/change-orders' });
    assert.equal(response.statusCode, 401, response.body);

    const readerToken = await signIn(app, 'module17-reader@example.test');
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/change-orders',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.ok(response.json().data.items.every((item) => item.projectId === PROJECT_ID));

    response = await changeWrite(
      app,
      readerToken,
      'POST',
      '/api/v1/change-orders/requests',
      {
        projectId: PROJECT_ID,
        changeType: 'DENIED',
        title: 'Denied',
        description: 'Reader cannot create.',
        reason: 'Permission negative.'
      },
      'module17-reader-create-denied'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    const foreignToken = await signIn(app, 'module17-admin-b@example.test');
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/change-orders',
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 0);

    response = await changeWrite(
      app,
      foreignToken,
      'POST',
      '/api/v1/change-orders/requests',
      {
        projectId: PROJECT_ID,
        changeType: 'CROSS_COMPANY',
        title: 'Foreign write',
        description: 'Foreign company must not write Project A.',
        reason: 'Isolation negative.'
      },
      'module17-foreign-create-denied'
    );
    assert.ok([403, 404].includes(response.statusCode), response.body);
    assert.ok(['FORBIDDEN', 'RESOURCE_NOT_FOUND'].includes(errorCode(response)), response.body);
  });
});

// Verify strict input authority, Project references, closed Project protection and idempotent replay.
test('Module 17 live HTTP boundary rejects browser authority and safely replays Change commands', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/change-orders/requests',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: PROJECT_ID,
        changeType: 'MISSING_KEY',
        title: 'Missing key',
        description: 'Missing idempotency key.',
        reason: 'Boundary test.'
      }
    });
    assert.equal(response.statusCode, 400, response.body);

    response = await changeWrite(
      app,
      token,
      'POST',
      '/api/v1/change-orders/requests',
      {
        projectId: PROJECT_ID,
        changeType: 'FORBIDDEN_FIELD',
        title: 'Forbidden field',
        description: 'Server ownership must be rejected.',
        reason: 'Boundary test.',
        companyId: COMPANY_ID
      },
      'module17-forbidden-company'
    );
    assert.equal(response.statusCode, 400, response.body);

    const request = await createChangeRequest(app, token, {}, 'module17-replay-create');
    response = await changeWrite(
      app,
      token,
      'POST',
      '/api/v1/change-orders/requests',
      {
        projectId: PROJECT_ID,
        changeType: 'CLIENT_VARIATION',
        title: 'Foundation scope variation',
        description: 'Additional foundation scope requested by the client.',
        reason: 'Issued design change.'
      },
      'module17-replay-create'
    );
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.id, request.id);
    assert.equal(await client.changeRequest.count({ where: { companyId: COMPANY_ID, projectId: PROJECT_ID } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'change-orders.request-create', idempotencyKey: 'module17-replay-create', status: 'COMPLETED' }
    }), 1);

    response = await changeWrite(
      app,
      token,
      'PUT',
      `/api/v1/change-orders/requests/${request.id}/lines`,
      {
        lines: [{
          wbsNodeId: OTHER_WBS_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID,
          description: 'Cross-Project WBS must fail.',
          costAmount: '1.00',
          revenueAmount: '1.00',
          boqItemId: null
        }]
      },
      'module17-cross-project-wbs'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await changeWrite(
      app,
      token,
      'POST',
      '/api/v1/change-orders/requests',
      {
        projectId: CLOSED_PROJECT_ID,
        changeType: 'CLOSED_PROJECT',
        title: 'Closed Project change',
        description: 'Closed Project must reject writes.',
        reason: 'Lifecycle test.'
      },
      'module17-closed-project'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CHANGE_TARGET_CLOSED');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/change-orders?status=APPROVED',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 400, response.body);
  });
});

// Verify terminal Module-22 rejection remains historical and never creates approved financial impacts.
test('Module 17 live rejection preserves history without creating Change Order or Budget revision', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { request, approval } = await prepareSubmittedChange(app, client, token, 'reject');
    const action = await actOnApproval(app, token, approval.id, 'REJECT', 'module17-module22-reject');
    assert.equal(action.status, 'REJECTED');

    const response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/reject`,
      {},
      'module17-change-reject'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'REJECTED');
    assert.equal(response.json().data.lines.length, 1);
    assert.equal(response.json().data.changeOrder, null);
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 0);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'change_request.rejected', resourceId: request.id } }), 1);
  });
});

// Verify failed mandatory impact work rolls the formal order, budget, forecast, audit, outbox and idempotency result back together.
test('Module 17 operational forced impact outbox failure rolls back the whole approval transaction', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { request, approval } = await prepareSubmittedChange(app, client, token, 'rollback');
    await actOnApproval(app, token, approval.id, 'APPROVE', 'module17-rollback-module22-approve');

    await installModule17OutboxFailure(client, 'change_order.impact_applied');
    const key = 'module17-rollback-change-approve';
    try {
      const response = await changeWrite(
        app,
        token,
        'POST',
        `/api/v1/change-orders/requests/${request.id}/approve`,
        { effectiveDate: '2026-08-26' },
        key
      );
      assert.equal(response.statusCode, 500, response.body);
    } finally {
      await removeModule17OutboxFailure(client);
    }

    const stored = await client.changeRequest.findUniqueOrThrow({ where: { id: request.id } });
    assert.equal(stored.status, 'SUBMITTED');
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 0);
    assert.equal(await client.changeOrderImpact.count(), 0);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 1);
    assert.equal(await client.forecastLine.count({ where: { projectId: PROJECT_ID } }), 0);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.approved' } }), 0);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.impact_applied' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'change_order.approved' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'change_order.impact_applied' } }), 0);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'change-orders.request-approve-core', idempotencyKey: key }
    }), 0);
  });
});

// Verify approval replay is singular and Stage-27 schedule-day impact remains fail-closed.
test('Module 17 live approval replay stays singular and approvedDays cannot bypass the deferred Schedule adapter', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { request, approval } = await prepareSubmittedChange(app, client, token, 'replay-approval');
    await actOnApproval(app, token, approval.id, 'APPROVE', 'module17-replay-module22-approve');

    let response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26', approvedDays: '2.00' },
      'module17-approved-days-blocked'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 0);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 1);

    const key = 'module17-approval-replay';
    response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26' },
      key
    );
    assert.equal(response.statusCode, 200, response.body);
    const first = response.json().data;

    response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26' },
      key
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.changeOrder.id, first.changeOrder.id);
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 1);
    assert.equal(await client.changeOrderImpact.count({ where: { changeOrderId: first.changeOrder.id } }), 4);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 2);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'change-orders.request-approve-core', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);
  });
});

// Verify one Change Request can be withdrawn exactly once without creating financial impact.
test('Module 17 live withdrawal keeps the Change historical and applies no downstream impact', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const request = await createChangeRequest(app, token, { title: 'Withdrawn local change' }, 'module17-withdraw-create');

    let response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/withdraw`,
      { reason: 'Scope is no longer required.' },
      'module17-withdraw-command'
    );
    assert.equal(response.statusCode, 200, response.body);
    const withdrawn = response.json().data;
    assert.equal(withdrawn.status, 'WITHDRAWN');
    assert.equal(withdrawn.withdrawReason, 'Scope is no longer required.');
    assert.equal(withdrawn.withdrawnBy, ADMIN_ID);
    assert.ok(withdrawn.withdrawnAt);

    response = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/withdraw`,
      { reason: 'Scope is no longer required.' },
      'module17-withdraw-command'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.withdrawnAt, withdrawn.withdrawnAt);

    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 0);
    assert.equal(await client.changeOrderImpact.count({ where: { changeOrder: { changeRequestId: request.id } } }), 0);
    assert.equal(await client.idempotencyRecord.count({
      where: {
        companyId: COMPANY_ID,
        operation: 'change-orders.request-withdraw',
        idempotencyKey: 'module17-withdraw-command',
        status: 'COMPLETED'
      }
    }), 1);
  });
});

// Verify generated OpenAPI preserves the seven reviewed operations plus the focused Pass-377 withdraw repair.
test('Module 17 live OpenAPI exposes reviewed operations plus focused withdraw repair and no generic Change CRUD', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/change-orders', 'module17ListChangeOrders'],
      ['POST', '/api/v1/change-orders/requests', 'module17CreateChangeRequest'],
      ['PUT', '/api/v1/change-orders/requests/{id}/lines', 'module17ReplaceChangeRequestLines'],
      ['POST', '/api/v1/change-orders/requests/{id}/submit', 'module17SubmitChangeRequest'],
      ['POST', '/api/v1/change-orders/requests/{id}/approve', 'module17ApproveChangeRequest'],
      ['POST', '/api/v1/change-orders/requests/{id}/reject', 'module17RejectChangeRequest'],
      ['POST', '/api/v1/change-orders/requests/{id}/withdraw', 'module17WithdrawChangeRequest'],
      ['GET', '/api/v1/change-orders/{id}/impact', 'module17GetChangeOrderImpact']
    ];

    const documented = [];
    for (const [method, route, operationId] of expected) {
      const operation = module17OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const actualModule17 = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module17')) {
          actualModule17.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(actualModule17.sort(), documented.sort());

    for (const [method, route] of expected.filter(([method]) => ['POST', 'PUT'].includes(method))) {
      const parameters = module17OpenApiOperation(document, route, method).parameters ?? [];
      const idempotency = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');
      assert.ok(idempotency, `${method} ${route} must require Idempotency-Key`);
      assert.equal(idempotency.required, true);
    }

    const createBody = module17OpenApiOperation(document, '/api/v1/change-orders/requests', 'POST')
      .requestBody.content['application/json'].schema;
    for (const field of ['companyId', 'actorUserId', 'changeNo', 'status', 'requestedBy', 'approvedCost', 'targetType']) {
      assert.equal(Object.hasOwn(createBody.properties, field), false, field);
    }

    const withdrawBody = module17OpenApiOperation(document, '/api/v1/change-orders/requests/{id}/withdraw', 'POST')
      .requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(withdrawBody.properties).sort(), ['reason']);

    const approveBody = module17OpenApiOperation(document, '/api/v1/change-orders/requests/{id}/approve', 'POST')
      .requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(approveBody.properties).sort(), ['approvedDays', 'effectiveDate']);
    assert.equal(Object.hasOwn(approveBody.properties, 'approvedCost'), false);
    assert.equal(Object.hasOwn(approveBody.properties, 'approvedRevenue'), false);

    for (const forbiddenPath of [
      '/api/v1/change-orders/requests/{id}',
      '/api/v1/change-orders/requests/{id}/apply',
      '/api/v1/change-orders/requests/{id}/reopen'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }
  });
});

// Verify concurrent retries with one idempotency key create only one Change Request and one durable side-effect set.
test('Module 17 operational concurrent same-key Change Request create stays singular', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const key = 'module17-ops-create-same-key';
    const payload = {
      projectId: PROJECT_ID,
      changeType: 'CLIENT_VARIATION',
      title: 'Concurrent idempotent Change Request',
      description: 'Two identical requests must create one business record.',
      reason: 'Operational idempotency verification.'
    };

    const responses = await Promise.all([
      changeWrite(app, token, 'POST', '/api/v1/change-orders/requests', payload, key),
      changeWrite(app, token, 'POST', '/api/v1/change-orders/requests', payload, key)
    ]);

    for (const response of responses) assert.equal(response.statusCode, 201, response.body);
    assert.equal(responses[0].json().data.id, responses[1].json().data.id);
    const requestId = responses[0].json().data.id;
    assert.equal(await client.changeRequest.count({ where: { id: requestId } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_request.created', entityId: requestId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'change_request.created', resourceId: requestId } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'change-orders.request-create', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);
  });
});

// Verify different retry keys cannot create duplicate approved snapshots or duplicate Module-7 impact for one request.
test('Module 17 operational concurrent approval keys create one formal Change Order and one Budget revision', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { request, approval } = await prepareSubmittedChange(app, client, token, 'ops-one-request');
    await actOnApproval(app, token, approval.id, 'APPROVE', 'module17-ops-one-request-module22');

    const responses = await Promise.all([
      changeWrite(app, token, 'POST', `/api/v1/change-orders/requests/${request.id}/approve`, { effectiveDate: '2026-08-26' }, 'module17-ops-approve-a'),
      changeWrite(app, token, 'POST', `/api/v1/change-orders/requests/${request.id}/approve`, { effectiveDate: '2026-08-26' }, 'module17-ops-approve-b')
    ]);

    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    assert.equal(responses[0].json().data.changeOrder.id, responses[1].json().data.changeOrder.id);
    const orderId = responses[0].json().data.changeOrder.id;
    assert.equal(await client.changeOrder.count({ where: { changeRequestId: request.id } }), 1);
    assert.equal(await client.changeOrderImpact.count({ where: { changeOrderId: orderId } }), 4);
    assert.equal(await client.projectBudget.count({ where: { projectId: PROJECT_ID } }), 2);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'change_order.approved', entityId: orderId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'change_order.impact_applied', resourceId: orderId } }), 1);
  });
});

// Verify concurrent approvals for different requests serialize through one Project and allocate safe Budget revisions.
test('Module 17 operational concurrent different Change approvals serialize Project Budget revisions', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const first = await prepareSubmittedChange(app, client, token, 'ops-first-change');
    const second = await prepareSubmittedChange(app, client, token, 'ops-second-change');
    await actOnApproval(app, token, first.approval.id, 'APPROVE', 'module17-ops-first-module22');
    await actOnApproval(app, token, second.approval.id, 'APPROVE', 'module17-ops-second-module22');

    const responses = await Promise.all([
      changeWrite(app, token, 'POST', `/api/v1/change-orders/requests/${first.request.id}/approve`, { effectiveDate: '2026-08-26' }, 'module17-ops-first-approve'),
      changeWrite(app, token, 'POST', `/api/v1/change-orders/requests/${second.request.id}/approve`, { effectiveDate: '2026-08-26' }, 'module17-ops-second-approve')
    ]);

    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.changeOrder.count(), 2);
    assert.equal(await client.changeOrderImpact.count(), 8);

    const budgets = await client.projectBudget.findMany({
      where: { projectId: PROJECT_ID },
      orderBy: [{ versionNo: 'asc' }]
    });
    assert.deepEqual(budgets.map((budget) => budget.versionNo), [1, 2, 3]);
    assert.equal(budgets[2].totalCost.toString(), '1251.00');
    assert.equal(budgets[2].totalRevenue?.toString(), '1851.50');
  });
});

// Verify reviewed PostgreSQL scope and immutable-history rules remain authoritative below the service layer.
test('Module 17 operational PostgreSQL rejects cross-Project line scope and approved-history mutation', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { request, approval } = await prepareSubmittedChange(app, client, token, 'ops-db-rules');
    await actOnApproval(app, token, approval.id, 'APPROVE', 'module17-ops-db-module22');
    const approved = await changeWrite(
      app,
      token,
      'POST',
      `/api/v1/change-orders/requests/${request.id}/approve`,
      { effectiveDate: '2026-08-26' },
      'module17-ops-db-approve'
    );
    assert.equal(approved.statusCode, 200, approved.body);
    const orderId = approved.json().data.changeOrder.id;
    const impact = await client.changeOrderImpact.findFirstOrThrow({ where: { changeOrderId: orderId } });

    await assert.rejects(() => client.changeRequestLine.create({
      data: {
        changeRequestId: request.id,
        wbsNodeId: OTHER_WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID,
        description: 'Cross-Project direct line must fail',
        costAmount: '1.00',
        revenueAmount: '1.00',
        boqItemId: null
      }
    }), /WBS node must belong to the Change Request Company and Project/);

    await assert.rejects(() => client.changeOrder.update({
      where: { id: orderId },
      data: { approvedCost: '999.00' }
    }), /Approved Change Order snapshots are immutable/);
    await assert.rejects(() => client.changeOrder.delete({ where: { id: orderId } }), /Approved Change Order snapshots are immutable/);
    await assert.rejects(() => client.changeOrderImpact.update({
      where: { id: impact.id },
      data: { amountDelta: '999.00' }
    }), /Applied Change Order impacts are immutable/);
    await assert.rejects(() => client.changeOrderImpact.delete({ where: { id: impact.id } }), /Change Order impact history cannot be deleted/);
  });
});

// Verify all reviewed Stage-22 query and uniqueness indexes are deployed after migration.
test('Module 17 operational Stage-22 Change Order indexes are deployed', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const indexes = await client.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('change_requests', 'change_request_lines', 'change_orders', 'change_order_impacts')
      ORDER BY indexname
    `);
    const indexNames = new Set(indexes.map((row) => row.indexname));
    for (const name of [
      'change_requests_company_change_no_idx',
      'change_requests_company_status_requested_idx',
      'change_requests_project_status_requested_idx',
      'change_requests_requester_requested_idx',
      'change_request_lines_request_idx',
      'change_request_lines_wbs_cost_idx',
      'change_request_lines_boq_item_idx',
      'change_orders_request_uq',
      'change_orders_effective_status_idx',
      'change_order_impacts_order_status_idx',
      'change_order_impacts_target_idx',
      'change_order_impacts_applied_idx'
    ]) {
      assert.equal(indexNames.has(name), true, `Missing Stage-22 Change Order index: ${name}`);
    }
  });
});
