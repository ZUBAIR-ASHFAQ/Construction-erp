import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile(
  'packages/database/prisma/migrations/20260822000100_foundation_company_master/migration.sql',
  'utf8'
);

test('companies is explicitly documented as the canonical future company_id target', () => {
  assert.match(schema, /Every future ERP company_id foreign key must resolve to companies\.id/);
});

test('company names, status and localization fields are mandatory', () => {
  const requiredSql = [
    /"legal_name" VARCHAR\(200\) NOT NULL/,
    /"display_name" VARCHAR\(200\) NOT NULL/,
    /"status" VARCHAR\(32\) NOT NULL/,
    /"base_currency" CHAR\(3\) NOT NULL/,
    /"time_zone" VARCHAR\(100\) NOT NULL/,
    /"locale" VARCHAR\(35\) NOT NULL/,
    /"fiscal_settings" JSONB NOT NULL/,
  ];
  for (const pattern of requiredSql) assert.match(migration, pattern);
});

test('company timestamps are timezone-aware and initialized by PostgreSQL', () => {
  assert.match(migration, /"created_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
  assert.match(migration, /"updated_at" TIMESTAMPTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP/);
});

test('company master does not silently impose unsupported uniqueness rules', () => {
  assert.doesNotMatch(migration, /UNIQUE\s*\("legal_name"\)/i);
  assert.doesNotMatch(migration, /UNIQUE\s*\("display_name"\)/i);
});

test('every Prisma model with companyId has a direct Company relation', () => {
  const modelBlocks = [...schema.matchAll(/^model\s+(\w+)\s*\{\n(.*?)^\}/gms)];
  const missingCompanyRelations = [];

  for (const [, modelName, body] of modelBlocks) {
    if (!/^\s*companyId\s+/m.test(body)) continue;
    if (/^\s*company\s+Company\??\s+@relation\(fields:\s*\[companyId\]/m.test(body)) continue;
    missingCompanyRelations.push(modelName);
  }

  assert.deepEqual(missingCompanyRelations, []);
});

test('company ownership repair adds the missing inventory count line Company foreign key', async () => {
  const repairMigration = await readFile(
    'packages/database/prisma/migrations/20260828000100_foundation_company_ownership_repair/migration.sql',
    'utf8'
  );

  assert.match(
    repairMigration,
    /CONSTRAINT "inventory_count_lines_company_fk"[\s\S]*FOREIGN KEY \("company_id"\) REFERENCES "companies"\("id"\)/
  );
  assert.match(
    schema,
    /model InventoryCountLine \{[\s\S]*company\s+Company\s+@relation\(fields: \[companyId\], references: \[id\]/
  );
});
