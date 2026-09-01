import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const web = 'apps/web/src/features/labour-payroll';
const migrationPath = 'packages/database/prisma/migrations/20260829001800_final21_labour_attendance_payroll/migration.sql';

/** Extract one Prisma model block for focused Module 13 assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm Module 13 is one simple five-file backend and replaces both legacy runtimes. */
test('B14 keeps Labour Attendance and Payroll in one Final-21 five-file backend', () => {
  assert.deepEqual(readdirSync(new URL(`../${backend}`, import.meta.url)).sort(), [
    'index.ts',
    'labour-payroll.repository.ts',
    'labour-payroll.routes.ts',
    'labour-payroll.schema.ts',
    'labour-payroll.service.ts'
  ]);
  const app = read('apps/api/src/app.ts');
  assert.match(app, /registerLabourPayrollRoutes/);
  assert.doesNotMatch(app, /registerHrPayrollRoutes|registerWorkforceTimesheetsRoutes|modules\/hr-payroll|modules\/workforce-timesheets/);
});

/** Confirm the exact eight Final-21 Attendance/Payroll routes and no generic CRUD additions. */
test('B14 exposes exactly the eight Final-21 Labour Payroll routes', () => {
  const schema = read(`${backend}/labour-payroll.schema.ts`);
  const expected = [
    "GET', route: '/api/v1/attendance'",
    "POST', route: '/api/v1/attendance'",
    "PATCH', route: '/api/v1/attendance/:id'",
    "GET', route: '/api/v1/payroll/runs'",
    "POST', route: '/api/v1/payroll/runs'",
    "POST', route: '/api/v1/payroll/runs/:id/calculate'",
    "POST', route: '/api/v1/payroll/runs/:id/finalize'",
    "GET', route: '/api/v1/payroll/runs/:id'"
  ];
  for (const route of expected) assert.ok(schema.includes(route), `missing ${route}`);
  assert.equal((schema.match(/method: '(?:GET|POST|PUT|PATCH|DELETE)', route: '\/api\/v1\/(?:attendance|payroll)/g) ?? []).length, 8);
  assert.doesNotMatch(schema, /timesheets|leave-requests|payslip\.self_read/i);
});

/** Confirm persistence is the four final Module 13 resources and removes legacy Timesheet coupling. */
test('B14 aligns Prisma to attendance payroll lines and payslips without Timesheet cost codes', () => {
  const schema = read('packages/database/prisma/schema.prisma');
  const attendance = prismaModel('AttendanceEntry');
  const run = prismaModel('PayrollRun');
  const line = prismaModel('PayrollLine');
  const payslip = prismaModel('Payslip');
  assert.match(attendance, /employeeId\s+String/);
  assert.match(attendance, /projectId\s+String/);
  assert.match(attendance, /stageId\s+String\?/);
  assert.match(attendance, /hours\s+Decimal\?/);
  assert.match(attendance, /overtimeHours\s+Decimal\?/);
  assert.match(attendance, /enteredBy\s+String/);
  assert.match(run, /createdBy\s+String/);
  assert.match(run, /finalizedAt\s+DateTime\?/);
  assert.doesNotMatch(run, /payDate|grossTotal|deductionTotal|netTotal|calculatedAt/);
  assert.match(line, /grossAmount\s+Decimal/);
  assert.match(line, /deductions\s+Decimal/);
  assert.match(line, /netAmount\s+Decimal/);
  assert.match(line, /projectAllocationJson\s+Json/);
  assert.match(payslip, /payrollLineId\s+String/);
  assert.match(payslip, /documentId\s+String\?/);
  assert.doesNotMatch(schema, /model Timesheet\b|model TimesheetEntry\b|model TimesheetAdjustment\b|model PayslipItem\b|model PayrollCalculationException\b|model PayrollSourceConsumption\b/);
});

/** Confirm attendance validates Final Module 8 assignment and Project/Stage scope. */
test('B14 validates attendance against active Project Team assignment and Stage ownership', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);
  const migration = read(migrationPath);
  assert.match(repository, /projectTeamAssignment\.findFirst/);
  assert.match(repository, /fromDate: \{ lte: workDate \}/);
  assert.match(repository, /toDate: null/);
  assert.match(service, /requireAttendanceAssignment/);
  assert.match(service, /findStage\(projectId, stageId\)/);
  assert.match(service, /findActiveAssignment\(employeeId, projectId, stageId, workDate\)/);
  assert.match(migration, /attendance_entries_stage_project_fkey/);
  assert.match(migration, /Attendance requires an active Project\/Stage Employee assignment/);
});

/** Confirm Payroll uses effective compensation and keeps exact-decimal salary/wage/hourly calculations server-side. */
test('B14 calculates employee salaries from effective compensation and present attendance', () => {
  const service = read(`${backend}/labour-payroll.service.ts`);
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  assert.match(repository, /employeeCompensation\.findMany/);
  assert.match(repository, /status: 'PRESENT'/);
  assert.match(service, /payType === 'SALARY'/);
  assert.match(service, /payType === 'DAILY'/);
  assert.match(service, /payType === 'HOURLY'/);
  assert.match(service, /moneyCents\(startComp\.baseSalary\)/);
  assert.match(service, /multiplyToCents\(quantity, decimal4Units\(compensation\.hourlyRate\)\)/);
  assert.match(service, /deductions: ZERO_MONEY/);
  assert.doesNotMatch(service, /parseFloat|toFixed\(|Number\(compensation\.|Math\.round/);
});

/** Confirm finalized Payroll posts both source-derived Project cost and balanced Finance accounting atomically. */
test('B14 finalizes payroll with idempotent Module 9 cost and Module 18 Finance posting in one transaction', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);
  const finance = read('apps/api/src/modules/finance/finance.service.ts');
  assert.match(repository, /costActual\.upsert/);
  assert.match(repository, /sourceType: 'payroll'/);
  assert.match(service, /postSourceJournalInTransaction\(tx/);
  assert.match(service, /PAYROLL-LABOUR-EXPENSE/);
  assert.match(service, /PAYROLL-PAYABLE/);
  assert.match(service, /sourceKey: `payroll_run:\$\{payrollRunId\}`/);
  assert.match(service, /payrollDraftFingerprint\(recalculated\) !== payrollDraftFingerprint\(persistedDrafts\)/);
  assert.match(finance, /private async postSourceJournalOnce/);
  assert.match(finance, /async postSourceJournalInTransaction/);
});

/** Confirm final permissions, errors, idempotency and audit/outbox vocabulary. */
test('B14 uses only the Final-21 Module 13 permissions errors and events', () => {
  const schema = read(`${backend}/labour-payroll.schema.ts`);
  const routes = read(`${backend}/labour-payroll.routes.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);
  for (const permission of ['attendance.read', 'attendance.create', 'attendance.correct', 'payroll.read', 'payroll.create', 'payroll.calculate', 'payroll.finalize']) {
    assert.ok(schema.includes(`'${permission}'`), `missing ${permission}`);
  }
  for (const code of ['ATTENDANCE_DUPLICATE', 'EMPLOYEE_NOT_ASSIGNED', 'PAYROLL_NOT_FOUND', 'PAYROLL_LOCKED', 'PAYROLL_NOT_READY']) {
    assert.ok(schema.includes(`'${code}'`), `missing ${code}`);
  }
  for (const event of ['attendance.recorded', 'payroll.created', 'payroll.calculated', 'payroll.finalized', 'payroll.posted']) {
    assert.ok(schema.includes(`'${event}'`), `missing ${event}`);
  }
  assert.equal((routes.match(/headers: IDEMPOTENCY_HEADERS_JSON_SCHEMA/g) ?? []).length, 5);
  assert.match(service, /executeIdempotentCommand/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
});

/** Confirm finalized history locks attendance source and Payroll snapshots. */
test('B14 preserves immutable finalized payroll and blocks attendance correction after consumption', () => {
  const repository = read(`${backend}/labour-payroll.repository.ts`);
  const service = read(`${backend}/labour-payroll.service.ts`);
  const migration = read(migrationPath);
  assert.match(repository, /isAttendanceLockedByFinalizedPayroll/);
  assert.match(service, /throw createLabourPayrollError\('PAYROLL_LOCKED'\)/);
  assert.match(migration, /Finalized Payroll is immutable; use an adjustment or reversal run/);
  assert.match(migration, /payroll_lines_finalized_immutable/);
  assert.match(migration, /payslips_finalized_immutable/);
  assert.match(migration, /Finalized Payroll periods may not overlap/);
});

/** Confirm the React workspace joins Attendance and Payroll while reusing Employee Project and Stage owners. */
test('B14 replaces separate Timesheet and Payroll React workspaces with one Final-21 feature', () => {
  const api = read(`${web}/api/labour-payroll-api.ts`);
  const hooks = read(`${web}/hooks/labour-payroll.ts`);
  const workspace = read(`${web}/components/labour-payroll-workspace.tsx`);
  const page = read(`${web}/pages/labour-payroll-page.tsx`);
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(workspace, /useEmployees/);
  assert.match(workspace, /useProjects/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /Attendance register/);
  assert.match(workspace, /Payroll calculation preview/);
  assert.match(workspace, /Project \/ Stage labour cost/);
  assert.match(api, /Idempotency-Key/);
  assert.match(hooks, /useFinalizePayrollRun/);
  assert.match(page, /usePermission\('attendance\.read'\)/);
  assert.match(page, /usePermission\('payroll\.finalize'\)/);
  assert.match(shell, /Attendance & Payroll/);
  assert.doesNotMatch(shell, /HrPayrollPage|WorkforceTimesheetsPage|hr-payroll|workforce-timesheets|timesheets\./);
});

/** Confirm B14 migration carries old data forward before dropping obsolete tables and permissions. */
test('B14 has one forward migration that transforms legacy Timesheets and Payroll before cleanup', () => {
  const migration = read(migrationPath);
  assert.match(migration, /Preserve legacy worked time by collapsing old cost-coded rows/);
  assert.match(migration, /ALTER TABLE "payroll_runs" RENAME TO "payroll_runs_legacy_b14"/);
  assert.match(migration, /INSERT INTO "payroll_lines"/);
  assert.match(migration, /DROP TABLE "timesheet_entries" CASCADE/);
  assert.match(migration, /DROP TABLE "payroll_source_consumptions_legacy_b14" CASCADE/);
  assert.match(migration, /'attendance\.read'/);
  assert.match(migration, /'payroll\.create'/);
  assert.match(migration, /'timesheets\.read'/);
  assert.match(migration, /'payslip\.self_read'/);
});

/** Confirm obsolete Module 13/14A/14B runtime/verifier stacks are not carried into the final module. */
test('B14 removes obsolete Labour Payroll duplicate files and old module gates', () => {
  for (const path of [
    'apps/api/src/modules/hr-payroll',
    'apps/api/src/modules/workforce-timesheets',
    'apps/web/src/features/hr-payroll',
    'apps/web/src/features/workforce-timesheets',
    'scripts/module-13',
    'scripts/module-14a',
    'scripts/module-14b',
    'module-13-evidence',
    'module-14a-evidence',
    'module-14b-evidence',
    'tests/module-13-static.test.mjs',
    'tests/module-14a-static.test.mjs',
    'tests/module-14b-static.test.mjs',
    'tests/pass-373-module-14-13-hr-payroll-readback-lifecycle.test.mjs'
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, `${path} should be removed`);
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(Object.keys(scripts).some((name) => /module-13|module-14a|module-14b/i.test(name)), false);
});

/** Confirm changed B14 named functions and methods keep short purpose comments for junior readability. */
test('B14 keeps changed Labour Payroll functions junior-readable with purpose comments', () => {
  const paths = [
    `${backend}/labour-payroll.schema.ts`, `${backend}/labour-payroll.repository.ts`, `${backend}/labour-payroll.service.ts`, `${backend}/labour-payroll.routes.ts`,
    'apps/api/src/modules/finance/finance.service.ts',
    `${web}/api/labour-payroll-api.ts`, `${web}/hooks/labour-payroll.ts`, `${web}/components/labour-payroll-workspace.tsx`, `${web}/pages/labour-payroll-page.tsx`
  ];
  for (const path of paths) {
    const lines = read(path).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      const isMethod = /^\s*(?:private\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction && !isMethod) continue;
      const previous = lines.slice(Math.max(0, index - 3), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${path}:${index + 1} needs a short purpose comment`);
    }
  }
});
