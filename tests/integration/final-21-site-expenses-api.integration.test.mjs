import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000014901';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000014902';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000014910';
const READER_A_ID = '00000000-0000-4000-8000-000000014911';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000014912';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000014920';
const READER_A_ROLE_ID = '00000000-0000-4000-8000-000000014921';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000014922';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000014930';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000014931';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000014940';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000014941';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000014942';
const STAGE_A_ID = '00000000-0000-4000-8000-000000014950';
const STAGE_A2_ID = '00000000-0000-4000-8000-000000014951';
const STAGE_B_ID = '00000000-0000-4000-8000-000000014952';
const EXPENSE_GL_A_ID = '00000000-0000-4000-8000-000000014960';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000014961';
const EXPENSE_GL_B_ID = '00000000-0000-4000-8000-000000014962';
const BANK_GL_B_ID = '00000000-0000-4000-8000-000000014963';
const BANK_A_ID = '00000000-0000-4000-8000-000000014970';
const BANK_B_ID = '00000000-0000-4000-8000-000000014971';
const CATEGORY_A_ID = '00000000-0000-4000-8000-000000014980';
const CATEGORY_B_ID = '00000000-0000-4000-8000-000000014981';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000014990';
const PERIOD_B_ID = '00000000-0000-4000-8000-000000014991';
const PASSWORD = 'Final21-site-expense-B15.9-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-site-expense-secret-0123456789abcdef';

