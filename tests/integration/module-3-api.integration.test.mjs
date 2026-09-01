import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000003000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000003100';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000003010';
const READER_A_ID = '00000000-0000-4000-8000-000000003011';
const APPROVER_A_ID = '00000000-0000-4000-8000-000000003012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000003110';
const ADMIN_ROLE_A_ID = '00000000-0000-4000-8000-000000003020';
const READER_ROLE_A_ID = '00000000-0000-4000-8000-000000003021';
const APPROVER_ROLE_A_ID = '00000000-0000-4000-8000-000000003022';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000003120';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000003030';
const ARCHIVED_CLIENT_A_ID = '00000000-0000-4000-8000-000000003031';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000003130';
const QUALIFIED_OPPORTUNITY_A_ID = '00000000-0000-4000-8000-000000003040';
const LEAD_OPPORTUNITY_A_ID = '00000000-0000-4000-8000-000000003041';
const OPPORTUNITY_B_ID = '00000000-0000-4000-8000-000000003140';
const FOREIGN_TENDER_B_ID = '00000000-0000-4000-8000-000000003150';
const PASSWORD = 'Module3-pass-116-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const APPROVAL_DEFINITION_CODE = 'TENDER_ESTIMATE_APPROVAL';
const MODULE_3_PERMISSIONS = [
  'tenders.read',
  'tenders.create',
  'estimates.edit',
  'tenders.submit',
  'tenders.manage_outcome'
];
const APPROVAL_PERMISSIONS = [
  'approvals.inbox.read',
  'approvals.act'
];

let contextCounter = 0;

/** Load built runtime packages only when the disposable live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const {
    TenderingEstimationRepository,
    TenderingEstimationService
  } = await import('../../apps/api/dist/modules/tendering-estimation/index.js');
  return {
    testing,
    buildApp,
    hashPassword,
    TenderingEstimationRepository,
    TenderingEstimationService
  };
}

/** Seed companies, permissions, identities and CRM records needed by Module 3 integration tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_A_ID,
        legalName: 'Module 3 Company A Ltd',
        displayName: 'Module 3 Company A',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 3 Company B Ltd',
        displayName: 'Module 3 Company B',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissionCodes = [...MODULE_3_PERMISSIONS, ...APPROVAL_PERMISSIONS];
  const permissions = [];
  for (const code of permissionCodes) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: code.split('.')[0] },
      create: { code, name: code, domain: code.split('.')[0] }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'tender-admin', name: 'Tender Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'tender-reader', name: 'Tender Reader', isSystem: false, status: 'ACTIVE' },
      { id: APPROVER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'tender-approver', name: 'Tender Approver', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'tender-admin', name: 'Tender Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_3_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_A_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_3_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_A_ID, permissionId: permissionByCode.get('tenders.read') },
      { roleId: APPROVER_ROLE_A_ID, permissionId: permissionByCode.get('approvals.inbox.read') },
      { roleId: APPROVER_ROLE_A_ID, permissionId: permissionByCode.get('approvals.act') }
    ]
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'tender-admin-a@example.test', name: 'Tender Admin A', status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'tender-reader-a@example.test', name: 'Tender Reader A', status: 'ACTIVE' },
      { id: APPROVER_A_ID, companyId: COMPANY_A_ID, email: 'tender-approver-a@example.test', name: 'Tender Approver A', status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'tender-admin-b@example.test', name: 'Tender Admin B', status: 'ACTIVE' }
    ]
  });

  await client.authCredential.createMany({
    data: [ADMIN_A_ID, READER_A_ID, APPROVER_A_ID, ADMIN_B_ID].map((userId) => ({ userId, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: READER_A_ID, roleId: READER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: APPROVER_A_ID, roleId: APPROVER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_A_ID,
        companyId: COMPANY_A_ID,
        code: 'A-CLIENT-001',
        legalName: 'Active Client A Ltd',
        displayName: 'Active Client A',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: ARCHIVED_CLIENT_A_ID,
        companyId: COMPANY_A_ID,
        code: 'A-CLIENT-ARCHIVED',
        legalName: 'Archived Client A Ltd',
        displayName: 'Archived Client A',
        billingAddress: 'Lahore, Pakistan',
        status: 'ARCHIVED',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'B-CLIENT-001',
        legalName: 'Foreign Client B Ltd',
        displayName: 'Foreign Client B',
        billingAddress: 'Karachi, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 15
      }
    ]
  });

  await client.opportunity.createMany({
    data: [
      {
        id: QUALIFIED_OPPORTUNITY_A_ID,
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        code: 'A-OPP-QUALIFIED',
        name: 'Qualified Opportunity A',
        estimatedValue: '500000.00',
        probability: 70,
        stage: 'QUALIFIED',
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: new Date('2026-12-31T00:00:00.000Z')
      },
      {
        id: LEAD_OPPORTUNITY_A_ID,
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        code: 'A-OPP-LEAD',
        name: 'Lead Opportunity A',
        estimatedValue: '100000.00',
        probability: 20,
        stage: 'LEAD',
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: new Date('2026-11-30T00:00:00.000Z')
      },
      {
        id: OPPORTUNITY_B_ID,
        companyId: COMPANY_B_ID,
        clientId: CLIENT_B_ID,
        code: 'B-OPP-QUALIFIED',
        name: 'Foreign Qualified Opportunity B',
        estimatedValue: '300000.00',
        probability: 60,
        stage: 'QUALIFIED',
        source: 'Referral',
        ownerUserId: ADMIN_B_ID,
        expectedCloseDate: new Date('2026-10-31T00:00:00.000Z')
      }
    ]
  });

  await client.tender.create({
    data: {
      id: FOREIGN_TENDER_B_ID,
      companyId: COMPANY_B_ID,
      clientId: CLIENT_B_ID,
      opportunityId: OPPORTUNITY_B_ID,
      tenderNo: 'B-TENDER-001',
      title: 'Foreign Tender B',
      dueDate: new Date('2026-09-30T00:00:00.000Z'),
      status: 'DRAFT',
      ownerUserId: ADMIN_B_ID,
      currency: 'USD'
    }
  });
}

/** Build one fresh Fastify app over the disposable PostgreSQL database. */
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
      tenderEstimateApprovalDefinitionCode: options.approvalDefinitionCode ?? null
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

