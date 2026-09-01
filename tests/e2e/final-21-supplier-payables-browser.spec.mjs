import { expect, test } from '@playwright/test';

const PASSWORD = 'Final21-B16.10-browser-password!';
const COMPANY_ID = '00000000-0000-4000-8000-000000016100';
const USER_ID = '00000000-0000-4000-8000-000000016101';
const ROLE_ID = '00000000-0000-4000-8000-000000016102';
const CLIENT_ID = '00000000-0000-4000-8000-000000016103';
const PROJECT_ID = '00000000-0000-4000-8000-000000016104';
const STAGE_ID = '00000000-0000-4000-8000-000000016105';
const VENDOR_ID = '00000000-0000-4000-8000-000000016106';
const EXPENSE_GL_ID = '00000000-0000-4000-8000-000000016107';
const PAYABLE_GL_ID = '00000000-0000-4000-8000-000000016108';
const BANK_GL_ID = '00000000-0000-4000-8000-000000016109';
const BANK_ID = '00000000-0000-4000-8000-000000016110';
const WAREHOUSE_ID = '00000000-0000-4000-8000-000000016111';
const PO_ID = '00000000-0000-4000-8000-000000016112';
const RECEIPT_ID = '00000000-0000-4000-8000-000000016113';
const PERIOD_ID = '00000000-0000-4000-8000-000000016114';
const EMAIL = 'b16-10-supplier-payables@example.test';

const PERMISSIONS = [
  'supplier_payables.read',
  'supplier_invoices.create',
  'supplier_invoices.post',
  'supplier_payments.create',
  'supplier_payments.allocate',
  'vendors.read',
  'projects.read',
  'stages.read',
  'procurement.read',
  'finance.read'
];

let database;

