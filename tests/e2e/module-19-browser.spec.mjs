import { expect, test } from '@playwright/test';

const WEB_URL = 'http://127.0.0.1:5173';
const API_BASE_URL = 'http://127.0.0.1:3000/api/v1';
const PASSWORD = 'Pass406-module19-browser-password!';

const COMPANY_ID = '00000000-0000-4000-8000-000000040600';
const PROJECT_ID = '00000000-0000-4000-8000-000000040601';
const CLIENT_ID = '00000000-0000-4000-8000-000000040602';
const MANAGER_ID = '00000000-0000-4000-8000-000000040610';
const READER_ID = '00000000-0000-4000-8000-000000040611';
const MANAGER_ROLE_ID = '00000000-0000-4000-8000-000000040620';
const READER_ROLE_ID = '00000000-0000-4000-8000-000000040621';
const DOCUMENT_ID = '00000000-0000-4000-8000-000000040630';
const DOCUMENT_VERSION_ID = '00000000-0000-4000-8000-000000040631';

const MANAGER_EMAIL = 'pass406-module19-manager@example.test';
const READER_EMAIL = 'pass406-module19-reader@example.test';
const MODULE_19_PERMISSIONS = [
  'rfi.read',
  'rfi.create',
  'rfi.respond',
  'rfi.close',
  'submittals.read',
  'submittals.create',
  'submittals.submit',
  'submittals.review'
];
const SUPPORT_PERMISSIONS = ['projects.read'];

let database;

