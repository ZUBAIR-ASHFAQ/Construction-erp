import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routes = await readFile('apps/api/src/modules/documents/documents.routes.ts', 'utf8');
const boundary = await readFile('apps/api/src/modules/documents/documents.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/documents/documents.service.ts', 'utf8');
const storageTypes = await readFile('packages/storage/src/types.ts', 'utf8');
const storageS3 = await readFile('packages/storage/src/s3.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260828000600_documents_immutable_versions/migration.sql', 'utf8');
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const migrationChecksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const webApi = await readFile('apps/web/src/features/documents/api/documents-api.ts', 'utf8');

/** Verify the final Module 21 upload route names exist without removing legacy compatibility. */
test('Pass 3.6 exposes final signed-upload initialization and completion routes', () => {
  assert.match(routes, /url: '\/api\/v1\/documents\/uploads\/init'/);
  assert.match(routes, /url: '\/api\/v1\/documents\/uploads\/complete'/);
  assert.match(routes, /app\.post\('\/api\/v1\/documents\/upload-intents'/);
  assert.match(routes, /app\.post\('\/api\/v1\/documents\/upload-intents\/:id\/complete'/);
});

/** Verify upload completion accepts only the server-owned intent identifier plus trusted headers. */
test('Pass 3.6 final completion body accepts only uploadIntentId', () => {
  const schema = boundary.match(/completeDocumentUploadBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(schema, /uploadIntentId: uuidSchema/);
  assert.doesNotMatch(schema, /companyId|actorUserId|storageKey|checksum|mimeType|sizeBytes/);
  assert.match(routes, /readIdempotencyKey\(request\)/);
});

/** Verify completion checks storage key, size, MIME type and SHA-256 checksum before persistence. */
test('Pass 3.6 verifies uploaded object metadata including checksum', () => {
  const method = service.match(/private async verifyUploadedObject[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /assertCompanyObjectKey\(intent\.storageKey\)/);
  assert.match(method, /uploadedObject\.sizeBytes/);
  assert.match(method, /uploadedObject\.contentType/);
  assert.match(method, /uploadedObject\.checksumSha256 !== intent\.checksum/);
});

/** Verify the storage adapter requests and exposes provider SHA-256 checksums. */
test('Pass 3.6 storage HEAD enables checksum metadata', () => {
  assert.match(storageTypes, /checksumSha256: string \| null/);
  assert.match(storageS3, /HeadObjectCommand\(\{[\s\S]*?ChecksumMode: 'ENABLED'/);
  assert.match(storageS3, /checksumSha256: result\.ChecksumSHA256 \?\? null/);
});

/** Verify document version immutability is enforced by PostgreSQL, not only application code. */
test('Pass 3.6 makes document_versions database-enforced immutable', () => {
  assert.match(migration, /CREATE FUNCTION "prevent_document_version_mutation"/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "document_versions"/);
  assert.match(migration, /document_versions are immutable/);
});


/** Verify the React client uses the final upload route names instead of the legacy aliases. */
test('Pass 3.6 React upload client uses the final signed-upload routes', () => {
  assert.match(webApi, /'documents\/uploads\/init'/);
  assert.match(webApi, /'documents\/uploads\/complete'/);
  assert.match(webApi, /JSON\.stringify\(\{ uploadIntentId: intentId \}\)/);
  assert.doesNotMatch(webApi, /documents\/upload-intents/);
});

/** Verify the new forward migration is gated and checksum locked. */
test('Pass 3.6 migration is registered and checksum locked', () => {
  const gate = migrationGates.gates.find((item) => item.gate === 'refactor-stage-3-pass-3-6-documents-immutable-versions');
  assert.equal(gate?.stage, 26);
  assert.deepEqual(gate?.migrations, ['20260828000600_documents_immutable_versions']);
  assert.match(migrationChecksums.migrations['20260828000600_documents_immutable_versions'] ?? '', /^[a-f0-9]{64}$/);
});