/** Return the stable public error code from one Fastify response. */
function errorCode(response) {
  return response.json().error.code;
}

/** Verify one public error keeps its status/code without exposing database or runtime internals. */
function assertSafePublicError(response, expectedStatus, expectedCode) {
  assert.equal(response.statusCode, expectedStatus, response.body);
  assert.equal(errorCode(response), expectedCode);

  const body = response.body.toLowerCase();
  for (const forbidden of ['prisma', 'p2002', 'postgresql', 'stack', 'select ', 'insert into ', 'update ']) {
    assert.equal(body.includes(forbidden), false, `public error leaked: ${forbidden}`);
  }
}

/** Create one draft tender through the public Module 3 API. */
async function createTender(app, token, input = {}) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/tenders',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      clientId: input.clientId ?? CLIENT_A_ID,
      opportunityId: input.opportunityId === undefined ? QUALIFIED_OPPORTUNITY_A_ID : input.opportunityId,
      tenderNo: input.tenderNo ?? 'A-TENDER-001',
      title: input.title ?? 'Module 3 Commercial Tender',
      dueDate: input.dueDate ?? '2026-10-15',
      ownerUserId: input.ownerUserId ?? ADMIN_A_ID,
      currency: input.currency ?? 'usd'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one estimate version with deterministic decimal-safe commercial values. */
