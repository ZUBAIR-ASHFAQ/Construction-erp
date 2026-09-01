import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000018001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000018002';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000018010';
const READER_A_ID = '00000000-0000-4000-8000-000000018011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000018012';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000018020';
const READER_A_ROLE_ID = '00000000-0000-4000-8000-000000018021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000018022';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000018030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000018031';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000018040';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000018041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000018042';
const STAGE_A_ID = '00000000-0000-4000-8000-000000018050';
const STAGE_A2_ID = '00000000-0000-4000-8000-000000018051';
const STAGE_B_ID = '00000000-0000-4000-8000-000000018052';
const INVOICE_A_ID = '00000000-0000-4000-8000-000000018060';
const INVOICE_A2_ID = '00000000-0000-4000-8000-000000018061';
const INVOICE_B_ID = '00000000-0000-4000-8000-000000018062';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000018070';
const ADVANCE_GL_A_ID = '00000000-0000-4000-8000-000000018071';
const RECEIVABLE_GL_A_ID = '00000000-0000-4000-8000-000000018072';
const BANK_GL_B_ID = '00000000-0000-4000-8000-000000018073';
const ADVANCE_GL_B_ID = '00000000-0000-4000-8000-000000018074';
const RECEIVABLE_GL_B_ID = '00000000-0000-4000-8000-000000018075';
const BANK_A_ID = '00000000-0000-4000-8000-000000018080';
const BANK_B_ID = '00000000-0000-4000-8000-000000018081';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000018090';
const PERIOD_B_ID = '00000000-0000-4000-8000-000000018091';
const PASSWORD = 'Final21-client-receipts-B18.10-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-client-receipts-secret-0123456789abcdef';

