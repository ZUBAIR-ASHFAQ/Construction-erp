import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000004000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000004100';
const ADMIN_ID = '00000000-0000-4000-8000-000000004010';
const READER_ID = '00000000-0000-4000-8000-000000004011';
const CREATOR_ID = '00000000-0000-4000-8000-000000004012';
const EDITOR_ID = '00000000-0000-4000-8000-000000004013';
const FREEZER_ID = '00000000-0000-4000-8000-000000004014';
const EXPORTER_ID = '00000000-0000-4000-8000-000000004015';
const NO_PERMISSION_ID = '00000000-0000-4000-8000-000000004016';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000004110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000004020';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000004021';
const CREATOR_ROLE_ID = '00000000-0000-4000-8000-000000004022';
const EDITOR_ROLE_ID = '00000000-0000-4000-8000-000000004023';
const FREEZER_ROLE_ID = '00000000-0000-4000-8000-000000004024';
const EXPORTER_ROLE_ID = '00000000-0000-4000-8000-000000004025';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000004120';
const CLIENT_ID = '00000000-0000-4000-8000-000000004030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000004130';
const TENDER_ID = '00000000-0000-4000-8000-000000004040';
const TENDER_B_ID = '00000000-0000-4000-8000-000000004140';
const PASSWORD = 'Module4a-pass-129-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const MODULE_4A_PERMISSIONS = [
  'boq.read',
  'boq.create',
  'boq.edit',
  'boq.freeze',
  'boq.export'
];

let contextCounter = 0;

/** Load built runtime packages only when the disposable live database gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  const { BoqRepository, BoqService } = await import('../../apps/api/dist/modules/boq/index.js');
  return { testing, buildApp, hashPassword, BoqRepository, BoqService };
}

/** Seed two companies plus the exact Module 4A permission principals and Tender scope used by integration tests. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 4A Company Ltd',
        displayName: 'Module 4A Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 4A Foreign Company Ltd',
        displayName: 'Module 4A Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_4A_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'boq' },
      create: { code, name: code, domain: 'boq' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'boq-admin', name: 'BOQ Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-reader', name: 'BOQ Reader', isSystem: false, status: 'ACTIVE' },
      { id: CREATOR_ROLE_ID, companyId: COMPANY_ID, code: 'boq-creator', name: 'BOQ Creator', isSystem: false, status: 'ACTIVE' },
      { id: EDITOR_ROLE_ID, companyId: COMPANY_ID, code: 'boq-editor', name: 'BOQ Editor', isSystem: false, status: 'ACTIVE' },
      { id: FREEZER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-freezer', name: 'BOQ Freezer', isSystem: false, status: 'ACTIVE' },
      { id: EXPORTER_ROLE_ID, companyId: COMPANY_ID, code: 'boq-exporter', name: 'BOQ Exporter', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'boq-admin', name: 'BOQ Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_4A_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_4A_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('boq.read') },
      { roleId: CREATOR_ROLE_ID, permissionId: permissionByCode.get('boq.create') },
      { roleId: EDITOR_ROLE_ID, permissionId: permissionByCode.get('boq.edit') },
      { roleId: FREEZER_ROLE_ID, permissionId: permissionByCode.get('boq.freeze') },
      { roleId: EXPORTER_ROLE_ID, permissionId: permissionByCode.get('boq.export') }
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'boq-admin@example.test', name: 'BOQ Admin' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'boq-reader@example.test', name: 'BOQ Reader' },
    { id: CREATOR_ID, companyId: COMPANY_ID, email: 'boq-creator@example.test', name: 'BOQ Creator' },
    { id: EDITOR_ID, companyId: COMPANY_ID, email: 'boq-editor@example.test', name: 'BOQ Editor' },
    { id: FREEZER_ID, companyId: COMPANY_ID, email: 'boq-freezer@example.test', name: 'BOQ Freezer' },
    { id: EXPORTER_ID, companyId: COMPANY_ID, email: 'boq-exporter@example.test', name: 'BOQ Exporter' },
    { id: NO_PERMISSION_ID, companyId: COMPANY_ID, email: 'boq-no-permission@example.test', name: 'BOQ No Permission' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'boq-admin-b@example.test', name: 'BOQ Admin B' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({
    data: users.map((user) => ({ userId: user.id, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: CREATOR_ID, roleId: CREATOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: EDITOR_ID, roleId: EDITOR_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: FREEZER_ID, roleId: FREEZER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: EXPORTER_ID, roleId: EXPORTER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'BOQ-CLIENT-001',
        legalName: 'BOQ Client Ltd',
        displayName: 'BOQ Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'BOQ-CLIENT-B-001',
        legalName: 'BOQ Foreign Client Ltd',
        displayName: 'BOQ Foreign Client',
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
        tenderNo: 'TENDER-BOQ-001',
        title: 'Tender ready for BOQ',
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
        tenderNo: 'TENDER-BOQ-B-001',
        title: 'Foreign Tender ready for BOQ',
        dueDate: new Date('2026-11-30T00:00:00.000Z'),
        status: 'DRAFT',
        ownerUserId: ADMIN_B_ID,
        currency: 'USD'
      }
    ]
  });
}

/** Build one fresh Fastify app over the disposable PostgreSQL database. */
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