async function createEstimate(app, token, tenderId) {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/tenders/${tenderId}/estimates`,
    headers: { authorization: `Bearer ${token}` },
    payload: {
      indirectCost: '100.10',
      contingency: '20.20',
      markup: '30.30',
      items: [
        {
          description: 'Concrete and structural work',
          quantity: '10.5000',
          unit: 'm3',
          laborCost: '100.10',
          materialCost: '200.20',
          equipmentCost: '50.00',
          subcontractCost: '25.00',
          otherCost: '5.00'
        },
        {
          description: 'Site preliminaries',
          quantity: '1',
          unit: 'lot',
          laborCost: '10.00',
          materialCost: '20.00',
          equipmentCost: '30.00',
          subcontractCost: '40.00',
          otherCost: '50.00'
        }
      ]
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Run one direct repository/service assertion under trusted company request context. */
async function runInCompanyContext(runtime, input, work) {
  contextCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-3-integration-${contextCounter}`,
    correlationId: `module-3-integration-${contextCounter}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: input.permissions,
    projectScope: { kind: 'not-resolved' }
  }, work);
}

/** Seed one active Module 22 estimate approval definition for the configured owning-module integration test. */
async function seedEstimateApprovalDefinition(client) {
  await client.approvalDefinition.create({
    data: {
      companyId: COMPANY_A_ID,
      code: APPROVAL_DEFINITION_CODE,
      name: 'Tender Estimate Approval',
      resourceType: 'estimate_version',
      conditionJson: [],
      status: 'ACTIVE',
      versionNo: 1,
      steps: {
        create: [{
          stepNo: 1,
          approverType: 'USER',
          approverRef: APPROVER_A_ID,
          minApprovals: 1,
          conditionJson: [],
          reminderAfterMinutes: null,
          escalateAfterMinutes: null,
          expireAfterMinutes: null
        }]
      }
    }
  });
}

test('Module 3 full API workflow persists versioned estimates, immutable submission, audit and outbox records', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/tenders' });
    assert.equal(response.statusCode, 401, response.body);

    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const readerToken = await signIn(app, 'tender-reader-a@example.test');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: 'READ-ONLY-BLOCKED',
        title: 'Reader must not create',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assert.equal(response.statusCode, 403, response.body);

    const tender = await createTender(app, adminToken);
    assert.equal(tender.status, 'DRAFT');
    assert.equal(tender.currency, 'USD');
    assert.equal(tender.companyId, COMPANY_A_ID);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: tender.tenderNo,
        title: 'Duplicate Tender',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'DUPLICATE_TENDER_NUMBER');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenders?status=DRAFT&search=A-TENDER&page=1&pageSize=10',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, tender.id);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.tender.id, tender.id);
    assert.equal(response.json().data.submission, null);
    assert.deepEqual(response.json().data.estimateVersions, []);

    const version1 = await createEstimate(app, adminToken, tender.id);
    assert.equal(version1.versionNo, 1);
    assert.equal(version1.status, 'DRAFT');
    assert.equal(version1.directCost, '530.30');
    assert.equal(version1.tenderTotal, '680.90');
    assert.equal(version1.items.length, 2);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tenders/${tender.id}/estimates/${version1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        indirectCost: '5.00',
        contingency: '6.00',
        markup: '7.00',
        items: [{
          description: 'Repriced complete package',
          quantity: '1.0000',
          unit: 'lot',
          laborCost: '10.00',
          materialCost: '20.00',
          equipmentCost: '30.00',
          subcontractCost: '40.00',
          otherCost: '50.00'
        }]
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.directCost, '150.00');
    assert.equal(response.json().data.tenderTotal, '168.00');
    assert.equal(response.json().data.items.length, 1);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}/estimates/${version1.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, version1.id);
    assert.equal(response.json().data.items.length, 1);

    const version2 = await createEstimate(app, adminToken, tender.id);
    assert.equal(version2.versionNo, 2);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: version1.id, validityDate: '2026-12-31' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'TENDER_NOT_READY_FOR_SUBMISSION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${version1.id}/finalize`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'FINAL');
    assert.equal(response.json().data.approvalRequest, null);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tenders/${tender.id}/estimates/${version1.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        items: [{
          description: 'Must stay immutable',
          quantity: '1',
          unit: 'lot',
          laborCost: '1.00'
        }]
      }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'ESTIMATE_VERSION_LOCKED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: version1.id, validityDate: '2026-12-31' }
    });
    assert.equal(response.statusCode, 200, response.body);
    const submitted = response.json().data;
    assert.equal(submitted.tender.status, 'SUBMITTED');
    assert.equal(submitted.submission.estimateVersionId, version1.id);
    assert.equal(submitted.submission.submittedBy, ADMIN_A_ID);
    assert.equal(submitted.submission.submittedAmount, '168.00');
    assert.equal(submitted.submission.outcome, 'PENDING');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: version1.id, validityDate: '2026-12-31' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.submission.id, submitted.submission.id);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: version1.id, validityDate: '2027-01-31' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_TENDER_TRANSITION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/outcome`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { outcome: 'WON', reason: 'Client issued award letter.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.tender.status, 'WON');
    assert.equal(response.json().data.submission.outcome, 'WON');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/outcome`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { outcome: 'WON' }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/outcome`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { outcome: 'LOST' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_TENDER_TRANSITION');

    assert.equal(await client.tenderSubmission.count({ where: { tenderId: tender.id } }), 1);
    assert.equal(await client.estimateVersion.count({ where: { tenderId: tender.id } }), 2);

    const audits = await client.auditLog.findMany({
      where: {
        companyId: COMPANY_A_ID,
        action: {
          in: [
            'tender.created',
            'estimate.version_created',
            'estimate.commercial_updated',
            'estimate.finalized',
            'tender.submitted',
            'tender.outcome_recorded'
          ]
        }
      },
      select: { action: true, actorUserId: true }
    });
    assert.equal(audits.filter((row) => row.action === 'tender.created').length, 1);
    assert.equal(audits.filter((row) => row.action === 'estimate.version_created').length, 2);
    assert.equal(audits.filter((row) => row.action === 'estimate.commercial_updated').length, 1);
    assert.equal(audits.filter((row) => row.action === 'estimate.finalized').length, 1);
    assert.equal(audits.filter((row) => row.action === 'tender.submitted').length, 1);
    assert.equal(audits.filter((row) => row.action === 'tender.outcome_recorded').length, 1);
    assert.equal(audits.every((row) => row.actorUserId === ADMIN_A_ID), true);

    const outbox = await client.outboxEvent.findMany({
      where: {
        companyId: COMPANY_A_ID,
        eventType: { in: ['tender.created', 'estimate.version_created', 'tender.submitted', 'tender.won', 'tender.lost'] }
      },
      select: { eventType: true, actorUserId: true }
    });
    assert.equal(outbox.filter((row) => row.eventType === 'tender.created').length, 1);
    assert.equal(outbox.filter((row) => row.eventType === 'estimate.version_created').length, 2);
    assert.equal(outbox.filter((row) => row.eventType === 'tender.submitted').length, 1);
    assert.equal(outbox.filter((row) => row.eventType === 'tender.won').length, 1);
    assert.equal(outbox.filter((row) => row.eventType === 'tender.lost').length, 0);
    assert.equal(outbox.every((row) => row.actorUserId === ADMIN_A_ID), true);
  });
});

test('Module 3 API, repository and service enforce basic permissions, company scope and transaction rollback', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client, TenderingEstimationRepository, TenderingEstimationService } = runtime;
    const adminToken = await signIn(app, 'tender-admin-a@example.test');

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${FOREIGN_TENDER_B_ID}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'TENDER_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: CLIENT_B_ID,
        tenderNo: 'FOREIGN-CLIENT-BLOCKED',
        title: 'Foreign client must stay hidden',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        opportunityId: LEAD_OPPORTUNITY_A_ID,
        tenderNo: 'LEAD-OPPORTUNITY-BLOCKED',
        title: 'Lead opportunity must not open tender',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    await runInCompanyContext(runtime, {
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      permissions: ['tenders.read']
    }, async () => {
      const repository = new TenderingEstimationRepository(client);
      assert.equal(await repository.findTenderById(FOREIGN_TENDER_B_ID), null);

      const service = new TenderingEstimationService(client);
      await assert.rejects(
        service.createTender({
          clientId: CLIENT_A_ID,
          opportunityId: QUALIFIED_OPPORTUNITY_A_ID,
          tenderNo: 'SERVICE-PERMISSION-BLOCKED',
          title: 'Service permission blocked',
          dueDate: '2026-10-15',
          ownerUserId: ADMIN_A_ID,
          currency: 'USD'
        }),
        (error) => error?.statusCode === 403
      );
    });
  }, { approvalDefinitionCode: 'MISSING_ESTIMATE_APPROVAL' });

  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const tender = await createTender(app, adminToken, { tenderNo: 'ROLLBACK-TENDER-001' });
    const estimate = await createEstimate(app, adminToken, tender.id);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'APPROVAL_DEFINITION_INVALID');

    const storedEstimate = await client.estimateVersion.findUnique({ where: { id: estimate.id } });
    assert.equal(storedEstimate.status, 'DRAFT');
    assert.equal(await client.approvalRequest.count({ where: { resourceId: estimate.id } }), 0);
    assert.equal(await client.auditLog.count({ where: { entityId: estimate.id, action: 'estimate.finalized' } }), 0);
  }, { approvalDefinitionCode: 'MISSING_ESTIMATE_APPROVAL' });
});

test('Module 3 optional approval integration creates one Module 22 request and submits only after approval', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    await seedEstimateApprovalDefinition(client);
    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const approverToken = await signIn(app, 'tender-approver-a@example.test');
    const tender = await createTender(app, adminToken, { tenderNo: 'APPROVAL-TENDER-001' });
    const estimate = await createEstimate(app, adminToken, tender.id);

    let response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'PENDING_APPROVAL');
    assert.equal(response.json().data.approvalRequest.status, 'PENDING');
    const approvalRequestId = response.json().data.approvalRequest.id;

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'ESTIMATE_VERSION_LOCKED');
    assert.equal(await client.approvalRequest.count({ where: { resourceId: estimate.id } }), 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: estimate.id, validityDate: '2026-12-31' }
    });
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'TENDER_NOT_READY_FOR_SUBMISSION');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/approvals/requests/${approvalRequestId}/actions`,
      headers: {
        authorization: `Bearer ${approverToken}`,
        'idempotency-key': 'module-3-estimate-approval-1'
      },
      payload: { action: 'APPROVE', comment: 'Commercial estimate approved.' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'APPROVED');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { estimateVersionId: estimate.id, validityDate: '2026-12-31' }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.tender.status, 'SUBMITTED');

    const storedEstimate = await client.estimateVersion.findUnique({ where: { id: estimate.id } });
    assert.equal(storedEstimate.status, 'APPROVED');
    assert.equal(await client.approvalRequest.count({ where: { resourceId: estimate.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: estimate.id, action: 'estimate.approval_result_applied' } }), 1);
  }, { approvalDefinitionCode: APPROVAL_DEFINITION_CODE });
});

