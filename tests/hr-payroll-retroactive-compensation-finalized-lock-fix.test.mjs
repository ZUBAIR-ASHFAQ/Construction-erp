import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/employees/employees.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/employees/employees.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/employees/employees.repository.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/employees/employees.routes.ts', 'utf8');
const api = await readFile('apps/web/src/features/employees/api/employees-api.ts', 'utf8');

/** Patch 6 must reject only compensation that can rewrite one already-finalized Employee payroll result. */
test('compensation append is blocked when its effective date can affect finalized Payroll for that Employee', () => {
  assert.match(schema, /'COMPENSATION_FINALIZED_PAYROLL_LOCKED'/);
  assert.match(schema, /Compensation cannot be changed from a date that would affect finalized Payroll for this Employee\./);
  assert.match(repository, /findFinalizedPayrollAffectedByCompensation\(employeeId: string, effectiveFrom: Date\)/);
  assert.match(repository, /this\.db\.payrollRun\.findFirst\(\{[\s\S]*status: 'FINALIZED'[\s\S]*periodEnd: \{ gte: effectiveFrom \}[\s\S]*lines: \{ some: \{ employeeId \} \}/);
  assert.match(service, /const effectiveFrom = inputDate\(input\.effectiveFrom\);[\s\S]*findFinalizedPayrollAffectedByCompensation\(employeeId, effectiveFrom\)[\s\S]*COMPENSATION_FINALIZED_PAYROLL_LOCKED[\s\S]*closeEmployeeCompensation/);
});

/** The repository predicate intentionally leaves future compensation after the latest finalized period available. */
test('future compensation remains available because only finalized periods ending on or after effectiveFrom are considered', () => {
  assert.match(repository, /periodEnd: \{ gte: effectiveFrom \}/);
  assert.doesNotMatch(repository, /periodStart: \{ lte: effectiveFrom \}/);
});

/** Patch 6 is an integrity rule on the existing append endpoint, not a new browser/API workflow. */
test('Patch 6 keeps the Employee compensation HTTP request and response contracts unchanged', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/employees\/:id\/compensation'/);
  assert.match(api, /authenticatedRequest<EmployeeCompensation>\(`employees\/\$\{employeeId\}\/compensation`, \{/);
  assert.doesNotMatch(routes, /compensation\/unlock|compensation\/override|retroactive/);
  assert.doesNotMatch(api, /compensation\/unlock|compensation\/override|retroactive/);
});
