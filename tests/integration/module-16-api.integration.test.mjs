import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_ID = '00000000-0000-4000-8000-000000016001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000016002';
const ADMIN_ID = '00000000-0000-4000-8000-000000016010';
const PROJECT_OPERATOR_ID = '00000000-0000-4000-8000-000000016011';
const READER_ID = '00000000-0000-4000-8000-000000016012';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000016013';
const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000016020';
const PROJECT_OPERATOR_ROLE_ID = '00000000-0000-4000-8000-000000016021';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000016022';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000016023';
const CLIENT_ID = '00000000-0000-4000-8000-000000016030';
const OTHER_CLIENT_ID = '00000000-0000-4000-8000-000000016031';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000016032';
const PROJECT_ID = '00000000-0000-4000-8000-000000016040';
const OTHER_PROJECT_ID = '00000000-0000-4000-8000-000000016041';
const CLOSED_PROJECT_ID = '00000000-0000-4000-8000-000000016042';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000016043';
const BOQ_ID = '00000000-0000-4000-8000-000000016050';
const BOQ_REVISION_ID = '00000000-0000-4000-8000-000000016051';
const BOQ_ITEM_ID = '00000000-0000-4000-8000-000000016052';
const OTHER_BOQ_ID = '00000000-0000-4000-8000-000000016053';
const OTHER_BOQ_REVISION_ID = '00000000-0000-4000-8000-000000016054';
const OTHER_BOQ_ITEM_ID = '00000000-0000-4000-8000-000000016055';
const PASSWORD = 'Module16-pass-353-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-module16-auth-secret-0123456789abcdef';

const MODULE_16_PERMISSIONS = [
  'client_billing.read',
  'client_contracts.manage',
  'client_claims.create',
  'client_claims.certify',
  'client_invoices.issue',
  'client_retention.release'
];

