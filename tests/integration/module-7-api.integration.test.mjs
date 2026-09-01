import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000007000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000007100';
const ADMIN_ID = '00000000-0000-4000-8000-000000007010';
const PROJECT_READER_ID = '00000000-0000-4000-8000-000000007011';
const MEMBER_ONLY_ID = '00000000-0000-4000-8000-000000007012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000007110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000007020';
const PROJECT_READER_ROLE_ID = '00000000-0000-4000-8000-000000007021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000007120';
const CLIENT_ID = '00000000-0000-4000-8000-000000007030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000007130';
const PROJECT_ID = '00000000-0000-4000-8000-000000007040';
const PROJECT_2_ID = '00000000-0000-4000-8000-000000007041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000007140';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000007042';
const WBS_ID = '00000000-0000-4000-8000-000000007050';
const WBS_2_ID = '00000000-0000-4000-8000-000000007051';
const WBS_B_ID = '00000000-0000-4000-8000-000000007150';
const COST_CODE_ID = '00000000-0000-4000-8000-000000007060';
const COST_CODE_2_ID = '00000000-0000-4000-8000-000000007061';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000007160';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000007070';
const INACTIVE_COST_TYPE_ID = '00000000-0000-4000-8000-000000007071';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000007170';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000007080';
const COST_STRUCTURE_2_ID = '00000000-0000-4000-8000-000000007081';
const INACTIVE_COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000007082';
const COST_STRUCTURE_B_ID = '00000000-0000-4000-8000-000000007180';
const OPEN_PERIOD_ID = '00000000-0000-4000-8000-000000007090';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-0000000070a0';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-0000000070a1';
const BUDGET_APPROVAL_DEFINITION_CODE = 'BUDGET_FREEZE';
const CLOSED_PERIOD_ID = '00000000-0000-4000-8000-000000007091';
const PASSWORD = 'Module7-pass-218-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_7_PERMISSIONS = [
  'budgets.read',
  'budgets.create',
  'budgets.edit',
  'budgets.freeze',
  'job_cost.read',
  'forecast.update'
];

