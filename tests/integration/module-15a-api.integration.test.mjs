import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000015000';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000015100';
const ADMIN_ID = '00000000-0000-4000-8000-000000015010';
const PROJECT_ACCOUNTANT_ID = '00000000-0000-4000-8000-000000015011';
const PROJECT_REPORTER_ID = '00000000-0000-4000-8000-000000015012';
const MEMBER_ONLY_ID = '00000000-0000-4000-8000-000000015013';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000015110';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000015020';
const PROJECT_ACCOUNTANT_ROLE_ID = '00000000-0000-4000-8000-000000015021';
const PROJECT_REPORTER_ROLE_ID = '00000000-0000-4000-8000-000000015022';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000015120';
const CLIENT_ID = '00000000-0000-4000-8000-000000015030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000015130';
const PROJECT_ID = '00000000-0000-4000-8000-000000015040';
const PROJECT_2_ID = '00000000-0000-4000-8000-000000015041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000015140';
const WBS_ID = '00000000-0000-4000-8000-000000015050';
const WBS_2_ID = '00000000-0000-4000-8000-000000015051';
const WBS_B_ID = '00000000-0000-4000-8000-000000015150';
const COST_CODE_ID = '00000000-0000-4000-8000-000000015060';
const COST_CODE_2_ID = '00000000-0000-4000-8000-000000015061';
const COST_CODE_B_ID = '00000000-0000-4000-8000-000000015160';
const COST_TYPE_ID = '00000000-0000-4000-8000-000000015070';
const INACTIVE_COST_TYPE_ID = '00000000-0000-4000-8000-000000015071';
const COST_TYPE_B_ID = '00000000-0000-4000-8000-000000015170';
const COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000015080';
const COST_STRUCTURE_2_ID = '00000000-0000-4000-8000-000000015081';
const INACTIVE_COST_STRUCTURE_ID = '00000000-0000-4000-8000-000000015082';
const COST_STRUCTURE_B_ID = '00000000-0000-4000-8000-000000015180';
const CASH_ACCOUNT_ID = '00000000-0000-4000-8000-000000015090';
const EXPENSE_ACCOUNT_ID = '00000000-0000-4000-8000-000000015091';
const FOREIGN_ACCOUNT_ID = '00000000-0000-4000-8000-000000015190';
const OPEN_PERIOD_ID = '00000000-0000-4000-8000-0000000150a0';
const CLOSED_PERIOD_ID = '00000000-0000-4000-8000-0000000150a1';
const FOREIGN_PERIOD_ID = '00000000-0000-4000-8000-0000000151a0';
const PASSWORD = 'Module15a-pass-207-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const FINANCE_PERMISSIONS = [
  'finance.accounts.read',
  'finance.journals.read',
  'finance.journals.create',
  'finance.journals.post',
  'finance.periods.close',
  'finance.reports.read'
];

