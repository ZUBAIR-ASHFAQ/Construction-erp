import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000009001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000009002';
const ADMIN_ID = '00000000-0000-4000-8000-000000009010';
const READER_ID = '00000000-0000-4000-8000-000000009011';
const BUYER_NO_DIRECT_ID = '00000000-0000-4000-8000-000000009013';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000009012';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000009020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000009021';
const BUYER_NO_DIRECT_ROLE_ID = '00000000-0000-4000-8000-000000009023';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000009022';
const CLIENT_ID = '00000000-0000-4000-8000-000000009030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000009031';
const PROJECT_ID = '00000000-0000-4000-8000-000000009040';
const PROJECT_NO_BUDGET_ID = '00000000-0000-4000-8000-000000009041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000009042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000009043';
const WBS_ID = '00000000-0000-4000-8000-000000009050';
const WBS_B_ID = '00000000-0000-4000-8000-000000009051';
const COST_CODE_ID = '00000000-0000-4000-8000-000000009060';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000009061';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000009070';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000009071';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000009080';
const COST_STRUCTURE_B_ID = '00000000-0000-4000-8000-000000009081';
const BUDGET_ID = '00000000-0000-4000-8000-000000009090';
const VENDOR_ID = '00000000-0000-4000-8000-000000009100';
const VENDOR_ALT_ID = '00000000-0000-4000-8000-000000009101';
const VENDOR_INACTIVE_ID = '00000000-0000-4000-8000-000000009102';
const VENDOR_B_ID = '00000000-0000-4000-8000-000000009103';
const RFQ_ID = '00000000-0000-4000-8000-000000009110';
const QUOTATION_ID = '00000000-0000-4000-8000-000000009120';
const UNSELECTED_QUOTATION_ID = '00000000-0000-4000-8000-000000009121';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000009130';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000009131';
const PASSWORD = 'Module9-pass-240-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module9-auth-secret-0123456789abcdef';

const MODULE_9_PERMISSIONS = [
  'purchase_orders.read',
  'purchase_orders.create',
  'purchase_orders.edit',
  'purchase_orders.submit',
  'purchase_orders.issue',
  'purchase_orders.revise',
  'purchase_orders.direct_purchase'
];
const APPROVAL_PERMISSIONS = ['approvals.inbox.read', 'approvals.act'];

