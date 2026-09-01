import { expect, test } from '@playwright/test';

const COMPANY_ID = '00000000-0000-4000-8000-000000021101';
const USER_ID = '00000000-0000-4000-8000-000000021110';
const ROLE_ID = '00000000-0000-4000-8000-000000021120';
const CLIENT_ID = '00000000-0000-4000-8000-000000021130';
const PROJECT_ID = '00000000-0000-4000-8000-000000021140';
const STAGE_ID = '00000000-0000-4000-8000-000000021150';
const BASELINE_ID = '00000000-0000-4000-8000-000000021151';
const PROGRESS_ID = '00000000-0000-4000-8000-000000021152';
const SAVED_FILTER_ID = '00000000-0000-4000-8000-000000021160';
const EMAIL = 'b1-10-dashboard-browser@example.test';
const PASSWORD = 'Final21-dashboard-B1.10-browser-password!';
const DASHBOARD_PERMISSIONS = ['dashboard.read', 'dashboard.project.read', 'dashboard.manage_preferences', 'stages.read'];

let database;

/** Seed one small overdue Project and approved Stage Progress scenario for the final Dashboard browser workflow. */
async function seedDashboardBrowserScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);
  const passwordHash = await hashPassword(PASSWORD);

  await database.company.create({ data: { id: COMPANY_ID, legalName: 'B1.10 Browser Company Ltd', displayName: 'B1.10 Browser Company', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } } });
  for (const code of DASHBOARD_PERMISSIONS) {
    await database.permission.upsert({ where: { code }, update: { description: code, domain: 'dashboard-b1-10-browser' }, create: { code, description: code, domain: 'dashboard-b1-10-browser' } });
  }
  await database.role.create({ data: { id: ROLE_ID, companyId: COMPANY_ID, code: 'system-admin', name: 'B1.10 Dashboard Browser Admin', isSystem: true, status: 'ACTIVE' } });
  await database.rolePermission.createMany({ data: DASHBOARD_PERMISSIONS.map((permissionCode) => ({ roleId: ROLE_ID, permissionCode })) });
  await database.user.create({ data: { id: USER_ID, companyId: COMPANY_ID, email: EMAIL, name: 'B1.10 Dashboard Browser', passwordHash, status: 'ACTIVE' } });
  await database.userRole.create({ data: { companyId: COMPANY_ID, userId: USER_ID, roleId: ROLE_ID, status: 'ACTIVE' } });
  await database.client.create({ data: { id: CLIENT_ID, companyId: COMPANY_ID, code: 'B110-BROWSER-CLIENT', legalName: 'B1.10 Browser Client Ltd', displayName: 'B1.10 Browser Client', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' } });
  await database.project.create({ data: { id: PROJECT_ID, companyId: COMPANY_ID, projectCode: 'B110-BROWSER', name: 'B1.10 Browser Project', clientId: CLIENT_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '1000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2026-08-15T00:00:00.000Z') } });
  await database.projectStage.create({ data: { id: STAGE_ID, companyId: COMPANY_ID, projectId: PROJECT_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '1000.00', plannedEndDate: new Date('2026-08-10T00:00:00.000Z'), status: 'ACTIVE' } });
  await database.stageProgressBaseline.create({ data: { id: BASELINE_ID, projectId: PROJECT_ID, versionNo: 1, status: 'FROZEN', totalWeightPercent: '100.0000', frozenAt: new Date('2026-08-01T12:00:00.000Z'), frozenBy: USER_ID } });
  await database.stageProgressUpdate.create({ data: { id: PROGRESS_ID, stageId: STAGE_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-20T00:00:00.000Z'), enteredBy: USER_ID, approvedBy: USER_ID, approvedAt: new Date('2026-08-20T12:00:00.000Z'), status: 'APPROVED' } });
  await database.dashboardSavedFilter.create({ data: { id: SAVED_FILTER_ID, companyId: COMPANY_ID, userId: USER_ID, name: 'Current Project View', filterJson: { projectId: PROJECT_ID, asOfDate: '2026-08-31' } } });
}

/** Sign in through the shared Final-21 authentication form. */
async function signIn(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(EMAIL);
}

/** Capture only Module 1 requests so the frozen five-operation surface can be checked. */
function trackDashboardRequests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/v1/dashboard')) requests.push({ method: request.method(), pathname: url.pathname });
  });
  return requests;
}

/** Return true only for one frozen Dashboard path and method. */
function isAllowedDashboardRequest(method, pathname) {
  if (method === 'GET' && ['/api/v1/dashboard/summary', '/api/v1/dashboard/projects', '/api/v1/dashboard/alerts'].includes(pathname)) return true;
  if (method === 'GET' && /^\/api\/v1\/dashboard\/projects\/[^/]+$/.test(pathname)) return true;
  if (method === 'PATCH' && pathname === '/api/v1/dashboard/preferences') return true;
  return false;
}

test.beforeAll(async () => { await seedDashboardBrowserScenario(); });
test.afterAll(async () => { await database?.$disconnect(); });

test('Final-21 Dashboard -> Project health -> Stage Progress -> source alerts -> preference stays permission-safe and server-derived', async ({ page }) => {
  const requests = trackDashboardRequests(page);
  await signIn(page);
  await expect(page.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();
  await expect(page.getByText('Cash received is not profit.')).toBeVisible();

  await page.getByRole('button', { name: 'Current Project View' }).click();
  await expect(page.getByLabel('Project')).toHaveValue(PROJECT_ID);
  const projectSnapshot = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Project financial & physical snapshot' }) });
  await expect(projectSnapshot).toContainText('B110-BROWSER');
  await expect(projectSnapshot).toContainText('60');

  const stages = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Stage progress snapshot' }) });
  await expect(stages).toContainText('Grey Structure');
  await expect(stages).toContainText('60');

  const alerts = page.locator('section.admin-card').filter({ has: page.getByRole('heading', { name: 'Alerts' }) });
  await expect(alerts).toContainText('Project planned end date has passed.');
  await expect(alerts).toContainText('Grey Structure is past its planned end date.');

  await page.getByRole('button', { name: 'Save current view' }).click();
  await expect(page.getByText(/Preferences saved/)).toBeVisible();

  expect(requests.length).toBeGreaterThan(0);
  for (const request of requests) expect(isAllowedDashboardRequest(request.method, request.pathname)).toBe(true);
  expect(requests.some((request) => request.method === 'POST' || request.method === 'PUT' || request.method === 'DELETE')).toBe(false);
});
