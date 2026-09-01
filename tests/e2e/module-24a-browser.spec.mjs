import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { expect, test } from '@playwright/test';

let companyId;
const ADMIN_EMAIL = 'browser-admin@example.test';
const ADMIN_PASSWORD = 'Pass36-admin-password!';
const USER_EMAIL = 'browser-reader@example.test';
const USER_PASSWORD = 'Pass40-reader-password!';
const RESET_PASSWORD = 'Pass40-reader-reset!';
const READER_ROLE_CODE = 'browser-reader';
const READER_ROLE_NAME = 'Browser Reader';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const WEB_BASE_URL = 'http://127.0.0.1:5173/';
const AUTH_ACTION_TOKEN_SECRET = process.env.AUTH_ACTION_TOKEN_SECRET ?? 'test-only-auth-action-secret-0123456789abcdef';

let client;
let notificationServer;
let notificationWorker;
const notifications = [];

/** Load the built helpers used only by this live browser test. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { createAdministrationBootstrapIdentityProvisioner } = await import(
    '../../apps/api/dist/modules/administration/administration.service.js'
  );
  const { bootstrapInitialInstallation } = await import('@construction-erp/bootstrap');

  return {
    testing,
    createAdministrationBootstrapIdentityProvisioner,
    bootstrapInitialInstallation
  };
}

/** Provision the browser administrator through the real Foundation + Module 24A bootstrap path. */
async function seedAdministrator(runtime) {
  client = runtime.testing.createFoundationTestDatabaseClient(
    runtime.testing.loadFoundationTestEnvironment()
  );
  await client.$connect();

  const result = await runtime.bootstrapInitialInstallation(
    client,
    {
      bootstrapKey: 'module-24a-browser',
      company: {
        legalName: 'Pass 85 Browser Company Ltd',
        displayName: 'Pass 85 Browser Company',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      configuration: { environmentLabel: 'test' },
      numberSequences: [
        { sequenceKey: 'project' },
        { sequenceKey: 'purchase-order' },
        { sequenceKey: 'client-invoice' },
        { sequenceKey: 'client-receipt' },
        { sequenceKey: 'supplier-payment' }
      ],
      identity: {
        administrator: {
          email: ADMIN_EMAIL,
          name: 'Browser Administrator',
          roleCodes: ['system-admin']
        },
        systemRoles: [
          {
            code: 'system-admin',
            name: 'System Administrator'
          }
        ]
      }
    },
    runtime.createAdministrationBootstrapIdentityProvisioner(ADMIN_PASSWORD)
  );

  companyId = result.companyId;
  expect(result.status).toBe('COMPLETED');
}

/** Read the small JSON webhook body sent by the authentication notification worker. */
async function readRequestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Capture one worker notification and return a simple success response. */
async function handleNotificationWebhook(request, response) {
  try {
    const payload = await readRequestBody(request);
    notifications.push({
      ...payload,
      idempotencyKey: request.headers['idempotency-key'] ?? null
    });
    response.writeHead(204);
    response.end();
  } catch {
    response.writeHead(400);
    response.end();
  }
}

/** Start a local webhook so the browser test can observe real asynchronous delivery. */
async function startNotificationWebhook() {
  notificationServer = createServer((request, response) => {
    void handleNotificationWebhook(request, response);
  });

  await new Promise((resolve, reject) => {
    notificationServer.once('error', reject);
    notificationServer.listen(0, '127.0.0.1', resolve);
  });

  const address = notificationServer.address();
  if (!address || typeof address === 'string') throw new Error('Notification webhook did not expose a TCP port.');
  return `http://127.0.0.1:${address.port}/auth-notifications`;
}

/** Start the real authentication notification worker against the disposable test database. */
function startNotificationWorker(webhookUrl) {
  notificationWorker = spawn(
    process.execPath,
    ['apps/api/dist/workers/auth-notification.worker.js'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        NODE_ENV: 'test',
        LOG_LEVEL: 'silent',
        AUTH_ACTION_TOKEN_SECRET,
        AUTH_ACTION_PUBLIC_URL: WEB_BASE_URL,
        AUTH_NOTIFICATION_WEBHOOK_URL: webhookUrl
      }
    }
  );
}