test('Module 3 requires authentication on all nine reviewed routes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const id = ADMIN_A_ID;
    const estimateBody = {
      indirectCost: '0.00',
      contingency: '0.00',
      markup: '0.00',
      items: [{
        description: 'Authentication check item',
        quantity: '1.0000',
        unit: 'lot',
        laborCost: '1.00',
        materialCost: '0.00',
        equipmentCost: '0.00',
        subcontractCost: '0.00',
        otherCost: '0.00'
      }]
    };
    const cases = [
      { method: 'GET', url: '/api/v1/tenders' },
      {
        method: 'POST',
        url: '/api/v1/tenders',
        payload: {
          clientId: CLIENT_A_ID,
          tenderNo: 'AUTH-CHECK',
          title: 'Authentication Check',
          dueDate: '2026-10-15',
          ownerUserId: ADMIN_A_ID,
          currency: 'USD'
        }
      },
      { method: 'GET', url: `/api/v1/tenders/${id}` },
      { method: 'POST', url: `/api/v1/tenders/${id}/estimates`, payload: estimateBody },
      { method: 'PATCH', url: `/api/v1/tenders/${id}/estimates/${id}`, payload: estimateBody },
      { method: 'POST', url: `/api/v1/tenders/${id}/estimates/${id}/finalize`, payload: {} },
      { method: 'GET', url: `/api/v1/tenders/${id}/estimates/${id}` },
      {
        method: 'POST',
        url: `/api/v1/tenders/${id}/submit`,
        payload: { estimateVersionId: id, validityDate: '2026-12-31' }
      },
      { method: 'POST', url: `/api/v1/tenders/${id}/outcome`, payload: { outcome: 'WON' } }
    ];

    for (const request of cases) {
      const response = await app.inject(request);
      assertSafePublicError(response, 401, 'AUTHENTICATION_REQUIRED');
    }
  });
});

