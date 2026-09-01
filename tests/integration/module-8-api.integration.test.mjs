import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000008000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000008100';
const ADMIN_ID = '00000000-0000-4000-8000-000000008010';
const PROJECT_READER_ID = '00000000-0000-4000-8000-000000008011';
const MEMBER_ONLY_ID = '00000000-0000-4000-8000-000000008012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000008110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000008020';
const PROJECT_READER_ROLE_ID = '00000000-0000-4000-8000-000000008021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000008120';
const CLIENT_ID = '00000000-0000-4000-8000-000000008030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000008130';
const PROJECT_ID = '00000000-0000-4000-8000-000000008040';
const PROJECT_2_ID = '00000000-0000-4000-8000-000000008041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000008042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000008140';
const WBS_ID = '00000000-0000-4000-8000-000000008050';
const WBS_2_ID = '00000000-0000-4000-8000-000000008051';
const WBS_B_ID = '00000000-0000-4000-8000-000000008150';
const COST_CODE_ID = '00000000-0000-4000-8000-000000008060';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000008160';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000008070';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000008170';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000008080';
const COST_STRUCTURE_2_ID = '00000000-0000-4000-8000-000000008081';
const COST_STRUCTURE_B_ID = '00000000-0000-4000-8000-000000008180';
const BUDGET_ID = '00000000-0000-4000-8000-000000008090';
const BUDGET_B_ID = '00000000-0000-4000-8000-000000008190';
const VENDOR_1_ID = '00000000-0000-4000-8000-000000008200';
const VENDOR_2_ID = '00000000-0000-4000-8000-000000008201';
const VENDOR_EUR_ID = '00000000-0000-4000-8000-000000008202';
const VENDOR_INACTIVE_ID = '00000000-0000-4000-8000-000000008203';
const VENDOR_UNQUALIFIED_ID = '00000000-0000-4000-8000-000000008204';
const VENDOR_B_ID = '00000000-0000-4000-8000-000000008205';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000008300';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000008301';
const PASSWORD = 'Module8-pass-229-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_8_PERMISSIONS = [
  'procurement.pr.read',
  'procurement.pr.create',
  'procurement.rfq.manage',
  'procurement.quotation.record',
  'procurement.quotation.select'
];

