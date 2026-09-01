import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000011001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000011002';
const ADMIN_ID = '00000000-0000-4000-8000-000000011010';
const READER_ID = '00000000-0000-4000-8000-000000011011';
const PROJECT_CREATOR_ID = '00000000-0000-4000-8000-000000011012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000011013';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000011020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000011021';
const PROJECT_CREATOR_ROLE_ID = '00000000-0000-4000-8000-000000011022';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000011023';
const CLIENT_ID = '00000000-0000-4000-8000-000000011030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000011031';
const PROJECT_ID = '00000000-0000-4000-8000-000000011040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000011041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000011042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000011043';
const WBS_ID = '00000000-0000-4000-8000-000000011050';
const COST_CODE_ID = '00000000-0000-4000-8000-000000011060';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000011070';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000011080';
const VENDOR_ID = '00000000-0000-4000-8000-000000011090';
const VENDOR_B_ID = '00000000-0000-4000-8000-000000011091';
const APPROVAL_DEFINITION_ID = '00000000-0000-4000-8000-000000011100';
const APPROVAL_STEP_ID = '00000000-0000-4000-8000-000000011101';
const PASSWORD = 'Module11-pass-262-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module11-auth-secret-0123456789abcdef';
const APPROVAL_DEFINITION_CODE = 'SUBCONTRACT_EXECUTION';

