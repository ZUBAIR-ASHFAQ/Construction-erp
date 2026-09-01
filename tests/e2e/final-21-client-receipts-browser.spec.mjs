import { expect, test } from '@playwright/test';

const COMPANY_ID = '00000000-0000-4000-8000-000000018501';
const USER_ID = '00000000-0000-4000-8000-000000018502';
const ROLE_ID = '00000000-0000-4000-8000-000000018503';
const CLIENT_ID = '00000000-0000-4000-8000-000000018504';
const PROJECT_ID = '00000000-0000-4000-8000-000000018505';
const STAGE_ID = '00000000-0000-4000-8000-000000018506';
const INVOICE_ID = '00000000-0000-4000-8000-000000018507';
const BANK_GL_ID = '00000000-0000-4000-8000-000000018508';
const ADVANCE_GL_ID = '00000000-0000-4000-8000-000000018509';
const RECEIVABLE_GL_ID = '00000000-0000-4000-8000-000000018510';
const BANK_ID = '00000000-0000-4000-8000-000000018511';
const PERIOD_ID = '00000000-0000-4000-8000-000000018512';
const EMAIL = 'b18-10-receipts-browser@example.test';
const PASSWORD = 'Final21-client-receipts-browser-password!';
const PERMISSIONS = ['client_receipts.read', 'client_receipts.create', 'client_receipts.allocate', 'client_receipts.reverse', 'clients.read', 'projects.read', 'stages.read', 'finance.read', 'client_invoices.read'];
let database;