/** Load built runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed two Companies, RBAC, Projects, cost structures, frozen budgets, Vendors and numbering for Module 8. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 8 Company Ltd',
        displayName: 'Module 8 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 8 Foreign Company Ltd',
        displayName: 'Module 8 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_8_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'procurement' },
      create: { code, name: code, domain: 'procurement' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: PROJECT_READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-8-project-reader', name: 'Module 8 Project Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_8_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: PROJECT_READER_ROLE_ID, permissionId: permissionByCode.get('procurement.pr.read') },
      ...MODULE_8_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module8-admin@example.test', name: 'Module 8 Admin' },
    { id: PROJECT_READER_ID, companyId: COMPANY_ID, email: 'module8-reader@example.test', name: 'Module 8 Project Reader' },
    { id: MEMBER_ONLY_ID, companyId: COMPANY_ID, email: 'module8-member@example.test', name: 'Module 8 Member Only' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module8-admin-b@example.test', name: 'Module 8 Foreign Admin' }
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
        code: 'MODULE8-CLIENT',
        legalName: 'Module 8 Client Ltd',
        displayName: 'Module 8 Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'MODULE8-FOREIGN-CLIENT',
        legalName: 'Module 8 Foreign Client Ltd',
        displayName: 'Module 8 Foreign Client',
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
        projectCode: 'MODULE8-PROJECT-A',
        name: 'Module 8 Project A',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_2_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE8-PROJECT-B',
        name: 'Module 8 Project B',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Islamabad, Pakistan'
      },
      {
        id: CLOSED_PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE8-CLOSED',
        name: 'Module 8 Closed Project',
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
        projectCode: 'MODULE8-FOREIGN-PROJECT',
        name: 'Module 8 Foreign Project',
        clientId: CLIENT_B_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
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
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9000', name: 'Foreign Cost', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });

  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'MAT', name: 'Materials', status: 'ACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FOR', name: 'Foreign Cost Type', status: 'ACTIVE' }
    ]
  });

  await client.projectCostCode.createMany({
    data: [
      { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_2_ID, projectId: PROJECT_2_ID, wbsNodeId: WBS_2_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_B_ID, projectId: PROJECT_B_ID, wbsNodeId: WBS_B_ID, costCodeId: COST_CODE_B_ID, costTypeId: COST_TYPE_B_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ]
  });

  await client.projectBudget.createMany({
    data: [
      {
        id: BUDGET_ID,
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        versionNo: 1,
        budgetType: 'BASELINE',
        status: 'FROZEN',
        approvedAt: new Date('2026-01-10T00:00:00.000Z'),
        totalCost: '50000.00',
        totalRevenue: '65000.00'
      },
      {
        id: BUDGET_B_ID,
        companyId: COMPANY_B_ID,
        projectId: PROJECT_B_ID,
        versionNo: 1,
        budgetType: 'BASELINE',
        status: 'FROZEN',
        approvedAt: new Date('2026-01-10T00:00:00.000Z'),
        totalCost: '10000.00',
        totalRevenue: '12000.00'
      }
    ]
  });

  await client.vendor.createMany({
    data: [
      { id: VENDOR_1_ID, companyId: COMPANY_ID, code: 'V-001', legalName: 'Alpha Supply Ltd', displayName: 'Alpha Supply', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_2_ID, companyId: COMPANY_ID, code: 'V-002', legalName: 'Beta Supply Ltd', displayName: 'Beta Supply', paymentTermsDays: 30, currency: null, status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_EUR_ID, companyId: COMPANY_ID, code: 'V-EUR', legalName: 'Euro Supply Ltd', displayName: 'Euro Supply', paymentTermsDays: 30, currency: 'EUR', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_INACTIVE_ID, companyId: COMPANY_ID, code: 'V-OFF', legalName: 'Inactive Supply Ltd', displayName: 'Inactive Supply', paymentTermsDays: 30, currency: 'USD', status: 'INACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_UNQUALIFIED_ID, companyId: COMPANY_ID, code: 'V-UNQ', legalName: 'Unqualified Supply Ltd', displayName: 'Unqualified Supply', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'PENDING' },
      { id: VENDOR_B_ID, companyId: COMPANY_B_ID, code: 'V-B', legalName: 'Foreign Supply Ltd', displayName: 'Foreign Supply', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
    ]
  });

  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'procurement.pr', prefix: 'PR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'procurement.rfq', prefix: 'RFQ-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'procurement.pr', prefix: 'PR-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'procurement.rfq', prefix: 'RFQ-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });

  await client.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: 'PROCUREMENT_PR',
      name: 'Procurement Requisition Approval',
      resourceType: 'purchase_requisition',
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
      ...options
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user through the real Module-24A route and return the server-issued access token. */
async function signIn(app, email = 'module8-admin@example.test') {
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

/** Create one reviewed purchase requisition through the public Module-8 endpoint. */
async function createRequisition(app, token, overrides = {}) {
  const projectId = overrides.projectId ?? PROJECT_ID;
  const line = {
    itemId: null,
    description: 'Ready-mix concrete',
    quantity: '2.5000',
    unit: 'm3',
    estimatedRate: '100.0000',
    wbsNodeId: overrides.wbsNodeId ?? (projectId === PROJECT_2_ID ? WBS_2_ID : WBS_ID),
    costCodeId: overrides.costCodeId ?? COST_CODE_ID,
    costTypeId: overrides.costTypeId ?? COST_TYPE_ID
  };

  return app.inject({
    method: 'POST',
    url: '/api/v1/procurement/requisitions',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      projectId,
      requiredDate: overrides.requiredDate ?? '2026-09-15',
      purpose: overrides.purpose ?? 'Concrete for foundation works',
      items: [line],
      ...(overrides.extraBody ?? {})
    }
  });
}

