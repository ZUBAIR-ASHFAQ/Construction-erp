import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';
const realS3 = process.env.RUN_MODULE_18_S3_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000001800';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000001900';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000001810';
const READER_A_ID = '00000000-0000-4000-8000-000000001811';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000001910';
const ADMIN_ROLE_A_ID = '00000000-0000-4000-8000-000000001820';
const READER_ROLE_A_ID = '00000000-0000-4000-8000-000000001821';
const PROJECT_DOCUMENT_ROLE_A_ID = '00000000-0000-4000-8000-000000001822';
const ADMIN_ROLE_B_ID = '00000000-0000-4000-8000-000000001920';
const FOLDER_A_ID = '00000000-0000-4000-8000-000000001830';
const FOLDER_B_ID = '00000000-0000-4000-8000-000000001930';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000001860';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000001960';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000001870';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000001871';
const PROJECT_FOLDER_A_ID = '00000000-0000-4000-8000-000000001880';
const PROJECT_FOLDER_B_ID = '00000000-0000-4000-8000-000000001881';
const PASSWORD = 'Pass57-test-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-auth-action-secret-0123456789abcdef';
const CHECKSUM = Buffer.alloc(32, 7).toString('base64');
const DOCUMENT_UPLOAD_POLICY = {
  maxSizeBytes: 1024 * 1024,
  allowedMimeTypes: ['text/plain', 'application/pdf'],
  signedUrlTtlSeconds: 300
};
const DOCUMENT_PERMISSIONS = [
  'documents.read',
  'documents.upload',
  'documents.version',
  'documents.link',
  'documents.archive',
  'documents.project.read'
];

class TestObjectStorage {
  constructor() {
    this.objects = new Map();
  }

  async putObject(input) {
    const body = typeof input.body === 'string' ? Buffer.from(input.body) : Buffer.from(input.body);
    const info = {
      key: input.key,
      sizeBytes: body.byteLength,
      eTag: 'test-etag',
      checksumSha256: input.checksumSha256 ?? null,
      contentType: input.contentType ?? null,
      lastModified: new Date(),
      metadata: input.metadata ?? {}
    };
    this.objects.set(input.key, { ...info, body });
    return info;
  }

  async headObject(key) {
    const object = this.objects.get(key);
    if (!object) throw new Error('OBJECT_NOT_FOUND');
    const { body: _body, ...info } = object;
    return info;
  }

  async getObject(key) {
    const object = this.objects.get(key);
    if (!object) throw new Error('OBJECT_NOT_FOUND');
    return object;
  }

  async deleteObject(key) {
    this.objects.delete(key);
  }

  async createSignedUploadUrl(input) {
    return {
      url: `https://storage.example.test/upload?key=${encodeURIComponent(input.key)}&checksum=${encodeURIComponent(input.checksumSha256 ?? '')}`,
      expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 300) * 1000)
    };
  }

  async createSignedDownloadUrl(input) {
    return {
      url: `https://storage.example.test/download?key=${encodeURIComponent(input.key)}`,
      expiresAt: new Date(Date.now() + (input.expiresInSeconds ?? 300) * 1000)
    };
  }

  async checkHealth() {
    return { status: 'ok', checkedAt: new Date() };
  }

  close() {}

  async uploadFromSignedUrl(url, body, contentType) {
    const parsedUrl = new URL(url);
    const key = parsedUrl.searchParams.get('key');
    const checksumSha256 = parsedUrl.searchParams.get('checksum') || undefined;
    assert.ok(key, 'signed upload URL must contain the test object key');
    return this.putObject({ key, body, contentType, checksumSha256 });
  }
}