/** Load built runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest valid Stage-14 dependency graph for real Purchase Order integration checks. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 9 Company Ltd',
        displayName: 'Module 9 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 9 Foreign Company Ltd',
        displayName: 'Module 9 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const allPermissions = [...MODULE_9_PERMISSIONS, ...APPROVAL_PERMISSIONS];
  const permissions = [];
  for (const code of allPermissions) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: code.startsWith('purchase_orders.') ? 'purchase-orders' : 'approvals' },
      create: { code, name: code, domain: code.startsWith('purchase_orders.') ? 'purchase-orders' : 'approvals' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-9-admin', name: 'Module 9 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-9-reader', name: 'Module 9 Reader', isSystem: false, status: 'ACTIVE' },
      { id: BUYER_NO_DIRECT_ROLE_ID, companyId: COMPANY_ID, code: 'module-9-buyer-no-direct', name: 'Module 9 Buyer Without Direct Purchase', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-9-admin', name: 'Module 9 Foreign Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...allPermissions.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('purchase_orders.read') },
      ...MODULE_9_PERMISSIONS.filter((code) => code !== 'purchase_orders.direct_purchase').map((code) => ({ roleId: BUYER_NO_DIRECT_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_9_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module9-admin@example.test', name: 'Module 9 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module9-reader@example.test', name: 'Module 9 Reader' },
    { id: BUYER_NO_DIRECT_ID, companyId: COMPANY_ID, email: 'module9-buyer-no-direct@example.test', name: 'Module 9 Buyer Without Direct Purchase' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module9-admin-b@example.test', name: 'Module 9 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: BUYER_NO_DIRECT_ID, roleId: BUYER_NO_DIRECT_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'MODULE9-CLIENT', legalName: 'Module 9 Client Ltd', displayName: 'Module 9 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'MODULE9-FOREIGN-CLIENT', legalName: 'Module 9 Foreign Client Ltd', displayName: 'Module 9 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'MODULE9-A', name: 'Module 9 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: PROJECT_NO_BUDGET_ID, companyId: COMPANY_ID, projectCode: 'MODULE9-NO-BUDGET', name: 'Module 9 No Budget Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: CLOSED_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'MODULE9-CLOSED', name: 'Module 9 Closed Project', clientId: CLIENT_ID, status: 'CLOSED', currency: 'USD', startDate: new Date('2025-01-01T00:00:00.000Z'), plannedEndDate: new Date('2025-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'MODULE9-B', name: 'Module 9 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'READER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: BUYER_NO_DIRECT_ID, projectRole: 'BUYER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.wbsNode.createMany({
    data: [
      { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Module 9 WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, parentId: null, code: 'B', name: 'Module 9 Foreign WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
    ]
  });
  await client.costCode.createMany({
    data: [
      { id: COST_CODE_ID, companyId: COMPANY_ID, code: '2000', name: 'Materials', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9000', name: 'Foreign Materials', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });
  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'MAT', name: 'Materials', status: 'ACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FMT', name: 'Foreign Materials', status: 'ACTIVE' }
    ]
  });
  await client.projectCostCode.createMany({
    data: [
      { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_B_ID, projectId: PROJECT_B_ID, wbsNodeId: WBS_B_ID, costCodeId: COST_CODE_B_ID, costTypeId: COST_TYPE_B_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ]
  });

  await client.projectBudget.create({
    data: { id: BUDGET_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, versionNo: 1, budgetType: 'BASELINE', status: 'FROZEN', approvedAt: new Date('2026-01-10T00:00:00.000Z'), totalCost: '50000.00', totalRevenue: '65000.00' }
  });

  await client.vendor.createMany({
    data: [
      { id: VENDOR_ID, companyId: COMPANY_ID, code: 'M9-V001', legalName: 'Module 9 Selected Vendor Ltd', displayName: 'Module 9 Selected Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_ALT_ID, companyId: COMPANY_ID, code: 'M9-V002', legalName: 'Module 9 Alternate Vendor Ltd', displayName: 'Module 9 Alternate Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_INACTIVE_ID, companyId: COMPANY_ID, code: 'M9-OFF', legalName: 'Module 9 Inactive Vendor Ltd', displayName: 'Module 9 Inactive Vendor', paymentTermsDays: 30, currency: 'USD', status: 'INACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_B_ID, companyId: COMPANY_B_ID, code: 'M9-VB', legalName: 'Module 9 Foreign Vendor Ltd', displayName: 'Module 9 Foreign Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
    ]
  });

  await client.rfq.create({
    data: { id: RFQ_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, rfqNo: 'RFQ-M9-001', requisitionId: null, issueDate: new Date('2026-08-20T00:00:00.000Z'), dueDate: new Date('2026-08-25T00:00:00.000Z'), status: 'SELECTED', buyerUserId: ADMIN_ID }
  });
  await client.rfqVendor.createMany({
    data: [
      { rfqId: RFQ_ID, vendorId: VENDOR_ID, invitedAt: new Date('2026-08-20T08:00:00.000Z'), responseStatus: 'RESPONDED' },
      { rfqId: RFQ_ID, vendorId: VENDOR_ALT_ID, invitedAt: new Date('2026-08-20T08:00:00.000Z'), responseStatus: 'RESPONDED' }
    ]
  });
  await client.supplierQuotation.createMany({
    data: [
      { id: QUOTATION_ID, rfqId: RFQ_ID, vendorId: VENDOR_ID, quoteNo: 'M9-Q-SELECTED', quoteDate: new Date('2026-08-21T00:00:00.000Z'), validUntil: new Date('2099-12-31T00:00:00.000Z'), subtotal: '200.00', tax: '10.00', total: '210.00', leadTimeDays: 7, status: 'SELECTED' },
      { id: UNSELECTED_QUOTATION_ID, rfqId: RFQ_ID, vendorId: VENDOR_ALT_ID, quoteNo: 'M9-Q-OTHER', quoteDate: new Date('2026-08-21T00:00:00.000Z'), validUntil: new Date('2099-12-31T00:00:00.000Z'), subtotal: '200.00', tax: '10.00', total: '210.00', leadTimeDays: 8, status: 'RECEIVED' }
    ]
  });

  await client.numberSequence.create({
    data: { companyId: COMPANY_ID, sequenceKey: 'purchase-order', prefix: 'PO-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  });

  await client.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: 'PURCHASE_ORDER',
      name: 'Purchase Order Approval',
      resourceType: 'purchase_order',
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
      purchaseOrderApprovalDefinitionCode: 'PURCHASE_ORDER',
      ...options
    });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded user through the real Module-24A route and return the access token. */
