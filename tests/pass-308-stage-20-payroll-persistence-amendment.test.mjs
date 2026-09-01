import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-308-STAGE-20-PAYROLL-PERSISTENCE-AMENDMENT.md', 'utf8');
const compensationContract = await readFile('docs/PASS-304-COMPENSATION-LABOR-RATE-AUTHORITY.md', 'utf8');
const sourceContract = await readFile('docs/PASS-305-PAYROLL-SOURCE-CONSUMPTION-IDENTITY.md', 'utf8');
const lifecycleContract = await readFile('docs/PASS-306-PAYROLL-RUN-LIFECYCLE.md', 'utf8');
const calculationContract = await readFile('docs/PASS-307-PAYROLL-CALCULATION-POLICY.md', 'utf8');
test('Pass 308 freezes exactly three supporting Payroll persistence amendments', () => {
  assert.match(contract, /employee_compensation_periods\s+amendment: effective-dated pay authority/);
  assert.match(contract, /payroll_calculation_exceptions\s+amendment: durable blocking calculation evidence/);
  assert.match(contract, /payroll_source_consumptions\s+amendment: calculated Workforce source membership \+ final consumption/);
  assert.match(contract, /No compensation-component master, payroll-group table, tax table, Shift table, leave-balance table/);
});

test('Pass 308 freezes explicit effective-dated SALARY and HOURLY compensation without unsafe backfill', () => {
  assert.match(contract, /New table: `employee_compensation_periods`/);
  assert.match(contract, /SALARY[\s\S]*HOURLY/);
  assert.match(contract, /effective_from[\s\S]*effective_to/);
  assert.match(contract, /authoritative compensation periods must not overlap/);
  assert.match(contract, /No automatic migration\/backfill may infer a compensation period/);
  assert.match(compensationContract, /Effective-date selection is mandatory before calculation/);
});

test('Pass 308 keeps source-defined Payroll Run, Payslip and Payslip Item shapes narrow', () => {
  assert.match(contract, /Source table: `payroll_runs`/);
  assert.match(contract, /calculated_at TIMESTAMPTZ nullable/);
  assert.match(contract, /one Payslip per Payroll Run \+ Employee/);
  assert.match(contract, /EARNING[\s\S]*DEDUCTION/);
  assert.match(contract, /quantity DECIMAL\(18,4\)/);
  assert.match(contract, /amount\s+DECIMAL\(18,2\)/);
  assert.match(contract, /file_id.*ambiguous between Document and Document Version/);
});

test('Pass 308 persists blocking exceptions without browser resolution or salary leakage', () => {
  assert.match(contract, /New table: `payroll_calculation_exceptions`/);
  assert.match(contract, /Every row in this table is blocking/);
  assert.match(contract, /separate `is_blocking`, `resolved`, `resolved_by` or browser-owned override field is unnecessary/);
  assert.match(contract, /submit and finalize fail while any exception row exists/);
  assert.match(contract, /must not leak salary\/rate values/);
  assert.match(calculationContract, /Blocking exceptions need durable server-owned persistence/);
});

test('Pass 308 freezes direct Timesheet Entry source membership and partial finalized uniqueness', () => {
  assert.match(contract, /New table: `payroll_source_consumptions`/);
  assert.match(contract, /timesheet_entry_id UUID -> timesheet_entries\.id/);
  assert.match(contract, /UNIQUE \(payroll_run_id, timesheet_entry_id\)/);
  assert.match(contract, /UNIQUE \(company_id, timesheet_entry_id\)[\s\S]*WHERE consumed_at IS NOT NULL/);
  assert.match(contract, /durable source-membership snapshot/);
  assert.match(contract, /uses a direct UUID FK/);
  assert.match(sourceContract, /company_id[\s\S]*source_kind[\s\S]*source_line_id/);
});

test('Pass 308 preserves the DRAFT calculate, approval freeze and finalization transaction boundaries', () => {
  assert.match(contract, /DRAFT recalculation may transactionally replace the run's unconsumed source rows/);
  assert.match(contract, /When the run leaves DRAFT, its source-membership rows are frozen/);
  assert.match(contract, /Finalization must, in one business transaction/);
  assert.match(contract, /If any unique-source or validation step fails, the finalization transaction rolls back/);
  assert.match(lifecycleContract, /DRAFT[\s\S]*PENDING_APPROVAL[\s\S]*APPROVED[\s\S]*FINALIZED/);
});

test('Pass 308 avoids duplicate approval, Payroll-group and future-adjustment abstractions', () => {
  assert.match(contract, /does not add `approval_request_id` to `payroll_runs`/);
  assert.match(contract, /does not add a generic source-kind polymorphic column/);
  assert.match(contract, /Do not create a payroll_groups table/);
  assert.match(contract, /Timesheet Adjustments remain a future direct-FK extension/);
});

test('Pass 308 historically records a contract-only boundary before Pass 309 persistence', () => {
  assert.match(contract, /No migration is created in Pass 308 itself/);
  assert.match(contract, /Pass 309 — Stage-20 Payroll persistence implementation/);
  assert.match(contract, /Pass 308 makes exactly zero changes to:[\s\S]*Prisma models[\s\S]*migrations/);
});