const MODULE_11_PERMISSIONS = [
  'subcontractors.read',
  'subcontractors.manage',
  'subcontracts.read',
  'subcontracts.create',
  'subcontracts.execute',
  'subcontracts.certify',
  'subcontracts.close'
];
const APPROVAL_PERMISSIONS = ['approvals.inbox.read', 'approvals.act'];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest Stage-16 dependency graph needed for real Subcontractor Management verification. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 11 Company Ltd',
        displayName: 'Module 11 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 11 Foreign Company Ltd',
        displayName: 'Module 11 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const allPermissions = [...MODULE_11_PERMISSIONS, ...APPROVAL_PERMISSIONS];
  const permissions = [];
  for (const code of allPermissions) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: {
        name: code,
        domain: code.startsWith('subcontract') ? 'subcontracts' : 'approvals'
      },
      create: {
        code,
        name: code,
        domain: code.startsWith('subcontract') ? 'subcontracts' : 'approvals'
      }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-11-admin', name: 'Module 11 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-11-reader', name: 'Module 11 Reader', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_CREATOR_ROLE_ID, companyId: COMPANY_ID, code: 'module-11-project-creator', name: 'Module 11 Project Creator', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-11-admin', name: 'Module 11 Foreign Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...allPermissions.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('subcontractors.read') },
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('subcontracts.read') },
      { roleId: PROJECT_CREATOR_ROLE_ID, permissionId: permissionByCode.get('subcontracts.create') },
      ...MODULE_11_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module11-admin@example.test', name: 'Module 11 Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module11-reader@example.test', name: 'Module 11 Reader' },
    { id: PROJECT_CREATOR_ID, companyId: COMPANY_ID, email: 'module11-project@example.test', name: 'Module 11 Project Creator' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module11-admin-b@example.test', name: 'Module 11 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_CREATOR_ID, roleId: PROJECT_CREATOR_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M11-CLIENT', legalName: 'Module 11 Client Ltd', displayName: 'Module 11 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M11-FOREIGN', legalName: 'Module 11 Foreign Client Ltd', displayName: 'Module 11 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M11-A', name: 'Module 11 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M11-OTHER', name: 'Module 11 Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: CLOSED_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M11-CLOSED', name: 'Module 11 Closed Project', clientId: CLIENT_ID, status: 'CLOSED', currency: 'USD', startDate: new Date('2025-01-01T00:00:00.000Z'), plannedEndDate: new Date('2025-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Rawalpindi, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M11-B', name: 'Module 11 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      userId: PROJECT_CREATOR_ID,
      projectRole: 'COMMERCIAL',
      status: 'ACTIVE',
      fromDate
    }
  });

  await client.wbsNode.create({
    data: { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Module 11 WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
  });
  await client.costCode.create({
    data: { id: COST_CODE_ID, companyId: COMPANY_ID, code: 'SUB-100', name: 'Subcontract Work', category: 'DIRECT', status: 'ACTIVE' }
  });
  await client.costType.create({
    data: { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'SUB', name: 'Subcontract', status: 'ACTIVE' }
  });
  await client.projectCostCode.create({
    data: { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' }
  });

  await client.vendor.createMany({
    data: [
      { id: VENDOR_ID, companyId: COMPANY_ID, code: 'M11-V001', legalName: 'Module 11 Vendor Ltd', displayName: 'Module 11 Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_B_ID, companyId: COMPANY_B_ID, code: 'M11-VB', legalName: 'Module 11 Foreign Vendor Ltd', displayName: 'Module 11 Foreign Vendor', paymentTermsDays: 30, currency: 'USD', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
    ]
  });

  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'subcontract', prefix: 'SC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'subcontract-payment-application', prefix: 'SCA-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });

  await client.approvalDefinition.create({
    data: {
      id: APPROVAL_DEFINITION_ID,
      companyId: COMPANY_ID,
      code: APPROVAL_DEFINITION_CODE,
      name: 'Subcontract Execution Approval',
      resourceType: 'subcontract',
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
      subcontractApprovalDefinitionCode: APPROVAL_DEFINITION_CODE,
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
async function signIn(app, email = 'module11-admin@example.test') {
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

/** Build one reviewed subcontractor request linked to the existing Module-8 Vendor master. */
function subcontractorPayload(overrides = {}) {
  return {
    vendorId: overrides.vendorId ?? VENDOR_ID,
    code: overrides.code ?? 'SCON-001',
    legalName: overrides.legalName ?? 'Module 11 Subcontractor Ltd',
    taxNo: overrides.taxNo ?? 'NTN-M11-001',
    contactJson: overrides.contactJson ?? { name: 'Commercial Contact', email: 'commercial@example.test' },
    complianceStatus: overrides.complianceStatus ?? 'APPROVED',
    ...(overrides.extraBody ?? {})
  };
}

/** Build one reviewed draft-subcontract request with one valid Project cost-coded scope line. */
function subcontractPayload(subcontractorId, overrides = {}) {
  return {
    projectId: overrides.projectId ?? PROJECT_ID,
    subcontractorId,
    startDate: overrides.startDate ?? '2026-08-25',
    endDate: overrides.endDate ?? '2026-12-31',
    retentionPercent: overrides.retentionPercent ?? '5.0000',
    currency: overrides.currency ?? 'USD',
    items: overrides.items ?? [{
      boqItemId: null,
      description: 'Concrete structural subcontract scope',
      quantity: '10.0000',
      unit: 'lot',
      rate: '100.0000',
      amount: '1000.00',
      wbsNodeId: WBS_ID,
      costCodeId: COST_CODE_ID,
      costTypeId: COST_TYPE_ID
    }],
    ...(overrides.extraBody ?? {})
  };
}

/** Send one reviewed Module-11 write with the mandatory Foundation idempotency key. */
async function module11Write(app, token, method, url, payload, key) {
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

/** Create one linked subcontractor through the public API and return its safe response. */
async function createSubcontractor(app, token, key = 'module11-subcontractor-create') {
  const response = await module11Write(
    app,
    token,
    'POST',
    '/api/v1/subcontractors',
    subcontractorPayload(),
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one draft subcontract through the public API and return its safe response. */
async function createSubcontract(app, token, subcontractorId, overrides = {}, key = 'module11-subcontract-create') {
  const response = await module11Write(
    app,
    token,
    'POST',
    '/api/v1/subcontracts',
    subcontractPayload(subcontractorId, overrides),
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create the Module-22 execution request, approve it through the public Approval route, and return the request. */
async function approveSubcontractExecution(app, client, token, subcontractId, keyPrefix = 'module11-approval') {
  const pending = await module11Write(
    app,
    token,
    'POST',
    `/api/v1/subcontracts/${subcontractId}/execute`,
    {},
    `${keyPrefix}-request`
  );
  assert.equal(pending.statusCode, 409, pending.body);
  assert.equal(errorCode(pending), 'SUBCONTRACT_NOT_APPROVED');

  const request = await client.approvalRequest.findFirst({
    where: {
      companyId: COMPANY_ID,
      resourceType: 'subcontract',
      resourceId: subcontractId
    }
  });
  assert.ok(request, 'Subcontract approval request was not created.');

  const approval = await app.inject({
    method: 'POST',
    url: `/api/v1/approvals/requests/${request.id}/actions`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': `${keyPrefix}-action`
    },
    payload: { action: 'APPROVE', comment: 'Approved for controlled subcontract execution' }
  });
  assert.equal(approval.statusCode, 200, approval.body);
  assert.equal(approval.json().data.status, 'APPROVED');
  return request;
}

/** Create, approve and execute one subcontract for application/certification-focused checks. */
async function createExecutedSubcontract(app, client, token, options = {}) {
  const subcontractor = await createSubcontractor(app, token, `${options.keyPrefix ?? 'module11'}-subcontractor`);
  const subcontract = await createSubcontract(
    app,
    token,
    subcontractor.id,
    options.subcontractOverrides ?? {},
    `${options.keyPrefix ?? 'module11'}-subcontract`
  );
  await approveSubcontractExecution(app, client, token, subcontract.id, `${options.keyPrefix ?? 'module11'}-approval`);
  const executed = await module11Write(
    app,
    token,
    'POST',
    `/api/v1/subcontracts/${subcontract.id}/execute`,
    {},
    `${options.keyPrefix ?? 'module11'}-execute`
  );
  assert.equal(executed.statusCode, 200, executed.body);
  assert.equal(executed.json().data.status, 'EXECUTED');
  return executed.json().data;
}

/** Install one disposable PostgreSQL trigger that forces a selected Module-11 outbox event to fail. */
async function installOutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_11_ops_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 11 forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_11_ops_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_11_ops_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_11_ops_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-11 outbox failure trigger/function. */
async function removeOutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_11_ops_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_11_ops_fail_outbox_event()');
}

/** Return one generated Module-11 OpenAPI operation and fail clearly when it is missing. */
function module11OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

test('Module 11 PostgreSQL/Fastify workflow covers vendor linkage, approval, execution commitment, application and certification', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const subcontractor = await createSubcontractor(app, token);
    assert.equal(subcontractor.vendorId, VENDOR_ID);
    assert.equal(subcontractor.status, 'ACTIVE');
    assert.equal(await client.subcontractor.count({ where: { companyId: COMPANY_ID } }), 1);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/subcontractors?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);

    const subcontract = await createSubcontract(app, token, subcontractor.id);
    assert.equal(subcontract.subcontractNo, 'SC-0001');
    assert.equal(subcontract.status, 'DRAFT');
    assert.equal(subcontract.originalValue, '1000.00');
    assert.equal(subcontract.revisedValue, '1000.00');

    response = await module11Write(
      app,
      token,
      'PATCH',
      `/api/v1/subcontracts/${subcontract.id}`,
      { endDate: '2027-01-31' },
      'module11-draft-update'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.endDate, '2027-01-31');

    const approvalRequest = await approveSubcontractExecution(app, client, token, subcontract.id);
    assert.equal(await client.approvalAction.count({ where: { approvalRequestId: approvalRequest.id } }), 1);

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/execute`,
      {},
      'module11-execute-approved'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'EXECUTED');

    const commitments = await client.costCommitment.findMany({
      where: {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        sourceType: 'subcontract',
        sourceId: subcontract.id
      }
    });
    assert.equal(commitments.length, 1);
    assert.equal(commitments[0].originalAmount.toString(), '1000');
    assert.equal(commitments[0].remainingAmount.toString(), '1000');
    assert.equal(commitments[0].status, 'ACTIVE');

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/execute`,
      {},
      'module11-execute-approved'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.costCommitment.count({ where: { companyId: COMPANY_ID, sourceType: 'subcontract', sourceId: subcontract.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: subcontract.id, eventType: 'subcontract.executed' } }), 1);

    const itemId = response.json().data.items[0].id;
    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications`,
      {
        periodFrom: '2026-08-01',
        periodTo: '2026-08-31',
        lines: [{ subcontractItemId: itemId, currentQty: '5.0000', currentValue: '500.00' }]
      },
      'module11-application-1'
    );
    assert.equal(response.statusCode, 201, response.body);
    const application = response.json().data;
    assert.equal(application.applicationNo, 'SCA-0001');
    assert.equal(application.claimedAmount, '500.00');
    assert.equal(application.certifiedAmount, '0.00');
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: application.id, eventType: 'subcontract.payment_application_submitted' } }), 1);

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${application.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '400.00' }] },
      'module11-certify-1'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CERTIFIED');
    assert.equal(response.json().data.certifiedAmount, '400.00');
    assert.equal(response.json().data.retentionAmount, '20.00');

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${application.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '400.00' }] },
      'module11-certify-1'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, resourceId: application.id, eventType: 'subcontract.payment_certified' } }), 1);

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/close`,
      {},
      'module11-close-too-early'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'SUBCONTRACT_NOT_READY_TO_CLOSE');

    assert.equal(await client.costActual.count({ where: { companyId: COMPANY_ID, sourceType: { startsWith: 'subcontract' } } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'subcontract.revised' } }), 0);
  });
});

test('Module 11 security rejects unauthenticated access, missing authority, restricted Project scope, cross-Company resources and browser-owned fields', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/subcontractors' });
    assert.equal(response.statusCode, 401, response.body);

    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module11-reader@example.test');
    const projectToken = await signIn(app, 'module11-project@example.test');
    const foreignToken = await signIn(app, 'module11-admin-b@example.test');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/subcontractors',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await module11Write(
      app,
      readerToken,
      'POST',
      '/api/v1/subcontractors',
      subcontractorPayload({ code: 'DENIED' }),
      'module11-reader-create'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    const subcontractor = await createSubcontractor(app, adminToken, 'module11-security-subcontractor');

    response = await module11Write(
      app,
      projectToken,
      'POST',
      '/api/v1/subcontracts',
      subcontractPayload(subcontractor.id),
      'module11-project-create-allowed'
    );
    assert.equal(response.statusCode, 201, response.body);
    const projectScopedSubcontractId = response.json().data.id;

    response = await module11Write(
      app,
      projectToken,
      'POST',
      '/api/v1/subcontracts',
      subcontractPayload(subcontractor.id, { projectId: OTHER_PROJECT_ID }),
      'module11-project-create-denied'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await module11Write(
      app,
      adminToken,
      'POST',
      '/api/v1/subcontracts',
      subcontractPayload(subcontractor.id, {
        extraBody: {
          companyId: COMPANY_B_ID,
          actorUserId: ADMIN_B_ID,
          subcontractNo: 'ATTACK-SC',
          status: 'EXECUTED',
          originalValue: '1.00',
          revisedValue: '1.00'
        }
      }),
      'module11-browser-owned-fields'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/subcontractors',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: subcontractorPayload({ code: 'NO-IDEMPOTENCY' })
    });
    assert.equal(response.statusCode, 400, response.body);

    response = await module11Write(
      app,
      foreignToken,
      'POST',
      '/api/v1/subcontractors',
      subcontractorPayload({ vendorId: VENDOR_ID, code: 'FOREIGN-LINK' }),
      'module11-foreign-vendor-link'
    );
    assert.equal(response.statusCode, 404, response.body);

    response = await module11Write(
      app,
      foreignToken,
      'PATCH',
      `/api/v1/subcontracts/${projectScopedSubcontractId}`,
      { endDate: '2027-02-01' },
      'module11-foreign-subcontract-read'
    );
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'SUBCONTRACT_NOT_FOUND');
  });
});