/** Load built runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum two-Company Project, RBAC, cost-structure and Finance-period scenario for Module 7. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 7 Company Ltd',
        displayName: 'Module 7 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 7 Foreign Company Ltd',
        displayName: 'Module 7 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_7_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'budgets-job-cost' },
      create: { code, name: code, domain: 'budgets-job-cost' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: PROJECT_READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-7-project-reader', name: 'Module 7 Project Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_7_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: PROJECT_READER_ROLE_ID, permissionId: permissionByCode.get('budgets.read') },
      { roleId: PROJECT_READER_ROLE_ID, permissionId: permissionByCode.get('job_cost.read') },
      ...MODULE_7_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module7-admin@example.test', name: 'Module 7 Admin' },
    { id: PROJECT_READER_ID, companyId: COMPANY_ID, email: 'module7-reader@example.test', name: 'Module 7 Project Reader' },
    { id: MEMBER_ONLY_ID, companyId: COMPANY_ID, email: 'module7-member@example.test', name: 'Module 7 Member Only' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module7-admin-b@example.test', name: 'Module 7 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_READER_ID, roleId: PROJECT_READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'MODULE7-CLIENT',
        legalName: 'Module 7 Client Ltd',
        displayName: 'Module 7 Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'MODULE7-FOREIGN-CLIENT',
        legalName: 'Module 7 Foreign Client Ltd',
        displayName: 'Module 7 Foreign Client',
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
        projectCode: 'MODULE7-PROJECT-A',
        name: 'Module 7 Project A',
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
        projectCode: 'MODULE7-PROJECT-B',
        name: 'Module 7 Project B',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Islamabad, Pakistan'
      },
      {
        id: CLOSED_PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE7-CLOSED',
        name: 'Module 7 Closed Project',
        clientId: CLIENT_ID,
        status: 'CLOSED',
        currency: 'USD',
        startDate: new Date('2025-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2025-12-31T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_B_ID,
        projectCode: 'MODULE7-FOREIGN-PROJECT',
        name: 'Module 7 Foreign Project',
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

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_READER_ID, projectRole: 'READER', status: 'ACTIVE', fromDate },
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
      { id: COST_CODE_2_ID, companyId: COMPANY_ID, code: '2000', name: 'Other Cost', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9000', name: 'Foreign Cost', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });

  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'LAB', name: 'Labor', status: 'ACTIVE' },
      { id: INACTIVE_COST_TYPE_ID, companyId: COMPANY_ID, code: 'OLD', name: 'Inactive Cost Type', status: 'INACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FOR', name: 'Foreign Cost Type', status: 'ACTIVE' }
    ]
  });

  await client.projectCostCode.createMany({
    data: [
      { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_2_ID, projectId: PROJECT_2_ID, wbsNodeId: WBS_2_ID, costCodeId: COST_CODE_2_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: INACTIVE_COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_2_ID, costTypeId: INACTIVE_COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_B_ID, projectId: PROJECT_B_ID, wbsNodeId: WBS_B_ID, costCodeId: COST_CODE_B_ID, costTypeId: COST_TYPE_B_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ]
  });

  await client.fiscalPeriod.createMany({
    data: [
      { id: OPEN_PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2026, periodNo: 1, startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: new Date('2026-01-31T00:00:00.000Z'), status: 'OPEN' },
      { id: CLOSED_PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2026, periodNo: 2, startDate: new Date('2026-02-01T00:00:00.000Z'), endDate: new Date('2026-02-28T00:00:00.000Z'), status: 'CLOSED' }
    ]
  });


  await client.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: BUDGET_APPROVAL_DEFINITION_CODE,
      name: 'Budget Freeze Approval',
      resourceType: 'project_budget',
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
      budgetApprovalDefinitionCode: options.budgetApprovalDefinitionCode ?? null
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user and return the server-issued access token. */
async function signIn(app, email = 'module7-admin@example.test') {
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

/** Create one Project budget through the reviewed public HTTP command. */
async function createBudget(app, token, projectId = PROJECT_ID, budgetType = 'BASELINE') {
  return app.inject({
    method: 'POST',
    url: `/api/v1/projects/${projectId}/budgets`,
    headers: { authorization: `Bearer ${token}` },
    payload: { budgetType }
  });
}

/** Replace one draft budget with a single valid or caller-supplied line. */
async function replaceBudgetLines(app, token, budgetId, line = {}) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/projects/${PROJECT_ID}/budgets/${budgetId}/lines`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      lines: [{
        wbsNodeId: WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID,
        quantity: '10.0000',
        unitRate: '100.0000',
        amount: '1000.00',
        revenueAmount: '1500.00',
        ...line
      }]
    }
  });
}

/** Approve the Module-22 request created by a configured Budget freeze attempt. */
async function approveBudgetFreeze(app, client, token, budgetId) {
  const request = await client.approvalRequest.findFirst({
    where: { companyId: COMPANY_ID, resourceType: 'project_budget', resourceId: budgetId },
    orderBy: { requestedAt: 'desc' }
  });
  assert.ok(request, 'Budget approval request was not created.');
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/approvals/requests/${request.id}/actions`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': `module7-approve-${budgetId}` },
    payload: { action: 'APPROVE', comment: 'Approved for baseline freeze' }
  });
  assert.equal(response.statusCode, 200, response.body);
  return request;
}

