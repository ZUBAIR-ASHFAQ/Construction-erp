import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx', 'utf8');
const migrationName = '20260909000400_payroll_status_transition_trigger_fix';
const migration = await readFile(`packages/database/prisma/migrations/${migrationName}/migration.sql`, 'utf8');
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

test('Payroll immutability trigger permits non-final status transitions and preserves DELETE semantics', () => {
  assert.match(migration, /IF OLD\."status" = 'FINALIZED'/);
  assert.match(migration, /IF TG_OP = 'DELETE' THEN\s+RETURN OLD;/);
  assert.match(migration, /RETURN NEW;/);
});

test('Payroll status updates are scoped, conditional and return the persisted row', () => {
  assert.match(repository, /UPDATE payroll_runs[\s\S]*company_id = \$\{scope\.companyId\}::uuid[\s\S]*status = \$\{expectedStatus\}[\s\S]*RETURNING id/);
});

test('Pay from account remains visible and is enabled only for finalized Payroll', () => {
  assert.match(workspace, />Pay from account<\/button>/);
  assert.match(workspace, /disabled=\{selectedRun\.data\.status !== 'FINALIZED'\}/);
  assert.match(workspace, /Pay salary from a Cash or Bank account/);
});

test('Payroll trigger repair is locked in migration policy', () => {
  assert.equal(checksums.migrations[migrationName], createHash('sha256').update(migration).digest('hex'));
  assert.ok(gates.gates.some((gate) => gate.migrations?.includes(migrationName)));
});