/** Load built runtime packages only when the disposable PostgreSQL gate is enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum two-Company Finance Core, Project-cost and RBAC scenario. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 15A Company Ltd',
        displayName: 'Module 15A Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 15A Foreign Company Ltd',
        displayName: 'Module 15A Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of FINANCE_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'finance' },
      create: { code, name: code, domain: 'finance' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' },
      { id: PROJECT_ACCOUNTANT_ROLE_ID, companyId: COMPANY_ID, code: 'finance-project-accountant', name: 'Finance Project Accountant', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_REPORTER_ROLE_ID, companyId: COMPANY_ID, code: 'finance-project-reporter', name: 'Finance Project Reporter', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'System Administrator', isSystem: true, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...FINANCE_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: PROJECT_ACCOUNTANT_ROLE_ID, permissionId: permissionByCode.get('finance.journals.create') },
      { roleId: PROJECT_ACCOUNTANT_ROLE_ID, permissionId: permissionByCode.get('finance.journals.post') },
      { roleId: PROJECT_ACCOUNTANT_ROLE_ID, permissionId: permissionByCode.get('finance.reports.read') },
      { roleId: PROJECT_REPORTER_ROLE_ID, permissionId: permissionByCode.get('finance.reports.read') },
      ...FINANCE_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module15a-admin@example.test', name: 'Module 15A Admin' },
    { id: PROJECT_ACCOUNTANT_ID, companyId: COMPANY_ID, email: 'module15a-accountant@example.test', name: 'Module 15A Project Accountant' },
    { id: PROJECT_REPORTER_ID, companyId: COMPANY_ID, email: 'module15a-reporter@example.test', name: 'Module 15A Project Reporter' },
    { id: MEMBER_ONLY_ID, companyId: COMPANY_ID, email: 'module15a-member@example.test', name: 'Module 15A Member Only' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module15a-admin-b@example.test', name: 'Module 15A Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_ACCOUNTANT_ID, roleId: PROJECT_ACCOUNTANT_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_REPORTER_ID, roleId: PROJECT_REPORTER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_ID,
        companyId: COMPANY_ID,
        code: 'MODULE15A-CLIENT',
        legalName: 'Module 15A Client Ltd',
        displayName: 'Module 15A Client',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'MODULE15A-FOREIGN-CLIENT',
        legalName: 'Module 15A Foreign Client Ltd',
        displayName: 'Module 15A Foreign Client',
        billingAddress: 'Karachi, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      }
    ]
  });

  await client.project.createMany({
    data: [
      {
        id: PROJECT_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE15A-PROJECT-A',
        name: 'Module 15A Project A',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_2_ID,
        companyId: COMPANY_ID,
        projectCode: 'MODULE15A-PROJECT-B',
        name: 'Module 15A Project B',
        clientId: CLIENT_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_ID,
        location: 'Islamabad, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_B_ID,
        projectCode: 'MODULE15A-FOREIGN-PROJECT',
        name: 'Module 15A Foreign Project',
        clientId: CLIENT_B_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_B_ID,
        location: 'Karachi, Pakistan'
      }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_ACCOUNTANT_ID, projectRole: 'ACCOUNTANT', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_REPORTER_ID, projectRole: 'REPORTER', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: MEMBER_ONLY_ID, projectRole: 'MEMBER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.wbsNode.createMany({
    data: [
      { id: WBS_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, parentId: null, code: 'A', name: 'Project A WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_2_ID, companyId: COMPANY_ID, projectId: PROJECT_2_ID, parentId: null, code: 'B', name: 'Project B WBS', level: 0, status: 'ACTIVE', sortOrder: 10 },
      { id: WBS_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, parentId: null, code: 'F', name: 'Foreign WBS', level: 0, status: 'ACTIVE', sortOrder: 10 }
    ]
  });

  await client.costCode.createMany({
    data: [
      { id: COST_CODE_ID, companyId: COMPANY_ID, code: '1000', name: 'Direct Cost', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_2_ID, companyId: COMPANY_ID, code: '2000', name: 'Other Cost', category: 'DIRECT', status: 'ACTIVE' },
      { id: COST_CODE_B_ID, companyId: COMPANY_B_ID, code: '9000', name: 'Foreign Cost', category: 'DIRECT', status: 'ACTIVE' }
    ]
  });

  await client.costType.createMany({
    data: [
      { id: COST_TYPE_ID, companyId: COMPANY_ID, code: 'LAB', name: 'Labor', status: 'ACTIVE' },
      { id: INACTIVE_COST_TYPE_ID, companyId: COMPANY_ID, code: 'OLD', name: 'Inactive Cost Type', status: 'INACTIVE' },
      { id: COST_TYPE_B_ID, companyId: COMPANY_B_ID, code: 'FOR', name: 'Foreign Cost Type', status: 'ACTIVE' }
    ]
  });

  await client.projectCostCode.createMany({
    data: [
      { id: COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_2_ID, projectId: PROJECT_2_ID, wbsNodeId: WBS_2_ID, costCodeId: COST_CODE_2_ID, costTypeId: COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: INACTIVE_COST_STRUCTURE_ID, projectId: PROJECT_ID, wbsNodeId: WBS_ID, costCodeId: COST_CODE_2_ID, costTypeId: INACTIVE_COST_TYPE_ID, isPostingAllowed: true, status: 'ACTIVE' },
      { id: COST_STRUCTURE_B_ID, projectId: PROJECT_B_ID, wbsNodeId: WBS_B_ID, costCodeId: COST_CODE_B_ID, costTypeId: COST_TYPE_B_ID, isPostingAllowed: true, status: 'ACTIVE' }
    ]
  });

  await client.glAccount.createMany({
    data: [
      { id: CASH_ACCOUNT_ID, companyId: COMPANY_ID, accountCode: '1000', name: 'Cash', accountType: 'ASSET', parentId: null, status: 'ACTIVE' },
      { id: EXPENSE_ACCOUNT_ID, companyId: COMPANY_ID, accountCode: '5000', name: 'Project Expense', accountType: 'EXPENSE', parentId: null, status: 'ACTIVE' },
      { id: FOREIGN_ACCOUNT_ID, companyId: COMPANY_B_ID, accountCode: '1000', name: 'Foreign Cash', accountType: 'ASSET', parentId: null, status: 'ACTIVE' }
    ]
  });

  await client.fiscalPeriod.createMany({
    data: [
      { id: OPEN_PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2026, periodNo: 1, startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: new Date('2026-01-31T00:00:00.000Z'), status: 'OPEN' },
      { id: CLOSED_PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2026, periodNo: 2, startDate: new Date('2026-02-01T00:00:00.000Z'), endDate: new Date('2026-02-28T00:00:00.000Z'), status: 'CLOSED' },
      { id: FOREIGN_PERIOD_ID, companyId: COMPANY_B_ID, fiscalYear: 2026, periodNo: 1, startDate: new Date('2026-01-01T00:00:00.000Z'), endDate: new Date('2026-01-31T00:00:00.000Z'), status: 'OPEN' }
    ]
  });

  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'finance.journal', prefix: 'JRN-A-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'finance.journal', prefix: 'JRN-B-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
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

/** Sign in one seeded Finance user and return the server-issued access token. */
async function signIn(app, email = 'module15a-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Create one manual Finance journal through the reviewed Stage-11 endpoint. */
async function createJournal(app, token, payload) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/finance/journals',
    headers: { authorization: `Bearer ${token}` },
    payload
  });
}

