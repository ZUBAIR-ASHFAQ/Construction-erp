import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000017001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000017002';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000017010';
const READER_A_ID = '00000000-0000-4000-8000-000000017011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000017012';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000017020';
const READER_A_ROLE_ID = '00000000-0000-4000-8000-000000017021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000017022';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000017030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000017031';
const PROJECT_FIXED_ID = '00000000-0000-4000-8000-000000017040';
const PROJECT_COST_PLUS_ID = '00000000-0000-4000-8000-000000017041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000017042';
const STAGE_FIXED_ID = '00000000-0000-4000-8000-000000017050';
const STAGE_COST_PLUS_ID = '00000000-0000-4000-8000-000000017051';
const STAGE_B_ID = '00000000-0000-4000-8000-000000017052';
const RECEIVABLE_A_ID = '00000000-0000-4000-8000-000000017060';
const REVENUE_A_ID = '00000000-0000-4000-8000-000000017061';
const RECEIVABLE_B_ID = '00000000-0000-4000-8000-000000017062';
const REVENUE_B_ID = '00000000-0000-4000-8000-000000017063';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000017070';
const PERIOD_B_ID = '00000000-0000-4000-8000-000000017071';
const PASSWORD = 'Final21-client-billing-B17.10-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-client-billing-secret-0123456789abcdef';

