import { expect, test } from '@playwright/test';

const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass79-approval-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000007900';
const ADMIN_ID = '00000000-0000-4000-8000-000000007910';
const APPROVER_ID = '00000000-0000-4000-8000-000000007911';
const DELEGATE_ID = '00000000-0000-4000-8000-000000007912';
const LIMITED_ID = '00000000-0000-4000-8000-000000007913';

const ADMIN_ROLE_ID = '00000000-0000-4000-8000-000000007920';
const APPROVER_ROLE_ID = '00000000-0000-4000-8000-000000007921';
const DELEGATE_ROLE_ID = '00000000-0000-4000-8000-000000007922';
const LIMITED_ROLE_ID = '00000000-0000-4000-8000-000000007923';

const ADMIN_EMAIL = 'pass79-approval-admin@example.test';
const APPROVER_EMAIL = 'pass79-approval-approver@example.test';
const DELEGATE_EMAIL = 'pass79-approval-delegate@example.test';
const LIMITED_EMAIL = 'pass79-approval-limited@example.test';

const MAIN_CODE = 'PASS79_MAIN';
const MAIN_NAME = 'Pass 79 Approval';
const MAIN_RESOURCE_TYPE = 'CHANGE_ORDER';
const LIMITED_CODE = 'PASS79_LIMITED';
const LIMITED_NAME = 'Pass 79 Limited Approval';
const LIMITED_RESOURCE_TYPE = 'BUDGET';

const APPROVE_RESOURCE_ID = '00000000-0000-4000-8000-000000007901';
const REJECT_RESOURCE_ID = '00000000-0000-4000-8000-000000007902';
const RETURN_RESOURCE_ID = '00000000-0000-4000-8000-000000007903';
const DELEGATED_RESOURCE_ID = '00000000-0000-4000-8000-000000007904';
const LIMITED_RESOURCE_ID = '00000000-0000-4000-8000-000000007905';

const APPROVAL_PERMISSIONS = [
  'approvals.inbox.read',
  'approvals.act',
  'approval_definitions.read',
  'approval_definitions.manage',
  'approval_delegations.manage'
];

let database;
let testing;
let ApprovalsService;
let requestCounter = 0;

/** Seed the small company/user/role set used by the browser workflow. */
async function seedScenario() {
  testing = await import('@construction-erp/testing');
  ({ ApprovalsService } = await import('../../apps/api/dist/modules/approvals/index.js'));
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');

  database = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  await database.$connect();
  await testing.resetFoundationTestData(database);

  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await database.company.create({
    data: {
      id: COMPANY_ID,
      legalName: 'Pass 79 Approval Company Ltd',
      displayName: 'Pass 79 Approval Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of APPROVAL_PERMISSIONS) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: 'approvals' },
      create: { code, name: code, domain: 'approvals' }
    }));
  }

  await database.role.createMany({
    data: [
      { id: ADMIN_ROLE_ID, companyId: COMPANY_ID, code: 'approval-admin', name: 'Approval Admin', isSystem: false, status: 'ACTIVE' },
      { id: APPROVER_ROLE_ID, companyId: COMPANY_ID, code: 'approval-approver', name: 'Approval Approver', isSystem: false, status: 'ACTIVE' },
      { id: DELEGATE_ROLE_ID, companyId: COMPANY_ID, code: 'approval-delegate', name: 'Approval Delegate', isSystem: false, status: 'ACTIVE' },
      { id: LIMITED_ROLE_ID, companyId: COMPANY_ID, code: 'approval-limited', name: 'Approval Limited', isSystem: false, status: 'ACTIVE' }
    ]
  });

  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));
  await database.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_ID, permissionId: permission.id })),
      { roleId: APPROVER_ROLE_ID, permissionId: permissionByCode.get('approvals.inbox.read') },
      { roleId: APPROVER_ROLE_ID, permissionId: permissionByCode.get('approvals.act') },
      { roleId: DELEGATE_ROLE_ID, permissionId: permissionByCode.get('approvals.inbox.read') },
      { roleId: DELEGATE_ROLE_ID, permissionId: permissionByCode.get('approvals.act') },
      { roleId: LIMITED_ROLE_ID, permissionId: permissionByCode.get('approvals.inbox.read') }
    ]
  });

  await database.user.createMany({
    data: [
      { id: ADMIN_ID, companyId: COMPANY_ID, email: ADMIN_EMAIL, name: 'Pass 79 Approval Admin', status: 'ACTIVE' },
      { id: APPROVER_ID, companyId: COMPANY_ID, email: APPROVER_EMAIL, name: 'Pass 79 Approver', status: 'ACTIVE' },
      { id: DELEGATE_ID, companyId: COMPANY_ID, email: DELEGATE_EMAIL, name: 'Pass 79 Delegate', status: 'ACTIVE' },
      { id: LIMITED_ID, companyId: COMPANY_ID, email: LIMITED_EMAIL, name: 'Pass 79 Limited Approver', status: 'ACTIVE' }
    ]
  });

  await database.authCredential.createMany({
    data: [ADMIN_ID, APPROVER_ID, DELEGATE_ID, LIMITED_ID].map((userId) => ({ userId, passwordHash }))
  });

  await database.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_ID, userId: ADMIN_ID, roleId: ADMIN_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: APPROVER_ID, roleId: APPROVER_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: DELEGATE_ID, roleId: DELEGATE_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_ID, userId: LIMITED_ID, roleId: LIMITED_ROLE_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });
}