async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  const fromDate = new Date('2026-01-01T00:00:00.000Z');

  await client.company.createMany({
    data: [
      {
        id: COMPANY_A_ID,
        legalName: 'Pass 57 Company A Ltd',
        displayName: 'Pass 57 Company A',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      },
      {
        id: COMPANY_B_ID,
        legalName: 'Pass 57 Company B Ltd',
        displayName: 'Pass 57 Company B',
        status: 'ACTIVE',
        baseCurrency: 'USD',
        timeZone: 'UTC',
        locale: 'en-US',
        fiscalSettings: { fiscalYearStartMonth: 1 }
      }
    ]
  });

  const permissions = [];
  for (const code of DOCUMENT_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { name: code, domain: 'documents' },
      create: { code, name: code, domain: 'documents' }
    }));
  }

  await client.role.createMany({
    data: [
      { id: ADMIN_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'document-admin', name: 'Document Admin', isSystem: false, status: 'ACTIVE' },
      { id: READER_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'document-reader', name: 'Document Reader', isSystem: false, status: 'ACTIVE' },
      { id: PROJECT_DOCUMENT_ROLE_A_ID, companyId: COMPANY_A_ID, code: 'project-document-editor', name: 'Project Document Editor', isSystem: false, status: 'ACTIVE' },
      { id: ADMIN_ROLE_B_ID, companyId: COMPANY_B_ID, code: 'document-admin', name: 'Document Admin', isSystem: false, status: 'ACTIVE' }
    ]
  });

  await client.rolePermission.createMany({
    data: [
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_A_ID, permissionId: permission.id })),
      ...permissions.map((permission) => ({ roleId: ADMIN_ROLE_B_ID, permissionId: permission.id })),
      { roleId: READER_ROLE_A_ID, permissionId: permissions.find((permission) => permission.code === 'documents.read').id },
      ...['documents.project.read', 'documents.upload', 'documents.version', 'documents.link', 'documents.archive'].map((code) => ({
        roleId: PROJECT_DOCUMENT_ROLE_A_ID,
        permissionId: permissions.find((permission) => permission.code === code).id
      }))
    ]
  });

  await client.user.createMany({
    data: [
      { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'docs-admin-a@example.test', name: 'Docs Admin A', status: 'ACTIVE' },
      { id: READER_A_ID, companyId: COMPANY_A_ID, email: 'docs-reader-a@example.test', name: 'Docs Reader A', status: 'ACTIVE' },
      { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'docs-admin-b@example.test', name: 'Docs Admin B', status: 'ACTIVE' }
    ]
  });

  await client.authCredential.createMany({
    data: [ADMIN_A_ID, READER_A_ID, ADMIN_B_ID].map((userId) => ({ userId, passwordHash }))
  });

  await client.userRoleAssignment.createMany({
    data: [
      { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, userId: READER_A_ID, roleId: READER_ROLE_A_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate },
      { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_ROLE_B_ID, scopeType: 'COMPANY', scopeId: null, status: 'ACTIVE', fromDate }
    ]
  });

  await client.client.createMany({
    data: [
      {
        id: CLIENT_A_ID,
        companyId: COMPANY_A_ID,
        code: 'DOC-CLIENT-A',
        legalName: 'Document Client A Ltd',
        displayName: 'Document Client A',
        billingAddress: 'Lahore, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      },
      {
        id: CLIENT_B_ID,
        companyId: COMPANY_B_ID,
        code: 'DOC-CLIENT-B',
        legalName: 'Document Client B Ltd',
        displayName: 'Document Client B',
        billingAddress: 'Karachi, Pakistan',
        status: 'ACTIVE',
        creditTermsDays: 30
      }
    ]
  });

  await client.project.createMany({
    data: [
      {
        id: PROJECT_A_ID,
        companyId: COMPANY_A_ID,
        projectCode: 'DOC-PROJECT-A',
        name: 'Document Project A',
        clientId: CLIENT_A_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_A_ID,
        location: 'Lahore, Pakistan'
      },
      {
        id: PROJECT_B_ID,
        companyId: COMPANY_A_ID,
        projectCode: 'DOC-PROJECT-B',
        name: 'Document Project B',
        clientId: CLIENT_A_ID,
        status: 'ACTIVE',
        currency: 'USD',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        plannedEndDate: new Date('2027-01-01T00:00:00.000Z'),
        projectManagerUserId: ADMIN_A_ID,
        location: 'Islamabad, Pakistan'
      }
    ]
  });

  await client.projectMember.createMany({
    data: [
      { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, userId: ADMIN_A_ID, projectRole: 'DOCUMENT_ADMIN', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, projectId: PROJECT_B_ID, userId: ADMIN_A_ID, projectRole: 'DOCUMENT_ADMIN', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, userId: READER_A_ID, projectRole: 'DOCUMENT_EDITOR', status: 'ACTIVE', fromDate },
      { companyId: COMPANY_A_ID, projectId: PROJECT_B_ID, userId: READER_A_ID, projectRole: 'DOCUMENT_VIEWER', status: 'ACTIVE', fromDate }
    ]
  });

  await client.userRoleAssignment.create({
    data: {
      companyId: COMPANY_A_ID,
      userId: READER_A_ID,
      roleId: PROJECT_DOCUMENT_ROLE_A_ID,
      scopeType: 'PROJECT',
      scopeId: PROJECT_A_ID,
      status: 'ACTIVE',
      fromDate
    }
  });

  await client.documentFolder.createMany({
    data: [
      { id: FOLDER_A_ID, companyId: COMPANY_A_ID, projectId: null, parentId: null, name: 'Company A Documents', category: 'general', status: 'active' },
      { id: PROJECT_FOLDER_A_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, parentId: null, name: 'Project A Documents', category: 'project', status: 'active' },
      { id: PROJECT_FOLDER_B_ID, companyId: COMPANY_A_ID, projectId: PROJECT_B_ID, parentId: null, name: 'Project B Documents', category: 'project', status: 'active' },
      { id: FOLDER_B_ID, companyId: COMPANY_B_ID, projectId: null, parentId: null, name: 'Company B Documents', category: 'general', status: 'active' }
    ]
  });
}

