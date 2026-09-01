import { expect, test } from '@playwright/test';

const COMPANY_ID = '00000000-0000-4000-8000-000000019501';
const USER_ID = '00000000-0000-4000-8000-000000019502';
const ROLE_ID = '00000000-0000-4000-8000-000000019503';
const CLIENT_ID = '00000000-0000-4000-8000-000000019504';
const PROJECT_ID = '00000000-0000-4000-8000-000000019505';
const ADVANCE_PROJECT_ID = '00000000-0000-4000-8000-000000019506';
const STAGE_1_ID = '00000000-0000-4000-8000-000000019507';
const STAGE_2_ID = '00000000-0000-4000-8000-000000019508';
const VENDOR_ID = '00000000-0000-4000-8000-000000019509';
const BANK_GL_ID = '00000000-0000-4000-8000-000000019510';
const ADVANCE_GL_ID = '00000000-0000-4000-8000-000000019511';
const AR_GL_ID = '00000000-0000-4000-8000-000000019512';
const REVENUE_GL_ID = '00000000-0000-4000-8000-000000019513';
const BANK_ID = '00000000-0000-4000-8000-000000019514';
const PERIOD_ID = '00000000-0000-4000-8000-000000019515';
const INVOICE_1_ID = '00000000-0000-4000-8000-000000019516';
const INVOICE_2_ID = '00000000-0000-4000-8000-000000019517';
const RECEIPT_1_ID = '00000000-0000-4000-8000-000000019518';
const RECEIPT_2_ID = '00000000-0000-4000-8000-000000019519';
const RECEIPT_3_ID = '00000000-0000-4000-8000-000000019520';
const ADVANCE_RECEIPT_ID = '00000000-0000-4000-8000-000000019521';
const ALLOCATION_1_ID = '00000000-0000-4000-8000-000000019522';
const ALLOCATION_2_ID = '00000000-0000-4000-8000-000000019523';
const ALLOCATION_3_ID = '00000000-0000-4000-8000-000000019524';
const SUPPLIER_INVOICE_ID = '00000000-0000-4000-8000-000000019525';
const SUPPLIER_PAYMENT_ID = '00000000-0000-4000-8000-000000019526';
const EMAIL = 'b19-10-profitability-browser@example.test';
const PASSWORD = 'Final21-project-profitability-browser-password!';
const PERMISSIONS = [
  'project_profitability.read',
  'project_profitability.finance.read',
  'project_profitability.portfolio.read'
];
let database;

/** Create one balanced posted Journal for the browser profitability fixture. */
async function createJournal(input) {
  await database.journal.create({
    data: {
      id: input.id,
      companyId: COMPANY_ID,
      journalNo: input.journalNo,
      postingDate: new Date(`${input.postingDate}T00:00:00.000Z`),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      sourceKey: input.sourceKey,
      description: input.sourceKey,
      status: 'POSTED',
      periodId: PERIOD_ID,
      createdBy: USER_ID,
      postedAt: new Date(`${input.postingDate}T12:00:00.000Z`),
      totalDebit: input.amount,
      totalCredit: input.amount,
      lines: { create: input.lines }
    }
  });
}

