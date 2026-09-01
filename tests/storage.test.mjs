import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const apiPackage = JSON.parse(await readFile('apps/api/package.json', 'utf8'));
const storagePackage = JSON.parse(await readFile('packages/storage/package.json', 'utf8'));
const storageConfig = await readFile('packages/config/src/storage.ts', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const storageKey = await readFile('packages/storage/src/key.ts', 'utf8');
const storageErrors = await readFile('packages/storage/src/errors.ts', 'utf8');
const s3Source = await readFile('packages/storage/src/s3.ts', 'utf8');
const apiStoragePlugin = await readFile('apps/api/src/plugins/storage.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const loggingRedaction = await readFile('packages/logging/src/redaction.ts', 'utf8');
const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');

test('Pass 15 adds the dedicated S3-compatible storage package without a database migration', () => {
  assert.equal(rootPackage.version, '0.38.0');
  assert.equal(storagePackage.version, '0.16.0');
  assert.equal(apiPackage.dependencies['@construction-erp/storage'], 'workspace:*');
  assert.equal(storagePackage.dependencies['@aws-sdk/client-s3'].startsWith('^3.'), true);
  assert.equal(storagePackage.dependencies['@aws-sdk/s3-request-presigner'].startsWith('^3.'), true);
  assert.doesNotMatch(schema, /StorageObject|storage_objects/);
  // Module 18 may now own document_versions; Foundation storage still owns no persistence table.
});

test('server-only storage configuration supports endpoint, region, bucket, credentials, path style and bounded presign TTL', () => {
  for (const marker of [
    'STORAGE_ENDPOINT',
    'STORAGE_REGION',
    'STORAGE_BUCKET',
    'STORAGE_FORCE_PATH_STYLE',
    'STORAGE_ACCESS_KEY_ID',
    'STORAGE_SECRET_ACCESS_KEY',
    'STORAGE_MAX_SIGNED_URL_TTL_SECONDS'
  ]) assert.match(storageConfig, new RegExp(marker));
  assert.match(storageConfig, /min: 30, max: 3600/);
  assert.match(serverConfig, /storage: StorageConfig/);
  assert.match(serverConfig, /loadStorageConfig/);
});

test('credential validation never echoes secret access keys into configuration issues', () => {
  assert.doesNotMatch(storageConfig, /received:\s*secretAccessKey/);
  assert.doesNotMatch(storageConfig, /received:\s*accessKeyId/);
});

test('company object keys derive tenant ownership from trusted request context', () => {
  assert.match(storageKey, /requireRequestSecurityContext/);
  assert.match(storageKey, /security\.companyId/);
  assert.doesNotMatch(storageKey, /companyId:\s*string/);
  assert.match(storageKey, /companies\/\$\{companyId\}/);
  assert.match(storageKey, /UUID_PATTERN/);
  assert.match(storageKey, /NAMESPACE_PATTERN/);
});

test('storage key validation rejects traversal, separators, control characters and oversized keys', () => {
  assert.match(storageKey, /MAX_KEY_BYTES = 1024/);
  assert.equal(storageKey.includes("segment === '..'"), true);
  assert.match(storageKey, /CONTROL_OR_BACKSLASH/);
  assert.match(storageKey, /key\.startsWith\('\/'\)/);
  assert.match(storageKey, /key\.includes\('\/\/'\)/);
});

test('S3 writes are non-overwriting and do not set public ACLs', () => {
  assert.match(s3Source, /PutObjectCommand/);
  assert.match(s3Source, /IfNoneMatch: '\*'/);
  assert.doesNotMatch(s3Source, /ACL:/);
  assert.doesNotMatch(s3Source, /public-read/);
});

test('Foundation exposes low-level signed upload/download primitives with bounded TTL', () => {
  assert.match(s3Source, /createSignedUploadUrl/);
  assert.match(s3Source, /createSignedDownloadUrl/);
  assert.match(s3Source, /getSignedUrl/);
  assert.match(s3Source, /ttl < 30/);
  assert.match(s3Source, /ttl > this\.#maxSignedUrlTtlSeconds/);
});

test('storage health does not expose provider exception details', () => {
  assert.match(s3Source, /HeadBucketCommand/);
  assert.match(s3Source, /status: 'error'/);
  assert.match(s3Source, /code: 'STORAGE_UNAVAILABLE'/);
  assert.doesNotMatch(s3Source, /error\.message/);
  assert.doesNotMatch(s3Source, /error\.stack/);
});

test('storage failures map to stable application errors', () => {
  for (const code of [
    'INVALID_STORAGE_KEY',
    'STORAGE_OBJECT_NOT_FOUND',
    'STORAGE_OBJECT_ALREADY_EXISTS',
    'STORAGE_UNAVAILABLE',
    'STORAGE_OPERATION_FAILED'
  ]) assert.match(storageErrors, new RegExp(code));
  assert.match(s3Source, /mapS3Error/);
});

test('Fastify owns storage lifecycle without probing transient connectivity at startup', () => {
  assert.match(apiStoragePlugin, /app\.decorate\('objectStorage'/);
  assert.match(apiStoragePlugin, /onClose/);
  assert.match(apiStoragePlugin, /storage\.close\(\)/);
  const pluginBody = apiStoragePlugin.slice(apiStoragePlugin.indexOf('export async function registerObjectStorage'));
  assert.doesNotMatch(pluginBody, /checkHealth\(\)/);
  assert.match(apiMain, /createS3ObjectStorage\(config\.storage\)/);
});

test('structured logs redact object-storage credentials', () => {
  for (const marker of [
    'secretaccesskey',
    'accesskeyid',
    'config.storage.accessKeyId',
    'config.storage.secretAccessKey',
    'STORAGE_SECRET_ACCESS_KEY'
  ]) assert.match(loggingRedaction, new RegExp(marker.replaceAll('.', '\\.')));
});