/** Freeze one budget through the reviewed bodyless command. */
async function freezeBudget(app, token, budgetId) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/projects/${PROJECT_ID}/budgets/${budgetId}/freeze`,
    headers: { authorization: `Bearer ${token}` }
  });
}

/** Seed source-derived commitment and actual fixtures without creating a browser write endpoint. */
async function seedSourceCosts(client) {
  await client.costCommitment.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'TEST_COMMITMENT',
      sourceId: 'PO-1',
      sourceLineId: 'LINE-1',
      costStructureId: COST_STRUCTURE_ID,
      originalAmount: '500.00',
      remainingAmount: '300.00',
      status: 'OPEN'
    }
  });
  await client.costActual.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'TEST_ACTUAL',
      sourceId: 'GRN-1',
      sourceLineId: 'LINE-1',
      postingDate: new Date('2026-01-10T00:00:00.000Z'),
      costStructureId: COST_STRUCTURE_ID,
      amount: '200.00'
    }
  });
}

/** Return one generated Module-7 OpenAPI operation and fail clearly when it is missing. */
function module7OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

test('Module 7 PostgreSQL/Fastify workflow creates, freezes, forecasts and reads exact job cost', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/budgets/current`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'BUDGET_NOT_FOUND');

    response = await createBudget(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const budget = response.json().data;
    assert.equal(budget.versionNo, 1);
    assert.equal(budget.status, 'DRAFT');
    assert.equal(budget.totalCost, '0');
    assert.deepEqual(budget.lines, []);

    response = await replaceBudgetLines(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.totalCost, '1000');
    assert.equal(response.json().data.totalRevenue, '1500');

    response = await freezeBudget(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    const frozen = response.json().data;
    assert.equal(frozen.status, 'FROZEN');
    assert.ok(frozen.approvedAt);
    assert.equal(frozen.totalCost, '1000');

    response = await freezeBudget(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, budget.id);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'budget.frozen', resourceId: budget.id } }), 1);

    await seedSourceCosts(client);
    const budgetLine = await client.budgetLine.findFirstOrThrow({ where: { budgetId: budget.id } });

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/forecast`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asOfDate: '2026-01-20',
        lines: [{ budgetLineId: budgetLine.id, estimateToComplete: '200.00', notes: 'January forecast' }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const forecast = response.json().data.forecasts[0];
    assert.equal(forecast.forecastFinalCost, '700');
    assert.equal(forecast.forecastFinalRevenue, '1500');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/job-cost`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.totals, {
      budgetCost: '1000',
      committedCost: '300',
      actualCost: '200',
      estimateToComplete: '200',
      forecastFinalCost: '700',
      variance: '300',
      budgetRevenue: '1500',
      forecastFinalRevenue: '1500',
      margin: '800'
    });

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/job-cost/ledger?page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 2);
    assert.deepEqual(new Set(response.json().data.items.map((item) => item.recordType)), new Set(['COMMITMENT', 'ACTUAL']));

    const budgetAudits = await client.auditLog.findMany({
      where: { companyId: COMPANY_ID, entityType: 'project_budget', entityId: budget.id },
      select: { action: true, actorUserId: true }
    });
    assert.ok(budgetAudits.some((row) => row.action === 'budget.created'));
    assert.ok(budgetAudits.some((row) => row.action === 'budget.lines_replaced'));
    assert.ok(budgetAudits.some((row) => row.action === 'budget.frozen'));
    assert.ok(budgetAudits.every((row) => row.actorUserId === ADMIN_ID));
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'budget.created', resourceId: budget.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'forecast.updated', resourceId: PROJECT_ID } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'job_cost.source_posted' } }), 0);
  });
});

test('Module 7 configured approval keeps a recoverable DRAFT until Module 22 approves the same snapshot', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const created = await createBudget(app, token);
    assert.equal(created.statusCode, 200, created.body);
    const budgetId = created.json().data.id;
    const saved = await replaceBudgetLines(app, token, budgetId);
    assert.equal(saved.statusCode, 200, saved.body);

    const draftRead = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/budgets/draft`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(draftRead.statusCode, 200, draftRead.body);
    assert.equal(draftRead.json().data.id, budgetId);
    assert.equal(draftRead.json().data.status, 'DRAFT');

    const pendingFreeze = await freezeBudget(app, token, budgetId);
    assert.equal(pendingFreeze.statusCode, 200, pendingFreeze.body);
    assert.equal(pendingFreeze.json().data.status, 'DRAFT');

    const request = await client.approvalRequest.findFirst({
      where: { companyId: COMPANY_ID, resourceType: 'project_budget', resourceId: budgetId }
    });
    assert.ok(request);
    assert.equal(request.status, 'PENDING');
    assert.equal(await client.approvalRequest.count({
      where: { companyId: COMPANY_ID, resourceType: 'project_budget', resourceId: budgetId }
    }), 1);

    await approveBudgetFreeze(app, client, token, budgetId);
    const frozen = await freezeBudget(app, token, budgetId);
    assert.equal(frozen.statusCode, 200, frozen.body);
    assert.equal(frozen.json().data.status, 'FROZEN');
    assert.ok(frozen.json().data.approvedAt);
    assert.equal(await client.approvalRequest.count({
      where: { companyId: COMPANY_ID, resourceType: 'project_budget', resourceId: budgetId }
    }), 1);
  }, { budgetApprovalDefinitionCode: BUDGET_APPROVAL_DEFINITION_CODE });
});

test('Module 7 security blocks wrong Project, missing permission, foreign Company and browser authority fields', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module7-reader@example.test');
    const memberToken = await signIn(app, 'module7-member@example.test');
    const foreignToken = await signIn(app, 'module7-admin-b@example.test');

    let response = await createBudget(app, readerToken, PROJECT_ID);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_2_ID}/job-cost`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/job-cost`,
      headers: { authorization: `Bearer ${memberToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/job-cost`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/projects/${PROJECT_ID}/budgets`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { budgetType: 'BASELINE', companyId: COMPANY_B_ID, status: 'FROZEN', versionNo: 99 }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await createBudget(app, adminToken, CLOSED_PROJECT_ID);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
  });
});

