import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** Keep the historical Stage-11 test entrypoint green only by proving Final-21 B9 supersedes its old Finance contract. */
test('historical Module 15A static entrypoint is superseded by Final-21 B9 Finance Core', () => {
  const schema = read('apps/api/src/modules/finance/finance.schema.ts');
  const b9 = read('tests/final-21-finance-b9.test.mjs');
  assert.match(schema, /FINANCE_HTTP_ROUTES/);
  assert.match(schema, /finance\.journals\.reverse/);
  assert.match(schema, /\/api\/v1\/finance\/cash-bank/);
  assert.match(b9, /Final Module 18/);
  assert.doesNotMatch(schema, /MODULE_15A_HTTP_ROUTES|MODULE_15A_PERMISSION_CODES/);
});

/** Preserve immutable historical migration evidence while requiring the new forward B9 migration. */
test('historical Module 15A migration remains preserved and B9 adds a forward Finance alignment migration', () => {
  const historical = read('packages/database/prisma/migrations/20260824000100_module_15a_finance_core/migration.sql');
  const forward = read('packages/database/prisma/migrations/20260829001300_final21_finance_core_alignment/migration.sql');
  assert.match(historical, /CREATE TABLE "gl_accounts"/);
  assert.match(forward, /CREATE TABLE "cash_bank_accounts"/);
  assert.match(forward, /DROP COLUMN IF EXISTS "cost_structure_id"/);
});