const BILLING_PERMISSIONS = [
  'client_billing.read',
  'client_billing.settings.manage',
  'claims.create',
  'claims.edit',
  'claims.finalize',
  'client_invoices.create',
  'client_invoices.read',
  'stages.financial.read'
];

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum two-company Client Billing, Stage, Job Cost and Finance graph. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({
    data: [
      { id: COMPANY_A_ID, legalName: 'B17.10 Company A Ltd', displayName: 'B17.10 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
      { id: COMPANY_B_ID, legalName: 'B17.10 Company B Ltd', displayName: 'B17.10 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
    ]
  });

  const permissions = [];
  for (const code of BILLING_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { description: code, domain: code.startsWith('stages.') ? 'project_stages' : 'client_billing' },
      create: { code, description: code, domain: code.startsWith('stages.') ? 'project_stages' : 'client_billing' }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b17-10-admin', name: 'B17.10 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b17-10-reader', name: 'B17.10 Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'b17-10-admin', name: 'B17.10 Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode: permission.code })),
      ...permissions.map((permission) => ({ roleId: ADMIN_B_ROLE_ID, permissionCode: permission.code })),
      { roleId: READER_A_ROLE_ID, permissionCode: 'client_billing.read' },
      { roleId: READER_A_ROLE_ID, permissionCode: 'client_invoices.read' }
    ]
  });
  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b17-10-admin-a@example.test', name: 'B17.10 Admin A', passwordHash, status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'b17-10-reader-a@example.test', name: 'B17.10 Reader A', passwordHash, status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'b17-10-admin-b@example.test', name: 'B17.10 Admin B', passwordHash, status: 'ACTIVE' }
    ]
  });
  await client.userRole.createMany({
    data: [
      { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_A_ROLE_ID, status: 'ACTIVE' },
      { companyId: COMPANY_A_ID, userId: READER_A_ID, roleId: READER_A_ROLE_ID, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, status: 'ACTIVE' }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B1710-CLIENT-A', legalName: 'B17.10 Client A Ltd', displayName: 'B17.10 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B1710-CLIENT-B', legalName: 'B17.10 Client B Ltd', displayName: 'B17.10 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
    ]
  });
  await client.project.createMany({
    data: [
      { id: PROJECT_FIXED_ID, companyId: COMPANY_A_ID, projectCode: 'B1710-FIXED', name: 'B17.10 Fixed Price Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_COST_PLUS_ID, companyId: COMPANY_A_ID, projectCode: 'B1710-COST', name: 'B17.10 Cost Plus Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'COST_PLUS_PERCENTAGE', projectValue: '0.00', costPlusPercent: '10.0000', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B1710-B', name: 'B17.10 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '30000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID }
    ]
  });
  await client.projectStage.createMany({
    data: [
      { id: STAGE_FIXED_ID, companyId: COMPANY_A_ID, projectId: PROJECT_FIXED_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' },
      { id: STAGE_COST_PLUS_ID, companyId: COMPANY_A_ID, projectId: PROJECT_COST_PLUS_ID, code: 'COST', name: 'Cost Basis Stage', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '0.00', status: 'ACTIVE' },
      { id: STAGE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '12000000.00', status: 'ACTIVE' }
    ]
  });
  await client.userProjectScope.create({ data: { companyId: COMPANY_A_ID, userId: READER_A_ID, projectId: PROJECT_FIXED_ID, status: 'ACTIVE' } });

  await client.glAccount.createMany({
    data: [
      { id: RECEIVABLE_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
      { id: REVENUE_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-REVENUE', name: 'Client Revenue', accountType: 'REVENUE', status: 'ACTIVE' },
      { id: RECEIVABLE_B_ID, companyId: COMPANY_B_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
      { id: REVENUE_B_ID, companyId: COMPANY_B_ID, accountCode: 'CLIENT-REVENUE', name: 'Client Revenue', accountType: 'REVENUE', status: 'ACTIVE' }
    ]
  });
  await client.fiscalPeriod.createMany({
    data: [
      { id: PERIOD_A_ID, companyId: COMPANY_A_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' },
      { id: PERIOD_B_ID, companyId: COMPANY_B_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' }
    ]
  });
  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_A_ID, sequenceKey: 'progress-claim', prefix: 'CLM-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_A_ID, sequenceKey: 'client-invoice', prefix: 'INV-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_A_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'progress-claim', prefix: 'CLM-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'client-invoice', prefix: 'INV-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
  await client.costActual.createMany({
    data: [
      { companyId: COMPANY_A_ID, projectId: PROJECT_COST_PLUS_ID, stageId: STAGE_COST_PLUS_ID, category: 'labour', sourceType: 'b17_10_fixture', sourceId: 'stage-cost-1', sourceKey: 'b17-10:stage-cost-1', amount: '1000.00', postingDate: new Date('2026-08-15T00:00:00.000Z') },
      { companyId: COMPANY_A_ID, projectId: PROJECT_COST_PLUS_ID, stageId: null, category: 'other', sourceType: 'b17_10_fixture', sourceId: 'project-cost-1', sourceKey: 'b17-10:project-cost-1', amount: '500.00', postingDate: new Date('2026-08-16T00:00:00.000Z') }
    ]
  });
}

/** Run one Client Billing scenario against the disposable PostgreSQL/API runtime. */
async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  let app;
  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);
    app = buildApp({ database: client, nodeEnv: 'test', logLevel: 'silent', authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET });
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

/** Execute one authenticated Client Billing write with a required idempotency key. */
async function billingWrite(app, token, method, url, payload, idempotencyKey) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
    ...(payload === undefined ? {} : { payload })
  });
}

/** Configure one Project billing settings record through the public contract. */
async function saveSettings(app, token, projectId, input, key) {
  const response = await billingWrite(app, token, 'PUT', `/api/v1/client-billing/projects/${projectId}/settings`, input, key);
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Create one draft Progress Claim through the public contract. */
async function createClaim(app, token, input, key) {
  const response = await billingWrite(app, token, 'POST', '/api/v1/client-billing/claims', input, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Finalize one Progress Claim through the public command. */
async function finalizeClaim(app, token, claimId, key) {
  const response = await billingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${claimId}/finalize`, {}, key);
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Issue and Finance-post one Client Invoice from a finalized Claim. */
async function createInvoice(app, token, claimId, key) {
  const response = await billingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${claimId}/invoice`, {
    invoiceDate: '2026-08-29',
    dueDate: '2026-09-28'
  }, key);
  assert.ok(response.statusCode === 201 || response.statusCode === 200, response.body);
  return response.json().data;
}

/** Return one stable public error code from a Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Convert one Decimal-compatible money value to integer paisa. */
function moneyMinorUnits(value) {
  const text = value.toString();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const result = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -result : result;
}

test('B17.10 live Fixed Price Claim -> Invoice -> Finance -> Stage billed workflow is idempotent and reconciled', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b17-10-admin-a@example.test');
    await saveSettings(app, token, PROJECT_FIXED_ID, {
      billingMethod: 'FIXED_PRICE', retentionPercent: '10.0000', billingCycle: 'MONTHLY', advanceRecoveryEnabled: false, status: 'ACTIVE'
    }, 'b17-10-fixed-settings');

    const claim = await createClaim(app, token, {
      projectId: PROJECT_FIXED_ID,
      periodEnd: '2026-08-25',
      lines: [{ stageId: STAGE_FIXED_ID, description: 'Grey Structure certified work', billingProgressPercent: '50.0000', amount: '1000.00' }]
    }, 'b17-10-fixed-claim');
    const replayedClaim = await createClaim(app, token, {
      projectId: PROJECT_FIXED_ID,
      periodEnd: '2026-08-25',
      lines: [{ stageId: STAGE_FIXED_ID, description: 'Grey Structure certified work', billingProgressPercent: '50.0000', amount: '1000.00' }]
    }, 'b17-10-fixed-claim');
    assert.equal(replayedClaim.id, claim.id);

    const finalized = await finalizeClaim(app, token, claim.id, 'b17-10-fixed-finalize');
    assert.equal(finalized.status, 'FINALIZED');
    assert.equal(moneyMinorUnits(finalized.grossValue), 100000n);
    assert.equal(moneyMinorUnits(finalized.retention), 10000n);
    assert.equal(moneyMinorUnits(finalized.netCertified), 90000n);
    assert.equal((await finalizeClaim(app, token, claim.id, 'b17-10-fixed-finalize')).id, claim.id);

    const invoice = await createInvoice(app, token, claim.id, 'b17-10-fixed-invoice');
    const replayedInvoice = await createInvoice(app, token, claim.id, 'b17-10-fixed-invoice');
    assert.equal(replayedInvoice.id, invoice.id);
    assert.equal(invoice.status, 'ISSUED');
    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].stageId, STAGE_FIXED_ID);
    assert.equal(moneyMinorUnits(invoice.totalAmount), 90000n);

    const journals = await client.journal.findMany({ where: { companyId: COMPANY_A_ID, sourceKey: `client_invoice:${invoice.id}` }, include: { lines: true } });
    assert.equal(journals.length, 1);
    assert.equal(moneyMinorUnits(journals[0].totalDebit), 90000n);
    assert.equal(moneyMinorUnits(journals[0].totalCredit), 90000n);
    assert.equal(journals[0].lines.filter((line) => line.stageId === STAGE_FIXED_ID && moneyMinorUnits(line.credit) === 90000n).length, 1);

    const financials = await app.inject({ method: 'GET', url: `/api/v1/projects/${PROJECT_FIXED_ID}/stages/${STAGE_FIXED_ID}/financials`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(financials.statusCode, 200, financials.body);
    assert.equal(moneyMinorUnits(financials.json().data.billedAmount), 90000n);
    assert.equal(moneyMinorUnits(financials.json().data.receivedAmount), 0n);
    assert.equal(moneyMinorUnits(financials.json().data.outstandingAmount), 90000n);
    assert.equal(await client.clientInvoice.count({ where: { claimId: claim.id } }), 1);
  });
});

test('B17.10 live Cost + Percentage uses posted Project/Stage cost and rejects cumulative over-certification', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b17-10-admin-a@example.test');
    await saveSettings(app, token, PROJECT_COST_PLUS_ID, {
      billingMethod: 'COST_PLUS_PERCENTAGE', retentionPercent: null, billingCycle: 'MONTHLY', advanceRecoveryEnabled: false, status: 'ACTIVE'
    }, 'b17-10-cost-settings');
    const claim = await createClaim(app, token, {
      projectId: PROJECT_COST_PLUS_ID,
      periodEnd: '2026-08-25',
      lines: [{ stageId: STAGE_COST_PLUS_ID, description: 'Eligible stage cost plus 10 percent', amount: '1100.00' }]
    }, 'b17-10-cost-claim');
    const finalized = await finalizeClaim(app, token, claim.id, 'b17-10-cost-finalize');
    assert.equal(moneyMinorUnits(finalized.grossValue), 110000n);

    const second = await createClaim(app, token, {
      projectId: PROJECT_COST_PLUS_ID,
      periodEnd: '2026-08-25',
      lines: [{ stageId: STAGE_COST_PLUS_ID, description: 'Duplicate stage cost basis', amount: '1.00' }]
    }, 'b17-10-cost-over-claim');
    const response = await billingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${second.id}/finalize`, {}, 'b17-10-cost-over-finalize');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'INVALID_BILLING_BASIS');
  });
});

test('B17.10 live Stage mismatch, permissions, Project scope and cross-Company isolation are rejected', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b17-10-admin-a@example.test');
    const readerToken = await signIn(app, 'b17-10-reader-a@example.test');
    const foreignToken = await signIn(app, 'b17-10-admin-b@example.test');

    let response = await billingWrite(app, adminToken, 'POST', '/api/v1/client-billing/claims', {
      projectId: PROJECT_FIXED_ID, periodEnd: '2026-08-25', lines: [{ stageId: STAGE_COST_PLUS_ID, description: 'Wrong Project Stage', amount: '1.00' }]
    }, 'b17-10-stage-mismatch');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'BILLING_STAGE_INVALID');

    response = await billingWrite(app, readerToken, 'POST', '/api/v1/client-billing/claims', {
      projectId: PROJECT_FIXED_ID, periodEnd: '2026-08-25', lines: [{ stageId: STAGE_FIXED_ID, description: 'Denied create', amount: '1.00' }]
    }, 'b17-10-reader-create');
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({ method: 'GET', url: `/api/v1/client-billing/claims?projectId=${PROJECT_COST_PLUS_ID}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 403, response.body);

    const claim = await createClaim(app, adminToken, {
      projectId: PROJECT_FIXED_ID, periodEnd: '2026-08-25', lines: [{ stageId: STAGE_FIXED_ID, description: 'Scope claim', amount: '10.00' }]
    }, 'b17-10-scope-claim');
    response = await app.inject({ method: 'GET', url: `/api/v1/client-billing/claims?projectId=${PROJECT_FIXED_ID}`, headers: { authorization: `Bearer ${foreignToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === claim.id), false);
  });
});

test('B17.10 live Finance period failure rolls Client Invoice and Journal back while keeping finalized Claim history', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b17-10-admin-a@example.test');
    const claim = await createClaim(app, token, {
      projectId: PROJECT_FIXED_ID, periodEnd: '2026-08-25', lines: [{ stageId: STAGE_FIXED_ID, description: 'Rollback claim', amount: '125.00' }]
    }, 'b17-10-rollback-claim');
    await finalizeClaim(app, token, claim.id, 'b17-10-rollback-finalize');
    await client.fiscalPeriod.update({ where: { id: PERIOD_A_ID }, data: { status: 'CLOSED' } });

    const response = await billingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${claim.id}/invoice`, {
      invoiceDate: '2026-08-29', dueDate: '2026-09-28'
    }, 'b17-10-rollback-invoice');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'FISCAL_PERIOD_CLOSED');
    assert.equal(await client.clientInvoice.count({ where: { claimId: claim.id } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_A_ID, sourceType: 'client_invoice' } }), 0);
    assert.equal(await client.progressClaim.count({ where: { id: claim.id, status: 'FINALIZED' } }), 1);
  });
});

