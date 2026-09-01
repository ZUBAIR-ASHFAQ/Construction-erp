import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

/** Confirm obsolete permission compatibility code is no longer part of the active runtime. */
test('R5 removes the runtime legacy-permission compatibility catalog', async () => {
  const [schema, service, authentication] = await Promise.all([
    read('apps/api/src/modules/administration/administration.schema.ts'),
    read('apps/api/src/modules/administration/administration.service.ts'),
    read('apps/api/src/plugins/authentication.ts')
  ]);

  for (const source of [schema, service, authentication]) {
    assert.doesNotMatch(source, /REMOVED_FINAL_21_PERMISSION_CODES|isRemovedFinal21PermissionCode|filterActivePermissionCodes/);
  }
});

/** Confirm earlier forward migrations already remove the obsolete permission rows R5 no longer filters. */
test('R5 relies on forward migrations rather than production compatibility filtering', async () => {
  const migrations = await Promise.all([
    read('packages/database/prisma/migrations/20260829000500_final21_safe_legacy_database_cleanup/migration.sql'),
    read('packages/database/prisma/migrations/20260829000600_final21_administration_alignment/migration.sql'),
    read('packages/database/prisma/migrations/20260829000900_final21_vendors_subcontractors_alignment/migration.sql'),
    read('packages/database/prisma/migrations/20260829001200_final21_project_team_assignment/migration.sql'),
    read('packages/database/prisma/migrations/20260829001300_final21_finance_core_alignment/migration.sql'),
    read('packages/database/prisma/migrations/20260829001700_final21_equipment_alignment/migration.sql')
  ]);
  const source = migrations.join('\n');

  for (const code of [
    'opportunities.read',
    'boq.read',
    'wbs.read',
    'schedule.read',
    'changes.read',
    'rfi.read',
    'submittals.read',
    'users.read',
    'subcontracts.read',
    'workforce.read',
    'finance.accounts.read',
    'equipment.usage'
  ]) {
    assert.match(source, new RegExp(code.replace('.', '\\.')));
  }
});

/** Confirm CSS for excluded legacy modules is deleted and no production TSX references those class prefixes. */
test('R5 removes unused legacy module CSS', async () => {
  const styles = await read('apps/web/src/styles.css');
  assert.doesNotMatch(styles, /Module 6 WBS & Cost Codes|Module 21 - Project Scheduling|Module 17 - Change Orders \/ Variations|Module 19 - RFI & Submittals/);
  assert.doesNotMatch(styles, /\.module(?:6|17|19|21)-/);
});

/** Confirm user-facing production copy and package metadata no longer advertise superseded pass labels. */
test('R5 removes stale pass labels from active production metadata and comments', async () => {
  const sources = await Promise.all([
    read('package.json'),
    read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx'),
    read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts'),
    read('apps/api/src/modules/project-stages/project-stages.service.ts'),
    read('packages/database/prisma/schema.prisma')
  ]);

  for (const source of sources) {
    assert.doesNotMatch(source, /\bB(?:7|14|16\.6|16\.9|17\.1)\b|R3 excluded-scope/);
  }
});