test('Module 7 validation protects locked budgets, cost structures and Finance forecast periods', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createBudget(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const first = response.json().data;

    response = await replaceBudgetLines(app, token, first.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await freezeBudget(app, token, first.id);
    assert.equal(response.statusCode, 200, response.body);

    response = await replaceBudgetLines(app, token, first.id, { amount: '1100.00' });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BUDGET_VERSION_LOCKED');

    response = await createBudget(app, token, PROJECT_ID, 'REVISION');
    assert.equal(response.statusCode, 201, response.body);
    const second = response.json().data;
    assert.equal(second.versionNo, 2);

    response = await replaceBudgetLines(app, token, second.id, {
      wbsNodeId: WBS_2_ID,
      costCodeId: COST_CODE_2_ID
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_COST_STRUCTURE');

    response = await replaceBudgetLines(app, token, second.id, {
      costCodeId: COST_CODE_2_ID,
      costTypeId: INACTIVE_COST_TYPE_ID
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_COST_STRUCTURE');

    response = await replaceBudgetLines(app, token, second.id, { amount: '1200.00', revenueAmount: '1700.00' });
    assert.equal(response.statusCode, 200, response.body);
    response = await freezeBudget(app, token, second.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'budget.revised', resourceId: second.id } }), 1);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/budgets/current`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, second.id);
    assert.equal(response.json().data.versionNo, 2);

    const secondLine = await client.budgetLine.findFirstOrThrow({ where: { budgetId: second.id } });
    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/forecast`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asOfDate: '2026-02-15',
        lines: [{ budgetLineId: secondLine.id, estimateToComplete: '10.00', notes: 'Locked period attempt' }]
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'FORECAST_PERIOD_LOCKED');
  });
});

