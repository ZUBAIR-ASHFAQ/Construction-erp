import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts', 'utf8');
const api = await readFile('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/labour-payroll/hooks/labour-payroll.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migrationPath = 'packages/database/prisma/migrations/20260907000200_payroll_overtime_multiplier/migration.sql';
const migration = await readFile(migrationPath, 'utf8');
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

test('hourly overtime is separated from regular hours and uses an explicit multiplier', () => {
  assert.match(service, /const regularHours = decimal4Units\(row\.hours\)/);
  assert.match(service, /const overtimeHours = decimal4Units\(row\.overtimeHours\)/);
  assert.match(service, /regularAmount = multiplyToCents\(regularHours, rate\)/);
  assert.match(service, /multiplyWithMultiplierToCents\(overtimeHours, rate, decimal4Units\(overtimeMultiplier\)\)/);
  assert.doesNotMatch(service, /const quantity = decimal4Units\(row\.hours\) \+ decimal4Units\(row\.overtimeHours\)/);
});

test('payroll fails closed when hourly overtime exists without an explicit multiplier', () => {
  assert.match(schema, /'OVERTIME_MULTIPLIER_REQUIRED'/);
  assert.match(service, /overtimeHours > 0n && !overtimeMultiplier[\s\S]*OVERTIME_MULTIPLIER_REQUIRED/);
});

test('multiplier is stored on the mutable Payroll Run and reused during finalization', () => {
  assert.match(prisma, /model PayrollRun \{[\s\S]*overtimeMultiplier\s+Decimal\?[\s\S]*@map\("overtime_multiplier"\)/);
  assert.match(repository, /overtime_multiplier AS "overtimeMultiplier"/);
  assert.match(repository, /updatePayrollRunOvertimeMultiplier/);
  assert.match(service, /locked\.overtimeMultiplier/);
  assert.match(service, /calculateDraftLines\(repository, locked\.periodStart, locked\.periodEnd, locked\.overtimeMultiplier\)/);
});

test('calculate API and React workspace carry the multiplier without changing the route shape', () => {
  assert.match(schema, /calculatePayrollRunBodySchema = z\.object\([\s\S]*overtimeMultiplier/);
  assert.match(routes, /CALCULATE_PAYROLL_BODY_JSON_SCHEMA/);
  assert.match(api, /CalculatePayrollRunInput = Readonly<\{ overtimeMultiplier\?: string \}>/);
  assert.match(hooks, /mutationFn: \(input: CalculatePayrollRunInput\) => calculatePayrollRun\(payrollRunId, input\)/);
  assert.match(workspace, /Hourly overtime multiplier/);
  assert.match(workspace, /calculateMutation\.mutate\(overtimeMultiplier \? \{ overtimeMultiplier \} : \{\}\)/);
});

test('forward migration is additive, constrained and locked in the migration manifests', () => {
  assert.match(migration, /ADD COLUMN "overtime_multiplier" DECIMAL\(8,4\)/);
  assert.match(migration, /"overtime_multiplier" >= 1/);
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|ALTER COLUMN/);
  const digest = createHash('sha256').update(migration).digest('hex');
  assert.equal(checksums.migrations['20260907000200_payroll_overtime_multiplier'], digest);
  assert.ok(gates.gates.some((gate) => gate.migrations?.includes('20260907000200_payroll_overtime_multiplier')));
});

test('1.5x example remains exact: 8 regular hours plus 2 overtime hours at 100 equals 1100.00', () => {
  const scale = 10_000n;
  const multiply = (quantity, rate) => ((quantity * rate) + 500_000n) / 1_000_000n;
  const multiplyWithMultiplier = (quantity, rate, multiplier) => ((quantity * rate * multiplier) + 5_000_000_000n) / 10_000_000_000n;
  const regular = multiply(8n * scale, 100n * scale);
  const overtime = multiplyWithMultiplier(2n * scale, 100n * scale, 15_000n);
  assert.equal(regular + overtime, 110_000n);
});
