import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000002200';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000002300';

const ADMIN_A_ID = '00000000-0000-4000-8000-000000002210';
const REQUESTER_A_ID = '00000000-0000-4000-8000-000000002211';
const APPROVER_1_A_ID = '00000000-0000-4000-8000-000000002212';
const APPROVER_2_A_ID = '00000000-0000-4000-8000-000000002213';
const DELEGATE_A_ID = '00000000-0000-4000-8000-000000002214';
const EXPIRED_DELEGATE_A_ID = '00000000-0000-4000-8000-000000002215';
const LIMITED_A_ID = '00000000-0000-4000-8000-000000002216';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000002310';
const DELEGATE_B_ID = '00000000-0000-4000-8000-000000002311';

const ADMIN_ROLE_A_ID = '00000000-0000-4000-8000-000000002220';
const ACTOR_PERMISSION_ROLE_A_ID = '00000000-0000-4000-8000-000000002221';
const REQUESTER_ROLE_A_ID = '00000000-0000-4000-8000-000000002222';
const LIMITED_ROLE_A_ID = '00000000-0000-4000-8000-000000002223';
const BUSINESS_APPROVER_ROLE_A_ID = '00000000-0000-4000-8000-000000002224';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000002320';

const PASSWORD = 'Pass76-test-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const APPROVAL_PERMISSIONS = [
  'approvals.inbox.read',
  'approvals.act',
  'approval_definitions.read',
  'approval_definitions.manage',
  'approval_delegations.manage'
];

let internalRequestCounter = 0;

/** Load built runtime code only when the live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const { ApprovalsRepository, ApprovalsService } = await import('../../apps/api/dist/modules/approvals/index.js');
  const { runBatch: runApprovalTimingBatch } = await import('../../apps/api/dist/workers/approval-timing.worker.js');
  return { testing, buildApp, hashPassword, ApprovalsRepository, ApprovalsService, runApprovalTimingBatch };
}

/** Seed two companies and the small identity set needed by the approval tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2025-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_A_ID,
        legalName: 'Pass 76 Company A Ltd',
        displayName: 'Pass 76 Company A',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Pass 76 Company B Ltd',
        displayName: 'Pass 76 Company B',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of APPROVAL_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'approvals' },
      create: { code, name: code, domain: 'approvals' }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'approval-admin', name: 'Approval Admin', isSystem: false, status: 'ACTIVE' },
      { id: ACTOR_PERMISSION_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'approval-actor', name: 'Approval Actor', isSystem: false, status: 'ACTIVE' },
      { id: REQUESTER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'approval-requester', name: 'Approval Requester', isSystem: false, status: 'ACTIVE' },
      { id: LIMITED_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'approval-limited', name: 'Approval Limited', isSystem: false, status: 'ACTIVE' },
      { id: BUSINESS_APPROVER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'commercial-approver', name: 'Commercial Approver', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'approval-admin', name: 'Approval Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_A_ID, permissionId: permission.id })),
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permission.id })),
      { roleId: ACTOR_PERMISSION_ROLE_A_ID, permissionId: permissionByCode.get('approvals.inbox.read') },
      { roleId: ACTOR_PERMISSION_ROLE_A_ID, permissionId: permissionByCode.get('approvals.act') },
      { roleId: REQUESTER_ROLE_A_ID, permissionId: permissionByCode.get('approvals.inbox.read') },
      { roleId: LIMITED_ROLE_A_ID, permissionId: permissionByCode.get('approvals.inbox.read') }
    ]
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'approval-admin-a@example.test', name: 'Approval Admin A', status: 'ACTIVE' },
      { id: REQUESTER_A_ID, companyId: COMPANY_A_ID, email: 'approval-requester-a@example.test', name: 'Approval Requester A', status: 'ACTIVE' },
      { id: APPROVER_1_A_ID, companyId: COMPANY_A_ID, email: 'approval-one-a@example.test', name: 'Approval One A', status: 'ACTIVE' },
      { id: APPROVER_2_A_ID, companyId: COMPANY_A_ID, email: 'approval-two-a@example.test', name: 'Approval Two A', status: 'ACTIVE' },
      { id: DELEGATE_A_ID, companyId: COMPANY_A_ID, email: 'approval-delegate-a@example.test', name: 'Approval Delegate A', status: 'ACTIVE' },
      { id: EXPIRED_DELEGATE_A_ID, companyId: COMPANY_A_ID, email: 'approval-expired-delegate-a@example.test', name: 'Approval Expired Delegate A', status: 'ACTIVE' },
      { id: LIMITED_A_ID, companyId: COMPANY_A_ID, email: 'approval-limited-a@example.test', name: 'Approval Limited A', status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'approval-admin-b@example.test', name: 'Approval Admin B', status: 'ACTIVE' },
      { id: DELEGATE_B_ID, companyId: COMPANY_B_ID, email: 'approval-delegate-b@example.test', name: 'Approval Delegate B', status: 'ACTIVE' }
    ]
  });

  await client.authCredential.createMany({
    data: [
      ADMIN_A_ID,
      REQUESTER_A_ID,
      APPROVER_1_A_ID,
      APPROVER_2_A_ID,
      DELEGATE_A_ID,
      EXPIRED_DELEGATE_A_ID,
      LIMITED_A_ID,
      ADMIN_B_ID,
      DELEGATE_B_ID
    ].map((userId) => ({ userId, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: REQUESTER_A_ID, roleId: REQUESTER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: APPROVER_1_A_ID, roleId: ACTOR_PERMISSION_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: APPROVER_2_A_ID, roleId: ACTOR_PERMISSION_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: DELEGATE_A_ID, roleId: ACTOR_PERMISSION_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: EXPIRED_DELEGATE_A_ID, roleId: ACTOR_PERMISSION_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: LIMITED_A_ID, roleId: LIMITED_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: APPROVER_1_A_ID, roleId: BUSINESS_APPROVER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: APPROVER_2_A_ID, roleId: BUSINESS_APPROVER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });
}

/** Run one isolated live API scenario against the disposable PostgreSQL database. */
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