/** Sign in through the real Module 24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Approval Workflows' })).toBeVisible();
}

/** Create one active USER-based definition through the real Module 22 UI. */
async function createDefinitionInUi(page, input) {
  await page.getByRole('button', { name: 'Definitions' }).click();
  const builder = page.getByRole('heading', { name: 'Workflow definition builder' }).locator('..');
  await builder.getByLabel('Code').fill(input.code);
  await builder.getByLabel('Name').fill(input.name);
  await builder.getByLabel('Resource type').fill(input.resourceType);
  await builder.getByLabel('Initial status').selectOption('ACTIVE');
  await builder.getByLabel('Approver type').selectOption('USER');
  await builder.getByLabel('User / role UUID').fill(input.approverUserId);
  await builder.getByLabel('Minimum approvals').fill('1');
  await builder.getByRole('button', { name: 'Create definition version' }).click();
  await expect(builder.getByText(`Created ${input.code} version 1.`)).toBeVisible();
}

/** Create one request through the trusted internal server contract, never a public browser endpoint. */
async function createInternalRequest(input) {
  requestCounter += 1;
  return testing.runWithAuthenticatedTestContext({
    requestId: `module-22-browser-${requestCounter}`,
    correlationId: `module-22-browser-${requestCounter}`,
    actorUserId: ADMIN_ID,
    companyId: COMPANY_ID,
    permissions: [],
    projectScope: { kind: 'not-resolved' }
  }, async () => {
    const service = new ApprovalsService(database);
    return service.requestApproval({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      definitionCode: input.definitionCode,
      payloadSnapshot: { amount: input.amount, description: input.description },
      sourceKey: {
        sourceModule: 'module-22-browser-test',
        sourceType: 'approval-request',
        sourceId: input.resourceId,
        sourceLineId: input.definitionCode
      }
    });
  });
}

/** Open one inbox row by resource ID and perform one append-only approval action. */
async function actFromInbox(page, input) {
  const row = page.getByRole('row').filter({ hasText: input.resourceId });
  await expect(row).toBeVisible();
  await row.getByRole('button').click();

  const dialogAction = input.action.charAt(0) + input.action.slice(1).toLowerCase();
  await page.getByRole('button', { name: dialogAction }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/Comment/).fill(input.comment);
  await dialog.getByRole('button', { name: dialogAction }).click();

  await expect(page.locator('.approval-summary').getByText(input.expectedStatus, { exact: true })).toBeVisible();
  const timeline = page.getByRole('heading', { name: 'Decision timeline' }).locator('..');
  await expect(timeline.getByRole('row').filter({ hasText: input.comment })).toBeVisible();
}

test.beforeAll(async () => {
  await seedScenario();
});

