import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000020001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000020002';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000020010';
const SCOPED_A_ID = '00000000-0000-4000-8000-000000020011';
const READ_ONLY_A_ID = '00000000-0000-4000-8000-000000020012';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000020020';
const SCOPED_A_ROLE_ID = '00000000-0000-4000-8000-000000020021';
const READ_ONLY_A_ROLE_ID = '00000000-0000-4000-8000-000000020022';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000020030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000020031';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000020040';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000020041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000020042';
const STAGE_A_ID = '00000000-0000-4000-8000-000000020050';
const BASELINE_A_ID = '00000000-0000-4000-8000-000000020051';
const PROGRESS_A_ID = '00000000-0000-4000-8000-000000020052';
const COST_A_ID = '00000000-0000-4000-8000-000000020060';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000020070';
const BANK_A_ID = '00000000-0000-4000-8000-000000020071';
const INVOICE_A_ID = '00000000-0000-4000-8000-000000020080';
const RECEIPT_A_ID = '00000000-0000-4000-8000-000000020081';
const ADVANCE_A2_ID = '00000000-0000-4000-8000-000000020082';
const ALLOCATION_A_ID = '00000000-0000-4000-8000-000000020083';
const PASSWORD = 'Final21-reports-B20.10-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-reports-secret-0123456789abcdef';

const FULL_PERMISSIONS = [
  'reports.read',
  'reports.export',
  'reports.finance.read',
  'reports.save_filters',
  'stages.read',
  'job_cost.read',
  'client_billing.read',
  'client_receipts.read'
];

/** Tiny object-storage double needed only so the Reports HTTP routes are registered. */
class TestObjectStorage {
  /** Keep the double stateless because B20.10 does not execute the export worker here. */
  constructor() {}

  /** Accept a test object write without external storage. */
  async putObject(input) { return { key: input.key, sizeBytes: 0, eTag: 'test', checksumSha256: null, contentType: null, lastModified: new Date(), metadata: {} }; }

  /** Return a deterministic object header for test-only callers. */
  async headObject(key) { return { key, sizeBytes: 0, eTag: 'test', checksumSha256: null, contentType: null, lastModified: new Date(), metadata: {} }; }

  /** Return one empty test object body. */
  async getObject(key) { return { ...(await this.headObject(key)), body: Buffer.alloc(0) }; }

  /** Ignore test object deletion because this double stores no bytes. */
  async deleteObject() {}

  /** Return one deterministic signed upload placeholder. */
  async createSignedUploadUrl(input) { return { url: `https://storage.example.test/upload/${encodeURIComponent(input.key)}`, expiresAt: new Date(Date.now() + 300_000) }; }

  /** Return one deterministic signed download placeholder. */
  async createSignedDownloadUrl(input) { return { url: `https://storage.example.test/download/${encodeURIComponent(input.key)}`, expiresAt: new Date(Date.now() + 300_000) }; }

  /** Report healthy test storage without any network dependency. */
  async checkHealth() { return { status: 'ok', checkedAt: new Date() }; }