async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  const storage = new TestObjectStorage();
  let app;

  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);
    app = buildApp({
      database: client,
      objectStorage: storage,
      nodeEnv: 'test',
      logLevel: 'silent',
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET,
      documentsUploadPolicy: DOCUMENT_UPLOAD_POLICY
    });
    await app.ready();
    await work({ app, client, storage });
  } finally {
    if (app) await app.close();
    else await client.$disconnect();
  }
}

/** Return the base64 SHA-256 checksum used by the real signed-upload contract. */
function checksumBase64(body) {
  return createHash('sha256').update(body).digest('base64');
}

/** Upload one object through the exact headers returned by the signed-upload API. */
async function uploadToRealSignedUrl(intent, body) {
  const response = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: intent.headers,
    body
  });
  assert.equal(response.ok, true, `Signed object upload failed with HTTP ${response.status}.`);
}

/** Run one Module 18 API scenario against the configured disposable S3-compatible bucket. */
async function withRealStorageApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const { loadStorageConfig } = await import('@construction-erp/config');
  const { createS3ObjectStorage } = await import('@construction-erp/storage');
  const environment = testing.loadFoundationTestEnvironment();
  const client = testing.createFoundationTestDatabaseClient(environment);
  const storage = createS3ObjectStorage(loadStorageConfig(process.env, 'test'));
  let app;

  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);

    const health = await storage.checkHealth();
    assert.equal(health.status, 'ok', 'The disposable S3-compatible test bucket must be reachable.');

    app = buildApp({
      database: client,
      objectStorage: storage,
      nodeEnv: 'test',
      logLevel: 'silent',
      authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET,
      documentsUploadPolicy: DOCUMENT_UPLOAD_POLICY
    });
    await app.ready();
    await work({ app, client, storage });
  } finally {
    if (app) {
      const versions = await client.documentVersion.findMany({ select: { storageKey: true } }).catch(() => []);
      const intents = await client.documentUploadIntent.findMany({ select: { storageKey: true } }).catch(() => []);
      const keys = new Set([...versions, ...intents].map((row) => row.storageKey));
      for (const key of keys) await storage.deleteObject(key).catch(() => undefined);
      await app.close();
    } else {
      storage.close();
      await client.$disconnect().catch(() => undefined);
    }
  }
}

async function signIn(app, email) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/sign-in',
    payload: { email, password: PASSWORD }
  });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

async function createDocument(app, storage, token, options = {}) {
  const body = options.body ?? 'first-version';
  const mimeType = options.mimeType ?? 'text/plain';
  const intentResponse = await app.inject({
    method: 'POST',
    url: '/api/v1/documents/upload-intents',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      folderId: options.folderId ?? FOLDER_A_ID,
      title: options.title ?? 'Site Instructions',
      documentNo: options.documentNo ?? 'DOC-001',
      category: options.category ?? 'site',
      originalName: options.originalName ?? 'instructions.txt',
      mimeType,
      sizeBytes: Buffer.byteLength(body),
      checksum: CHECKSUM
    }
  });
  assert.equal(intentResponse.statusCode, 200, intentResponse.body);
  const intent = intentResponse.json().data;

  await storage.uploadFromSignedUrl(intent.uploadUrl, body, mimeType);

  const completeResponse = await app.inject({
    method: 'POST',
    url: `/api/v1/documents/upload-intents/${intent.id}/complete`,
    headers: {
      authorization: `Bearer ${token}`,
      'idempotency-key': options.idempotencyKey ?? `complete-${intent.id}`
    },
    payload: {}
  });
  assert.equal(completeResponse.statusCode, 200, completeResponse.body);
  return { intent, result: completeResponse.json().data };
}