test('Module 11 certification keeps cumulative contract limits, immutable snapshots and server-owned retention authoritative', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const subcontract = await createExecutedSubcontract(app, client, token, {
      keyPrefix: 'module11-cumulative',
      subcontractOverrides: { retentionPercent: '10.0000' }
    });
    const itemId = subcontract.items[0].id;

    const first = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications`,
      {
        periodFrom: '2026-08-01',
        periodTo: '2026-08-15',
        lines: [{ subcontractItemId: itemId, currentQty: '6.0000', currentValue: '600.00' }]
      },
      'module11-cumulative-app-1'
    );
    assert.equal(first.statusCode, 201, first.body);

    const second = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications`,
      {
        periodFrom: '2026-08-16',
        periodTo: '2026-08-31',
        lines: [{ subcontractItemId: itemId, currentQty: '6.0000', currentValue: '600.00' }]
      },
      'module11-cumulative-app-2'
    );
    assert.equal(second.statusCode, 201, second.body);

    let response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${first.json().data.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '600.00' }] },
      'module11-cumulative-cert-1'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.retentionAmount, '60.00');

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${second.json().data.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '600.00' }] },
      'module11-cumulative-cert-2'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CERTIFIED_VALUE_EXCEEDS_CONTRACT');

    const unchanged = await client.subcontractPaymentApplication.findUnique({
      where: { id: second.json().data.id }
    });
    assert.equal(unchanged.status, 'SUBMITTED');
    assert.equal(unchanged.certifiedAmount.toString(), '0');
    assert.equal(unchanged.retentionAmount.toString(), '0');

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${first.json().data.id}/certify`,
      {
        lines: [{ subcontractItemId: itemId, certifiedValue: '600.00' }],
        retentionAmount: '0.00'
      },
      'module11-retention-attack'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications/${first.json().data.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '600.00' }] },
      'module11-recertification-direct-edit'
    );
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'PAYMENT_APPLICATION_INVALID');
  });
});

test('Module 11 database constraints reject cross-Company Vendor and Project ownership writes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await assert.rejects(
      () => client.subcontractor.create({
        data: {
          companyId: COMPANY_ID,
          vendorId: VENDOR_B_ID,
          code: 'BAD-VENDOR-LINK',
          legalName: 'Invalid Cross Company Subcontractor',
          taxNo: null,
          status: 'ACTIVE',
          contactJson: {},
          complianceStatus: 'APPROVED'
        }
      }),
      /foreign key|subcontractors_vendor_company_fkey|23503/i
    );

    const validSubcontractor = await client.subcontractor.create({
      data: {
        companyId: COMPANY_ID,
        vendorId: VENDOR_ID,
        code: 'DB-VALID',
        legalName: 'Database Valid Subcontractor',
        taxNo: null,
        status: 'ACTIVE',
        contactJson: {},
        complianceStatus: 'APPROVED'
      }
    });

    await assert.rejects(
      () => client.subcontract.create({
        data: {
          companyId: COMPANY_ID,
          projectId: PROJECT_B_ID,
          subcontractNo: 'SC-INVALID-PROJECT',
          subcontractorId: validSubcontractor.id,
          status: 'DRAFT',
          startDate: new Date('2026-08-25T00:00:00.000Z'),
          endDate: null,
          originalValue: '100.00',
          revisedValue: '100.00',
          retentionPercent: '0.0000',
          currency: 'USD'
        }
      }),
      /foreign key|subcontracts_project_company_fkey|23503/i
    );
  });
});

test('Module 11 late outbox failures roll back execution commitments and certification snapshots without partial state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const subcontractor = await createSubcontractor(app, token, 'module11-rollback-subcontractor');
    const subcontract = await createSubcontract(app, token, subcontractor.id, { retentionPercent: '0.0000' }, 'module11-rollback-subcontract');
    await approveSubcontractExecution(app, client, token, subcontract.id, 'module11-rollback-approval');

    try {
      await installOutboxFailure(client, 'subcontract.executed');
      const failedExecution = await module11Write(
        app,
        token,
        'POST',
        `/api/v1/subcontracts/${subcontract.id}/execute`,
        {},
        'module11-rollback-execute-fail'
      );
      assert.equal(failedExecution.statusCode, 500, failedExecution.body);
      const persisted = await client.subcontract.findUnique({ where: { id: subcontract.id } });
      assert.equal(persisted.status, 'DRAFT');
      assert.equal(await client.costCommitment.count({ where: { companyId: COMPANY_ID, sourceType: 'subcontract', sourceId: subcontract.id } }), 0);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, entityType: 'subcontract', entityId: subcontract.id, action: 'subcontract.executed' } }), 0);
    } finally {
      await removeOutboxFailure(client);
    }

    const executed = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/execute`,
      {},
      'module11-rollback-execute-success'
    );
    assert.equal(executed.statusCode, 200, executed.body);
    const itemId = executed.json().data.items[0].id;

    const applicationResponse = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${subcontract.id}/payment-applications`,
      {
        periodFrom: '2026-08-01',
        periodTo: '2026-08-31',
        lines: [{ subcontractItemId: itemId, currentQty: '10.0000', currentValue: '1000.00' }]
      },
      'module11-rollback-application'
    );
    assert.equal(applicationResponse.statusCode, 201, applicationResponse.body);
    const applicationId = applicationResponse.json().data.id;

    try {
      await installOutboxFailure(client, 'subcontract.payment_certified');
      const failedCertification = await module11Write(
        app,
        token,
        'POST',
        `/api/v1/subcontracts/${subcontract.id}/payment-applications/${applicationId}/certify`,
        { lines: [{ subcontractItemId: itemId, certifiedValue: '1000.00' }] },
        'module11-rollback-certify-fail'
      );
      assert.equal(failedCertification.statusCode, 500, failedCertification.body);
      const persistedApplication = await client.subcontractPaymentApplication.findUnique({ where: { id: applicationId } });
      assert.equal(persistedApplication.status, 'SUBMITTED');
      assert.equal(persistedApplication.certifiedAmount.toString(), '0');
      assert.equal(persistedApplication.retentionAmount.toString(), '0');
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, entityType: 'subcontract_payment_application', entityId: applicationId, action: 'subcontract.payment_certified' } }), 0);
    } finally {
      await removeOutboxFailure(client);
    }
  });
});

test('Module 11 live OpenAPI exposes exactly eight reviewed operations with strict security and idempotency boundaries', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/subcontractors', 'module11ListSubcontractors'],
      ['POST', '/api/v1/subcontractors', 'module11CreateSubcontractor'],
      ['POST', '/api/v1/subcontracts', 'module11CreateSubcontract'],
      ['PATCH', '/api/v1/subcontracts/{id}', 'module11UpdateDraftSubcontract'],
      ['POST', '/api/v1/subcontracts/{id}/execute', 'module11ExecuteSubcontract'],
      ['POST', '/api/v1/subcontracts/{id}/payment-applications', 'module11CreatePaymentApplication'],
      ['POST', '/api/v1/subcontracts/{id}/payment-applications/{appId}/certify', 'module11CertifyPaymentApplication'],
      ['POST', '/api/v1/subcontracts/{id}/close', 'module11CloseSubcontract']
    ];

    const documented = [];
    for (const [method, route, operationId] of expected) {
      const operation = module11OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const actualModule11 = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module11')) {
          actualModule11.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(actualModule11.sort(), documented.sort());

    for (const [method, route] of expected.filter(([method]) => method !== 'GET')) {
      const parameters = module11OpenApiOperation(document, route, method).parameters ?? [];
      const idempotency = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');
      assert.ok(idempotency, `${method} ${route} must require Idempotency-Key`);
      assert.equal(idempotency.required, true);
    }

    const subcontractCreateBody = module11OpenApiOperation(document, '/api/v1/subcontracts', 'POST')
      .requestBody.content['application/json'].schema;
    assert.equal(subcontractCreateBody.additionalProperties, false);
    for (const field of ['companyId', 'actorUserId', 'subcontractNo', 'status', 'originalValue', 'revisedValue', 'approvalDefinitionCode']) {
      assert.equal(Object.hasOwn(subcontractCreateBody.properties, field), false, field);
    }

    const certificationBody = module11OpenApiOperation(
      document,
      '/api/v1/subcontracts/{id}/payment-applications/{appId}/certify',
      'POST'
    ).requestBody.content['application/json'].schema;
    for (const field of ['certifiedAmount', 'retentionAmount', 'deduction', 'override', 'allowExceed']) {
      assert.equal(Object.hasOwn(certificationBody.properties, field), false, field);
    }

    for (const forbiddenPath of [
      '/api/v1/subcontracts',
      '/api/v1/subcontracts/{id}',
      '/api/v1/subcontracts/{id}/submit',
      '/api/v1/subcontracts/{id}/approve',
      '/api/v1/subcontracts/{id}/revisions',
      '/api/v1/subcontracts/{id}/retention/release',
      '/api/v1/subcontracts/{id}/finance-posting'
    ]) {
      if (forbiddenPath === '/api/v1/subcontracts') {
        assert.equal(document.paths?.[forbiddenPath]?.get, undefined, 'GET /api/v1/subcontracts must remain absent');
      } else if (forbiddenPath === '/api/v1/subcontracts/{id}') {
        assert.equal(document.paths?.[forbiddenPath]?.get, undefined, 'GET /api/v1/subcontracts/{id} must remain absent');
      } else {
        assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
      }
    }
  });
});

// Verify concurrent creation and duplicate execution serialize on reviewed locks and preserve one commitment set.
test('Module 11 operational concurrent numbering and duplicate execution serialize commitments', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const subcontractor = await createSubcontractor(app, token, 'module11-ops-subcontractor');

    const createResponses = await Promise.all([
      module11Write(app, token, 'POST', '/api/v1/subcontracts', subcontractPayload(subcontractor.id), 'module11-ops-create-a'),
      module11Write(app, token, 'POST', '/api/v1/subcontracts', subcontractPayload(subcontractor.id), 'module11-ops-create-b')
    ]);
    assert.deepEqual(createResponses.map((response) => response.statusCode), [201, 201]);
    const createdSubcontracts = createResponses.map((response) => response.json().data);
    assert.deepEqual(createdSubcontracts.map((row) => row.subcontractNo).sort(), ['SC-0001', 'SC-0002']);

    const subcontractSequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'subcontract' }
    });
    assert.equal(subcontractSequence.nextValue, 3n);

    const target = createdSubcontracts[0];
    await approveSubcontractExecution(app, client, token, target.id, 'module11-ops-execution-approval');
    const executionResponses = await Promise.all([
      module11Write(app, token, 'POST', `/api/v1/subcontracts/${target.id}/execute`, {}, 'module11-ops-execute-a'),
      module11Write(app, token, 'POST', `/api/v1/subcontracts/${target.id}/execute`, {}, 'module11-ops-execute-b')
    ]);
    assert.deepEqual(executionResponses.map((response) => response.statusCode), [200, 200]);
    assert.deepEqual(executionResponses.map((response) => response.json().data.status), ['EXECUTED', 'EXECUTED']);

    const commitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'subcontract', sourceId: target.id }
    });
    assert.equal(commitments.length, 1);
    assert.equal(commitments[0].originalAmount.toString(), '1000');
    assert.equal(commitments[0].remainingAmount.toString(), '1000');
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'subcontract.executed', resourceId: target.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'subcontract.executed', entityId: target.id } }), 1);
    assert.equal(await client.approvalRequest.count({ where: { companyId: COMPANY_ID, resourceType: 'subcontract', resourceId: target.id } }), 1);
  });
});

// Verify application numbering rolls back with the transaction and concurrent certifications cannot overshoot the contract.
test('Module 11 operational application rollback and concurrent certification preserve cumulative contract limits', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const executed = await createExecutedSubcontract(app, client, token, {
      keyPrefix: 'module11-ops-cert',
      subcontractOverrides: { retentionPercent: '10.0000' }
    });
    const itemId = executed.items[0].id;

    try {
      await installOutboxFailure(client, 'subcontract.payment_application_submitted');
      const failedApplication = await module11Write(
        app,
        token,
        'POST',
        `/api/v1/subcontracts/${executed.id}/payment-applications`,
        {
          periodFrom: '2026-08-01',
          periodTo: '2026-08-15',
          lines: [{ subcontractItemId: itemId, currentQty: '1.0000', currentValue: '100.00' }]
        },
        'module11-ops-application-rollback'
      );
      assert.equal(failedApplication.statusCode, 500, failedApplication.body);
      assert.equal(await client.subcontractPaymentApplication.count({ where: { subcontractId: executed.id } }), 0);
      const rolledBackSequence = await client.numberSequence.findFirstOrThrow({
        where: { companyId: COMPANY_ID, sequenceKey: 'subcontract-payment-application' }
      });
      assert.equal(rolledBackSequence.nextValue, 1n);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'subcontract.payment_application_submitted' } }), 0);
    } finally {
      await removeOutboxFailure(client);
    }

    const applicationResponses = await Promise.all([
      module11Write(
        app,
        token,
        'POST',
        `/api/v1/subcontracts/${executed.id}/payment-applications`,
        {
          periodFrom: '2026-08-01',
          periodTo: '2026-08-15',
          lines: [{ subcontractItemId: itemId, currentQty: '6.0000', currentValue: '600.00' }]
        },
        'module11-ops-application-a'
      ),
      module11Write(
        app,
        token,
        'POST',
        `/api/v1/subcontracts/${executed.id}/payment-applications`,
        {
          periodFrom: '2026-08-16',
          periodTo: '2026-08-31',
          lines: [{ subcontractItemId: itemId, currentQty: '6.0000', currentValue: '600.00' }]
        },
        'module11-ops-application-b'
      )
    ]);
    assert.deepEqual(applicationResponses.map((response) => response.statusCode), [201, 201]);
    const applications = applicationResponses.map((response) => response.json().data);
    assert.deepEqual(applications.map((row) => row.applicationNo).sort(), ['SCA-0001', 'SCA-0002']);

    const applicationSequence = await client.numberSequence.findFirstOrThrow({
      where: { companyId: COMPANY_ID, sequenceKey: 'subcontract-payment-application' }
    });
    assert.equal(applicationSequence.nextValue, 3n);

    const certificationResponses = await Promise.all(applications.map((application, index) => module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${executed.id}/payment-applications/${application.id}/certify`,
      { lines: [{ subcontractItemId: itemId, certifiedValue: '600.00' }] },
      `module11-ops-certification-${index + 1}`
    )));
    assert.deepEqual(certificationResponses.map((response) => response.statusCode).sort((a, b) => a - b), [200, 409]);
    const rejectedCertification = certificationResponses.find((response) => response.statusCode === 409);
    assert.equal(errorCode(rejectedCertification), 'CERTIFIED_VALUE_EXCEEDS_CONTRACT');

    const persistedApplications = await client.subcontractPaymentApplication.findMany({
      where: { subcontractId: executed.id },
      orderBy: { applicationNo: 'asc' }
    });
    assert.deepEqual(persistedApplications.map((row) => row.status).sort(), ['CERTIFIED', 'SUBMITTED']);
    const certified = persistedApplications.find((row) => row.status === 'CERTIFIED');
    assert.equal(certified.certifiedAmount.toString(), '600');
    assert.equal(certified.retentionAmount.toString(), '60');
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'subcontract.payment_certified' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'subcontract.payment_certified' } }), 1);
    assert.equal(await client.costActual.count({ where: { companyId: COMPANY_ID, projectId: PROJECT_ID } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID } }), 0);
  });
});