/** Sign in through the real Module 24A authentication route. */
async function signIn(app, email) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one definition through the public Module 22 API. */
async function createDefinition(app, token, input) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/approvals/definitions',
    headers: { authorization: `Bearer ${token}` },
    payload: input
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Create an approval request through the trusted internal service contract. */
async function requestApproval(runtime, input) {
  internalRequestCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-22-pass-76-${internalRequestCounter}`,
    correlationId: `module-22-pass-76-${internalRequestCounter}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: [],
    projectScope: { kind: 'not-resolved' }
  }, async () => {
    const service = new runtime.ApprovalsService(input.client);
    return service.requestApproval({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      definitionCode: input.definitionCode,
      payloadSnapshot: input.payloadSnapshot,
      sourceKey: input.sourceKey ?? {
        sourceModule: 'module-22-test',
        sourceType: 'approval-request',
        sourceId: input.resourceId,
        sourceLineId: input.definitionCode
      }
    });
  });
}

/** Read one repository result under an explicit trusted company context. */
async function readDefinitionInCompany(runtime, input) {
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-22-repository-${input.companyId}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: [],
    projectScope: { kind: 'not-resolved' }
  }, async () => {
    const repository = new runtime.ApprovalsRepository(input.client);
    return repository.findDefinitionByIdForCompany(input.definitionId);
  });
}

test('Module 22 definition API enforces auth, permissions, immutability and tenant scope', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/approvals/definitions' });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, 'AUTH_SESSION_EXPIRED');

    const adminAToken = await signIn(app, 'approval-admin-a@example.test');
    const limitedToken = await signIn(app, 'approval-limited-a@example.test');
    const adminBToken = await signIn(app, 'approval-admin-b@example.test');

    const definition = await createDefinition(app, adminAToken, {
      code: 'DRAFT_PO',
      name: 'Draft PO Approval',
      resourceType: 'PURCHASE_ORDER',
      status: 'DRAFT',
      conditions: [],
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 1 }]
    });
    assert.equal(definition.versionNo, 1);
    assert.equal(definition.steps.length, 1);
    assert.equal(definition.steps[0].stepNo, 1);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/definitions?code=DRAFT_PO&pageSize=10',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/approvals/definitions/${definition.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Updated Draft PO Approval', status: 'ACTIVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'ACTIVE');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/approvals/definitions/${definition.id}`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { name: 'Must Not Change' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/definitions',
      headers: { authorization: `Bearer ${limitedToken}` },
      payload: {
        code: 'FORBIDDEN_DEF',
        name: 'Forbidden Definition',
        resourceType: 'BUDGET',
        steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID }]
      }
    });
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/definitions',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        companyId: COMPANY_B_ID,
        code: 'UNTRUSTED_COMPANY',
        name: 'Untrusted Company',
        resourceType: 'BUDGET',
        steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/definitions?code=DRAFT_PO',
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 0);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/approvals/definitions/${definition.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { name: 'Cross Company Attempt' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');
    assert.ok(!response.body.includes('Updated Draft PO Approval'));
  });
});

