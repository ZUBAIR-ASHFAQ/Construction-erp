import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/labour-payroll';
const web = 'apps/web/src/features/labour-payroll';

test('DRAFT Daily Settlements expose guarded edit and delete APIs only before calculation', async () => {
  const [schema, routes, repository, service] = await Promise.all([
    read(`${backend}/labour-payroll.schema.ts`),
    read(`${backend}/labour-payroll.routes.ts`),
    read(`${backend}/labour-payroll.repository.ts`),
    read(`${backend}/labour-payroll.service.ts`)
  ]);

  assert.match(schema, /PATCH', route: '\/api\/v1\/payroll\/runs\/:id'/);
  assert.match(schema, /DELETE', route: '\/api\/v1\/payroll\/runs\/:id'/);
  assert.match(schema, /updateDailyPayrollRunBodySchema[\s\S]*periodStart[\s\S]*periodEnd[\s\S]*Daily settlement must use one work date/);
  assert.match(routes, /app\.patch\('\/api\/v1\/payroll\/runs\/:id'/);
  assert.match(routes, /app\.delete\('\/api\/v1\/payroll\/runs\/:id'/);
  assert.match(service, /locked\.status !== PAYROLL_DRAFT \|\| locked\.payCycle !== 'DAILY'/);
  assert.match(service, /PAYROLL_DRAFT_DAILY_ONLY/);
  assert.match(repository, /updateMany\([\s\S]*payCycle: 'DAILY', status: 'DRAFT'/);
  assert.match(repository, /deleteMany\([\s\S]*payCycle: 'DAILY', status: 'DRAFT'/);
});

test('Daily Settlement list shows Edit and Delete only for DRAFT daily runs and keeps calculated runs read-only', async () => {
  const [api, hooks, workspace] = await Promise.all([
    read(`${web}/api/labour-payroll-api.ts`),
    read(`${web}/hooks/labour-payroll.ts`),
    read(`${web}/components/labour-payroll-workspace.tsx`)
  ]);

  assert.match(api, /updateDailyPayrollRun[\s\S]*method: 'PATCH'/);
  assert.match(api, /deleteDailyPayrollRun[\s\S]*method: 'DELETE'/);
  assert.match(hooks, /useUpdateDailyPayrollRun/);
  assert.match(hooks, /useDeleteDailyPayrollRun/);
  assert.match(workspace, /props\.view === 'daily-payroll' && run\.payCycle === 'DAILY' && run\.status === 'DRAFT' && props\.canCreatePayroll/);
  assert.match(workspace, />Edit<\/button>/);
  assert.match(workspace, />Delete<\/button>/);
  assert.match(workspace, /Edit daily settlement/);
  assert.match(workspace, /Calculated or finalized settlements cannot be deleted/);
});
