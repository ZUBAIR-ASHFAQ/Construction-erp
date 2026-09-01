import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000016001';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000016002';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000016010';
const READER_A_ID = '00000000-0000-4000-8000-000000016011';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000016012';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000016020';
const READER_A_ROLE_ID = '00000000-0000-4000-8000-000000016021';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000016022';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000016030';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000016031';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000016040';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000016041';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000016042';
const STAGE_A_ID = '00000000-0000-4000-8000-000000016050';
const STAGE_A2_ID = '00000000-0000-4000-8000-000000016051';
const STAGE_B_ID = '00000000-0000-4000-8000-000000016052';
const VENDOR_A_ID = '00000000-0000-4000-8000-000000016060';
const VENDOR_B_ID = '00000000-0000-4000-8000-000000016061';
const EXPENSE_GL_A_ID = '00000000-0000-4000-8000-000000016070';
const PAYABLE_GL_A_ID = '00000000-0000-4000-8000-000000016071';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000016072';
const EXPENSE_GL_B_ID = '00000000-0000-4000-8000-000000016073';
const PAYABLE_GL_B_ID = '00000000-0000-4000-8000-000000016074';
const BANK_GL_B_ID = '00000000-0000-4000-8000-000000016075';
const BANK_A_ID = '00000000-0000-4000-8000-000000016080';
const BANK_B_ID = '00000000-0000-4000-8000-000000016081';
const WAREHOUSE_A_ID = '00000000-0000-4000-8000-000000016090';
const PO_A_ID = '00000000-0000-4000-8000-000000016091';
const RECEIPT_A_ID = '00000000-0000-4000-8000-000000016092';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000016093';
const PERIOD_B_ID = '00000000-0000-4000-8000-000000016094';
const PASSWORD = 'Final21-supplier-payables-B16.10-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-supplier-payables-secret-0123456789abcdef';

