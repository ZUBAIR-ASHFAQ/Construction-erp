import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000021001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000021002';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000021010';
const SCOPED_A_ID = '00000000-0000-4000-8000-000000021011';
const NO_FINANCE_A_ID = '00000000-0000-4000-8000-000000021012';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000021020';
const SCOPED_A_ROLE_ID = '00000000-0000-4000-8000-000000021021';
const NO_FINANCE_A_ROLE_ID = '00000000-0000-4000-8000-000000021022';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000021030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000021031';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000021040';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000021041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000021042';
const STAGE_A_ID = '00000000-0000-4000-8000-000000021050';
const BASELINE_A_ID = '00000000-0000-4000-8000-000000021051';
const PROGRESS_A_ID = '00000000-0000-4000-8000-000000021052';
const BUDGET_A_ID = '00000000-0000-4000-8000-000000021060';
const COST_A_ID = '00000000-0000-4000-8000-000000021061';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000021070';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000021071';
const ADVANCE_GL_A_ID = '00000000-0000-4000-8000-000000021072';
const AR_GL_A_ID = '00000000-0000-4000-8000-000000021073';
const REVENUE_GL_A_ID = '00000000-0000-4000-8000-000000021074';
const BANK_A_ID = '00000000-0000-4000-8000-000000021075';
const INVOICE_A_ID = '00000000-0000-4000-8000-000000021080';
const RECEIPT_A_ID = '00000000-0000-4000-8000-000000021081';
const ALLOCATION_A_ID = '00000000-0000-4000-8000-000000021082';
const PASSWORD = 'Final21-dashboard-B1.10-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-dashboard-secret-0123456789abcdef';

const FULL_PERMISSIONS = [
  'dashboard.read',
  'dashboard.project.read',
  'dashboard.finance.read',
  'dashboard.manage_preferences',
  'stages.read',
  'job_cost.read',
  'project_profitability.read',
  'project_profitability.finance.read',
  'project_profitability.portfolio.read',
  'finance.read'
];
const BASIC_PERMISSIONS = ['dashboard.read', 'dashboard.project.read', 'stages.read'];

/** Tiny object-storage double so the final runtime also registers Documents and Reports. */
class TestObjectStorage {
  /** Accept a test object write without external storage. */
  async putObject(input) { return { key: input.key, sizeBytes: 0, eTag: 'test', checksumSha256: null, contentType: null, lastModified: new Date(), metadata: {} }; }

  /** Return a deterministic test object header. */
  async headObject(key) { return { key, sizeBytes: 0, eTag: 'test', checksumSha256: null, contentType: null, lastModified: new Date(), metadata: {} }; }

  /** Return one empty test object body. */
  async getObject(key) { return { ...(await this.headObject(key)), body: Buffer.alloc(0) }; }

  /** Ignore deletion because this test double stores no bytes. */
  async deleteObject() {}

  /** Return one deterministic signed upload placeholder. */
  async createSignedUploadUrl(input) { return { url: `https://storage.example.test/upload/${encodeURIComponent(input.key)}`, expiresAt: new Date(Date.now() + 300_000) }; }

  /** Return one deterministic signed download placeholder. */
  async createSignedDownloadUrl(input) { return { url: `https://storage.example.test/download/${encodeURIComponent(input.key)}`, expiresAt: new Date(Date.now() + 300_000) }; }