const SITE_EXPENSE_PERMISSIONS = [
  'site_expenses.read',
  'site_expenses.create',
  'site_expenses.update',
  'site_expenses.post',
  'site_expenses.reverse'
];

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest two-company Project/Stage/Finance graph required by Final Module 14. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);

  await client.company.createMany({
    data: [
      { id: COMPANY_A_ID, legalName: 'B15.9 Company A Ltd', displayName: 'B15.9 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
      { id: COMPANY_B_ID, legalName: 'B15.9 Company B Ltd', displayName: 'B15.9 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
    ]
  });

  const permissions = [];
  for (const code of SITE_EXPENSE_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { description: code, domain: 'site_expenses' },
      create: { code, description: code, domain: 'site_expenses' }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: READER_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'site-expense-reader', name: 'Site Expense Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode: permission.code })),
      ...permissions.map((permission) => ({ roleId: ADMIN_B_ROLE_ID, permissionCode: permission.code })),
      { roleId: READER_A_ROLE_ID, permissionCode: 'site_expenses.read' }
    ]
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b15-9-admin-a@example.test', name: 'B15.9 Admin A', passwordHash, status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'b15-9-reader-a@example.test', name: 'B15.9 Reader A', passwordHash, status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'b15-9-admin-b@example.test', name: 'B15.9 Admin B', passwordHash, status: 'ACTIVE' }
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
      { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B159-CLIENT-A', legalName: 'B15.9 Client A Ltd', displayName: 'B15.9 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B159-CLIENT-B', legalName: 'B15.9 Client B Ltd', displayName: 'B15.9 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B159-PROJECT-A', name: 'B15.9 Project A', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B159-PROJECT-A2', name: 'B15.9 Project A2', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '20000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B159-PROJECT-B', name: 'B15.9 Project B', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '30000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID }
    ]
  });

  await client.projectStage.createMany({
    data: [
      { id: STAGE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' },
      { id: STAGE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A2_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '8000000.00', status: 'ACTIVE' },
      { id: STAGE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '12000000.00', status: 'ACTIVE' }
    ]
  });

  await client.userProjectScope.create({
    data: { companyId: COMPANY_A_ID, userId: READER_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' }
  });

  await client.glAccount.createMany({
    data: [
      { id: EXPENSE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'SITE-EXPENSE', name: 'Site Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
      { id: EXPENSE_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'SITE-EXPENSE', name: 'Site Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: BANK_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' }
    ]
  });

  await client.cashBankAccount.createMany({
    data: [
      { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' },
      { id: BANK_B_ID, companyId: COMPANY_B_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_B_ID, status: 'ACTIVE' }
    ]
  });

  await client.expenseCategory.createMany({
    data: [
      { id: CATEGORY_A_ID, companyId: COMPANY_A_ID, code: 'FUEL', name: 'Fuel', defaultGlAccountId: EXPENSE_GL_A_ID, status: 'ACTIVE' },
      { id: CATEGORY_B_ID, companyId: COMPANY_B_ID, code: 'FUEL', name: 'Fuel', defaultGlAccountId: EXPENSE_GL_B_ID, status: 'ACTIVE' }
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
      { companyId: COMPANY_A_ID, sequenceKey: 'site-expense', prefix: 'SE-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_A_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'site-expense', prefix: 'SE-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
}

/** Run one Final Module 14 scenario against the disposable PostgreSQL/API runtime. */
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

/** Login one seeded actor and return the opaque access token. */
async function signIn(app, email) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Execute one authenticated Site Expense write with the required idempotency key. */
async function expenseWrite(app, token, method, url, payload, idempotencyKey) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
    ...(payload === undefined ? {} : { payload })
  });
}

/** Create one valid BANK Site Expense for a selected Project/Stage. */
async function createExpense(app, token, overrides = {}, key = 'b15-9-create') {
  const response = await expenseWrite(app, token, 'POST', '/api/v1/site-expenses', {
    projectId: overrides.projectId ?? PROJECT_A_ID,
    stageId: overrides.stageId ?? STAGE_A_ID,
    expenseDate: overrides.expenseDate ?? '2026-08-29',
    categoryId: overrides.categoryId ?? CATEGORY_A_ID,
    description: overrides.description ?? 'Generator fuel for site operations',
    amount: overrides.amount ?? '125.50',
    paymentMode: overrides.paymentMode ?? 'BANK',
    cashBankAccountId: overrides.cashBankAccountId ?? BANK_A_ID
  }, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return one stable public error code from a Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Convert one Prisma Decimal-compatible amount into integer paisa for exact reconciliation assertions. */
function moneyMinorUnits(value) {
  const text = value.toString();
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [whole = '0', fraction = ''] = unsigned.split('.');
  const minorUnits = BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
  return negative ? -minorUnits : minorUnits;
}

test('B15.9 live API posts one expense into exactly one Finance journal and one Project/Stage cost source', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b15-9-admin-a@example.test');
    const created = await createExpense(app, token);
    assert.equal(created.status, 'DRAFT');

    let response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/post`, {}, 'b15-9-post');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'POSTED');

    response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/post`, {}, 'b15-9-post');
    assert.equal(response.statusCode, 200, response.body);
    response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/post`, {}, 'b15-9-post-second-key');
    assert.equal(response.statusCode, 200, response.body);

    const sourceKey = `site_expense:${created.id}`;
    const costs = await client.costActual.findMany({ where: { companyId: COMPANY_A_ID, sourceKey } });
    const journals = await client.journal.findMany({ where: { companyId: COMPANY_A_ID, sourceKey }, include: { lines: true } });
    assert.equal(costs.length, 1);
    assert.equal(costs[0].projectId, PROJECT_A_ID);
    assert.equal(costs[0].stageId, STAGE_A_ID);
    assert.equal(costs[0].category, 'site_expense');
    assert.equal(moneyMinorUnits(costs[0].amount), 12550n);
    assert.equal(journals.length, 1);
    assert.equal(journals[0].status, 'POSTED');
    assert.equal(journals[0].lines.length, 2);
    assert.equal(journals[0].totalDebit.toString(), '125.5');
    assert.equal(journals[0].totalCredit.toString(), '125.5');
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_A_ID, entityId: created.id, action: 'site_expense.posted' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, resourceId: created.id, eventType: 'site_expense.posted' } }), 1);
  });
});

test('B15.9 live reversal appends compensating Finance and Job Cost effects without rewriting original history', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b15-9-admin-a@example.test');
    const created = await createExpense(app, token, {}, 'b15-9-create-reversal');
    let response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/post`, {}, 'b15-9-post-reversal');
    assert.equal(response.statusCode, 200, response.body);

    response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/reverse`, {}, 'b15-9-reverse');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'REVERSED');
    response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/reverse`, {}, 'b15-9-reverse');
    assert.equal(response.statusCode, 200, response.body);

    const originalKey = `site_expense:${created.id}`;
    const reversalKey = `site_expense_reversal:${created.id}`;
    const costs = await client.costActual.findMany({ where: { companyId: COMPANY_A_ID, sourceKey: { in: [originalKey, reversalKey] } }, orderBy: { sourceKey: 'asc' } });
    const journals = await client.journal.findMany({ where: { companyId: COMPANY_A_ID, sourceKey: { in: [originalKey, reversalKey] } }, include: { lines: true } });
    assert.equal(costs.length, 2);
    assert.equal(costs.reduce((sum, row) => sum + moneyMinorUnits(row.amount), 0n), 0n);
    assert.equal(journals.length, 2);
    for (const journal of journals) assert.equal(moneyMinorUnits(journal.totalDebit), moneyMinorUnits(journal.totalCredit));
    assert.equal(await client.siteExpense.count({ where: { id: created.id, companyId: COMPANY_A_ID, status: 'REVERSED' } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_A_ID, entityId: created.id, action: 'site_expense.reversed' } }), 1);
  });
});