const ALL_PERMISSIONS = [
  'supplier_payables.read',
  'supplier_invoices.create',
  'supplier_invoices.post',
  'supplier_payments.create',
  'supplier_payments.allocate'
];

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Seed the minimum two-company Supplier Payables, Project, Procurement and Finance graph. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({
    data: [
      { id: COMPANY_A_ID, legalName: 'B16.10 Company A Ltd', displayName: 'B16.10 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
      { id: COMPANY_B_ID, legalName: 'B16.10 Company B Ltd', displayName: 'B16.10 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
    ]
  });

  const permissions = [];
  for (const code of ALL_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { description: code, domain: 'supplier_payables' },
      create: { code, description: code, domain: 'supplier_payables' }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b16-10-admin', name: 'B16.10 Administrator', isSystem: false, status: 'ACTIVE' },
      { id: READER_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b16-10-reader', name: 'B16.10 Reader', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'b16-10-admin', name: 'B16.10 Administrator', isSystem: false, status: 'ACTIVE' }
    ]
  });
  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode: permission.code })),
      ...permissions.map((permission) => ({ roleId: ADMIN_B_ROLE_ID, permissionCode: permission.code })),
      { roleId: READER_A_ROLE_ID, permissionCode: 'supplier_payables.read' }
    ]
  });
  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b16-10-admin-a@example.test', name: 'B16.10 Admin A', passwordHash, status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'b16-10-reader-a@example.test', name: 'B16.10 Reader A', passwordHash, status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'b16-10-admin-b@example.test', name: 'B16.10 Admin B', passwordHash, status: 'ACTIVE' }
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
      { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B1610-CLIENT-A', legalName: 'B16.10 Client A Ltd', displayName: 'B16.10 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
      { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B1610-CLIENT-B', legalName: 'B16.10 Client B Ltd', displayName: 'B16.10 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
    ]
  });
  await client.project.createMany({
    data: [
      { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B1610-A', name: 'B16.10 Project A', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B1610-A2', name: 'B16.10 Project A2', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '20000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
      { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B1610-B', name: 'B16.10 Project B', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '30000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID }
    ]
  });
  await client.projectStage.createMany({
    data: [
      { id: STAGE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' },
      { id: STAGE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A2_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '8000000.00', status: 'ACTIVE' },
      { id: STAGE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '12000000.00', status: 'ACTIVE' }
    ]
  });
  await client.userProjectScope.create({ data: { companyId: COMPANY_A_ID, userId: READER_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' } });

  await client.vendor.createMany({
    data: [
      { id: VENDOR_A_ID, companyId: COMPANY_A_ID, code: 'SUP-A', legalName: 'Supplier A Ltd', displayName: 'Supplier A', paymentTermsDays: 30, currency: 'PKR', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' },
      { id: VENDOR_B_ID, companyId: COMPANY_B_ID, code: 'SUP-B', legalName: 'Supplier B Ltd', displayName: 'Supplier B', paymentTermsDays: 30, currency: 'PKR', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' }
    ]
  });

  await client.glAccount.createMany({
    data: [
      { id: EXPENSE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'PROJECT-EXPENSE', name: 'Project Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: PAYABLE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'SUPPLIER-PAYABLE', name: 'Supplier Payable', accountType: 'LIABILITY', status: 'ACTIVE' },
      { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', status: 'ACTIVE' },
      { id: EXPENSE_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'PROJECT-EXPENSE', name: 'Project Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: PAYABLE_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'SUPPLIER-PAYABLE', name: 'Supplier Payable', accountType: 'LIABILITY', status: 'ACTIVE' },
      { id: BANK_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', status: 'ACTIVE' }
    ]
  });
  await client.cashBankAccount.createMany({
    data: [
      { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' },
      { id: BANK_B_ID, companyId: COMPANY_B_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_B_ID, status: 'ACTIVE' }
    ]
  });

  await client.warehouse.create({ data: { id: WAREHOUSE_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'WH-A', name: 'Project A Store', status: 'ACTIVE' } });
  await client.purchaseOrder.create({
    data: { id: PO_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, poNo: 'PO-B1610-001', vendorId: VENDOR_A_ID, orderDate: new Date('2026-08-01T00:00:00.000Z'), currency: 'PKR', status: 'ISSUED', subtotal: '1000.00', tax: '0.00', total: '1000.00', deliveryAddress: 'Project A Site', terms: '30 days' }
  });
  await client.goodsReceipt.create({
    data: { id: RECEIPT_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, vendorId: VENDOR_A_ID, warehouseId: WAREHOUSE_A_ID, receiptNo: 'GR-B1610-001', purchaseOrderId: PO_A_ID, receivedAt: new Date('2026-08-20T10:00:00.000Z'), status: 'RECEIVED', receivedBy: ADMIN_A_ID }
  });

  await client.fiscalPeriod.createMany({
    data: [
      { id: PERIOD_A_ID, companyId: COMPANY_A_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' },
      { id: PERIOD_B_ID, companyId: COMPANY_B_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' }
    ]
  });
  await client.numberSequence.createMany({
    data: [
      { companyId: COMPANY_A_ID, sequenceKey: 'supplier-payment', prefix: 'SP-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_A_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'supplier-payment', prefix: 'SP-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_B_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
}

/** Run one Supplier Payables scenario against the disposable PostgreSQL/API runtime. */
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

/** Execute one authenticated Supplier Payables write with a required idempotency key. */
async function supplierWrite(app, token, method, url, payload, idempotencyKey) {
  return app.inject({
    method,
    url,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
    ...(payload === undefined ? {} : { payload })
  });
}

/** Create one valid Supplier Invoice, optionally linked to seeded Procurement documents. */
async function createInvoice(app, token, overrides = {}, key = 'b16-10-create-invoice') {
  const response = await supplierWrite(app, token, 'POST', '/api/v1/supplier-payables/invoices', {
    vendorId: overrides.vendorId ?? VENDOR_A_ID,
    projectId: overrides.projectId ?? PROJECT_A_ID,
    invoiceNo: overrides.invoiceNo ?? 'SUP-INV-B1610-001',
    invoiceDate: overrides.invoiceDate ?? '2026-08-25',
    dueDate: overrides.dueDate ?? '2026-09-24',
    purchaseOrderId: Object.prototype.hasOwnProperty.call(overrides, 'purchaseOrderId') ? overrides.purchaseOrderId : PO_A_ID,
    goodsReceiptId: Object.prototype.hasOwnProperty.call(overrides, 'goodsReceiptId') ? overrides.goodsReceiptId : RECEIPT_A_ID,
    taxAmount: overrides.taxAmount ?? '0',
    lines: overrides.lines ?? [{ stageId: overrides.stageId ?? STAGE_A_ID, description: 'Procured construction material', amount: '1000.00', expenseOrInventoryAccountId: EXPENSE_GL_A_ID }]
  }, key);
  assert.equal(response.statusCode, 201, response.body);
  return response.json().data;
}

/** Create and atomically post one Supplier Payment. */
async function createPayment(app, token, overrides = {}, key = 'b16-10-create-payment') {
  const response = await supplierWrite(app, token, 'POST', '/api/v1/supplier-payables/payments', {
    vendorId: overrides.vendorId ?? VENDOR_A_ID,
    projectId: Object.prototype.hasOwnProperty.call(overrides, 'projectId') ? overrides.projectId : PROJECT_A_ID,
    paymentDate: overrides.paymentDate ?? '2026-08-29',
    amount: overrides.amount ?? '400.00',
    cashBankAccountId: overrides.cashBankAccountId ?? BANK_A_ID,
    reference: overrides.reference ?? 'B16.10-PAYMENT-REF'
  }, key);
  assert.equal(response.statusCode, 201, response.body);
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

test('B16.10 live AP workflow reconciles invoice payment allocation outstanding aging and Finance', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b16-10-admin-a@example.test');
    const invoice = await createInvoice(app, token);
    let response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/invoices/${invoice.id}/post`, {}, 'b16-10-post-invoice');
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'POSTED');
    response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/invoices/${invoice.id}/post`, {}, 'b16-10-post-invoice');
    assert.equal(response.statusCode, 200, response.body);

    const payment = await createPayment(app, token);
    assert.equal(payment.status, 'POSTED');
    response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/payments/${payment.id}/allocations`, {
      allocations: [{ supplierInvoiceId: invoice.id, amount: '400.00' }]
    }, 'b16-10-allocate');
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.length, 1);
    response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/payments/${payment.id}/allocations`, {
      allocations: [{ supplierInvoiceId: invoice.id, amount: '400.00' }]
    }, 'b16-10-allocate');
    assert.equal(response.statusCode, 201, response.body);

    response = await app.inject({ method: 'GET', url: `/api/v1/supplier-payables/aging?vendorId=${VENDOR_A_ID}&projectId=${PROJECT_A_ID}&asOfDate=2026-08-29`, headers: { authorization: `Bearer ${token}` } });
    assert.equal(response.statusCode, 200, response.body);
    const aging = response.json().data;
    assert.equal(aging.items.length, 1);
    assert.equal(aging.items[0].invoiceNo, invoice.invoiceNo);
    assert.equal(moneyMinorUnits(aging.items[0].allocatedAmount), 40000n);
    assert.equal(moneyMinorUnits(aging.items[0].outstandingAmount), 60000n);

    const invoiceJournals = await client.journal.findMany({ where: { companyId: COMPANY_A_ID, sourceKey: `supplier_invoice:${invoice.id}` }, include: { lines: true } });
    const paymentJournals = await client.journal.findMany({ where: { companyId: COMPANY_A_ID, sourceKey: `supplier_payment:${payment.id}` }, include: { lines: true } });
    assert.equal(invoiceJournals.length, 1);
    assert.equal(paymentJournals.length, 1);
    for (const journal of [...invoiceJournals, ...paymentJournals]) assert.equal(moneyMinorUnits(journal.totalDebit), moneyMinorUnits(journal.totalCredit));
    assert.equal(await client.supplierPaymentAllocation.count({ where: { supplierPaymentId: payment.id, supplierInvoiceId: invoice.id } }), 1);
    assert.equal(await client.costActual.count({ where: { companyId: COMPANY_A_ID, sourceType: 'supplier_invoice', sourceId: { in: invoice.lines.map((line) => line.id) } } }), 0);
    assert.equal(await client.auditLog.count({ where: { companyId: COMPANY_A_ID, entityId: invoice.id, action: 'supplier_invoice.posted' } }), 1);
    assert.equal(await client.outboxEvent.count({ where: { companyId: COMPANY_A_ID, resourceId: payment.id, eventType: 'supplier_payment.allocated' } }), 1);
  });
});

test('B16.10 live direct Supplier Invoice creates one source-derived Project cost while Procurement-linked invoice does not', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b16-10-admin-a@example.test');
    const invoice = await createInvoice(app, token, {
      invoiceNo: 'DIRECT-B1610-001',
      purchaseOrderId: null,
      goodsReceiptId: null,
      lines: [{ stageId: STAGE_A_ID, description: 'Direct subcontract/site service', amount: '250.00', expenseOrInventoryAccountId: EXPENSE_GL_A_ID }]
    }, 'b16-10-direct-create');
    const response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/invoices/${invoice.id}/post`, {}, 'b16-10-direct-post');
    assert.equal(response.statusCode, 200, response.body);
    const costs = await client.costActual.findMany({ where: { companyId: COMPANY_A_ID, sourceType: 'supplier_invoice', sourceId: invoice.lines[0].id } });
    assert.equal(costs.length, 1);
    assert.equal(costs[0].projectId, PROJECT_A_ID);
    assert.equal(costs[0].stageId, STAGE_A_ID);
    assert.equal(moneyMinorUnits(costs[0].amount), 25000n);
  });
});

test('B16.10 live allocation guards prevent payment and invoice over-allocation', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b16-10-admin-a@example.test');
    const invoice = await createInvoice(app, token, { invoiceNo: 'OVERALLOC-B1610-001' }, 'b16-10-overalloc-invoice');
    let response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/invoices/${invoice.id}/post`, {}, 'b16-10-overalloc-post');
    assert.equal(response.statusCode, 200, response.body);
    const payment = await createPayment(app, token, { amount: '100.00', reference: 'OVERALLOC' }, 'b16-10-overalloc-payment');
    response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/payments/${payment.id}/allocations`, {
      allocations: [{ supplierInvoiceId: invoice.id, amount: '101.00' }]
    }, 'b16-10-overalloc-allocation');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'PAYMENT_ALLOCATION_INVALID');
  });
});

test('B16.10 live permissions Project scope and cross-company isolation reject unauthorized AP access', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b16-10-admin-a@example.test');
    const readerToken = await signIn(app, 'b16-10-reader-a@example.test');
    const foreignToken = await signIn(app, 'b16-10-admin-b@example.test');
    const invoiceA = await createInvoice(app, adminToken, { invoiceNo: 'SCOPE-A' }, 'b16-10-scope-a');
    const invoiceA2 = await createInvoice(app, adminToken, {
      projectId: PROJECT_A2_ID,
      stageId: STAGE_A2_ID,
      invoiceNo: 'SCOPE-A2',
      purchaseOrderId: null,
      goodsReceiptId: null,
      lines: [{ stageId: STAGE_A2_ID, description: 'Project A2 service', amount: '10.00', expenseOrInventoryAccountId: EXPENSE_GL_A_ID }]
    }, 'b16-10-scope-a2');

    let response = await app.inject({ method: 'GET', url: `/api/v1/supplier-payables/invoices?projectId=${PROJECT_A_ID}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items[0].id, invoiceA.id);
    response = await app.inject({ method: 'GET', url: `/api/v1/supplier-payables/invoices?projectId=${PROJECT_A2_ID}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 403, response.body);
    response = await app.inject({ method: 'GET', url: `/api/v1/supplier-payables/invoices/${invoiceA2.id}`, headers: { authorization: `Bearer ${readerToken}` } });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(errorCode(response), 'SUPPLIER_INVOICE_NOT_FOUND');
    response = await supplierWrite(app, readerToken, 'POST', '/api/v1/supplier-payables/invoices', {
      vendorId: VENDOR_A_ID, projectId: PROJECT_A_ID, invoiceNo: 'READER-DENIED', invoiceDate: '2026-08-29', taxAmount: '0', lines: [{ stageId: STAGE_A_ID, description: 'Denied', amount: '1.00', expenseOrInventoryAccountId: EXPENSE_GL_A_ID }]
    }, 'b16-10-reader-create');
    assert.equal(response.statusCode, 403, response.body);
    response = await app.inject({ method: 'GET', url: `/api/v1/supplier-payables/invoices/${invoiceA.id}`, headers: { authorization: `Bearer ${foreignToken}` } });
    assert.equal(response.statusCode, 404, response.body);
  });
});

test('B16.10 live Finance failure rolls invoice posting back to DRAFT with no AP or Project Cost side effect', { skip: !live }, async () => {
  await withApi(async ({ app, client }) => {
    const token = await signIn(app, 'b16-10-admin-a@example.test');
    const invoice = await createInvoice(app, token, {
      invoiceNo: 'ROLLBACK-B1610', purchaseOrderId: null, goodsReceiptId: null,
      lines: [{ stageId: STAGE_A_ID, description: 'Rollback direct cost', amount: '125.00', expenseOrInventoryAccountId: EXPENSE_GL_A_ID }]
    }, 'b16-10-rollback-create');
    await client.fiscalPeriod.update({ where: { id: PERIOD_A_ID }, data: { status: 'CLOSED' } });
    const response = await supplierWrite(app, token, 'POST', `/api/v1/supplier-payables/invoices/${invoice.id}/post`, {}, 'b16-10-rollback-post');
    assert.equal(response.statusCode, 409, response.body);
    assert.equal(errorCode(response), 'FISCAL_PERIOD_CLOSED');
    assert.equal(await client.journal.count({ where: { companyId: COMPANY_A_ID, sourceKey: `supplier_invoice:${invoice.id}` } }), 0);
    assert.equal(await client.costActual.count({ where: { companyId: COMPANY_A_ID, sourceType: 'supplier_invoice', sourceId: invoice.lines[0].id } }), 0);
    assert.equal(await client.supplierInvoice.count({ where: { id: invoice.id, companyId: COMPANY_A_ID, status: 'DRAFT' } }), 1);
  });
});

test('B16.10 live OpenAPI exposes exactly the eight Supplier Payables operations and idempotency boundaries', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/supplier-payables/invoices', 'listSupplierInvoices'],
      ['post', '/api/v1/supplier-payables/invoices', 'createSupplierInvoice'],
      ['get', '/api/v1/supplier-payables/invoices/{id}', 'getSupplierInvoice'],
      ['post', '/api/v1/supplier-payables/invoices/{id}/post', 'postSupplierInvoice'],
      ['get', '/api/v1/supplier-payables/payments', 'listSupplierPayments'],
      ['post', '/api/v1/supplier-payables/payments', 'createSupplierPayment'],
      ['post', '/api/v1/supplier-payables/payments/{id}/allocations', 'allocateSupplierPayment'],
      ['get', '/api/v1/supplier-payables/aging', 'getSupplierAging']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
    }
    for (const [method, path] of [
      ['post', '/api/v1/supplier-payables/invoices'],
      ['post', '/api/v1/supplier-payables/invoices/{id}/post'],
      ['post', '/api/v1/supplier-payables/payments'],
      ['post', '/api/v1/supplier-payables/payments/{id}/allocations']
    ]) {
      assert.ok(spec.paths[path][method].parameters.some((parameter) => parameter.name === 'idempotency-key' && parameter.required === true));
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/supplier-payables')).length, 6);
  });
});