test('Module 22 validates approvers before activation and rejects invalid company relationships', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'approval-admin-a@example.test');

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/definitions',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'BAD_ACTIVE_USER',
        name: 'Bad Active User',
        resourceType: 'PURCHASE_ORDER',
        status: 'ACTIVE',
        steps: [{ approverType: 'USER', approverRef: ADMIN_B_ID, minApprovals: 1 }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/definitions',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'BAD_ROLE_THRESHOLD',
        name: 'Bad Role Threshold',
        resourceType: 'PURCHASE_ORDER',
        status: 'ACTIVE',
        steps: [{ approverType: 'ROLE', approverRef: BUSINESS_APPROVER_ROLE_A_ID, minApprovals: 3 }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/definitions',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        code: 'BAD_USER_THRESHOLD',
        name: 'Bad User Threshold',
        resourceType: 'PURCHASE_ORDER',
        status: 'DRAFT',
        steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 2 }]
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');

    const draft = await createDefinition(app, adminToken, {
      code: 'LATE_APPROVER_CHECK',
      name: 'Late Approver Check',
      resourceType: 'PURCHASE_ORDER',
      status: 'DRAFT',
      steps: [{ approverType: 'USER', approverRef: '00000000-0000-4000-8000-000000009999', minApprovals: 1 }]
    });

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/approvals/definitions/${draft.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { status: 'ACTIVE' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');

    const storedDraft = await client.approvalDefinition.findUnique({ where: { id: draft.id } });
    assert.equal(storedDraft.status, 'DRAFT');

    await assert.rejects(() => client.approvalDelegation.create({
      data: {
        companyId: COMPANY_A_ID,
        fromUserId: APPROVER_1_A_ID,
        toUserId: ADMIN_B_ID,
        fromDate: new Date('2026-01-01T00:00:00.000Z'),
        toDate: new Date('2026-01-31T00:00:00.000Z'),
        scopeJson: { resourceTypes: ['PURCHASE_ORDER'] },
        status: 'ACTIVE'
      }
    }));
  });
});