/** Send one bodyless journal lifecycle command. */
async function journalCommand(app, token, journalId, command) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/finance/journals/${journalId}/${command}`,
    headers: { authorization: `Bearer ${token}` }
  });
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Return one balanced two-line journal payload with optional Project mapping. */
function balancedJournalPayload(amount, projectId = null, costStructureId = null) {
  const dimensions = projectId ? { projectId, ...(costStructureId ? { costStructureId } : {}) } : {};
  return {
    postingDate: '2026-01-15',
    description: 'Pass 207 Finance integration journal',
    lines: [
      { accountId: CASH_ACCOUNT_ID, debit: amount, credit: '0', description: 'Debit line', ...dimensions },
      { accountId: EXPENSE_ACCOUNT_ID, debit: '0', credit: amount, description: 'Credit line', ...dimensions }
    ]
  };
}

/** Find one trial-balance row by account code for concise assertions. */
function trialRow(result, accountCode) {
  return result.rows.find((row) => row.accountCode === accountCode);
}

test('Module 15A PostgreSQL/Fastify workflow posts, reports, reverses and closes with exact decimals', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/finance/accounts?page=1&pageSize=20' });
    assert.equal(response.statusCode, 401, response.body);

    const token = await signIn(app);
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/accounts?page=1&pageSize=20',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 2);
    assert.deepEqual(response.json().data.items.map((account) => account.accountCode), ['1000', '5000']);

    const companyDraftResponse = await createJournal(app, token, balancedJournalPayload('100.00'));
    assert.equal(companyDraftResponse.statusCode, 201, companyDraftResponse.body);
    const companyDraft = companyDraftResponse.json().data;
    assert.equal(companyDraft.status, 'DRAFT');
    assert.equal(companyDraft.journalNo, 'JRN-A-0001');
    assert.equal(companyDraft.periodId, OPEN_PERIOD_ID);
    assert.equal(companyDraft.totalDebit, '100');
    assert.equal(companyDraft.totalCredit, '100');

    const projectDraftResponse = await createJournal(
      app,
      token,
      balancedJournalPayload('25.50', PROJECT_ID, COST_STRUCTURE_ID)
    );
    assert.equal(projectDraftResponse.statusCode, 201, projectDraftResponse.body);
    const projectDraft = projectDraftResponse.json().data;
    assert.equal(projectDraft.journalNo, 'JRN-A-0002');
    assert.equal(projectDraft.lines.every((line) => line.projectId === PROJECT_ID), true);
    assert.equal(projectDraft.lines.every((line) => line.costStructureId === COST_STRUCTURE_ID), true);

    const unbalancedResponse = await createJournal(app, token, {
      ...balancedJournalPayload('10.00'),
      description: 'Unbalanced draft is allowed',
      lines: [
        { accountId: CASH_ACCOUNT_ID, debit: '10.00', credit: '0', description: 'Only debit' }
      ]
    });
    assert.equal(unbalancedResponse.statusCode, 201, unbalancedResponse.body);
    const unbalanced = unbalancedResponse.json().data;
    response = await journalCommand(app, token, unbalanced.id, 'post');
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'JOURNAL_NOT_BALANCED');

    response = await journalCommand(app, token, companyDraft.id, 'post');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'POSTED');
    response = await journalCommand(app, token, projectDraft.id, 'post');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'POSTED');
    response = await journalCommand(app, token, projectDraft.id, 'post');
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/finance/trial-balance?periodId=${OPEN_PERIOD_ID}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const beforeReversal = response.json().data;
    assert.equal(beforeReversal.totalDebit, '125.5');
    assert.equal(beforeReversal.totalCredit, '125.5');
    assert.equal(trialRow(beforeReversal, '1000').debit, '125.5');
    assert.equal(trialRow(beforeReversal, '5000').credit, '125.5');

    response = await journalCommand(app, token, projectDraft.id, 'reverse');
    assert.equal(response.statusCode, 200, response.body);
    const reversal = response.json().data;
    assert.equal(reversal.status, 'POSTED');
    assert.equal(reversal.sourceType, 'REVERSAL');
    assert.equal(reversal.sourceId, projectDraft.id);
    assert.equal(reversal.lines[0].debit, projectDraft.lines[0].credit);
    assert.equal(reversal.lines[0].credit, projectDraft.lines[0].debit);

    response = await journalCommand(app, token, projectDraft.id, 'reverse');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.id, reversal.id);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/finance/trial-balance?periodId=${OPEN_PERIOD_ID}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const afterReversal = response.json().data;
    assert.equal(trialRow(afterReversal, '1000').debit, '125.5');
    assert.equal(trialRow(afterReversal, '1000').credit, '25.5');
    assert.equal(trialRow(afterReversal, '5000').debit, '25.5');
    assert.equal(trialRow(afterReversal, '5000').credit, '125.5');

    const postingEvents = await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'journal.posted', resourceId: projectDraft.id } });
    const reversalEvents = await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'journal.reversed', resourceId: projectDraft.id } });
    assert.equal(postingEvents, 1);
    assert.equal(reversalEvents, 1);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/periods/${OPEN_PERIOD_ID}/close`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'CLOSED');
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/periods/${OPEN_PERIOD_ID}/close`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'accounting_period.closed', resourceId: OPEN_PERIOD_ID } }), 1);

    response = await createJournal(app, token, balancedJournalPayload('5.00'));
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'ACCOUNTING_PERIOD_CLOSED');

    const journalAudits = await client.auditLog.findMany({
      where: { companyId: COMPANY_ID, entityType: 'journal', entityId: { in: [companyDraft.id, projectDraft.id] } },
      select: { action: true, actorUserId: true }
    });
    assert.ok(journalAudits.some((row) => row.action === 'journal.posted'));
    assert.ok(journalAudits.some((row) => row.action === 'journal.reversed'));
    assert.ok(journalAudits.every((row) => row.actorUserId === ADMIN_ID));
  });
});

test('Module 15A security enforces Company ownership, exact Project permission and posting mappings', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const adminToken = await signIn(app);
    const projectToken = await signIn(app, 'module15a-accountant@example.test');
    const reporterToken = await signIn(app, 'module15a-reporter@example.test');
    const memberToken = await signIn(app, 'module15a-member@example.test');
    const foreignToken = await signIn(app, 'module15a-admin-b@example.test');

    let response = await createJournal(app, projectToken, balancedJournalPayload('12.00', PROJECT_ID, COST_STRUCTURE_ID));
    assert.equal(response.statusCode, 201, response.body);
    const projectJournal = response.json().data;

    response = await createJournal(app, projectToken, balancedJournalPayload('12.00'));
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createJournal(app, projectToken, balancedJournalPayload('12.00', PROJECT_2_ID, COST_STRUCTURE_2_ID));
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createJournal(app, memberToken, balancedJournalPayload('12.00', PROJECT_ID, COST_STRUCTURE_ID));
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await createJournal(app, adminToken, balancedJournalPayload('12.00', PROJECT_ID, COST_STRUCTURE_2_ID));
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'POSTING_MAPPING_MISSING');

    response = await createJournal(app, adminToken, balancedJournalPayload('12.00', PROJECT_ID, INACTIVE_COST_STRUCTURE_ID));
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'POSTING_MAPPING_MISSING');

    response = await createJournal(app, adminToken, {
      ...balancedJournalPayload('12.00'),
      lines: [
        { accountId: FOREIGN_ACCOUNT_ID, debit: '12.00', credit: '0', description: 'Foreign account' },
        { accountId: EXPENSE_ACCOUNT_ID, debit: '0', credit: '12.00', description: 'Local account' }
      ]
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'ACCOUNT_NOT_FOUND');

    response = await createJournal(app, adminToken, balancedJournalPayload('12.00', PROJECT_B_ID, COST_STRUCTURE_B_ID));
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'POSTING_MAPPING_MISSING');

    response = await createJournal(app, adminToken, {
      ...balancedJournalPayload('12.00'),
      companyId: COMPANY_B_ID,
      sourceType: 'ATTACK',
      totalDebit: '999.99'
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(errorCode(response), 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/finance/periods/${OPEN_PERIOD_ID}/close`,
      headers: { authorization: `Bearer ${projectToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await journalCommand(app, projectToken, projectJournal.id, 'post');
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/finance/trial-balance?periodId=${OPEN_PERIOD_ID}`,
      headers: { authorization: `Bearer ${reporterToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.totalDebit, '12');
    assert.equal(response.json().data.totalCredit, '12');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/finance/trial-balance?periodId=${OPEN_PERIOD_ID}`,
      headers: { authorization: `Bearer ${memberToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/finance/accounts?page=1&pageSize=20',
      headers: { authorization: `Bearer ${foreignToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((account) => account.id), [FOREIGN_ACCOUNT_ID]);

    const foreignJournalResponse = await createJournal(app, foreignToken, {
      postingDate: '2026-01-15',
      description: 'Foreign company journal',
      lines: [
        { accountId: FOREIGN_ACCOUNT_ID, debit: '1.00', credit: '1.00', description: 'Foreign journal line' }
      ]
    });
    assert.equal(foreignJournalResponse.statusCode, 201, foreignJournalResponse.body);
    response = await journalCommand(app, adminToken, foreignJournalResponse.json().data.id, 'post');
    assert.equal(response.statusCode, 404, response.body);

    assert.equal(await client.journal.count({ where: { companyId: COMPANY_B_ID } }), 1);
  });
});