async function signIn(app, email = 'module9-admin@example.test') {
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

/** Build the reviewed quotation-backed draft PO request with one cost-coded line. */
function purchaseOrderPayload(overrides = {}) {
  return {
    projectId: overrides.projectId ?? PROJECT_ID,
    vendorId: overrides.vendorId ?? VENDOR_ID,
    quotationId: overrides.quotationId ?? QUOTATION_ID,
    orderDate: overrides.orderDate ?? '2026-08-24',
    currency: overrides.currency ?? 'USD',
    deliveryAddress: overrides.deliveryAddress ?? 'Module 9 Project Site, Lahore',
    terms: overrides.terms ?? 'Net 30 days',
    items: overrides.items ?? [{
      itemId: null,
      description: 'Structural steel supply',
      quantity: '2.0000',
      unit: 'ton',
      unitRate: '100.0000',
      taxRate: '5.0000',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID
    }],
    ...(overrides.extraBody ?? {})
  };
}

/** Create one draft PO through the reviewed public endpoint. */
async function createPurchaseOrder(app, token, overrides = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/purchase-orders',
    headers: { authorization: `Bearer ${token}` },
    payload: purchaseOrderPayload(overrides)
  });
}

/** Approve the Module-22 request created for one Purchase Order submission. */
async function approvePurchaseOrder(app, client, token, purchaseOrderId) {
  const request = await client.approvalRequest.findFirst({
    where: { companyId: COMPANY_ID, resourceType: 'purchase_order', resourceId: purchaseOrderId }
  });
  assert.ok(request, 'Purchase Order approval request was not created.');
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/approvals/requests/${request.id}/actions`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': `module9-approve-${purchaseOrderId}` },
    payload: { action: 'APPROVE', comment: 'Approved for controlled issue' }
  });
  assert.equal(response.statusCode, 200, response.body);
  return request;
}

/** Install one disposable PostgreSQL trigger that forces a selected Purchase Order outbox event to fail. */
async function installOutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_9_ops_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 9 operational forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_9_ops_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_9_ops_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_9_ops_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable operational failure trigger/function so later integration checks see the normal schema. */
async function removeOutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_9_ops_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_9_ops_fail_outbox_event()');
}

/** Return one generated Module-9 OpenAPI operation and fail clearly when it is missing. */
function module9OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

test('Module 9 PostgreSQL/Fastify workflow covers draft, approval, issue, revision, cancellation and Module-7 commitments', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/purchase-orders?projectId=${PROJECT_ID}&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 0);

    response = await createPurchaseOrder(app, token);
    assert.equal(response.statusCode, 201, response.body);
    const created = response.json().data;
    assert.equal(created.poNo, 'PO-0001');
    assert.equal(created.status, 'DRAFT');
    assert.equal(created.subtotal, '200.00');
    assert.equal(created.tax, '10.00');
    assert.equal(created.total, '210.00');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/purchase-orders/${created.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { terms: 'Net 30 days, inspected delivery' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.terms, 'Net 30 days, inspected delivery');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${created.id}/submit`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING_APPROVAL');

    const approval = await approvePurchaseOrder(app, client, token, created.id);
    assert.equal(await client.approvalAction.count({ where: { approvalRequestId: approval.id } }), 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${created.id}/issue`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ISSUED');

    const issuedCommitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: created.id }
    });
    assert.equal(issuedCommitments.length, 1);
    assert.equal(issuedCommitments[0].status, 'ACTIVE');
    assert.equal(issuedCommitments[0].remainingAmount.toString(), '210');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${created.id}/issue`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: created.id, eventType: 'purchase_order.issued' } }), 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${created.id}/revise`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        reason: 'Increase ordered steel quantity',
        items: [{
          itemId: null,
          description: 'Structural steel supply',
          quantity: '3.0000',
          unit: 'ton',
          unitRate: '100.0000',
          taxRate: '5.0000',
          wbsNodeId: WBS_ID,
          costCodeId: COST_CODE_ID,
          costTypeId: COST_TYPE_ID
        }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, '315.00');
    assert.equal(response.json().data.revisions.length, 1);
    assert.equal(response.json().data.revisions[0].revisionNo, 1);
    assert.deepEqual(
      response.json().data.revisions[0].items.map((item) => item.snapshotSide),
      ['AFTER', 'BEFORE']
    );
    assert.equal(await client.purchaseOrderRevisionItem.count({
      where: { purchaseOrderRevisionId: response.json().data.revisions[0].id }
    }), 2);

    const revisedCommitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: created.id },
      orderBy: [{ sourceLineId: 'asc' }, { id: 'asc' }]
    });
    assert.equal(revisedCommitments.filter((item) => item.status === 'ACTIVE').length, 1);
    assert.equal(revisedCommitments.find((item) => item.status === 'ACTIVE').remainingAmount.toString(), '315');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${created.id}/cancel`,
      headers: { authorization: `Bearer ${token}` },
      payload: { reason: 'Scope cancelled by authorized buyer' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CANCELLED');
    assert.equal(response.json().data.cancelReason, 'Scope cancelled by authorized buyer');
    assert.equal(response.json().data.cancelledBy, ADMIN_ID);
    assert.ok(response.json().data.cancelledAt);

    const persistedCancellation = await client.purchaseOrder.findFirstOrThrow({ where: { id: created.id } });
    assert.equal(persistedCancellation.cancelReason, 'Scope cancelled by authorized buyer');
    assert.equal(persistedCancellation.cancelledBy, ADMIN_ID);
    assert.ok(persistedCancellation.cancelledAt);

    const persistedRevision = await client.purchaseOrderRevision.findFirstOrThrow({
      where: { purchaseOrderId: created.id, revisionNo: 1 },
      include: { items: true }
    });
    await assert.rejects(
      () => client.purchaseOrderRevision.update({
        where: { id: persistedRevision.id },
        data: { reason: 'Tampered revision reason' }
      }),
      /immutable|23514/i
    );
    await assert.rejects(
      () => client.purchaseOrderRevisionItem.update({
        where: { id: persistedRevision.items[0].id },
        data: { description: 'Tampered revision line' }
      }),
      /immutable|23514/i
    );
    await assert.rejects(
      () => client.purchaseOrder.update({
        where: { id: created.id },
        data: { cancelReason: 'Tampered cancellation reason' }
      }),
      /immutable|23514/i
    );

    const cancelledCommitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: created.id }
    });
    assert.ok(cancelledCommitments.length >= 1);
    assert.ok(cancelledCommitments.every((item) => item.status === 'CANCELLED' && item.remainingAmount.toString() === '0'));

    const eventTypes = (await client.outboxEvent.findMany({
      where: { companyId: COMPANY_ID, resourceType: 'purchase_order', resourceId: created.id }
    })).map((row) => row.eventType).sort();
    assert.deepEqual(eventTypes, [
      'purchase_order.cancelled',
      'purchase_order.created',
      'purchase_order.issued',
      'purchase_order.revised',
      'purchase_order.submitted'
    ]);

    const auditActions = (await client.auditLog.findMany({
      where: { companyId: COMPANY_ID, entityType: 'purchase_order', entityId: created.id }
    })).map((row) => row.action);
    for (const action of ['purchase_order.created', 'purchase_order.submitted', 'purchase_order.issued', 'purchase_order.revised', 'purchase_order.cancelled']) {
      assert.ok(auditActions.includes(action), action);
    }

    const journals = await client.journal.count({ where: { companyId: COMPANY_ID } });
    assert.equal(journals, 0);
  });
});

