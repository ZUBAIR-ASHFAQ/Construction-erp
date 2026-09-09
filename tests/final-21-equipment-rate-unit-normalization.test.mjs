import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

/** Confirm legacy rate-unit casing is canonicalized before assignment validation and persistence. */
test('equipment assignment canonicalizes legacy rate units', async () => {
  const service = await read('apps/api/src/modules/equipment/equipment.service.ts');
  const assignment = service.slice(service.indexOf('private async assignEquipmentOnce'), service.indexOf('/** End one active Equipment assignment'));

  assert.match(service, /function normalizeRateUnit\(value: string \| null\)/);
  assert.match(assignment, /const rateUnit = normalizeRateUnit\(equipment\.rateUnit\)/);
  assert.match(assignment, /rateUnit,\s*estimatedAmount:/);
  assert.doesNotMatch(assignment, /rateUnit: equipment\.rateUnit/);
});

/** Confirm API output and the database both enforce the same canonical unit vocabulary. */
test('equipment rate-unit contract and migration agree', async () => {
  const [schema, migration] = await Promise.all([
    read('apps/api/src/modules/equipment/equipment.schema.ts'),
    read('packages/database/prisma/migrations/20260909000100_equipment_rate_unit_normalization/migration.sql')
  ]);

  assert.match(schema, /rateUnit: z\.enum\(\['HOUR', 'DAY', 'MONTH'\]\)\.nullable\(\)/);
  assert.match(migration, /SET "rate_unit" = UPPER\(BTRIM\("rate_unit"\)\)/);
  assert.match(migration, /equipment_rate_unit_valid/);
});