/** Wait briefly without adding another timing dependency to the test. */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Wait for the worker to deliver the requested notification to the expected user. */
async function waitForNotification(type, email, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const notification = notifications.find((item) => item.type === type && item.recipient?.email === email);
    if (notification) return notification;
    await wait(100);
  }
  throw new Error(`Timed out waiting for ${type} delivery to ${email}.`);
}

/** Stop the notification worker after its current queue operation finishes. */
async function stopNotificationWorker() {
  if (!notificationWorker || notificationWorker.exitCode !== null) return;
  notificationWorker.kill('SIGTERM');
  await new Promise((resolve) => notificationWorker.once('exit', resolve));
}

/** Close the local notification webhook after all delivery assertions finish. */
async function stopNotificationWebhook() {
  if (!notificationServer) return;
  await new Promise((resolve, reject) => {
    notificationServer.close((error) => error ? reject(error) : resolve());
  });
}

/** Verify a delivered action URL contains only the expected short-lived action parameter. */
function expectActionUrl(notification, parameter) {
  expect(notification.idempotencyKey).toBeTruthy();
  expect(notification.actionUrl).toBeTruthy();
  const url = new URL(notification.actionUrl);
  expect(`${url.origin}/`).toBe(WEB_BASE_URL);
  expect(url.searchParams.get(parameter)).toBeTruthy();
  return notification.actionUrl;
}

// Reset/migrate is performed by the root test command before Playwright starts.
test.beforeAll(async () => {
  const runtime = await loadRuntime();
  await seedAdministrator(runtime);
  const webhookUrl = await startNotificationWebhook();
  startNotificationWorker(webhookUrl);
});

/** Close live test resources after the browser workflow has finished. */
test.afterAll(async () => {
  await stopNotificationWorker();
  await stopNotificationWebhook();
  if (client) await client.$disconnect();
});