/** Load compiled runtime packages only when the disposable PostgreSQL gate is explicitly enabled. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the smallest two-Company Client, Project, RBAC, BOQ and numbering graph needed by Module 16. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_ID,
        legalName: 'Module 16 Company Ltd',
        displayName: 'Module 16 Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Module 16 Foreign Company Ltd',
        displayName: 'Module 16 Foreign Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of MODULE_16_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'client-billing' },
      create: { code, name: code, domain: 'client-billing' }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'module-16-admin', name: 'Module 16 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_OPERATOR_ROLE_ID, companyId: COMPANY_ID, code: 'module-16-project-operator', name: 'Module 16 Project Operator', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'module-16-reader', name: 'Module 16 Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'module-16-admin', name: 'Module 16 Foreign Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...MODULE_16_PERMISSIONS.map((code) => ({ roleId: ADMIN_ROLE_ID, permissionId: permissionByCode.get(code) })),
      ...MODULE_16_PERMISSIONS.map((code) => ({ roleId: PROJECT_OPERATOR_ROLE_ID, permissionId: permissionByCode.get(code) })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('client_billing.read') },
      ...MODULE_16_PERMISSIONS.map((code) => ({ roleId: ADMIN_B_ROLE_ID, permissionId: permissionByCode.get(code) }))
    ]
  });

  const users = [
    { id: ADMIN_ID, companyId: COMPANY_ID, email: 'module16-admin@example.test', name: 'Module 16 Admin' },
    { id: PROJECT_OPERATOR_ID, companyId: COMPANY_ID, email: 'module16-project@example.test', name: 'Module 16 Project Operator' },
    { id: READER_ID, companyId: COMPANY_ID, email: 'module16-reader@example.test', name: 'Module 16 Reader' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'module16-admin-b@example.test', name: 'Module 16 Foreign Admin' }
  ];
  await client.user.createMany({ data: users.map((user) => ({ ...user, status: 'ACTIVE' })) });
  await client.authCredential.createMany({ data: users.map((user) => ({ userId: user.id, passwordHash })) });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: PROJECT_OPERATOR_ID, roleId: PROJECT_OPERATOR_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'PROJECT', scopeId: PROJECT_ID, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      { id: CLIENT_ID, companyId: COMPANY_ID, code: 'M16-CLIENT', legalName: 'Module 16 Client Ltd', displayName: 'Module 16 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: OTHER_CLIENT_ID, companyId: COMPANY_ID, code: 'M16-OTHER', legalName: 'Module 16 Other Client Ltd', displayName: 'Module 16 Other Client', billingAddress: 'Islamabad, Pakistan', status: 'ACTIVE', creditTermsDays: 30 },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'M16-CLIENT-B', legalName: 'Module 16 Foreign Client Ltd', displayName: 'Module 16 Foreign Client', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE', creditTermsDays: 30 }
    ]
  });

  await client.project.createMany({
    data: [
      { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M16-A', name: 'Module 16 Project A', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: OTHER_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M16-OTHER', name: 'Module 16 Other Project', clientId: OTHER_CLIENT_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Islamabad, Pakistan' },
      { id: CLOSED_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'M16-CLOSED', name: 'Module 16 Closed Project', clientId: CLIENT_ID, status: 'CLOSED', currency: 'USD', startDate: new Date('2025-01-01T00:00:00.000Z'), plannedEndDate: new Date('2025-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_ID, location: 'Lahore, Pakistan' },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'M16-B', name: 'Module 16 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'USD', startDate: new Date('2026-01-01T00:00:00.000Z'), plannedEndDate: new Date('2027-12-31T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID, location: 'Karachi, Pakistan' }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: PROJECT_OPERATOR_ID, projectRole: 'COMMERCIAL', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, projectId: PROJECT_ID, userId: READER_ID, projectRole: 'PROJECT_VIEWER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.boq.createMany({
    data: [
      { id: BOQ_ID, companyId: COMPANY_ID, tenderId: null, projectId: PROJECT_ID, code: 'M16-BOQ', title: 'Module 16 Billing BOQ', currency: 'USD', status: 'ACTIVE' },
      { id: OTHER_BOQ_ID, companyId: COMPANY_ID, tenderId: null, projectId: OTHER_PROJECT_ID, code: 'M16-OTHER-BOQ', title: 'Module 16 Other BOQ', currency: 'USD', status: 'ACTIVE' }
    ]
  });
  await client.boqRevision.createMany({
    data: [
      { id: BOQ_REVISION_ID, boqId: BOQ_ID, revisionNo: 1, status: 'FROZEN', effectiveDate: new Date('2026-01-01T00:00:00.000Z'), notes: 'Module 16 integration billing source' },
      { id: OTHER_BOQ_REVISION_ID, boqId: OTHER_BOQ_ID, revisionNo: 1, status: 'FROZEN', effectiveDate: new Date('2026-01-01T00:00:00.000Z'), notes: 'Module 16 integration foreign Project source' }
    ]
  });
  await client.boqItem.createMany({
    data: [
      { id: BOQ_ITEM_ID, boqRevisionId: BOQ_REVISION_ID, itemCode: 'M16-001', description: 'Module 16 measured work', unit: 'm3', quantity: '10.0000', rate: '100.0000', amount: '1000.00' },
      { id: OTHER_BOQ_ITEM_ID, boqRevisionId: OTHER_BOQ_REVISION_ID, itemCode: 'M16-OTHER-001', description: 'Other Project measured work', unit: 'm3', quantity: '10.0000', rate: '100.0000', amount: '1000.00' }
    ]
  });

  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'client-contract', prefix: 'CC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'progress-claim', prefix: 'PC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'client-invoice', prefix: 'INV-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'client-contract', prefix: 'CCB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'progress-claim', prefix: 'PCB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'client-invoice', prefix: 'INVB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
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

/** Sign in one seeded user through the real Module-24A route and return its access token. */
async function signIn(app, email = 'module16-admin@example.test') {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Return the stable public error code from one Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Send one reviewed Client Billing mutation with the mandatory Foundation Idempotency-Key. */
async function clientBillingWrite(app, token, method, url, payload, key) {
  return app.inject({
    method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': key
    },
    payload
  });
}

