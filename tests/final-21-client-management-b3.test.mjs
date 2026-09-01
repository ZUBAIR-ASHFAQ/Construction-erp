import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile('packages/database/prisma/migrations/20260829000800_final21_client_management_alignment/migration.sql', 'utf8');
const indexSource = await readFile('apps/api/src/modules/clients/index.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/clients/clients.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/clients/clients.service.ts', 'utf8');

/** Confirm B3 uses a forward-only migration and final Client Management naming. */
test('B3 adds a forward migration for nullable final Client master fields', () => {
  assert.match(migration, /ALTER COLUMN "credit_terms_days" DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN "title" DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN "email" DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN "phone" DROP NOT NULL/);
  assert.match(migration, /DROP CONSTRAINT IF EXISTS "client_contacts_client_id_fkey"/);
});

/** Confirm final Client exports no longer expose the obsolete Module-2 warning/archive contract. */
test('B3 removes obsolete warning and archive exports from Client Management', () => {
  assert.doesNotMatch(indexSource, /MODULE_2_WARNING|archiveClientBodySchema|Module2Warning/);
  assert.doesNotMatch(schema, /DUPLICATE_PRIMARY_CONTACT|archiveClientBodySchema/);
});

/** Confirm status changes are explicit events without introducing a second lifecycle endpoint. */
test('B3 handles Client archive/reactivation through PATCH and status_changed events', () => {
  assert.match(schema, /'client\.status_changed'/);
  assert.match(service, /const statusChanged = before\.status !== updated\.status/);
  assert.match(service, /eventType: action/);
});
