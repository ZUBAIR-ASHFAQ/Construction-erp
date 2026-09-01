import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000019001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000019002';
const ADMIN_ID = '00000000-0000-4000-8000-000000019010';
const REVIEWER_ID = '00000000-0000-4000-8000-000000019011';
const READER_ID = '00000000-0000-4000-8000-000000019012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000019013';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000019020';
const REVIEWER_ROLE_ID = '00000000-0000-4000-8000-000000019021';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000019022';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000019023';
const CLIENT_ID = '00000000-0000-4000-8000-000000019030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000019031';
const PROJECT_ID = '00000000-0000-4000-8000-000000019040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000019041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000019042';
const DOCUMENT_ID = '00000000-0000-4000-8000-000000019050';
const DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019051';
const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-000000019052';
const OTHER_DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019053';
const FOREIGN_DOCUMENT_ID = '00000000-0000-4000-8000-000000019054';
const FOREIGN_DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000019055';
const PASSWORD = 'Module19-pass-393-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module19-auth-secret-0123456789abcdef';

const MODULE_19_PERMISSIONS = [
  'submittals.read',
  'submittals.create',
  'submittals.submit',
  'submittals.review'
];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest two-company Project/RBAC/Document graph needed by Module 19 Submittal verification. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      { id: COMPANY_ID, legalName: 'Module 19 Company Ltd', displayName: 'Module 19 Company', status: 'ACTIVE', baseCurrency: 'USD', timeZone: 'UTC', locale: 'en-US', fiscalSettings: { fiscalYearStartMonth: 1 } },
      { id: COMPANY_B_ID, legalName: 'Module 19 Foreign Ltd', displayName: 'Module 19 Foreign', status: 'ACTIVE', baseCurrency: 'USD', timeZone: 'UTC', locale: 'en-US', fiscalSettings: { fiscalYearStartMonth: 1 } }
    ]
  });

  const permissionRows = [];
  for (const code of MODULE_19_PERMISSIONS) {
    permissionRows.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'rfi-submittals' },
      create: { code, name: code, domain: 'rfi-submittals' }
    }));
  }
  const permissionByCode = new Map(permissionRows.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({ data: [
    { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-admin', name: 'Module 19 Admin', isSystem: false, status: 'ACTIVE' },
    { id: REVIEWER_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-reviewer', name: 'Module 19 Reviewer', isSystem: false, status: 'ACTIVE' },
    { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-19-reader', name: 'Module 19 Reader', isSystem: false, status: 'ACTIVE' },
    { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-19-admin', name: 'Module 19 Foreign Admin', isSystem: false, status: 'ACTIVE' }
  ] });

  await client.rolePermission.createMany({ data: [
    ...MODULE_19_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
    { roleId: REVIEWER_ROLE_ID, permissionId: permissionByCode.get('submittals.read') },
    { roleId: REVIEWER_ROLE_ID, permissionId: permissionByCode.get('submittals.review') },
    { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('submittals.read') },
    ...MODULE_19_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
  ] });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module19-admin@example.test', name: 'Module 19 Admin' },
    { id: REVIEWER_ID, companyId: COMPANY_ID, email: 'module19-reviewer@example.test', name: 'Module 19 Reviewer' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module19-reader@example.test', name: 'Module 19 Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module19-admin-b@example.test', name: 'Module 19 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({ data: [
    { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, userId: REVIEWER_ID, roleId: REVIEWER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
    { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
  ] });

  await client.client.createMany({ data: [
    { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M19-CLIENT', legalName: 'Module 19 Client Ltd', displayName: 'Module 19 Client', billingAddress: 'Lahore', status: 'ACTIVE', creditTermsDays: 30 },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M19-CLIENT-B', legalName: 'Module 19 Foreign Client Ltd', displayName: 'Module 19 Foreign Client', billingAddress: 'Karachi', status: 'ACTIVE', creditTermsDays: 30 }
  ] });

  await client.project.createMany({ data: [
    { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M19-A', name: 'Module 19 Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_ID, location: 'Lahore' },
    { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M19-OTHER', name: 'Module 19 Other Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_ID, location: 'Islamabad' },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M19-B', name: 'Module 19 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01'), plannedEndDate: new Date('2027-12-31'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi' }
  ] });

  await client.projectMember.createMany({ data: [
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: ADMIN_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: REVIEWER_ID, projectRole: 'REVIEWER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'VIEWER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, userId: ADMIN_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate },
    { companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, userId: ADMIN_B_ID, projectRole: 'PROJECT_MANAGER', status: 'ACTIVE', fromDate }
  ] });

  await client.numberSequence.createMany({ data: [
    { companyId: COMPANY_ID, sequenceKey: 'submittal', prefix: 'SUB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, sequenceKey: 'submittal', prefix: 'SUBB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  ] });

  const documents = [
    { id: DOCUMENT_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, title: 'Project Submittal Document', status: 'ACTIVE', ownerUserId: ADMIN_ID },
    { id: OTHER_DOCUMENT_ID, companyId: COMPANY_ID, projectId: OTHER_PROJECT_ID, title: 'Other Project Document', status: 'ACTIVE', ownerUserId: ADMIN_ID },
    { id: FOREIGN_DOCUMENT_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, title: 'Foreign Project Document', status: 'ACTIVE', ownerUserId: ADMIN_B_ID }
  ];
  await client.document.createMany({ data: documents.map((document) => ({ ...document, category: 'submittal' })) });
  await client.documentVersion.createMany({ data: [
    { id: DOCUMENT_VERSION_ID, documentId: DOCUMENT_ID, versionNo: 1, storageKey: 'm19/project/document-v1.pdf', originalName: 'document-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'a'.repeat(64), uploadedBy: ADMIN_ID },
    { id: OTHER_DOCUMENT_VERSION_ID, documentId: OTHER_DOCUMENT_ID, versionNo: 1, storageKey: 'm19/other/document-v1.pdf', originalName: 'other-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'b'.repeat(64), uploadedBy: ADMIN_ID },
    { id: FOREIGN_DOCUMENT_VERSION_ID, documentId: FOREIGN_DOCUMENT_ID, versionNo: 1, storageKey: 'm19/foreign/document-v1.pdf', originalName: 'foreign-v1.pdf', mimeType: 'application/pdf', sizeBytes: 100n, checksum: 'c'.repeat(64), uploadedBy: ADMIN_B_ID }
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

/** Sign in one seeded Module-19 user through the real Module-24A authentication route. */
async function signIn(app, email = 'module19-admin@example.test') {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/sign-in', payload: { email, password: PASSWORD } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Send one idempotent Module-19 write through the real Fastify boundary. */
async function submittalWrite(app, token, url, payload, key) {
  return app.inject({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    payload
  });
}

/** Create one Submittal through the public API and return the normalized data. */
async function createSubmittal(app, token, overrides = {}, key = 'module19-create') {
  const projectId = overrides.projectId ?? PROJECT_ID;
  const response = await submittalWrite(app, token, `/api/v1/projects/${projectId}/submittals`, {
    title: overrides.title ?? 'Concrete Mix Design',
    submittalType: overrides.submittalType ?? 'MATERIAL',
    specReference: overrides.specReference ?? '03 30 00',
    responsibleUserId: overrides.responsibleUserId ?? ADMIN_ID,
    dueDate: overrides.dueDate ?? '2026-12-31',
    documentId: overrides.documentId ?? DOCUMENT_ID
  }, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Install a disposable trigger that forces one Module-19 outbox event to fail inside its transaction. */
async function installOutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_19_test_fail_outbox_event()
    RETURNS trigger AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 19 forced outbox failure for %', TG_ARGV[0] USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_19_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_19_test_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW EXECUTE FUNCTION module_19_test_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-19 outbox failure trigger and helper function. */
async function removeOutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_19_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_19_test_fail_outbox_event()');
}

test('Module 19 Submittal live workflow covers create/list/submit/review and revise-resubmit history', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const reviewerToken = await signIn(app, 'module19-reviewer@example.test');
    const created = await createSubmittal(app, adminToken);
    assert.equal(created.projectId, PROJECT_ID);
    assert.equal(created.status, 'DRAFT');
    assert.equal(created.currentRevision.revisionNo, 1);

    let response = await app.inject({ method: 'GET', url: `/api/v1/projects/${PROJECT_ID}/submittals?page=1&pageSize=20`, headers: { authorization: `Bearer ${adminToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);

    response = await submittalWrite(app, adminToken, `/api/v1/submittals/${created.id}/submit`, {}, 'module19-submit-1');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.currentRevision.status, 'SUBMITTED');

    response = await submittalWrite(app, reviewerToken, `/api/v1/submittals/${created.id}/reviews`, { decision: 'REVISE_RESUBMIT', comments: 'Please revise the mix design.' }, 'module19-review-1');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.nextRevision.revisionNo, 2);
    assert.equal(response.json().data.nextRevision.status, 'DRAFT');

    const revisions = await client.submittalRevision.findMany({ where: { submittalId: created.id }, orderBy: { revisionNo: 'asc' } });
    const reviews = await client.submittalReview.findMany({ where: { submittalRevisionId: revisions[0].id } });
    assert.equal(revisions.length, 2);
    assert.equal(reviews.length, 1);
    assert.equal(revisions[0].status, 'REVISE_RESUBMIT');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/submittals/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, created.id);
    assert.equal(response.json().data.revisions.length, 2);
    assert.equal(response.json().data.revisions[0].reviews.length, 1);
    assert.equal(response.json().data.revisions[1].reviews.length, 0);
  });
});

test('Module 19 Submittal security blocks foreign Project, foreign Document, missing mutation permission and unauthorized reviewer', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const readerToken = await signIn(app, 'module19-reader@example.test');
    const foreignToken = await signIn(app, 'module19-admin-b@example.test');

    let response = await submittalWrite(app, foreignToken, `/api/v1/projects/${PROJECT_ID}/submittals`, { title: 'Foreign write', submittalType: 'MATERIAL', responsibleUserId: ADMIN_B_ID, dueDate: '2026-12-31' }, 'm19-foreign-project');
    assert.ok([403, 404].includes(response.statusCode), response.body);

    response = await submittalWrite(app, adminToken, `/api/v1/projects/${PROJECT_ID}/submittals`, { title: 'Wrong document', submittalType: 'MATERIAL', responsibleUserId: ADMIN_ID, dueDate: '2026-12-31', documentId: OTHER_DOCUMENT_ID }, 'm19-wrong-document');
    assert.equal(response.statusCode, 400, response.body);

    response = await submittalWrite(app, readerToken, `/api/v1/projects/${PROJECT_ID}/submittals`, { title: 'Reader cannot create', submittalType: 'MATERIAL', responsibleUserId: READER_ID, dueDate: '2026-12-31' }, 'm19-reader-create');
    assert.equal(response.statusCode, 403, response.body);

    const created = await createSubmittal(app, adminToken, {}, 'm19-secure-create');

    response = await app.inject({ method: 'GET', url: `/api/v1/submittals/${created.id}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    response = await app.inject({ method: 'GET', url: `/api/v1/submittals/${created.id}`, headers: { authorization: `Bearer ${foreignToken}` } });
    assert.ok([403, 404].includes(response.statusCode), response.body);

    response = await submittalWrite(app, adminToken, `/api/v1/submittals/${created.id}/submit`, {}, 'm19-secure-submit');
    assert.equal(response.statusCode, 200, response.body);
    response = await submittalWrite(app, readerToken, `/api/v1/submittals/${created.id}/reviews`, { decision: 'APPROVED', comments: 'Attempted unauthorized review.' }, 'm19-reader-review');
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'REVIEWER_NOT_AUTHORIZED');
  });
});

test('Module 19 Submittal operational concurrency preserves unique numbering and one current revision transition', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const reviewerToken = await signIn(app, 'module19-reviewer@example.test');
    const [first, second] = await Promise.all([
      createSubmittal(app, adminToken, { title: 'Concurrent A' }, 'm19-concurrent-create-a'),
      createSubmittal(app, adminToken, { title: 'Concurrent B' }, 'm19-concurrent-create-b')
    ]);
    assert.notEqual(first.submittalNo, second.submittalNo);

    const submitResults = await Promise.all([
      submittalWrite(app, adminToken, `/api/v1/submittals/${first.id}/submit`, {}, 'm19-concurrent-submit-a'),
      submittalWrite(app, adminToken, `/api/v1/submittals/${first.id}/submit`, {}, 'm19-concurrent-submit-b')
    ]);
    assert.equal(submitResults.filter((response) => response.statusCode === 200).length, 1);

    const reviewResults = await Promise.all([
      submittalWrite(app, reviewerToken, `/api/v1/submittals/${first.id}/reviews`, { decision: 'APPROVED', comments: 'Approved.' }, 'm19-concurrent-review-a'),
      submittalWrite(app, reviewerToken, `/api/v1/submittals/${first.id}/reviews`, { decision: 'REJECTED', comments: 'Rejected.' }, 'm19-concurrent-review-b')
    ]);
    assert.equal(reviewResults.filter((response) => response.statusCode === 201).length, 1);
    assert.equal(await client.submittalReview.count({ where: { submittalRevision: { submittalId: first.id } } }), 1);
  });
});

test('Module 19 Submittal database keeps review evidence append-only', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const reviewerToken = await signIn(app, 'module19-reviewer@example.test');
    const created = await createSubmittal(app, adminToken, {}, 'm19-append-create');
    let response = await submittalWrite(app, adminToken, `/api/v1/submittals/${created.id}/submit`, {}, 'm19-append-submit');
    assert.equal(response.statusCode, 200, response.body);
    response = await submittalWrite(app, reviewerToken, `/api/v1/submittals/${created.id}/reviews`, { decision: 'APPROVED', comments: 'Approved historical evidence.' }, 'm19-append-review');
    assert.equal(response.statusCode, 201, response.body);
    const reviewId = response.json().data.review.id;
    await assert.rejects(() => client.submittalReview.update({ where: { id: reviewId }, data: { comments: 'mutated' } }), /append-only|55000/i);
    await assert.rejects(() => client.submittalReview.delete({ where: { id: reviewId } }), /append-only|55000/i);
  });
});

test('Module 19 Submittal transaction rollback removes submit state when durable outbox insertion fails', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const created = await createSubmittal(app, adminToken, {}, 'm19-rollback-create');
    await installOutboxFailure(client, 'submittal.submitted');
    try {
      const response = await submittalWrite(app, adminToken, `/api/v1/submittals/${created.id}/submit`, {}, 'm19-rollback-submit');
      assert.equal(response.statusCode, 500, response.body);
      const stored = await client.submittal.findUniqueOrThrow({ where: { id: created.id }, include: { revisions: true } });
      assert.equal(stored.status, 'DRAFT');
      assert.equal(stored.revisions[0].status, 'DRAFT');
      assert.equal(stored.revisions[0].submittedAt, null);
    } finally {
      await removeOutboxFailure(client);
    }
  });
});
