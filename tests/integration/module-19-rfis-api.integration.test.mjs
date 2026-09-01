import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000019101';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000019102';
const ADMIN_ID = '00000000-0000-4000-8000-000000019110';
const RESPONDER_ID = '00000000-0000-4000-8000-000000019111';
const READER_ID = '00000000-0000-4000-8000-000000019112';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000019113';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000019120';
const RESPONDER_ROLE_ID = '00000000-0000-4000-8000-000000019121';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000019122';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000019123';
const CLIENT_ID = '00000000-0000-4000-8000-000000019130';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000019131';
const PROJECT_ID = '00000000-0000-4000-8000-000000019140';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000019141';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000019142';
const DOCUMENT_ID = '00000000-0000-4000-8000-000000019150';
const DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019151';
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000019152';
const OTHER_DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019153';
const FOREIGN_DOCUMENT_ID = '00000000-0000-4000-8000-000000019154';
const FOREIGN_DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019155';
const PASSWORD = 'Module19-pass-400-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module19-rfi-auth-secret-0123456789abcdef';

const RFI_PERMISSIONS = [
  'rfi.read',
  'rfi.create',
  'rfi.respond',
  'rfi.close'
];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest two-company Project/RBAC/Document graph needed by Module-19 RFI verification. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      { id: COMPANY_ID, legalName: 'Module 19 RFI Company Ltd', displayName: 'Module 19 RFI Company', status: 'ACTIVE', baseCurrency: 'USD', timeZone: 'UTC', locale: 'en-US', fiscalSettings: { fiscalYearStartMonth: 1 } },
      { id: COMPANY_B_ID, legalName: 'Module 19 RFI Foreign Ltd', displayName: 'Module 19 RFI Foreign', status: 'ACTIVE', baseCurrency: 'USD', timeZone: 'UTC', locale: 'en-US', fiscalSettings: { fiscalYearStartMonth: 1 } }
    ]
  });

  const permissionRows = [];
  for (const code of RFI_PERMISSIONS) {
    permissionRows.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'rfi-submittals' },
      create: { code, name: code, domain: 'rfi-submittals' }
    }));
  }
  const permissionByCode = new Map(permissionRows.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({ data: [
    { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-rfi-admin', name: 'Module 19 RFI Admin', isSystem: false, status: 'ACTIVE' },
    { id: RESPONDER_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-rfi-responder', name: 'Module 19 RFI Responder', isSystem: false, status: 'ACTIVE' },
    { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-rfi-reader', name: 'Module 19 RFI Reader', isSystem: false, status: 'ACTIVE' },
    { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-19-rfi-admin', name: 'Module 19 RFI Foreign Admin', isSystem: false, status: 'ACTIVE' }
  ] });

  await client.rolePermission.createMany({ data: [
    ...RFI_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
    { roleId: RESPONDER_ROLE_ID, permissionId: permissionByCode.get('rfi.read') },
    { roleId: RESPONDER_ROLE_ID, permissionId: permissionByCode.get('rfi.respond') },
    { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('rfi.read') },
    ...RFI_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
  ] });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module19-rfi-admin@example.test', name: 'Module 19 RFI Admin' },
    { id: RESPONDER_ID, companyId: COMPANY_ID, email: 'module19-rfi-responder@example.test', name: 'Module 19 RFI Responder' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module19-rfi-reader@example.test', name: 'Module 19 RFI Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module19-rfi-admin-b@example.test', name: 'Module 19 RFI Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({ data: [
    { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, userId: RESPONDER_ID, roleId: RESPONDER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
  ] });

  await client.client.createMany({ data: [
    { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M19-RFI-CLIENT', legalName: 'Module 19 RFI Client Ltd', displayName: 'Module 19 RFI Client', billingAddress: 'Lahore', status: 'ACTIVE', creditTermsDays: 30 },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M19-RFI-CLIENT-B', legalName: 'Module 19 RFI Foreign Client Ltd', displayName: 'Module 19 RFI Foreign Client', billingAddress: 'Karachi', status: 'ACTIVE', creditTermsDays: 30 }
  ] });

  await client.project.createMany({ data: [
    { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M19-RFI-A', name: 'Module 19 RFI Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_ID, location: 'Lahore' },
    { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M19-RFI-OTHER', name: 'Module 19 RFI Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_ID, location: 'Islamabad' },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M19-RFI-B', name: 'Module 19 RFI Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi' }
  ] });

  await client.projectMember.createMany({ data: [
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: ADMIN_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: RESPONDER_ID, projectRole: 'SITE_ENGINEER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'VIEWER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, userId: ADMIN_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, userId: ADMIN_B_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate }
  ] });

  await client.numberSequence.createMany({ data: [
    { companyId: COMPANY_ID, sequenceKey: 'rfi', prefix: 'RFI-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, sequenceKey: 'rfi', prefix: 'RFIB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  ] });

  const documents = [
    { id: DOCUMENT_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, title: 'Project RFI Response Document', status: 'ACTIVE', ownerUserId: ADMIN_ID },
    { id: OTHER_DOCUMENT_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, title: 'Other Project RFI Document', status: 'ACTIVE', ownerUserId: ADMIN_ID },
    { id: FOREIGN_DOCUMENT_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, title: 'Foreign Project RFI Document', status: 'ACTIVE', ownerUserId: ADMIN_B_ID }
  ];
  await client.document.createMany({ data: documents.map((document) => ({ ...document, category: 'rfi' })) });
  await client.documentVersion.createMany({ data: [
    { id: DOCUMENT_VERSION_ID, documentId: DOCUMENT_ID, versionNo: 1, storageKey: 'm19/rfi/project/response-v1.pdf', originalName: 'response-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'd'.repeat(64), uploadedBy: ADMIN_ID },
    { id: OTHER_DOCUMENT_VERSION_ID, documentId: OTHER_DOCUMENT_ID, versionNo: 1, storageKey: 'm19/rfi/other/response-v1.pdf', originalName: 'other-response-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'e'.repeat(64), uploadedBy: ADMIN_ID },
    { id: FOREIGN_DOCUMENT_VERSION_ID, documentId: FOREIGN_DOCUMENT_ID, versionNo: 1, storageKey: 'm19/rfi/foreign/response-v1.pdf', originalName: 'foreign-response-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'f'.repeat(64), uploadedBy: ADMIN_B_ID }
  ] });
  await client.document.update({ where: { id: DOCUMENT_ID }, data: { currentVersionId: DOCUMENT_VERSION_ID } });
  await client.document.update({ where: { id: OTHER_DOCUMENT_ID }, data: { currentVersionId: OTHER_DOCUMENT_VERSION_ID } });
  await client.document.update({ where: { id: FOREIGN_DOCUMENT_ID }, data: { currentVersionId: FOREIGN_DOCUMENT_VERSION_ID } });
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
    app = runtime.buildApp({ database: client, nodeEnv: 'test', logLevel: 'silent', authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET });
    await app.ready();
    await work({ ...runtime, app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Sign in one seeded Module-19 RFI user through the real Module-24A authentication route. */
async function signIn(app, email = 'module19-rfi-admin@example.test') {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password: PASSWORD } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Send one idempotent RFI command through the real Fastify boundary. */
async function rfiWrite(app, token, url, payload, key) {
  const request = {
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key }
  };
  if (payload !== undefined) request.payload = payload;
  return app.inject(request);
}

/** Create one RFI through the public API and return the normalized response data. */
async function createRfi(app, token, overrides = {}, key = 'module19-rfi-create') {
  const projectId = overrides.projectId ?? PROJECT_ID;
  const response = await rfiWrite(app, token, `/api/v1/projects/${projectId}/rfis`, {
    subject: overrides.subject ?? 'Foundation wall opening clarification',
    question: overrides.question ?? 'Please confirm the approved opening dimension before reinforcement fixing.',
    discipline: overrides.discipline ?? 'STRUCTURAL',
    assignedTo: overrides.assignedTo ?? RESPONDER_ID,
    dueDate: overrides.dueDate ?? '2026-12-31'
  }, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Install a disposable trigger that forces one Module-19 RFI outbox event to fail inside its transaction. */
async function installOutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_19_rfi_test_fail_outbox_event()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 19 RFI forced outbox failure for %', TG_ARGV[0] USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_19_rfi_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_19_rfi_test_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW EXECUTE FUNCTION module_19_rfi_test_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-19 RFI outbox failure trigger and helper function. */
async function removeOutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_19_rfi_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_19_rfi_test_fail_outbox_event()');
}

test('Module 19 RFI live workflow covers create/list/respond/close/reopen and closed-response protection', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const responderToken = await signIn(app, 'module19-rfi-responder@example.test');
    const created = await createRfi(app, adminToken);
    assert.equal(created.projectId, PROJECT_ID);
    assert.equal(created.status, 'OPEN');
    assert.equal(created.raisedBy, ADMIN_ID);
    assert.equal(created.assignedTo, RESPONDER_ID);

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/rfis?page=1&pageSize=20&status=OPEN`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, created.id);

    response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'Use the coordinated 1200 mm clear opening shown on the issued detail.',
      documentId: DOCUMENT_ID
    }, 'm19-rfi-respond-1');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.response.responderUserId, RESPONDER_ID);
    assert.equal(response.json().data.response.responseType, 'RESPONSE');
    assert.equal(response.json().data.response.documentId, DOCUMENT_ID);

    response = await rfiWrite(app, adminToken, `/api/v1/rfis/${created.id}/close`, undefined, 'm19-rfi-close-1');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CLOSED');
    assert.ok(response.json().data.closedAt);

    response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'This response must be rejected while the RFI is closed.'
    }, 'm19-rfi-closed-response');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'RFI_RESPONSE_NOT_ALLOWED');

    response = await rfiWrite(app, adminToken, `/api/v1/rfis/${created.id}/reopen`, {
      reason: 'Issued detail was superseded and further clarification is required.'
    }, 'm19-rfi-reopen-1');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'OPEN');
    assert.equal(response.json().data.closedAt, null);

    response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'The revised coordinated detail confirms the updated opening.'
    }, 'm19-rfi-respond-2');
    assert.equal(response.statusCode, 201, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/rfis/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, created.id);
    assert.equal(response.json().data.responses.length, 2);
    assert.equal(response.json().data.responses[0].documentId, DOCUMENT_ID);
    assert.equal(response.json().data.responses[1].documentId, null);

    assert.equal(await client.rfiResponse.count({ where: { rfiId: created.id } }), 2);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, entityId: created.id, action: 'rfi.closed' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, entityId: created.id, action: 'rfi.reopened' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfi.closed', resourceId: created.id } }), 1);
  });
});

test('Module 19 RFI idempotency replays create/respond/close/reopen without duplicate durable effects', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const responderToken = await signIn(app, 'module19-rfi-responder@example.test');
    const createPayload = {
      subject: 'Idempotent RFI',
      question: 'Confirm the approved detail.',
      discipline: 'ARCHITECTURAL',
      assignedTo: RESPONDER_ID,
      dueDate: '2026-12-31'
    };

    const createFirst = await rfiWrite(app, adminToken, `/api/v1/projects/${PROJECT_ID}/rfis`, createPayload, 'm19-rfi-idem-create');
    const createReplay = await rfiWrite(app, adminToken, `/api/v1/projects/${PROJECT_ID}/rfis`, createPayload, 'm19-rfi-idem-create');
    assert.equal(createFirst.statusCode, 201, createFirst.body);
    assert.equal(createReplay.statusCode, 201, createReplay.body);
    const rfiId = createFirst.json().data.id;
    assert.equal(createReplay.json().data.id, rfiId);
    assert.equal(await client.rfi.count({ where: { id: rfiId } }), 1);

    const respondPayload = { response: 'Approved detail confirmed.', documentId: DOCUMENT_ID };
    const respondFirst = await rfiWrite(app, responderToken, `/api/v1/rfis/${rfiId}/respond`, respondPayload, 'm19-rfi-idem-respond');
    const respondReplay = await rfiWrite(app, responderToken, `/api/v1/rfis/${rfiId}/respond`, respondPayload, 'm19-rfi-idem-respond');
    assert.equal(respondFirst.statusCode, 201, respondFirst.body);
    assert.equal(respondReplay.statusCode, 201, respondReplay.body);
    assert.equal(respondReplay.json().data.response.id, respondFirst.json().data.response.id);
    assert.equal(await client.rfiResponse.count({ where: { rfiId } }), 1);

    const closeFirst = await rfiWrite(app, adminToken, `/api/v1/rfis/${rfiId}/close`, undefined, 'm19-rfi-idem-close');
    const closeReplay = await rfiWrite(app, adminToken, `/api/v1/rfis/${rfiId}/close`, undefined, 'm19-rfi-idem-close');
    assert.equal(closeFirst.statusCode, 200, closeFirst.body);
    assert.equal(closeReplay.statusCode, 200, closeReplay.body);
    assert.equal(closeReplay.json().data.closedAt, closeFirst.json().data.closedAt);

    const reopenPayload = { reason: 'Need one controlled follow-up response.' };
    const reopenFirst = await rfiWrite(app, adminToken, `/api/v1/rfis/${rfiId}/reopen`, reopenPayload, 'm19-rfi-idem-reopen');
    const reopenReplay = await rfiWrite(app, adminToken, `/api/v1/rfis/${rfiId}/reopen`, reopenPayload, 'm19-rfi-idem-reopen');
    assert.equal(reopenFirst.statusCode, 200, reopenFirst.body);
    assert.equal(reopenReplay.statusCode, 200, reopenReplay.body);
    assert.equal(reopenReplay.json().data.status, 'OPEN');

    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'rfi.created', entityId: rfiId } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'rfi.closed', entityId: rfiId } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'rfi.reopened', entityId: rfiId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfi.created', resourceId: rfiId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfi.closed', resourceId: rfiId } }), 1);
  });
});

test('Module 19 RFI security blocks cross-company/Project scope, invalid assignee/Document scope and missing mutation permission', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const responderToken = await signIn(app, 'module19-rfi-responder@example.test');
    const readerToken = await signIn(app, 'module19-rfi-reader@example.test');
    const foreignToken = await signIn(app, 'module19-rfi-admin-b@example.test');

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/projects/${PROJECT_ID}/rfis?page=1&pageSize=20`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.ok([403, 404].includes(response.statusCode), response.body);

    response = await rfiWrite(app, foreignToken, `/api/v1/projects/${PROJECT_ID}/rfis`, {
      subject: 'Foreign Project write',
      question: 'This must not cross the Company boundary.',
      discipline: 'STRUCTURAL',
      assignedTo: ADMIN_B_ID,
      dueDate: '2026-12-31'
    }, 'm19-rfi-foreign-project');
    assert.ok([403, 404].includes(response.statusCode), response.body);

    response = await rfiWrite(app, adminToken, `/api/v1/projects/${PROJECT_ID}/rfis`, {
      subject: 'Foreign assignee',
      question: 'This assignee must be rejected.',
      discipline: 'STRUCTURAL',
      assignedTo: ADMIN_B_ID,
      dueDate: '2026-12-31'
    }, 'm19-rfi-foreign-assignee');
    assert.equal(response.statusCode, 400, response.body);

    response = await rfiWrite(app, readerToken, `/api/v1/projects/${PROJECT_ID}/rfis`, {
      subject: 'Reader create',
      question: 'Reader must not create.',
      discipline: 'STRUCTURAL',
      assignedTo: READER_ID,
      dueDate: '2026-12-31'
    }, 'm19-rfi-reader-create');
    assert.equal(response.statusCode, 403, response.body);

    const created = await createRfi(app, adminToken, {}, 'm19-rfi-security-create');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/rfis/${created.id}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/rfis/${created.id}`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.ok([403, 404].includes(response.statusCode), response.body);

    response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'Attempt with an other-Project Document.',
      documentId: OTHER_DOCUMENT_ID
    }, 'm19-rfi-wrong-document');
    assert.equal(response.statusCode, 400, response.body);

    response = await rfiWrite(app, readerToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'Reader must not respond.'
    }, 'm19-rfi-reader-respond');
    assert.equal(response.statusCode, 403, response.body);

    response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/close`, undefined, 'm19-rfi-responder-close');
    assert.equal(response.statusCode, 403, response.body);
  });
});

test('Module 19 RFI concurrent creation preserves collision-free numbering', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const [first, second] = await Promise.all([
      createRfi(app, adminToken, { subject: 'Concurrent RFI A' }, 'm19-rfi-concurrent-a'),
      createRfi(app, adminToken, { subject: 'Concurrent RFI B' }, 'm19-rfi-concurrent-b')
    ]);
    assert.notEqual(first.rfiNo, second.rfiNo);
    assert.equal(await client.rfi.count({ where: { projectId: PROJECT_ID } }), 2);
    const stored = await client.rfi.findMany({ where: { projectId: PROJECT_ID }, select: { rfiNo: true } });
    assert.equal(new Set(stored.map((row) => row.rfiNo)).size, 2);
  });
});

test('Module 19 RFI database keeps response evidence append-only', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const responderToken = await signIn(app, 'module19-rfi-responder@example.test');
    const created = await createRfi(app, adminToken, {}, 'm19-rfi-append-create');
    const response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
      response: 'Permanent historical response evidence.'
    }, 'm19-rfi-append-response');
    assert.equal(response.statusCode, 201, response.body);
    const responseId = response.json().data.response.id;
    await assert.rejects(() => client.rfiResponse.update({ where: { id: responseId }, data: { response: 'mutated' } }), /append-only|55000/i);
    await assert.rejects(() => client.rfiResponse.delete({ where: { id: responseId } }), /append-only|55000/i);
  });
});

test('Module 19 RFI transaction rollback removes response and audit evidence when durable outbox insertion fails', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const responderToken = await signIn(app, 'module19-rfi-responder@example.test');
    const created = await createRfi(app, adminToken, {}, 'm19-rfi-rollback-create');
    await installOutboxFailure(client, 'rfi.responded');
    try {
      const response = await rfiWrite(app, responderToken, `/api/v1/rfis/${created.id}/respond`, {
        response: 'This response must roll back with the failed outbox write.'
      }, 'm19-rfi-rollback-response');
      assert.equal(response.statusCode, 500, response.body);
      assert.equal(await client.rfiResponse.count({ where: { rfiId: created.id } }), 0);
      assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'rfi.responded' } }), 0);
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'rfi.responded' } }), 0);
      const stored = await client.rfi.findUniqueOrThrow({ where: { id: created.id } });
      assert.equal(stored.status, 'OPEN');
    } finally {
      await removeOutboxFailure(client);
    }
  });
});