test('Module 9 security rejects unauthenticated writes, missing Project authority, cross-Company reads and browser-owned fields', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/purchase-orders' });
    assert.equal(response.statusCode, 401);

    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module9-reader@example.test');
    const foreignToken = await signIn(app, 'module9-admin-b@example.test');

    response = await createPurchaseOrder(app, readerToken);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createPurchaseOrder(app, adminToken, {
      extraBody: { companyId: COMPANY_B_ID, actorUserId: ADMIN_B_ID, poNo: 'ATTACK-PO', status: 'ISSUED', total: '1.00' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    const created = await createPurchaseOrder(app, adminToken);
    assert.equal(created.statusCode, 201, created.body);
    const poId = created.json().data.id;

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/purchase-orders/${poId}`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'PO_NOT_FOUND');

    response = await createPurchaseOrder(app, adminToken, { projectId: PROJECT_NO_BUDGET_ID });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'PO_BUDGET_BLOCK');

    response = await createPurchaseOrder(app, adminToken, { projectId: CLOSED_PROJECT_ID });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
  });
});

test('Module 9 quotation and direct-purchase validation stay server-authoritative', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await createPurchaseOrder(app, token, { vendorId: VENDOR_INACTIVE_ID });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await createPurchaseOrder(app, token, { vendorId: VENDOR_ALT_ID, quotationId: UNSELECTED_QUOTATION_ID });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await createPurchaseOrder(app, token, {
      items: [{
        itemId: null,
        description: 'Structural steel supply',
        quantity: '1.0000',
        unit: 'ton',
        unitRate: '100.0000',
        taxRate: '5.0000',
        wbsNodeId: WBS_ID,
        costCodeId: COST_CODE_ID,
        costTypeId: COST_TYPE_ID
      }]
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    const directPayload = {
      ...purchaseOrderPayload(),
      quotationId: null,
      directPurchaseReason: 'Urgent site requirement with no competitive quotation available.'
    };
    const buyerWithoutDirectToken = await signIn(app, 'module9-buyer-no-direct@example.test');
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/purchase-orders',
      headers: { authorization: `Bearer ${buyerWithoutDirectToken}` },
      payload: directPayload
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/purchase-orders',
      headers: { authorization: `Bearer ${token}` },
      payload: directPayload
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.quotationId, null);
    assert.equal(response.json().data.directPurchaseReason, directPayload.directPurchaseReason);

    const directPoId = response.json().data.id;
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${directPoId}/submit`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);

    const approval = await client.approvalRequest.findFirst({
      where: { companyId: COMPANY_ID, resourceType: 'purchase_order', resourceId: directPoId }
    });
    assert.ok(approval);
    assert.equal(approval.payloadSnapshot.directPurchaseReason, directPayload.directPurchaseReason);
    assert.equal(approval.payloadSnapshot.purchaseSource, 'DIRECT_PURCHASE');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/purchase-orders',
      headers: { authorization: `Bearer ${token}` },
      payload: { ...purchaseOrderPayload(), quotationId: null }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');
  });
});