test('Module 15A database constraints reject direct cross-Company and cross-Project Finance writes', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    await assert.rejects(
      client.glAccount.create({
        data: {
          companyId: COMPANY_ID,
          accountCode: 'BAD-PARENT',
          name: 'Invalid parent account',
          accountType: 'ASSET',
          parentId: FOREIGN_ACCOUNT_ID,
          status: 'ACTIVE'
        }
      }),
      /same Company|constraint|23514/i
    );

    await assert.rejects(
      client.journal.create({
        data: {
          companyId: COMPANY_ID,
          journalNo: 'DIRECT-BAD-PERIOD',
          sourceType: 'MANUAL',
          sourceId: null,
          postingDate: new Date('2026-01-15T00:00:00.000Z'),
          periodId: FOREIGN_PERIOD_ID,
          description: 'Cross-company period attack',
          status: 'DRAFT',
          totalDebit: '1.00',
          totalCredit: '1.00'
        }
      }),
      /same Company|constraint|23514/i
    );

    const validJournal = await client.journal.create({
      data: {
        companyId: COMPANY_ID,
        journalNo: 'DIRECT-VALID',
        sourceType: 'MANUAL',
        sourceId: null,
        postingDate: new Date('2026-01-15T00:00:00.000Z'),
        periodId: OPEN_PERIOD_ID,
        description: 'Direct scope fixture',
        status: 'DRAFT',
        totalDebit: '1.00',
        totalCredit: '1.00'
      }
    });

    await assert.rejects(
      client.journalLine.create({
        data: {
          journalId: validJournal.id,
          accountId: FOREIGN_ACCOUNT_ID,
          projectId: null,
          costStructureId: null,
          debit: '1.00',
          credit: '0',
          description: 'Foreign account attack'
        }
      }),
      /Journal Company|constraint|23514/i
    );

    await assert.rejects(
      client.journalLine.create({
        data: {
          journalId: validJournal.id,
          accountId: CASH_ACCOUNT_ID,
          projectId: PROJECT_B_ID,
          costStructureId: null,
          debit: '1.00',
          credit: '0',
          description: 'Foreign Project attack'
        }
      }),
      /Journal Company|constraint|23514/i
    );

    await assert.rejects(
      client.journalLine.create({
        data: {
          journalId: validJournal.id,
          accountId: CASH_ACCOUNT_ID,
          projectId: PROJECT_ID,
          costStructureId: COST_STRUCTURE_2_ID,
          debit: '1.00',
          credit: '0',
          description: 'Cross-Project cost structure attack'
        }
      }),
      /selected Project|constraint|23514/i
    );
  });
});