/** Sign in through Module 24A and return the server-issued access token. */
async function signIn(app, email = 'boq-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one Stage-6 Tender-linked BOQ through the public HTTP API. */
async function createBoq(app, token, code = 'BOQ-A-001', tenderId = TENDER_ID) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/boqs',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      tenderId,
      code,
      title: `${code} Commercial BOQ`,
      currency: 'usd'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create the next server-numbered BOQ revision through the public HTTP API. */
async function createRevision(app, token, boqId, effectiveDate = '2026-09-01') {
  const response = await app.inject({
    method: 'POST',
    url: `/api/v1/boqs/${boqId}/revisions`,
    headers: { authorization: `Bearer ${token}` },
    payload: { effectiveDate, notes: 'Reviewed commercial revision' }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Replace one complete DRAFT item set and return the server-calculated revision detail. */
async function replaceItems(app, token, boqId, revisionId, items) {
  return app.inject({
    method: 'PUT',
    url: `/api/v1/boqs/${boqId}/revisions/${revisionId}/items`,
    headers: { authorization: `Bearer ${token}` },
    payload: { items }
  });
}

/** Return the stable public error code from one Fastify response. */
function errorCode(response) {
  return response.json().error.code;
}

/** Verify one public error is stable and does not expose SQL, Prisma or runtime details. */
function assertSafePublicError(response, expectedStatus, expectedCode) {
  assert.equal(response.statusCode, expectedStatus, response.body);
  assert.equal(errorCode(response), expectedCode);

  const body = response.body.toLowerCase();
  for (const forbidden of ['prisma', 'p2002', 'postgresql', 'stack', 'select ', 'insert into ', 'update ']) {
    assert.equal(body.includes(forbidden), false, `public error leaked: ${forbidden}`);
  }
}

/** Run one direct repository/service assertion under trusted authenticated company context. */
async function runInCompanyContext(runtime, input, work) {
  contextCounter += 1;
  return runtime.testing.runWithAuthenticatedTestContext({
    requestId: `module-4a-security-${contextCounter}`,
    correlationId: `module-4a-security-${contextCounter}`,
    actorUserId: input.actorUserId,
    companyId: input.companyId,
    permissions: input.permissions,
    projectScope: { kind: 'not-resolved' }
  }, work);
}

test('Module 4A full PostgreSQL/Fastify workflow persists hierarchy, server totals, freeze, export, audit and outbox', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data, { items: [], total: 0, page: 1, pageSize: 10 });

    const boq = await createBoq(app, token);
    assert.equal(boq.tenderId, TENDER_ID);
    assert.equal(boq.currency, 'USD');
    assert.equal(boq.status, 'ACTIVE');
    assert.equal(boq.currentRevisionId, null);
    assert.equal(Object.hasOwn(boq, 'companyId'), false);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs?tenderId=${TENDER_ID}&search=BOQ-A&page=1&pageSize=10`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, boq.id);

    const revision = await createRevision(app, token, boq.id);
    assert.equal(revision.revisionNo, 1);
    assert.equal(revision.status, 'DRAFT');
    assert.equal(revision.approvedBy, null);

    response = await replaceItems(app, token, boq.id, revision.id, [
      {
        rowKey: 'section-1',
        itemCode: 'SEC-001',
        description: '=SUM(1,1)',
        unit: 'lot',
        quantity: '2.5000',
        rate: '100.1250'
      },
      {
        rowKey: 'item-1',
        parentRowKey: 'section-1',
        itemCode: 'ITEM-001',
        description: 'Concrete works',
        unit: 'm3',
        quantity: '3.3333',
        rate: '10.0050'
      }
    ]);
    assert.equal(response.statusCode, 200, response.body);

    const details = response.json().data;
    assert.equal(details.totalAmount, '283.66');
    assert.equal(details.items.length, 2);
    const section = details.items.find((item) => item.itemCode === 'SEC-001');
    const child = details.items.find((item) => item.itemCode === 'ITEM-001');
    assert.ok(section);
    assert.ok(child);
    assert.equal(section.amount, '250.31');
    assert.equal(section.parentId, null);
    assert.equal(child.amount, '33.35');
    assert.equal(child.parentId, section.id);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.revision.status, 'FROZEN');
    assert.equal(response.json().data.revision.approvedBy, ADMIN_ID);
    assert.equal(response.json().data.totalAmount, '283.66');

    const storedBoq = await client.boq.findUnique({ where: { id: boq.id } });
    assert.equal(storedBoq.currentRevisionId, revision.id);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await replaceItems(app, token, boq.id, revision.id, [{
      rowKey: 'locked',
      itemCode: 'LOCKED-001',
      description: 'Frozen rows cannot be replaced',
      unit: 'lot',
      quantity: '1.0000',
      rate: '1.0000'
    }]);
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BOQ_REVISION_LOCKED');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/export`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const exportData = response.json().data;
    assert.equal(exportData.fileName, 'BOQ-A-001-revision-1.csv');
    assert.equal(exportData.mimeType, 'text/csv');
    assert.match(exportData.content, /item_code,parent_id,description,unit,quantity,rate,amount/);
    assert.ok(exportData.content.includes('"\'=SUM(1,1)"'));
    assert.match(exportData.content, /"250\.31"/);
    assert.match(exportData.content, /"33\.35"/);

    const storedItems = await client.boqItem.findMany({
      where: { boqRevisionId: revision.id },
      orderBy: { itemCode: 'asc' }
    });
    assert.equal(storedItems.length, 2);
    assert.deepEqual(storedItems.map((item) => item.amount.toString()), ['33.35', '250.31']);

    const audits = await client.auditLog.findMany({
      where: {
        companyId: COMPANY_ID,
        action: { in: ['boq.created', 'boq.revision_created', 'boq.items_replaced', 'boq.revision_frozen'] }
      },
      select: { action: true, actorUserId: true }
    });
    assert.equal(audits.filter((row) => row.action === 'boq.created').length, 1);
    assert.equal(audits.filter((row) => row.action === 'boq.revision_created').length, 1);
    assert.equal(audits.filter((row) => row.action === 'boq.items_replaced').length, 1);
    assert.equal(audits.filter((row) => row.action === 'boq.revision_frozen').length, 1);
    assert.equal(audits.every((row) => row.actorUserId === ADMIN_ID), true);

    const outbox = await client.outboxEvent.findMany({
      where: {
        companyId: COMPANY_ID,
        eventType: { in: ['boq.created', 'boq.revision_created', 'boq.revision_frozen'] }
      },
      select: { eventType: true, actorUserId: true }
    });
    assert.equal(outbox.filter((row) => row.eventType === 'boq.created').length, 1);
    assert.equal(outbox.filter((row) => row.eventType === 'boq.revision_created').length, 1);
    assert.equal(outbox.filter((row) => row.eventType === 'boq.revision_frozen').length, 1);
    assert.equal(outbox.every((row) => row.actorUserId === ADMIN_ID), true);
  });
});