test('Module 18 main API workflow persists metadata, versions, lifecycle, audit and outbox', { skip: !live }, async () => {
  await withApi(async ({ app, client, storage }) => {
    const token = await signIn(app, 'docs-admin-a@example.test');

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.map((folder) => folder.id), [FOLDER_A_ID]);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { parentId: FOLDER_A_ID, name: 'Site Notes', category: 'site' }
    });
    assert.equal(response.statusCode, 201, response.body);
    const childFolderId = response.json().data.id;

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/folders?parentId=${FOLDER_A_ID}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.some((folder) => folder.id === childFolderId), true);

    const first = await createDocument(app, storage, token, { folderId: childFolderId });
    const documentId = first.result.document.id;

    const storedDocument = await client.document.findFirst({
      where: { id: documentId, companyId: COMPANY_A_ID },
      include: { versions: true }
    });
    assert.ok(storedDocument);
    assert.equal(storedDocument.versions.length, 1);
    assert.equal(storedDocument.versions[0].versionNo, 1);

    const { DocumentsService } = await import('../../apps/api/dist/modules/documents/documents.service.js');
    const testing = await import('@construction-erp/testing');
    const service = new DocumentsService(client, storage, DOCUMENT_UPLOAD_POLICY);
    const linked = await testing.runWithAuthenticatedTestContext({
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      permissions: DOCUMENT_PERMISSIONS
    }, async () => service.linkDocumentToResource({
      documentId,
      linkedResourceType: 'project',
      linkedResourceId: PROJECT_A_ID,
      relationType: 'attachment'
    }));
    const linkedAgain = await testing.runWithAuthenticatedTestContext({
      actorUserId: ADMIN_A_ID,
      companyId: COMPANY_A_ID,
      permissions: DOCUMENT_PERMISSIONS
    }, async () => service.linkDocumentToResource({
      documentId,
      linkedResourceType: 'project',
      linkedResourceId: PROJECT_A_ID,
      relationType: 'attachment'
    }));
    assert.equal(linkedAgain.id, linked.id);
    assert.equal(await client.documentLink.count({ where: { documentId } }), 1);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?page=1&pageSize=10&category=site',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.total, 1);
    assert.equal(response.json().data.items[0].id, documentId);
    assert.ok(!response.body.includes('storageKey'));

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.versions.length, 1);
    assert.ok(!response.body.includes('storageKey'));

    const secondBody = 'second-version-content';
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/versions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        originalName: 'instructions-v2.txt',
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(secondBody),
        checksum: CHECKSUM,
        revisionCode: 'B'
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const versionIntent = response.json().data;
    await storage.uploadFromSignedUrl(versionIntent.uploadUrl, secondBody, 'text/plain');

    const completionHeaders = {
      authorization: `Bearer ${token}`,
      'idempotency-key': `complete-${versionIntent.id}`
    };
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${versionIntent.id}/complete`,
      headers: completionHeaders,
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.version.versionNo, 2);
    const firstCompletionBody = response.body;

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${versionIntent.id}/complete`,
      headers: completionHeaders,
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.body, firstCompletionBody);
    assert.equal(await client.documentVersion.count({ where: { documentId } }), 2);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}/download`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.match(response.json().data.url, /^https:\/\/storage\.example\.test\/download\?/);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/archive`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'archive-doc-1' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'archived');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/archive`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'archive-doc-1' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/restore`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'restore-doc-1' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'active');

    const allCompanyAudits = await client.auditLog.findMany({ where: { companyId: COMPANY_A_ID } });
    const actionNames = allCompanyAudits.map((row) => row.action);
    assert.ok(actionNames.includes('document.created'));
    assert.equal(actionNames.filter((value) => value === 'document.version_added').length, 2);
    assert.equal(actionNames.filter((value) => value === 'document.archived').length, 1);
    assert.equal(actionNames.filter((value) => value === 'document.restored').length, 1);
    assert.equal(actionNames.filter((value) => value === 'document.download_authorized').length, 1);
    assert.equal(actionNames.filter((value) => value === 'document.folder_created').length, 1);
    assert.equal(actionNames.filter((value) => value === 'document.linked').length, 1);

    const auditText = JSON.stringify(allCompanyAudits);
    assert.ok(!auditText.includes('storage.example.test'));
    assert.ok(!auditText.includes('storageKey'));

    const events = await client.outboxEvent.findMany({
      where: { companyId: COMPANY_A_ID, resourceId: documentId },
      select: { eventType: true }
    });
    assert.equal(events.filter((row) => row.eventType === 'document.created').length, 1);
    assert.equal(events.filter((row) => row.eventType === 'document.version_added').length, 2);
    assert.equal(events.filter((row) => row.eventType === 'document.archived').length, 1);
    assert.equal(events.filter((row) => row.eventType === 'document.restored').length, 1);
  });
});

