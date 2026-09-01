import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-310-COMPENSATION-AUTHORIZATION.md', 'utf8');
const persistenceContract = await readFile('docs/PASS-308-STAGE-20-PAYROLL-PERSISTENCE-AMENDMENT.md', 'utf8');
const hrSchema = await readFile('apps/api/src/modules/hr-payroll/hr-payroll.schema.ts', 'utf8');
const hrService = await readFile('apps/api/src/modules/hr-payroll/hr-payroll.service.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');


test('Pass 310 reuses existing permissions and does not invent a salary permission', () => {
  assert.match(contract, /Public compensation-history read\s+employees\.manage/);
  assert.match(contract, /Public compensation-history write\s+employees\.manage/);
  assert.match(contract, /Internal Payroll calculation lookup\s+payroll\.calculate/);
  assert.match(contract, /No new permission code is added/);
  assert.doesNotMatch(contract, /permission code is added[\s\S]*salary\.read/);
  assert.doesNotMatch(hrSchema, /salary\.read|compensation\.read|compensation\.manage/);
});


test('Pass 310 keeps ordinary Employee reads compensation-safe', () => {
  assert.match(contract, /`employees\.read` alone must never expose `base_salary`, `hourly_rate`/);
  assert.match(contract, /compensation-history GET route requires:[\s\S]*employees\.manage/);
  assert.match(hrService, /keeping compensation outside ordinary Employee read authority/);
});


test('Pass 310 freezes exactly two explicit compensation maintenance route amendments', () => {
  assert.match(contract, /GET\s+\/api\/v1\/hr\/employees\/:id\/compensation-periods/);
  assert.match(contract, /POST \/api\/v1\/hr\/employees\/:id\/compensation-periods/);
  assert.match(contract, /No generic compensation CRUD is added/);
  assert.match(contract, /PATCH compensation period[\s\S]*DELETE compensation period[\s\S]*PUT replace compensation history/);
});


test('Pass 310 keeps compensation write input narrow and exact-decimal', () => {
  for (const field of ['payType', 'baseSalary', 'hourlyRate', 'effectiveFrom']) {
    assert.match(contract, new RegExp(`\\b${field}\\b`));
  }
  assert.match(contract, /`effectiveTo` is server-owned/);
  assert.match(contract, /SALARY -> baseSalary required, hourlyRate absent/);
  assert.match(contract, /HOURLY -> hourlyRate required, baseSalary absent/);
  assert.match(contract, /exact decimal strings/);
  assert.match(contract, /Idempotency-Key/);
});


test('Pass 310 freezes append-only effective-date maintenance without destructive history edits', () => {
  assert.match(contract, /locks the Employee row inside the write transaction/);
  assert.match(contract, /strictly later.*latest period's `effectiveFrom`/);
  assert.match(contract, /closes the previous latest period to the calendar day immediately before/);
  assert.match(contract, /new row is inserted with `effectiveTo = null`/);
  assert.match(contract, /never deleted or rewritten except for closing the immediately previous open\/latest range/);
  assert.match(contract, /Database non-overlap checks remain the final race-safety boundary/);
});


test('Pass 310 separates legacy Employee fields from authoritative Payroll compensation history', () => {
  assert.match(contract, /employees\.base_salary \/ employees\.hourly_rate[\s\S]*current\/profile compensation inputs only/);
  assert.match(contract, /employee_compensation_periods[\s\S]*authoritative historical Payroll compensation source/);
  assert.match(contract, /blocking calculation exception when no applicable compensation period exists/);
  assert.match(persistenceContract, /Existing Employee fields are retained but stop being historical Payroll authority/);
  assert.match(prisma, /model EmployeeCompensationPeriod/);
});


test('Pass 310 separates internal Payroll lookup from public salary-history read authority', () => {
  assert.match(contract, /Payroll calculation requires `payroll\.calculate`/);
  assert.match(contract, /not exposed as a generic browser API/);
  assert.match(contract, /does not require the requesting Payroll officer to also have `employees\.manage`/);
  assert.match(contract, /`payroll\.read` alone is \*\*not\*\* a general Employee salary-history permission/);
});


test('Pass 310 keeps sensitive amounts out of generic audit and adds no runtime behavior', () => {
  assert.match(contract, /must \*\*not\*\* put raw salary\/rate amounts into broadly readable generic audit\/outbox payloads/);
  assert.match(contract, /No new compensation domain event is invented/);
  assert.match(contract, /Pass 310 makes exactly zero changes to:[\s\S]*Prisma models[\s\S]*Fastify routes[\s\S]*permission codes/);
  assert.match(contract, /Pass 311 — Stage-20 Payroll calculation item, proration, overtime and blocking-exception vocabulary contract/);
});
