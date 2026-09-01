import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const numberingTypes = await readFile('packages/numbering/src/types.ts', 'utf8');
const bootstrapNormalize = await readFile('packages/bootstrap/src/normalize.ts', 'utf8');
const storageKey = await readFile('packages/storage/src/key.ts', 'utf8');
const storageIndex = await readFile('packages/storage/src/index.ts', 'utf8');
const documentsService = await readFile('apps/api/src/modules/documents/documents.service.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');

// Verify the final ERP's minimum company-scoped document-number families are explicit.
test('Pass 2.7 requires the final Foundation business sequence families at bootstrap', () => {
  for (const key of ['project', 'purchase-order', 'client-invoice', 'client-receipt', 'supplier-payment']) {
    assert.match(numberingTypes, new RegExp(`'${key}'`));
  }
  assert.match(numberingTypes, /FOUNDATION_REQUIRED_SEQUENCE_KEYS/);
  assert.match(bootstrapNormalize, /assertRequiredNumberSequences/);
  assert.match(bootstrapNormalize, /numberSequences is missing required Foundation keys/);
});

// Verify a corrupted persisted key cannot be signed or inspected across companies.
test('Pass 2.7 revalidates persisted storage keys against authenticated company scope', () => {
  assert.match(storageKey, /export function assertCompanyObjectKey/);
  assert.match(storageKey, /requireRequestSecurityContext/);
  assert.match(storageKey, /key\.startsWith\(`companies\/\$\{companyId\}\//);
  assert.match(storageIndex, /assertCompanyObjectKey/);
  assert.match(documentsService, /assertCompanyObjectKey\(currentVersion\.storageKey\)/);
  assert.match(documentsService, /headObject\(assertCompanyObjectKey\(intent\.storageKey\)\)/);
});

// Verify business persistence keeps only metadata references, never binary file bodies.
test('Pass 2.7 keeps document persistence metadata-only', () => {
  const versionModel = prisma.match(/model\s+DocumentVersion\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(versionModel, /storageKey\s+String/);
  assert.match(versionModel, /checksum\s+String/);
  assert.doesNotMatch(versionModel, /\n\s+\w+\s+Bytes(?:\s|$)|bytea|blob/i);
});