/** Exercise real onboarding, delivery, recovery, authorization, and revocation through the browser and HTTP API. */
test('Module 24A browser administration workflow works end to end', async ({ page, browser }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

  await page.getByRole('button', { name: 'Roles & permissions' }).click();
  const createRoleCard = page.getByRole('heading', { name: 'Create role' }).locator('..');
  await createRoleCard.getByLabel('Code').fill(READER_ROLE_CODE);
  await createRoleCard.getByLabel('Name').fill(READER_ROLE_NAME);
  await createRoleCard.getByLabel('Description').fill('Can only read company users.');
  await createRoleCard.getByRole('button', { name: 'Create role' }).click();

  const permissionCard = page.getByRole('heading', { name: `Permissions for ${READER_ROLE_NAME}` }).locator('..');
  await permissionCard.getByRole('checkbox', { name: 'users.read' }).check();
  await permissionCard.getByRole('button', { name: 'Replace permission set' }).click();

  await page.getByRole('button', { name: 'Users' }).click();
  const createUserCard = page.getByRole('heading', { name: 'Create user' }).locator('..');
  await createUserCard.getByLabel('Name').fill('Browser Reader');
  await createUserCard.getByLabel('Email').fill(USER_EMAIL);
  await createUserCard.getByRole('button', { name: 'Create user' }).click();

  let readerUserRow = page.getByRole('row').filter({ hasText: USER_EMAIL });
  await expect(readerUserRow.locator('td').nth(1)).toHaveText('INACTIVE');
  await readerUserRow.getByRole('button', { name: 'Roles' }).click();
  const userRolesCard = page.getByRole('heading', { name: 'Company roles for Browser Reader' }).locator('..');
  await userRolesCard.getByRole('checkbox', { name: /Browser Reader/ }).check();
  await userRolesCard.getByRole('button', { name: 'Replace company roles' }).click();

  const invitation = await waitForNotification('AUTH_INVITATION', USER_EMAIL);
  const invitationUrl = expectActionUrl(invitation, 'invite');
  const invitedUser = await client.user.findUnique({
    where: { companyId_email: { companyId, email: USER_EMAIL } }
  });
  const invitationJob = await client.queueJob.findFirst({
    where: { queueName: 'auth-notifications', jobType: 'auth.invitation' },
    orderBy: { createdAt: 'desc' }
  });
  expect(invitationJob?.payload.userId).toBe(invitedUser?.id);
  expect(invitationJob?.status).toBe('COMPLETED');

  const readerContext = await browser.newContext();
  const readerPage = await readerContext.newPage();
  await readerPage.goto(invitationUrl);
  await expect(readerPage.getByRole('heading', { name: 'Accept invitation' })).toBeVisible();
  await readerPage.getByLabel('New password').fill(USER_PASSWORD);
  await readerPage.getByLabel('Confirm password').fill(USER_PASSWORD);
  await readerPage.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(readerPage.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await readerPage.getByLabel('Email').fill(USER_EMAIL);
  await readerPage.getByLabel('Password').fill(USER_PASSWORD);
  await readerPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(readerPage.getByRole('heading', { name: 'Users' })).toBeVisible();
  await expect(readerPage.getByRole('button', { name: 'Roles & permissions' })).toHaveCount(0);
  await expect(readerPage.getByRole('heading', { name: 'Create user' })).toHaveCount(0);

  const firstReaderToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(firstReaderToken).toBeTruthy();
  const meResponse = await readerPage.request.get(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${firstReaderToken}` }
  });
  expect(meResponse.status()).toBe(200);
  const identity = (await meResponse.json()).data;
  expect(identity.permissions).toEqual(['users.read']);
  expect(identity.projectScope.kind).toBe('not-resolved');

  const forbiddenResponse = await readerPage.request.post(`${API_BASE_URL}/users`, {
    headers: { Authorization: `Bearer ${firstReaderToken}` },
    data: { email: 'must-fail@example.test', name: 'Must Fail' }
  });
  expect(forbiddenResponse.status()).toBe(403);
  expect((await forbiddenResponse.json()).error.code).toBe('FORBIDDEN');

  await readerPage.getByRole('button', { name: 'Sign out' }).click();
  await readerPage.getByRole('button', { name: 'Forgot password?' }).click();
  await readerPage.getByLabel('Email').fill(USER_EMAIL);
  await readerPage.getByRole('button', { name: 'Send reset instructions' }).click();
  await expect(readerPage.getByText(/If that account is eligible/)).toBeVisible();

  const reset = await waitForNotification('AUTH_PASSWORD_RESET', USER_EMAIL);
  const resetUrl = expectActionUrl(reset, 'reset');
  const resetJob = await client.queueJob.findFirst({
    where: { queueName: 'auth-notifications', jobType: 'auth.password-reset' },
    orderBy: { createdAt: 'desc' }
  });
  expect(resetJob?.payload.userId).toBe(invitedUser?.id);
  expect(resetJob?.status).toBe('COMPLETED');

  await readerPage.goto(resetUrl);
  await readerPage.getByLabel('New password').fill(RESET_PASSWORD);
  await readerPage.getByLabel('Confirm password').fill(RESET_PASSWORD);
  await readerPage.getByRole('button', { name: 'Reset password' }).click();
  await expect(readerPage.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  const oldSessionResponse = await readerPage.request.get(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${firstReaderToken}` }
  });
  expect(oldSessionResponse.status()).toBe(401);

  await readerPage.getByLabel('Email').fill(USER_EMAIL);
  await readerPage.getByLabel('Password').fill(RESET_PASSWORD);
  await readerPage.getByRole('button', { name: 'Sign in' }).click();
  await expect(readerPage.getByRole('heading', { name: 'Users' })).toBeVisible();
  const secondReaderToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
  expect(secondReaderToken).toBeTruthy();

  await page.getByRole('button', { name: 'Users' }).click();
  readerUserRow = page.getByRole('row').filter({ hasText: USER_EMAIL });
  await page.reload();
  readerUserRow = page.getByRole('row').filter({ hasText: USER_EMAIL });
  await expect(readerUserRow.locator('td').nth(1)).toHaveText('ACTIVE');
  await readerUserRow.getByRole('button', { name: 'Deactivate' }).click();
  await expect(readerUserRow.locator('td').nth(1)).toHaveText('INACTIVE');

  const revokedResponse = await readerPage.request.get(`${API_BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${secondReaderToken}` }
  });
  expect(revokedResponse.status()).toBe(401);

  await readerContext.close();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});