/** Create one active server-numbered Client Contract through the reviewed public API. */
async function createContract(app, token, overrides = {}, key = 'module16-create-contract') {
  const response = await clientBillingWrite(
    app,
    token,
    'POST',
    '/api/v1/client-billing/contracts',
    {
      projectId: overrides.projectId ?? PROJECT_ID,
      clientId: overrides.clientId ?? CLIENT_ID,
      contractValue: overrides.contractValue ?? '1000.00',
      billingMethod: overrides.billingMethod ?? 'PROGRESS',
      retentionPercent: overrides.retentionPercent ?? '10.0000',
      currency: overrides.currency ?? 'USD',
      ...(overrides.extraBody ?? {})
    },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create one draft server-numbered Progress Claim for the selected Contract. */
async function createClaim(app, token, contractId, periodEnd = '2026-06-30', key = 'module16-create-claim') {
  const response = await clientBillingWrite(
    app,
    token,
    'POST',
    `/api/v1/client-billing/contracts/${contractId}/claims`,
    { periodEnd },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Replace one draft Claim with one BOQ-backed exact-decimal valuation line. */
async function replaceClaimLines(app, token, claimId, overrides = {}, key = 'module16-replace-lines') {
  const response = await clientBillingWrite(
    app,
    token,
    'PUT',
    `/api/v1/client-billing/claims/${claimId}/lines`,
    {
      lines: [{
        boqItemId: overrides.boqItemId ?? BOQ_ITEM_ID,
        description: overrides.description ?? 'Measured concrete work',
        contractQty: overrides.contractQty ?? '10.0000',
        cumulativeQty: overrides.cumulativeQty ?? '2.5000',
        currentQty: overrides.currentQty ?? '2.5000',
        rate: overrides.rate ?? '100.0000',
        currentValue: overrides.currentValue ?? '250.00'
      }]
    },
    key
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Certify one Progress Claim through the reviewed exact-value command. */
async function certifyClaim(app, token, claimId, certifiedValue = '250.00', key = 'module16-certify-claim') {
  const response = await clientBillingWrite(
    app,
    token,
    'POST',
    `/api/v1/client-billing/claims/${claimId}/certify`,
    { certifiedValue },
    key
  );
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data;
}

/** Issue one Client Invoice from one certified Claim through the reviewed command. */
async function issueInvoice(app, token, claimId, key = 'module16-issue-invoice') {
  const response = await clientBillingWrite(
    app,
    token,
    'POST',
    `/api/v1/client-billing/claims/${claimId}/invoice`,
    { invoiceDate: '2026-07-01', dueDate: '2026-07-31' },
    key
  );
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Prepare one certified Claim with a single stable BOQ-backed valuation line. */
async function prepareCertifiedClaim(app, token, suffix = 'main') {
  const contract = await createContract(app, token, {}, `module16-${suffix}-contract`);
  const claim = await createClaim(app, token, contract.id, '2026-06-30', `module16-${suffix}-claim`);
  await replaceClaimLines(app, token, claim.id, {}, `module16-${suffix}-lines`);
  const certified = await certifyClaim(app, token, claim.id, '250.00', `module16-${suffix}-certify`);
  return { contract, claim: certified };
}

/** Return one generated Module-16 OpenAPI operation and fail clearly when it is absent. */
function module16OpenApiOperation(document, route, method) {
  const operation = document.paths?.[route]?.[method.toLowerCase()];
  assert.ok(operation, `Missing OpenAPI operation: ${method.toUpperCase()} ${route}`);
  return operation;
}

/** Install one disposable PostgreSQL trigger that forces a selected Module-16 outbox event to fail. */
async function installModule16OutboxFailure(client, eventType) {
  await client.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION module_16_test_fail_outbox_event()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.event_type = TG_ARGV[0] THEN
        RAISE EXCEPTION 'Module 16 forced outbox failure for %', TG_ARGV[0]
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END;
    $$
  `);
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_16_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe(`
    CREATE TRIGGER module_16_test_fail_outbox
    BEFORE INSERT ON outbox_events
    FOR EACH ROW
    EXECUTE FUNCTION module_16_test_fail_outbox_event('${eventType}')
  `);
}

/** Remove the disposable Module-16 outbox failure trigger and helper function. */
async function removeModule16OutboxFailure(client) {
  await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS module_16_test_fail_outbox ON outbox_events');
  await client.$executeRawUnsafe('DROP FUNCTION IF EXISTS module_16_test_fail_outbox_event()');
}

// Verify the complete reviewed Contract -> Claim -> certification -> Invoice -> retention workflow through real runtime boundaries.
test('Module 16 live workflow creates certified billing, one Invoice and releasable retention', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const contract = await createContract(app, token);
    assert.equal(contract.projectId, PROJECT_ID);
    assert.equal(contract.clientId, CLIENT_ID);
    assert.equal(contract.contractNo, 'CC-0001');
    assert.equal(contract.contractValue, '1000.00');
    assert.equal(contract.revisedValue, '1000.00');
    assert.equal(contract.retentionPercent, '10.0000');
    assert.equal(contract.status, 'ACTIVE');

    const claim = await createClaim(app, token, contract.id);
    assert.equal(claim.claimNo, 'PC-0001');
    assert.equal(claim.status, 'DRAFT');
    assert.equal(claim.currentValue, '0.00');

    const valued = await replaceClaimLines(app, token, claim.id);
    assert.equal(valued.lines.length, 1);
    assert.equal(valued.lines[0].boqItemId, BOQ_ITEM_ID);
    assert.equal(valued.lines[0].currentValue, '250.00');

    const certified = await certifyClaim(app, token, claim.id);
    assert.equal(certified.status, 'CERTIFIED');
    assert.equal(certified.previousValue, '0.00');
    assert.equal(certified.currentValue, '250.00');
    assert.equal(certified.grossValue, '250.00');
    assert.equal(certified.retentionAmount, '25.00');
    assert.equal(certified.deductionAmount, '0.00');
    assert.equal(certified.certifiedValue, '250.00');

    const invoice = await issueInvoice(app, token, claim.id);
    assert.equal(invoice.invoiceNo, 'INV-0001');
    assert.equal(invoice.grossAmount, '250.00');
    assert.equal(invoice.retentionAmount, '25.00');
    assert.equal(invoice.taxAmount, '0.00');
    assert.equal(invoice.totalReceivable, '225.00');
    assert.equal(invoice.status, 'ISSUED');

    const retention = await client.retentionLedger.findFirstOrThrow({
      where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'CLIENT_INVOICE', sourceId: invoice.id }
    });
    assert.equal(retention.amount.toString(), '25');
    assert.equal(retention.releasedAmount.toString(), '0');
    assert.equal(retention.status, 'HELD');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/client-billing/contracts?page=1&pageSize=10',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const listed = response.json().data;
    assert.equal(listed.items.length, 1);
    assert.equal(listed.items[0].claims[0].invoice.id, invoice.id);
    assert.equal(listed.items[0].retentionEntries[0].id, retention.id);

    response = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/retention/${retention.id}/release`,
      {},
      'module16-release-retention'
    );
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.releasedAmount, '25.00');
    assert.equal(response.json().data.status, 'RELEASED');

    for (const eventType of [
      'client_contract.created',
      'progress_claim.submitted',
      'progress_claim.certified',
      'client_invoice.issued',
      'client_retention.released'
    ]) {
      assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } }), 1, eventType);
    }
    const issuedEvent = await client.outboxEvent.findFirstOrThrow({
      where: { companyId: COMPANY_ID, eventType: 'client_invoice.issued', resourceId: invoice.id }
    });
    assert.equal(issuedEvent.payload?.sourceKey, `client-invoice:${invoice.id}`);
    assert.equal(issuedEvent.payload?.financeArAdapterDeferredToStage26, true);
  });
});