test('Module 15A live OpenAPI exposes only the six reviewed Finance Core operations and strict authority boundaries', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();

    const expected = [
      ['GET', '/api/v1/finance/accounts', 'module15aListFinanceAccounts'],
      ['POST', '/api/v1/finance/journals', 'module15aCreateManualJournal'],
      ['POST', '/api/v1/finance/journals/{id}/post', 'module15aPostJournal'],
      ['POST', '/api/v1/finance/journals/{id}/reverse', 'module15aReverseJournal'],
      ['GET', '/api/v1/finance/trial-balance', 'module15aGetTrialBalance'],
      ['POST', '/api/v1/finance/periods/{id}/close', 'module15aCloseFiscalPeriod']
    ];
    const documented = [];

    for (const [method, route, operationId] of expected) {
      const operation = document.paths?.[route]?.[method.toLowerCase()];
      assert.ok(operation, `${method} ${route}`);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const financeOperations = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module15a')) {
          financeOperations.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(financeOperations.sort(), documented.sort());

    for (const forbiddenPath of [
      '/api/v1/finance/ap/invoices',
      '/api/v1/finance/ar/invoices',
      '/api/v1/finance/payments',
      '/api/v1/finance/periods/{id}/reopen'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }

    const createBody = document.paths['/api/v1/finance/journals'].post.requestBody.content['application/json'].schema;
    assert.equal(createBody.additionalProperties, false);
    assert.deepEqual(createBody.required, ['postingDate', 'description', 'lines']);
    assert.deepEqual(Object.keys(createBody.properties).sort(), ['description', 'lines', 'postingDate']);
    const line = createBody.properties.lines.items;
    assert.equal(line.additionalProperties, false);
    assert.deepEqual(Object.keys(line.properties).sort(), ['accountId', 'costStructureId', 'credit', 'debit', 'description', 'projectId']);
    for (const forbiddenField of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'journalNo', 'sourceType', 'sourceId', 'periodId', 'status', 'totalDebit', 'totalCredit']) {
      assert.equal(Object.hasOwn(createBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(line.properties, forbiddenField), false, forbiddenField);
    }

    assert.equal(document.paths['/api/v1/finance/journals/{id}/post'].post.requestBody, undefined);
    assert.equal(document.paths['/api/v1/finance/journals/{id}/reverse'].post.requestBody, undefined);
    assert.equal(document.paths['/api/v1/finance/periods/{id}/close'].post.requestBody, undefined);

    const trialQuery = document.paths['/api/v1/finance/trial-balance'].get.parameters ?? [];
    const periodParameter = trialQuery.find((parameter) => parameter.name === 'periodId');
    assert.equal(periodParameter?.required, true);
  });
});