const ADMIN_PERMISSIONS = [
  'client_receipts.read', 'client_receipts.create', 'client_receipts.allocate', 'client_receipts.reverse',
  'projects.read', 'stages.read', 'stages.financial.read', 'client_invoices.read', 'finance.read'
];

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum two-company Client Receipt, Invoice, Stage and Finance graph. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({ data: [
    { id: COMPANY_A_ID, legalName: 'B18.10 Company A Ltd', displayName: 'B18.10 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
    { id: COMPANY_B_ID, legalName: 'B18.10 Company B Ltd', displayName: 'B18.10 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
  ] });

  const permissions = [];
  for (const code of ADMIN_PERMISSIONS) {
    permissions.push(await client.permission.upsert({ where: { code }, update: { description: code, domain: code.split('.')[0] }, create: { code, description: code, domain: code.split('.')[0] } }));
  }
  await client.role.createMany({ data: [
    { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b18-10-admin', name: 'B18.10 Administrator', isSystem: false, status: 'ACTIVE' },
    { id: READER_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b18-10-reader', name: 'B18.10 Reader', isSystem: false, status: 'ACTIVE' },
    { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'b18-10-admin', name: 'B18.10 Administrator', isSystem: false, status: 'ACTIVE' }
  ] });
  const readPermission = permissions.find((permission) => permission.code === 'client_receipts.read');
  await client.rolePermission.createMany({ data: [
    ...permissions.map((permission) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode: permission.code })),
    ...permissions.map((permission) => ({ roleId: ADMIN_B_ROLE_ID, permissionCode: permission.code })),
    { roleId: READER_A_ROLE_ID, permissionCode: readPermission.code }
  ] });
  await client.user.createMany({ data: [
    { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b18-10-admin-a@example.test', name: 'B18.10 Admin A', passwordHash, status: 'ACTIVE' },
    { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'b18-10-reader-a@example.test', name: 'B18.10 Reader A', passwordHash, status: 'ACTIVE' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'b18-10-admin-b@example.test', name: 'B18.10 Admin B', passwordHash, status: 'ACTIVE' }
  ] });
  await client.userRole.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: READER_A_ID, roleId: READER_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, status: 'ACTIVE' }
  ] });
  await client.client.createMany({ data: [
    { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B1810-CLIENT-A', legalName: 'B18.10 Client A Ltd', displayName: 'B18.10 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B1810-CLIENT-B', legalName: 'B18.10 Client B Ltd', displayName: 'B18.10 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
  ] });
  await client.project.createMany({ data: [
    { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B1810-A', name: 'B18.10 Project A', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
    { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B1810-A2', name: 'B18.10 Project A2', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '20000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B1810-B', name: 'B18.10 Project B', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '30000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID }
  ] });
  await client.projectStage.createMany({ data: [
    { id: STAGE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' },
    { id: STAGE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A2_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '8000000.00', status: 'ACTIVE' },
    { id: STAGE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '12000000.00', status: 'ACTIVE' }
  ] });
  await client.userProjectScope.create({ data: { companyId: COMPANY_A_ID, userId: READER_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' } });
  for (const invoice of [
    { id: INVOICE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID, invoiceNo: 'INV-B1810-A', total: '1000.00', stageId: STAGE_A_ID },
    { id: INVOICE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A2_ID, clientId: CLIENT_A_ID, invoiceNo: 'INV-B1810-A2', total: '800.00', stageId: STAGE_A2_ID },
    { id: INVOICE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, clientId: CLIENT_B_ID, invoiceNo: 'INV-B1810-B', total: '700.00', stageId: STAGE_B_ID }
  ]) {
    await client.clientInvoice.create({ data: { id: invoice.id, companyId: invoice.companyId, projectId: invoice.projectId, clientId: invoice.clientId, invoiceNo: invoice.invoiceNo, invoiceDate: new Date('2026-08-20T00:00:00.000Z'), dueDate: new Date('2026-09-19T00:00:00.000Z'), status: 'ISSUED', subtotal: invoice.total, taxAmount: '0.00', totalAmount: invoice.total, lines: { create: [{ stageId: invoice.stageId, description: 'B18.10 issued invoice', amount: invoice.total }] } } });
  }
  await client.glAccount.createMany({ data: [
    { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-ADVANCE', name: 'Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: RECEIVABLE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
    { id: BANK_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'CLIENT-ADVANCE', name: 'Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: RECEIVABLE_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' }
  ] });
  await client.cashBankAccount.createMany({ data: [
    { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' },
    { id: BANK_B_ID, companyId: COMPANY_B_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_B_ID, status: 'ACTIVE' }
  ] });
  await client.fiscalPeriod.createMany({ data: [
    { id: PERIOD_A_ID, companyId: COMPANY_A_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' },
    { id: PERIOD_B_ID, companyId: COMPANY_B_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' }
  ] });
  await client.numberSequence.createMany({ data: [
    { companyId: COMPANY_A_ID, sequenceKey: 'client-receipt', prefix: 'CR-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, sequenceKey: 'client-receipt', prefix: 'CR-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  ] });
}

/** Run one Client Receipts scenario against the disposable PostgreSQL/API runtime. */
async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const client = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
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

/** Execute one authenticated Client Receipts write with a required idempotency key. */
async function receiptWrite(app, token, url, payload, idempotencyKey) {
  return app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey }, payload });
}

/** Create and atomically post one valid Client Receipt. */
async function createReceipt(app, token, overrides = {}, key = 'b18-10-create-receipt') {
  const response = await receiptWrite(app, token, '/api/v1/client-receipts', {
    clientId: overrides.clientId ?? CLIENT_A_ID,
    projectId: overrides.projectId ?? PROJECT_A_ID,
    stageId: Object.prototype.hasOwnProperty.call(overrides, 'stageId') ? overrides.stageId : STAGE_A_ID,
    receiptDate: overrides.receiptDate ?? '2026-08-29', amount: overrides.amount ?? '1000.00', paymentMethod: 'BANK',
    cashBankAccountId: overrides.cashBankAccountId ?? BANK_A_ID, reference: overrides.reference ?? 'B18.10-BANK-TRX', receiptType: overrides.receiptType ?? 'INVOICE_PAYMENT'
  }, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Return one stable public error code from a Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

test('B18.10 live invoice payment is idempotent and reconciles Receipt, allocation, Stage and Finance', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b18-10-admin-a@example.test');
    const receipt = await createReceipt(app, token, { amount: '1000.00' }, 'b18-10-invoice-payment');
    const replay = await createReceipt(app, token, { amount: '1000.00' }, 'b18-10-invoice-payment');
    assert.equal(replay.id, receipt.id);
    let response = await receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '400.00' }, 'b18-10-partial-allocation');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.allocatedAmount, '400.00');
    assert.equal(response.json().data.unallocatedAmount, '600.00');
    const receiptJournal = await client.journal.findFirstOrThrow({ where: { companyId: COMPANY_A_ID, sourceKey: `client_receipt:${receipt.id}` } });
    const allocationId = response.json().data.allocations[0].id;
    const allocationJournal = await client.journal.findFirstOrThrow({ where: { companyId: COMPANY_A_ID, sourceKey: `client_receipt_allocation:${allocationId}` } });
    assert.equal(Number(receiptJournal.totalDebit), 1000); assert.equal(Number(receiptJournal.totalCredit), 1000);
    assert.equal(Number(allocationJournal.totalDebit), 400); assert.equal(Number(allocationJournal.totalCredit), 400);
    response = await app.inject({ method: 'GET', url: `/api/v1/projects/${PROJECT_A_ID}/stages/${STAGE_A_ID}/financials`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.billedAmount, '1000.00');
    assert.equal(response.json().data.receivedAmount, '1000.00');
    assert.equal(response.json().data.allocatedReceiptAmount, '400.00');
    assert.equal(response.json().data.advanceAmount, '600.00');
    assert.equal(response.json().data.outstandingAmount, '600.00');
  });
});

test('B18.10 live random advance of Rs. 500,000 remains advance cash and does not create revenue', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b18-10-admin-a@example.test');
    const receipt = await createReceipt(app, token, { amount: '500000.00', receiptType: 'ADVANCE' }, 'b18-10-random-advance');
    assert.equal(receipt.allocatedAmount, '0.00'); assert.equal(receipt.unallocatedAmount, '500000.00');
    const journal = await client.journal.findFirstOrThrow({ where: { companyId: COMPANY_A_ID, sourceKey: `client_receipt:${receipt.id}` }, include: { lines: { include: { account: true } } } });
    assert.equal(journal.lines.some((line) => line.account.accountCode === 'CLIENT-ADVANCE' && Number(line.credit) === 500000), true);
    assert.equal(journal.lines.some((line) => /REVENUE|INCOME/.test(line.account.accountType)), false);
  });
});

test('B18.10 live limits, permissions, Project scope and cross-Company access fail closed', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b18-10-admin-a@example.test');
    const readerToken = await signIn(app, 'b18-10-reader-a@example.test');
    const foreignToken = await signIn(app, 'b18-10-admin-b@example.test');
    const receipt = await createReceipt(app, adminToken, { amount: '700.00' }, 'b18-10-limit-receipt');
    let response = await receiptWrite(app, adminToken, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '600.00' }, 'b18-10-limit-first');
    assert.equal(response.statusCode, 201, response.body);
    response = await receiptWrite(app, adminToken, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '101.00' }, 'b18-10-over-receipt');
    assert.equal(response.statusCode, 409, response.body); assert.equal(errorCode(response), 'ALLOCATION_EXCEEDS_RECEIPT');
    const second = await createReceipt(app, adminToken, { amount: '500.00' }, 'b18-10-second-receipt');
    response = await receiptWrite(app, adminToken, `/api/v1/client-receipts/${second.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '401.00' }, 'b18-10-over-invoice');
    assert.equal(response.statusCode, 409, response.body); assert.equal(errorCode(response), 'ALLOCATION_EXCEEDS_INVOICE');
    response = await receiptWrite(app, readerToken, '/api/v1/client-receipts', { clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, receiptDate: '2026-08-29', amount: '1.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'ADVANCE' }, 'b18-10-reader-create');
    assert.equal(response.statusCode, 403, response.body);
    response = await app.inject({ method: 'GET', url: `/api/v1/client-receipts?projectId=${PROJECT_A2_ID}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 403, response.body);
    response = await app.inject({ method: 'GET', url: `/api/v1/client-receipts/${receipt.id}`, headers: { authorization: `Bearer ${foreignToken}` } });
    assert.equal(response.statusCode, 404, response.body); assert.equal(errorCode(response), 'RECEIPT_NOT_FOUND');
  });
});