/** Seed the minimum Project, Stage, issued Invoice and Finance graph for the Receipt browser workflow. */
async function seedClientReceiptsBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);
  await database.company.create({ data: { id: COMPANY_ID, legalName: 'B18.10 Receipts Browser Ltd', displayName: 'B18.10 Receipts Browser', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } } });
  const permissions = [];
  for (const code of PERMISSIONS) permissions.push(await database.permission.upsert({ where: { code }, update: { description: code, domain: code.split('.')[0] }, create: { code, description: code, domain: code.split('.')[0] } }));
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'b18-10-receipts-manager', name: 'B18.10 Receipts Manager', isSystem: false, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: ROLE_ID, permissionCode: permission.code })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B18.10 Receipts Manager', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });
  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B1810-CLIENT', legalName: 'B18.10 Client Ltd', displayName: 'B18.10 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.create({ data: { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B1810-PROJECT', name: 'B18.10 Construction Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: USER_ID } });
  await database.projectStage.create({ data: { id: STAGE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' } });
  await database.clientInvoice.create({ data: { id: INVOICE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, clientId: CLIENT_ID, invoiceNo: 'INV-B1810-001', invoiceDate: new Date('2026-08-20T00:00:00.000Z'), dueDate: new Date('2026-09-19T00:00:00.000Z'), status: 'ISSUED', subtotal: '1000.00', taxAmount: '0.00', totalAmount: '1000.00', lines: { create: [{ stageId: STAGE_ID, description: 'Grey Structure invoice', amount: '1000.00' }] } } });
  await database.glAccount.createMany({ data: [
    { id: BANK_GL_ID, companyId: COMPANY_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-ADVANCE', name: 'Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: RECEIVABLE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' }
  ] });
  await database.cashBankAccount.create({ data: { id: BANK_ID, companyId: COMPANY_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_ID, status: 'ACTIVE' } });
  await database.fiscalPeriod.create({ data: { id: PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' } });
  await database.numberSequence.createMany({ data: [
    { companyId: COMPANY_ID, sequenceKey: 'client-receipt', prefix: 'CR-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
    { companyId: COMPANY_ID, sequenceKey: 'journal', prefix: 'JRN-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
  ] });
}

/** Sign in through the shared Final-21 browser authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture Client Receipts browser calls so only the frozen six-operation contract is used. */
function trackClientReceiptRequests(page) {
  const requests = [];
  page.on('request', (request) => { const url = new URL(request.url()); if (url.pathname.startsWith('/api/v1/client-receipts')) requests.push({ method: request.method(), pathname: url.pathname, idempotencyKey: request.headers()['idempotency-key'] ?? null }); });
  return requests;
}

/** Return true only for one of the six frozen Module 16 operations. */
function isAllowedClientReceiptPath(method, pathname) {
  if (pathname === '/api/v1/client-receipts') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/client-receipts\/[^/]+$/.test(pathname)) return method === 'GET';
  if (/^\/api\/v1\/client-receipts\/[^/]+\/(allocations|unallocate|reverse)$/.test(pathname)) return method === 'POST';
  return false;
}

test.beforeAll(async () => { await seedClientReceiptsBrowserScenario(); });
test.afterAll(async () => { await database?.$disconnect(); });

test('Final-21 Client Receipts advance -> allocate -> unallocate -> reverse browser workflow keeps cash separate from profit', async ({ page }) => {
  const requests = trackClientReceiptRequests(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Client Receipts / Payments' }).click();
  await expect(page.getByRole('heading', { name: 'Client Receipts / Payments' })).toBeVisible();
  const form = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'New Client Receipt' }) }).locator('form');
  await form.getByLabel('Client').selectOption(CLIENT_ID);
  await form.getByLabel('Project').selectOption(PROJECT_ID);
  await form.getByLabel('Stage (optional)').selectOption(STAGE_ID);
  await form.getByLabel('Receipt date').fill('2026-08-29');
  await form.getByLabel('Amount').fill('500.00');
  await form.getByLabel('Payment method').selectOption('BANK');
  await form.getByLabel('Cash / Bank account').selectOption(BANK_ID);
  await form.getByLabel('Receipt type').selectOption('ADVANCE');
  await form.getByLabel('Reference (optional)').fill('B18.10-E2E');
  await form.getByRole('button', { name: 'Create & post receipt' }).click();

  const detail = page.locator('section.admin-card').filter({ hasText: 'CR-00001' }).last();
  await expect(detail).toContainText(/Received\s*500\.00/);
  await expect(detail).toContainText(/Allocated\s*0\.00/);
  await expect(detail).toContainText(/Advance \/ unallocated\s*500\.00/);
  await expect(detail).toContainText('does not treat cash received as profit');
  await detail.getByRole('button', { name: 'Allocate' }).click();
  const allocationForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Allocate CR-00001' }) }).locator('form');
  await allocationForm.getByLabel('Issued Client Invoice').selectOption(INVOICE_ID);
  await allocationForm.getByLabel('Allocation amount').fill('300.00');
  await allocationForm.getByRole('button', { name: 'Allocate receipt' }).click();
  await expect(detail).toContainText(/Allocated\s*300\.00/);
  await expect(detail).toContainText(/Advance \/ unallocated\s*200\.00/);
  await detail.getByRole('button', { name: 'Unallocate' }).click();
  await expect(detail).toContainText(/Allocated\s*0\.00/);
  await detail.getByRole('button', { name: 'Reverse receipt' }).click();
  await expect(detail).toContainText('REVERSED');

  const receipt = await database.clientReceipt.findFirstOrThrow({ where: { companyId: COMPANY_ID, receiptNo: 'CR-00001' } });
  expect(receipt.status).toBe('REVERSED');
  expect(await database.clientReceiptAllocation.count({ where: { receiptId: receipt.id } })).toBe(0);
  const journals = await database.journal.findMany({ where: { companyId: COMPANY_ID, sourceKey: { in: [`client_receipt:${receipt.id}`, `client_receipt_reversal:${receipt.id}`] } } });
  expect(journals).toHaveLength(2);
  for (const journal of journals) expect(Number(journal.totalDebit)).toBe(Number(journal.totalCredit));
  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) { expect(isAllowedClientReceiptPath(request.method, request.pathname)).toBe(true); if (request.method === 'POST') expect(request.idempotencyKey).toBeTruthy(); }
});