test('Module 4A keeps frozen revisions historical and rejects an overflowing item replacement without partial writes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const boq = await createBoq(app, token, 'BOQ-HISTORY-001');
    const revision1 = await createRevision(app, token, boq.id, '2026-09-01');

    let response = await replaceItems(app, token, boq.id, revision1.id, [{
      rowKey: 'v1',
      itemCode: 'V1-001',
      description: 'Original approved quantity',
      unit: 'lot',
      quantity: '1.0000',
      rate: '10.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.totalAmount, '10.00');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision1.id}/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    const revision2 = await createRevision(app, token, boq.id, '2026-10-01');
    assert.equal(revision2.revisionNo, 2);
    assert.equal(revision2.status, 'DRAFT');

    response = await replaceItems(app, token, boq.id, revision2.id, [{
      rowKey: 'v2',
      itemCode: 'V2-001',
      description: 'Revised quantity',
      unit: 'lot',
      quantity: '2.0000',
      rate: '10.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.totalAmount, '20.00');

    response = await replaceItems(app, token, boq.id, revision2.id, [{
      rowKey: 'overflow',
      itemCode: 'OVERFLOW-001',
      description: 'Must fail before persistence',
      unit: 'lot',
      quantity: '99999999999999.9999',
      rate: '99999999999999.9999'
    }]);
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_BOQ_ITEM');

    const revision2ItemsAfterFailure = await client.boqItem.findMany({
      where: { boqRevisionId: revision2.id }
    });
    assert.equal(revision2ItemsAfterFailure.length, 1);
    assert.equal(revision2ItemsAfterFailure[0].itemCode, 'V2-001');
    assert.equal(revision2ItemsAfterFailure[0].amount.toString(), '20');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision2.id}/freeze`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.totalAmount, '20.00');

    const storedBoq = await client.boq.findUnique({ where: { id: boq.id } });
    assert.equal(storedBoq.currentRevisionId, revision2.id);

    const storedRevision1 = await client.boqRevision.findUnique({ where: { id: revision1.id } });
    const storedRevision1Items = await client.boqItem.findMany({ where: { boqRevisionId: revision1.id } });
    assert.equal(storedRevision1.status, 'FROZEN');
    assert.equal(storedRevision1Items.length, 1);
    assert.equal(storedRevision1Items[0].itemCode, 'V1-001');
    assert.equal(storedRevision1Items[0].amount.toString(), '10');
  });
});

test('Module 4A security enforces authentication and the exact five-permission route matrix', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'boq-reader@example.test');
    const creatorToken = await signIn(app, 'boq-creator@example.test');
    const editorToken = await signIn(app, 'boq-editor@example.test');
    const freezerToken = await signIn(app, 'boq-freezer@example.test');
    const exporterToken = await signIn(app, 'boq-exporter@example.test');
    const noPermissionToken = await signIn(app, 'boq-no-permission@example.test');

    const boq = await createBoq(app, adminToken, 'BOQ-SECURITY-BASE');
    const revision = await createRevision(app, adminToken, boq.id);
    let response = await replaceItems(app, adminToken, boq.id, revision.id, [{
      rowKey: 'security-row',
      itemCode: 'SECURITY-001',
      description: 'Security verification row',
      unit: 'lot',
      quantity: '1.0000',
      rate: '10.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);

    const protectedRequests = [
      { method: 'GET', url: '/api/v1/boqs?page=1&pageSize=10' },
      {
        method: 'POST',
        url: '/api/v1/boqs',
        payload: { tenderId: TENDER_ID, code: 'AUTH-BLOCKED', title: 'Authentication blocked', currency: 'USD' }
      },
      {
        method: 'POST',
        url: `/api/v1/boqs/${boq.id}/revisions`,
        payload: { effectiveDate: '2026-09-02', notes: 'Authentication blocked' }
      },
      {
        method: 'PUT',
        url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/items`,
        payload: { items: [{ rowKey: 'auth', itemCode: 'AUTH-001', description: 'Blocked', unit: 'lot', quantity: '1', rate: '1' }] }
      },
      { method: 'POST', url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/freeze`, payload: {} },
      { method: 'GET', url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/export` }
    ];

    for (const request of protectedRequests) {
      const unauthenticated = await app.inject(request);
      assertSafePublicError(unauthenticated, 401, 'AUTHENTICATION_REQUIRED');

      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${noPermissionToken}` }
      });
      assertSafePublicError(denied, 403, 'FORBIDDEN');
    }

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?page=1&pageSize=10',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    const creatorBoq = await createBoq(app, creatorToken, 'BOQ-CREATOR-PERMISSION');
    assert.equal(creatorBoq.tenderId, TENDER_ID);

    const editorRevision = await createRevision(app, editorToken, boq.id, '2026-09-03');
    response = await replaceItems(app, editorToken, boq.id, editorRevision.id, [{
      rowKey: 'editor-row',
      itemCode: 'EDITOR-001',
      description: 'Editor permission row',
      unit: 'lot',
      quantity: '2.0000',
      rate: '5.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/freeze`,
      headers: { authorization: `Bearer ${freezerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.revision.approvedBy, FREEZER_ID);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}/revisions/${revision.id}/export`,
      headers: { authorization: `Bearer ${exporterToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.mimeType, 'text/csv');
  });
});

test('Module 4A security hides foreign-company records and rejects client-owned authority at HTTP, repository and service boundaries', { skip: !live }, async () => {
  await withApi(async (runtime) => {
    const { app, client, BoqRepository, BoqService } = runtime;
    const adminAToken = await signIn(app);
    const adminBToken = await signIn(app, 'boq-admin-b@example.test');
    const boqA = await createBoq(app, adminAToken, 'BOQ-COMPANY-A');
    const revisionA = await createRevision(app, adminAToken, boqA.id);
    const boqB = await createBoq(app, adminBToken, 'BOQ-COMPANY-B', TENDER_B_ID);
    const revisionB = await createRevision(app, adminBToken, boqB.id);

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?page=1&pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((row) => row.id === boqB.id), false);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/boqs',
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: { tenderId: TENDER_B_ID, code: 'FOREIGN-TENDER-BLOCKED', title: 'Foreign Tender blocked', currency: 'USD' }
    });
    assertSafePublicError(response, 409, 'BOQ_SCOPE_CONFLICT');

    const foreignRequests = [
      {
        method: 'POST',
        url: `/api/v1/boqs/${boqB.id}/revisions`,
        payload: { effectiveDate: '2026-09-04', notes: 'Foreign revision blocked' }
      },
      {
        method: 'PUT',
        url: `/api/v1/boqs/${boqB.id}/revisions/${revisionB.id}/items`,
        payload: { items: [{ rowKey: 'foreign', itemCode: 'FOREIGN-001', description: 'Blocked', unit: 'lot', quantity: '1', rate: '1' }] }
      },
      { method: 'POST', url: `/api/v1/boqs/${boqB.id}/revisions/${revisionB.id}/freeze`, payload: {} },
      { method: 'GET', url: `/api/v1/boqs/${boqB.id}/revisions/${revisionB.id}/export` }
    ];

    for (const request of foreignRequests) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${adminAToken}` }
      });
      assertSafePublicError(denied, 404, 'BOQ_NOT_FOUND');
    }

    const authorityRequests = [
      {
        method: 'POST',
        url: '/api/v1/boqs',
        payload: {
          tenderId: TENDER_ID,
          code: 'UNTRUSTED-BOQ-AUTHORITY',
          title: 'Untrusted authority',
          currency: 'USD',
          companyId: COMPANY_B_ID,
          actorUserId: ADMIN_B_ID,
          status: 'FROZEN',
          currentRevisionId: revisionB.id,
          projectScope: { kind: 'all' }
        }
      },
      {
        method: 'POST',
        url: `/api/v1/boqs/${boqA.id}/revisions`,
        payload: {
          effectiveDate: '2026-09-05',
          notes: 'Untrusted revision authority',
          revisionNo: 99,
          status: 'FROZEN',
          approvedBy: ADMIN_B_ID
        }
      },
      {
        method: 'PUT',
        url: `/api/v1/boqs/${boqA.id}/revisions/${revisionA.id}/items`,
        payload: {
          items: [{
            rowKey: 'authority',
            itemCode: 'AUTHORITY-001',
            description: 'Untrusted amount',
            unit: 'lot',
            quantity: '1.0000',
            rate: '1.0000',
            amount: '0.01',
            id: '00000000-0000-4000-8000-000000004999',
            parentId: revisionB.id
          }]
        }
      },
      {
        method: 'POST',
        url: `/api/v1/boqs/${boqA.id}/revisions/${revisionA.id}/freeze`,
        payload: { approvedBy: ADMIN_B_ID }
      }
    ];

    for (const request of authorityRequests) {
      const denied = await app.inject({
        ...request,
        headers: { authorization: `Bearer ${adminAToken}` }
      });
      assertSafePublicError(denied, 400, 'INVALID_REQUEST');
    }

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boqA.id}/revisions/${revisionA.id}/export?companyId=${COMPANY_B_ID}`,
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/boqs?pageSize=101',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assertSafePublicError(response, 400, 'INVALID_REQUEST');

    await runInCompanyContext(runtime, {
      actorUserId: ADMIN_ID,
      companyId: COMPANY_ID,
      permissions: MODULE_4A_PERMISSIONS
    }, async () => {
      const repository = new BoqRepository(client);
      assert.equal(await repository.findBoqById(boqB.id), null);
      assert.equal(await repository.findBoqRevisionById(boqB.id, revisionB.id), null);

      const service = new BoqService(client);
      await assert.rejects(
        service.getRevisionExportSource(boqB.id, revisionB.id),
        (error) => error?.code === 'BOQ_NOT_FOUND'
      );
      await assert.rejects(
        service.createBoq({ tenderId: TENDER_B_ID, code: 'DIRECT-FOREIGN', title: 'Direct foreign', currency: 'USD' }),
        (error) => error?.code === 'BOQ_SCOPE_CONFLICT'
      );
    });

    await runInCompanyContext(runtime, {
      actorUserId: READER_ID,
      companyId: COMPANY_ID,
      permissions: ['boq.read']
    }, async () => {
      await assert.rejects(
        new BoqService(client).createBoq({ tenderId: TENDER_ID, code: 'DIRECT-FORBIDDEN', title: 'Direct forbidden', currency: 'USD' }),
        (error) => error?.statusCode === 403
      );
    });
  });
});

test('Module 4A security attacks the live Stage-6 database constraints and reviewed indexes directly', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const boqA = await client.boq.create({
      data: {
        id: '00000000-0000-4000-8000-000000004200',
        companyId: COMPANY_ID,
        tenderId: TENDER_ID,
        code: 'DB-BOQ-A',
        title: 'Database BOQ A',
        currency: 'USD',
        status: 'ACTIVE'
      }
    });
    const boqA2 = await client.boq.create({
      data: {
        id: '00000000-0000-4000-8000-000000004201',
        companyId: COMPANY_ID,
        tenderId: TENDER_ID,
        code: 'DB-BOQ-A2',
        title: 'Database BOQ A2',
        currency: 'USD',
        status: 'ACTIVE'
      }
    });
    const revisionA = await client.boqRevision.create({
      data: {
        id: '00000000-0000-4000-8000-000000004210',
        boqId: boqA.id,
        revisionNo: 1,
        status: 'DRAFT',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        notes: 'Database revision A'
      }
    });
    const revisionA2 = await client.boqRevision.create({
      data: {
        id: '00000000-0000-4000-8000-000000004211',
        boqId: boqA2.id,
        revisionNo: 1,
        status: 'DRAFT',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        notes: 'Database revision A2'
      }
    });
    const parent = await client.boqItem.create({
      data: {
        id: '00000000-0000-4000-8000-000000004220',
        boqRevisionId: revisionA.id,
        parentId: null,
        itemCode: 'DB-PARENT',
        description: 'Database parent',
        unit: 'lot',
        quantity: '1.0000',
        rate: '10.0000',
        amount: '10.00'
      }
    });

    await assert.rejects(client.boq.create({
      data: {
        companyId: COMPANY_ID,
        tenderId: TENDER_B_ID,
        code: 'DB-FOREIGN-TENDER',
        title: 'Foreign Tender must fail',
        currency: 'USD',
        status: 'ACTIVE'
      }
    }));

    await assert.rejects(client.boq.create({
      data: {
        companyId: COMPANY_ID,
        tenderId: TENDER_ID,
        code: boqA.code,
        title: 'Duplicate code must fail',
        currency: 'USD',
        status: 'ACTIVE'
      }
    }));

    await assert.rejects(client.boq.create({
      data: {
        companyId: COMPANY_ID,
        tenderId: TENDER_ID,
        code: 'DB-BAD-CURRENCY',
        title: 'Bad currency must fail',
        currency: 'usd',
        status: 'ACTIVE'
      }
    }));

    await assert.rejects(client.boqRevision.create({
      data: {
        boqId: boqA.id,
        revisionNo: 0,
        status: 'DRAFT',
        effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
        notes: 'Revision zero must fail'
      }
    }));

    await assert.rejects(client.boqRevision.create({
      data: {
        boqId: boqA.id,
        revisionNo: 2,
        status: 'BROKEN',
        effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
        notes: 'Bad status must fail'
      }
    }));

    await assert.rejects(client.boqRevision.create({
      data: {
        boqId: boqA.id,
        revisionNo: 1,
        status: 'DRAFT',
        effectiveDate: new Date('2026-09-02T00:00:00.000Z'),
        notes: 'Duplicate revision number must fail'
      }
    }));

    await assert.rejects(client.boqItem.create({
      data: {
        boqRevisionId: revisionA.id,
        itemCode: 'DB-NEGATIVE',
        description: 'Negative amount must fail',
        unit: 'lot',
        quantity: '-1.0000',
        rate: '1.0000',
        amount: '-1.00'
      }
    }));

    await assert.rejects(client.boqItem.create({
      data: {
        id: '00000000-0000-4000-8000-000000004221',
        boqRevisionId: revisionA.id,
        parentId: '00000000-0000-4000-8000-000000004221',
        itemCode: 'DB-SELF-PARENT',
        description: 'Self parent must fail',
        unit: 'lot',
        quantity: '1.0000',
        rate: '1.0000',
        amount: '1.00'
      }
    }));

    await assert.rejects(client.boqItem.create({
      data: {
        boqRevisionId: revisionA2.id,
        parentId: parent.id,
        itemCode: 'DB-FOREIGN-PARENT',
        description: 'Parent from another revision must fail',
        unit: 'lot',
        quantity: '1.0000',
        rate: '1.0000',
        amount: '1.00'
      }
    }));

    await assert.rejects(client.boq.update({
      where: { id: boqA.id },
      data: { currentRevisionId: revisionA2.id }
    }));

    const constraints = await client.$queryRaw`
      SELECT conname
      FROM pg_constraint
      WHERE conname IN (
        'boqs_tender_company_fkey',
        'boqs_current_revision_belongs_to_boq_fkey',
        'boq_revisions_revision_positive',
        'boq_revisions_status_allowed',
        'boq_items_parent_not_self',
        'boq_items_parent_same_revision_fkey'
      )
    `;
    const constraintNames = new Set(constraints.map((row) => row.conname));
    for (const name of [
      'boqs_tender_company_fkey',
      'boqs_current_revision_belongs_to_boq_fkey',
      'boq_revisions_revision_positive',
      'boq_revisions_status_allowed',
      'boq_items_parent_not_self',
      'boq_items_parent_same_revision_fkey'
    ]) assert.equal(constraintNames.has(name), true, name);

    const indexes = await client.$queryRaw`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'boqs_company_code_uq',
          'boqs_company_tender_created_idx',
          'boqs_company_status_created_idx',
          'boq_revisions_boq_revision_uq',
          'boq_revisions_boq_status_revision_idx',
          'boq_items_revision_parent_idx',
          'boq_items_revision_code_idx'
        )
    `;
    const indexNames = new Set(indexes.map((row) => row.indexname));
    for (const name of [
      'boqs_company_code_uq',
      'boqs_company_tender_created_idx',
      'boqs_company_status_created_idx',
      'boq_revisions_boq_revision_uq',
      'boq_revisions_boq_status_revision_idx',
      'boq_items_revision_parent_idx',
      'boq_items_revision_code_idx'
    ]) assert.equal(indexNames.has(name), true, name);
  });
});

/** Return one generated OpenAPI operation and fail clearly when the path/method is missing. */
function openApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

test('Module 4 Pass 367 readback reloads durable revision history and enforces read authorization', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'boq-reader@example.test');
    const noPermissionToken = await signIn(app, 'boq-no-permission@example.test');
    const foreignToken = await signIn(app, 'boq-admin-b@example.test');

    const boq = await createBoq(app, adminToken, 'READBACK-001');
    const revisionOne = await createRevision(app, adminToken, boq.id, '2026-09-01');
    let response = await replaceItems(app, adminToken, boq.id, revisionOne.id, [{
      rowKey: 'root-1', itemCode: 'R1', description: 'Historical revision one', unit: 'item', quantity: '2.0000', rate: '25.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/boqs/${boq.id}/revisions/${revisionOne.id}/freeze`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    const revisionTwo = await createRevision(app, adminToken, boq.id, '2026-10-01');
    response = await replaceItems(app, adminToken, boq.id, revisionTwo.id, [{
      rowKey: 'root-2', itemCode: 'R2', description: 'Historical revision two', unit: 'item', quantity: '3.0000', rate: '30.0000'
    }]);
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const details = response.json().data;
    assert.equal(details.boq.id, boq.id);
    assert.deepEqual(details.revisions.map((revision) => revision.revisionNo), [2, 1]);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}/revisions/${revisionOne.id}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const historical = response.json().data;
    assert.equal(historical.revision.id, revisionOne.id);
    assert.equal(historical.revision.status, 'FROZEN');
    assert.equal(historical.totalAmount, '50.00');
    assert.equal(historical.items[0].itemCode, 'R1');

    const denied = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}`,
      headers: { authorization: `Bearer ${noPermissionToken}` }
    });
    assertSafePublicError(denied, 403, 'FORBIDDEN');

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/v1/boqs/${boq.id}/revisions/${revisionOne.id}`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assertSafePublicError(hidden, 404, 'BOQ_NOT_FOUND');
  });
});