test('B17.10 live OpenAPI exposes exactly nine Client Billing operations and five idempotent writes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/client-billing/projects/{projectId}/settings', 'getClientBillingSettings'],
      ['put', '/api/v1/client-billing/projects/{projectId}/settings', 'updateClientBillingSettings'],
      ['get', '/api/v1/client-billing/claims', 'listClientBillingClaims'],
      ['post', '/api/v1/client-billing/claims', 'createClientBillingClaim'],
      ['patch', '/api/v1/client-billing/claims/{id}', 'updateClientBillingClaim'],
      ['post', '/api/v1/client-billing/claims/{id}/finalize', 'finalizeClientBillingClaim'],
      ['post', '/api/v1/client-billing/claims/{id}/invoice', 'createClientBillingInvoice'],
      ['get', '/api/v1/client-billing/invoices', 'listClientBillingInvoices'],
      ['get', '/api/v1/client-billing/invoices/{id}', 'getClientBillingInvoice']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
    }
    for (const [method, path] of [
      ['put', '/api/v1/client-billing/projects/{projectId}/settings'],
      ['post', '/api/v1/client-billing/claims'],
      ['patch', '/api/v1/client-billing/claims/{id}'],
      ['post', '/api/v1/client-billing/claims/{id}/finalize'],
      ['post', '/api/v1/client-billing/claims/{id}/invoice']
    ]) {
      assert.ok(spec.paths[path][method].parameters.some((parameter) => parameter.name === 'idempotency-key' && parameter.required === true));
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/client-billing')).length, 7);
  });
});
