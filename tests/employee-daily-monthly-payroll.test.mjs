import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('Payroll Run persists an explicit daily or monthly settlement cycle without rewriting legacy history', async () => {
  const [schema, migration] = await Promise.all([
    read('packages/database/prisma/schema.prisma'),
    read('packages/database/prisma/migrations/20260915000100_employee_pay_cycle_payroll/migration.sql')
  ]);
  assert.match(schema, /payCycle\s+String\s+@default\("LEGACY"\)\s+@map\("pay_cycle"\)/);
  assert.match(migration, /ADD COLUMN "pay_cycle" VARCHAR\(16\) NOT NULL DEFAULT 'LEGACY'/);
  assert.match(migration, /'DAILY', 'MONTHLY', 'LEGACY'/);
});

test('daily settlements use one date and monthly payroll uses a complete calendar month', async () => {
  const [schema, service] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts')
  ]);
  assert.match(schema, /payCycle: z\.enum\(\['DAILY', 'MONTHLY'\]\)/);
  assert.match(schema, /Daily settlement must use one work date/);
  assert.match(schema, /Monthly payroll must cover one complete calendar month/);
  assert.match(service, /payCycle === 'DAILY' && payType === 'SALARY'/);
  assert.match(service, /payCycle === 'MONTHLY' && payType !== 'SALARY'/);
});

test('employment end dates constrain attendance and final-month salary eligibility', async () => {
  const [schema, repository, service] = await Promise.all([
    read('packages/database/prisma/schema.prisma'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts')
  ]);
  assert.match(schema, /endDate\s+DateTime\?\s+@map\("employment_end_date"\)/);
  assert.match(repository, /employment_end_date AS "endDate"/);
  assert.match(service, /workDate > employee\.endDate/);
  assert.match(service, /employee\.endDate < periodEnd/);
});

test('the web workflow clearly separates daily-paid workers and monthly employees', async () => {
  const [workspace, employeePage] = await Promise.all([
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx'),
    read('apps/web/src/features/employees/pages/employees-page.tsx')
  ]);
  assert.match(workspace, /Daily-paid workers/);
  assert.match(workspace, /Monthly employees/);
  assert.match(workspace, /'daily settlement'/);
  assert.match(workspace, /'monthly payroll'/);
  assert.match(workspace, /type=\"month\"/);
  assert.match(workspace, /changePayrollMonth/);
  assert.match(workspace, /calendarMonthPeriod/);
  assert.match(employeePage, /Payment basis/);
  assert.match(employeePage, /Employment end date \(optional\)/);
});