test('Module 9 database constraints reject cross-scope quotation, cost structure and revision creator writes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await assert.rejects(
      () => client.purchaseOrder.create({
        data: {
          companyId: COMPANY_ID,
          projectId: PROJECT_ID,
          poNo: 'PO-BAD-VENDOR',
          vendorId: VENDOR_ALT_ID,
          quotationId: QUOTATION_ID,
          orderDate: new Date('2026-08-24T00:00:00.000Z'),
          currency: 'USD',
          status: 'DRAFT',
          subtotal: '200.00',
          tax: '10.00',
          total: '210.00',
          deliveryAddress: 'Invalid scope',
          terms: 'Invalid scope'
        }
      }),
      /quotation|Vendor|Company|Project|23514/i
    );

    const valid = await client.purchaseOrder.create({
      data: {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        poNo: 'PO-DB-VALID',
        vendorId: VENDOR_ID,
        quotationId: QUOTATION_ID,
        orderDate: new Date('2026-08-24T00:00:00.000Z'),
        currency: 'USD',
        status: 'DRAFT',
        subtotal: '200.00',
        tax: '10.00',
        total: '210.00',
        deliveryAddress: 'Valid scope',
        terms: 'Valid scope'
      }
    });

    await assert.rejects(
      () => client.purchaseOrderItem.create({
        data: {
          purchaseOrderId: valid.id,
          itemId: null,
          description: 'Invalid foreign cost structure',
          quantity: '1.0000',
          unit: 'ea',
          unitRate: '1.0000',
          taxRate: '0.0000',
          lineTotal: '1.00',
          wbsNodeId: WBS_B_ID,
          costCodeId: COST_CODE_B_ID,
          costTypeId: COST_TYPE_B_ID
        }
      }),
      /cost structure|posting-enabled|23514/i
    );

    await assert.rejects(
      () => client.purchaseOrderRevision.create({
        data: {
          purchaseOrderId: valid.id,
          revisionNo: 1,
          reason: 'Invalid foreign creator',
          totalBefore: '210.00',
          totalAfter: '210.00',
          approvedAt: new Date(),
          createdBy: ADMIN_B_ID
        }
      }),
      /creator|same Company|23514/i
    );
  });
});