/** Read the documented stable error-code enum for one generated OpenAPI response. */
function openApiErrorCodes(operation, statusCode) {
  const schema = operation.responses?.[String(statusCode)]?.content?.['application/json']?.schema;
  assert.ok(schema, `Missing OpenAPI ${statusCode} response schema`);
  assert.deepEqual(schema.required, ['error']);
  assert.equal(Object.hasOwn(schema.properties ?? {}, 'requestId'), false);
  const errorSchema = schema.properties?.error;
  assert.ok(errorSchema);
  assert.deepEqual(errorSchema.required, ['code', 'message', 'requestId']);
  return errorSchema.properties?.code?.enum ?? [];
}

test('Module 4 API contract exposes six source operations plus two Pass-367 readback operations and stable schemas', { skip: !live }, async () => {
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
      ['GET', '/api/v1/boqs', 'module4aListBoqs'],
      ['GET', '/api/v1/boqs/{id}', 'module4Pass367GetBoqDetails'],
      ['GET', '/api/v1/boqs/{id}/revisions/{revId}', 'module4Pass367GetBoqRevisionDetails'],
      ['POST', '/api/v1/boqs', 'module4aCreateBoq'],
      ['POST', '/api/v1/boqs/{id}/revisions', 'module4aCreateBoqRevision'],
      ['PUT', '/api/v1/boqs/{id}/revisions/{revId}/items', 'module4aReplaceBoqRevisionItems'],
      ['POST', '/api/v1/boqs/{id}/revisions/{revId}/freeze', 'module4aFreezeBoqRevision'],
      ['GET', '/api/v1/boqs/{id}/revisions/{revId}/export', 'module4aExportBoqRevision']
    ];
    const actualOperations = [];

    for (const [method, route, operationId] of expectedOperations) {
      const operation = openApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      actualOperations.push(`${method} ${route}`);
    }

    const documentedBoqOperations = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      if (!route.startsWith('/api/v1/boqs')) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]) documentedBoqOperations.push(`${method.toUpperCase()} ${route}`);
      }
    }
    assert.deepEqual(documentedBoqOperations.sort(), actualOperations.sort());
    assert.equal(documentedBoqOperations.some((route) => route.includes('/import')), false);
    assert.equal(documentedBoqOperations.some((route) => route.includes('/project')), false);

    const create = openApiOperation(document, '/api/v1/boqs', 'POST');
    const createBody = create.requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    assert.deepEqual(createBody.required, ['code', 'title', 'currency']);
    assert.deepEqual(createBody.anyOf, [{ required: ['tenderId'] }, { required: ['projectId'] }]);
    assert.deepEqual(Object.keys(createBody.properties).sort(), ['code', 'currency', 'projectId', 'tenderId', 'title']);

    const replace = openApiOperation(document, '/api/v1/boqs/{id}/revisions/{revId}/items', 'PUT');
    const itemSchema = replace.requestBody.content['application/json'].schema.properties.items.items;
    assert.equal(itemSchema.additionalProperties, false);
    assert.equal(Object.hasOwn(itemSchema.properties, 'amount'), false);
    assert.equal(Object.hasOwn(itemSchema.properties, 'wbsNodeId'), true);
    assert.equal(Object.hasOwn(itemSchema.properties, 'costCodeId'), true);
    for (const forbidden of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'projectId', 'costTypeId', 'status', 'revisionNo', 'approvedBy']) {
      assert.equal(Object.hasOwn(itemSchema.properties, forbidden), false, forbidden);
    }

    const freeze = openApiOperation(document, '/api/v1/boqs/{id}/revisions/{revId}/freeze', 'POST');
    assert.equal(freeze.requestBody, undefined);

    assert.deepEqual(openApiErrorCodes(create, 400), ['INVALID_REQUEST']);
    assert.deepEqual(openApiErrorCodes(create, 401), ['AUTHENTICATION_REQUIRED']);
    assert.deepEqual(openApiErrorCodes(create, 403), ['FORBIDDEN']);
    assert.deepEqual(openApiErrorCodes(create, 409), ['BOQ_SCOPE_CONFLICT']);

    assert.deepEqual(openApiErrorCodes(replace, 400), ['INVALID_REQUEST', 'INVALID_BOQ_ITEM']);
    assert.deepEqual(openApiErrorCodes(replace, 404), ['BOQ_NOT_FOUND']);
    assert.deepEqual(openApiErrorCodes(replace, 409), ['BOQ_REVISION_LOCKED', 'BOQ_SCOPE_CONFLICT']);

    const createSuccess = create.responses['201'].content['application/json'].schema;
    assert.deepEqual(createSuccess.required, ['data']);
    assert.equal(createSuccess.properties.data.additionalProperties, false);
    assert.equal(Object.hasOwn(createSuccess.properties.data.properties, 'companyId'), false);

    const replaceSuccess = replace.responses['200'].content['application/json'].schema;
    const responseItem = replaceSuccess.properties.data.properties.items.items;
    assert.equal(responseItem.properties.amount.type, 'string');
    assert.equal(responseItem.properties.quantity.type, 'string');
    assert.equal(responseItem.properties.rate.type, 'string');
  });
});