test('Module 3 enforces RBAC, trusted authority fields and cross-company isolation', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminAToken = await signIn(app, 'tender-admin-a@example.test');
    const readerAToken = await signIn(app, 'tender-reader-a@example.test');
    const adminBToken = await signIn(app, 'tender-admin-b@example.test');
    const tender = await createTender(app, adminAToken, { tenderNo: 'SECURITY-TENDER-001' });
    const estimate = await createEstimate(app, adminAToken, tender.id);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenders?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((row) => row.id === FOREIGN_TENDER_B_ID), false);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}`,
      headers: { authorization: `Bearer ${readerAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}`,
      headers: { authorization: `Bearer ${readerAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    const forbiddenWrites = [
      {
        method: 'POST',
        url: '/api/v1/tenders',
        payload: {
          clientId: CLIENT_A_ID,
          tenderNo: 'READER-BLOCKED',
          title: 'Reader Blocked',
          dueDate: '2026-10-15',
          ownerUserId: ADMIN_A_ID,
          currency: 'USD'
        }
      },
      {
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/estimates`,
        payload: {
          items: [{ description: 'Reader blocked estimate', quantity: '1', unit: 'lot', laborCost: '1.00' }]
        }
      },
      {
        method: 'PATCH',
        url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}`,
        payload: {
          items: [{ description: 'Reader blocked edit', quantity: '1', unit: 'lot', laborCost: '1.00' }]
        }
      },
      { method: 'POST', url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`, payload: {} },
      {
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/submit`,
        payload: { estimateVersionId: estimate.id, validityDate: '2026-12-31' }
      },
      { method: 'POST', url: `/api/v1/tenders/${tender.id}/outcome`, payload: { outcome: 'CANCELLED' } }
    ];

    for (const request of forbiddenWrites) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${readerAToken}` }
      });
      assertSafePublicError(denied, 403, 'FORBIDDEN');
    }

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}`,
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assertSafePublicError(response, 404, 'TENDER_NOT_FOUND');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}`,
      headers: { authorization: `Bearer ${adminBToken}` }
    });
    assertSafePublicError(response, 404, 'ESTIMATE_VERSION_NOT_FOUND');

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}`,
      headers: { authorization: `Bearer ${adminBToken}` },
      payload: { items: [{ description: 'Foreign edit', quantity: '1', unit: 'lot', laborCost: '1.00' }] }
    });
    assertSafePublicError(response, 404, 'ESTIMATE_VERSION_NOT_FOUND');

    for (const payload of [
      {
        clientId: CLIENT_B_ID,
        tenderNo: 'FOREIGN-CLIENT-SECURITY',
        title: 'Foreign client blocked',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      },
      {
        clientId: CLIENT_A_ID,
        opportunityId: OPPORTUNITY_B_ID,
        tenderNo: 'FOREIGN-OPPORTUNITY-SECURITY',
        title: 'Foreign opportunity blocked',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      },
      {
        clientId: CLIENT_A_ID,
        tenderNo: 'FOREIGN-OWNER-SECURITY',
        title: 'Foreign owner blocked',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_B_ID,
        currency: 'USD'
      },
      {
        clientId: ARCHIVED_CLIENT_A_ID,
        tenderNo: 'ARCHIVED-CLIENT-SECURITY',
        title: 'Archived client blocked',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    ]) {
      response = await app.inject({
        method: 'POST',
        url: '/api/v1/tenders',
        headers: { authorization: `Bearer ${adminAToken}` },
        payload
      });
      assertSafePublicError(response, 400, 'INVALID_REQUEST');
    }

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: 'UNTRUSTED-TENDER-AUTHORITY',
        title: 'Untrusted authority fields',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD',
        companyId: COMPANY_B_ID,
        status: 'WON'
      }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        items: [{ description: 'Authority field attempt', quantity: '1', unit: 'lot', laborCost: '1.00' }],
        directCost: '1.00',
        tenderTotal: '1.00',
        versionNo: 99,
        status: 'APPROVED'
      }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { approvalDefinitionCode: 'CLIENT-OWNED-APPROVAL' }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/submit`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        estimateVersionId: estimate.id,
        validityDate: '2026-12-31',
        submittedAmount: '0.01',
        submittedBy: ADMIN_B_ID
      }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/outcome`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { outcome: 'WON', status: 'WON', companyId: COMPANY_B_ID }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenders?pageSize=101',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/tenders?dueFrom=2026-12-31&dueTo=2026-01-01',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');
  });
});

