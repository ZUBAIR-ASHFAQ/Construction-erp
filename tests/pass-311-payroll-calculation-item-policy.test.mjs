import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-311-PAYROLL-CALCULATION-ITEM-POLICY.md', 'utf8');
const calculationScope = await readFile('docs/PASS-307-PAYROLL-CALCULATION-POLICY.md', 'utf8');
const persistenceContract = await readFile('docs/PASS-308-STAGE-20-PAYROLL-PERSISTENCE-AMENDMENT.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const hrService = await readFile('apps/api/src/modules/hr-payroll/hr-payroll.service.ts', 'utf8');


test('Pass 311 activates only one first-scope generated Payslip item code', () => {
  assert.match(contract, /activates exactly one generated Payslip item code:[\s\S]*REGULAR_HOURS/);
  assert.match(contract, /itemType\s+= EARNING/);
  assert.match(contract, /code\s+= REGULAR_HOURS/);
  assert.match(contract, /No other item code becomes executable in this pass/);
  assert.doesNotMatch(prisma, /REGULAR_HOURS|BASE_SALARY|OVERTIME_HOURS/);
});


test('Pass 311 freezes HOURLY regular-time authority to approved source date and effective rate', () => {
  assert.match(contract, /pay_type = HOURLY/);
  assert.match(contract, /effective compensation row is resolved by the source line's `work_date`/);
  assert.match(contract, /source is not finalized in another Payroll Run/);
  assert.match(contract, /overtime_hours = 0/);
  assert.match(contract, /must not blend different rates into one guessed average rate/);
  assert.match(calculationScope, /approved original Timesheet Entries are the first calculable Workforce source set/i);
});


test('Pass 311 freezes exact decimal line rounding without binary floating point money', () => {
  assert.match(contract, /round HALF_UP to 2 decimal places at the Payslip-item line/);
  assert.match(contract, /never JavaScript binary floating-point money arithmetic/);
  assert.match(contract, /Aggregates then sum the stored two-decimal item amounts exactly/);
  assert.match(persistenceContract, /quantity DECIMAL\(18,4\)/);
  assert.match(persistenceContract, /rate\s+DECIMAL\(18,4\)/);
  assert.match(persistenceContract, /amount\s+DECIMAL\(18,2\)/);
});


test('Pass 311 keeps deductions source-bounded instead of inventing payroll law', () => {
  assert.match(contract, /deduction items = none[\s\S]*deductions\s+= 0\.00[\s\S]*net_pay\s+= gross_pay/);
  assert.match(contract, /not a statutory-payroll claim/);
  assert.match(contract, /browser cannot enter an arbitrary deduction amount/);
  assert.match(calculationScope, /No statutory or tax engine is invented/);
});


test('Pass 311 fails closed for unsupported SALARY and overtime policy', () => {
  assert.match(contract, /SALARY money calculation = unsupported in the first executable profile/);
  assert.match(contract, /salary proration\s+= not performed/);
  assert.match(contract, /SALARY_PERIOD_POLICY_REQUIRED/);
  assert.match(contract, /overtime_hours > 0[\s\S]*OVERTIME_RATE_POLICY_REQUIRED/);
  assert.match(contract, /does not silently pay overtime at 1\.0x, 1\.5x, 2\.0x/);
});


test('Pass 311 freezes exactly five internal blocking reason keys', () => {
  const keys = [
    'MISSING_COMPENSATION_PERIOD',
    'SALARY_PERIOD_POLICY_REQUIRED',
    'OVERTIME_RATE_POLICY_REQUIRED',
    'SOURCE_ALREADY_CONSUMED',
    'SOURCE_INTEGRITY_CONFLICT',
  ];
  for (const key of keys) assert.match(contract, new RegExp(`\\b${key}\\b`));
  assert.match(contract, /freezes exactly five internal `payroll_calculation_exceptions\.reason_key` tokens/);
  assert.match(contract, /they are not five new public HTTP error codes/);
  assert.match(contract, /PAYROLL_HAS_BLOCKING_ERRORS/);
});


test('Pass 311 prevents partial Employee payslips when one Employee has a blocking exception', () => {
  assert.match(contract, /For an Employee with any blocking calculation exception/);
  assert.match(contract, /Payslip for that Employee\s+= not generated/);
  assert.match(contract, /Payslip items for that Employee = not generated/);
  assert.match(contract, /Other Employees without blocking exceptions may have valid DRAFT Payslips/);
  assert.match(contract, /cannot be submitted or finalized while \*\*any\*\* exception row exists/);
});


test('Pass 311 remains documentation-only and leaves runtime for Pass 312+', () => {
  assert.match(contract, /Pass 311 makes exactly zero changes to:[\s\S]*Prisma models[\s\S]*backend production runtime[\s\S]*permission codes/);
  assert.match(contract, /Pass 312 — Stage-20 HR\/Payroll strict Zod\/API schema contract/);
  assert.match(contract, /contract and verification pass only[\s\S]*does not change[\s\S]*services/i);
});
