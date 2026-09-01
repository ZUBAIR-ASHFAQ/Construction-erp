import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-305-PAYROLL-SOURCE-CONSUMPTION-IDENTITY.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const workforceService = await readFile('apps/api/src/modules/workforce-timesheets/workforce-timesheets.service.ts', 'utf8');
const workforceContract = await readFile('docs/modules/workforce-timesheets/STAGE-19-MODULE-13-CONTRACT.md', 'utf8');
const sourceGapFreeze = await readFile('docs/PASS-303-STAGE-20-SOURCE-GAP-FREEZE.md', 'utf8');
const compensationContract = await readFile('docs/PASS-304-COMPENSATION-LABOR-RATE-AUTHORITY.md', 'utf8');

/** Extract one Prisma model block for focused contract checks. */
function model(name) {
  return prisma.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
}

test('Pass 305 freezes Timesheet Entry and Adjustment as distinct durable source-line identities', () => {
  assert.match(contract, /durable \*\*line identity\*\* is `timesheet_entries\.id`/);
  assert.match(contract, /original worked-time source line -> timesheet_entries\.id/);
  assert.match(contract, /post-approval correction line\s+-> timesheet_adjustments\.id/);
  assert.match(contract, /source kind must distinguish original entries from adjustments/i);
  assert.match(model('TimesheetEntry'), /id\s+String\s+@id/);
  assert.match(model('TimesheetAdjustment'), /id\s+String\s+@id/);
  assert.match(model('TimesheetAdjustment'), /originalEntryId\s+String/);
});

test('Pass 305 keeps only approved Timesheets eligible and preserves server-owned approval authority', () => {
  assert.match(contract, /DRAFT Timesheet\s+-> not Payroll-consumable/);
  assert.match(contract, /PENDING approval Timesheet\s+-> not Payroll-consumable/);
  assert.match(contract, /APPROVED Timesheet\s+-> eligible source state/);
  assert.match(workforceContract, /Approved time is immutable except controlled adjustment/);
  assert.match(workforceService, /TIMESHEET_APPROVED/);
  assert.match(workforceService, /Timesheet adjustments require an APPROVED Timesheet/);
});

test('Pass 305 freezes original-entry selection by Company, approval and work date without inventing Payroll groups', () => {
  assert.match(contract, /same authenticated Company/);
  assert.match(contract, /source Timesheet is approved/);
  assert.match(contract, /entry\.work_date is inside the Payroll Run period \(inclusive\)/);
  assert.match(model('TimesheetEntry'), /workDate\s+DateTime\s+@map\("work_date"\)/);
  assert.match(contract, /does not solve Payroll-group identity/);
  assert.match(sourceGapFreeze, /Payroll-run identity and overlap rule/);
});

test('Pass 305 separates command idempotency from durable at-most-once source consumption', () => {
  assert.match(contract, /command idempotency[\s\S]*durable source-consumption uniqueness/);
  assert.match(contract, /company_id[\s\S]*source_kind[\s\S]*source_line_id/);
  assert.match(contract, /Payroll Run ID must \*\*not\*\* be part of the uniqueness boundary/);
  assert.match(contract, /Use HTTP Idempotency-Key as the only duplicate-consumption protection/);
  assert.match(workforceContract, /One source entry reaches job cost\/payroll at most once/);
});

test('Pass 305 preserves append-only correction identity and does not invent adjustment Payroll policy', () => {
  assert.match(contract, /later Workforce correction must use its distinct `timesheet_adjustments\.id` identity/);
  assert.match(contract, /does not declare every existing adjustment immediately Payroll-consumable/);
  assert.match(contract, /which Payroll period receives a late adjustment/);
  assert.match(contract, /whether adjustment requires separate approval before Payroll/);
  assert.match(model('TimesheetAdjustment'), /adjustmentHours\s+Decimal/);
  assert.match(model('TimesheetAdjustment'), /createdAt\s+DateTime/);
});

test('Pass 305 historically records that Stage-20 persistence could not yet enforce Payroll source uniqueness', () => {
  assert.match(contract, /current project also correctly has not generated those Stage-20 tables yet/);
  assert.match(contract, /at-most-once invariant cannot honestly be implemented/);
  assert.match(contract, /Pass 305 freezes the \*\*required capability and uniqueness semantics\*\*/);
  assert.match(compensationContract, /Payroll calculate\/finalize runtime remains blocked/);
});

test('Pass 305 does not pull Job Cost, Payroll formulas or Finance adapters into the identity pass', () => {
  assert.match(contract, /Job Cost is not pulled into Stage 20/);
  assert.match(contract, /create cost_actuals rows/);
  assert.match(contract, /emit job_cost\.source_posted/);
  assert.match(contract, /choose base pay vs gross pay vs loaded labor cost/);
  assert.match(contract, /Payroll formulas/);
  assert.match(contract, /Finance posting/);
});

test('Pass 305 remains contract-only and hands off run identity and approval lifecycle to Pass 306', () => {
  for (const phrase of [
    'Prisma models',
    'migrations',
    'database tables/relations',
    'repository functions',
    'service functions',
    'Fastify routes',
    'React runtime',
    'permission codes',
    'Payroll persistence',
    'Job-Cost posting',
    'Finance posting',
  ]) assert.ok(contract.includes(phrase), `Missing Pass-305 no-change boundary: ${phrase}`);
  assert.match(contract, /Pass 306 — Payroll Run identity, period-lock and approval-lifecycle contract/);
});