test('Module 18 enforces exact Project document permissions without cross-Project union', { skip: !live }, async () => {
  await withApi(async ({ app, client, storage }) => {
    const readerSignIn = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'docs-reader-a@example.test', password: PASSWORD }
    });
    assert.equal(readerSignIn.statusCode, 200, readerSignIn.body);
    const readerAuth = readerSignIn.json().data;
    assert.deepEqual(readerAuth.permissions, ['documents.read']);
    assert.deepEqual(readerAuth.projectScope, {
      kind: 'restricted',
      projectIds: [PROJECT_A_ID, PROJECT_B_ID]
    });

    let response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const visibleFolderIds = response.json().data.map((folder) => folder.id);
    assert.ok(visibleFolderIds.includes(FOLDER_A_ID));
    assert.ok(visibleFolderIds.includes(PROJECT_FOLDER_A_ID));
    assert.equal(visibleFolderIds.includes(PROJECT_FOLDER_B_ID), false);

    const projectADocument = await createDocument(app, storage, readerAuth.accessToken, {
      folderId: PROJECT_FOLDER_A_ID,
      title: 'Project A Drawing',
      documentNo: 'PROJECT-A-DOC',
      idempotencyKey: 'project-a-create'
    });
    const projectADocumentId = projectADocument.result.document.id;
    assert.equal(projectADocument.result.document.projectId, PROJECT_A_ID);

    const storedA = await client.document.findUnique({ where: { id: projectADocumentId } });
    assert.equal(storedA.projectId, PROJECT_A_ID);
    const storedAIntent = await client.documentUploadIntent.findUnique({ where: { id: projectADocument.intent.id } });
    assert.equal(storedAIntent.projectId, PROJECT_A_ID);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${readerAuth.accessToken}` },
      payload: {
        folderId: PROJECT_FOLDER_B_ID,
        title: 'Forbidden Project B Upload',
        category: 'project',
        originalName: 'forbidden-b.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    const adminToken = await signIn(app, 'docs-admin-a@example.test');
    const projectBDocument = await createDocument(app, storage, adminToken, {
      folderId: PROJECT_FOLDER_B_ID,
      title: 'Project B Drawing',
      documentNo: 'PROJECT-B-DOC',
      idempotencyKey: 'project-b-create'
    });
    const projectBDocumentId = projectBDocument.result.document.id;
    assert.equal(projectBDocument.result.document.projectId, PROJECT_B_ID);

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?pageSize=100',
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const visibleDocumentIds = response.json().data.items.map((document) => document.id);
    assert.ok(visibleDocumentIds.includes(projectADocumentId));
    assert.equal(visibleDocumentIds.includes(projectBDocumentId), false);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${projectADocumentId}`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.projectId, PROJECT_A_ID);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${projectBDocumentId}`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    const versionBody = 'project-a-version-two';
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${projectADocumentId}/versions`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` },
      payload: {
        originalName: 'project-a-v2.txt',
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(versionBody),
        checksum: CHECKSUM,
        revisionCode: 'P2'
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const versionIntent = response.json().data;
    const storedVersionIntent = await client.documentUploadIntent.findUnique({ where: { id: versionIntent.id } });
    assert.equal(storedVersionIntent.projectId, PROJECT_A_ID);
    await storage.uploadFromSignedUrl(versionIntent.uploadUrl, versionBody, 'text/plain');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${versionIntent.id}/complete`,
      headers: {
        authorization: `Bearer ${readerAuth.accessToken}`,
        'idempotency-key': 'project-a-version-two-complete'
      },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.document.projectId, PROJECT_A_ID);
    assert.equal(response.json().data.version.versionNo, 2);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${projectBDocumentId}/versions`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` },
      payload: {
        originalName: 'forbidden-b-v2.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${projectADocumentId}/download`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${projectBDocumentId}/download`,
      headers: { authorization: `Bearer ${readerAuth.accessToken}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${projectADocumentId}/archive`,
      headers: {
        authorization: `Bearer ${readerAuth.accessToken}`,
        'idempotency-key': 'project-a-archive'
      },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${projectBDocumentId}/archive`,
      headers: {
        authorization: `Bearer ${readerAuth.accessToken}`,
        'idempotency-key': 'project-b-forbidden-archive'
      },
      payload: {}
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');
  });
});


test('Pass 170 exposes explicit Project targets, filters and OpenAPI without trusting browser scope', { skip: !live }, async () => {
  await withApi(async ({ app, client, storage }) => {
    const readerAuth = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/sign-in',
      payload: { email: 'docs-reader-a@example.test', password: PASSWORD }
    });
    assert.equal(readerAuth.statusCode, 200, readerAuth.body);
    const token = readerAuth.json().data.accessToken;

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents?projectId=${PROJECT_A_ID}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.accessibleProjectIds, [PROJECT_A_ID]);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents?projectId=${PROJECT_B_ID}`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: PROJECT_A_ID, name: 'Pass 170 Project A Root', category: 'drawing' }
    });
    assert.equal(response.statusCode, 201, response.body);
    assert.equal(response.json().data.projectId, PROJECT_A_ID);
    const rootFolderId = response.json().data.id;

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${token}` },
      payload: { projectId: PROJECT_B_ID, name: 'Pass 170 Forbidden Root', category: 'drawing' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: PROJECT_A_ID,
        title: 'Pass 170 Root Project Upload',
        category: 'drawing',
        originalName: 'pass170-root.txt',
        mimeType: 'text/plain',
        sizeBytes: 19,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const intent = response.json().data;
    const storedIntent = await client.documentUploadIntent.findUnique({ where: { id: intent.id } });
    assert.equal(storedIntent.projectId, PROJECT_A_ID);
    assert.equal(storedIntent.folderId, null);
    await storage.uploadFromSignedUrl(intent.uploadUrl, 'pass170-root-upload', 'text/plain');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${intent.id}/complete`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pass170-root-complete' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.document.projectId, PROJECT_A_ID);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: PROJECT_B_ID,
        title: 'Pass 170 Forbidden Project B Upload',
        category: 'drawing',
        originalName: 'pass170-forbidden.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        projectId: PROJECT_B_ID,
        folderId: rootFolderId,
        title: 'Pass 170 Mismatched Scope',
        category: 'drawing',
        originalName: 'mismatch.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    const openApiResponse = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(openApiResponse.statusCode, 200, openApiResponse.body);
    const openapi = openApiResponse.json();
    const uploadBody = openapi.paths['/api/v1/documents/upload-intents'].post.requestBody.content['application/json'].schema;
    const folderBody = openapi.paths['/api/v1/documents/folders'].post.requestBody.content['application/json'].schema;
    assert.ok(uploadBody.properties.projectId);
    assert.ok(folderBody.properties.projectId);
    assert.equal(uploadBody.additionalProperties, false);
    assert.equal(folderBody.additionalProperties, false);
    for (const forbiddenField of ['companyId', 'actorUserId', 'permissions', 'projectScope', 'changedBy']) {
      assert.equal(Object.hasOwn(uploadBody.properties, forbiddenField), false, forbiddenField);
      assert.equal(Object.hasOwn(folderBody.properties, forbiddenField), false, forbiddenField);
    }
    const documentQueryNames = (openapi.paths['/api/v1/documents'].get.parameters ?? []).map((parameter) => parameter.name);
    const folderQueryNames = (openapi.paths['/api/v1/documents/folders'].get.parameters ?? []).map((parameter) => parameter.name);
    assert.ok(documentQueryNames.includes('projectId'));
    assert.ok(folderQueryNames.includes('projectId'));
  });
});

