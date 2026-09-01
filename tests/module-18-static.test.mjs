import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

const backendDir = 'apps/api/src/modules/documents';
const frontendDir = 'apps/web/src/features/documents';
const schema = await readFile(`${backendDir}/documents.schema.ts`, 'utf8');
const routes = await readFile(`${backendDir}/documents.routes.ts`, 'utf8');
const repository = await readFile(`${backendDir}/documents.repository.ts`, 'utf8');
const service = await readFile(`${backendDir}/documents.service.ts`, 'utf8');
const usersRepository = await readFile('apps/api/src/modules/administration/administration.repository.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const integrationTest = await readFile('tests/integration/module-18-api.integration.test.mjs', 'utf8');
const relationshipMigration = await readFile('packages/database/prisma/migrations/20260822001360_module_18_relationship_integrity/migration.sql', 'utf8');
const projectRelationshipMigration = await readFile('packages/database/prisma/migrations/20260823000600_module_18_project_relationship_activation/migration.sql', 'utf8');
const projectPersistenceGate = await readFile('scripts/module-18/verify-project-relationship-persistence.mjs', 'utf8');
const projectSecurityGate = await readFile('scripts/module-18/verify-project-security.mjs', 'utf8');
const projectCompletionGate = await readFile('scripts/module-18/verify-project-completion.mjs', 'utf8');
const stage2Gate = await readFile('scripts/module-18/verify-stage-2.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-18-browser.spec.mjs', 'utf8');
const documentBrowser = await readFile(`${frontendDir}/components/document-browser.tsx`, 'utf8');
const documentDetails = await readFile(`${frontendDir}/components/document-details-panel.tsx`, 'utf8');
const documentApi = await readFile(`${frontendDir}/api/documents-api.ts`, 'utf8');
const documentHooks = await readFile(`${frontendDir}/hooks/documents.ts`, 'utf8');
const authHooks = await readFile('apps/web/src/features/administration/hooks/auth.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

const permissions = [
  'documents.read',
  'documents.upload',
  'documents.version',
  'documents.link',
  'documents.archive',
  'documents.project.read'
];
const errors = [
  'DOCUMENT_NOT_FOUND',
  'UPLOAD_INTENT_INVALID',
  'FILE_TYPE_NOT_ALLOWED',
  'FILE_SIZE_EXCEEDED',
  'DOCUMENT_SCOPE_FORBIDDEN',
  'DOCUMENT_LINK_INVALID',
  'DOCUMENT_VERSION_CONFLICT'
];
const events = [
  'document.created',
  'document.version_added',
  'document.linked',
  'document.unlinked',
  'document.archived',
  'document.restored'
];
const approvedRoutes = [
  "app.post('/api/v1/documents/upload-intents'",
  "app.post('/api/v1/documents/upload-intents/:id/complete'",
  "app.get('/api/v1/documents'",
  "app.get('/api/v1/documents/folders'",
  "app.post('/api/v1/documents/folders'",
  "app.get('/api/v1/documents/:id'",
  "app.post('/api/v1/documents/:id/versions'",
  "app.post('/api/v1/documents/:id/links'",
  "app.get('/api/v1/documents/:id/download'",
  "app.post('/api/v1/documents/:id/archive'",
  "app.post('/api/v1/documents/:id/restore'"
];

test('Module 18 keeps the required five-file Fastify module structure', async () => {
  assert.deepEqual((await readdir(backendDir)).sort(), [
    'documents.repository.ts',
    'documents.routes.ts',
    'documents.schema.ts',
    'documents.service.ts',
    'index.ts'
  ]);
});

test('Module 18 keeps the approved permissions, stable errors and document domain events', () => {
  for (const value of [...permissions, ...errors, ...events]) assert.ok(schema.includes(`'${value}'`), value);
});

test('Module 18 keeps legacy routes plus final controlled document-link routes', () => {
  for (const route of approvedRoutes) assert.ok(routes.includes(route), route);
  assert.equal((routes.match(/app\.(?:get|post)\('/g) ?? []).length, approvedRoutes.length);
  assert.ok(routes.includes("app.delete('/api/v1/documents/:id/links/:linkId'"));
  assert.match(app, /registerDocumentsRoutes/);
  assert.match(app, /options\.database && options\.objectStorage/);
  assert.match(app, /swagger/);
});

test('Module 18 activates only the reviewed nullable Project ownership after Project Management exists', () => {
  for (const model of ['DocumentFolder', 'Document', 'DocumentUploadIntent']) {
    const block = prisma.match(new RegExp(`model\\s+${model}\\s*\\{[\\s\\S]*?\\n\\}`));
    assert.ok(block, model);
    assert.match(block[0], /projectId\s+String\?\s+@map\("project_id"\)\s+@db\.Uuid/);
  }
  const versionBlock = prisma.match(/model\s+DocumentVersion\s*\{[\s\S]*?\n\}/);
  assert.ok(versionBlock);
  assert.doesNotMatch(versionBlock[0], /projectId|@map\("project_id"\)/);

  const linkBlock = prisma.match(/model\s+DocumentLink\s*\{[\s\S]*?\n\}/);
  assert.ok(linkBlock);
  for (const field of ['companyId', 'versionId', 'projectId', 'stageId', 'createdBy']) {
    assert.match(linkBlock[0], new RegExp(field));
  }
  assert.match(prisma, /DocumentFolderProject/);
  assert.match(prisma, /DocumentProject/);
  assert.match(prisma, /DocumentUploadIntentProject/);
});
test('Module 18 Stage 2 migrations are gate-registered and checksum locked', () => {
  const stage2 = gates.gates.filter((gate) => gate.stage === 2).flatMap((gate) => gate.migrations);
  assert.deepEqual(stage2, [
    '20260822001100_module_18_document_management_core',
    '20260822001200_module_18_upload_intents',
    '20260822001300_module_18_existing_document_version_intents',
    '20260822001350_module_18_document_link_uniqueness',
    '20260822001360_module_18_relationship_integrity'
  ]);
  for (const migration of stage2) assert.match(checksums.migrations[migration], /^[a-f0-9]{64}$/);
});

// Verify the deferred Project relationship is a new migration rather than a rewrite of accepted Stage-2 history.
test('Pass 168 keeps the Module 18 Project relationship migration registered after Module 24B', () => {
  const projectRelationshipGate = gates.gates.find((item) => item.gate === 'module-18-project-relationship-activation');
  assert.equal(projectRelationshipGate?.stage, 8);
  assert.deepEqual(projectRelationshipGate?.migrations, ['20260823000600_module_18_project_relationship_activation']);
  assert.match(checksums.migrations['20260823000600_module_18_project_relationship_activation'], /^[a-f0-9]{64}$/);
  assert.match(projectRelationshipMigration, /ADD COLUMN "project_id" UUID/);
  assert.match(projectRelationshipMigration, /document_folders_project_company_fkey/);
  assert.match(projectRelationshipMigration, /documents_project_company_fkey/);
  assert.match(projectRelationshipMigration, /document_upload_intents_project_company_fkey/);
});

// Keep folder, document and upload-intent Project ownership aligned at the database boundary.
test('Pass 168 enforces same-company Project ownership and nullable scope consistency', () => {
  for (const value of [
    'document_folders_company_project_status_idx',
    'documents_company_project_status_idx',
    'document_upload_intents_company_project_expires_at_idx',
    'document_folders_project_scope_consistency',
    'documents_project_scope_consistency',
    'document_upload_intents_project_scope_consistency'
  ]) assert.match(projectRelationshipMigration, new RegExp(value));

  assert.match(projectRelationshipMigration, /IS DISTINCT FROM NEW\."project_id"/);
  assert.match(projectRelationshipMigration, /Existing company-wide/i);
  assert.match(projectRelationshipMigration, /child folder project scope/);
  assert.match(projectRelationshipMigration, /contained document project scope/);
  assert.match(projectRelationshipMigration, /document project scope must match upload intent project scope/);
});

// Keep this pass persistence-only; Project-aware repository/service policy belongs to Pass 169.
test('Pass 168 persistence gate keeps the audit repair hold and hands off to repository/service security', () => {
  assert.equal(rootPackage.scripts['module-18:project-persistence:gate'], 'node scripts/module-18/verify-project-relationship-persistence.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-18:project-persistence:gate:live'], 'node scripts/module-18/verify-project-relationship-persistence.mjs --mode=live');
  assert.match(projectPersistenceGate, /STAGE_7_ACCEPTED_READY_FOR_STAGE_8/);
  assert.match(projectPersistenceGate, /db:migrations:verify/);
  assert.match(projectPersistenceGate, /repairHoldActive: true/);
  assert.match(projectPersistenceGate, /module6Allowed: false/);
  assert.match(projectPersistenceGate, /Pass 169 - Module 18 Project repository and service security repair/);
});


// Verify Project visibility is enforced inside repositories instead of filtering sensitive rows in React.
test('Pass 169 filters Document and folder reads by trusted nullable Project visibility', () => {
  assert.match(repository, /type ProjectVisibilityRepositoryInput/);
  assert.match(repository, /includeCompanyWide: boolean/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /buildProjectVisibilityWhere/);
  assert.match(repository, /projectId: input\.projectId/);
  assert.match(repository, /projectId: input\.projectId \?\? null/);
  assert.match(repository, /listFolders\(parentId: string \| null, visibility: ProjectVisibilityRepositoryInput\)/);
  assert.match(repository, /\.\.\.buildProjectVisibilityWhere\(input\)/);
});

// Verify Project-scoped Documents use membership plus exact effective permissions, never another Project's role union.
test('Pass 169 enforces exact Project Document permissions in the service', () => {
  assert.match(service, /private async requireProjectPermission/);
  assert.match(service, /findEffectivePermissionCodesForProject\(projectId/);
  assert.match(service, /scope\.kind === 'restricted' && !scope\.projectIds\.includes\(projectId\)/);
  assert.match(service, /'documents\.project\.read'/);
  assert.match(service, /resolveReadVisibility/);
  assert.match(service, /requireUploadIntentPermission/);
  assert.match(service, /const projectId = folder\?\.projectId \?\? input\.projectId \?\? null/);
  assert.match(service, /projectId: document\.projectId/);
  assert.match(service, /projectId: intent\.projectId/);
  assert.match(usersRepository, /projectIds: readonly string\[\] \| null/);
  assert.match(usersRepository, /projectIds === null \? \{\} : \{ scopeId:/);
});

// Keep the live regression focused on Project-A allow, Project-B deny, and trusted Project continuity through signed upload.
test('Pass 169 prepares Project-scoped Fastify regression without new Document routes', () => {
  assert.match(integrationTest, /exact Project document permissions without cross-Project union/);
  assert.match(integrationTest, /PROJECT_FOLDER_A_ID/);
  assert.match(integrationTest, /PROJECT_FOLDER_B_ID/);
  assert.match(integrationTest, /DOCUMENT_SCOPE_FORBIDDEN/);
  assert.match(integrationTest, /storedAIntent\.projectId/);
  assert.match(integrationTest, /storedVersionIntent\.projectId/);
  assert.match(integrationTest, /projectScope/);
  assert.equal((routes.match(/app\.(?:get|post)\('/g) ?? []).length, approvedRoutes.length);
});

// Keep the audit hold active until the HTTP/OpenAPI/React Project selector is completed in Pass 170.
test('Pass 169 has guarded static/live security gates and hands off to Pass 170', () => {
  assert.equal(rootPackage.scripts['module-18:project-security:gate'], 'node scripts/module-18/verify-project-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-18:project-security:gate:live'], 'node scripts/module-18/verify-project-security.mjs --mode=live');
  assert.match(projectSecurityGate, /STAGE_7_ACCEPTED_READY_FOR_STAGE_8/);
  assert.match(projectSecurityGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(projectSecurityGate, /repairHoldActive: true/);
  assert.match(projectSecurityGate, /module6Allowed: false/);
  assert.match(projectSecurityGate, /Pass 170 - Module 18 HTTP, OpenAPI, React and E2E Project completion/);
});


// Expose nullable Project targets and exact Project filters only through already-reviewed Module 18 routes.
test('Pass 170 completes the existing HTTP/OpenAPI Project target and filter contract', () => {
  assert.match(schema, /createUploadIntentBodySchema = z\.object\(\{\s*projectId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /listDocumentFoldersQuerySchema = z\.object\(\{[\s\S]*projectId: uuidSchema\.optional\(\)/);
  assert.match(schema, /createDocumentFolderBodySchema = z\.object\(\{\s*projectId: uuidSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /listDocumentsQuerySchema = z\.object\(\{[\s\S]*projectId: uuidSchema\.optional\(\)/);
  assert.match(routes, /module18CreateUploadIntent[\s\S]*projectId: \{ anyOf:/);
  assert.match(routes, /module18ListDocuments[\s\S]*projectId: \{ type: 'string', format: 'uuid' \}/);
  assert.match(routes, /module18ListDocumentFolders[\s\S]*projectId: \{ type: 'string', format: 'uuid' \}/);
  assert.match(routes, /module18CreateDocumentFolder[\s\S]*projectId: \{ anyOf:/);
  assert.equal((routes.match(/app\.(?:get|post)\('/g) ?? []).length, approvedRoutes.length);
});

// Keep Project target derivation server-side and return exact action capabilities for permission-aware React controls.
test('Pass 170 reauthorizes requested Project scope and returns server-derived Document capabilities', () => {
  assert.match(service, /resolveRequestedReadVisibility/);
  assert.match(service, /input\.projectId[\s\S]*documents\.project\.read/);
  assert.match(service, /input\.projectId !== undefined && input\.projectId !== folder\.projectId/);
  assert.match(service, /input\.projectId !== undefined && input\.projectId !== parent\.projectId/);
  assert.match(service, /resolveDocumentCapabilities/);
  assert.match(service, /canVersion: permissions\?\.includes\('documents\.version'\)/);
  assert.match(service, /canArchive: permissions\?\.includes\('documents\.archive'\)/);
  assert.match(service, /accessibleProjectIds:/);
  assert.match(service, /capabilities,/);
});

// Keep React simple: one Project selector/filter using existing Project/Auth state and the existing Document APIs.
test('Pass 170 completes the Project-aware React Document workflow without a new feature folder', () => {
  assert.match(documentApi, /projectId: string \| null/);
  assert.match(documentApi, /accessibleProjectIds: string\[\] \| null/);
  assert.match(documentApi, /query\.set\('projectId', input\.projectId\)/);
  assert.match(documentApi, /projectId\?: string \| null/);
  assert.match(documentHooks, /listDocumentFolders\(parentId, projectId\)/);
  assert.match(documentBrowser, /Project filter/);
  assert.match(documentBrowser, /Folder Project/);
  assert.match(documentBrowser, /Document Project/);
  assert.match(documentBrowser, /projectId: values\.projectId \|\| null/);
  assert.match(documentDetails, /document\.capabilities\.canVersion/);
  assert.match(documentDetails, /document\.capabilities\.canArchive/);
  assert.match(authHooks, /useDocumentWorkspaceVisibility/);
  assert.match(adminShell, /useDocumentWorkspaceVisibility/);
});

// Prepare API-contract and browser proof for Project-A allow/Project-B deny while keeping the repair hold active.
test('Pass 170 adds guarded OpenAPI and Playwright Project completion regression', () => {
  assert.match(integrationTest, /Pass 170 exposes explicit Project targets, filters and OpenAPI/);
  assert.match(integrationTest, /openapi\.paths\['\/api\/v1\/documents\/upload-intents'\]/);
  assert.match(integrationTest, /PROJECT_B_ID[\s\S]*DOCUMENT_SCOPE_FORBIDDEN/);
  assert.match(browserTest, /Pass 170 browser uses the Project selector/);
  assert.match(browserTest, /PROJECT_EDITOR_EMAIL/);
  assert.match(browserTest, /Document Project/);
  assert.match(browserTest, /Project filter/);
  assert.match(browserTest, /PROJECT_B_DOCUMENT_ID/);
  assert.equal(rootPackage.scripts['module-18:project-completion:gate'], 'node scripts/module-18/verify-project-completion.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-18:project-completion:gate:live'], 'node scripts/module-18/verify-project-completion.mjs --mode=live');
  assert.match(projectCompletionGate, /STAGE_7_ACCEPTED_READY_FOR_STAGE_8/);
  assert.match(projectCompletionGate, /RUN_MODULE_18_E2E_REQUIRED/);
  assert.match(projectCompletionGate, /repairHoldActive: true/);
  assert.match(projectCompletionGate, /module6Allowed: false/);
  assert.match(projectCompletionGate, /Pass 171 - Existing-module UI completion repair/);
});

test('Module 18 database integrity prevents cross-company relationships and mismatched current versions', () => {
  for (const value of [
    'document_folders_parent_company_fkey',
    'documents_folder_company_fkey',
    'documents_owner_company_fkey',
    'documents_current_version_belongs_to_document_fkey',
    'document_upload_intents_actor_company_fkey',
    'document_upload_intents_folder_company_fkey',
    'document_upload_intents_document_company_fkey'
  ]) assert.match(relationshipMigration, new RegExp(value));

  assert.match(prisma, /users_id_company_uq/);
  assert.match(prisma, /document_folders_id_company_uq/);
  assert.match(prisma, /documents_id_company_uq/);
  assert.match(prisma, /document_versions_document_id_id_uq/);
});

test('Module 18 live gate proves the production signed-header contract against disposable S3-compatible storage', () => {
  assert.match(service, /'if-none-match': '\*'/);
  assert.match(integrationTest, /RUN_MODULE_18_S3_TESTS/);
  assert.match(integrationTest, /live acceptance proves signed upload, versioning, download and lifecycle against S3-compatible storage/);
  assert.match(stage2Gate, /MODULE_18_STORAGE_CONFIRM/);
  assert.match(stage2Gate, /USE_CONSTRUCTION_ERP_MODULE_18_TEST_STORAGE/);
  assert.match(stage2Gate, /STORAGE_BUCKET/);
});

test('Module 18 keeps the required React feature and approved frontend stack', async () => {
  for (const relativePath of [
    'api/documents-api.ts',
    'hooks/documents.ts',
    'components/document-browser.tsx',
    'components/document-details-panel.tsx',
    'pages/documents-page.tsx'
  ]) await access(`${frontendDir}/${relativePath}`);

  const hooks = await readFile(`${frontendDir}/hooks/documents.ts`, 'utf8');
  const browser = await readFile(`${frontendDir}/components/document-browser.tsx`, 'utf8');
  assert.match(hooks, /@tanstack\/react-query/);
  assert.match(browser, /react-hook-form/);
  assert.match(browser, /zod/);
});

test('Module 18 folder browser and document links are completed without extra backend files', () => {
  assert.match(service, /async listFolders\(/);
  assert.match(service, /async createFolder\(/);
  assert.match(service, /async linkDocumentToResource\(/);
  assert.match(prisma, /document_links_document_resource_relation_uq/);
  assert.doesNotMatch(documentBrowser, /Folder ID/);
  assert.match(documentBrowser, /Create folder/);
});

test('Module 18 has backend and browser tests for isolation, permissions and the main workflow', () => {
  assert.match(integrationTest, /cross-company/i);
  assert.match(integrationTest, /403/);
  assert.match(integrationTest, /Fastify|inject/);
  assert.match(browserTest, /Upload document/);
  assert.match(browserTest, /Upload next version/);
  assert.match(browserTest, /Archive/);
  assert.match(browserTest, /Restore/);
});

test('Module 18 lifecycle stays non-destructive and Stage 2 acceptance uses consolidated support files', async () => {
  assert.doesNotMatch(service, /\.deleteObject\s*\(/);
  assert.equal(rootPackage.scripts['module-18:gate'], 'node scripts/module-18/verify-stage-2.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-18:gate:live'], 'node scripts/module-18/verify-stage-2.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-18:acceptance:live'], 'node scripts/module-18/run-live-acceptance.mjs');
  assert.doesNotMatch(schema, /MODULE_18_STAGE_2_SCOPE/);
  await access('scripts/module-18/run-live-acceptance.mjs');
});


// Keep the upload completion workflow readable without moving business logic outside the required five-file module.
test('Pass 172 splits Document upload completion into small purpose-specific service helpers', () => {
  for (const helper of [
    'loadAuthorizedUploadIntent',
    'verifyUploadedObject',
    'claimUploadIntentForCompletion',
    'createNextVersionFromIntent',
    'createInitialDocumentFromIntent',
    'recordVersionAdded',
    'completeUploadIntentInTransaction'
  ]) {
    assert.match(service, new RegExp(`private (?:async )?${helper}\\(`), helper);
  }
  const method = service.slice(service.indexOf('async completeUploadIntent('));
  assert.match(method, /loadAuthorizedUploadIntent\(intentId\)/);
  assert.match(method, /verifyUploadedObject\(intent\)/);
  assert.match(method, /completeUploadIntentInTransaction\(tx, intentId, security\.actorUserId\)/);
});
