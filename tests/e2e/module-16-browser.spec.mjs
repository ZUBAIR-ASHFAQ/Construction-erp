import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass356-module16-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000035600';
const CLIENT_ID = '00000000-0000-4000-8000-000000035601';
const PROJECT_ID = '00000000-0000-4000-8000-000000035602';
const BOQ_ID = '00000000-0000-4000-8000-000000035603';
const BOQ_REVISION_ID = '00000000-0000-4000-8000-000000035604';
const BOQ_ITEM_ID = '00000000-0000-4000-8000-000000035605';
const MANAGER_ID = '00000000-0000-4000-8000-000000035610';
const READER_ID = '00000000-0000-4000-8000-000000035611';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000035620';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000035621';

const MANAGER_EMAIL = 'pass356-module16-manager@example.test';
const READER_EMAIL = 'pass356-module16-reader@example.test';
const MODULE_16_PERMISSIONS = [
  'client_billing.read',
  'client_contracts.manage',
  'client_claims.create',
  'client_claims.certify',
  'client_invoices.issue',
  'client_retention.release'
];
const SUPPORT_PERMISSIONS = ['projects.read', 'clients.read'];
const REVIEWED_OPERATIONS = new Set([
  'GET /api/v1/client-billing/contracts',
  'POST /api/v1/client-billing/contracts',
  'POST /api/v1/client-billing/contracts/:id/claims',
  'PUT /api/v1/client-billing/claims/:id/lines',
  'POST /api/v1/client-billing/claims/:id/certify',
  'POST /api/v1/client-billing/claims/:id/invoice',
  'POST /api/v1/client-billing/retention/:id/release'
]);

let database;

/** Seed the smallest Client, Project, BOQ, numbering and RBAC graph needed for the Stage-23 browser workflow. */
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
      legalName: 'Pass 356 Module 16 Company Limited',
      displayName: 'Pass 356 Module 16 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of [...MODULE_16_PERMISSIONS, ...SUPPORT_PERMISSIONS]) {
    permissions.push(await database.permission.upsert({
      where: { code },
      update: { name: code, domain: code.split('.')[0] },
      create: { code, name: code, domain: code.split('.')[0] }
    }));
  }
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission.id]));

  await database.role.createMany({
    data: [
      {
        id: MANAGER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module16-browser-manager',
        name: 'Module 16 Browser Manager',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module16-browser-reader',
        name: 'Module 16 Browser Reader',
        isSystem: false,
        status: 'ACTIVE'
      }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...[...MODULE_16_PERMISSIONS, ...SUPPORT_PERMISSIONS].map((code) => ({
        roleId: MANAGER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      })),
      ...['client_billing.read', 'projects.read'].map((code) => ({
        roleId: READER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 356 Billing Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 356 Billing Reader', status: 'ACTIVE' }
    ]
  });
  await database.authCredential.createMany({
    data: [MANAGER_ID, READER_ID].map((userId) => ({ userId, passwordHash }))
  });
  await database.userRoleAssignment.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        userId: MANAGER_ID,
        roleId: MANAGER_ROLE_ID,
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_ID,
        userId: READER_ID,
        roleId: READER_ROLE_ID,
        scopeType: 'PROJECT',
        scopeId: PROJECT_ID,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS356-CLIENT',
      legalName: 'Pass 356 Client Limited',
      displayName: 'Pass 356 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS356-PROJECT',
      name: 'Module 16 Browser Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });
  await database.projectMember.create({
    data: {
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      userId: READER_ID,
      projectRole: 'PROJECT_VIEWER',
      status: 'ACTIVE',
      fromDate
    }
  });

  await database.boq.create({
    data: {
      id: BOQ_ID,
      companyId: COMPANY_ID,
      tenderId: null,
      projectId: PROJECT_ID,
      code: 'PASS356-BOQ',
      title: 'Pass 356 Client Billing BOQ',
      currency: 'USD',
      status: 'ACTIVE'
    }
  });
  await database.boqRevision.create({
    data: {
      id: BOQ_REVISION_ID,
      boqId: BOQ_ID,
      revisionNo: 1,
      status: 'FROZEN',
      effectiveDate: new Date('2026-01-01T00:00:00.000Z'),
      notes: 'Pass 356 browser billing source'
    }
  });
  await database.boqItem.create({
    data: {
      id: BOQ_ITEM_ID,
      boqRevisionId: BOQ_REVISION_ID,
      itemCode: 'PASS356-001',
      description: 'Measured concrete work',
      unit: 'm3',
      quantity: '10.0000',
      rate: '100.0000',
      amount: '1000.00'
    }
  });

  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'client-contract', prefix: 'CC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'progress-claim', prefix: 'PC-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'client-invoice', prefix: 'INV-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
    ]
  });
}