test('Module 18 rejects missing auth, insufficient permissions and untrusted ownership input', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    let response = await app.inject({ method: 'GET', url: '/api/v1/documents' });
    assert.equal(response.statusCode, 401, response.body);
    assert.equal(response.json().error.code, 'AUTH_SESSION_EXPIRED');

    const readerToken = await signIn(app, 'docs-reader-a@example.test');
    response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents',
      headers: { authorization: `Bearer ${readerToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: {
        title: 'Forbidden Upload',
        category: 'site',
        originalName: 'forbidden.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${readerToken}` },
      payload: { name: 'Forbidden Folder', category: 'general' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    const adminToken = await signIn(app, 'docs-admin-a@example.test');
    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        companyId: COMPANY_B_ID,
        title: 'Untrusted Company',
        category: 'site',
        originalName: 'company.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 400, response.body);
    assert.equal(response.json().error.code, 'INVALID_REQUEST');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        folderId: FOLDER_B_ID,
        title: 'Wrong Company Folder',
        category: 'site',
        originalName: 'folder.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');

    response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/folders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { parentId: FOLDER_B_ID, name: 'Wrong Company Child', category: 'general' }
    });
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_SCOPE_FORBIDDEN');
  });
});

test('Module 18 hides cross-company documents from reads and writes', { skip: !live }, async () => {
  await withApi(async ({ app, client, storage }) => {
    const adminAToken = await signIn(app, 'docs-admin-a@example.test');
    const adminBToken = await signIn(app, 'docs-admin-b@example.test');
    const companyBDocument = await createDocument(app, storage, adminBToken, {
      folderId: FOLDER_B_ID,
      title: 'Company B Private Document',
      documentNo: 'B-001',
      idempotencyKey: 'company-b-complete'
    });
    const documentId = companyBDocument.result.document.id;

    let response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}`,
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_NOT_FOUND');
    assert.ok(!response.body.includes('Company B Private Document'));

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/versions`,
      headers: { authorization: `Bearer ${adminAToken}` },
      payload: {
        originalName: 'attempt.txt',
        mimeType: 'text/plain',
        sizeBytes: 5,
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_NOT_FOUND');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/archive`,
      headers: { authorization: `Bearer ${adminAToken}`, 'idempotency-key': 'cross-company-archive' },
      payload: {}
    });
    assert.equal(response.statusCode, 404, response.body);
    assert.equal(response.json().error.code, 'DOCUMENT_NOT_FOUND');

    response = await app.inject({
      method: 'GET',
      url: '/api/v1/documents?pageSize=100',
      headers: { authorization: `Bearer ${adminAToken}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.items.some((item) => item.id === documentId), false);

    const { DocumentsService } = await import('../../apps/api/dist/modules/documents/documents.service.js');
    const testing = await import('@construction-erp/testing');
    const service = new DocumentsService(client, storage, DOCUMENT_UPLOAD_POLICY);
    await assert.rejects(
      () => testing.runWithAuthenticatedTestContext({
        actorUserId: ADMIN_A_ID,
        companyId: COMPANY_A_ID,
        permissions: DOCUMENT_PERMISSIONS
      }, async () => service.linkDocumentToResource({
        documentId,
        linkedResourceType: 'project',
        linkedResourceId: PROJECT_A_ID,
        relationType: 'attachment'
      })),
      (error) => error?.code === 'DOCUMENT_NOT_FOUND'
    );
    assert.equal(await client.documentLink.count({ where: { documentId } }), 0);
  });
});

test('Module 18 rejects upload completion when object storage does not match the server intent', { skip: !live }, async () => {
  await withApi(async ({ app, storage }) => {
    const token = await signIn(app, 'docs-admin-a@example.test');
    const body = 'expected-file';
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Object Verification',
        category: 'site',
        originalName: 'expected.txt',
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(body),
        checksum: CHECKSUM
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const intent = response.json().data;

    await storage.uploadFromSignedUrl(intent.uploadUrl, 'wrong-size', 'text/plain');

    const complete = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${intent.id}/complete`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'invalid-object-complete' },
      payload: {}
    });
    assert.equal(complete.statusCode, 409, complete.body);
    assert.equal(complete.json().error.code, 'UPLOAD_INTENT_INVALID');
  });
});