test('Module 3 public errors keep validation and business conflicts free of database details', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const readerToken = await signIn(app, 'tender-reader-a@example.test');

    let response = await app.inject({ method: 'GET', url: '/api/v1/tenders' });
    assertSafePublicError(response, 401, 'AUTHENTICATION_REQUIRED');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: 'SAFE-READER-BLOCKED',
        title: 'Safe reader blocked',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assertSafePublicError(response, 403, 'FORBIDDEN');

    const tender = await createTender(app, adminToken, { tenderNo: 'SAFE-ERROR-TENDER' });
    const estimate = await createEstimate(app, adminToken, tender.id);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: tender.tenderNo,
        title: 'Duplicate safe error',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    assertSafePublicError(response, 409, 'DUPLICATE_TENDER_NUMBER');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/tenders/${FOREIGN_TENDER_B_ID}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assertSafePublicError(response, 404, 'TENDER_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { items: [{ description: 'Locked estimate', quantity: '1', unit: 'lot', laborCost: '1.00' }] }
    });
    assertSafePublicError(response, 409, 'ESTIMATE_VERSION_LOCKED');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/tenders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        clientId: CLIENT_A_ID,
        tenderNo: 'SAFE-INVALID-REQUEST',
        title: 'Safe invalid request',
        dueDate: '2026-10-15',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD',
        actorUserId: ADMIN_B_ID
      }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');
  });
});

test('Module 3 database constraints reject invalid values and cross-company relationships', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const baseTender = await client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: 'DB-INTEGRITY-A',
        title: 'Database Integrity Tender A',
        dueDate: new Date('2026-10-15T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    const secondTender = await client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: 'DB-INTEGRITY-B',
        title: 'Database Integrity Tender B',
        dueDate: new Date('2026-10-16T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });

    const siblingClient = await client.client.create({
      data: {
        companyId: COMPANY_A_ID,
        code: 'DB-CLIENT-SIBLING',
        legalName: 'Database Sibling Client Ltd',
        displayName: 'Database Sibling Client',
        billingAddress: 'Islamabad, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      }
    });
    const siblingOpportunity = await client.opportunity.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: siblingClient.id,
        code: 'DB-OPP-SIBLING',
        name: 'Database Sibling Opportunity',
        estimatedValue: '1000.00',
        probability: 50,
        stage: 'QUALIFIED',
        source: 'Referral',
        ownerUserId: ADMIN_A_ID,
        expectedCloseDate: new Date('2026-12-31T00:00:00.000Z')
      }
    });

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: baseTender.tenderNo,
        title: 'Duplicate Tender Number',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_B_ID,
        tenderNo: 'DB-FOREIGN-CLIENT',
        title: 'Cross-company Client',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        opportunityId: OPPORTUNITY_B_ID,
        tenderNo: 'DB-FOREIGN-OPPORTUNITY',
        title: 'Cross-company Opportunity',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        opportunityId: siblingOpportunity.id,
        tenderNo: 'DB-WRONG-CLIENT-OPPORTUNITY',
        title: 'Same-company Wrong-client Opportunity',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: 'DB-FOREIGN-OWNER',
        title: 'Cross-company Owner',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_B_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: 'DB-BAD-STATUS',
        title: 'Invalid Status',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'BROKEN',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    }));

    await assert.rejects(client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        tenderNo: 'DB-BAD-CURRENCY',
        title: 'Invalid Currency',
        dueDate: new Date('2026-10-17T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'usd'
      }
    }));

    await assert.rejects(client.estimateVersion.create({
      data: {
        tenderId: baseTender.id,
        versionNo: 0,
        status: 'DRAFT',
        directCost: '0.00',
        indirectCost: '0.00',
        contingency: '0.00',
        markup: '0.00',
        tenderTotal: '0.00',
        createdBy: ADMIN_A_ID
      }
    }));

    await assert.rejects(client.estimateVersion.create({
      data: {
        tenderId: baseTender.id,
        versionNo: 1,
        status: 'BROKEN',
        directCost: '0.00',
        indirectCost: '0.00',
        contingency: '0.00',
        markup: '0.00',
        tenderTotal: '0.00',
        createdBy: ADMIN_A_ID
      }
    }));

    await assert.rejects(client.estimateVersion.create({
      data: {
        tenderId: baseTender.id,
        versionNo: 1,
        status: 'DRAFT',
        directCost: '-1.00',
        indirectCost: '0.00',
        contingency: '0.00',
        markup: '0.00',
        tenderTotal: '0.00',
        createdBy: ADMIN_A_ID
      }
    }));

    const versionA = await client.estimateVersion.create({
      data: {
        tenderId: baseTender.id,
        versionNo: 1,
        status: 'FINAL',
        directCost: '10.00',
        indirectCost: '0.00',
        contingency: '0.00',
        markup: '0.00',
        tenderTotal: '10.00',
        createdBy: ADMIN_A_ID
      }
    });
    const versionB = await client.estimateVersion.create({
      data: {
        tenderId: secondTender.id,
        versionNo: 1,
        status: 'FINAL',
        directCost: '20.00',
        indirectCost: '0.00',
        contingency: '0.00',
        markup: '0.00',
        tenderTotal: '20.00',
        createdBy: ADMIN_A_ID
      }
    });
    const parent = await client.estimateItem.create({
      data: {
        estimateVersionId: versionA.id,
        description: 'Parent item',
        quantity: '1.0000',
        unit: 'lot',
        laborCost: '1.00'
      }
    });

    await assert.rejects(client.estimateItem.create({
      data: {
        estimateVersionId: versionA.id,
        description: 'Negative cost item',
        quantity: '1.0000',
        unit: 'lot',
        laborCost: '-1.00'
      }
    }));

    await assert.rejects(client.estimateItem.create({
      data: {
        estimateVersionId: versionB.id,
        parentId: parent.id,
        description: 'Wrong-version child item',
        quantity: '1.0000',
        unit: 'lot',
        laborCost: '1.00'
      }
    }));

    await assert.rejects(client.tenderSubmission.create({
      data: {
        tenderId: baseTender.id,
        estimateVersionId: versionB.id,
        submittedBy: ADMIN_A_ID,
        submittedAmount: '20.00',
        validityDate: new Date('2026-12-31T00:00:00.000Z'),
        outcome: 'PENDING'
      }
    }));

    await assert.rejects(client.tenderSubmission.create({
      data: {
        tenderId: baseTender.id,
        estimateVersionId: versionA.id,
        submittedBy: ADMIN_A_ID,
        submittedAmount: '10.00',
        validityDate: new Date('2026-12-31T00:00:00.000Z'),
        outcome: 'BROKEN'
      }
    }));
  });
});

