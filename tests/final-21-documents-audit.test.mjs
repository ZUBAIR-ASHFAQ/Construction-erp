import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const apiFolder = 'apps/api/src/modules/documents-audit';

test('B2 keeps the final five-file Documents & Audit backend module', async () => {
  const files = (await readdir(new URL(`../${apiFolder}/`, import.meta.url))).sort();
  assert.deepEqual(files, [
    'documents-audit.repository.ts',
    'documents-audit.routes.ts',
    'documents-audit.schema.ts',
    'documents-audit.service.ts',
    'index.ts'
  ]);
});

test('B2 exposes the final audit route and removes legacy document command aliases', async () => {
  const routes = await read(`${apiFolder}/documents-audit.routes.ts`);
  assert.match(routes, /app\.get\('\/api\/v1\/audit-logs'/);
  assert.match(routes, /app\.post\('\/api\/v1\/documents\/uploads\/init'/);
  assert.match(routes, /app\.post\('\/api\/v1\/documents\/uploads\/complete'/);
  assert.doesNotMatch(routes, /documents\/upload-intents/);
  assert.doesNotMatch(routes, /documents\/:id\/archive/);
  assert.doesNotMatch(routes, /documents\/:id\/restore/);
});

test('B2 uses final Module 21 permissions and stable errors', async () => {
  const schema = await read(`${apiFolder}/documents-audit.schema.ts`);
  for (const permission of ['documents.read', 'documents.upload', 'documents.link', 'documents.version', 'audit.read', 'audit.export']) {
    assert.match(schema, new RegExp(permission.replace('.', '\\.')));
  }
  for (const error of ['DOCUMENT_NOT_FOUND', 'DOCUMENT_UPLOAD_INVALID', 'DOCUMENT_SCOPE_FORBIDDEN', 'DOCUMENT_LINK_INVALID', 'AUDIT_SCOPE_FORBIDDEN']) {
    assert.match(schema, new RegExp(error));
  }
  assert.doesNotMatch(schema, /documents\.archive/);
  assert.doesNotMatch(schema, /documents\.project\.read/);
});

test('B2 audit persistence has exact Project and Stage dimensions and final resource columns', async () => {
  const prisma = await read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model AuditLog[\s\S]*projectId\s+String\?[\s\S]*stageId\s+String\?/);
  assert.match(prisma, /entityType\s+String\s+@map\("resource_type"\)/);
  assert.match(prisma, /entityId\s+String\s+@map\("resource_id"\)/);
  assert.match(prisma, /beforeValue\s+Json\?\s+@map\("before_json"\)/);
  assert.match(prisma, /afterValue\s+Json\?\s+@map\("after_json"\)/);
  assert.match(prisma, /model DocumentLink[\s\S]*@map\("resource_type"\)[\s\S]*@map\("resource_id"\)/);
  assert.doesNotMatch(prisma.match(/model DocumentLink[\s\S]*?@@map\("document_links"\)/)?.[0] ?? '', /relationType/);
});

test('B2 audit read is company/project scoped and links are same-company authorized', async () => {
  const service = await read(`${apiFolder}/documents-audit.service.ts`);
  const repository = await read(`${apiFolder}/documents-audit.repository.ts`);
  assert.match(service, /hasPermission\('audit\.read'\)/);
  assert.match(service, /scope\.kind === 'restricted'/);
  assert.match(service, /allowedProjectIds/);
  assert.match(repository, /listAuditLogs/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /projectId: \{ in: allowedProjectIds \}/);
  assert.match(service, /findLinkableResource/);
  assert.match(service, /requireProjectPermission/);
});

test('B2 infers trusted audit Project and Stage dimensions without browser ownership fields', async () => {
  const audit = await read('packages/audit/src/record.ts');
  assert.match(audit, /function snapshotUuid/);
  assert.match(audit, /function auditDimension/);
  assert.match(audit, /projectId: auditDimension\(input, 'projectId'\)/);
  assert.match(audit, /stageId: auditDimension\(input, 'stageId'\)/);
});

test('B2 React workspace includes audit search and removes archive actions', async () => {
  const page = await read('apps/web/src/features/documents-audit/pages/documents-page.tsx');
  const details = await read('apps/web/src/features/documents-audit/components/document-details-panel.tsx');
  assert.match(page, /Module 21/);
  assert.match(page, /AuditLogPanel/);
  assert.match(page, /useAuditLogs/);
  assert.doesNotMatch(details, /archiveMutation|restoreMutation|Archive|Restore/);
});

test('B2 uses one forward migration and preserves historical migrations', async () => {
  const migration = await read('packages/database/prisma/migrations/20260829000700_final21_documents_audit_alignment/migration.sql');
  assert.match(migration, /ADD COLUMN "project_id" UUID/);
  assert.match(migration, /ADD COLUMN "stage_id" UUID/);
  assert.match(migration, /RENAME COLUMN "entity_type" TO "resource_type"/);
  assert.match(migration, /DROP COLUMN "relation_type"/);
  assert.match(migration, /'audit\.read'/);
  assert.match(migration, /'audit\.export'/);
});