test('Module 9 live OpenAPI exposes exactly eight reviewed operations and no downstream or direct-purchase APIs', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/purchase-orders', 'module9ListPurchaseOrders'],
      ['POST', '/api/v1/purchase-orders', 'module9CreatePurchaseOrder'],
      ['GET', '/api/v1/purchase-orders/{id}', 'module9GetPurchaseOrder'],
      ['PATCH', '/api/v1/purchase-orders/{id}', 'module9UpdatePurchaseOrder'],
      ['POST', '/api/v1/purchase-orders/{id}/submit', 'module9SubmitPurchaseOrder'],
      ['POST', '/api/v1/purchase-orders/{id}/issue', 'module9IssuePurchaseOrder'],
      ['POST', '/api/v1/purchase-orders/{id}/revise', 'module9RevisePurchaseOrder'],
      ['POST', '/api/v1/purchase-orders/{id}/cancel', 'module9CancelPurchaseOrder']
    ];
    const actual = [];
    for (const [method, route, operationId] of expected) {
      const operation = module9OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actual.push(`${method} ${route}`);
    }

    const documented = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const operation = pathItem[method];
        if (operation?.operationId?.startsWith('module9')) documented.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.deepEqual(documented.sort(), actual.sort());

    for (const forbiddenPath of [
      '/api/v1/purchase-orders/direct-purchase',
      '/api/v1/purchase-orders/{id}/approve',
      '/api/v1/purchase-orders/{id}/delete',
      '/api/v1/purchase-orders/{id}/receipt',
      '/api/v1/purchase-orders/{id}/invoice',
      '/api/v1/purchase-orders/{id}/post-finance',
      '/api/v1/purchase-orders/{id}/commitments'
    ]) assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);

    const createBody = module9OpenApiOperation(document, '/api/v1/purchase-orders', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    for (const field of ['companyId', 'actorUserId', 'poNo', 'status', 'subtotal', 'tax', 'total', 'receivedQty', 'invoicedAmount']) {
      assert.equal(Object.hasOwn(createBody.properties, field), false, field);
    }
    assert.ok(createBody.required.includes('quotationId'));

    const listParameters = module9OpenApiOperation(document, '/api/v1/purchase-orders', 'GET').parameters ?? [];
    const queryNames = listParameters.filter((parameter) => parameter.in === 'query').map((parameter) => parameter.name).sort();
    assert.deepEqual(queryNames, ['page', 'pageSize', 'projectId', 'search']);
  });
});