// Verify Finance Core lifecycle commands remain atomic and idempotent under concurrent requests.
test('Module 15A operational concurrency serializes numbering, posting, reversal and period close', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    const createResponses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => createJournal(
        app,
        token,
        {
          ...balancedJournalPayload(`${10 + index}.25`),
          description: `Concurrent Finance journal ${index + 1}`
        }
      ))
    );
    assert.equal(createResponses.every((response) => response.statusCode === 201), true);

    const created = createResponses.map((response) => response.json().data);
    const journalNumbers = created.map((journal) => journal.journalNo).sort();
    assert.deepEqual(journalNumbers, [
      'JRN-A-0001',
      'JRN-A-0002',
      'JRN-A-0003',
      'JRN-A-0004',
      'JRN-A-0005',
      'JRN-A-0006'
    ]);
    assert.equal(new Set(created.map((journal) => journal.id)).size, 6);
    assert.equal(
      (await client.numberSequence.findUniqueOrThrow({
        where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'finance.journal' } }
      })).nextValue,
      7n
    );

    const journalId = created[0].id;
    const postResponses = await Promise.all([
      journalCommand(app, token, journalId, 'post'),
      journalCommand(app, token, journalId, 'post')
    ]);
    assert.deepEqual(postResponses.map((response) => response.statusCode), [200, 200]);
    assert.equal((await client.journal.findUniqueOrThrow({ where: { id: journalId } })).status, 'POSTED');
    assert.equal(await client.auditLog.count({ where: { entityId: journalId, action: 'journal.posted' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: journalId, eventType: 'journal.posted' } }), 1);

    const reverseResponses = await Promise.all([
      journalCommand(app, token, journalId, 'reverse'),
      journalCommand(app, token, journalId, 'reverse')
    ]);
    assert.deepEqual(reverseResponses.map((response) => response.statusCode), [200, 200]);
    const reversalIds = reverseResponses.map((response) => response.json().data.id);
    assert.equal(new Set(reversalIds).size, 1);
    assert.equal((await client.journal.findUniqueOrThrow({ where: { id: journalId } })).status, 'REVERSED');
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID, sourceType: 'REVERSAL', sourceId: journalId } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: journalId, action: 'journal.reversed' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { resourceId: journalId, eventType: 'journal.reversed' } }), 1);

    const raceDraftResponse = await createJournal(app, token, {
      ...balancedJournalPayload('33.33'),
      description: 'Period close concurrency journal'
    });
    assert.equal(raceDraftResponse.statusCode, 201, raceDraftResponse.body);
    const raceJournalId = raceDraftResponse.json().data.id;

    const [closeResponse, racePostResponse] = await Promise.all([
      app.inject({
        method: 'POST',
        url: `/api/v1/finance/periods/${OPEN_PERIOD_ID}/close`,
        headers: { authorization: `Bearer ${token}` }
      }),
      journalCommand(app, token, raceJournalId, 'post')
    ]);
    assert.equal(closeResponse.statusCode, 200, closeResponse.body);
    assert.equal([200, 409].includes(racePostResponse.statusCode), true, racePostResponse.body);
    if (racePostResponse.statusCode === 409) {
      assert.equal(errorCode(racePostResponse), 'ACCOUNTING_PERIOD_CLOSED');
    }

    const closedPeriod = await client.fiscalPeriod.findUniqueOrThrow({ where: { id: OPEN_PERIOD_ID } });
    const raceJournal = await client.journal.findUniqueOrThrow({ where: { id: raceJournalId } });
    assert.equal(closedPeriod.status, 'CLOSED');
    assert.equal(['DRAFT', 'POSTED'].includes(raceJournal.status), true);
    assert.equal(
      await client.outboxEvent.count({ where: { resourceId: raceJournalId, eventType: 'journal.posted' } }),
      raceJournal.status === 'POSTED' ? 1 : 0
    );
    assert.equal(
      await client.auditLog.count({ where: { entityId: raceJournalId, action: 'journal.posted' } }),
      raceJournal.status === 'POSTED' ? 1 : 0
    );
    assert.equal(await client.outboxEvent.count({ where: { resourceId: OPEN_PERIOD_ID, eventType: 'accounting_period.closed' } }), 1);
    assert.equal(await client.auditLog.count({ where: { entityId: OPEN_PERIOD_ID, action: 'accounting_period.closed' } }), 1);
  });
});