test('Module 22 trusted request creation snapshots version and approval action retries are idempotent', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminToken = await signIn(app, 'approval-admin-a@example.test');
    const approverToken = await signIn(app, 'approval-one-a@example.test');
    const wrongApproverToken = await signIn(app, 'approval-two-a@example.test');

    const version1 = await createDefinition(app, adminToken, {
      code: 'DIRECT_APPROVAL',
      name: 'Direct Approval V1',
      resourceType: 'PURCHASE_ORDER',
      status: 'ACTIVE',
      conditions: [{ field: 'amount', operator: 'gte', value: 100 }],
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 1 }]
    });

    const resourceId = '00000000-0000-4000-8000-000000002240';
    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'PURCHASE_ORDER',
      resourceId,
      definitionCode: 'DIRECT_APPROVAL',
      payloadSnapshot: { amount: 150, documentNo: 'PO-76-001' }
    });
    assert.equal(request.definitionVersion, 1);

    const version2 = await createDefinition(app, adminToken, {
      code: 'DIRECT_APPROVAL',
      name: 'Direct Approval V2',
      resourceType: 'PURCHASE_ORDER',
      status: 'ACTIVE',
      conditions: [{ field: 'amount', operator: 'gte', value: 100 }],
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 1 }]
    });
    assert.equal(version1.versionNo, 1);
    assert.equal(version2.versionNo, 2);

    const stored = await client.approvalRequest.findUnique({ where: { id: request.id } });
    assert.equal(stored.definitionVersion, 1);
    assert.deepEqual(stored.payloadSnapshotJson, { amount: 150, documentNo: 'PO-76-001' });

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/inbox',
      headers: { authorization: `Bearer ${approverToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === request.id), true);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/approvals/requests/${request.id}`,
      headers: { authorization: `Bearer ${approverToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.definition.versionNo, 1);
    assert.equal(response.json().data.payloadSnapshot.amount, 150);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: {
        authorization: `Bearer ${wrongApproverToken}`,
        'idempotency-key': 'direct-wrong-approver'
      },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_NOT_ASSIGNED');

    const actionHeaders = {
      authorization: `Bearer ${approverToken}`,
      'idempotency-key': 'direct-approval-1'
    };
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: actionHeaders,
      payload: { action: 'APPROVE', comment: 'Approved once' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'APPROVED');
    const firstBody = response.body;

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: actionHeaders,
      payload: { action: 'APPROVE', comment: 'Approved once' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.body, firstBody);
    assert.equal(await client.approvalAction.count({ where: { approvalRequestId: request.id } }), 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: {
        authorization: `Bearer ${approverToken}`,
        'idempotency-key': 'direct-approval-after-terminal'
      },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_ALREADY_COMPLETED');

    await assert.rejects(
      requestApproval(runtime, {
        client,
        actorUserId: REQUESTER_A_ID,
        companyId: COMPANY_A_ID,
        resourceType: 'PURCHASE_ORDER',
        resourceId: '00000000-0000-4000-8000-000000002241',
        definitionCode: 'DIRECT_APPROVAL',
        payloadSnapshot: { amount: 50 }
      }),
      (error) => error?.code === 'APPROVAL_DEFINITION_INVALID'
    );

    const events = await client.outboxEvent.findMany({
      where: { companyId: COMPANY_A_ID, resourceId: request.id },
      select: { eventType: true }
    });
    assert.deepEqual(events.map((row) => row.eventType).sort(), [
      'approval.completed',
      'approval.requested',
      'approval.step_approved'
    ]);

    const audits = await client.auditLog.findMany({ where: { companyId: COMPANY_A_ID } });
    const actions = audits.map((row) => row.action);
    assert.ok(actions.includes('approval.requested'));
    assert.ok(actions.includes('approval.action_approved'));
  });
});

test('Module 22 supports role approvers, multi-approval thresholds, step advance, reject and return', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminToken = await signIn(app, 'approval-admin-a@example.test');
    const approver1Token = await signIn(app, 'approval-one-a@example.test');
    const approver2Token = await signIn(app, 'approval-two-a@example.test');

    await createDefinition(app, adminToken, {
      code: 'ROLE_CHAIN',
      name: 'Role Chain',
      resourceType: 'BUDGET',
      status: 'ACTIVE',
      steps: [
        { approverType: 'ROLE', approverRef: BUSINESS_APPROVER_ROLE_A_ID, minApprovals: 2 },
        { approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 1 }
      ]
    });

    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'BUDGET',
      resourceId: '00000000-0000-4000-8000-000000002250',
      definitionCode: 'ROLE_CHAIN',
      payloadSnapshot: { amount: 200000 }
    });

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approver1Token}`, 'idempotency-key': 'role-step-1-a' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING');
    assert.equal(response.json().data.currentStepNo, 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approver1Token}`, 'idempotency-key': 'role-step-1-a-duplicate' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_APPROVAL_ACTION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approver2Token}`, 'idempotency-key': 'role-step-1-b' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING');
    assert.equal(response.json().data.currentStepNo, 2);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approver1Token}`, 'idempotency-key': 'role-step-2-reject' },
      payload: { action: 'REJECT', comment: 'Budget needs revision' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'REJECTED');
    assert.equal(await client.approvalAction.count({ where: { approvalRequestId: request.id } }), 3);

    await createDefinition(app, adminToken, {
      code: 'RETURN_FLOW',
      name: 'Return Flow',
      resourceType: 'TIMESHEET',
      status: 'ACTIVE',
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID }]
    });
    const returnRequest = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'TIMESHEET',
      resourceId: '00000000-0000-4000-8000-000000002251',
      definitionCode: 'RETURN_FLOW',
      payloadSnapshot: { hours: 8 }
    });

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${returnRequest.id}/actions`,
      headers: { authorization: `Bearer ${approver1Token}`, 'idempotency-key': 'return-flow-1' },
      payload: { action: 'RETURN', comment: 'Please correct the entry' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'RETURNED');

    const eventTypes = (await client.outboxEvent.findMany({
      where: { companyId: COMPANY_A_ID },
      select: { eventType: true }
    })).map((row) => row.eventType);
    assert.ok(eventTypes.includes('approval.step_approved'));
    assert.ok(eventTypes.includes('approval.rejected'));
    assert.ok(eventTypes.includes('approval.returned'));
  });
});

