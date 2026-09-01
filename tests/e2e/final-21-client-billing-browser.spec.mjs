import { expect, test } from '@playwright/test';

const PASSWORD = 'Final21-B17.10-browser-password!';
const COMPANY_ID = '00000000-0000-4000-8000-000000017100';
const USER_ID = '00000000-0000-4000-8000-000000017101';
const ROLE_ID = '00000000-0000-4000-8000-000000017102';
const CLIENT_ID = '00000000-0000-4000-8000-000000017103';
const PROJECT_ID = '00000000-0000-4000-8000-000000017104';
const STAGE_ID = '00000000-0000-4000-8000-000000017105';
const RECEIVABLE_GL_ID = '00000000-0000-4000-8000-000000017106';
const REVENUE_GL_ID = '00000000-0000-4000-8000-000000017107';
const PERIOD_ID = '00000000-0000-4000-8000-000000017108';
const EMAIL = 'b17-10-client-billing@example.test';

const PERMISSIONS = [
  'client_billing.read',
  'client_billing.settings.manage',
  'claims.create',
  'claims.edit',
  'claims.finalize',
  'client_invoices.create',
  'client_invoices.read',
  'projects.read',
  'stages.read',
  'stages.financial.read',
  'finance.read'
];

let database;

/** Seed the smallest Project, Stage and Finance graph required by the Client Billing browser workflow. */
async function seedClientBillingBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'B17.10 Client Billing Browser Ltd',
      displayName: 'B17.10 Client Billing Browser',
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
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'b17-10-manager', name: 'B17.10 Manager', isSystem: false, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: permissions.map((permission) => ({ roleId: ROLE_ID, permissionCode: permission.code })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B17.10 Manager', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });

  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B1710-CLIENT', legalName: 'B17.10 Client Ltd', displayName: 'B17.10 Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.create({
    data: { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B1710-PROJECT', name: 'B17.10 Construction Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: USER_ID }
  });
  await database.projectStage.create({ data: { id: STAGE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' } });
  await database.glAccount.createMany({
    data: [
      { id: RECEIVABLE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
      { id: REVENUE_GL_ID, companyId: COMPANY_ID, accountCode: 'CLIENT-REVENUE', name: 'Client Revenue', accountType: 'REVENUE', status: 'ACTIVE' }
    ]
  });
  await database.fiscalPeriod.create({ data: { id: PERIOD_ID, companyId: COMPANY_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' } });
  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'progress-claim', prefix: 'CLM-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'client-invoice', prefix: 'INV-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
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

/** Capture Client Billing browser calls so only the frozen nine-route contract is used. */
function trackClientBillingRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/client-billing')) return;
    requests.push({ method: request.method(), pathname: url.pathname, idempotencyKey: request.headers()['idempotency-key'] ?? null });
  });
  return requests;
}

/** Return true only for one of the nine frozen Final Module 15 API operations. */
function isAllowedClientBillingPath(method, pathname) {
  if (/^\/api\/v1\/client-billing\/projects\/[^/]+\/settings$/.test(pathname)) return method === 'GET' || method === 'PUT';
  if (pathname === '/api/v1/client-billing/claims') return method === 'GET' || method === 'POST';
  if (/^\/api\/v1\/client-billing\/claims\/[^/]+$/.test(pathname)) return method === 'PATCH';
  if (/^\/api\/v1\/client-billing\/claims\/[^/]+\/finalize$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/client-billing\/claims\/[^/]+\/invoice$/.test(pathname)) return method === 'POST';
  if (pathname === '/api/v1/client-billing/invoices') return method === 'GET';
  if (/^\/api\/v1\/client-billing\/invoices\/[^/]+$/.test(pathname)) return method === 'GET';
  return false;
}

test.beforeAll(async () => {
  await seedClientBillingBrowserScenario();
});

test.afterAll(async () => {
  await database?.$disconnect();
});

test('Final-21 Client Billing Project -> Stage -> Claim -> Invoice browser workflow reconciles Stage billing and Finance', async ({ page }) => {
  const requests = trackClientBillingRequests(page);
  await signIn(page);

  await page.getByRole('button', { name: 'Client Billing' }).click();
  await expect(page.getByRole('heading', { name: 'Client Billing' })).toBeVisible();
  await page.getByLabel('Allowed Project').selectOption(PROJECT_ID);
  await expect(page.getByText('Fixed Price', { exact: false }).first()).toBeVisible();

  const settingsForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Billing settings' }) }).locator('form');
  await expect(settingsForm.getByLabel('Billing method')).toHaveValue('FIXED_PRICE');
  await settingsForm.getByLabel('Retention %').fill('10.0000');
  await settingsForm.getByLabel('Billing cycle').fill('MONTHLY');
  await settingsForm.getByRole('button', { name: 'Save settings' }).click();

  const claimForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'New progress claim' }) }).locator('form');
  await claimForm.getByLabel('Period end').fill('2026-08-25');
  await claimForm.getByLabel('Description').fill('Grey Structure certified work');
  await claimForm.getByLabel('Stage (optional)').selectOption(STAGE_ID);
  await claimForm.getByLabel('Billing progress % (optional)').fill('50.0000');
  await claimForm.getByLabel('Amount').fill('1000.00');
  await claimForm.getByRole('button', { name: 'Create claim' }).click();

  const claimCard = page.locator('section.admin-card').filter({ hasText: 'CLM-00001' }).last();
  await expect(claimCard).toContainText('DRAFT');
  await expect(claimCard).toContainText('GREY · Grey Structure');
  await claimCard.getByRole('button', { name: 'Finalize' }).click();
  await expect(claimCard).toContainText('FINALIZED');
  await expect(claimCard).toContainText('Retention 100.00');
  await expect(claimCard).toContainText('Net 900.00');
  await claimCard.getByRole('button', { name: 'Create invoice' }).click();

  const invoiceForm = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: /Create invoice for CLM-00001/ }) }).locator('form');
  await invoiceForm.getByLabel('Invoice date').fill('2026-08-29');
  await invoiceForm.getByLabel('Due date').fill('2026-09-28');
  await invoiceForm.getByRole('button', { name: 'Create invoice' }).click();

  const invoicesCard = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Client invoices' }) });
  await expect(invoicesCard).toContainText('INV-00001');
  await expect(invoicesCard).toContainText('ISSUED');
  await expect(invoicesCard).toContainText('Billed 900.00');
  await expect(invoicesCard).toContainText('GREY · Grey Structure');

  const claim = await database.progressClaim.findFirstOrThrow({ where: { companyId: COMPANY_ID, claimNo: 'CLM-00001' }, include: { lines: true } });
  const invoice = await database.clientInvoice.findFirstOrThrow({ where: { companyId: COMPANY_ID, invoiceNo: 'INV-00001' }, include: { lines: true } });
  const journal = await database.journal.findFirstOrThrow({ where: { companyId: COMPANY_ID, sourceKey: `client_invoice:${invoice.id}` }, include: { lines: true } });

  expect(claim.status).toBe('FINALIZED');
  expect(Number(claim.grossValue)).toBe(1000);
  expect(Number(claim.retention)).toBe(100);
  expect(Number(claim.netCertified)).toBe(900);
  expect(invoice.claimId).toBe(claim.id);
  expect(invoice.lines).toHaveLength(1);
  expect(invoice.lines[0].stageId).toBe(STAGE_ID);
  expect(Number(invoice.lines[0].amount)).toBe(900);
  expect(journal.status).toBe('POSTED');
  expect(Number(journal.totalDebit)).toBe(900);
  expect(Number(journal.totalCredit)).toBe(900);
  expect(journal.lines.filter((line) => line.stageId === STAGE_ID && Number(line.credit) === 900)).toHaveLength(1);
  expect(await database.clientInvoice.count({ where: { claimId: claim.id } })).toBe(1);

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) {
    expect(isAllowedClientBillingPath(request.method, request.pathname)).toBe(true);
    if (request.method === 'POST' || request.method === 'PUT' || request.method === 'PATCH') expect(request.idempotencyKey).toBeTruthy();
  }
});