test('Module 3 operational concurrency serializes version, finalization, submission and outcome retries', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const tender = await createTender(app, adminToken, { tenderNo: 'OPS-CONCURRENCY-001' });

    const versions = await Promise.all([
      createEstimate(app, adminToken, tender.id),
      createEstimate(app, adminToken, tender.id)
    ]);
    assert.deepEqual(versions.map((version) => version.versionNo).sort((left, right) => left - right), [1, 2]);

    const estimate = versions.find((version) => version.versionNo === 1);
    assert.ok(estimate);

    const finalizeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      })
    ]);
    assert.deepEqual(finalizeResponses.map((response) => response.statusCode).sort(), [200, 409]);
    assert.equal(errorCode(finalizeResponses.find((response) => response.statusCode === 409)), 'ESTIMATE_VERSION_LOCKED');
    assert.equal(await client.auditLog.count({ where: { entityId: estimate.id, action: 'estimate.finalized' } }), 1);

    const submissionPayload = { estimateVersionId: estimate.id, validityDate: '2026-12-31' };
    const submitResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/submit`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: submissionPayload
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/submit`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: submissionPayload
      })
    ]);
    assert.equal(submitResponses[0].statusCode, 200, submitResponses[0].body);
    assert.equal(submitResponses[1].statusCode, 200, submitResponses[1].body);
    assert.equal(submitResponses[0].json().data.submission.id, submitResponses[1].json().data.submission.id);
    assert.equal(await client.tenderSubmission.count({ where: { tenderId: tender.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: tender.id, action: 'tender.submitted' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: tender.id, eventType: 'tender.submitted' } }), 1);

    const outcomeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/outcome`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { outcome: 'WON', reason: 'Concurrent retry proof' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/outcome`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { outcome: 'WON', reason: 'Concurrent retry proof' }
      })
    ]);
    assert.equal(outcomeResponses[0].statusCode, 200, outcomeResponses[0].body);
    assert.equal(outcomeResponses[1].statusCode, 200, outcomeResponses[1].body);
    assert.equal(outcomeResponses[0].json().data.tender.status, 'WON');
    assert.equal(outcomeResponses[1].json().data.tender.status, 'WON');
    assert.equal(await client.auditLog.count({ where: { entityId: tender.id, action: 'tender.outcome_recorded' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: tender.id, eventType: 'tender.won' } }), 1);
  });
});