// Verify concurrent Stage-6 lifecycle commands serialize without duplicate revisions or freeze side effects.
test('Module 4A operational concurrency serializes revision numbering, item replacement and freeze retries', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const boq = await createBoq(app, token, 'OPS-CONCURRENCY-001');

    const revisionResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/boqs/${boq.id}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { effectiveDate: '2026-09-01', notes: 'Concurrent revision A' }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/boqs/${boq.id}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { effectiveDate: '2026-09-02', notes: 'Concurrent revision B' }
      })
    ]);

    assert.deepEqual(revisionResponses.map((response) => response.statusCode).sort(), [201, 201]);
    const revisions = revisionResponses.map((response) => response.json().data);
    assert.deepEqual(revisions.map((revision) => revision.revisionNo).sort((left, right) => left - right), [1, 2]);
    assert.equal(await client.boqRevision.count({ where: { boqId: boq.id } }), 2);

    const editableRevision = revisions.find((revision) => revision.revisionNo === 2);
    assert.ok(editableRevision);

    const replacementResponses = await Promise.all([
      replaceItems(app, token, boq.id, editableRevision.id, [
        {
          rowKey: 'set-a-1',
          itemCode: 'OPS-A-1',
          description: 'Concurrent item set A',
          unit: 'lot',
          quantity: '1.0000',
          rate: '10.0000'
        }
      ]),
      replaceItems(app, token, boq.id, editableRevision.id, [
        {
          rowKey: 'set-b-1',
          itemCode: 'OPS-B-1',
          description: 'Concurrent item set B',
          unit: 'lot',
          quantity: '2.0000',
          rate: '10.0000'
        }
      ])
    ]);

    assert.deepEqual(replacementResponses.map((response) => response.statusCode).sort(), [200, 200]);
    const persistedItems = await client.boqItem.findMany({
      where: { boqRevisionId: editableRevision.id },
      orderBy: { itemCode: 'asc' }
    });
    assert.equal(persistedItems.length, 1);
    assert.ok(['OPS-A-1', 'OPS-B-1'].includes(persistedItems[0].itemCode));
    assert.ok(['10.00', '20.00'].includes(persistedItems[0].amount.toFixed(2)));

    const freezeResponses = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/boqs/${boq.id}/revisions/${editableRevision.id}/freeze`,
        headers: { authorization: `Bearer ${token}` }
      }),
      app.inject({
        method: 'POST',
        url: `/api/v1/boqs/${boq.id}/revisions/${editableRevision.id}/freeze`,
        headers: { authorization: `Bearer ${token}` }
      })
    ]);

    assert.deepEqual(freezeResponses.map((response) => response.statusCode).sort(), [200, 200]);
    assert.equal(freezeResponses[0].json().data.revision.status, 'FROZEN');
    assert.equal(freezeResponses[1].json().data.revision.status, 'FROZEN');
    assert.equal(await client.auditLog.count({ where: { entityId: editableRevision.id, action: 'boq.revision_frozen' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: editableRevision.id, eventType: 'boq.revision_frozen' } }), 1);

    const persistedBoq = await client.boq.findUniqueOrThrow({ where: { id: boq.id } });
    assert.equal(persistedBoq.currentRevisionId, editableRevision.id);
  });
});

// Verify reviewed PostgreSQL indexes support common bounded BOQ and revision reads without unstable timing thresholds.
test('Module 4A operational query plans use reviewed indexes for BOQ register and revision reads', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await client.boq.createMany({
      data: Array.from({ length: 2400 }, (_, index) => ({
        companyId: COMPANY_ID,
        tenderId: TENDER_ID,
        code: `OPS-PERF-${String(index).padStart(5, '0')}`,
        title: `Operational BOQ ${index}`,
        currency: 'USD',
        status: 'ACTIVE'
      }))
    });
    await client.$executeRawUnsafe('ANALYZE boqs');

    const boqPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, code
      FROM boqs
      WHERE company_id = '${COMPANY_ID}'::uuid
        AND tender_id = '${TENDER_ID}'::uuid
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const boqPlan = JSON.stringify(boqPlanRows);
    assert.match(boqPlan, /boqs_company_tender_created_idx/);
    assert.match(boqPlan, /Execution Time/);

    const boq = await client.boq.findFirstOrThrow({
      where: { companyId: COMPANY_ID, code: 'OPS-PERF-00000' }
    });
    await client.boqRevision.createMany({
      data: Array.from({ length: 600 }, (_, index) => ({
        boqId: boq.id,
        revisionNo: index + 1,
        status: index % 2 === 0 ? 'DRAFT' : 'FROZEN',
        effectiveDate: new Date('2026-09-01T00:00:00.000Z'),
        notes: `Operational revision ${index + 1}`
      }))
    });
    await client.$executeRawUnsafe('ANALYZE boq_revisions');

    const revisionPlanRows = await client.$queryRawUnsafe(`
      EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, revision_no
      FROM boq_revisions
      WHERE boq_id = '${boq.id}'::uuid
        AND status = 'FROZEN'
      ORDER BY revision_no DESC
      LIMIT 1
    `);
    const revisionPlan = JSON.stringify(revisionPlanRows);
    assert.match(revisionPlan, /boq_revisions_boq_status_revision_idx/);
    assert.match(revisionPlan, /Execution Time/);
  });
});
