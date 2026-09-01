import { expect, test } from '@playwright/test';

const COMPANY_ID = '00000000-0000-4000-8000-000000020101';
const USER_ID = '00000000-0000-4000-8000-000000020110';
const ROLE_ID = '00000000-0000-4000-8000-000000020120';
const CLIENT_ID = '00000000-0000-4000-8000-000000020130';
const PROJECT_ID = '00000000-0000-4000-8000-000000020140';
const STAGE_ID = '00000000-0000-4000-8000-000000020150';
const BASELINE_ID = '00000000-0000-4000-8000-000000020151';
const PROGRESS_ID = '00000000-0000-4000-8000-000000020152';
const EMAIL = 'b20-10-reports-browser@example.test';
const PASSWORD = 'Final21-reports-B20.10-browser-password!';
const REPORT_PERMISSIONS = ['reports.read', 'reports.export', 'reports.save_filters', 'stages.read'];

let database;

/** Seed one small Stage Progress scenario for the guarded Module 20 browser workflow. */
async function seedReportsBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({ data: { id: COMPANY_ID, legalName: 'B20.10 Browser Company Ltd', displayName: 'B20.10 Browser Company', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } } });
  for (const code of REPORT_PERMISSIONS) {
    await database.permission.upsert({ where: { code }, update: { description: code, domain: 'reports-b20-10-browser' }, create: { code, description: code, domain: 'reports-b20-10-browser' } });
  }
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'B20.10 Reports Browser Admin', isSystem: true, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: REPORT_PERMISSIONS.map((permissionCode) => ({ roleId: ROLE_ID, permissionCode })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B20.10 Reports Browser', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });
  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B2010-BROWSER-CLIENT', legalName: 'B20.10 Browser Client Ltd', displayName: 'B20.10 Browser Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.create({ data: { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B2010-BROWSER', name: 'B20.10 Browser Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '1000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z') } });
  await database.projectStage.create({ data: { id: STAGE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '1000000.00', status: 'ACTIVE' } });
  await database.stageProgressBaseline.create({ data: { id: BASELINE_ID, projectId: PROJECT_ID, versionNo: 1, status: 'FROZEN', totalWeightPercent: '100.0000', frozenAt: new Date('2026-08-01T12:00:00.000Z'), frozenBy: USER_ID } });
  await database.stageProgressUpdate.create({ data: { id: PROGRESS_ID, stageId: STAGE_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-20T00:00:00.000Z'), enteredBy: USER_ID, approvedBy: USER_ID, approvedAt: new Date('2026-08-20T12:00:00.000Z'), status: 'APPROVED' } });
}

/** Sign in through the shared Final-21 authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture only Module 20 requests so the frozen seven-operation surface can be checked. */
function trackReportsRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/reports')) requests.push({ method: request.method(), pathname: url.pathname });
  });
  return requests;
}

/** Return true only for a frozen Reports path and method. */
function isAllowedReportsRequest(method, pathname) {
  if (method === 'GET' && ['/api/v1/reports/catalog', '/api/v1/reports/saved-filters'].includes(pathname)) return true;
  if (method === 'POST' && ['/api/v1/reports/run', '/api/v1/reports/exports', '/api/v1/reports/saved-filters'].includes(pathname)) return true;
  if (method === 'GET' && /^\/api\/v1\/reports\/runs\/[^/]+(?:\/download)?$/.test(pathname)) return true;
  return false;
}

test.beforeAll(async () => { await seedReportsBrowserScenario(); });
test.afterAll(async () => { await database?.$disconnect(); });

test('Final-21 Reports catalog -> Stage Progress -> saved filter -> queued export stays permission-safe and server-derived', async ({ page }) => {
  const requests = trackReportsRequests(page);
  await signIn(page);
  await page.getByRole('button', { name: 'Reports & Analytics' }).click();
  await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible();
  await expect(page.getByLabel('Report Catalog')).toHaveValue('stage-progress');

  await page.getByLabel('Project ID').fill(PROJECT_ID);
  await page.getByRole('button', { name: 'Run Report' }).click();
  const results = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Report Results' }) });
  await expect(results).toContainText('Grey Structure');
  await expect(results).toContainText('60');

  await page.getByLabel('Filter name').fill('Current Project Progress');
  await page.getByRole('button', { name: 'Save current filters' }).click();
  await expect(page.getByRole('button', { name: 'Current Project Progress' })).toBeVisible();

  await page.getByLabel('Export format').selectOption('CSV');
  await page.getByRole('button', { name: 'Export' }).click();
  const exportStatus = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Export Status' }) });
  await expect(exportStatus).toContainText('stage-progress');
  await expect(exportStatus).toContainText('CSV');
  await expect(exportStatus).toContainText('QUEUED');
  await expect(page.getByText('Company, permissions and Project scope stay server-derived.')).toBeVisible();

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) expect(isAllowedReportsRequest(request.method, request.pathname)).toBe(true);
  expect(requests.some((request) => request.method === 'PUT' || request.method === 'PATCH' || request.method === 'DELETE')).toBe(false);
});