// Verify the Stage-16 read shapes use reviewed indexes and the execution commitment reconciles to the subcontract source line.
test('Module 11 operational reviewed query plans use Stage-16 indexes and commitments reconcile', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const executed = await createExecutedSubcontract(app, client, token, { keyPrefix: 'module11-ops-indexes' });
    const itemId = executed.items[0].id;
    const application = await module11Write(
      app,
      token,
      'POST',
      `/api/v1/subcontracts/${executed.id}/payment-applications`,
      {
        periodFrom: '2026-08-01',
        periodTo: '2026-08-31',
        lines: [{ subcontractItemId: itemId, currentQty: '1.0000', currentValue: '100.00' }]
      },
      'module11-ops-index-application'
    );
    assert.equal(application.statusCode, 201, application.body);
    const applicationId = application.json().data.id;

    const commitments = await client.costCommitment.findMany({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'subcontract', sourceId: executed.id }
    });
    assert.equal(commitments.length, executed.items.length);
    const commitmentTotal = commitments.reduce((total, row) => total + Number(row.originalAmount.toString()), 0);
    assert.equal(commitmentTotal, Number(executed.revisedValue));

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const subcontractorPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM subcontractors
        WHERE company_id = '${COMPANY_ID}'::uuid AND vendor_id = '${VENDOR_ID}'::uuid
      `));
      assert.match(subcontractorPlan, /subcontractors_company_vendor_idx/);

      const subcontractPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM subcontracts
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND status = 'EXECUTED'
      `));
      assert.match(subcontractPlan, /subcontracts_company_project_status_idx/);

      const subcontractNoPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM subcontracts
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND project_id = '${PROJECT_ID}'::uuid
          AND subcontract_no = '${executed.subcontractNo}'
      `));
      assert.match(subcontractNoPlan, /subcontracts_company_project_no_uq/);

      const applicationPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM subcontract_payment_applications
        WHERE subcontract_id = '${executed.id}'::uuid AND status = 'SUBMITTED'
        ORDER BY period_to DESC
      `));
      assert.match(applicationPlan, /subcontract_payment_applications_subcontract_status_period_idx/);

      const paymentLinePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM subcontract_payment_lines
        WHERE application_id = '${applicationId}'::uuid AND subcontract_item_id = '${itemId}'::uuid
      `));
      assert.match(paymentLinePlan, /subcontract_payment_lines_application_item_idx/);

      const commitmentPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id FROM cost_commitments
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND source_type = 'subcontract'
          AND source_id = '${executed.id}'
          AND source_line_id = '${itemId}'
      `));
      assert.match(commitmentPlan, /cost_commitments_source_key_uq/);
    });
  });
});