/** Seed the smallest Vendor, Project, Procurement and Finance graph required by the Supplier Payables browser workflow. */
async function seedSupplierPayablesBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'B16.10 Supplier Payables Browser Ltd',
      displayName: 'B16.10 Supplier Payables Browser',
      status: 'ACTIVE',
      baseCurrency: 'PKR',
      timeZone: 'Asia/Karachi',
      locale: 'en-PK',
      fiscalSettings: { fiscalYearStartMonth: 7 }
    }
  });

  const permissions = [];
  for (const code of PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { description: code, domain: code.split('.')[0] },
      create: { code, description: code, domain: code.split('.')[0] }
    }));
  }
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'b16-10-manager', name: 'B16.10 Manager', isSystem: false, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: ROLE_ID, permissionCode: permission.code })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B16.10 Manager', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });

  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B1610-CLIENT', legalName: 'B16.10 Client Ltd', displayName: 'B16.10 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.create({
    data: { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B1610-PROJECT', name: 'B16.10 Construction Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: USER_ID }
  });
  await database.projectStage.create({ data: { id: STAGE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' } });
  await database.vendor.create({ data: { id: VENDOR_ID, companyId: COMPANY_ID, code: 'SUP-001', legalName: 'B16.10 Supplier Ltd', displayName: 'B16.10 Supplier', paymentTermsDays: 30, currency: 'PKR', status: 'ACTIVE', qualificationStatus: 'QUALIFIED' } });

  await database.glAccount.createMany({
    data: [
      { id: EXPENSE_GL_ID, companyId: COMPANY_ID, accountCode: 'PROJECT-EXPENSE', name: 'Project Expense', accountType: 'EXPENSE', status: 'ACTIVE' },
      { id: PAYABLE_GL_ID, companyId: COMPANY_ID, accountCode: 'SUPPLIER-PAYABLE', name: 'Supplier Payable', accountType: 'LIABILITY', status: 'ACTIVE' },
      { id: BANK_GL_ID, companyId: COMPANY_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', status: 'ACTIVE' }
    ]
  });
  await database.cashBankAccount.create({ data: { id: BANK_ID, companyId: COMPANY_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_ID, status: 'ACTIVE' } });
  await database.warehouse.create({ data: { id: WAREHOUSE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'WH-001', name: 'Project Store', status: 'ACTIVE' } });
  await database.purchaseOrder.create({
    data: { id: PO_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, poNo: 'PO-B1610-001', vendorId: VENDOR_ID, orderDate: new Date('2026-08-01T00:00:00.000Z'), currency: 'PKR', status: 'ISSUED', subtotal: '1000.00', tax: '0.00', total: '1000.00', deliveryAddress: 'Project Site', terms: '30 days' }
  });
  await database.goodsReceipt.create({
    data: { id: RECEIPT_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, vendorId: VENDOR_ID, warehouseId: WAREHOUSE_ID, receiptNo: 'GR-B1610-001', purchaseOrderId: PO_ID, receivedAt: new Date('2026-08-20T10:00:00.000Z'), status: 'RECEIVED', receivedBy: USER_ID }
  });
  await database.fiscalPeriod.create({ data: { id: PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' } });
  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'supplier-payment', prefix: 'SP-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
}

/** Sign in through the shared Final-21 browser authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture Supplier Payables browser calls so only the frozen eight-route contract is used. */
function trackSupplierPayablesRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/supplier-payables')) return;
    requests.push({ method: request.method(), pathname: url.pathname, idempotencyKey: request.headers()['idempotency-key'] ?? null });
  });
  return requests;
}

/** Return true only for one of the eight frozen Final Module 17 API operations. */
function isAllowedSupplierPayablesPath(method, pathname) {
  if (pathname === '/api/v1/supplier-payables/invoices') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/supplier-payables\/invoices\/[^/]+$/.test(pathname)) return method === 'GET';
  if (/^\/api\/v1\/supplier-payables\/invoices\/[^/]+\/post$/.test(pathname)) return method === 'POST';
  if (pathname === '/api/v1/supplier-payables/payments') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/supplier-payables\/payments\/[^/]+\/allocations$/.test(pathname)) return method === 'POST';
  if (pathname === '/api/v1/supplier-payables/aging') return method === 'GET';
  return false;
}

test.beforeAll(async () => {
  await seedSupplierPayablesBrowserScenario();
});

test.afterAll(async () => {
  await database?.$disconnect();
});

test('Final-21 Supplier Payables invoice, payment, allocation and aging browser workflow reconciles AP and Finance', async ({ page }) => {
  const requests = trackSupplierPayablesRequests(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Supplier Payables' }).click();
  await expect(page.getByRole('heading', { name: 'Supplier Payables' })).toBeVisible();

  const invoiceForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'New Supplier Invoice' }) }).locator('form');
  await invoiceForm.getByLabel('Vendor').selectOption(VENDOR_ID);
  await invoiceForm.getByLabel('Project').selectOption(PROJECT_ID);
  await invoiceForm.getByLabel('Supplier invoice no.').fill('SUP-BROWSER-001');
  await invoiceForm.getByLabel('Invoice date').fill('2026-08-25');
  await invoiceForm.getByLabel('Due date (optional)').fill('2026-09-24');
  await invoiceForm.getByLabel('Purchase Order (optional)').selectOption(PO_ID);
  await invoiceForm.getByLabel('Goods Receipt ID (optional)').fill(RECEIPT_ID);
  await invoiceForm.getByLabel('Tax amount').fill('0');
  await invoiceForm.getByLabel('Description').fill('Procured construction material');
  await invoiceForm.getByLabel('Amount').fill('1000.00');
  await invoiceForm.getByLabel('Stage (optional)').selectOption(STAGE_ID);
  await invoiceForm.getByLabel('Expense / Inventory account').selectOption(EXPENSE_GL_ID);
  await invoiceForm.getByRole('button', { name: 'Create invoice' }).click();

  const invoiceDetail = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Invoice SUP-BROWSER-001' }) });
  await expect(invoiceDetail).toBeVisible();
  await expect(invoiceDetail).toContainText('DRAFT');
  await invoiceDetail.getByRole('button', { name: 'Post Supplier Invoice' }).click();
  await expect(invoiceDetail).toContainText('POSTED');

  await page.getByRole('button', { name: 'Payments' }).click();
  const paymentForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'New Supplier Payment' }) }).locator('form');
  await paymentForm.getByLabel('Vendor').selectOption(VENDOR_ID);
  await paymentForm.getByLabel('Project (optional)').selectOption(PROJECT_ID);
  await paymentForm.getByLabel('Payment date').fill('2026-08-29');
  await paymentForm.getByLabel('Amount').fill('400.00');
  await paymentForm.getByLabel('Cash / Bank account').selectOption(BANK_ID);
  await paymentForm.getByLabel('Reference (optional)').fill('BANK-TRX-B1610');
  await paymentForm.getByRole('button', { name: 'Create & post payment' }).click();

  const paymentRow = page.getByRole('row').filter({ hasText: 'SP-00001' });
  await expect(paymentRow).toContainText('POSTED');
  await paymentRow.getByRole('button', { name: 'Allocate' }).click();
  const allocationForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Allocate SP-00001' }) }).locator('form');
  await allocationForm.getByLabel('Posted invoice with outstanding').selectOption({ label: /SUP-BROWSER-001/ });
  await allocationForm.getByLabel('Allocation amount').fill('400.00');
  await allocationForm.getByRole('button', { name: 'Allocate payment' }).click();

  await page.getByRole('button', { name: 'Outstanding & Aging' }).click();
  const agingCard = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Supplier Outstanding & Aging' }) });
  await expect(agingCard).toContainText('SUP-BROWSER-001');
  await expect(agingCard).toContainText('600.00');

  const invoice = await database.supplierInvoice.findFirstOrThrow({ where: { companyId: COMPANY_ID, invoiceNo: 'SUP-BROWSER-001' }, include: { lines: true } });
  const payment = await database.supplierPayment.findFirstOrThrow({ where: { companyId: COMPANY_ID, paymentNo: 'SP-00001' } });
  const allocations = await database.supplierPaymentAllocation.findMany({ where: { supplierPaymentId: payment.id, supplierInvoiceId: invoice.id } });
  const journals = await database.journal.findMany({ where: { companyId: COMPANY_ID, sourceKey: { in: [`supplier_invoice:${invoice.id}`, `supplier_payment:${payment.id}`] } }, include: { lines: true } });

  expect(invoice.status).toBe('POSTED');
  expect(payment.status).toBe('POSTED');
  expect(allocations).toHaveLength(1);
  expect(Number(allocations[0].amount)).toBe(400);
  expect(journals).toHaveLength(2);
  for (const journal of journals) {
    const debit = journal.lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const credit = journal.lines.reduce((sum, line) => sum + Number(line.credit), 0);
    expect(debit).toBe(credit);
  }
  expect(await database.costActual.count({ where: { companyId: COMPANY_ID, sourceType: 'supplier_invoice', sourceId: { in: invoice.lines.map((line) => line.id) } } })).toBe(0);

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedSupplierPayablesPath(request.method, request.pathname)).toBe(true);
    if (request.method === 'POST') expect(request.idempotencyKey).toBeTruthy();
  }
});