test('Module 22 delegation allows only active in-scope delegates', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminToken = await signIn(app, 'approval-admin-a@example.test');
    const delegateToken = await signIn(app, 'approval-delegate-a@example.test');
    const expiredDelegateToken = await signIn(app, 'approval-expired-delegate-a@example.test');

    await createDefinition(app, adminToken, {
      code: 'SUBCONTRACT_DELEGATION',
      name: 'Subcontract Delegation',
      resourceType: 'SUBCONTRACT',
      status: 'ACTIVE',
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID }]
    });
    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'SUBCONTRACT',
      resourceId: '00000000-0000-4000-8000-000000002260',
      definitionCode: 'SUBCONTRACT_DELEGATION',
      payloadSnapshot: { certificateNo: 'SC-76-1' }
    });

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        fromUserId: APPROVER_1_A_ID,
        toUserId: EXPIRED_DELEGATE_A_ID,
        fromDate: '2020-01-01',
        toDate: '2020-12-31',
        scope: { resourceTypes: ['SUBCONTRACT'] }
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${expiredDelegateToken}`, 'idempotency-key': 'expired-delegate' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_NOT_ASSIGNED');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        fromUserId: APPROVER_1_A_ID,
        toUserId: DELEGATE_A_ID,
        fromDate: '2025-01-01',
        toDate: '2030-12-31',
        scope: { resourceTypes: ['SUBCONTRACT'] }
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/inbox?resourceType=SUBCONTRACT',
      headers: { authorization: `Bearer ${delegateToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === request.id), true);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/approvals/requests/${request.id}`,
      headers: { authorization: `Bearer ${delegateToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${delegateToken}`, 'idempotency-key': 'valid-delegate' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'APPROVED');
    assert.equal(response.json().data.actorUserId, DELEGATE_A_ID);
    assert.equal(response.json().data.representedApproverUserId, APPROVER_1_A_ID);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        fromUserId: APPROVER_1_A_ID,
        toUserId: ADMIN_B_ID,
        fromDate: '2025-01-01',
        toDate: '2030-12-31',
        scope: { resourceTypes: ['SUBCONTRACT'] }
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_DEFINITION_INVALID');

    const delegationAudits = await client.auditLog.count({
      where: { companyId: COMPANY_A_ID, action: 'approval.delegation_created' }
    });
    assert.equal(delegationAudits, 2);
  });
});


test('Module 22 delegation readback is paginated, permission-safe and company-scoped', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminAToken = await signIn(app, 'approval-admin-a@example.test');
    const limitedToken = await signIn(app, 'approval-limited-a@example.test');
    const adminBToken = await signIn(app, 'approval-admin-b@example.test');

    for (const payload of [
      {
        fromUserId: APPROVER_1_A_ID,
        toUserId: DELEGATE_A_ID,
        fromDate: '2027-01-01',
        toDate: '2027-12-31',
        scope: { resourceTypes: ['PURCHASE_ORDER'] }
      },
      {
        fromUserId: APPROVER_2_A_ID,
        toUserId: EXPIRED_DELEGATE_A_ID,
        fromDate: '2026-01-01',
        toDate: '2026-12-31',
        scope: { resourceTypes: ['BUDGET'] }
      }
    ]) {
      const created = await app.inject({
        method: 'POST',
        url: '/api/v1/approvals/delegations',
        headers: { authorization: `Bearer ${adminAToken}` },
        payload
      });
      assert.equal(created.statusCode, 200, created.body);
    }

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: {
        fromUserId: ADMIN_B_ID,
        toUserId: DELEGATE_B_ID,
        fromDate: '2028-01-01',
        toDate: '2028-12-31',
        scope: { resourceTypes: ['CHANGE_ORDER'] }
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/delegations?page=1&pageSize=1',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 2);
    assert.equal(response.json().data.page, 1);
    assert.equal(response.json().data.pageSize, 1);
    assert.equal(response.json().data.items.length, 1);
    assert.equal(response.json().data.items[0].fromUserId, APPROVER_1_A_ID);
    assert.deepEqual(response.json().data.items[0].scope, { resourceTypes: ['PURCHASE_ORDER'] });
    assert.equal('companyId' in response.json().data.items[0], false);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/delegations?page=2&pageSize=1',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items[0].fromUserId, APPROVER_2_A_ID);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/delegations?pageSize=101',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${limitedToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].fromUserId, ADMIN_B_ID);
    assert.equal(response.json().data.items.some((item) => item.fromUserId === APPROVER_1_A_ID), false);
  });
});


test('Module 22 delegated approval authority is counted only once', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminToken = await signIn(app, 'approval-admin-a@example.test');
    const approverOneToken = await signIn(app, 'approval-one-a@example.test');
    const approverTwoToken = await signIn(app, 'approval-two-a@example.test');
    const delegateToken = await signIn(app, 'approval-delegate-a@example.test');

    await createDefinition(app, adminToken, {
      code: 'DELEGATED_ROLE_THRESHOLD',
      name: 'Delegated Role Threshold',
      resourceType: 'BUDGET',
      status: 'ACTIVE',
      steps: [{ approverType: 'ROLE', approverRef: BUSINESS_APPROVER_ROLE_A_ID, minApprovals: 2 }]
    });
    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'BUDGET',
      resourceId: '00000000-0000-4000-8000-000000002261',
      definitionCode: 'DELEGATED_ROLE_THRESHOLD',
      payloadSnapshot: { budgetNo: 'BUD-88-1' }
    });

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/approvals/delegations',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        fromUserId: APPROVER_1_A_ID,
        toUserId: DELEGATE_A_ID,
        fromDate: '2025-01-01',
        toDate: '2030-12-31',
        scope: { resourceTypes: ['BUDGET'] }
      }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${delegateToken}`, 'idempotency-key': 'pass-88-delegate-seat' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING');
    assert.equal(response.json().data.actorUserId, DELEGATE_A_ID);
    assert.equal(response.json().data.representedApproverUserId, APPROVER_1_A_ID);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approverOneToken}`, 'idempotency-key': 'pass-88-direct-same-seat' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_APPROVAL_ACTION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${approverTwoToken}`, 'idempotency-key': 'pass-88-second-seat' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'APPROVED');
    assert.equal(response.json().data.representedApproverUserId, APPROVER_2_A_ID);

    const actions = await client.approvalAction.findMany({
      where: { approvalRequestId: request.id, stepNo: 1 },
      orderBy: { actedAt: 'asc' }
    });
    assert.deepEqual(actions.map((item) => item.representedApproverUserId), [
      APPROVER_1_A_ID,
      APPROVER_2_A_ID
    ]);
  });
});

