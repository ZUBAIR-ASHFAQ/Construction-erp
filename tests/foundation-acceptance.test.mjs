import assert from 'node:assert/strict';
import test from 'node:test';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFoundationSurfaces = [
  'packages/database/prisma/schema.prisma',
  'packages/request-context/src/index.ts',
  'packages/tenant-scope/src/index.ts',
  'packages/errors/src/index.ts',
  'packages/logging/src/index.ts',
  'packages/audit/src/index.ts',
  'packages/outbox/src/index.ts',
  'packages/idempotency/src/index.ts',
  'packages/numbering/src/index.ts',
  'packages/storage/src/index.ts',
  'packages/queue/src/index.ts',
  'packages/contracts/src/index.ts',
  'packages/bootstrap/src/index.ts',
  'packages/testing/src/index.ts',
  'packages/operations/src/index.ts'
];

test('Foundation acceptance surface through Pass 19 is present', async () => {
  await Promise.all(requiredFoundationSurfaces.map((relative) => access(path.join(root, relative))));
});

test('Foundation Stage-0 ownership remains stable after later Project generation', async () => {
  const schema = await readFile(path.join(root, 'packages/database/prisma/schema.prisma'), 'utf8');
  for (const model of ['Company', 'AuditLog', 'OutboxEvent', 'IdempotencyRecord', 'NumberSequence', 'QueueJob', 'CompanyConfiguration', 'InitialBootstrapRun']) {
    assert.match(schema, new RegExp(`model\\s+${model}\\s*\\{`));
  }
  assert.match(schema, /model\s+User\s*\{/);
  assert.match(schema, /model\s+Project\s*\{/);
  assert.match(schema, /projectScope\s+Json\s+@map\("project_scope"\)/);
});

test('Foundation integration contracts remain defined before business modules', async () => {
  const contracts = await readFile(path.join(root, 'packages/contracts/src/index.ts'), 'utf8');
  for (const symbol of ['createStableSourceKey', 'createResourceReference', 'createDocumentReference', 'createFinancialPostingCommand']) {
    assert.match(contracts, new RegExp(symbol));
  }
});