/** Sign in through the real Module-24A browser form. */
async function signIn(page, email) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.topbar')).toContainText(email);
}

/** Open the Client Billing workspace through the existing permission-aware admin navigation. */
async function openClientBilling(page) {
  await page.getByRole('button', { name: 'Client Billing' }).click();
  await expect(page.getByRole('heading', { name: 'Client Billing', level: 1 })).toBeVisible();
}

/** Create one reviewed Client Contract through the browser while numbering and revised value stay server-owned. */
async function createContractInUi(page) {
  const section = page.getByRole('heading', { name: 'Create Client Contract' }).locator('..');
  await section.getByLabel('Project').selectOption(PROJECT_ID);
  await section.getByLabel('Client').selectOption(CLIENT_ID);
  await section.getByLabel('Contract value').fill('1000.00');
  await section.getByLabel('Billing method').fill('PROGRESS');
  await section.getByLabel('Retention %').fill('10.0000');
  await section.getByLabel('Currency').fill('USD');
  await section.getByRole('button', { name: 'Create Client Contract' }).click();
  await expect(page.getByRole('heading', { name: 'Contract CC-0001' })).toBeVisible();
}

/** Create one DRAFT Progress Claim from the selected Contract through the reviewed browser command. */
async function createClaimInUi(page) {
  const section = page.getByRole('heading', { name: 'Progress Claims' }).locator('..');
  await section.getByLabel('Billing period end').fill('2026-08-31');
  await section.getByRole('button', { name: 'Create Progress Claim' }).click();
  await expect(page.getByRole('heading', { name: 'Claim PC-0001 valuation' })).toBeVisible();
}

/** Save one BOQ-backed exact-decimal Claim line through the complete reviewed PUT replacement. */
async function saveClaimWorksheetInUi(page) {
  const section = page.getByRole('heading', { name: 'Progress Claim worksheet' }).locator('..');
  await section.getByRole('button', { name: 'Add line' }).click();
  const line = section.getByRole('group', { name: 'Line 1' });
  await line.getByLabel('Description').fill('Measured concrete work');
  await line.getByLabel('BOQ Item UUID (optional)').fill(BOQ_ITEM_ID);
  await line.getByLabel('Contract qty').fill('10.0000');
  await line.getByLabel('Cumulative qty').fill('2.5000');
  await line.getByLabel('Current qty').fill('2.5000');
  await line.getByLabel('Rate').fill('100.0000');
  await line.getByLabel('Current value').fill('250.00');
  await section.getByRole('button', { name: 'Save complete worksheet' }).click();
  const claim = await database.progressClaim.findFirstOrThrow({ where: { claimNo: 'PC-0001' } });
  await expect.poll(async () => database.progressClaimLine.count({ where: { claimId: claim.id } })).toBe(1);
}

/** Certify the selected Claim while cumulative totals, retention and deductions remain server-calculated. */
async function certifyClaimInUi(page) {
  const section = page.getByRole('heading', { name: 'Certification' }).locator('..');
  await section.getByLabel('Certified value').fill('250.00');
  await section.getByRole('button', { name: 'Certify Progress Claim' }).click();
  await expect(page.getByText('CERTIFIED', { exact: true }).first()).toBeVisible();
}

/** Issue one Client Invoice from the certified Claim using only the reviewed invoice and due dates. */
async function issueInvoiceInUi(page) {
  const section = page.getByRole('heading', { name: 'Client Invoice' }).locator('..');
  await section.getByLabel('Invoice date').fill('2026-09-01');
  await section.getByLabel('Due date').fill('2026-09-30');
  await section.getByRole('button', { name: 'Issue Client Invoice' }).click();
  await expect(section).toContainText('INV-0001');
  await expect(section).toContainText('USD 225.00');
}

