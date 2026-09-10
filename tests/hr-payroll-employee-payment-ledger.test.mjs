import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('salary payment is linked to a finalized Employee Payroll line and cannot exceed outstanding', async () => {
  const [schema, service, repository] = await Promise.all([
    read('packages/database/prisma/schema.prisma'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts')
  ]);
  assert.match(schema, /model PayrollPayment/);
  assert.match(schema, /payrollLineId\s+String/);
  assert.match(repository, /lockFinalizedPayrollLine/);
  assert.match(repository, /run\.status = 'FINALIZED'/);
  assert.match(service, /paid \+ amount > net/);
  assert.match(service, /PAYROLL_PAYMENT_EXCEEDS_OUTSTANDING/);
});

test('salary settlement posts Payroll Payable against Cash Bank without duplicating Project cost', async () => {
  const service = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
  const createStart = service.indexOf('async createPayrollPayment');
  const reverseStart = service.indexOf('async reversePayrollPayment');
  const createPayment = service.slice(createStart, reverseStart);
  assert.match(createPayment, /sourceType: PAYROLL_PAYMENT_SOURCE_TYPE/);
  assert.match(createPayment, /accountId: accounts\.payable\.id/);
  assert.match(createPayment, /accountId: cashBank\.glAccount\.id/);
  assert.doesNotMatch(createPayment, /upsertPayrollCostActual/);
  assert.doesNotMatch(createPayment, /projectId: line\./);
});

test('salary payment reversal and Employee ledger preserve auditable history', async () => {
  const [routes, service, workspace] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx')
  ]);
  assert.match(routes, /payroll\/payments\/:id\/reverse/);
  assert.match(routes, /payroll\/employees\/:id\/ledger/);
  assert.match(service, /postSourceReversalInTransaction/);
  assert.match(service, /PAYMENT_REVERSAL/);
  assert.match(workspace, /Employee salary payments/);
  assert.match(workspace, /Project-wise Employee Ledger/);
  assert.match(workspace, /Post salary payment/);
});