test('Module 3 operational approval concurrency creates one durable approval request', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    await seedEstimateApprovalDefinition(client);
    const adminToken = await signIn(app, 'tender-admin-a@example.test');
    const tender = await createTender(app, adminToken, { tenderNo: 'OPS-APPROVAL-001' });
    const estimate = await createEstimate(app, adminToken, tender.id);

    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/tenders/${tender.id}/estimates/${estimate.id}/finalize`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {}
      })
    ]);

    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [200, 409]);
    const successful = responses.find((response) => response.statusCode === 200);
    const blocked = responses.find((response) => response.statusCode === 409);
    assert.equal(successful.json().data.status, 'PENDING_APPROVAL');
    assert.equal(errorCode(blocked), 'ESTIMATE_VERSION_LOCKED');
    assert.equal(await client.approvalRequest.count({ where: { resourceId: estimate.id } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: estimate.id, action: 'estimate.finalized' } }), 1);
  }, { approvalDefinitionCode: APPROVAL_DEFINITION_CODE });
});

test('Module 3 operational query plans use reviewed indexes for bounded Tender and estimate reads', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const baseDate = new Date('2026-10-01T00:00:00.000Z');
    const tenders = Array.from({ length: 2400 }, (_, index) => ({
      companyId: COMPANY_A_ID,
      clientId: CLIENT_A_ID,
      opportunityId: null,
      tenderNo: `OPS-PERF-${String(index).padStart(5, '0')}`,
      title: `Operational query-plan tender ${index}`,
      dueDate: new Date(baseDate.getTime() + (index % 60) * 86_400_000),
      status: ['DRAFT', 'SUBMITTED', 'WON', 'LOST'][index % 4],
      ownerUserId: ADMIN_A_ID,
      currency: 'USD'
    }));
    await client.tender.createMany({ data: tenders });
    await client.$executeRawUnsafe('ANALYZE tenders');

    const tenderPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id
      FROM tenders
      WHERE company_id = '${COMPANY_A_ID}'::uuid
        AND status = 'SUBMITTED'
        AND due_date BETWEEN DATE '2026-10-10' AND DATE '2026-10-20'
      ORDER BY due_date ASC
      LIMIT 50
    `);
    const tenderPlan = JSON.stringify(tenderPlanRows);
    assert.match(tenderPlan, /tenders_company_status_due_idx/);
    assert.match(tenderPlan, /Execution Time/);

    const tender = await client.tender.create({
      data: {
        companyId: COMPANY_A_ID,
        clientId: CLIENT_A_ID,
        opportunityId: null,
        tenderNo: 'OPS-PERF-ESTIMATES',
        title: 'Operational estimate query-plan tender',
        dueDate: new Date('2026-12-31T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_A_ID,
        currency: 'USD'
      }
    });
    await client.estimateVersion.createMany({
      data: Array.from({ length: 300 }, (_, index) => ({
        tenderId: tender.id,
        versionNo: index + 1,
        status: index % 2 === 0 ? 'FINAL' : 'DRAFT',
        directCost: '100.00',
        indirectCost: '10.00',
        contingency: '5.00',
        markup: '5.00',
        tenderTotal: '120.00',
        createdBy: ADMIN_A_ID
      }))
    });
    await client.$executeRawUnsafe('ANALYZE estimate_versions');

    const estimatePlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, version_no
      FROM estimate_versions
      WHERE tender_id = '${tender.id}'::uuid
        AND status = 'FINAL'
      ORDER BY version_no DESC
      LIMIT 1
    `);
    const estimatePlan = JSON.stringify(estimatePlanRows);
    assert.match(estimatePlan, /estimate_versions_tender_status_version_idx/);
    assert.match(estimatePlan, /Execution Time/);
  });
});

test('Module 3 database exposes the reviewed tenant, lifecycle and worksheet indexes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const rows = await client.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('tenders', 'estimate_versions', 'estimate_items', 'tender_submissions')
    `);
    const names = new Set(rows.map((row) => row.indexname));

    for (const indexName of [
      'tenders_company_tender_no_uq',
      'tenders_id_company_uq',
      'tenders_company_status_due_idx',
      'tenders_company_client_created_idx',
      'tenders_company_owner_status_idx',
      'tenders_company_opportunity_idx',
      'estimate_versions_tender_version_uq',
      'estimate_versions_id_tender_uq',
      'estimate_versions_tender_status_version_idx',
      'estimate_versions_creator_created_idx',
      'estimate_items_id_version_uq',
      'estimate_items_version_parent_idx',
      'tender_submissions_tender_uq',
      'tender_submissions_estimate_version_idx',
      'tender_submissions_submitter_submitted_idx',
      'tender_submissions_outcome_submitted_idx'
    ]) {
      assert.equal(names.has(indexName), true, indexName);
    }
  });
});