/** Seed only the authoritative source rows needed for the final Module 19 browser workflow. */
async function seedProjectProfitabilityBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({ data: {
    id: COMPANY_ID, legalName: 'B19.10 Profitability Browser Ltd', displayName: 'B19.10 Profitability Browser',
    status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 }
  } });
  const permissions = [];
  for (const code of PERMISSIONS) permissions.push(await database.permission.upsert({ where: { code }, update: { description: code, domain: 'project_profitability' }, create: { code, description: code, domain: 'project_profitability' } }));
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'b19-10-profitability-reader', name: 'B19.10 Profitability Reader', isSystem: false, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: ROLE_ID, permissionCode: permission.code })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B19.10 Profitability Reader', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });
  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B1910-CLIENT', legalName: 'B19.10 Client Ltd', displayName: 'B19.10 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.createMany({ data: [
    { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B1910-A', name: 'B19.10 Reconciliation Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: USER_ID },
    { id: ADVANCE_PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B1910-ADV', name: 'B19.10 Advance Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '20000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: USER_ID }
  ] });
  await database.projectStage.createMany({ data: [
    { id: STAGE_1_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '60.0000', plannedAmount: '30000000.00', status: 'ACTIVE' },
    { id: STAGE_2_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'FINISH', name: 'Finishing', sequenceNo: 2, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' }
  ] });
  await database.stageProgressUpdate.createMany({ data: [
    { stageId: STAGE_1_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-21T00:00:00.000Z'), enteredBy: USER_ID, approvedBy: USER_ID, approvedAt: new Date('2026-08-21T12:00:00.000Z'), status: 'APPROVED' },
    { stageId: STAGE_2_ID, progressPercent: '25.0000', progressDate: new Date('2026-08-22T00:00:00.000Z'), enteredBy: USER_ID, approvedBy: USER_ID, approvedAt: new Date('2026-08-22T12:00:00.000Z'), status: 'APPROVED' }
  ] });
  await database.glAccount.createMany({ data: [
    { id: BANK_GL_ID, companyId: COMPANY_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-ADVANCE', name: 'Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: AR_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
    { id: REVENUE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-REVENUE', name: 'Client Revenue', accountType: 'REVENUE', status: 'ACTIVE' }
  ] });
  await database.cashBankAccount.create({ data: { id: BANK_ID, companyId: COMPANY_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_ID, status: 'ACTIVE' } });
  await database.fiscalPeriod.create({ data: { id: PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' } });

  await database.costActual.createMany({ data: [
    { companyId: COMPANY_ID, projectId: PROJECT_ID, stageId: STAGE_1_ID, category: 'material', sourceType: 'inventory_issue', sourceId: 'B1910-COST-1', sourceKey: 'b19-10:cost:1', amount: '300.00', postingDate: new Date('2026-08-21T00:00:00.000Z') },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, stageId: STAGE_2_ID, category: 'labour', sourceType: 'payroll', sourceId: 'B1910-COST-2', sourceKey: 'b19-10:cost:2', amount: '200.00', postingDate: new Date('2026-08-22T00:00:00.000Z') },
    { companyId: COMPANY_ID, projectId: PROJECT_ID, stageId: null, category: 'site_expense', sourceType: 'site_expense', sourceId: 'B1910-COST-3', sourceKey: 'b19-10:cost:3', amount: '100.00', postingDate: new Date('2026-08-22T00:00:00.000Z') }
  ] });

  await database.clientInvoice.create({ data: {
    id: INVOICE_1_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, clientId: CLIENT_ID, invoiceNo: 'INV-B1910-1', invoiceDate: new Date('2026-08-20T00:00:00.000Z'), status: 'ISSUED', subtotal: '1200.00', taxAmount: '0.00', totalAmount: '1200.00',
    lines: { create: [
      { stageId: STAGE_1_ID, description: 'Stage 1 billing', amount: '1000.00', revenueAccountId: REVENUE_GL_ID },
      { stageId: null, description: 'Project-only billing', amount: '200.00', revenueAccountId: REVENUE_GL_ID }
    ] }
  } });
  await database.clientInvoice.create({ data: {
    id: INVOICE_2_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, clientId: CLIENT_ID, invoiceNo: 'INV-B1910-2', invoiceDate: new Date('2026-08-22T00:00:00.000Z'), status: 'ISSUED', subtotal: '500.00', taxAmount: '0.00', totalAmount: '500.00',
    lines: { create: [{ stageId: STAGE_2_ID, description: 'Stage 2 billing', amount: '500.00', revenueAccountId: REVENUE_GL_ID }] }
  } });
  await createJournal({ id: '00000000-0000-4000-8000-000000019530', journalNo: 'JRN-B1910-INV1', postingDate: '2026-08-20', sourceType: 'client_invoice', sourceId: INVOICE_1_ID, sourceKey: `client_invoice:${INVOICE_1_ID}`, amount: '1200.00', lines: [
    { accountId: AR_GL_ID, projectId: PROJECT_ID, stageId: null, debit: '1200.00', credit: '0.00', description: 'AR' },
    { accountId: REVENUE_GL_ID, projectId: PROJECT_ID, stageId: STAGE_1_ID, debit: '0.00', credit: '1000.00', description: 'Stage 1 revenue' },
    { accountId: REVENUE_GL_ID, projectId: PROJECT_ID, stageId: null, debit: '0.00', credit: '200.00', description: 'Project-only revenue' }
  ] });
  await createJournal({ id: '00000000-0000-4000-8000-000000019531', journalNo: 'JRN-B1910-INV2', postingDate: '2026-08-22', sourceType: 'client_invoice', sourceId: INVOICE_2_ID, sourceKey: `client_invoice:${INVOICE_2_ID}`, amount: '500.00', lines: [
    { accountId: AR_GL_ID, projectId: PROJECT_ID, stageId: STAGE_2_ID, debit: '500.00', credit: '0.00', description: 'AR' },
    { accountId: REVENUE_GL_ID, projectId: PROJECT_ID, stageId: STAGE_2_ID, debit: '0.00', credit: '500.00', description: 'Stage 2 revenue' }
  ] });

  await database.clientReceipt.createMany({ data: [
    { id: RECEIPT_1_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, projectId: PROJECT_ID, stageId: STAGE_1_ID, receiptNo: 'CR-B1910-1', receiptDate: new Date('2026-08-23T00:00:00.000Z'), amount: '800.00', paymentMethod: 'BANK', cashBankAccountId: BANK_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: USER_ID, postedAt: new Date('2026-08-23T12:00:00.000Z') },
    { id: RECEIPT_2_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, projectId: PROJECT_ID, stageId: STAGE_2_ID, receiptNo: 'CR-B1910-2', receiptDate: new Date('2026-08-24T00:00:00.000Z'), amount: '400.00', paymentMethod: 'BANK', cashBankAccountId: BANK_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: USER_ID, postedAt: new Date('2026-08-24T12:00:00.000Z') },
    { id: RECEIPT_3_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, projectId: PROJECT_ID, stageId: null, receiptNo: 'CR-B1910-3', receiptDate: new Date('2026-08-25T00:00:00.000Z'), amount: '300.00', paymentMethod: 'BANK', cashBankAccountId: BANK_ID, receiptType: 'ADVANCE', status: 'POSTED', createdBy: USER_ID, postedAt: new Date('2026-08-25T12:00:00.000Z') },
    { id: ADVANCE_RECEIPT_ID, companyId: COMPANY_ID, clientId: CLIENT_ID, projectId: ADVANCE_PROJECT_ID, stageId: null, receiptNo: 'CR-B1910-ADV', receiptDate: new Date('2026-08-26T00:00:00.000Z'), amount: '500000.00', paymentMethod: 'BANK', cashBankAccountId: BANK_ID, receiptType: 'ADVANCE', status: 'POSTED', createdBy: USER_ID, postedAt: new Date('2026-08-26T12:00:00.000Z') }
  ] });
  await database.clientReceiptAllocation.createMany({ data: [
    { id: ALLOCATION_1_ID, receiptId: RECEIPT_1_ID, clientInvoiceId: INVOICE_1_ID, amount: '600.00', allocatedAt: new Date('2026-08-24T12:00:00.000Z'), allocatedBy: USER_ID },
    { id: ALLOCATION_2_ID, receiptId: RECEIPT_2_ID, clientInvoiceId: INVOICE_2_ID, amount: '300.00', allocatedAt: new Date('2026-08-25T12:00:00.000Z'), allocatedBy: USER_ID },
    { id: ALLOCATION_3_ID, receiptId: RECEIPT_3_ID, clientInvoiceId: INVOICE_1_ID, amount: '100.00', allocatedAt: new Date('2026-08-26T12:00:00.000Z'), allocatedBy: USER_ID }
  ] });
  const receiptJournals = [
    ['019540', 'R1', '2026-08-23', 'client_receipt', RECEIPT_1_ID, `client_receipt:${RECEIPT_1_ID}`, '800.00', PROJECT_ID, STAGE_1_ID, BANK_GL_ID, ADVANCE_GL_ID],
    ['019541', 'A1', '2026-08-24', 'client_receipt_allocation', ALLOCATION_1_ID, `client_receipt_allocation:${ALLOCATION_1_ID}`, '600.00', PROJECT_ID, STAGE_1_ID, ADVANCE_GL_ID, AR_GL_ID],
    ['019542', 'R2', '2026-08-24', 'client_receipt', RECEIPT_2_ID, `client_receipt:${RECEIPT_2_ID}`, '400.00', PROJECT_ID, STAGE_2_ID, BANK_GL_ID, ADVANCE_GL_ID],
    ['019543', 'A2', '2026-08-25', 'client_receipt_allocation', ALLOCATION_2_ID, `client_receipt_allocation:${ALLOCATION_2_ID}`, '300.00', PROJECT_ID, STAGE_2_ID, ADVANCE_GL_ID, AR_GL_ID],
    ['019544', 'R3', '2026-08-25', 'client_receipt', RECEIPT_3_ID, `client_receipt:${RECEIPT_3_ID}`, '300.00', PROJECT_ID, null, BANK_GL_ID, ADVANCE_GL_ID],
    ['019545', 'A3', '2026-08-26', 'client_receipt_allocation', ALLOCATION_3_ID, `client_receipt_allocation:${ALLOCATION_3_ID}`, '100.00', PROJECT_ID, null, ADVANCE_GL_ID, AR_GL_ID],
    ['019546', 'ADV', '2026-08-26', 'client_receipt', ADVANCE_RECEIPT_ID, `client_receipt:${ADVANCE_RECEIPT_ID}`, '500000.00', ADVANCE_PROJECT_ID, null, BANK_GL_ID, ADVANCE_GL_ID]
  ];
  for (const [suffix, label, date, sourceType, sourceId, sourceKey, amount, projectId, stageId, debitAccount, creditAccount] of receiptJournals) {
    await createJournal({ id: `00000000-0000-4000-8000-000000${suffix}`, journalNo: `JRN-B1910-${label}`, postingDate: date, sourceType, sourceId, sourceKey, amount, lines: [
      { accountId: debitAccount, projectId, stageId, debit: amount, credit: '0.00', description: label },
      { accountId: creditAccount, projectId, stageId, debit: '0.00', credit: amount, description: label }
    ] });
  }

  await database.vendor.create({ data: { id: VENDOR_ID, companyId: COMPANY_ID, code: 'B1910-VENDOR', legalName: 'B19.10 Vendor Ltd', displayName: 'B19.10 Vendor', status: 'ACTIVE' } });
  await database.supplierInvoice.create({ data: { id: SUPPLIER_INVOICE_ID, companyId: COMPANY_ID, vendorId: VENDOR_ID, projectId: PROJECT_ID, invoiceNo: 'SUP-B1910-1', invoiceDate: new Date('2026-08-23T00:00:00.000Z'), status: 'POSTED', subtotal: '900.00', taxAmount: '0.00', totalAmount: '900.00', lines: { create: [{ stageId: STAGE_1_ID, description: 'Supplier cost evidence', amount: '900.00' }] } } });
  await database.supplierPayment.create({ data: { id: SUPPLIER_PAYMENT_ID, companyId: COMPANY_ID, vendorId: VENDOR_ID, projectId: PROJECT_ID, paymentNo: 'SP-B1910-1', paymentDate: new Date('2026-08-27T00:00:00.000Z'), amount: '250.00', cashBankAccountId: BANK_ID, status: 'POSTED' } });
  await database.supplierPaymentAllocation.create({ data: { supplierPaymentId: SUPPLIER_PAYMENT_ID, supplierInvoiceId: SUPPLIER_INVOICE_ID, amount: '250.00', allocatedAt: new Date('2026-08-27T12:00:00.000Z') } });
}

/** Sign in through the shared Final-21 browser authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture only Module 19 browser requests so the read-only four-operation freeze can be asserted. */
function trackProjectProfitabilityRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/project-profitability')) requests.push({ method: request.method(), pathname: url.pathname });
  });
  return requests;
}

/** Return true only for one of the four frozen read-only Module 19 paths. */
function isAllowedProjectProfitabilityPath(method, pathname) {
  if (method !== 'GET') return false;
  if (pathname === '/api/v1/project-profitability/portfolio') return true;
  return /^\/api\/v1\/project-profitability\/projects\/[^/]+(?:\/stages|\/trend)?$/.test(pathname);
}

test.beforeAll(async () => { await seedProjectProfitabilityBrowserScenario(); });
test.afterAll(async () => { await database?.$disconnect(); });

test('Final-21 Project Profitability summary -> Stage -> trend -> portfolio browser workflow keeps cash separate from profit', async ({ page }) => {
  const requests = trackProjectProfitabilityRequests(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Project Profitability' }).click();
  await expect(page.getByRole('heading', { name: 'Project Profitability' })).toBeVisible();

  const filters = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Filters' }) }).locator('form');
  await filters.getByLabel('As of').fill('2026-08-29');
  await filters.getByLabel('Trend from').fill('2026-08-20');
  await filters.getByLabel('Trend to').fill('2026-08-22');
  await filters.getByLabel('Trend granularity').selectOption('DAY');
  await filters.getByRole('button', { name: 'Apply filters' }).click();

  const portfolio = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Portfolio comparison' }) });
  await expect(portfolio).toContainText('B1910-A');
  await expect(portfolio).toContainText('B1910-ADV');
  await portfolio.getByRole('button', { name: 'B1910-A' }).click();

  const summary = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Project profit / loss' }) });
  await expect(summary).toContainText('B19.10 Reconciliation Project');
  for (const value of ['PKR 1,700.00', 'PKR 600.00', 'PKR 1,100.00', 'PKR 1,500.00', 'PKR 500.00', 'PKR 700.00', 'PKR 650.00']) await expect(summary).toContainText(value);
  await expect(summary).toContainText('Cash is separate from profit');

  const stages = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Stage financial position' }) });
  await expect(stages).toContainText('Grey Structure');
  await expect(stages).toContainText('Finishing');
  await expect(stages).toContainText('60%');
  await expect(stages).toContainText('25%');
  await expect(stages).toContainText('Project-only');
  await expect(stages).toContainText('Project total');

  const trend = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Revenue, cost and profit trend' }) });
  await expect(trend).toContainText('2026-08-20');
  await expect(trend).toContainText('PKR 1,200.00');
  await expect(trend).toContainText('PKR -300.00');
  await expect(trend).toContainText('PKR 200.00');

  await portfolio.getByRole('button', { name: 'B1910-ADV' }).click();
  await expect(summary).toContainText('B19.10 Advance Project');
  await expect(summary).toContainText('PKR 500,000.00');
  await expect(summary).toContainText('Profit / lossPKR 0.00');
  await expect(summary).toContainText('Recognized revenuePKR 0.00');
  await expect(summary).toContainText('Advance / unallocatedPKR 500,000.00');

  await expect(page.locator('section.admin-card.profitability-contract-note')).toContainText('four frozen GET operations');
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) expect(isAllowedProjectProfitabilityPath(request.method, request.pathname)).toBe(true);
  expect(new Set(requests.map((request) => request.pathname.replace(/\/projects\/[^/]+/, '/projects/:projectId')))).toEqual(new Set([
    '/api/v1/project-profitability/portfolio',
    '/api/v1/project-profitability/projects/:projectId',
    '/api/v1/project-profitability/projects/:projectId/stages',
    '/api/v1/project-profitability/projects/:projectId/trend'
  ]));
});