  /** Report healthy test storage without network access. */
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

/** Create one balanced posted Finance Journal with Project and optional Stage dimensions. */
async function createJournal(client, input) {
  await client.journal.create({
    data: {
      id: input.id,
      companyId: COMPANY_A_ID,
      journalNo: input.journalNo,
      postingDate: new Date(`${input.postingDate}T00:00:00.000Z`),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceKey: input.sourceKey,
      description: input.sourceKey,
      status: 'POSTED',
      periodId: PERIOD_A_ID,
      createdBy: ADMIN_A_ID,
      postedAt: new Date(`${input.postingDate}T12:00:00.000Z`),
      totalDebit: input.amount,
      totalCredit: input.amount,
      lines: { create: input.lines }
    }
  });
}

/** Seed one compact Project scenario that proves Dashboard source reconciliation and security. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({ data: [
    { id: COMPANY_A_ID, legalName: 'B1.10 Company A Ltd', displayName: 'B1.10 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
    { id: COMPANY_B_ID, legalName: 'B1.10 Company B Ltd', displayName: 'B1.10 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
  ] });

  for (const code of [...new Set([...FULL_PERMISSIONS, ...BASIC_PERMISSIONS])]) {
    await client.permission.upsert({ where: { code }, update: { description: code, domain: 'dashboard-b1-10' }, create: { code, description: code, domain: 'dashboard-b1-10' } });
  }
  await client.role.createMany({ data: [
    { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'system-admin', name: 'B1.10 System Admin', isSystem: true, status: 'ACTIVE' },
    { id: SCOPED_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b1-10-scoped', name: 'B1.10 Scoped Dashboard', isSystem: false, status: 'ACTIVE' },
    { id: NO_FINANCE_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b1-10-basic', name: 'B1.10 Basic Dashboard', isSystem: false, status: 'ACTIVE' }
  ] });
  await client.rolePermission.createMany({ data: [
    ...FULL_PERMISSIONS.map((permissionCode) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode })),
    ...FULL_PERMISSIONS.map((permissionCode) => ({ roleId: SCOPED_A_ROLE_ID, permissionCode })),
    ...BASIC_PERMISSIONS.map((permissionCode) => ({ roleId: NO_FINANCE_A_ROLE_ID, permissionCode }))
  ] });
  await client.user.createMany({ data: [
    { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b1-10-admin-a@example.test', name: 'B1.10 Admin A', passwordHash, status: 'ACTIVE' },
    { id: SCOPED_A_ID, companyId: COMPANY_A_ID, email: 'b1-10-scoped-a@example.test', name: 'B1.10 Scoped A', passwordHash, status: 'ACTIVE' },
    { id: NO_FINANCE_A_ID, companyId: COMPANY_A_ID, email: 'b1-10-basic-a@example.test', name: 'B1.10 Basic A', passwordHash, status: 'ACTIVE' }
  ] });
  await client.userRole.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, roleId: SCOPED_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: NO_FINANCE_A_ID, roleId: NO_FINANCE_A_ROLE_ID, status: 'ACTIVE' }
  ] });

  await client.client.createMany({ data: [
    { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B110-CLIENT-A', legalName: 'B1.10 Client A Ltd', displayName: 'B1.10 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B110-CLIENT-B', legalName: 'B1.10 Client B Ltd', displayName: 'B1.10 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
  ] });
  await client.project.createMany({ data: [
    { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B110-A', name: 'B1.10 Dashboard Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '1000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2026-08-15T00:00:00.000Z') },
    { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B110-A2', name: 'B1.10 Hidden Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '500.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B110-B', name: 'B1.10 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '750.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') }
  ] });
  await client.userProjectScope.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: NO_FINANCE_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' }
  ] });

  await client.projectStage.create({ data: { id: STAGE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '1000.00', plannedEndDate: new Date('2026-08-10T00:00:00.000Z'), status: 'ACTIVE' } });
  await client.stageProgressBaseline.create({ data: { id: BASELINE_A_ID, projectId: PROJECT_A_ID, versionNo: 1, status: 'FROZEN', totalWeightPercent: '100.0000', frozenAt: new Date('2026-08-01T12:00:00.000Z'), frozenBy: ADMIN_A_ID } });
  await client.stageProgressUpdate.create({ data: { id: PROGRESS_A_ID, stageId: STAGE_A_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-20T00:00:00.000Z'), enteredBy: ADMIN_A_ID, approvedBy: ADMIN_A_ID, approvedAt: new Date('2026-08-20T12:00:00.000Z'), status: 'APPROVED' } });
  await client.projectBudget.create({ data: { id: BUDGET_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, versionNo: 1, status: 'FROZEN', currency: 'PKR', totalAmount: '1000.00', createdBy: ADMIN_A_ID, frozenAt: new Date('2026-08-01T12:00:00.000Z'), lines: { create: [{ stageId: STAGE_A_ID, category: 'material', description: 'B1.10 budget', plannedAmount: '1000.00' }] } } });
  await client.costActual.create({ data: { id: COST_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, category: 'material', sourceType: 'inventory_issue', sourceId: 'B110-COST', sourceKey: 'b1-10:cost:inventory', amount: '250.00', postingDate: new Date('2026-08-21T00:00:00.000Z') } });

  await client.fiscalPeriod.create({ data: { id: PERIOD_A_ID, companyId: COMPANY_A_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' } });
  await client.glAccount.createMany({ data: [
    { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'B110-BANK', name: 'B1.10 Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'B110-ADVANCE', name: 'B1.10 Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: AR_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'B110-AR', name: 'B1.10 Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
    { id: REVENUE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'B110-REVENUE', name: 'B1.10 Revenue', accountType: 'REVENUE', status: 'ACTIVE' }
  ] });
  await client.cashBankAccount.create({ data: { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'B110-BANK', name: 'B1.10 Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' } });

  await client.clientInvoice.create({ data: { id: INVOICE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID, invoiceNo: 'INV-B110-1', invoiceDate: new Date('2026-08-22T00:00:00.000Z'), dueDate: new Date('2026-08-30T00:00:00.000Z'), status: 'ISSUED', subtotal: '1000.00', taxAmount: '0.00', totalAmount: '1000.00', lines: { create: [{ stageId: STAGE_A_ID, description: 'B1.10 stage billing', amount: '1000.00', revenueAccountId: REVENUE_GL_A_ID }] } } });
  await createJournal(client, { id: '00000000-0000-4000-8000-000000021090', journalNo: 'JRN-B110-INV', postingDate: '2026-08-22', sourceType: 'client_invoice', sourceId: INVOICE_A_ID, sourceKey: `client_invoice:${INVOICE_A_ID}`, amount: '1000.00', lines: [
    { accountId: AR_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '1000.00', credit: '0.00', description: 'AR' },
    { accountId: REVENUE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '0.00', credit: '1000.00', description: 'Revenue' }
  ] });

  await client.clientReceipt.create({ data: { id: RECEIPT_A_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, receiptNo: 'REC-B110-1', receiptDate: new Date('2026-08-23T00:00:00.000Z'), amount: '700.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-23T12:00:00.000Z') } });
  await client.clientReceiptAllocation.create({ data: { id: ALLOCATION_A_ID, receiptId: RECEIPT_A_ID, clientInvoiceId: INVOICE_A_ID, amount: '600.00', allocatedAt: new Date('2026-08-24T12:00:00.000Z'), allocatedBy: ADMIN_A_ID } });
  await createJournal(client, { id: '00000000-0000-4000-8000-000000021091', journalNo: 'JRN-B110-REC', postingDate: '2026-08-23', sourceType: 'client_receipt', sourceId: RECEIPT_A_ID, sourceKey: `client_receipt:${RECEIPT_A_ID}`, amount: '700.00', lines: [
    { accountId: BANK_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '700.00', credit: '0.00', description: 'Cash' },
    { accountId: ADVANCE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '0.00', credit: '700.00', description: 'Advance' }
  ] });
  await createJournal(client, { id: '00000000-0000-4000-8000-000000021092', journalNo: 'JRN-B110-ALLOC', postingDate: '2026-08-24', sourceType: 'client_receipt_allocation', sourceId: ALLOCATION_A_ID, sourceKey: `client_receipt_allocation:${ALLOCATION_A_ID}`, amount: '600.00', lines: [
    { accountId: ADVANCE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '600.00', credit: '0.00', description: 'Allocate advance' },
    { accountId: AR_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, debit: '0.00', credit: '600.00', description: 'Reduce AR' }
  ] });
}

/** Run one Dashboard scenario against the disposable PostgreSQL/API runtime. */
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

/** Execute one authenticated Dashboard GET request. */
async function dashboardGet(app, token, path) {
  return app.inject({ method: 'GET', url: `/api/v1/dashboard${path}`, headers: { authorization: `Bearer ${token}` } });
}

/** Return one stable public error code from a Fastify response. */
function errorCode(response) { return response.json().error?.code; }

test('B1.10 live Dashboard reconciles weighted progress, Project cost, billing, cash and profit without conflating cash with profit', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b1-10-admin-a@example.test');
    let response = await dashboardGet(app, token, `/projects?asOfDate=2026-08-31&page=1&pageSize=10`);
    assert.equal(response.statusCode, 200, response.body);
    const project = response.json().data.items.find((item) => item.id === PROJECT_A_ID);
    assert.equal(Number(project.overallPhysicalProgressPercent), 60);

    response = await dashboardGet(app, token, `/projects/${PROJECT_A_ID}?asOfDate=2026-08-31`);
    assert.equal(response.statusCode, 200, response.body);
    const data = response.json().data;
    assert.equal(Number(data.overallPhysicalProgressPercent), 60);
    assert.equal(data.budgetVsActual.budgetCost, '1000.00');
    assert.equal(data.budgetVsActual.actualCost, '250.00');
    assert.deepEqual(data.financialPosition, {
      recognizedRevenue: '1000.00',
      actualCost: '250.00',
      profitAmount: '750.00',
      billedAmount: '1000.00',
      receivedAmount: '700.00',
      allocatedAmount: '600.00',
      advanceAmount: '100.00',
      outstandingAmount: '400.00',
      supplierPayableAmount: '0.00'
    });
    assert.notEqual(data.financialPosition.receivedAmount, data.financialPosition.profitAmount);
  });
});