  /** Close the stateless test storage. */
  close() {}
}

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed a compact source scenario that exercises Reports security and cross-module reads. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({ data: [
    { id: COMPANY_A_ID, legalName: 'B20.10 Company A Ltd', displayName: 'B20.10 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
    { id: COMPANY_B_ID, legalName: 'B20.10 Company B Ltd', displayName: 'B20.10 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
  ] });

  for (const code of FULL_PERMISSIONS) {
    await client.permission.upsert({ where: { code }, update: { description: code, domain: 'reports-b20-10' }, create: { code, description: code, domain: 'reports-b20-10' } });
  }

  await client.role.createMany({ data: [
    { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'system-admin', name: 'B20.10 System Admin', isSystem: true, status: 'ACTIVE' },
    { id: SCOPED_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b20-10-scoped', name: 'B20.10 Scoped Reports', isSystem: false, status: 'ACTIVE' },
    { id: READ_ONLY_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b20-10-reports-only', name: 'B20.10 Reports Only', isSystem: false, status: 'ACTIVE' }
  ] });
  await client.rolePermission.createMany({ data: [
    ...FULL_PERMISSIONS.map((permissionCode) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode })),
    ...FULL_PERMISSIONS.map((permissionCode) => ({ roleId: SCOPED_A_ROLE_ID, permissionCode })),
    { roleId: READ_ONLY_A_ROLE_ID, permissionCode: 'reports.read' }
  ] });
  await client.user.createMany({ data: [
    { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b20-10-admin-a@example.test', name: 'B20.10 Admin A', passwordHash, status: 'ACTIVE' },
    { id: SCOPED_A_ID, companyId: COMPANY_A_ID, email: 'b20-10-scoped-a@example.test', name: 'B20.10 Scoped A', passwordHash, status: 'ACTIVE' },
    { id: READ_ONLY_A_ID, companyId: COMPANY_A_ID, email: 'b20-10-reports-only@example.test', name: 'B20.10 Reports Only', passwordHash, status: 'ACTIVE' }
  ] });
  await client.userRole.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, roleId: SCOPED_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: READ_ONLY_A_ID, roleId: READ_ONLY_A_ROLE_ID, status: 'ACTIVE' }
  ] });

  await client.client.createMany({ data: [
    { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B2010-CLIENT-A', legalName: 'B20.10 Client A Ltd', displayName: 'B20.10 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B2010-CLIENT-B', legalName: 'B20.10 Client B Ltd', displayName: 'B20.10 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
  ] });
  await client.project.createMany({ data: [
    { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B2010-A', name: 'B20.10 Project A', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '1000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') },
    { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B2010-A2', name: 'B20.10 Project A2', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '500000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B2010-B', name: 'B20.10 Project B', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '750000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') }
  ] });
  await client.userProjectScope.create({ data: { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' } });

  await client.projectStage.create({ data: { id: STAGE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '1000000.00', status: 'ACTIVE' } });
  await client.stageProgressBaseline.create({ data: { id: BASELINE_A_ID, projectId: PROJECT_A_ID, versionNo: 1, status: 'FROZEN', totalWeightPercent: '100.0000', frozenAt: new Date('2026-08-01T12:00:00.000Z'), frozenBy: ADMIN_A_ID } });
  await client.stageProgressUpdate.create({ data: { id: PROGRESS_A_ID, stageId: STAGE_A_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-20T00:00:00.000Z'), enteredBy: ADMIN_A_ID, approvedBy: ADMIN_A_ID, approvedAt: new Date('2026-08-20T12:00:00.000Z'), status: 'APPROVED' } });
  await client.costActual.create({ data: { id: COST_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, category: 'site_expense', sourceType: 'site_expense', sourceId: 'B2010-EXPENSE', sourceKey: 'site_expense:B2010-EXPENSE', amount: '300.00', postingDate: new Date('2026-08-21T00:00:00.000Z') } });

  await client.glAccount.create({ data: { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'B2010-BANK', name: 'B20.10 Bank', accountType: 'ASSET', status: 'ACTIVE' } });
  await client.cashBankAccount.create({ data: { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'B2010-BANK', name: 'B20.10 Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' } });
  await client.clientInvoice.create({ data: { id: INVOICE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID, invoiceNo: 'INV-B2010-1', invoiceDate: new Date('2026-08-22T00:00:00.000Z'), dueDate: new Date('2026-08-30T00:00:00.000Z'), status: 'ISSUED', subtotal: '1000.00', taxAmount: '0.00', totalAmount: '1000.00', lines: { create: [{ stageId: STAGE_A_ID, description: 'B20.10 billed stage', amount: '1000.00' }] } } });
  await client.clientReceipt.createMany({ data: [
    { id: RECEIPT_A_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, receiptNo: 'REC-B2010-1', receiptDate: new Date('2026-08-23T00:00:00.000Z'), amount: '700.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-23T12:00:00.000Z') },
    { id: ADVANCE_A2_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A2_ID, stageId: null, receiptNo: 'REC-B2010-ADV', receiptDate: new Date('2026-08-24T00:00:00.000Z'), amount: '500.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'ADVANCE', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-24T12:00:00.000Z') }
  ] });
  await client.clientReceiptAllocation.create({ data: { id: ALLOCATION_A_ID, receiptId: RECEIPT_A_ID, clientInvoiceId: INVOICE_A_ID, amount: '600.00', allocatedAt: new Date('2026-08-25T12:00:00.000Z'), allocatedBy: ADMIN_A_ID } });
}

/** Run one Reports scenario against the disposable PostgreSQL/API runtime. */
async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const client = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  let app;
  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);
    app = buildApp({ database: client, objectStorage: new TestObjectStorage(), nodeEnv: 'test', logLevel: 'silent', authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET });
    await app.ready();
    await work({ app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect().catch(() => undefined);
  }
}

/** Login one seeded actor and return its opaque access token. */
async function signIn(app, email) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASSWORD } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Execute one authenticated Reports GET request. */
async function reportsGet(app, token, path) {
  return app.inject({ method: 'GET', url: `/api/v1/reports${path}`, headers: { authorization: `Bearer ${token}` } });
}

/** Execute one authenticated Reports POST request. */
async function reportsPost(app, token, path, payload) {
  return app.inject({ method: 'POST', url: `/api/v1/reports${path}`, headers: { authorization: `Bearer ${token}` }, payload });
}

/** Return one stable public error code from a Fastify response. */
function errorCode(response) { return response.json().error?.code; }

test('B20.10 live catalog requires both Reports permission and each source-module read permission', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b20-10-admin-a@example.test');
    const reportsOnlyToken = await signIn(app, 'b20-10-reports-only@example.test');
    let response = await reportsGet(app, adminToken, '/catalog');
    assert.equal(response.statusCode, 200, response.body);
    const codes = response.json().data.items.map((item) => item.code);
    for (const code of ['stage-progress', 'project-cost', 'client-outstanding']) assert.ok(codes.includes(code), `missing ${code}`);
    assert.equal(codes.includes('attendance'), false);

    response = await reportsGet(app, reportsOnlyToken, '/catalog');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items, []);
  });
});