// Verify rollback keeps Foundation numbering atomic and reviewed Finance indexes support live read paths without timing thresholds.
test('Module 15A operational rollback and query plans preserve atomic numbering and reviewed indexes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const firstResponse = await createJournal(app, token, {
      ...balancedJournalPayload('44.44'),
      description: 'Rollback fixture journal'
    });
    assert.equal(firstResponse.statusCode, 201, firstResponse.body);
    const firstJournal = firstResponse.json().data;
    assert.equal(firstJournal.journalNo, 'JRN-A-0001');

    await client.numberSequence.update({
      where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'finance.journal' } },
      data: { nextValue: 1n }
    });
    const journalCountBefore = await client.journal.count({ where: { companyId: COMPANY_ID } });
    const lineCountBefore = await client.journalLine.count({ where: { journal: { companyId: COMPANY_ID } } });

    const duplicateResponse = await createJournal(app, token, {
      ...balancedJournalPayload('55.55'),
      description: 'Force duplicate number after sequence allocation'
    });
    assert.equal(duplicateResponse.statusCode, 409, duplicateResponse.body);
    assert.equal(errorCode(duplicateResponse), 'DUPLICATE_FINANCIAL_DOCUMENT');
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_ID } }), journalCountBefore);
    assert.equal(await client.journalLine.count({ where: { journal: { companyId: COMPANY_ID } } }), lineCountBefore);
    assert.equal(
      (await client.numberSequence.findUniqueOrThrow({
        where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'finance.journal' } }
      })).nextValue,
      1n
    );

    await client.numberSequence.update({
      where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'finance.journal' } },
      data: { nextValue: 2n }
    });
    const secondResponse = await createJournal(app, token, {
      ...balancedJournalPayload('66.66'),
      description: 'Number sequence continues after rollback proof'
    });
    assert.equal(secondResponse.statusCode, 201, secondResponse.body);
    assert.equal(secondResponse.json().data.journalNo, 'JRN-A-0002');

    let response = await journalCommand(app, token, firstJournal.id, 'post');
    assert.equal(response.statusCode, 200, response.body);
    response = await journalCommand(app, token, firstJournal.id, 'reverse');
    assert.equal(response.statusCode, 200, response.body);

    await client.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');

      const accountPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, account_code
        FROM gl_accounts
        WHERE company_id = '${COMPANY_ID}'::uuid
        ORDER BY account_code ASC
        LIMIT 25
      `));
      assert.match(accountPlan, /gl_accounts_company_account_code_uq/);

      const periodStatusPlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, journal_no, status
        FROM journals
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND period_id = '${OPEN_PERIOD_ID}'::uuid
          AND status IN ('POSTED', 'REVERSED')
        LIMIT 50
      `));
      assert.match(periodStatusPlan, /journals_company_period_status_idx/);

      const sourcePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, journal_no
        FROM journals
        WHERE company_id = '${COMPANY_ID}'::uuid
          AND source_type = 'REVERSAL'
          AND source_id = '${firstJournal.id}'
        LIMIT 1
      `));
      assert.match(sourcePlan, /journals_company_source_uq|journals_company_source_idx/);

      const linePlan = JSON.stringify(await tx.$queryRawUnsafe(`
        EXPLAIN (FORMAT JSON)
        SELECT id, account_id, debit, credit
        FROM journal_lines
        WHERE journal_id = '${firstJournal.id}'::uuid
        LIMIT 50
      `));
      assert.match(linePlan, /journal_lines_journal_idx/);
    });
  });
});