// Verify cumulative BOQ history, Contract value limits, certified immutability and duplicate Invoice protection fail closed.
test('Module 16 live valuation guards preserve certified and invoiced history', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app);
    const { contract, claim } = await prepareCertifiedClaim(app, token, 'history');

    let response = await clientBillingWrite(
      app,
      token,
      'PUT',
      `/api/v1/client-billing/claims/${claim.id}/lines`,
      { lines: [{ boqItemId: BOQ_ITEM_ID, description: 'Rewrite certified history', currentValue: '1.00' }] },
      'module16-history-rewrite'
    );
    assert.equal(response.statusCode, 409, response.body);

    const second = await createClaim(app, token, contract.id, '2026-07-31', 'module16-history-claim-2');
    response = await clientBillingWrite(
      app,
      token,
      'PUT',
      `/api/v1/client-billing/claims/${second.id}/lines`,
      {
        lines: [{
          boqItemId: BOQ_ITEM_ID,
          description: 'Regressed cumulative quantity',
          contractQty: '10.0000',
          cumulativeQty: '2.0000',
          currentQty: '0.5000',
          rate: '100.0000',
          currentValue: '50.00'
        }]
      },
      'module16-history-regress'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CLAIM_INVALID_CUMULATIVE_VALUE');

    await replaceClaimLines(app, token, second.id, {
      cumulativeQty: '10.0000',
      currentQty: '7.5000',
      currentValue: '900.00'
    }, 'module16-history-lines-2');
    response = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/claims/${second.id}/certify`,
      { certifiedValue: '900.00' },
      'module16-history-certify-over-contract'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CLAIM_INVALID_CUMULATIVE_VALUE');

    const invoice = await issueInvoice(app, token, claim.id, 'module16-history-invoice');
    response = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/claims/${claim.id}/invoice`,
      { invoiceDate: '2026-07-02', dueDate: '2026-08-01' },
      'module16-history-invoice-duplicate'
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'CLIENT_INVOICE_ALREADY_CREATED');
    assert.equal(invoice.claimId, claim.id);
  });
});

