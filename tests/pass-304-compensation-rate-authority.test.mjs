import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/PASS-304-COMPENSATION-LABOR-RATE-AUTHORITY.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const employeeSchema = await readFile('apps/api/src/modules/hr-payroll/hr-payroll.schema.ts', 'utf8');
const workforceContract = await readFile('docs/modules/workforce-timesheets/STAGE-19-MODULE-13-CONTRACT.md', 'utf8');
const sourceGapFreeze = await readFile('docs/PASS-303-STAGE-20-SOURCE-GAP-FREEZE.md', 'utf8');

test('Pass 304 freezes HR Payroll as compensation authority and keeps Workforce rate-free', () => {
  assert.match(contract, /HR\/Payroll owns compensation authority/);
  assert.match(contract, /Module 13 owns worked-time quantities and project cost coding only/);
  assert.match(contract, /Job Cost must not price raw Timesheets independently/);
  assert.match(workforceContract, /browser never supplies labor cost or arbitrary pay rate/);
});

test('Pass 304 preserves existing Employee compensation inputs without pretending they are historical rate records', () => {
  const employee = prisma.match(/model Employee \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(employee, /baseSalary\s+Decimal\?/);
  assert.match(employee, /hourlyRate\s+Decimal\?/);
  assert.doesNotMatch(employee, /effective(Date|From|To)/i);
  assert.match(contract, /Existing Employee compensation fields remain inputs, not a historical Payroll snapshot/);
  assert.match(contract, /Payroll calculate\/finalize runtime remains blocked/);
});

test('Pass 304 does not invent pay type, overtime multiplier or salary conversion rules', () => {
  assert.match(contract, /Do not infer pay type from nullable rates/);
  assert.match(contract, /No overtime multiplier or premium formula is frozen by this pass/);
  assert.match(contract, /Convert base salary to hourly rate using a guessed divisor/);
  assert.match(contract, /Use 1\.5x or 2x overtime by convention/);
  assert.match(sourceGapFreeze, /Overtime and approved labor-rate policy/);
});

test('Pass 304 keeps ordinary Employee readback compensation-safe because no salary-read permission exists', () => {
  const response = employeeSchema.match(/export const employeeResponseSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\);/)?.[0] ?? '';
  assert.ok(response.length > 0);
  assert.doesNotMatch(response, /baseSalary|hourlyRate/);
  assert.match(contract, /ordinary Employee list\/readback does not expose `baseSalary` or `hourlyRate`/);
  assert.match(contract, /no new `compensation\.read`, `salary\.read` or similar permission is invented/);
});

test('Pass 304 recognizes payslip items as the future immutable calculation evidence without inventing formulas', () => {
  assert.match(contract, /Finalized payslip lines are the appropriate calculation snapshot boundary/);
  for (const field of ['quantity nullable', 'rate nullable', 'amount']) assert.ok(contract.includes(field));
  assert.match(contract, /does \*\*not\*\* authorize Pass 304 to invent item codes, component types, formulas, rounding rules/);
});

test('Pass 304 remains contract-only and hands off source-consumption identity to Pass 305', () => {
  for (const phrase of [
    'Prisma models',
    'migrations',
    'repository functions',
    'service functions',
    'Fastify routes',
    'React runtime',
    'permission codes',
    'Payroll formulas',
    'Finance posting',
  ]) assert.ok(contract.includes(phrase), `Missing Pass-304 no-change boundary: ${phrase}`);
  assert.match(contract, /Pass 305 — Module 13 Payroll source-consumption and posting-identity contract/);
});