test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 22 browser workflow covers definitions, decisions, delegation and permission denial', async ({ page, browser }) => {
  await signIn(page, ADMIN_EMAIL);

  // Administrators create the reusable workflow definitions through the actual UI.
  await createDefinitionInUi(page, {
    code: MAIN_CODE,
    name: MAIN_NAME,
    resourceType: MAIN_RESOURCE_TYPE,
    approverUserId: APPROVER_ID
  });
  await createDefinitionInUi(page, {
    code: LIMITED_CODE,
    name: LIMITED_NAME,
    resourceType: LIMITED_RESOURCE_TYPE,
    approverUserId: LIMITED_ID
  });

  // Create one direct delegation through the approved delegation screen.
  await page.getByRole('button', { name: 'Delegations' }).click();
  const delegationCard = page.getByRole('heading', { name: 'Approval delegation' }).locator('..');
  await delegationCard.getByLabel('From user UUID').fill(APPROVER_ID);
  await delegationCard.getByLabel('Delegate user UUID').fill(DELEGATE_ID);
  await delegationCard.getByLabel('Start date').fill('2026-01-01');
  await delegationCard.getByLabel('End date').fill('2030-12-31');
  await delegationCard.getByLabel('Resource types').fill(MAIN_RESOURCE_TYPE);
  await delegationCard.getByRole('button', { name: 'Create delegation' }).click();
  await expect(delegationCard.getByText(/Delegation .* created\./)).toBeVisible();
  const delegationList = page.getByRole('heading', { name: 'Existing delegations' }).locator('..');
  await expect(delegationList.getByRole('row').filter({ hasText: APPROVER_ID }).filter({ hasText: DELEGATE_ID })).toBeVisible();

  // Reload proves the delegation list comes from durable server state rather than local form state.
  await page.reload();
  await page.getByRole('button', { name: 'Delegations' }).click();
  const reloadedDelegationList = page.getByRole('heading', { name: 'Existing delegations' }).locator('..');
  await expect(reloadedDelegationList.getByRole('row').filter({ hasText: APPROVER_ID }).filter({ hasText: DELEGATE_ID })).toBeVisible();

  // Owning business modules use the trusted internal service contract to request approval.
  await createInternalRequest({
    definitionCode: MAIN_CODE,
    resourceType: MAIN_RESOURCE_TYPE,
    resourceId: APPROVE_RESOURCE_ID,
    amount: 100,
    description: 'Approve browser case'
  });
  await createInternalRequest({
    definitionCode: MAIN_CODE,
    resourceType: MAIN_RESOURCE_TYPE,
    resourceId: REJECT_RESOURCE_ID,
    amount: 200,
    description: 'Reject browser case'
  });
  await createInternalRequest({
    definitionCode: MAIN_CODE,
    resourceType: MAIN_RESOURCE_TYPE,
    resourceId: RETURN_RESOURCE_ID,
    amount: 300,
    description: 'Return browser case'
  });
  await createInternalRequest({
    definitionCode: MAIN_CODE,
    resourceType: MAIN_RESOURCE_TYPE,
    resourceId: DELEGATED_RESOURCE_ID,
    amount: 400,
    description: 'Delegated browser case'
  });
  const limitedRequest = await createInternalRequest({
    definitionCode: LIMITED_CODE,
    resourceType: LIMITED_RESOURCE_TYPE,
    resourceId: LIMITED_RESOURCE_ID,
    amount: 500,
    description: 'Permission-negative browser case'
  });

  // The assigned approver sees pending requests and can approve, reject, or return them.
  const approverContext = await browser.newContext();
  const approverPage = await approverContext.newPage();
  await signIn(approverPage, APPROVER_EMAIL);

  await actFromInbox(approverPage, {
    resourceId: APPROVE_RESOURCE_ID,
    action: 'APPROVE',
    expectedStatus: 'APPROVED',
    comment: 'Approved in Pass 79 browser test'
  });
  await actFromInbox(approverPage, {
    resourceId: REJECT_RESOURCE_ID,
    action: 'REJECT',
    expectedStatus: 'REJECTED',
    comment: 'Rejected in Pass 79 browser test'
  });
  await actFromInbox(approverPage, {
    resourceId: RETURN_RESOURCE_ID,
    action: 'RETURN',
    expectedStatus: 'RETURNED',
    comment: 'Returned in Pass 79 browser test'
  });

  // A valid delegate receives the original approver's scoped pending request and can act on it.
  const delegateContext = await browser.newContext();
  const delegatePage = await delegateContext.newPage();
  await signIn(delegatePage, DELEGATE_EMAIL);
  await actFromInbox(delegatePage, {
    resourceId: DELEGATED_RESOURCE_ID,
    action: 'APPROVE',
    expectedStatus: 'APPROVED',
    comment: 'Approved by delegate in Pass 79'
  });
  await expect(delegatePage.getByRole('heading', { name: 'Decision timeline' }).locator('..').getByText(DELEGATE_ID)).toBeVisible();

  // A user with inbox permission but without approvals.act sees the request but no action controls.
  const limitedContext = await browser.newContext();
  const limitedPage = await limitedContext.newPage();
  await signIn(limitedPage, LIMITED_EMAIL);
  const limitedRow = limitedPage.getByRole('row').filter({ hasText: LIMITED_RESOURCE_ID });
  await expect(limitedRow).toBeVisible();
  await limitedRow.getByRole('button').click();
  await expect(limitedPage.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  await expect(limitedPage.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  await expect(limitedPage.getByRole('button', { name: 'Return' })).toHaveCount(0);

  // UI hiding is not security: the API independently rejects the same unauthorized action.
  const limitedToken = await limitedPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(limitedToken).toBeTruthy();
  const forbidden = await limitedPage.request.post(`${API_BASE_URL}/approvals/requests/${limitedRequest.id}/actions`, {
    headers: {
      authorization: `Bearer ${limitedToken}`,
      'idempotency-key': 'pass79-limited-forbidden-action'
    },
    data: { action: 'APPROVE', comment: 'This must be forbidden.' }
  });
  expect(forbidden.status()).toBe(403);

  await approverContext.close();
  await delegateContext.close();
  await limitedContext.close();
});
