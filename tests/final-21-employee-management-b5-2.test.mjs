import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

test('B5.2 implements the required five-file Employee backend module', () => {
  for (const file of [
    'employees.routes.ts',
    'employees.service.ts',
    'employees.repository.ts',
    'employees.schema.ts',
    'index.ts'
  ]) {
    assert.equal(exists(`apps/api/src/modules/employees/${file}`), true, file);
  }

  const app = read('apps/api/src/app.ts');
  assert.match(app, /registerEmployeesRoutes/);
});

test('B5.2 exposes the Final-21 Employee API and retires active legacy Employee and leave routes', () => {
  const routes = read('apps/api/src/modules/employees/employees.routes.ts');
  for (const route of [
    '/api/v1/employees',
    '/api/v1/employees/:id',
    '/api/v1/employees/:id/compensation',
    '/api/v1/employees/:id/status'
  ]) {
    assert.match(routes, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.equal(exists('apps/api/src/modules/hr-payroll'), false);
  const finalPayrollRoutes = read('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts');
  assert.doesNotMatch(finalPayrollRoutes, /\/api\/v1\/hr\/employees|\/api\/v1\/hr\/leave-requests/);
  assert.match(finalPayrollRoutes, /\/api\/v1\/payroll\/runs/);
});

test('B5.2 owns effective-dated compensation and employment history in Prisma', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model Employee \{/);
  assert.match(prisma, /cnicOrId\s+String\?/);
  assert.match(prisma, /phone\s+String\?/);
  assert.match(prisma, /email\s+String\?/);
  assert.match(prisma, /model EmployeeCompensation \{/);
  assert.match(prisma, /@@map\("employee_compensation"\)/);
  assert.match(prisma, /model EmployeeEmploymentHistory \{/);
  assert.match(prisma, /@@map\("employee_employment_history"\)/);
  assert.doesNotMatch(prisma, /model EmployeeCompensationPeriod \{/);
});

test('B5.2 adds only a forward Employee migration and preserves salary history', () => {
  const migration = read('packages/database/prisma/migrations/20260829001000_final21_employee_salary_foundation/migration.sql');
  assert.match(migration, /RENAME TO "employee_compensation"/);
  assert.match(migration, /employee_employment_history/);
  assert.match(migration, /'SALARY', 'DAILY', 'HOURLY'/);
  assert.match(migration, /NOT EXISTS \(\s*SELECT 1 FROM "employee_compensation"/s);
  assert.match(migration, /employees\.compensation\.manage/);
  assert.match(migration, /Leave Management is outside Final-21 active scope/);
});

test('B5.2 keeps Employee master, salary and Payroll browser ownership separate', () => {
  assert.equal(exists('apps/web/src/features/employees/api/employees-api.ts'), true);
  assert.equal(exists('apps/web/src/features/employees/hooks/employees.ts'), true);
  assert.equal(exists('apps/web/src/features/employees/components/employee-details-panel.tsx'), true);
  assert.equal(exists('apps/web/src/features/employees/pages/employees-page.tsx'), true);
  assert.equal(exists('apps/web/src/features/hr-payroll/components/hr-workspace.tsx'), false);

  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(shell, /Employees & Salaries/);
  assert.match(shell, /employees\.compensation\.manage/);

  const payrollPage = read('apps/web/src/features/labour-payroll/pages/labour-payroll-page.tsx');
  assert.doesNotMatch(payrollPage, /employees\.manage|leave\.read|leave\.approve|selectedEmployee/);
});

test('B5.2 records the deferred attendance and full Payroll migration boundary', () => {
  const doc = read('docs/PASS-B5-2-FINAL21-EMPLOYEE-SALARY-FOUNDATION.md');
  assert.match(doc, /Full attendance-based Payroll remains deferred/i);
  assert.match(doc, /Project\/stage Employee assignment migration/i);
  assert.match(doc, /legacy `employees\.base_salary` and `employees\.hourly_rate` columns remain temporarily/i);
});