// Verify Project/PO row locking keeps concurrent numbering, issue, revision numbering and cancellation deterministic.
test('Module 9 operational concurrency serializes numbering and retry-safe issue revision cancellation commands', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const createResponses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createPurchaseOrder(app, token, {
        terms: `Concurrent PO terms ${index + 1}`
      }))
    );
    assert.equal(createResponses.every((response) => response.statusCode === 201), true);
    const purchaseOrders = createResponses.map((response) => response.json().data);
    assert.deepEqual(
      purchaseOrders.map((purchaseOrder) => purchaseOrder.poNo).sort(),
      ['PO-0001', 'PO-0002', 'PO-0003', 'PO-0004', 'PO-0005', 'PO-0006']
    );
    assert.equal(new Set(purchaseOrders.map((purchaseOrder) => purchaseOrder.id)).size, 6);

    const purchaseOrder = purchaseOrders[0];
    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${purchaseOrder.id}/submit`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    await approvePurchaseOrder(app, client, token, purchaseOrder.id);

    const issueResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/issue`,
        headers: { authorization: `Bearer ${token}` },
        payload: {}
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/issue`,
        headers: { authorization: `Bearer ${token}` },
        payload: {}
      })
    ]);
    assert.deepEqual(issueResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.issued' }
    }), 1);
    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.issued' }
    }), 1);
    assert.equal(await client.costCommitment.count({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: purchaseOrder.id }
    }), 1);

    const revisionResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/revise`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent controlled revision A', terms: 'Concurrent revised terms A' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/revise`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent controlled revision B', deliveryAddress: 'Concurrent revised delivery B' }
      })
    ]);
    assert.deepEqual(revisionResponses.map((item) => item.statusCode), [200, 200]);
    const revisions = await client.purchaseOrderRevision.findMany({
      where: { purchaseOrderId: purchaseOrder.id },
      orderBy: { revisionNo: 'asc' }
    });
    assert.deepEqual(revisions.map((revision) => revision.revisionNo), [1, 2]);
    assert.equal(await client.purchaseOrderRevisionItem.count({
      where: { purchaseOrderRevisionId: { in: revisions.map((revision) => revision.id) } }
    }), 4);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.revised' }
    }), 2);
    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.revised' }
    }), 2);

    const cancelResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent retry-safe cancellation' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Concurrent retry-safe cancellation' }
      })
    ]);
    assert.deepEqual(cancelResponses.map((item) => item.statusCode), [200, 200]);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.cancelled' }
    }), 1);
    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.cancelled' }
    }), 1);
    const cancellationEvidence = await client.purchaseOrder.findFirstOrThrow({ where: { id: purchaseOrder.id } });
    assert.equal(cancellationEvidence.cancelReason, 'Concurrent retry-safe cancellation');
    assert.equal(cancellationEvidence.cancelledBy, ADMIN_ID);
    assert.ok(cancellationEvidence.cancelledAt);
    const commitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: purchaseOrder.id }
    });
    assert.equal(commitments.length, 1);
    assert.equal(commitments[0].status, 'CANCELLED');
    assert.equal(commitments[0].remainingAmount.toString(), '0');

    const sequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'purchase-order' }
    });
    assert.equal(sequence.nextValue, 7n);
  });
});