// Verify authentication, six reviewed permissions, Module-24B Project scope and Company isolation remain authoritative.
test('Module 16 live security blocks unauthorized Project and cross-Company billing access', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app);
    const projectToken = await signIn(app, 'module16-project@example.test');
    const readerToken = await signIn(app, 'module16-reader@example.test');
    const foreignToken = await signIn(app, 'module16-admin-b@example.test');

    const projectContract = await createContract(app, adminToken, {}, 'module16-security-contract-a');
    await createContract(app, adminToken, {
      projectId: OTHER_PROJECT_ID,
      clientId: OTHER_CLIENT_ID
    }, 'module16-security-contract-other');

    let response = await app.inject({ method: 'GET', url: '/api/v1/client-billing/contracts' });
    assert.equal(response.statusCode, 401, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/client-billing/contracts?page=1&pageSize=10',
      headers: { authorization: `Bearer ${projectToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((item) => item.projectId), [PROJECT_ID]);

    response = await clientBillingWrite(
      app,
      projectToken,
      'POST',
      '/api/v1/client-billing/contracts',
      { projectId: OTHER_PROJECT_ID, clientId: OTHER_CLIENT_ID, contractValue: '100.00', billingMethod: 'PROGRESS', retentionPercent: '0.0000', currency: 'USD' },
      'module16-security-cross-project'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await clientBillingWrite(
      app,
      readerToken,
      'POST',
      '/api/v1/client-billing/contracts',
      { projectId: PROJECT_ID, clientId: CLIENT_ID, contractValue: '100.00', billingMethod: 'PROGRESS', retentionPercent: '0.0000', currency: 'USD' },
      'module16-security-reader-write'
    );
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'FORBIDDEN');

    response = await clientBillingWrite(
      app,
      adminToken,
      'POST',
      '/api/v1/client-billing/contracts',
      { projectId: PROJECT_ID, clientId: CLIENT_B_ID, contractValue: '100.00', billingMethod: 'PROGRESS', retentionPercent: '0.0000', currency: 'USD' },
      'module16-security-cross-company-client'
    );
    assert.equal(response.statusCode, 404, response.body);

    response = await clientBillingWrite(
      app,
      foreignToken,
      'POST',
      `/api/v1/client-billing/contracts/${projectContract.id}/claims`,
      { periodEnd: '2026-07-31' },
      'module16-security-cross-company-contract'
    );
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'CLIENT_CONTRACT_NOT_FOUND');
  });
});

// Verify browser-owned authority is rejected and Foundation idempotency replays one durable Contract result.
test('Module 16 live HTTP boundary rejects server-owned fields and safely replays writes', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/client-billing/contracts',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: PROJECT_ID, clientId: CLIENT_ID, contractValue: '1000.00', billingMethod: 'PROGRESS', retentionPercent: '10.0000', currency: 'USD' }
    });
    assert.equal(response.statusCode, 400, response.body);

    response = await clientBillingWrite(
      app,
      token,
      'POST',
      '/api/v1/client-billing/contracts',
      { projectId: PROJECT_ID, clientId: CLIENT_ID, contractValue: '1000.00', billingMethod: 'PROGRESS', retentionPercent: '10.0000', currency: 'USD', status: 'ISSUED' },
      'module16-authority-extra-field'
    );
    assert.equal(response.statusCode, 400, response.body);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/client-billing/contracts?page=1&pageSize=101',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 400, response.body);

    const key = 'module16-replay-contract';
    const first = await createContract(app, token, {}, key);
    const replay = await createContract(app, token, {}, key);
    assert.equal(replay.id, first.id);
    assert.equal(await client.clientContract.count({ where: { companyId: COMPANY_ID } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_contract.created', entityId: first.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_contract.created', resourceId: first.id } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'client-billing.contract-create', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);

    response = await clientBillingWrite(
      app,
      token,
      'POST',
      '/api/v1/client-billing/contracts',
      { projectId: PROJECT_ID, clientId: CLIENT_ID, contractValue: '999.00', billingMethod: 'PROGRESS', retentionPercent: '10.0000', currency: 'USD' },
      key
    );
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'IDEMPOTENCY_KEY_REUSED');
  });
});

// Verify a late Invoice outbox failure rolls back Invoice, retention, audit, numbering and idempotency together.
test('Module 16 live forced Invoice outbox failure rolls back the complete billing transaction', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { claim } = await prepareCertifiedClaim(app, token, 'rollback');
    const key = 'module16-rollback-invoice';

    await installModule16OutboxFailure(client, 'client_invoice.issued');
    try {
      const response = await clientBillingWrite(
        app,
        token,
        'POST',
        `/api/v1/client-billing/claims/${claim.id}/invoice`,
        { invoiceDate: '2026-07-01', dueDate: '2026-07-31' },
        key
      );
      assert.equal(response.statusCode, 500, response.body);
    } finally {
      await removeModule16OutboxFailure(client);
    }

    assert.equal(await client.clientInvoice.count({ where: { companyId: COMPANY_ID } }), 0);
    assert.equal(await client.retentionLedger.count({ where: { companyId: COMPANY_ID } }), 0);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_invoice.issued' } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_invoice.issued' } }), 0);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'client-billing.invoice-issue', idempotencyKey: key }
    }), 0);
    const sequence = await client.numberSequence.findUniqueOrThrow({
      where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'client-invoice' } }
    });
    assert.equal(sequence.nextValue, 1n);

    const invoice = await issueInvoice(app, token, claim.id, key);
    assert.equal(invoice.invoiceNo, 'INV-0001');
  });
});

// Verify Stage-23 database triggers preserve issued Invoice, invoiced Claim and released-retention history.
test('Module 16 live PostgreSQL history guards reject direct rewrites of issued billing state', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { claim } = await prepareCertifiedClaim(app, token, 'db-history');
    const invoice = await issueInvoice(app, token, claim.id, 'module16-db-history-invoice');
    const retention = await client.retentionLedger.findFirstOrThrow({ where: { sourceId: invoice.id } });

    let response = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/retention/${retention.id}/release`,
      {},
      'module16-db-history-release'
    );
    assert.equal(response.statusCode, 200, response.body);

    await assert.rejects(client.clientInvoice.update({
      where: { id: invoice.id },
      data: { grossAmount: '1.00' }
    }));
    await assert.rejects(client.progressClaim.update({
      where: { id: claim.id },
      data: { certifiedValue: '1.00' }
    }));
    await assert.rejects(client.retentionLedger.update({
      where: { id: retention.id },
      data: { releasedAmount: '0.00' }
    }));
  });
});