/** Return true only when one browser request belongs to the reviewed Stage-23 Client Billing route family. */
function isStage23Request(method, pathname) {
  if (pathname === '/api/v1/client-billing/contracts') return ['GET', 'POST'].includes(method);
  if (/^\/api\/v1\/client-billing\/contracts\/[^/]+\/claims$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/client-billing\/claims\/[^/]+\/lines$/.test(pathname)) return method === 'PUT';
  if (/^\/api\/v1\/client-billing\/claims\/[^/]+\/(certify|invoice)$/.test(pathname)) return method === 'POST';
  if (/^\/api\/v1\/client-billing\/retention\/[^/]+\/release$/.test(pathname)) return method === 'POST';
  return false;
}

/** Parse one captured request body while keeping the bodyless Retention release command as null. */
function requestBody(request) {
  const raw = request.postData();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Capture only Module-16 requests so route and browser-authority assertions stay focused. */
function trackStage23Requests(page) {
  const requests = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (!isStage23Request(request.method(), url.pathname)) return;
    requests.push({
      method: request.method(),
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams.entries()),
      body: requestBody(request),
      idempotencyKey: request.headers()['idempotency-key'] ?? null
    });
  });
  return requests;
}

/** Normalize concrete Contract, Claim and Retention UUIDs into the seven reviewed Stage-23 operations. */
function normalizeStage23Operation(request) {
  const path = request.pathname
    .replace(/^\/api\/v1\/client-billing\/contracts\/[^/]+\/claims$/, '/api/v1/client-billing/contracts/:id/claims')
    .replace(/^\/api\/v1\/client-billing\/claims\/[^/]+\/lines$/, '/api/v1/client-billing/claims/:id/lines')
    .replace(/^\/api\/v1\/client-billing\/claims\/[^/]+\/certify$/, '/api/v1/client-billing/claims/:id/certify')
    .replace(/^\/api\/v1\/client-billing\/claims\/[^/]+\/invoice$/, '/api/v1/client-billing/claims/:id/invoice')
    .replace(/^\/api\/v1\/client-billing\/retention\/[^/]+\/release$/, '/api/v1/client-billing/retention/:id/release');
  return `${request.method} ${path}`;
}

/** Prove the browser uses all seven reviewed operations, six retry keys and no server-owned billing authority fields. */
function assertStage23AuthorityBoundary(requests) {
  expect(requests.length).toBeGreaterThan(0);
  const seen = new Set(requests.map(normalizeStage23Operation));
  for (const operation of REVIEWED_OPERATIONS) expect(seen.has(operation)).toBe(true);
  for (const operation of seen) expect(REVIEWED_OPERATIONS.has(operation)).toBe(true);

  const writes = requests.filter((request) => ['POST', 'PUT'].includes(request.method));
  for (const request of writes) expect(request.idempotencyKey).toBeTruthy();

  const forbiddenFields = [
    'companyId',
    'actorUserId',
    'permissions',
    'allowedProjectIds',
    'contractNo',
    'revisedValue',
    'status',
    'claimNo',
    'grossValue',
    'previousValue',
    'retentionAmount',
    'deductionAmount',
    'invoiceNo',
    'grossAmount',
    'taxAmount',
    'totalReceivable',
    'releasedAmount',
    'financeArPosted'
  ];
  for (const request of requests.filter((item) => item.body !== null)) {
    const serialized = JSON.stringify(request.body);
    for (const field of forbiddenFields) expect(serialized).not.toContain(`\"${field}\"`);
  }

  const createContract = requests.find((request) => request.method === 'POST' && request.pathname === '/api/v1/client-billing/contracts');
  expect(Object.keys(createContract?.body ?? {}).sort()).toEqual(['billingMethod', 'clientId', 'contractValue', 'currency', 'projectId', 'retentionPercent']);

  const createClaim = requests.find((request) => /\/contracts\/[^/]+\/claims$/.test(request.pathname));
  expect(Object.keys(createClaim?.body ?? {})).toEqual(['periodEnd']);

  const lineWrite = requests.find((request) => request.pathname.endsWith('/lines'));
  expect(lineWrite?.body?.lines).toHaveLength(1);
  expect(Object.keys(lineWrite?.body?.lines?.[0] ?? {}).sort()).toEqual([
    'boqItemId', 'contractQty', 'cumulativeQty', 'currentQty', 'currentValue', 'description', 'rate'
  ]);

  const certifyWrite = requests.find((request) => request.pathname.endsWith('/certify'));
  expect(Object.keys(certifyWrite?.body ?? {})).toEqual(['certifiedValue']);
  expect(certifyWrite?.body?.certifiedValue).toBe('250.00');

  const invoiceWrite = requests.find((request) => request.pathname.endsWith('/invoice'));
  expect(Object.keys(invoiceWrite?.body ?? {}).sort()).toEqual(['dueDate', 'invoiceDate']);
  expect(invoiceWrite?.body).toEqual({ invoiceDate: '2026-09-01', dueDate: '2026-09-30' });

  const releaseWrite = requests.find((request) => request.pathname.endsWith('/release'));
  expect(releaseWrite?.body).toBeNull();

  const listReads = requests.filter((request) => request.method === 'GET' && request.pathname === '/api/v1/client-billing/contracts');
  expect(listReads.length).toBeGreaterThan(0);
  for (const request of listReads) expect(request.query).toEqual({ page: '1', pageSize: '25' });
}