test('B18.10 live concurrent allocations serialize so over-allocation cannot occur', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b18-10-admin-a@example.test');
    const receipt = await createReceipt(app, token, { amount: '1000.00' }, 'b18-10-concurrent-receipt');
    const results = await Promise.all([
      receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '700.00' }, 'b18-10-concurrent-a'),
      receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '700.00' }, 'b18-10-concurrent-b')
    ]);
    assert.deepEqual(results.map((item) => item.statusCode).sort(), [201, 409]);
    assert.equal(await client.clientReceiptAllocation.count({ where: { receiptId: receipt.id } }), 1);
  });
});

test('B18.10 live unallocation and Receipt reversal retain compensating Finance history', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b18-10-admin-a@example.test');
    const receipt = await createReceipt(app, token, { amount: '500.00', receiptType: 'ADVANCE' }, 'b18-10-reversal-receipt');
    let response = await receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/allocations`, { clientInvoiceId: INVOICE_A_ID, amount: '200.00' }, 'b18-10-reversal-allocation');
    const allocationId = response.json().data.allocations[0].id;
    response = await receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/reverse`, {}, 'b18-10-reverse-while-allocated');
    assert.equal(response.statusCode, 409, response.body); assert.equal(errorCode(response), 'RECEIPT_LOCKED');
    response = await receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/unallocate`, { allocationId }, 'b18-10-unallocate');
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().data.unallocatedAmount, '500.00');
    response = await receiptWrite(app, token, `/api/v1/client-receipts/${receipt.id}/reverse`, {}, 'b18-10-reverse');
    assert.equal(response.statusCode, 200, response.body); assert.equal(response.json().data.status, 'REVERSED');
    for (const sourceKey of [`client_receipt:${receipt.id}`, `client_receipt_allocation:${allocationId}`, `client_receipt_allocation_reversal:${allocationId}`, `client_receipt_reversal:${receipt.id}`]) {
      assert.equal(await client.journal.count({ where: { companyId: COMPANY_A_ID, sourceKey } }), 1);
    }
  });
});

test('B18.10 live closed Finance period rolls Receipt and Journal back atomically', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b18-10-admin-a@example.test');
    await client.fiscalPeriod.update({ where: { id: PERIOD_A_ID }, data: { status: 'CLOSED' } });
    const response = await receiptWrite(app, token, '/api/v1/client-receipts', { clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A_ID, receiptDate: '2026-08-29', amount: '125.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, reference: 'B18.10-ROLLBACK', receiptType: 'ADVANCE' }, 'b18-10-closed-period');
    assert.equal(response.statusCode, 409, response.body); assert.equal(errorCode(response), 'FISCAL_PERIOD_CLOSED');
    assert.equal(await client.clientReceipt.count({ where: { companyId: COMPANY_A_ID } }), 0);
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_A_ID, sourceType: 'client_receipt' } }), 0);
  });
});

test('B18.10 live OpenAPI exposes exactly six Client Receipts operations and four idempotent writes', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/client-receipts', 'listClientReceipts'], ['post', '/api/v1/client-receipts', 'createClientReceipt'],
      ['get', '/api/v1/client-receipts/{id}', 'getClientReceipt'], ['post', '/api/v1/client-receipts/{id}/allocations', 'allocateClientReceipt'],
      ['post', '/api/v1/client-receipts/{id}/unallocate', 'unallocateClientReceipt'], ['post', '/api/v1/client-receipts/{id}/reverse', 'reverseClientReceipt']
    ];
    for (const [method, path, operationId] of expected) { assert.equal(spec.paths[path][method].operationId, operationId); assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]); }
    for (const path of ['/api/v1/client-receipts', '/api/v1/client-receipts/{id}/allocations', '/api/v1/client-receipts/{id}/unallocate', '/api/v1/client-receipts/{id}/reverse']) {
      assert.ok(spec.paths[path].post.parameters.some((parameter) => parameter.name === 'idempotency-key' && parameter.required === true));
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/client-receipts')).length, 5);
  });
});