test('B15.9 live permission, Project scope and cross-company isolation reject unauthorized access', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b15-9-admin-a@example.test');
    const readerToken = await signIn(app, 'b15-9-reader-a@example.test');
    const foreignToken = await signIn(app, 'b15-9-admin-b@example.test');
    const projectAExpense = await createExpense(app, adminToken, {}, 'b15-9-scope-create-a');
    const projectA2Expense = await createExpense(app, adminToken, { projectId: PROJECT_A2_ID, stageId: STAGE_A2_ID }, 'b15-9-scope-create-a2');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/site-expenses?projectId=' + PROJECT_A_ID,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, projectAExpense.id);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/site-expenses?projectId=' + PROJECT_A2_ID,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/site-expenses/${projectA2Expense.id}`,
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'EXPENSE_NOT_FOUND');

    response = await expenseWrite(app, readerToken, 'POST', '/api/v1/site-expenses', {
      projectId: PROJECT_A_ID,
      stageId: STAGE_A_ID,
      expenseDate: '2026-08-29',
      categoryId: CATEGORY_A_ID,
      description: 'Reader must not create this expense',
      amount: '1.00',
      paymentMode: 'BANK',
      cashBankAccountId: BANK_A_ID
    }, 'b15-9-reader-create');
    assert.equal(response.statusCode, 403, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/site-expenses/${projectAExpense.id}`,
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'EXPENSE_NOT_FOUND');
  });
});

test('B15.9 live Finance failure rolls back cost posting and leaves the Site Expense DRAFT', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b15-9-admin-a@example.test');
    const created = await createExpense(app, token, {}, 'b15-9-rollback-create');
    await client.fiscalPeriod.update({ where: { id: PERIOD_A_ID }, data: { status: 'CLOSED' } });

    const response = await expenseWrite(app, token, 'POST', `/api/v1/site-expenses/${created.id}/post`, {}, 'b15-9-rollback-post');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'FISCAL_PERIOD_CLOSED');
    assert.equal(await client.costActual.count({ where: { companyId: COMPANY_A_ID, sourceKey: `site_expense:${created.id}` } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_A_ID, sourceKey: `site_expense:${created.id}` } }), 0);
    assert.equal(await client.siteExpense.count({ where: { id: created.id, companyId: COMPANY_A_ID, status: 'DRAFT' } }), 1);
  });
});

test('B15.9 live OpenAPI exposes the exact six Site Expense operations with validated request contracts', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/site-expenses', 'listSiteExpenses'],
      ['post', '/api/v1/site-expenses', 'createSiteExpense'],
      ['get', '/api/v1/site-expenses/{id}', 'getSiteExpense'],
      ['patch', '/api/v1/site-expenses/{id}', 'updateSiteExpense'],
      ['post', '/api/v1/site-expenses/{id}/post', 'postSiteExpense'],
      ['post', '/api/v1/site-expenses/{id}/reverse', 'reverseSiteExpense']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
      assert.ok(spec.paths[path][method].responses['200'] || spec.paths[path][method].responses['201']);
    }
    assert.ok(spec.paths['/api/v1/site-expenses'].get.parameters.some((parameter) => parameter.name === 'pageSize'));
    assert.ok(spec.paths['/api/v1/site-expenses'].post.parameters.some((parameter) => parameter.name === 'idempotency-key' && parameter.required === true));
    assert.ok(spec.paths['/api/v1/site-expenses/{id}/post'].post.requestBody);
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/site-expenses')).length, 4);
  });
});
