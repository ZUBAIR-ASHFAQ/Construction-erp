import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile('apps/api/src/modules/documents/documents.routes.ts', 'utf8');
const boundary = await readFile('apps/api/src/modules/documents/documents.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/documents/documents.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/documents/documents.service.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260828000700_documents_secure_links/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));

/** Verify final Module 21 link and unlink routes are exposed as controlled commands. */
test('Pass 3.7 exposes final document link and unlink routes', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/documents\/:id\/links'/);
  assert.match(routes, /app\.delete\('\/api\/v1\/documents\/:id\/links\/:linkId'/);
  assert.match(routes, /createDocumentLinkBodySchema/);
  assert.match(routes, /unlinkDocumentFromResource\(params\.id, params\.linkId\)/);
});

/** Verify callers can link only resource types that the current ERP can validate safely. */
test('Pass 3.7 uses a strict current-resource allow-list', () => {
  const resourceTypes = boundary.match(/DOCUMENT_LINK_RESOURCE_TYPES = Object\.freeze\(\[[\s\S]*?\] as const\)/)?.[0] ?? '';
  assert.match(resourceTypes, /'project'/);
  assert.match(resourceTypes, /'employee'/);
  assert.match(resourceTypes, /'client_invoice'/);
  assert.doesNotMatch(resourceTypes, /stage|client_receipt|supplier_invoice|site_record/);
  const linkBody = boundary.match(/createDocumentLinkBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(linkBody, /resourceType: z\.enum\(DOCUMENT_LINK_RESOURCE_TYPES\)/);
  assert.doesNotMatch(linkBody, /companyId|projectId|stageId|createdBy|relationType/);
});

/** Verify document-link ownership and version pinning are persisted explicitly. */
test('Pass 3.7 aligns DocumentLink ownership fields in Prisma', () => {
  const model = prisma.match(/model DocumentLink \{[\s\S]*?\n\}/)?.[0] ?? '';
  for (const field of ['companyId', 'documentId', 'versionId', 'projectId', 'stageId', 'createdBy']) {
    assert.match(model, new RegExp(`\\b${field}\\b`));
  }
  assert.match(model, /document Document\s+@relation\(fields: \[documentId, companyId\]/);
  assert.match(model, /version\s+DocumentVersion\?\s+@relation\(fields: \[documentId, versionId\]/);
  assert.match(model, /creator\s+User\s+@relation\("DocumentLinkCreator"/);
});

/** Verify the repository resolves supported targets through same-company queries only. */
test('Pass 3.7 repository validates current linkable resources inside company scope', () => {
  const method = repository.match(/async findLinkableResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /requireCompanyRepositoryScope\(\)/);
  assert.match(method, /this\.db\.project\.findFirst/);
  assert.match(method, /this\.db\.employee\.findFirst/);
  assert.match(method, /this\.db\.clientInvoice\.findFirst/);
  assert.match(method, /scope\.where\(\{ id: resourceId \}\)/);
});

/** Verify service authorization prevents arbitrary and cross-project links. */
test('Pass 3.7 service checks link permission, target permission and project consistency', () => {
  const method = service.match(/async linkDocumentToResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /DOCUMENT_LINK_RESOURCE_TYPES\.includes\(resourceType\)/);
  assert.match(method, /'documents\.link'/);
  assert.match(method, /resourceType === 'employee'.*employees\.read/s);
  assert.match(method, /resourceType === 'client_invoice'.*client_invoices\.read/s);
  assert.match(method, /document\.projectId !== resource\.projectId/);
  assert.match(method, /findDocumentVersion\(document\.id, versionId\)/);
  assert.match(method, /createdBy: security\.actorUserId/);
});

/** Verify link and unlink changes are both traceable without deleting document history. */
test('Pass 3.7 audits and emits link lifecycle events while unlink deletes only the association', () => {
  assert.match(boundary, /'document\.linked'/);
  assert.match(boundary, /'document\.unlinked'/);
  assert.match(service, /action: 'document\.linked'/);
  assert.match(service, /eventType: 'document\.linked'/);
  assert.match(service, /action: 'document\.unlinked'/);
  assert.match(service, /eventType: 'document\.unlinked'/);
  const deleteMethod = repository.match(/async deleteDocumentLink[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(deleteMethod, /this\.db\.documentLink\.deleteMany/);
  assert.doesNotMatch(deleteMethod, /document\.delete|documentVersion\.delete/);
});

/** Verify secure downloads still rely on authorization plus signed object-storage access. */
test('Pass 3.7 keeps document downloads authorized and signed', () => {
  const method = service.match(/async createDownloadUrl[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /requireDocumentPermission/);
  assert.match(method, /assertCompanyObjectKey/);
  assert.match(method, /createSignedDownloadUrl/);
  assert.doesNotMatch(method, /publicUrl|permanentUrl/);
});

/** Verify the forward secure-link migration is gated and checksum locked. */
test('Pass 3.7 migration is registered and checksum locked', () => {
  assert.match(migration, /ADD COLUMN "company_id" UUID/);
  assert.match(migration, /document_links_document_company_fkey/);
  assert.match(migration, /document_links_version_document_fkey/);
  assert.match(migration, /document_links_project_company_fkey/);
  assert.match(migration, /document_links_creator_company_fkey/);
  assert.match(migration, /'documents\.link'/);
  const gate = migrationGates.gates.find((item) => item.gate === 'refactor-stage-3-pass-3-7-documents-secure-links');
  assert.equal(gate?.stage, 26);
  assert.deepEqual(gate?.migrations, ['20260828000700_documents_secure_links']);
  assert.match(migrationChecksums.migrations['20260828000700_documents_secure_links'] ?? '', /^[a-f0-9]{64}$/);
});
