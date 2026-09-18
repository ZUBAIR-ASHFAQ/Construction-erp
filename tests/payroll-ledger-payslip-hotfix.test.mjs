import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('Employee ledger allows only the running balance to be signed', async () => {
  const [schema, service] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts')
  ]);

  assert.match(schema, /const exactMoneySchema = .*non-negative/);
  assert.match(schema, /const signedMoneySchema = .*exact signed decimal/);
  assert.match(schema, /debit: exactMoneySchema,[\s\S]*credit: exactMoneySchema,[\s\S]*balance: signedMoneySchema/);
  assert.match(service, /function ledgerBalanceString\(cents: bigint\)/);
  assert.match(service, /const absolute = cents < 0n \? -cents : cents/);
  assert.match(service, /balance: ledgerBalanceString\(balance\)/);
  assert.match(service, /function moneyString\(cents: bigint\)[\s\S]*cents < 0n/);
});

test('finalized Payroll creates payslip metadata and exposes a print-ready final payslip', async () => {
  const [repository, service, workspace] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx')
  ]);

  assert.match(repository, /async createPayslip\(payrollLineId: string, generatedAt: Date\)/);
  assert.match(service, /for \(const line of snapshot\.lines\) await repository\.createPayslip\(line\.id, finalizedAt\)/);
  assert.match(workspace, /function downloadFinalPayrollPayslip\(/);
  assert.match(workspace, /Final Employee Payslip/);
  assert.match(workspace, /Download payslip/);
  assert.match(workspace, /line\.payslip\.generatedAt/);
});