test('Module 7 database constraints preserve Project scope and source-key idempotency', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createBudget(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const budget = response.json().data;
    response = await replaceBudgetLines(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    const localLine = await client.budgetLine.findFirstOrThrow({ where: { budgetId: budget.id } });

    await assert.rejects(
      client.budgetLine.create({
        data: {
          budgetId: budget.id,
          wbsNodeId: WBS_2_ID,
          costCodeId: COST_CODE_2_ID,
          costTypeId: COST_TYPE_ID,
          amount: '1.00'
        }
      }),
      /posting-enabled cost structure|constraint|23514/i
    );

    await assert.rejects(
      client.costCommitment.create({
        data: {
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          sourceType: 'BAD',
          sourceId: 'BAD-1',
          sourceLineId: '1',
          costStructureId: COST_STRUCTURE_2_ID,
          originalAmount: '1.00',
          remainingAmount: '1.00',
          status: 'OPEN'
        }
      }),
      /selected Project|constraint|23514/i
    );

    const commitment = {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'PO',
      sourceId: 'PO-IDEMPOTENT',
      sourceLineId: 'LINE-1',
      costStructureId: COST_STRUCTURE_ID,
      originalAmount: '5.00',
      remainingAmount: '5.00',
      status: 'OPEN'
    };
    await client.costCommitment.create({ data: commitment });
    await assert.rejects(client.costCommitment.create({ data: commitment }), /unique|constraint|P2002/i);

    const foreignBudget = await client.projectBudget.create({
      data: {
        companyId: COMPANY_B_ID,
        projectId: PROJECT_B_ID,
        versionNo: 1,
        budgetType: 'BASELINE',
        status: 'DRAFT',
        totalCost: '1.00'
      }
    });
    const foreignLine = await client.budgetLine.create({
      data: {
        budgetId: foreignBudget.id,
        wbsNodeId: WBS_B_ID,
        costCodeId: COST_CODE_B_ID,
        costTypeId: COST_TYPE_B_ID,
        amount: '1.00'
      }
    });

    await assert.rejects(
      client.forecastLine.create({
        data: {
          projectId: PROJECT_ID,
          budgetLineId: foreignLine.id,
          asOfDate: new Date('2026-01-20T00:00:00.000Z'),
          estimateToComplete: '1.00',
          forecastFinalCost: '1.00',
          forecastFinalRevenue: null,
          notes: 'Cross-project forecast attack'
        }
      }),
      /same Project|constraint|23514/i
    );

    assert.equal(await client.budgetLine.count({ where: { id: localLine.id } }), 1);
  });
});

test('Module 7 live OpenAPI exposes seven source operations plus the Pass-361 DRAFT recovery read and no source-write authority', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/projects/{projectId}/budgets/current', 'module7GetCurrentBudget'],
      ['GET', '/api/v1/projects/{projectId}/budgets/draft', 'module7GetDraftBudget'],
      ['POST', '/api/v1/projects/{projectId}/budgets', 'module7CreateBudget'],
      ['PUT', '/api/v1/projects/{projectId}/budgets/{id}/lines', 'module7ReplaceBudgetLines'],
      ['POST', '/api/v1/projects/{projectId}/budgets/{id}/freeze', 'module7FreezeBudget'],
      ['GET', '/api/v1/projects/{projectId}/job-cost', 'module7GetJobCost'],
      ['PUT', '/api/v1/projects/{projectId}/forecast', 'module7UpdateForecast'],
      ['GET', '/api/v1/projects/{projectId}/job-cost/ledger', 'module7GetJobCostLedger']
    ];
    const actual = [];

    for (const [method, route, operationId] of expected) {
      const operation = module7OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actual.push(`${method} ${route}`);
    }

    const documented = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem[method];
        if (operation?.operationId?.startsWith('module7')) documented.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.deepEqual(documented.sort(), actual.sort());

    for (const forbiddenPath of [
      '/api/v1/projects/{projectId}/job-cost/commitments',
      '/api/v1/projects/{projectId}/job-cost/actuals',
      '/api/v1/projects/{projectId}/job-cost/reconcile',
      '/api/v1/projects/{projectId}/budgets/{id}/approve',
      '/api/v1/projects/{projectId}/budgets/{id}/reopen'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }

    const createBody = module7OpenApiOperation(document, '/api/v1/projects/{projectId}/budgets', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    assert.deepEqual(createBody.required, ['budgetType']);
    assert.deepEqual(Object.keys(createBody.properties), ['budgetType']);

    const forecastBody = module7OpenApiOperation(document, '/api/v1/projects/{projectId}/forecast', 'PUT')
      .requestBody.content['application/json'].schema;
    const forecastLine = forecastBody.properties.lines.items;
    assert.equal(forecastBody.additionalProperties, false);
    assert.equal(forecastLine.additionalProperties, false);
    for (const field of ['companyId', 'status', 'forecastFinalCost', 'forecastFinalRevenue', 'sourceType', 'actualCost']) {
      assert.equal(Object.hasOwn(forecastBody.properties, field), false, field);
      assert.equal(Object.hasOwn(forecastLine.properties, field), false, field);
    }

    const ledgerParameters = module7OpenApiOperation(document, '/api/v1/projects/{projectId}/job-cost/ledger', 'GET').parameters ?? [];
    const queryNames = ledgerParameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name).sort();
    assert.deepEqual(queryNames, ['page', 'pageSize']);
  });
});