// Force late transaction failures and verify no partial PO/commitment/audit state survives; inspect reviewed indexes without timing claims.
test('Module 9 operational rollback boundaries and query plans preserve atomic Purchase Order state and reviewed indexes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const createdResponse = await createPurchaseOrder(app, token);
    assert.equal(createdResponse.statusCode, 201, createdResponse.body);
    const purchaseOrder = createdResponse.json().data;

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${purchaseOrder.id}/submit`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    await approvePurchaseOrder(app, client, token, purchaseOrder.id);

    try {
      await installOutboxFailure(client, 'purchase_order.issued');
      response = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/issue`,
        headers: { authorization: `Bearer ${token}` },
        payload: {}
      });
      assert.equal(response.statusCode, 500, response.body);
      const afterFailedIssue = await client.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrder.id } });
      assert.equal(afterFailedIssue.status, 'PENDING_APPROVAL');
      assert.equal(await client.costCommitment.count({
        where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: purchaseOrder.id }
      }), 0);
      assert.equal(await client.auditLog.count({
        where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.issued' }
      }), 0);
      assert.equal(await client.outboxEvent.count({
        where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.issued' }
      }), 0);
    } finally {
      await removeOutboxFailure(client);
    }

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/purchase-orders/${purchaseOrder.id}/issue`,
      headers: { authorization: `Bearer ${token}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ISSUED');

    try {
      await installOutboxFailure(client, 'purchase_order.revised');
      response = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/revise`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Forced rollback revision', terms: 'This must roll back' }
      });
      assert.equal(response.statusCode, 500, response.body);
      const afterFailedRevision = await client.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrder.id } });
      assert.equal(afterFailedRevision.terms, 'Net 30 days');
      assert.equal(await client.purchaseOrderRevision.count({ where: { purchaseOrderId: purchaseOrder.id } }), 0);
      assert.equal(await client.auditLog.count({
        where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.revised' }
      }), 0);
      assert.equal(await client.outboxEvent.count({
        where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.revised' }
      }), 0);
    } finally {
      await removeOutboxFailure(client);
    }

    try {
      await installOutboxFailure(client, 'purchase_order.cancelled');
      response = await app.inject({
        method: 'POST',
        url: `/api/v1/purchase-orders/${purchaseOrder.id}/cancel`,
        headers: { authorization: `Bearer ${token}` },
        payload: { reason: 'Forced rollback cancellation' }
      });
      assert.equal(response.statusCode, 500, response.body);
      const afterFailedCancellation = await client.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrder.id } });
      assert.equal(afterFailedCancellation.status, 'ISSUED');
      const activeCommitments = await client.costCommitment.findMany({
        where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'purchase_order', sourceId: purchaseOrder.id }
      });
      assert.equal(activeCommitments.length, 1);
      assert.equal(activeCommitments[0].status, 'ACTIVE');
      assert.equal(activeCommitments[0].remainingAmount.toString(), '210');
      assert.equal(await client.auditLog.count({
        where: { companyId: COMPANY_ID, entityId: purchaseOrder.id, action: 'purchase_order.cancelled' }
      }), 0);
      assert.equal(await client.outboxEvent.count({
        where: { companyId: COMPANY_ID, resourceId: purchaseOrder.id, eventType: 'purchase_order.cancelled' }
      }), 0);
    } finally {
      await removeOutboxFailure(client);
    }

    const item = await client.purchaseOrderItem.findFirstOrThrow({ where: { purchaseOrderId: purchaseOrder.id } });
    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const registerPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, po_no, order_date
        FROM purchase_orders
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'ISSUED'
        ORDER BY order_date
        LIMIT 50
      `));
      assert.match(registerPlan, /purchase_orders_company_project_status_order_idx/);

      const vendorPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, po_no
        FROM purchase_orders
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND vendor_id = '${VENDOR_ID}'::uuid
          AND status = 'ISSUED'
        LIMIT 50
      `));
      assert.match(vendorPlan, /purchase_orders_company_vendor_status_idx/);

      const quotationPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, po_no
        FROM purchase_orders
        WHERE quotation_id = '${QUOTATION_ID}'::uuid
        LIMIT 50
      `));
      assert.match(quotationPlan, /purchase_orders_quotation_idx/);

      const itemPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, line_total
        FROM purchase_order_items
        WHERE purchase_order_id = '${purchaseOrder.id}'::uuid
          AND wbs_node_id = '${WBS_ID}'::uuid
          AND cost_code_id = '${COST_CODE_ID}'::uuid
          AND cost_type_id = '${COST_TYPE_ID}'::uuid
        LIMIT 50
      `));
      assert.match(itemPlan, /purchase_order_items_po_cost_structure_idx/);

      const revisionPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, revision_no, approved_at
        FROM purchase_order_revisions
        WHERE purchase_order_id = '${purchaseOrder.id}'::uuid
          AND approved_at IS NOT NULL
        ORDER BY approved_at
        LIMIT 50
      `));
      assert.match(revisionPlan, /purchase_order_revisions_po_approved_idx/);

      const commitmentPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, remaining_amount
        FROM cost_commitments
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND source_type = 'purchase_order'
          AND source_id = '${purchaseOrder.id}'::uuid
          AND source_line_id = '${item.id}'::uuid
        LIMIT 50
      `));
      assert.match(commitmentPlan, /cost_commitments_source_key_uq/);
    });
  });
});