test('Module 18 database constraints reject cross-company ownership and mismatched current versions', { skip: !live }, async () => {
  await withApi(async ({ app, client, storage }) => {
    await assert.rejects(() => client.$executeRawUnsafe(`
      INSERT INTO document_folders (id, company_id, parent_id, name, category, status)
      VALUES ('00000000-0000-4000-8000-000000001850', '${COMPANY_A_ID}', '${FOLDER_B_ID}', 'Invalid Parent', 'general', 'active')
    `));

    await assert.rejects(() => client.$executeRawUnsafe(`
      INSERT INTO documents (id, company_id, title, category, status, owner_user_id)
      VALUES ('00000000-0000-4000-8000-000000001851', '${COMPANY_A_ID}', 'Invalid Owner', 'general', 'active', '${ADMIN_B_ID}')
    `));

    const token = await signIn(app, 'docs-admin-a@example.test');
    const first = await createDocument(app, storage, token, {
      title: 'Current Version Guard A',
      documentNo: 'GUARD-A',
      idempotencyKey: 'guard-current-a'
    });
    const second = await createDocument(app, storage, token, {
      title: 'Current Version Guard B',
      documentNo: 'GUARD-B',
      idempotencyKey: 'guard-current-b'
    });

    const firstDocumentId = first.result.document.id;
    const secondDocumentId = second.result.document.id;
    const secondVersionId = second.result.version.id;

    await client.$executeRawUnsafe(`UPDATE documents SET current_version_id = NULL WHERE id = '${secondDocumentId}'`);
    await assert.rejects(() => client.$executeRawUnsafe(`
      UPDATE documents
      SET current_version_id = '${secondVersionId}'
      WHERE id = '${firstDocumentId}'
    `));
  });
});