test('Module 22 repository, service and API hide cross-company approval data and enforce action permission', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminAToken = await signIn(app, 'approval-admin-a@example.test');
    const adminBToken = await signIn(app, 'approval-admin-b@example.test');
    const limitedToken = await signIn(app, 'approval-limited-a@example.test');

    const definition = await createDefinition(app, adminAToken, {
      code: 'LIMITED_ACTION',
      name: 'Limited Action',
      resourceType: 'RFI',
      status: 'ACTIVE',
      steps: [{ approverType: 'USER', approverRef: LIMITED_A_ID }]
    });
    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'RFI',
      resourceId: '00000000-0000-4000-8000-000000002270',
      definitionCode: 'LIMITED_ACTION',
      payloadSnapshot: { rfiNo: 'RFI-76-1' }
    });

    const companyARead = await readDefinitionInCompany(runtime, {
      client,
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      definitionId: definition.id
    });
    assert.equal(companyARead.id, definition.id);

    const companyBRead = await readDefinitionInCompany(runtime, {
      client,
      actorUserId: ADMIN_B_ID,
      companyId: COMPANY_B_ID,
      definitionId: definition.id
    });
    assert.equal(companyBRead, null);

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${limitedToken}`, 'idempotency-key': 'limited-no-act' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/approvals/requests/${request.id}`,
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_REQUEST_NOT_FOUND');
    assert.ok(!response.body.includes('RFI-76-1'));

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${request.id}/actions`,
      headers: { authorization: `Bearer ${adminBToken}`, 'idempotency-key': 'cross-company-action' },
      payload: { action: 'APPROVE' }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'APPROVAL_REQUEST_NOT_FOUND');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/approvals/inbox?pageSize=100',
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === request.id), false);
  });
});


test('Module 22 approval request joins the owning transaction and replays the same source key', { skip: !live }, async () => {
  await withApi(async ({ app, client, testing, ApprovalsService }) => {
    const adminToken = await signIn(app, 'approval-admin-a@example.test');
    await createDefinition(app, adminToken, {
      code: 'TRANSACTION_SAFE_REQUEST',
      name: 'Transaction Safe Request',
      resourceType: 'PURCHASE_REQUISITION',
      status: 'ACTIVE',
      conditions: [],
      steps: [{ approverType: 'USER', approverRef: APPROVER_1_A_ID, minApprovals: 1 }]
    });

    const input = {
      resourceType: 'PURCHASE_REQUISITION',
      resourceId: '00000000-0000-4000-8000-000000002280',
      definitionCode: 'TRANSACTION_SAFE_REQUEST',
      payloadSnapshot: { amount: 1250, description: 'Transaction-safe approval request' },
      sourceKey: {
        sourceModule: 'procurement',
        sourceType: 'purchase-requisition.submit',
        sourceId: '00000000-0000-4000-8000-000000002280'
      }
    };

    await assert.rejects(
      testing.runWithAuthenticatedTestContext({
        requestId: 'module-22-pass-89-rollback',
        correlationId: 'module-22-pass-89-rollback',
        actorUserId: REQUESTER_A_ID,
        companyId: COMPANY_A_ID,
        permissions: [],
        projectScope: { kind: 'not-resolved' }
      }, async () => {
        await client.$transaction(async (tx) => {
          const service = new ApprovalsService(client);
          await service.requestApprovalInTransaction(tx, input);
          throw new Error('ROLL_BACK_OWNER_COMMAND');
        });
      }),
      /ROLL_BACK_OWNER_COMMAND/
    );

    assert.equal(await client.approvalRequest.count({ where: { companyId: COMPANY_A_ID, resourceId: input.resourceId } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, resourceType: 'approval_request' } }), 0);

    const first = await testing.runWithAuthenticatedTestContext({
      requestId: 'module-22-pass-89-commit',
      correlationId: 'module-22-pass-89-commit',
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      permissions: [],
      projectScope: { kind: 'not-resolved' }
    }, async () => client.$transaction(async (tx) => {
      const service = new ApprovalsService(client);
      return service.requestApprovalInTransaction(tx, input);
    }));

    const replay = await testing.runWithAuthenticatedTestContext({
      requestId: 'module-22-pass-89-replay',
      correlationId: 'module-22-pass-89-replay',
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      permissions: [],
      projectScope: { kind: 'not-resolved' }
    }, async () => client.$transaction(async (tx) => {
      const service = new ApprovalsService(client);
      return service.requestApprovalInTransaction(tx, input);
    }));

    assert.equal(replay.id, first.id);
    assert.equal(await client.approvalRequest.count({ where: { companyId: COMPANY_A_ID, resourceId: input.resourceId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, resourceType: 'approval_request', resourceId: first.id } }), 1);

    await assert.rejects(
      testing.runWithAuthenticatedTestContext({
        requestId: 'module-22-pass-89-source-key-misuse',
        correlationId: 'module-22-pass-89-source-key-misuse',
        actorUserId: REQUESTER_A_ID,
        companyId: COMPANY_A_ID,
        permissions: [],
        projectScope: { kind: 'not-resolved' }
      }, async () => client.$transaction(async (tx) => {
        const service = new ApprovalsService(client);
        return service.requestApprovalInTransaction(tx, {
          ...input,
          resourceId: '00000000-0000-4000-8000-000000002281'
        });
      })),
      (error) => error?.code === 'APPROVAL_DEFINITION_INVALID'
    );
  });
});


test('Module 22 timing policy schedules durable jobs and expires only the still-current pending step', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client } = runtime;
    const adminToken = await signIn(app, 'approval-admin-a@example.test');

    await createDefinition(app, adminToken, {
      code: 'TIMED_APPROVAL',
      name: 'Timed Approval',
      resourceType: 'PURCHASE_ORDER',
      status: 'ACTIVE',
      steps: [{
        approverType: 'USER',
        approverRef: APPROVER_1_A_ID,
        minApprovals: 1,
        reminderAfterMinutes: 5,
        escalateAfterMinutes: 10,
        expireAfterMinutes: 15
      }]
    });

    const request = await requestApproval(runtime, {
      client,
      actorUserId: REQUESTER_A_ID,
      companyId: COMPANY_A_ID,
      resourceType: 'PURCHASE_ORDER',
      resourceId: '00000000-0000-4000-8000-000000002290',
      definitionCode: 'TIMED_APPROVAL',
      payloadSnapshot: { poNo: 'PO-90-1' }
    });

    const timingJobs = (await client.queueJob.findMany({
      where: {
        companyId: COMPANY_A_ID,
        queueName: 'approval-timing'
      },
      orderBy: { availableAt: 'asc' }
    })).filter((job) => job.payload?.approvalRequestId === request.id);

    assert.deepEqual(timingJobs.map((job) => job.jobType), [
      'approval.reminder',
      'approval.escalation',
      'approval.expire'
    ]);
    assert.ok(timingJobs[0].availableAt < timingJobs[1].availableAt);
    assert.ok(timingJobs[1].availableAt < timingJobs[2].availableAt);

    const expiryJob = timingJobs.find((job) => job.jobType === 'approval.expire');
    assert.ok(expiryJob);
    await client.queueJob.update({
      where: { id: expiryJob.id },
      data: { availableAt: new Date(Date.now() - 1_000) }
    });

    const claimed = await runtime.runApprovalTimingBatch(client, {
      approvalNotificationWebhookUrl: null,
      approvalNotificationWebhookToken: null
    });
    assert.equal(claimed, 1);

    const expired = await client.approvalRequest.findUnique({ where: { id: request.id } });
    assert.equal(expired.status, 'EXPIRED');
    assert.ok(expired.completedAt instanceof Date);

    assert.equal(await client.auditLog.count({
      where: { companyId: COMPANY_A_ID, entityId: request.id, action: 'approval.expired' }
    }), 1);
    assert.equal(await client.outboxEvent.count({
      where: { companyId: COMPANY_A_ID, resourceId: request.id, eventType: 'approval.expired' }
    }), 1);
    const expiredNotification = await client.queueJob.findFirst({
      where: {
        companyId: COMPANY_A_ID,
        queueName: 'approval-timing',
        jobType: 'approval.expired-notification',
        status: 'PENDING'
      }
    });
    assert.ok(expiredNotification);
    await client.queueJob.update({
      where: { id: expiredNotification.id },
      data: { availableAt: new Date(Date.now() + 60_000) }
    });

    const staleReminder = timingJobs.find((job) => job.jobType === 'approval.reminder');
    assert.ok(staleReminder);
    await client.queueJob.update({
      where: { id: staleReminder.id },
      data: { availableAt: new Date(Date.now() - 1_000) }
    });
    const staleClaimed = await runtime.runApprovalTimingBatch(client, {
      approvalNotificationWebhookUrl: null,
      approvalNotificationWebhookToken: null
    });
    assert.equal(staleClaimed, 1);

    const reminderAfterExpiry = await client.queueJob.findUnique({ where: { id: staleReminder.id } });
    assert.equal(reminderAfterExpiry.status, 'COMPLETED');
  });
});