test('B20.10 live Stage Progress and Project Cost reports read approved source rows', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b20-10-admin-a@example.test');
    let response = await reportsPost(app, token, '/run', { reportCode: 'stage-progress', filters: { projectId: PROJECT_A_ID } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.rows.length, 1);
    assert.equal(response.json().data.rows[0].id, STAGE_A_ID);
    assert.equal(response.json().data.rows[0].approvedPhysicalProgressPercent, '60');

    response = await reportsPost(app, token, '/run', { reportCode: 'project-cost', filters: { projectId: PROJECT_A_ID, page: 1, pageSize: 10 } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.rows[0].sourceKey, 'site_expense:B2010-EXPENSE');
    assert.equal(response.json().data.rows[0].amount, '300');
  });
});

test('B20.10 live Client outstanding and advance respect the optional Project filter without double counting', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b20-10-admin-a@example.test');
    let response = await reportsPost(app, token, '/run', { reportCode: 'client-outstanding', filters: { clientId: CLIENT_A_ID, projectId: PROJECT_A_ID } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.rows[0], {
      clientId: CLIENT_A_ID,
      billedAmount: '1000.00',
      receivedAmount: '700.00',
      allocatedAmount: '600.00',
      outstandingAmount: '400.00',
      advanceAmount: '100.00'
    });

    response = await reportsPost(app, token, '/run', { reportCode: 'client-advance', filters: { clientId: CLIENT_A_ID, projectId: PROJECT_A2_ID } });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.rows[0], {
      clientId: CLIENT_A_ID,
      billedAmount: '0.00',
      receivedAmount: '500.00',
      allocatedAmount: '0.00',
      outstandingAmount: '0.00',
      advanceAmount: '500.00'
    });
  });
});

test('B20.10 live Project scope, source permission and cross-Company requests fail closed', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const scopedToken = await signIn(app, 'b20-10-scoped-a@example.test');
    const reportsOnlyToken = await signIn(app, 'b20-10-reports-only@example.test');
    const adminToken = await signIn(app, 'b20-10-admin-a@example.test');

    let response = await reportsPost(app, scopedToken, '/run', { reportCode: 'stage-progress', filters: { projectId: PROJECT_A_ID } });
    assert.equal(response.statusCode, 200, response.body);
    response = await reportsPost(app, scopedToken, '/run', { reportCode: 'stage-progress', filters: { projectId: PROJECT_A2_ID } });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'REPORT_SCOPE_FORBIDDEN');
    response = await reportsPost(app, reportsOnlyToken, '/run', { reportCode: 'stage-progress', filters: { projectId: PROJECT_A_ID } });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'REPORT_SCOPE_FORBIDDEN');
    response = await reportsPost(app, adminToken, '/run', { reportCode: 'stage-progress', filters: { projectId: PROJECT_B_ID } });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'REPORT_SCOPE_FORBIDDEN');
  });
});

test('B20.10 live saved filters and queued exports remain user-owned and durable', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app, 'b20-10-admin-a@example.test');
    const scopedToken = await signIn(app, 'b20-10-scoped-a@example.test');
    let response = await reportsPost(app, adminToken, '/saved-filters', { reportCode: 'stage-progress', name: 'Project A progress', filters: { projectId: PROJECT_A_ID } });
    assert.equal(response.statusCode, 201, response.body);
    response = await reportsGet(app, adminToken, '/saved-filters?reportCode=stage-progress');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((item) => item.name), ['Project A progress']);

    response = await reportsPost(app, adminToken, '/exports', { reportCode: 'stage-progress', filters: { projectId: PROJECT_A_ID }, outputFormat: 'CSV' });
    assert.equal(response.statusCode, 202, response.body);
    const run = response.json().data;
    assert.equal(run.status, 'QUEUED');
    assert.equal(run.fileId, null);
    assert.equal(await client.reportRun.count({ where: { id: run.id, companyId: COMPANY_A_ID, requestedBy: ADMIN_A_ID } }), 1);

    response = await reportsGet(app, adminToken, `/runs/${run.id}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'QUEUED');
    response = await reportsGet(app, scopedToken, `/runs/${run.id}`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'REPORT_SCOPE_FORBIDDEN');
  });
});

test('B20.10 live OpenAPI exposes exactly the seven frozen Reports operations', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/reports/catalog', 'listReportCatalog'],
      ['post', '/api/v1/reports/run', 'runReport'],
      ['post', '/api/v1/reports/exports', 'createReportExport'],
      ['get', '/api/v1/reports/runs/{id}', 'getReportRun'],
      ['get', '/api/v1/reports/runs/{id}/download', 'downloadReportRun'],
      ['get', '/api/v1/reports/saved-filters', 'listSavedReportFilters'],
      ['post', '/api/v1/reports/saved-filters', 'saveReportFilter']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/reports')).length, 6);
  });
});