/** Submit one purchase requisition through the reviewed bodyless command. */
async function submitRequisition(app, token, requisitionId, extraBody = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/procurement/requisitions/${requisitionId}/submit`,
    headers: { authorization: `Bearer ${token}` },
    payload: extraBody
  });
}

/** Create one RFQ from a requisition or from a minimal direct line snapshot. */
async function createRfq(app, token, requisitionId, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/procurement/rfqs',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      projectId: overrides.projectId ?? PROJECT_ID,
      ...(requisitionId === undefined
        ? {
            items: overrides.items ?? [{
              description: 'Direct RFQ line',
              quantity: '2.5000',
              unit: 'm3'
            }]
          }
        : { requisitionId }),
      issueDate: overrides.issueDate ?? '2026-08-25',
      dueDate: overrides.dueDate ?? '2026-09-10',
      ...(overrides.extraBody ?? {})
    }
  });
}

/** Issue one RFQ to the caller-supplied reviewed Vendor set. */
async function issueRfq(app, token, rfqId, vendorIds) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/procurement/rfqs/${rfqId}/issue`,
    headers: { authorization: `Bearer ${token}` },
    payload: { vendorIds }
  });
}

/** Record one supplier quotation using item identities returned by the active RFQ. */
async function recordQuotation(app, token, rfq, vendorId, options = {}) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/procurement/rfqs/${rfq.id}/quotations`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      vendorId,
      quoteNo: options.quoteNo ?? `Q-${vendorId.slice(-4)}`,
      quoteDate: options.quoteDate ?? '2026-08-26',
      validUntil: options.validUntil ?? '2099-12-31',
      leadTimeDays: options.leadTimeDays ?? 7,
      items: options.items ?? [{
        rfqItemId: rfq.items[0].id,
        quantity: rfq.items[0].quantity,
        unitRate: options.unitRate ?? '100.0000',
        discount: options.discount ?? '10.00',
        tax: options.tax ?? '5.00'
      }],
      ...(options.extraBody ?? {})
    }
  });
}

/** Return one generated Module-8 OpenAPI operation and fail clearly when it is missing. */
function module8OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

test('Module 8 PostgreSQL/Fastify workflow covers requisition, RFQ, quotation comparison and pre-commitment selection', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/procurement/requisitions?projectId=${PROJECT_ID}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 0);

    response = await createRequisition(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const requisition = response.json().data;
    assert.equal(requisition.projectId, PROJECT_ID);
    assert.equal(requisition.requestedBy, ADMIN_ID);
    assert.equal(requisition.prNo, 'PR-0001');
    assert.equal(requisition.status, 'DRAFT');
    assert.equal(requisition.items.length, 1);

    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'SUBMITTED');

    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, eventType: 'purchase_requisition.submitted', resourceId: requisition.id }
    }), 1);

    response = await createRfq(app, token, requisition.id);
    assert.equal(response.statusCode, 201, response.body);
    const rfq = response.json().data;
    assert.equal(rfq.rfqNo, 'RFQ-0001');
    assert.equal(rfq.status, 'DRAFT');
    assert.equal(rfq.buyerUserId, ADMIN_ID);
    assert.equal(rfq.items.length, requisition.items.length);
    assert.equal(rfq.items[0].requisitionItemId, requisition.items[0].id);
    assert.equal(rfq.items[0].description, requisition.items[0].description);
    assert.equal(rfq.items[0].quantity, requisition.items[0].quantity);
    assert.equal(rfq.items[0].unit, requisition.items[0].unit);

    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ISSUED');
    assert.equal(response.json().data.vendors.length, 2);

    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, eventType: 'rfq.issued', resourceId: rfq.id }
    }), 1);

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      quoteNo: 'ALPHA-001',
      unitRate: '100.0000',
      discount: '10.00',
      tax: '5.00'
    });
    assert.equal(response.statusCode, 201, response.body);
    const lowest = response.json().data;
    assert.equal(lowest.subtotal, '240.00');
    assert.equal(lowest.tax, '5.00');
    assert.equal(lowest.total, '245.00');
    assert.equal(lowest.items[0].total, '245.00');

    response = await recordQuotation(app, token, rfq, VENDOR_2_ID, {
      quoteNo: 'BETA-001',
      unitRate: '110.0000',
      discount: '0.00',
      tax: '0.00'
    });
    assert.equal(response.statusCode, 201, response.body);
    const higher = response.json().data;
    assert.equal(higher.total, '275.00');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/procurement/rfqs/${rfq.id}/comparison`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.quotations.map((item) => item.id), [lowest.id, higher.id]);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quotationId: lowest.id, rationale: 'Lowest comparable evaluated offer.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.quotation.id, lowest.id);
    assert.equal(response.json().data.quotation.status, 'SELECTED');

    const selectedEvent = await client.outboxEvent.findFirstOrThrow({
      where: { companyId: COMPANY_ID, eventType: 'rfq.quotation_selected', resourceId: rfq.id }
    });
    assert.equal(selectedEvent.payload.financialCommitmentCreated, false);
    assert.equal(await client.costCommitment.count({ where: { companyId: COMPANY_ID, projectId: PROJECT_ID } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'supplier_quotation.received' } }), 2);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/procurement/requisitions?projectId=${PROJECT_ID}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, requisition.id);
  });
});

