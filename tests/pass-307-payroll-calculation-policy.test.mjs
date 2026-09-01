import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-307-PAYROLL-CALCULATION-POLICY.md', 'utf8');
const compensationContract = await readFile('docs/PASS-304-COMPENSATION-LABOR-RATE-AUTHORITY.md', 'utf8');
const sourceContract = await readFile('docs/PASS-305-PAYROLL-SOURCE-CONSUMPTION-IDENTITY.md', 'utf8');
const lifecycleContract = await readFile('docs/PASS-306-PAYROLL-RUN-LIFECYCLE.md', 'utf8');
const workforceSchema = await readFile('apps/api/src/modules/workforce-timesheets/workforce-timesheets.schema.ts', 'utf8');

test('Pass 307 keeps Payroll calculation server-owned and freezes exact aggregate arithmetic only', () => {
  assert.match(contract, /Payroll calculation remains entirely server-owned/);
  assert.match(contract, /gross_total\s+= exact sum of earning item amounts/);
  assert.match(contract, /deduction_total = exact sum of deduction item amounts/);
  assert.match(contract, /net_total\s+= gross_total - deduction_total/);
  assert.match(contract, /No binary floating-point money arithmetic is allowed/);
  assert.match(compensationContract, /Payroll calculation remains server-owned/);
});

test('Pass 307 does not invent statutory formulas, compensation inference or browser overrides', () => {
  assert.match(contract, /No statutory or tax engine is invented/);
  assert.match(contract, /Calculation overrides are out of the first Stage-20 scope/);
  assert.match(contract, /does \*\*not\*\* allow the browser to manually override calculated Payroll money/);
  assert.match(contract, /missing explicit pay type/);
  assert.match(contract, /missing effective-dated compensation/);
  assert.match(contract, /unsupported overtime pay rule when overtime exists/);
});

test('Pass 307 explicitly excludes leave effects from the first Payroll scope', () => {
  assert.match(contract, /leave effect on Payroll = disabled \/ not included/);
  assert.match(contract, /PENDING leave requests are never Payroll authority/);
  assert.match(contract, /No leave balance or accrual calculation is invented/);
  assert.match(contract, /If leave is later enabled in Payroll policy/);
});

test('Pass 307 narrows Shift and hour-limit behavior instead of inventing missing policy', () => {
  assert.match(contract, /Shift is not a Stage-20 Payroll dimension/);
  assert.match(contract, /Payroll does not group, price or validate by Shift/);
  assert.match(contract, /configured daily\/period numeric hour cap = absent/);
  for (const guessedLimit of ['8 hours', '12 hours', '16 hours', '24 hours', '40 hours', '48 hours']) {
    assert.ok(contract.includes(guessedLimit.split(' ')[0]), 'Contract should explicitly list prohibited guessed limits');
  }
  assert.doesNotMatch(workforceSchema, /shiftId|shift_id/);
});

test('Pass 307 keeps the first calculable Workforce source set to approved original entries', () => {
  assert.match(contract, /Approved original Timesheet Entries are the first calculable Workforce source set/);
  assert.match(contract, /Timesheet status is APPROVED/);
  assert.match(contract, /entry work_date is inside the Payroll Run inclusive period/);
  assert.match(contract, /Post-approval Timesheet Adjustments remain excluded/);
  assert.match(sourceContract, /original source line = `timesheet_entries\.id`/);
});

test('Pass 307 requires durable blocking-exception evidence before Payroll submit runtime', () => {
  assert.match(contract, /Blocking exceptions need durable server-owned persistence before submit can be implemented/);
  assert.match(contract, /what source\/configuration condition caused it/);
  assert.match(contract, /browser-editable resolution flag/);
  assert.match(lifecycleContract, /all blocking calculation exceptions are resolved/);
});

test('Pass 307 preserves the lifecycle freeze and forbids recalculation after submission', () => {
  assert.match(contract, /Recalculation replaces only a DRAFT calculation snapshot/);
  assert.match(contract, /never mutate a `PENDING_APPROVAL`, `APPROVED` or `FINALIZED` calculation snapshot/);
  assert.match(contract, /Finalization cannot bypass unresolved calculation blockers/);
  assert.match(lifecycleContract, /DRAFT[\s\S]*PENDING_APPROVAL[\s\S]*APPROVED[\s\S]*FINALIZED/);
});

test('Pass 307 historically remains contract-only and does not start Payroll runtime or Finance/Job-Cost posting', () => {
  for (const phrase of [
    'Prisma models',
    'migrations',
    'repository functions',
    'service functions',
    'Fastify routes',
    'React runtime',
    'permission codes',
    'Payroll persistence',
    'Job-Cost posting',
    'Finance posting',
  ]) assert.ok(contract.includes(phrase), `Missing Pass-307 no-change boundary: ${phrase}`);
  assert.match(contract, /Pass 308 — Stage-20 Payroll persistence amendment contract/);
});