// Verify generated OpenAPI exposes exactly the reviewed Module-16 surface and keeps all server authority out of request schemas.
test('Module 16 live OpenAPI exposes exactly seven reviewed operations and six idempotent writes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const document = response.json();
    assert.equal(document.openapi, '3.0.3');

    const expected = [
      ['GET', '/api/v1/client-billing/contracts', 'module16ListClientContracts'],
      ['POST', '/api/v1/client-billing/contracts', 'module16CreateClientContract'],
      ['POST', '/api/v1/client-billing/contracts/{id}/claims', 'module16CreateProgressClaim'],
      ['PUT', '/api/v1/client-billing/claims/{id}/lines', 'module16ReplaceProgressClaimLines'],
      ['POST', '/api/v1/client-billing/claims/{id}/certify', 'module16CertifyProgressClaim'],
      ['POST', '/api/v1/client-billing/claims/{id}/invoice', 'module16CreateClientInvoice'],
      ['POST', '/api/v1/client-billing/retention/{id}/release', 'module16ReleaseRetention']
    ];

    const documented = [];
    for (const [method, route, operationId] of expected) {
      const operation = module16OpenApiOperation(document, route, method);
      assert.equal(operation.operationId, operationId);
      assert.deepEqual(operation.security, [{ bearerAuth: [] }]);
      documented.push(`${method} ${route}`);
    }

    const actualModule16 = [];
    for (const [route, pathItem] of Object.entries(document.paths ?? {})) {
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        if (pathItem[method]?.operationId?.startsWith('module16')) {
          actualModule16.push(`${method.toUpperCase()} ${route}`);
        }
      }
    }
    assert.deepEqual(actualModule16.sort(), documented.sort());

    for (const [method, route] of expected.filter(([method]) => ['POST', 'PUT'].includes(method))) {
      const parameters = module16OpenApiOperation(document, route, method).parameters ?? [];
      const idempotency = parameters.find((parameter) => parameter.in === 'header' && parameter.name === 'idempotency-key');
      assert.ok(idempotency, `${method} ${route} must require Idempotency-Key`);
      assert.equal(idempotency.required, true);
    }

    const createBody = module16OpenApiOperation(document, '/api/v1/client-billing/contracts', 'POST')
      .requestBody.content['application/json'].schema;
    for (const field of ['companyId', 'actorUserId', 'contractNo', 'revisedValue', 'status']) {
      assert.equal(Object.hasOwn(createBody.properties, field), false, field);
    }

    const certifyBody = module16OpenApiOperation(document, '/api/v1/client-billing/claims/{id}/certify', 'POST')
      .requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(certifyBody.properties), ['certifiedValue']);

    const releaseBody = module16OpenApiOperation(document, '/api/v1/client-billing/retention/{id}/release', 'POST')
      .requestBody.content['application/json'].schema;
    assert.deepEqual(Object.keys(releaseBody.properties), []);

    for (const forbiddenPath of [
      '/api/v1/client-billing/claims/{id}/submit',
      '/api/v1/client-billing/contracts/{id}',
      '/api/v1/client-billing/invoices',
      '/api/v1/client-billing/payments',
      '/api/v1/client-billing/ar'
    ]) {
      assert.equal(Object.hasOwn(document.paths ?? {}, forbiddenPath), false, forbiddenPath);
    }
  });
});

// Verify concurrent retries with one idempotency key create only one Client Contract and one durable side-effect set.
test('Module 16 operational concurrent same-key Client Contract create stays singular', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const key = 'module16-ops-contract-same-key';
    const payload = {
      projectId: PROJECT_ID,
      clientId: CLIENT_ID,
      contractValue: '1000.00',
      billingMethod: 'PROGRESS',
      retentionPercent: '10.0000',
      currency: 'USD'
    };

    const responses = await Promise.all([
      clientBillingWrite(app, token, 'POST', '/api/v1/client-billing/contracts', payload, key),
      clientBillingWrite(app, token, 'POST', '/api/v1/client-billing/contracts', payload, key)
    ]);

    for (const response of responses) assert.equal(response.statusCode, 201, response.body);
    assert.equal(responses[0].json().data.id, responses[1].json().data.id);
    const contractId = responses[0].json().data.id;
    assert.equal(await client.clientContract.count({ where: { id: contractId } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_contract.created', entityId: contractId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_contract.created', resourceId: contractId } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'client-billing.contract-create', idempotencyKey: key, status: 'COMPLETED' }
    }), 1);
    const sequence = await client.numberSequence.findUniqueOrThrow({
      where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'client-contract' } }
    });
    assert.equal(sequence.nextValue, 2n);
  });
});

