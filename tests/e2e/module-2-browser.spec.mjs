import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass105-crm-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000010500';
const MANAGER_ID = '00000000-0000-4000-8000-000000010510';
const READER_ID = '00000000-0000-4000-8000-000000010511';
const OPPORTUNITY_READER_ID = '00000000-0000-4000-8000-000000010512';
const NO_ACCESS_ID = '00000000-0000-4000-8000-000000010513';

const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000010520';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000010521';
const OPPORTUNITY_READER_ROLE_ID = '00000000-0000-4000-8000-000000010522';
const NO_ACCESS_ROLE_ID = '00000000-0000-4000-8000-000000010523';

const MANAGER_EMAIL = 'pass105-crm-manager@example.test';
const READER_EMAIL = 'pass105-crm-reader@example.test';
const OPPORTUNITY_READER_EMAIL = 'pass105-opportunity-reader@example.test';
const NO_ACCESS_EMAIL = 'pass105-no-crm-access@example.test';

const CLIENT_CODE = 'PASS105-CLIENT';
const CLIENT_NAME = 'Pass 105 Client';
const UPDATED_CLIENT_NAME = 'Pass 105 Client Updated';
const CONTACT_EMAIL = 'commercial.manager@example.test';
const OPPORTUNITY_CODE = 'PASS105-OPP';
const OPPORTUNITY_NAME = 'Pass 105 Commercial Opportunity';
const NOTE_TEXT = 'Client confirmed the revised commercial review date.';

const MODULE_2_PERMISSIONS = [
  'clients.read',
  'clients.create',
  'clients.update',
  'opportunities.read',
  'opportunities.manage'
];

let database;

/** Seed one company and the small permission set needed by the Module 2 browser workflow. */
async function seedScenario() {
  const testing = await import('@construction-erp/testing');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);

  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'Pass 105 CRM Company Ltd',
      displayName: 'Pass 105 CRM Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of MODULE_2_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'crm' },
      create: { code, name: code, domain: 'crm' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: MANAGER_ROLE_ID, companyId: COMPANY_ID, code: 'crm-manager', name: 'CRM Manager', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_ID, companyId: COMPANY_ID, code: 'crm-reader', name: 'CRM Reader', isSystem: false, status: 'ACTIVE' },
      { id: OPPORTUNITY_READER_ROLE_ID, companyId: COMPANY_ID, code: 'opportunity-reader', name: 'Opportunity Reader', isSystem: false, status: 'ACTIVE' },
      { id: NO_ACCESS_ROLE_ID, companyId: COMPANY_ID, code: 'no-crm-access', name: 'No CRM Access', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await database.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: MANAGER_ROLE_ID, permissionId: permission.id })),
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('clients.read') },
      { roleId: READER_ROLE_ID, permissionId: permissionByCode.get('opportunities.read') },
      { roleId: OPPORTUNITY_READER_ROLE_ID, permissionId: permissionByCode.get('opportunities.read') }
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 105 CRM Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 105 CRM Reader', status: 'ACTIVE' },
      { id: OPPORTUNITY_READER_ID, companyId: COMPANY_ID, email: OPPORTUNITY_READER_EMAIL, name: 'Pass 105 Opportunity Reader', status: 'ACTIVE' },
      { id: NO_ACCESS_ID, companyId: COMPANY_ID, email: NO_ACCESS_EMAIL, name: 'Pass 105 No CRM Access', status: 'ACTIVE' }
    ]
  });

  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID, OPPORTUNITY_READER_ID, NO_ACCESS_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: MANAGER_ID, roleId: MANAGER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: READER_ID, roleId: READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: OPPORTUNITY_READER_ID, roleId: OPPORTUNITY_READER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: NO_ACCESS_ID, roleId: NO_ACCESS_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });
}

/** Sign in through the real Module 24A browser form and wait for the authenticated shell. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Record Module 2 browser requests so the test can verify UI isolation and request ownership. */
function trackModule2Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/v1/clients') && !url.pathname.startsWith('/api/v1/opportunities')) return;

    let body = null;
    if (request.postData()) {
      try {
        body = request.postDataJSON();
      } catch {
        body = request.postData();
      }
    }

    requests.push({ method: request.method(), pathname: url.pathname, body });
  });
  return requests;
}