// Verify the Project row lock serializes version allocation, retry-safe freeze, forecast replacement and source-key uniqueness under concurrency.
test('Module 7 operational concurrency serializes budget versioning, freeze and forecast replacement', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const createResponses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createBudget(
        app,
        token,
        PROJECT_ID,
        index === 0 ? 'BASELINE' : `REVISION-${index}`
      ))
    );
    assert.equal(createResponses.every((response) => response.statusCode === 201), true);

    const created = createResponses.map((response) => response.json().data);
    assert.deepEqual(created.map((budget) => budget.versionNo).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6]);
    assert.equal(new Set(created.map((budget) => budget.id)).size, 6);

    const baseline = created.find((budget) => budget.versionNo === 1);
    assert.ok(baseline);
    let response = await replaceBudgetLines(app, token, baseline.id);
    assert.equal(response.statusCode, 200, response.body);

    const freezeResponses = await Promise.all([
      freezeBudget(app, token, baseline.id),
      freezeBudget(app, token, baseline.id)
    ]);
    assert.deepEqual(freezeResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(new Set(freezeResponses.map((item) => item.json().data.id)).size, 1);
    assert.equal(await client.auditLog.count({ where: { entityId: baseline.id, action: 'budget.frozen' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: baseline.id, eventType: 'budget.frozen' } }), 1);

    const latest = created.find((budget) => budget.versionNo === 6);
    assert.ok(latest);
    response = await replaceBudgetLines(app, token, latest.id, { amount: '1600.00', revenueAmount: '2100.00' });
    assert.equal(response.statusCode, 200, response.body);
    response = await freezeBudget(app, token, latest.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: latest.id, eventType: 'budget.revised' } }), 1);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/budgets/current`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, latest.id);
    assert.equal(response.json().data.versionNo, 6);

    await seedSourceCosts(client);
    const latestLine = await client.budgetLine.findFirstOrThrow({ where: { budgetId: latest.id } });
    const forecastResponses = await Promise.all(['111.00', '222.00'].map((estimateToComplete) => app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/forecast`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asOfDate: '2026-01-20',
        lines: [{ budgetLineId: latestLine.id, estimateToComplete, notes: `Concurrent ETC ${estimateToComplete}` }]
      }
    })));
    assert.deepEqual(forecastResponses.map((item) => item.statusCode), [200, 200]);

    const storedForecasts = await client.forecastLine.findMany({
      where: { projectId: PROJECT_ID, asOfDate: new Date('2026-01-20T00:00:00.000Z') }
    });
    assert.equal(storedForecasts.length, 1);
    assert.equal(new Set(['111', '222']).has(storedForecasts[0].estimateToComplete.toString()), true);
    assert.equal(await client.auditLog.count({ where: { entityId: PROJECT_ID, action: 'forecast.updated' } }), 2);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: PROJECT_ID, eventType: 'forecast.updated' } }), 2);

    const concurrentCommitment = {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'CONCURRENT_PO',
      sourceId: 'PO-CONCURRENT',
      sourceLineId: 'LINE-1',
      costStructureId: COST_STRUCTURE_ID,
      originalAmount: '25.00',
      remainingAmount: '25.00',
      status: 'OPEN'
    };
    const commitmentResults = await Promise.allSettled([
      client.costCommitment.create({ data: concurrentCommitment }),
      client.costCommitment.create({ data: concurrentCommitment })
    ]);
    assert.equal(commitmentResults.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(commitmentResults.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(await client.costCommitment.count({ where: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'CONCURRENT_PO',
      sourceId: 'PO-CONCURRENT',
      sourceLineId: 'LINE-1'
    } }), 1);

    const concurrentActual = {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'CONCURRENT_ACTUAL',
      sourceId: 'ACT-CONCURRENT',
      sourceLineId: 'LINE-1',
      postingDate: new Date('2026-01-21T00:00:00.000Z'),
      costStructureId: COST_STRUCTURE_ID,
      amount: '15.00'
    };
    const actualResults = await Promise.allSettled([
      client.costActual.create({ data: concurrentActual }),
      client.costActual.create({ data: concurrentActual })
    ]);
    assert.equal(actualResults.filter((item) => item.status === 'fulfilled').length, 1);
    assert.equal(actualResults.filter((item) => item.status === 'rejected').length, 1);
    assert.equal(await client.costActual.count({ where: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      sourceType: 'CONCURRENT_ACTUAL',
      sourceId: 'ACT-CONCURRENT',
      sourceLineId: 'LINE-1'
    } }), 1);
  });
});