// Verify concurrent Contract creation on different Projects still allocates collision-free Company numbering.
test('Module 16 operational concurrent different Contract creates allocate distinct Foundation numbers', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const contracts = await Promise.all([
      createContract(app, token, { projectId: PROJECT_ID, clientId: CLIENT_ID }, 'module16-ops-contract-project-a'),
      createContract(app, token, { projectId: OTHER_PROJECT_ID, clientId: OTHER_CLIENT_ID }, 'module16-ops-contract-project-b')
    ]);

    assert.deepEqual(contracts.map((contract) => contract.contractNo).sort(), ['CC-0001', 'CC-0002']);
    assert.equal(await client.clientContract.count({ where: { companyId: COMPANY_ID } }), 2);
    const sequence = await client.numberSequence.findUniqueOrThrow({
      where: { companyId_sequenceKey: { companyId: COMPANY_ID, sequenceKey: 'client-contract' } }
    });
    assert.equal(sequence.nextValue, 3n);
  });
});

// Verify different retry keys cannot create two Client Invoices or two Retention sources for one certified Claim.
test('Module 16 operational concurrent Invoice keys create one immutable billing source', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { claim } = await prepareCertifiedClaim(app, token, 'ops-invoice-race');
    const payload = { invoiceDate: '2026-07-01', dueDate: '2026-07-31' };

    const responses = await Promise.all([
      clientBillingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${claim.id}/invoice`, payload, 'module16-ops-invoice-a'),
      clientBillingWrite(app, token, 'POST', `/api/v1/client-billing/claims/${claim.id}/invoice`, payload, 'module16-ops-invoice-b')
    ]);

    assert.deepEqual(responses.map((response) => response.statusCode).sort(), [201, 409]);
    const success = responses.find((response) => response.statusCode === 201);
    const conflict = responses.find((response) => response.statusCode === 409);
    assert.ok(success);
    assert.ok(conflict);
    assert.equal(errorCode(conflict), 'CLIENT_INVOICE_ALREADY_CREATED');
    const invoiceId = success.json().data.id;
    assert.equal(await client.clientInvoice.count({ where: { claimId: claim.id } }), 1);
    assert.equal(await client.retentionLedger.count({ where: { sourceType: 'CLIENT_INVOICE', sourceId: invoiceId } }), 1);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_invoice.issued', entityId: invoiceId } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_invoice.issued', resourceId: invoiceId } }), 1);
  });
});

// Verify concurrent full-release commands converge on one released balance and one release side-effect set.
test('Module 16 operational concurrent Retention release keys converge without duplicate release events', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { claim } = await prepareCertifiedClaim(app, token, 'ops-retention-race');
    const invoice = await issueInvoice(app, token, claim.id, 'module16-ops-retention-invoice');
    const retention = await client.retentionLedger.findFirstOrThrow({ where: { sourceId: invoice.id } });

    const responses = await Promise.all([
      clientBillingWrite(app, token, 'POST', `/api/v1/client-billing/retention/${retention.id}/release`, {}, 'module16-ops-retention-a'),
      clientBillingWrite(app, token, 'POST', `/api/v1/client-billing/retention/${retention.id}/release`, {}, 'module16-ops-retention-b')
    ]);

    for (const response of responses) assert.equal(response.statusCode, 200, response.body);
    for (const response of responses) assert.equal(response.json().data.releasedAmount, '25.00');
    const released = await client.retentionLedger.findUniqueOrThrow({ where: { id: retention.id } });
    assert.equal(released.releasedAmount.toString(), '25');
    assert.equal(released.status, 'RELEASED');
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_retention.released', entityId: retention.id } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_retention.released', resourceId: retention.id } }), 1);
    assert.equal(await client.idempotencyRecord.count({
      where: {
        companyId: COMPANY_ID,
        operation: 'client-billing.retention-release',
        idempotencyKey: { in: ['module16-ops-retention-a', 'module16-ops-retention-b'] },
        status: 'COMPLETED'
      }
    }), 2);
  });
});

// Verify reviewed PostgreSQL scope and immutable-history rules remain authoritative below the service layer.
test('Module 16 operational PostgreSQL rejects cross-scope billing and issued-history mutation', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { contract, claim } = await prepareCertifiedClaim(app, token, 'ops-db-rules');

    await assert.rejects(() => client.progressClaimLine.create({
      data: {
        claimId: claim.id,
        boqItemId: OTHER_BOQ_ITEM_ID,
        description: 'Cross-Project direct Claim line must fail',
        contractQty: '10.0000',
        cumulativeQty: '1.0000',
        currentQty: '1.0000',
        rate: '100.0000',
        currentValue: '100.00'
      }
    }), /Progress Claim BOQ item must belong to a Project-mapped BOQ for the Client Contract Project/);

    const otherContract = await createContract(
      app,
      token,
      { projectId: OTHER_PROJECT_ID, clientId: OTHER_CLIENT_ID },
      'module16-ops-db-other-contract'
    );
    await assert.rejects(() => client.clientInvoice.create({
      data: {
        companyId: COMPANY_ID,
        projectId: OTHER_PROJECT_ID,
        contractId: otherContract.id,
        claimId: claim.id,
        invoiceNo: 'DIRECT-BAD-SCOPE',
        invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
        dueDate: new Date('2026-07-31T00:00:00.000Z'),
        grossAmount: '250.00',
        retentionAmount: '25.00',
        taxAmount: '0.00',
        totalReceivable: '225.00',
        status: 'ISSUED'
      }
    }), /Client Invoice claim must belong to the same Client Contract/);

    const invoice = await issueInvoice(app, token, claim.id, 'module16-ops-db-invoice');
    const retention = await client.retentionLedger.findFirstOrThrow({ where: { sourceId: invoice.id } });
    const release = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/retention/${retention.id}/release`,
      {},
      'module16-ops-db-release'
    );
    assert.equal(release.statusCode, 200, release.body);

    await assert.rejects(() => client.clientInvoice.update({
      where: { id: invoice.id },
      data: { totalReceivable: '1.00' }
    }), /Client Invoice identity and financial values are immutable/);
    await assert.rejects(() => client.clientInvoice.delete({ where: { id: invoice.id } }), /Client Invoice source history cannot be deleted/);
    await assert.rejects(() => client.progressClaim.delete({ where: { id: claim.id } }), /Invoiced Progress Claim history is immutable/);
    await assert.rejects(() => client.retentionLedger.update({
      where: { id: retention.id },
      data: { releasedAmount: '0.00' }
    }), /Retention released amount cannot move backwards/);
    await assert.rejects(() => client.retentionLedger.delete({ where: { id: retention.id } }), /Retention ledger history cannot be deleted/);
    assert.equal(contract.id, claim.contractId);
  });
});