/** Verify browser mutation bodies never contain company, actor, permission or project-scope authority. */
function assertServerOwnedAuthority(requests) {
  const forbiddenFields = ['companyId', 'actorUserId', 'permissions', 'projectScope'];
  for (const request of requests) {
    if (!request.body || typeof request.body !== 'object' || Array.isArray(request.body)) continue;
    for (const field of forbiddenFields) expect(request.body).not.toHaveProperty(field);
  }

  const createOpportunityRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/opportunities');
  expect(createOpportunityRequest?.body).toBeTruthy();
  expect(createOpportunityRequest.body).not.toHaveProperty('stage');

  const createClientRequest = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/clients');
  expect(createClientRequest?.body).toBeTruthy();
  expect(createClientRequest.body).not.toHaveProperty('status');
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 2 browser workflow covers CRM operations, permission-aware UI and API enforcement', async ({ page, browser }) => {
  const managerRequests = trackModule2Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await expect(page.getByRole('heading', { name: 'CRM & Client Management' })).toBeVisible();

  // Create the client through the real browser form.
  const createClientCard = page.getByRole('heading', { name: 'Create client' }).locator('..');
  await createClientCard.getByLabel('Code').fill(CLIENT_CODE);
  await createClientCard.getByLabel('Display name').fill(CLIENT_NAME);
  await createClientCard.getByLabel('Legal name').fill('Pass 105 Client Legal Ltd');
  await createClientCard.getByLabel('Tax number').fill('TAX-105');
  await createClientCard.getByLabel('Credit terms (days)').fill('30');
  await createClientCard.getByLabel('Billing address').fill('105 Commercial Avenue');
  await createClientCard.getByRole('button', { name: 'Create client' }).click();
  await expect(page.getByRole('heading', { name: CLIENT_NAME })).toBeVisible();

  const client = await database.client.findUnique({
    where: { companyId_code: { companyId: COMPANY_ID, code: CLIENT_CODE } }
  });
  expect(client).toBeTruthy();

  // Add a primary contact and verify the contact appears in the loaded client detail.
  const contactCard = page.getByRole('heading', { name: 'Add contact' }).locator('..');
  await contactCard.getByLabel('Name').fill('Commercial Manager');
  await contactCard.getByLabel('Title').fill('Commercial Manager');
  await contactCard.getByLabel('Email').fill(CONTACT_EMAIL);
  await contactCard.getByLabel('Phone').fill('+92 300 1234567');
  await contactCard.getByLabel('Primary contact').check();
  await contactCard.getByRole('button', { name: 'Add contact' }).click();
  await expect(page.getByRole('row').filter({ hasText: CONTACT_EMAIL })).toBeVisible();

  // Edit the client through the same selected detail panel.
  const editClientCard = page.getByRole('heading', { name: 'Edit client' }).locator('..');
  await editClientCard.getByLabel('Display name').fill(UPDATED_CLIENT_NAME);
  await editClientCard.getByLabel('Billing address').fill('105 Updated Commercial Avenue');
  await editClientCard.getByRole('button', { name: 'Save client' }).click();
  await expect(page.getByRole('heading', { name: UPDATED_CLIENT_NAME })).toBeVisible();

  // Create one opportunity using only browser-owned business fields.
  const createOpportunityCard = page.getByRole('heading', { name: 'Create opportunity' }).locator('..');
  await createOpportunityCard.getByLabel('Client ID').fill(client.id);
  await createOpportunityCard.getByLabel('Code').fill(OPPORTUNITY_CODE);
  await createOpportunityCard.getByLabel('Name').fill(OPPORTUNITY_NAME);
  await createOpportunityCard.getByLabel('Estimated value').fill('125000.50');
  await createOpportunityCard.getByLabel('Probability (%)').fill('65');
  await createOpportunityCard.getByLabel('Source').fill('Referral');
  await createOpportunityCard.getByLabel('Owner user ID').fill(MANAGER_ID);
  await createOpportunityCard.getByLabel('Expected close date').fill('2027-03-31');
  await createOpportunityCard.getByRole('button', { name: 'Create opportunity' }).click();
  await expect(page.getByRole('heading', { name: OPPORTUNITY_NAME })).toBeVisible();

  const opportunity = await database.opportunity.findFirst({
    where: { companyId: COMPANY_ID, code: OPPORTUNITY_CODE }
  });
  expect(opportunity).toBeTruthy();
  expect(opportunity.stage).toBe('LEAD');

  // Append one activity note through the approved append-only UI.
  const noteCard = page.getByRole('heading', { name: 'Add activity note' }).locator('..');
  await noteCard.getByLabel('Note').fill(NOTE_TEXT);
  await noteCard.getByRole('button', { name: 'Add note' }).click();
  await expect(page.getByText(NOTE_TEXT, { exact: true })).toBeVisible();

  // Move through the controlled stage workflow to WON.
  await page.getByRole('button', { name: 'Move to QUALIFIED' }).click();
  await expect(page.getByText(`${OPPORTUNITY_CODE} · QUALIFIED`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move to TENDERING' }).click();
  await expect(page.getByText(`${OPPORTUNITY_CODE} · TENDERING`, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Move to WON' }).click();
  await expect(page.getByText(`${OPPORTUNITY_CODE} · WON`, { exact: true })).toBeVisible();

  // WON cannot use a normal backward transition; it must use the explicit audited reopen form.
  await expect(page.getByRole('button', { name: 'Move to QUALIFIED' })).toHaveCount(0);
  const reopenCard = page.getByRole('heading', { name: 'Reopen won opportunity' }).locator('..');
  await reopenCard.getByLabel('Reopen to').selectOption('QUALIFIED');
  await reopenCard.getByLabel('Reason').fill('Client requested another commercial review.');
  await reopenCard.getByRole('button', { name: 'Reopen opportunity' }).click();
  await expect(page.getByText(`${OPPORTUNITY_CODE} · QUALIFIED`, { exact: true })).toBeVisible();

  // Apply real pipeline filters and verify the opportunity remains visible through server-side querying.
  const pipelineCard = page.locator('section[aria-labelledby="opportunity-pipeline-title"]');
  await pipelineCard.getByLabel('Search').fill(OPPORTUNITY_CODE);
  await pipelineCard.getByLabel('Stage').selectOption('QUALIFIED');
  await pipelineCard.getByRole('button', { name: 'Apply filters' }).click();
  await expect(pipelineCard.getByRole('row').filter({ hasText: OPPORTUNITY_CODE })).toBeVisible();

  assertServerOwnedAuthority(managerRequests);

  // A read-only CRM user can inspect the same data but receives no mutation controls.
  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await signIn(readerPage, READER_EMAIL);
  await expect(readerPage.getByRole('heading', { name: 'CRM & Client Management' })).toBeVisible();
  await expect(readerPage.getByRole('heading', { name: 'Create client' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Create opportunity' })).toHaveCount(0);

  const readerClientRow = readerPage.getByRole('row').filter({ hasText: UPDATED_CLIENT_NAME });
  await expect(readerClientRow).toBeVisible();
  await readerClientRow.getByRole('button', { name: 'Open' }).click();
  await expect(readerPage.getByRole('heading', { name: UPDATED_CLIENT_NAME })).toBeVisible();
  await expect(readerPage.getByRole('heading', { name: 'Edit client' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Add contact' })).toHaveCount(0);
  await expect(readerPage.getByRole('button', { name: 'Archive client' })).toHaveCount(0);

  const readerOpportunityRow = readerPage.getByRole('row').filter({ hasText: OPPORTUNITY_CODE });
  await expect(readerOpportunityRow).toBeVisible();
  await readerOpportunityRow.getByRole('button', { name: 'Open' }).click();
  await expect(readerPage.getByText(NOTE_TEXT, { exact: true })).toBeVisible();
  await expect(readerPage.getByRole('heading', { name: 'Change stage' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Add activity note' })).toHaveCount(0);

  // Hiding buttons is not the security boundary: the API independently rejects the mutation.
  const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(readerToken).toBeTruthy();
  const forbiddenStageChange = await readerPage.request.post(`${API_BASE_URL}/opportunities/${opportunity.id}/change-stage`, {
    headers: { authorization: `Bearer ${readerToken}` },
    data: { targetStage: 'TENDERING' }
  });
  expect(forbiddenStageChange.status()).toBe(403);

  // An opportunity-only reader gets CRM navigation and pipeline data without triggering Client API calls.
  const opportunityReaderContext = await browser.newContext();
  const opportunityReaderPage = await opportunityReaderContext.newPage();
  const opportunityReaderRequests = trackModule2Requests(opportunityReaderPage);
  await signIn(opportunityReaderPage, OPPORTUNITY_READER_EMAIL);
  await expect(opportunityReaderPage.getByRole('button', { name: 'CRM & Clients' })).toBeVisible();
  await expect(opportunityReaderPage.getByRole('heading', { name: 'Opportunities' })).toBeVisible();
  await expect(opportunityReaderPage.getByRole('row').filter({ hasText: OPPORTUNITY_CODE })).toBeVisible();
  await expect(opportunityReaderPage.getByLabel('Search clients')).toHaveCount(0);
  expect(opportunityReaderRequests.filter((request) => request.pathname.startsWith('/api/v1/clients'))).toHaveLength(0);

  // A user without either CRM read permission gets no CRM navigation and no CRM data request.
  const noAccessContext = await browser.newContext();
  const noAccessPage = await noAccessContext.newPage();
  const noAccessRequests = trackModule2Requests(noAccessPage);
  await signIn(noAccessPage, NO_ACCESS_EMAIL);
  await expect(noAccessPage.getByRole('heading', { name: 'No module access' })).toBeVisible();
  await expect(noAccessPage.getByRole('button', { name: 'CRM & Clients' })).toHaveCount(0);
  expect(noAccessRequests).toHaveLength(0);

  const finalOpportunity = await database.opportunity.findUnique({ where: { id: opportunity.id } });
  expect(finalOpportunity?.stage).toBe('QUALIFIED');

  await readerContext.close();
  await opportunityReaderContext.close();
  await noAccessContext.close();
});