test('Module 18 live acceptance proves signed upload, versioning, download and lifecycle against S3-compatible storage', { skip: !live || !realS3 }, async () => {
  await withRealStorageApi(async ({ app, client }) => {
    const token = await signIn(app, 'docs-admin-a@example.test');
    const firstBody = 'pass-87-s3-first-version';
    const firstChecksum = checksumBase64(firstBody);

    let response = await app.inject({
      method: 'POST',
      url: '/api/v1/documents/upload-intents',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Pass 87 S3 Acceptance',
        documentNo: 'PASS-87-S3',
        category: 'site',
        originalName: 'pass-87-v1.txt',
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(firstBody),
        checksum: firstChecksum
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const firstIntent = response.json().data;
    assert.equal(firstIntent.headers['if-none-match'], '*');
    assert.equal(firstIntent.headers['x-amz-checksum-sha256'], firstChecksum);

    await uploadToRealSignedUrl(firstIntent, firstBody);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${firstIntent.id}/complete`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pass-87-s3-complete-v1' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    const firstCompleted = response.json().data;
    const documentId = firstCompleted.document.id;
    assert.equal(firstCompleted.version.versionNo, 1);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}/download`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const firstDownload = await fetch(response.json().data.url);
    assert.equal(firstDownload.ok, true);
    assert.equal(await firstDownload.text(), firstBody);

    const secondBody = 'pass-87-s3-second-version';
    const secondChecksum = checksumBase64(secondBody);
    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/versions`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        originalName: 'pass-87-v2.txt',
        mimeType: 'text/plain',
        sizeBytes: Buffer.byteLength(secondBody),
        checksum: secondChecksum,
        revisionCode: 'R2'
      }
    });
    assert.equal(response.statusCode, 200, response.body);
    const secondIntent = response.json().data;
    assert.equal(secondIntent.headers['if-none-match'], '*');
    await uploadToRealSignedUrl(secondIntent, secondBody);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/upload-intents/${secondIntent.id}/complete`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pass-87-s3-complete-v2' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    const secondCompleted = response.json().data;
    assert.equal(secondCompleted.version.versionNo, 2);
    assert.equal(secondCompleted.document.currentVersionId, secondCompleted.version.id);

    response = await app.inject({
      method: 'GET',
      url: `/api/v1/documents/${documentId}/download`,
      headers: { authorization: `Bearer ${token}` }
    });
    assert.equal(response.statusCode, 200, response.body);
    const secondDownload = await fetch(response.json().data.url);
    assert.equal(secondDownload.ok, true);
    assert.equal(await secondDownload.text(), secondBody);

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/archive`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pass-87-s3-archive' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'archived');

    response = await app.inject({
      method: 'POST',
      url: `/api/v1/documents/${documentId}/restore`,
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'pass-87-s3-restore' },
      payload: {}
    });
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.status, 'active');

    const storedDocument = await client.document.findUnique({
      where: { id: documentId },
      include: { versions: { orderBy: { versionNo: 'asc' } } }
    });
    assert.equal(storedDocument.versions.length, 2);
    assert.equal(storedDocument.currentVersionId, storedDocument.versions[1].id);
    assert.notEqual(storedDocument.versions[0].storageKey, storedDocument.versions[1].storageKey);
    assert.ok(storedDocument.versions.every((version) => version.storageKey.startsWith(`companies/${COMPANY_A_ID}/documents/`)));
  });
});