test('Module 8 optional Module-22 approval integration creates one replay-safe approval request', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const requisition = response.json().data;

    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING_APPROVAL');

    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING_APPROVAL');

    const requests = await client.approvalRequest.findMany({
      where: { companyId: COMPANY_ID, resourceType: 'purchase_requisition', resourceId: requisition.id }
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].status, 'PENDING');
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, eventType: 'purchase_requisition.submitted', resourceId: requisition.id }
    }), 1);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, eventType: 'approval.requested', resourceId: requests[0].id }
    }), 1);
  }, { procurementRequisitionApprovalDefinitionCode: 'PROCUREMENT_PR' });
});

test('Module 8 security rejects missing authority, cross-Company scope, closed Projects and browser-owned fields', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/procurement/requisitions' });
    assert.equal(response.statusCode, 401, response.body);

    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module8-reader@example.test');
    const memberToken = await signIn(app, 'module8-member@example.test');
    const foreignToken = await signIn(app, 'module8-admin-b@example.test');

    response = await createRequisition(app, readerToken);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createRequisition(app, memberToken);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/procurement/requisitions?projectId=${PROJECT_2_ID}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 0);

    response = await createRequisition(app, foreignToken, { projectId: PROJECT_ID });
    assert.equal(response.statusCode, 404, response.body);

    response = await createRequisition(app, adminToken, {
      extraBody: {
        companyId: COMPANY_B_ID,
        requestedBy: ADMIN_B_ID,
        prNo: 'ATTACK-PR',
        status: 'APPROVED'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await createRequisition(app, adminToken, { projectId: CLOSED_PROJECT_ID, wbsNodeId: WBS_ID });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await createRequisition(app, adminToken, { projectId: PROJECT_2_ID });
    assert.equal(response.statusCode, 201, response.body);
    const project2Requisition = response.json().data;
    response = await submitRequisition(app, adminToken, project2Requisition.id);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'PROCUREMENT_BUDGET_BLOCK');
  });
});

test('Module 8 validation protects Vendor eligibility, exact quotation authority and non-lowest selection policy', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const requisition = response.json().data;
    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await createRfq(app, token, requisition.id);
    assert.equal(response.statusCode, 201, response.body);
    const rfq = response.json().data;

    for (const invalidVendorId of [VENDOR_INACTIVE_ID, VENDOR_UNQUALIFIED_ID, VENDOR_B_ID]) {
      response = await issueRfq(app, token, rfq.id, [invalidVendorId]);
      assert.equal(response.statusCode, 409, response.body);
      assert.equal(errorCode(response), 'INVALID_VENDOR_SELECTION');
    }

    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]);
    assert.equal(response.statusCode, 200, response.body);

    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID]);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'RFQ_CLOSED');

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      extraBody: { subtotal: '1.00', total: '1.00', status: 'SELECTED' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      items: [
        { rfqItemId: rfq.items[0].id, quantity: '1.0000', unitRate: '10.0000', discount: '0.00', tax: '0.00' },
        { rfqItemId: rfq.items[0].id, quantity: '1.0000', unitRate: '10.0000', discount: '0.00', tax: '0.00' }
      ]
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'QUOTATION_INVALID');
  });

  await withApi(async ({ app }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token);
    const requisition = response.json().data;
    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await createRfq(app, token, requisition.id);
    const rfq = response.json().data;
    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]);
    assert.equal(response.statusCode, 200, response.body);

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, { quoteNo: 'LOW', unitRate: '90.0000', discount: '0.00', tax: '0.00' });
    assert.equal(response.statusCode, 201, response.body);
    const low = response.json().data;
    response = await recordQuotation(app, token, rfq, VENDOR_2_ID, { quoteNo: 'HIGH', unitRate: '120.0000', discount: '0.00', tax: '0.00' });
    assert.equal(response.statusCode, 201, response.body);
    const high = response.json().data;
    assert.ok(Number(high.total) > Number(low.total));

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quotationId: high.id }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_VENDOR_SELECTION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quotationId: high.id, rationale: 'Required specialist lead-time exception.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.quotation.id, high.id);
  }, { procurementRequireRationaleForNonLowestSelection: true });
});