// Verify replace-all rollback is atomic and reviewed Stage-12 indexes support production read shapes without timing thresholds.
test('Module 7 operational rollback and query plans preserve atomic budget writes and reviewed indexes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createBudget(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const budget = response.json().data;

    response = await replaceBudgetLines(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    const before = await client.projectBudget.findUniqueOrThrow({
      where: { id: budget.id },
      include: { lines: { orderBy: { id: 'asc' } } }
    });
    assert.equal(before.totalCost.toString(), '1000');
    assert.equal(before.lines.length, 1);

    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/budgets/${budget.id}/lines`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        lines: [
          {
            wbsNodeId: WBS_ID,
            costCodeId: COST_CODE_ID,
            costTypeId: COST_TYPE_ID,
            amount: '9999999999999999.99',
            revenueAmount: '9999999999999999.99'
          },
          {
            wbsNodeId: WBS_ID,
            costCodeId: COST_CODE_ID,
            costTypeId: COST_TYPE_ID,
            amount: '9999999999999999.99',
            revenueAmount: '9999999999999999.99'
          }
        ]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    const after = await client.projectBudget.findUniqueOrThrow({
      where: { id: budget.id },
      include: { lines: { orderBy: { id: 'asc' } } }
    });
    assert.equal(after.totalCost.toString(), '1000');
    assert.equal(after.totalRevenue?.toString(), '1500');
    assert.equal(after.lines.length, 1);
    assert.equal(after.lines[0].amount.toString(), '1000');
    assert.equal(await client.auditLog.count({ where: { entityId: budget.id, action: 'budget.lines_replaced' } }), 1);

    response = await freezeBudget(app, token, budget.id);
    assert.equal(response.statusCode, 200, response.body);
    await seedSourceCosts(client);
    const budgetLine = await client.budgetLine.findFirstOrThrow({ where: { budgetId: budget.id } });
    response = await app.inject({
      method: 'PUT',
      url: `/api/v1/projects/${PROJECT_ID}/forecast`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        asOfDate: '2026-01-20',
        lines: [{ budgetLineId: budgetLine.id, estimateToComplete: '200.00', notes: 'Index-plan fixture' }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const currentBudgetPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, version_no, status
        FROM project_budgets
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'FROZEN'
        ORDER BY version_no DESC
        LIMIT 1
      `));
      assert.match(currentBudgetPlan, /project_budgets_company_project_status_version_idx/);

      const budgetLinePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, wbs_node_id, cost_code_id, cost_type_id
        FROM budget_lines
        WHERE budget_id = '${budget.id}'::uuid
        ORDER BY wbs_node_id, cost_code_id, cost_type_id
        LIMIT 50
      `));
      assert.match(budgetLinePlan, /budget_lines_budget_cost_structure_idx/);

      const commitmentPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, remaining_amount
        FROM cost_commitments
        WHERE project_id = '${PROJECT_ID}'::uuid
          AND status = 'OPEN'
        LIMIT 50
      `));
      assert.match(commitmentPlan, /cost_commitments_project_status_idx/);

      const actualPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, posting_date, amount
        FROM cost_actuals
        WHERE project_id = '${PROJECT_ID}'::uuid
          AND posting_date <= '2026-01-31'::date
        ORDER BY posting_date DESC
        LIMIT 50
      `));
      assert.match(actualPlan, /cost_actuals_project_posting_date_idx/);

      const forecastPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, budget_line_id, estimate_to_complete
        FROM forecast_lines
        WHERE project_id = '${PROJECT_ID}'::uuid
          AND as_of_date = '2026-01-20'::date
        LIMIT 50
      `));
      assert.match(forecastPlan, /forecast_lines_project_as_of_date_idx/);
    });
  });
});