// Verify a late Retention outbox failure rolls back release state, audit evidence and idempotency together.
test('Module 16 operational forced Retention outbox failure rolls back the whole release transaction', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app);
    const { claim } = await prepareCertifiedClaim(app, token, 'ops-release-rollback');
    const invoice = await issueInvoice(app, token, claim.id, 'module16-ops-release-rollback-invoice');
    const retention = await client.retentionLedger.findFirstOrThrow({ where: { sourceId: invoice.id } });
    const key = 'module16-ops-release-rollback';

    await installModule16OutboxFailure(client, 'client_retention.released');
    try {
      const response = await clientBillingWrite(
        app,
        token,
        'POST',
        `/api/v1/client-billing/retention/${retention.id}/release`,
        {},
        key
      );
      assert.equal(response.statusCode, 500, response.body);
    } finally {
      await removeModule16OutboxFailure(client);
    }

    const rolledBack = await client.retentionLedger.findUniqueOrThrow({ where: { id: retention.id } });
    assert.equal(rolledBack.releasedAmount.toString(), '0');
    assert.equal(rolledBack.status, 'HELD');
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_ID, action: 'client_retention.released', entityId: retention.id } }), 0);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType: 'client_retention.released', resourceId: retention.id } }), 0);
    assert.equal(await client.idempotencyRecord.count({
      where: { companyId: COMPANY_ID, operation: 'client-billing.retention-release', idempotencyKey: key }
    }), 0);

    const retry = await clientBillingWrite(
      app,
      token,
      'POST',
      `/api/v1/client-billing/retention/${retention.id}/release`,
      {},
      key
    );
    assert.equal(retry.statusCode, 200, retry.body);
    assert.equal(retry.json().data.releasedAmount, '25.00');
  });
});

// Verify all reviewed Stage-23 query and uniqueness indexes are deployed after migration.
test('Module 16 operational Stage-23 Client Billing indexes are deployed', { skip: !live }, async () => {
  await withApi(async ({ client }) => {
    const indexes = await client.$queryRawUnsafe(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename IN ('client_contracts', 'progress_claims', 'progress_claim_lines', 'client_invoices', 'retention_ledger')
      ORDER BY indexname
    `);
    const indexNames = new Set(indexes.map((row) => row.indexname));
    for (const name of [
      'client_contracts_company_contract_no_idx',
      'client_contracts_company_client_status_idx',
      'client_contracts_project_status_idx',
      'client_contracts_id_company_project_uq',
      'progress_claims_contract_claim_no_idx',
      'progress_claims_contract_status_period_idx',
      'progress_claim_lines_claim_idx',
      'progress_claim_lines_boq_item_idx',
      'client_invoices_claim_uq',
      'client_invoices_company_invoice_no_idx',
      'client_invoices_project_status_date_idx',
      'client_invoices_contract_date_idx',
      'retention_ledger_company_project_status_idx',
      'retention_ledger_source_idx'
    ]) {
      assert.equal(indexNames.has(name), true, `Missing Stage-23 Client Billing index: ${name}`);
    }
  });
});