test('Module 8 comparison refuses unsupported cross-currency normalization instead of inventing FX', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token);
    const requisition = response.json().data;
    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await createRfq(app, token, requisition.id);
    const rfq = response.json().data;
    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_EUR_ID]);
    assert.equal(response.statusCode, 200, response.body);
    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, { quoteNo: 'USD-Q', unitRate: '100.0000' });
    assert.equal(response.statusCode, 201, response.body);
    response = await recordQuotation(app, token, rfq, VENDOR_EUR_ID, { quoteNo: 'EUR-Q', unitRate: '100.0000' });
    assert.equal(response.statusCode, 201, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/procurement/rfqs/${rfq.id}/comparison`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'QUOTATION_INVALID');
  });
});

test('Module 8 database constraints enforce Project cost scope, RFQ requisition scope and Vendor invitation scope', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const requisition = response.json().data;

    await assert.rejects(
      client.purchaseRequisitionItem.create({
        data: {
          requisitionId: requisition.id,
          itemId: null,
          description: 'Cross-project cost attack',
          quantity: '1.0000',
          unit: 'ea',
          estimatedRate: '1.0000',
          wbsNodeId: WBS_2_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID
        }
      }),
      /cost structure|Project|constraint|23514/i
    );

    const project2Requisition = await client.purchaseRequisition.create({
      data: {
        companyId: COMPANY_ID,
        projectId: PROJECT_2_ID,
        prNo: 'PR-DIRECT-P2',
        requestedBy: ADMIN_ID,
        requiredDate: new Date('2026-09-20T00:00:00.000Z'),
        status: 'SUBMITTED',
        purpose: 'Cross-project scope test'
      }
    });
    await assert.rejects(
      client.rfq.create({
        data: {
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          rfqNo: 'RFQ-CROSS-PR',
          requisitionId: project2Requisition.id,
          issueDate: new Date('2026-08-25T00:00:00.000Z'),
          dueDate: new Date('2026-09-10T00:00:00.000Z'),
          status: 'DRAFT',
          buyerUserId: ADMIN_ID
        }
      }),
      /same Company and Project|scope|constraint|23514/i
    );

    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await createRfq(app, token, requisition.id);
    assert.equal(response.statusCode, 201, response.body);
    const rfq = response.json().data;
    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID]);
    assert.equal(response.statusCode, 200, response.body);

    await assert.rejects(
      client.rfqVendor.create({
        data: {
          rfqId: rfq.id,
          vendorId: VENDOR_B_ID,
          invitedAt: new Date(),
          responseStatus: 'INVITED'
        }
      }),
      /same Company|constraint|23514/i
    );

    await assert.rejects(
      client.supplierQuotation.create({
        data: {
          rfqId: rfq.id,
          vendorId: VENDOR_2_ID,
          quoteNo: 'UNINVITED',
          quoteDate: new Date('2026-08-26T00:00:00.000Z'),
          validUntil: new Date('2099-12-31T00:00:00.000Z'),
          subtotal: '1.00',
          tax: '0.00',
          total: '1.00',
          leadTimeDays: 1,
          status: 'RECEIVED'
        }
      }),
      /invited|same Company|constraint|23514/i
    );


    response = await createRfq(app, token, undefined, {
      items: [{ description: 'Independent direct RFQ line', quantity: '1.0000', unit: 'ea' }]
    });
    assert.equal(response.statusCode, 201, response.body);
    const otherRfq = response.json().data;
    assert.equal(otherRfq.items.length, 1);
    assert.equal(otherRfq.items[0].requisitionItemId, null);

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      quoteNo: 'CROSS-RFQ-ATTACK',
      items: [{
        rfqItemId: otherRfq.items[0].id,
        quantity: otherRfq.items[0].quantity,
        unitRate: '1.0000',
        discount: '0.00',
        tax: '0.00'
      }]
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'QUOTATION_INVALID');

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, { quoteNo: 'VALID-RFQ-LINE' });
    assert.equal(response.statusCode, 201, response.body);
    const validQuotation = response.json().data;

    await assert.rejects(
      client.supplierQuotationItem.update({
        where: { id: validQuotation.items[0].id },
        data: { rfqItemId: otherRfq.items[0].id }
      }),
      /same RFQ|constraint|23514/i
    );

    const otherRequisitionResponse = await createRequisition(app, token, { purpose: 'Independent requisition line' });
    assert.equal(otherRequisitionResponse.statusCode, 201, otherRequisitionResponse.body);
    const otherRequisition = otherRequisitionResponse.json().data;
    await assert.rejects(
      client.rfqItem.create({
        data: {
          rfqId: rfq.id,
          requisitionItemId: otherRequisition.items[0].id,
          description: 'Wrong requisition line',
          quantity: '1.0000',
          unit: 'ea'
        }
      }),
      /source requisition|constraint|23514/i
    );
  });
});

test('Module 8 live OpenAPI exposes exactly eight reviewed operations and no vendor, commitment or PO conversion API', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/procurement/requisitions', 'module8ListPurchaseRequisitions'],
      ['POST', '/api/v1/procurement/requisitions', 'module8CreatePurchaseRequisition'],
      ['POST', '/api/v1/procurement/requisitions/{id}/submit', 'module8SubmitPurchaseRequisition'],
      ['POST', '/api/v1/procurement/rfqs', 'module8CreateRfq'],
      ['POST', '/api/v1/procurement/rfqs/{id}/issue', 'module8IssueRfq'],
      ['POST', '/api/v1/procurement/rfqs/{id}/quotations', 'module8RecordSupplierQuotation'],
      ['GET', '/api/v1/procurement/rfqs/{id}/comparison', 'module8GetRfqComparison'],
      ['POST', '/api/v1/procurement/rfqs/{id}/select-quotation', 'module8SelectQuotation']
    ];
    const actual = [];

    for (const [method, route, operationId] of expected) {
      const operation = module8OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actual.push(`${method} ${route}`);
    }

    const documented = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem[method];
        if (operation?.operationId?.startsWith('module8')) documented.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.deepEqual(documented.sort(), actual.sort());

    for (const forbiddenPath of [
      '/api/v1/procurement/vendors',
      '/api/v1/procurement/vendor-contacts',
      '/api/v1/procurement/rfqs/{id}/items',
      '/api/v1/procurement/rfqs/{id}/convert-to-po',
      '/api/v1/procurement/commitments',
      '/api/v1/procurement/requisitions/{id}/revise',
      '/api/v1/procurement/requisitions/{id}/return-to-draft'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }

    const createPrBody = module8OpenApiOperation(document, '/api/v1/procurement/requisitions', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(createPrBody.additionalProperties, false);
    for (const field of ['companyId', 'requestedBy', 'prNo', 'status']) {
      assert.equal(Object.hasOwn(createPrBody.properties, field), false, field);
    }

    const quotationBody = module8OpenApiOperation(document, '/api/v1/procurement/rfqs/{id}/quotations', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(quotationBody.additionalProperties, false);
    for (const field of ['subtotal', 'total', 'status', 'companyId']) {
      assert.equal(Object.hasOwn(quotationBody.properties, field), false, field);
    }

    const listParameters = module8OpenApiOperation(document, '/api/v1/procurement/requisitions', 'GET').parameters ?? [];
    const queryNames = listParameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name).sort();
    assert.deepEqual(queryNames, ['page', 'pageSize', 'projectId']);
  });
});

// Verify Project locking plus Foundation numbering keep concurrent PR/RFQ creation unique and lifecycle retries side-effect safe.
test('Module 8 operational concurrency serializes numbering and retry-safe procurement lifecycle commands', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const requisitionResponses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createRequisition(app, token, {
        purpose: `Concurrent requisition ${index + 1}`
      }))
    );
    assert.equal(requisitionResponses.every((response) => response.statusCode === 201), true);
    const requisitions = requisitionResponses.map((response) => response.json().data);
    assert.deepEqual(
      requisitions.map((item) => item.prNo).sort(),
      ['PR-0001', 'PR-0002', 'PR-0003', 'PR-0004', 'PR-0005', 'PR-0006']
    );
    assert.equal(new Set(requisitions.map((item) => item.id)).size, 6);

    const requisition = requisitions[0];
    const submitResponses = await Promise.all([
      submitRequisition(app, token, requisition.id),
      submitRequisition(app, token, requisition.id)
    ]);
    assert.deepEqual(submitResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(await client.auditLog.count({
      where: { entityId: requisition.id, action: 'purchase_requisition.submitted' }
    }), 1);
    assert.equal(await client.outboxEvent.count({
      where: { resourceId: requisition.id, eventType: 'purchase_requisition.submitted' }
    }), 1);

    const rfqResponses = await Promise.all(
      Array.from({ length: 4 }, () => createRfq(app, token, undefined))
    );
    assert.equal(rfqResponses.every((response) => response.statusCode === 201), true);
    const rfqs = rfqResponses.map((response) => response.json().data);
    assert.deepEqual(
      rfqs.map((item) => item.rfqNo).sort(),
      ['RFQ-0001', 'RFQ-0002', 'RFQ-0003', 'RFQ-0004']
    );
    assert.equal(new Set(rfqs.map((item) => item.id)).size, 4);

    const rfq = rfqs[0];
    const issueResponses = await Promise.all([
      issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]),
      issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID])
    ]);
    assert.deepEqual(issueResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(await client.rfqVendor.count({ where: { rfqId: rfq.id } }), 2);
    assert.equal(await client.auditLog.count({ where: { entityId: rfq.id, action: 'rfq.issued' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: rfq.id, eventType: 'rfq.issued' } }), 1);

    let response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      quoteNo: 'OPS-LOW',
      unitRate: '90.0000',
      discount: '0.00',
      tax: '0.00'
    });
    assert.equal(response.statusCode, 201, response.body);
    const low = response.json().data;
    response = await recordQuotation(app, token, rfq, VENDOR_2_ID, {
      quoteNo: 'OPS-HIGH',
      unitRate: '120.0000',
      discount: '0.00',
      tax: '0.00'
    });
    assert.equal(response.statusCode, 201, response.body);

    const selectionResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quotationId: low.id, rationale: 'Concurrent retry-safe selection.' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
        headers: { authorization: `Bearer ${token}` },
        payload: { quotationId: low.id, rationale: 'Concurrent retry-safe selection.' }
      })
    ]);
    assert.deepEqual(selectionResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(await client.supplierQuotation.count({ where: { rfqId: rfq.id, status: 'SELECTED' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: rfq.id, action: 'rfq.quotation_selected' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: rfq.id, eventType: 'rfq.quotation_selected' } }), 1);
    assert.equal(await client.costCommitment.count({ where: { companyId: COMPANY_ID } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID } }), 0);

    const prSequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'procurement.pr' }
    });
    const rfqSequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'procurement.rfq' }
    });
    assert.equal(prSequence.nextValue, 7n);
    assert.equal(rfqSequence.nextValue, 5n);
  });
});

// Verify rejected quotation/selection commands leave no partial state and reviewed Stage-13 indexes support key read shapes.
test('Module 8 operational rollback boundaries and query plans preserve atomic procurement state and reviewed indexes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    let response = await createRequisition(app, token, { purpose: 'Operational rollback and index-plan fixture' });
    assert.equal(response.statusCode, 201, response.body);
    const requisition = response.json().data;
    response = await submitRequisition(app, token, requisition.id);
    assert.equal(response.statusCode, 200, response.body);
    response = await createRfq(app, token, requisition.id);
    assert.equal(response.statusCode, 201, response.body);
    const rfq = response.json().data;
    response = await issueRfq(app, token, rfq.id, [VENDOR_1_ID, VENDOR_2_ID]);
    assert.equal(response.statusCode, 200, response.body);

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      quoteNo: 'OVERFLOW',
      items: [{
        rfqItemId: rfq.items[0].id,
        quantity: '99999999999999.9999',
        unitRate: '99999999999999.9999',
        discount: '0.00',
        tax: '0.00'
      }]
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'QUOTATION_INVALID');
    assert.equal(await client.supplierQuotation.count({ where: { rfqId: rfq.id } }), 0);
    assert.equal(await client.auditLog.count({ where: { action: 'supplier_quotation.received' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { eventType: 'supplier_quotation.received' } }), 0);
    const invitationAfterRejectedQuote = await client.rfqVendor.findUniqueOrThrow({
      where: { rfqId_vendorId: { rfqId: rfq.id, vendorId: VENDOR_1_ID } }
    });
    assert.equal(invitationAfterRejectedQuote.responseStatus, 'INVITED');

    response = await recordQuotation(app, token, rfq, VENDOR_1_ID, {
      quoteNo: 'PLAN-LOW',
      unitRate: '90.0000',
      discount: '0.00',
      tax: '0.00'
    });
    assert.equal(response.statusCode, 201, response.body);
    const low = response.json().data;
    response = await recordQuotation(app, token, rfq, VENDOR_2_ID, {
      quoteNo: 'PLAN-HIGH',
      unitRate: '120.0000',
      discount: '0.00',
      tax: '0.00'
    });
    assert.equal(response.statusCode, 201, response.body);
    const high = response.json().data;

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quotationId: high.id }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_VENDOR_SELECTION');
    const rfqAfterRejectedSelection = await client.rfq.findUniqueOrThrow({ where: { id: rfq.id } });
    assert.equal(rfqAfterRejectedSelection.status, 'ISSUED');
    assert.equal(await client.supplierQuotation.count({ where: { rfqId: rfq.id, status: 'SELECTED' } }), 0);
    assert.equal(await client.auditLog.count({ where: { entityId: rfq.id, action: 'rfq.quotation_selected' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: rfq.id, eventType: 'rfq.quotation_selected' } }), 0);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/procurement/rfqs/${rfq.id}/select-quotation`,
      headers: { authorization: `Bearer ${token}` },
      payload: { quotationId: high.id, rationale: 'Specialist delivery lead-time exception.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.quotation.id, high.id);
    assert.notEqual(response.json().data.quotation.id, low.id);

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const vendorPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, code
        FROM vendors
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND status = 'ACTIVE'
          AND qualification_status = 'QUALIFIED'
        LIMIT 50
      `));
      assert.match(vendorPlan, /vendors_company_status_qualification_idx/);

      const requisitionPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, pr_no, required_date
        FROM purchase_requisitions
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'SUBMITTED'
        ORDER BY required_date
        LIMIT 50
      `));
      assert.match(requisitionPlan, /purchase_requisitions_company_project_status_required_idx/);

      const rfqPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, rfq_no, due_date
        FROM rfqs
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'SELECTED'
        ORDER BY due_date
        LIMIT 50
      `));
      assert.match(rfqPlan, /rfqs_company_project_status_due_idx/);

      const invitationPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT vendor_id, response_status
        FROM rfq_vendors
        WHERE rfq_id = '${rfq.id}'::uuid
          AND response_status = 'RESPONDED'
        LIMIT 50
      `));
      assert.match(invitationPlan, /rfq_vendors_rfq_response_idx/);

      const quotationPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, total
        FROM supplier_quotations
        WHERE rfq_id = '${rfq.id}'::uuid
          AND status = 'SELECTED'
        ORDER BY total
        LIMIT 50
      `));
      assert.match(quotationPlan, /supplier_quotations_rfq_status_total_idx/);

      const quotationItemPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, rfq_item_id, total
        FROM supplier_quotation_items
        WHERE quotation_id = '${high.id}'::uuid
        LIMIT 50
      `));
      assert.match(quotationItemPlan, /supplier_quotation_items_quotation_idx/);
    });
  }, { procurementRequireRationaleForNonLowestSelection: true });
});