test('B1.10 live Dashboard alerts are source-derived from overdue Project and Stage state', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b1-10-admin-a@example.test');
    const response = await dashboardGet(app, token, `/alerts?projectId=${PROJECT_A_ID}&asOfDate=2026-08-31`);
    assert.equal(response.statusCode, 200, response.body);
    const codes = response.json().data.items.map((item) => item.code);
    assert.ok(codes.includes('PROJECT_OVERDUE'));
    assert.ok(codes.includes('STAGE_OVERDUE'));
  });
});

test('B1.10 live Dashboard Project scope, cross-Company access and financial visibility fail closed', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const scopedToken = await signIn(app, 'b1-10-scoped-a@example.test');
    const basicToken = await signIn(app, 'b1-10-basic-a@example.test');
    const adminToken = await signIn(app, 'b1-10-admin-a@example.test');

    let response = await dashboardGet(app, scopedToken, `/projects/${PROJECT_A_ID}`);
    assert.equal(response.statusCode, 200, response.body);
    response = await dashboardGet(app, scopedToken, `/projects/${PROJECT_A2_ID}`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'DASHBOARD_SCOPE_FORBIDDEN');
    response = await dashboardGet(app, adminToken, `/projects/${PROJECT_B_ID}`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'DASHBOARD_SCOPE_FORBIDDEN');

    response = await dashboardGet(app, basicToken, `/projects/${PROJECT_A_ID}`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.financialPosition, null);
    assert.equal(response.json().data.budgetVsActual, null);
  });
});

test('B1.10 live Dashboard preference writes remain user-owned, audited and emitted through the outbox', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b1-10-admin-a@example.test');
    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/dashboard/preferences',
      headers: { authorization: `Bearer ${token}` },
      payload: { defaultProjectId: PROJECT_A_ID, defaultFilters: { projectId: PROJECT_A_ID, asOfDate: '2026-08-31' } }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.defaultProjectId, PROJECT_A_ID);
    assert.equal(await client.dashboardPreference.count({ where: { companyId: COMPANY_A_ID, userId: ADMIN_A_ID } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_A_ID, action: 'dashboard.preferences_updated' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, eventType: 'dashboard.preferences_updated' } }), 1);
  });
});

test('B1.10 live OpenAPI exposes exactly the five frozen Dashboard operations', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/dashboard/summary', 'getDashboardSummary'],
      ['get', '/api/v1/dashboard/projects', 'listDashboardProjects'],
      ['get', '/api/v1/dashboard/projects/{projectId}', 'getProjectDashboard'],
      ['get', '/api/v1/dashboard/alerts', 'listDashboardAlerts'],
      ['patch', '/api/v1/dashboard/preferences', 'updateDashboardPreferences']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/dashboard')).length, 5);
  });
});