test.beforeAll(async () => {
  await seedScenario();
});

/** Close the disposable database connection after all Stage-23 browser assertions finish. */
test.afterAll(async () => {
  if (database) await database.$disconnect();
});

test('Module 16 browser workflow covers Contract, Claim, certification, Invoice, Retention and permission denial', async ({ page, browser }) => {
  const managerRequests = trackStage23Requests(page);
  await signIn(page, MANAGER_EMAIL);
  await openClientBilling(page);

  await createContractInUi(page);
  const contract = await database.clientContract.findFirstOrThrow({ where: { contractNo: 'CC-0001' } });
  expect(contract.projectId).toBe(PROJECT_ID);
  expect(contract.clientId).toBe(CLIENT_ID);
  expect(contract.contractValue.toString()).toBe('1000');
  expect(contract.revisedValue.toString()).toBe('1000');

  await createClaimInUi(page);
  const claim = await database.progressClaim.findFirstOrThrow({ where: { claimNo: 'PC-0001' } });
  expect(claim.status).toBe('DRAFT');

  await saveClaimWorksheetInUi(page);
  await certifyClaimInUi(page);
  const certified = await database.progressClaim.findUniqueOrThrow({ where: { id: claim.id } });
  expect(certified.status).toBe('CERTIFIED');
  expect(certified.previousValue.toString()).toBe('0');
  expect(certified.currentValue.toString()).toBe('250');
  expect(certified.grossValue.toString()).toBe('250');
  expect(certified.retentionAmount.toString()).toBe('25');
  expect(certified.deductionAmount.toString()).toBe('0');
  expect(certified.certifiedValue.toString()).toBe('250');

  const valuationSection = page.getByRole('heading', { name: 'Claim PC-0001 valuation' }).locator('..');
  await expect(valuationSection).toContainText('USD 250.00');
  await expect(valuationSection).toContainText('USD 25.00');

  await issueInvoiceInUi(page);
  const invoice = await database.clientInvoice.findFirstOrThrow({ where: { invoiceNo: 'INV-0001' } });
  expect(invoice.claimId).toBe(claim.id);
  expect(invoice.grossAmount.toString()).toBe('250');
  expect(invoice.retentionAmount.toString()).toBe('25');
  expect(invoice.taxAmount.toString()).toBe('0');
  expect(invoice.totalReceivable.toString()).toBe('225');
  expect(invoice.status).toBe('ISSUED');

  const retention = await database.retentionLedger.findFirstOrThrow({
    where: { companyId: COMPANY_ID, projectId: PROJECT_ID, sourceType: 'CLIENT_INVOICE', sourceId: invoice.id }
  });
  expect(retention.amount.toString()).toBe('25');
  expect(retention.releasedAmount.toString()).toBe('0');
  expect(retention.status).toBe('HELD');

  const readerContext = await browser.newContext({ baseURL: WEB_URL });
  const readerPage = await readerContext.newPage();
  try {
    await signIn(readerPage, READER_EMAIL);
    await openClientBilling(readerPage);

    const contractRow = readerPage.getByRole('row').filter({ hasText: 'CC-0001' });
    await expect(contractRow).toBeVisible();
    await expect(readerPage.getByText('client_contracts.manage is required for this command.')).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create Client Contract' })).toHaveCount(0);
    await contractRow.getByRole('button', { name: 'Open' }).click();

    await expect(readerPage.getByText('client_claims.create is required to create a Claim.')).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Create Progress Claim' })).toHaveCount(0);
    await readerPage.getByRole('row').filter({ hasText: 'PC-0001' }).getByRole('button', { name: 'Open' }).click();
    await expect(readerPage.getByText('client_claims.certify is required for certification.')).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Certify Progress Claim' })).toHaveCount(0);
    await expect(readerPage.getByRole('button', { name: 'Issue Client Invoice' })).toHaveCount(0);
    await expect(readerPage.getByText('client_retention.release is required for retention release.')).toBeVisible();
    await expect(readerPage.getByRole('button', { name: 'Release full balance' })).toHaveCount(0);

    const readerToken = await readerPage.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const authHeaders = { authorization: `Bearer ${readerToken}` };

    const allowedRead = await readerPage.request.get(`${API_BASE_URL}/client-billing/contracts?page=1&pageSize=25`, { headers: authHeaders });
    expect(allowedRead.status()).toBe(200);

    const deniedContract = await readerPage.request.post(`${API_BASE_URL}/client-billing/contracts`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-contract' },
      data: { projectId: PROJECT_ID, clientId: CLIENT_ID, contractValue: '100.00', billingMethod: 'PROGRESS', retentionPercent: '10.0000', currency: 'USD' }
    });
    expect(deniedContract.status()).toBe(403);

    const deniedClaim = await readerPage.request.post(`${API_BASE_URL}/client-billing/contracts/${contract.id}/claims`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-claim' },
      data: { periodEnd: '2026-09-30' }
    });
    expect(deniedClaim.status()).toBe(403);

    const deniedLines = await readerPage.request.put(`${API_BASE_URL}/client-billing/claims/${claim.id}/lines`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-lines' },
      data: { lines: [] }
    });
    expect(deniedLines.status()).toBe(403);

    const deniedCertify = await readerPage.request.post(`${API_BASE_URL}/client-billing/claims/${claim.id}/certify`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-certify' },
      data: { certifiedValue: '250.00' }
    });
    expect(deniedCertify.status()).toBe(403);

    const deniedInvoice = await readerPage.request.post(`${API_BASE_URL}/client-billing/claims/${claim.id}/invoice`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-invoice' },
      data: { invoiceDate: '2026-09-01', dueDate: '2026-09-30' }
    });
    expect(deniedInvoice.status()).toBe(403);

    const deniedRelease = await readerPage.request.post(`${API_BASE_URL}/client-billing/retention/${retention.id}/release`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass356-reader-denied-release' }
    });
    expect(deniedRelease.status()).toBe(403);
  } finally {
    await readerContext.close();
  }

  const retentionSection = page.getByRole('heading', { name: 'Retention status' }).locator('..');
  await retentionSection.getByRole('button', { name: 'Release full balance' }).click();
  await expect(retentionSection).toContainText('RELEASED');
  await expect.poll(async () => (await database.retentionLedger.findUniqueOrThrow({ where: { id: retention.id } })).releasedAmount.toString()).toBe('25');

  for (const eventType of [
    'client_contract.created',
    'progress_claim.submitted',
    'progress_claim.certified',
    'client_invoice.issued',
    'client_retention.released'
  ]) {
    expect(await database.outboxEvent.count({ where: { companyId: COMPANY_ID, eventType } })).toBe(1);
  }
  const issuedEvent = await database.outboxEvent.findFirstOrThrow({
    where: { companyId: COMPANY_ID, eventType: 'client_invoice.issued', resourceId: invoice.id }
  });
  expect(issuedEvent.payload?.sourceKey).toBe(`client-invoice:${invoice.id}`);
  expect(issuedEvent.payload?.financeArAdapterDeferredToStage26).toBe(true);

  assertStage23AuthorityBoundary(managerRequests);
});