/** Seed the smallest Company, Project, RBAC, numbering and versioned Document graph needed for the Module-19 browser workflow. */
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
      legalName: 'Pass 406 Module 19 Company Limited',
      displayName: 'Pass 406 Module 19 Company',
      status: 'ACTIVE',
      baseCurrency: 'USD',
      timeZone: 'UTC',
      locale: 'en-US',
      fiscalSettings: { fiscalYearStartMonth: 1 }
    }
  });

  const permissions = [];
  for (const code of [...MODULE_19_PERMISSIONS, ...SUPPORT_PERMISSIONS]) {
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
        code: 'module19-browser-manager',
        name: 'Module 19 Browser Manager',
        isSystem: false,
        status: 'ACTIVE'
      },
      {
        id: READER_ROLE_ID,
        companyId: COMPANY_ID,
        code: 'module19-browser-reader',
        name: 'Module 19 Browser Reader',
        isSystem: false,
        status: 'ACTIVE'
      }
    ]
  });
  await database.rolePermission.createMany({
    data: [
      ...[...MODULE_19_PERMISSIONS, ...SUPPORT_PERMISSIONS].map((code) => ({
        roleId: MANAGER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      })),
      ...['rfi.read', 'submittals.read', 'projects.read'].map((code) => ({
        roleId: READER_ROLE_ID,
        permissionId: permissionByCode.get(code)
      }))
    ]
  });

  await database.user.createMany({
    data: [
      { id: MANAGER_ID, companyId: COMPANY_ID, email: MANAGER_EMAIL, name: 'Pass 406 Module 19 Manager', status: 'ACTIVE' },
      { id: READER_ID, companyId: COMPANY_ID, email: READER_EMAIL, name: 'Pass 406 Module 19 Reader', status: 'ACTIVE' }
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
        scopeType: 'COMPANY',
        scopeId: null,
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await database.client.create({
    data: {
      id: CLIENT_ID,
      companyId: COMPANY_ID,
      code: 'PASS406-CLIENT',
      legalName: 'Pass 406 Client Limited',
      displayName: 'Pass 406 Client',
      billingAddress: 'Lahore, Pakistan',
      status: 'ACTIVE',
      creditTermsDays: 30
    }
  });
  await database.project.create({
    data: {
      id: PROJECT_ID,
      companyId: COMPANY_ID,
      projectCode: 'PASS406-PROJECT',
      name: 'Module 19 Browser Project',
      clientId: CLIENT_ID,
      status: 'ACTIVE',
      currency: 'USD',
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      plannedEndDate: new Date('2027-12-31T00:00:00.000Z'),
      projectManagerUserId: MANAGER_ID,
      location: 'Lahore, Pakistan'
    }
  });
  await database.projectMember.createMany({
    data: [
      {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        userId: MANAGER_ID,
        projectRole: 'PROJECT_MANAGER',
        status: 'ACTIVE',
        fromDate
      },
      {
        companyId: COMPANY_ID,
        projectId: PROJECT_ID,
        userId: READER_ID,
        projectRole: 'PROJECT_VIEWER',
        status: 'ACTIVE',
        fromDate
      }
    ]
  });

  await database.document.create({
    data: {
      id: DOCUMENT_ID,
      companyId: COMPANY_ID,
      projectId: PROJECT_ID,
      title: 'Pass 406 Module 19 reviewed evidence',
      documentNo: 'PASS406-DOC-001',
      category: 'PROJECT_CORRESPONDENCE',
      currentVersionId: null,
      status: 'ACTIVE',
      ownerUserId: MANAGER_ID
    }
  });
  await database.documentVersion.create({
    data: {
      id: DOCUMENT_VERSION_ID,
      documentId: DOCUMENT_ID,
      versionNo: 1,
      storageKey: 'pass406/module19/pass406-doc-001-v1.pdf',
      originalName: 'pass406-module19-evidence.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 128n,
      checksum: 'pass406-module19-evidence-checksum',
      revisionCode: 'A',
      uploadedBy: MANAGER_ID
    }
  });
  await database.document.update({
    where: { id: DOCUMENT_ID },
    data: { currentVersionId: DOCUMENT_VERSION_ID }
  });

  await database.numberSequence.createMany({
    data: [
      { companyId: COMPANY_ID, sequenceKey: 'rfi', prefix: 'RFI-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      { companyId: COMPANY_ID, sequenceKey: 'submittal', prefix: 'SUB-', suffix: '', padWidth: 4, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' }
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

/** Open Module 19 through the shared permission-aware AdminShell. */
async function openModule19(page) {
  await page.getByRole('button', { name: 'RFI & Submittals' }).click();
  await expect(page.getByRole('heading', { name: 'RFI & Submittals', level: 1 })).toBeVisible();
}

/** Select the seeded Project and wait until the server-backed registers are available. */
async function selectProject(page) {
  await page.getByLabel('Project', { exact: true }).selectOption(PROJECT_ID);
  await expect(page.getByText('Project selected')).toBeVisible();
  await expect(page.getByText('RFI page 1 of 1')).toBeVisible();
  await expect(page.getByText('Submittal page 1 of 1')).toBeVisible();
}

/** Create the reviewed RFI through browser-owned business inputs only. */
async function createRfiInUi(page) {
  const section = page.getByRole('heading', { name: 'Create RFI', level: 2 }).locator('..');
  await section.getByLabel('Subject').fill('Pass 406 browser RFI');
  await section.getByLabel('Discipline').fill('Structural');
  await section.getByLabel('Due date').fill('2026-09-30');
  await section.getByLabel('Question').fill('Confirm the reviewed beam connection detail for browser verification.');
  await section.getByLabel('Assign to active Project member').selectOption(MANAGER_ID);
  await section.getByRole('button', { name: 'Create RFI' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'RFI-0001' })).toBeVisible();
}

/** Append one durable RFI response with an existing same-Project versioned Document. */
async function respondToRfiInUi(page) {
  await page.getByRole('row').filter({ hasText: 'RFI-0001' }).getByRole('button', { name: 'Open thread' }).click();
  await expect(page.getByRole('heading', { name: /RFI-0001 · Pass 406 browser RFI/ })).toBeVisible();
  const section = page.getByRole('heading', { name: 'Respond to RFI', level: 3 }).locator('..');
  await section.getByLabel('Response').fill('Use the reviewed connection detail attached to this response.');
  await section.getByLabel('Optional Project Document ID').fill(DOCUMENT_ID);
  await section.getByRole('button', { name: 'Append response' }).click();
  await expect(page.getByText('Use the reviewed connection detail attached to this response.')).toBeVisible();
}

/** Exercise the reviewed OPEN -> CLOSED -> OPEN lifecycle without inventing a reopen permission. */
async function closeAndReopenRfiInUi(page) {
  await page.getByRole('button', { name: 'Close RFI' }).click();
  await expect.poll(async () => (await database.rfi.findFirstOrThrow({ where: { rfiNo: 'RFI-0001' } })).status).toBe('CLOSED');
  await expect(page.getByRole('button', { name: 'Append response' })).toHaveCount(0);
  await page.getByLabel('Reopen reason').fill('A clarification is required before final close.');
  await page.getByRole('button', { name: 'Reopen RFI' }).click();
  await expect.poll(async () => (await database.rfi.findFirstOrThrow({ where: { rfiNo: 'RFI-0001' } })).status).toBe('OPEN');
  await expect(page.getByRole('button', { name: 'Append response' })).toBeVisible();
}

/** Create one Submittal with a versioned Project Document so its first DRAFT revision can be submitted. */
async function createSubmittalInUi(page) {
  const section = page.getByRole('heading', { name: 'Create Submittal', level: 2 }).locator('..');
  await section.getByLabel('Title').fill('Pass 406 structural shop drawing');
  await section.getByLabel('Submittal type').fill('SHOP_DRAWING');
  await section.getByLabel('Specification reference').fill('03 30 00');
  await section.getByLabel('Due date').fill('2026-10-15');
  await section.getByLabel('Responsible Project member').selectOption(MANAGER_ID);
  await section.getByLabel('Optional first-revision Document ID').fill(DOCUMENT_ID);
  await section.getByRole('button', { name: 'Create Submittal' }).click();
  await expect(page.getByRole('row').filter({ hasText: 'SUB-0001' })).toBeVisible();
}

/** Submit revision 1, request revise/resubmit, and submit the generated revision 2 with reviewed Document evidence. */
async function reviseAndResubmitInUi(page) {
  await page.getByRole('row').filter({ hasText: 'SUB-0001' }).getByRole('button', { name: 'Open package' }).click();
  await expect(page.getByRole('heading', { name: /SUB-0001 · Pass 406 structural shop drawing/ })).toBeVisible();
  await expect(page.getByText('Revision 1')).toBeVisible();

  let submitPanel = page.getByRole('heading', { name: 'Submit current draft revision', level: 3 }).locator('..');
  await submitPanel.getByRole('button', { name: 'Submit revision' }).click();
  await expect.poll(async () => {
    const revision = await database.submittalRevision.findFirstOrThrow({ where: { revisionNo: 1 } });
    return revision.status;
  }).toBe('SUBMITTED');

  const reviewPanel = page.getByRole('heading', { name: 'Reviewer decision', level: 3 }).locator('..');
  await reviewPanel.getByLabel('Decision').selectOption('REVISE_RESUBMIT');
  await reviewPanel.getByLabel('Comments').fill('Revise the connection note and resubmit the package.');
  await reviewPanel.getByRole('button', { name: 'Record review decision' }).click();
  await expect.poll(async () => database.submittalRevision.count({ where: { submittalId: (await database.submittal.findFirstOrThrow({ where: { submittalNo: 'SUB-0001' } })).id } })).toBe(2);

  submitPanel = page.getByRole('heading', { name: 'Submit current draft revision', level: 3 }).locator('..');
  await submitPanel.getByLabel('Optional replacement Document ID').fill(DOCUMENT_ID);
  await submitPanel.getByRole('button', { name: 'Submit revision' }).click();
  await expect.poll(async () => {
    const submittal = await database.submittal.findFirstOrThrow({ where: { submittalNo: 'SUB-0001' } });
    const revision = await database.submittalRevision.findFirstOrThrow({ where: { submittalId: submittal.id, revisionNo: 2 } });
    return revision.status;
  }).toBe('SUBMITTED');
}

/** Reopen Module 19 after a browser reload and prove RFI/Submittal durable history is reconstructed from API readback. */
async function verifyReloadReadback(page) {
  await page.reload();
  await expect(page.locator('.topbar')).toContainText(MANAGER_EMAIL);
  await openModule19(page);
  await selectProject(page);

  await page.getByRole('row').filter({ hasText: 'RFI-0001' }).getByRole('button', { name: 'Open thread' }).click();
  await expect(page.getByText('Use the reviewed connection detail attached to this response.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Append response' })).toBeVisible();

  await page.getByRole('row').filter({ hasText: 'SUB-0001' }).getByRole('button', { name: 'Open package' }).click();
  const revisions = page.locator('.module19-history-card');
  await expect(revisions).toHaveCount(2);
  await expect(revisions.nth(0)).toContainText('Revision 1');
  await expect(revisions.nth(0)).toContainText('REVISE_RESUBMIT');
  await expect(revisions.nth(0)).toContainText('Revise the connection note and resubmit the package.');
  await expect(revisions.nth(1)).toContainText('Revision 2');
  await expect(revisions.nth(1)).toContainText('SUBMITTED');
}

/** Verify one read-only Module-19 user can read durable history but cannot invoke or expose reviewed write actions. */
async function verifyReaderDenial(browser, rfiId, submittalId) {
  const context = await browser.newContext({ baseURL: WEB_URL });
  const page = await context.newPage();
  try {
    await signIn(page, READER_EMAIL);
    await openModule19(page);
    await selectProject(page);

    await expect(page.getByText('rfi.create is required for this command.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create RFI' })).toHaveCount(0);
    await expect(page.getByText('submittals.create is required for this command.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Submittal' })).toHaveCount(0);

    await page.getByRole('row').filter({ hasText: 'RFI-0001' }).getByRole('button', { name: 'Open thread' }).click();
    await expect(page.getByText('Use the reviewed connection detail attached to this response.')).toBeVisible();
    await expect(page.getByText('rfi.respond is required to append a response.')).toBeVisible();
    await expect(page.getByText('rfi.close is required to close this RFI.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Append response' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Close RFI' })).toHaveCount(0);

    await page.getByRole('row').filter({ hasText: 'SUB-0001' }).getByRole('button', { name: 'Open package' }).click();
    await expect(page.getByText('Revise the connection note and resubmit the package.')).toBeVisible();
    await expect(page.getByText('submittals.review is required to record a review decision.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Record review decision' })).toHaveCount(0);

    const readerToken = await page.evaluate(() => sessionStorage.getItem('construction-erp-access-token'));
    expect(readerToken).toBeTruthy();
    const authHeaders = { authorization: `Bearer ${readerToken}` };

    const deniedCreateRfi = await page.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/rfis`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass406-reader-denied-rfi-create' },
      data: {
        subject: 'Denied reader RFI',
        question: 'This write must not succeed.',
        discipline: 'Structural',
        assignedTo: READER_ID,
        dueDate: '2026-09-30'
      }
    });
    expect(deniedCreateRfi.status()).toBe(403);

    for (const [path, key, data] of [
      [`rfis/${rfiId}/respond`, 'pass406-reader-denied-rfi-respond', { response: 'Denied response.' }],
      [`rfis/${rfiId}/close`, 'pass406-reader-denied-rfi-close', undefined],
      [`rfis/${rfiId}/reopen`, 'pass406-reader-denied-rfi-reopen', { reason: 'Denied reopen.' }]
    ]) {
      const response = await page.request.post(`${API_BASE_URL}/${path}`, {
        headers: { ...authHeaders, 'Idempotency-Key': key },
        ...(data === undefined ? {} : { data })
      });
      expect([403, 404]).toContain(response.status());
    }

    const deniedCreateSubmittal = await page.request.post(`${API_BASE_URL}/projects/${PROJECT_ID}/submittals`, {
      headers: { ...authHeaders, 'Idempotency-Key': 'pass406-reader-denied-submittal-create' },
      data: {
        title: 'Denied reader Submittal',
        submittalType: 'SHOP_DRAWING',
        specReference: '03 30 00',
        responsibleUserId: READER_ID,
        dueDate: '2026-10-15',
        documentId: DOCUMENT_ID
      }
    });
    expect(deniedCreateSubmittal.status()).toBe(403);

    for (const [path, key, data] of [
      [`submittals/${submittalId}/submit`, 'pass406-reader-denied-submittal-submit', { documentId: DOCUMENT_ID }],
      [`submittals/${submittalId}/reviews`, 'pass406-reader-denied-submittal-review', { decision: 'APPROVED', comments: 'Denied review.' }]
    ]) {
      const response = await page.request.post(`${API_BASE_URL}/${path}`, {
        headers: { ...authHeaders, 'Idempotency-Key': key },
        data
      });
      expect([403, 404]).toContain(response.status());
    }
  } finally {
    await context.close();
  }
}

test.beforeAll(async () => {
  await seedScenario();
});

test.afterAll(async () => {
  await database?.$disconnect();
});

test('Module 19 browser workflow covers RFI lifecycle, Submittal revise/resubmit, reload history and denied actions', async ({ page, browser }) => {
  test.setTimeout(120_000);

  await signIn(page, MANAGER_EMAIL);
  await openModule19(page);
  await selectProject(page);

  await createRfiInUi(page);
  await respondToRfiInUi(page);
  await closeAndReopenRfiInUi(page);

  const rfi = await database.rfi.findFirstOrThrow({ where: { rfiNo: 'RFI-0001' } });
  expect(rfi.companyId).toBe(COMPANY_ID);
  expect(rfi.projectId).toBe(PROJECT_ID);
  expect(rfi.raisedBy).toBe(MANAGER_ID);
  expect(rfi.status).toBe('OPEN');
  expect(await database.rfiResponse.count({ where: { rfiId: rfi.id } })).toBe(1);

  await createSubmittalInUi(page);
  await reviseAndResubmitInUi(page);

  const submittal = await database.submittal.findFirstOrThrow({ where: { submittalNo: 'SUB-0001' } });
  const revisions = await database.submittalRevision.findMany({
    where: { submittalId: submittal.id },
    orderBy: { revisionNo: 'asc' }
  });
  expect(revisions).toHaveLength(2);
  expect(revisions[0]?.status).toBe('REVISE_RESUBMIT');
  expect(revisions[1]?.status).toBe('SUBMITTED');
  expect(revisions[1]?.documentId).toBe(DOCUMENT_ID);
  expect(await database.submittalReview.count({ where: { submittalRevisionId: revisions[0]?.id } })).toBe(1);

  await verifyReloadReadback(page);
  await verifyReaderDenial(browser, rfi.id, submittal.id);

  expect(await database.rfi.count({ where: { companyId: COMPANY_ID } })).toBe(1);
  expect(await database.rfiResponse.count({ where: { rfiId: rfi.id } })).toBe(1);
  expect(await database.submittal.count({ where: { companyId: COMPANY_ID } })).toBe(1);
  expect(await database.submittalReview.count()).toBe(1);
});
