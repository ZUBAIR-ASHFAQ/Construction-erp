import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Project Cash/Bank ownership is persisted and Site Manager receives only required account and salary settlement grants', async () => {
  const schema = await read('packages/database/prisma/schema.prisma');
  const migration = await read('packages/database/prisma/migrations/20260912000400_project_cash_bank_account_scope/migration.sql');
  const gates = JSON.parse(await read('packages/database/prisma/migration-gates.json'));
  const checksums = JSON.parse(await read('packages/database/prisma/migration-checksums.json'));

  assert.match(schema, /model CashBankAccount[\s\S]*projectId\s+String\?[\s\S]*project\s+Project\?/);
  assert.match(schema, /cashBankAccounts\s+CashBankAccount\[\]/);
  assert.match(migration, /ADD COLUMN "project_id" UUID/);
  assert.match(migration, /cash_bank_accounts_project_company_fkey/);
  for (const permission of ['finance.accounts.manage', 'payroll.payments.create', 'payroll.advances.create']) assert.ok(migration.includes(`'${permission}'`));
  assert.doesNotMatch(migration, /'finance\.read'/);
  assert.doesNotMatch(migration, /'payroll\.read'/);
  assert.ok(gates.gates.some((gate) => gate.migrations.includes('20260912000400_project_cash_bank_account_scope')));
  assert.equal(checksums.migrations['20260912000400_project_cash_bank_account_scope'], createHash('sha256').update(migration).digest('hex'));
});

test('Finance account create/list/update stays bound to trusted Project scope while all-scope admin can see every account', async () => {
  const schema = await read('apps/api/src/modules/finance/finance.schema.ts');
  const repository = await read('apps/api/src/modules/finance/finance.repository.ts');
  const service = await read('apps/api/src/modules/finance/finance.service.ts');
  const routes = await read('apps/api/src/modules/finance/finance.routes.ts');

  assert.match(schema, /projectId: uuidSchema\.optional\(\)/);
  assert.match(repository, /allowedProjectIds\?: readonly string\[\] \| null/);
  assert.match(repository, /includeCompanyAccounts\?: boolean/);
  assert.match(repository, /projectId: \{ in: allowedProjectIds \}/);
  assert.match(repository, /include: \{ project: \{ select: \{ projectCode: true, name: true \} \} \}/);
  assert.match(service, /private cashBankVisibility/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'/);
  assert.match(service, /private resolveCashBankProjectId/);
  assert.match(service, /security\.projectScope\.projectIds\.length === 1/);
  assert.match(service, /const projectId = this\.resolveCashBankProjectId\(input\.projectId\)/);
  assert.match(service, /this\.requireCashBankProject\(input\.projectId\)/);
  assert.match(service, /projectId: input\.projectId \?\? null/);
  assert.match(service, /PROJECT_ACCOUNT_SETUP_STATUSES = new Set\(\['DRAFT', 'ACTIVE'\]\)/);
  assert.match(service, /!PROJECT_ACCOUNT_SETUP_STATUSES\.has\(projects\[0\]\?\.status \?\? ''\)/);
  assert.match(routes, /!hasPermission\('finance\.read'\) && !hasPermission\('finance\.accounts\.manage'\)/);
});

test('Site Expense direct payments reject an account owned by another Project', async () => {
  const service = await read('apps/api/src/modules/site-expenses/site-expenses.service.ts');
  const workspace = await read('apps/web/src/features/site-expenses/components/site-expenses-workspace.tsx');

  assert.match(service, /cashBank\?\.projectId === input\.projectId|account\?\.projectId === input\.projectId/);
  assert.match(service, /security\.projectScope\.kind === 'all'/);
  assert.match(workspace, /ProjectAccountCreateModal/);
  assert.match(workspace, /Add \{paymentMode === 'BANK'/);
});

test('Payroll settlement visibility, account choices, salary payments and advances cannot cross Project ownership', async () => {
  const repository = await read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts');
  const service = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
  const responseSchema = await read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts');

  assert.match(repository, /listFinalizedPayrollRunsForSettlement/);
  assert.match(repository, /project_allocation_json AS "projectAllocationJson"/);
  assert.match(service, /payrollLineVisibleForSettlement/);
  assert.match(service, /security\.projectScope\.kind === 'restricted'[\s\S]*payroll\.payments\.create/);
  assert.match(service, /allowedProjectIds: security\.projectScope\.kind === 'restricted' \? security\.projectScope\.projectIds : null/);
  assert.match(service, /accountMatchesProject = cashBank\?\.projectId === input\.projectId/);
  assert.match(service, /accountMatchesPayroll/);
  assert.match(service, /projectId: postingProjectId/);
  assert.match(responseSchema, /projectId: uuidSchema\.nullable\(\)/);
  assert.match(responseSchema, /projectCode: z\.string\(\)\.nullable\(\)/);
});

test('Frontend keeps Project account creation contextual and lets restricted managers settle only visible Project payroll', async () => {
  const modal = await read('apps/web/src/features/finance/components/project-account-create-modal.tsx');
  const financePage = await read('apps/web/src/features/finance/pages/finance-page.tsx');
  const payrollPage = await read('apps/web/src/features/labour-payroll/pages/labour-payroll-page.tsx');
  const payrollWorkspace = await read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx');
  const payrollApi = await read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts');
  const shell = await read('apps/web/src/features/administration/components/admin-shell.tsx');

  assert.match(modal, /projectId: props\.projectId/);
  assert.match(modal, /Add Cash \/ Bank Account/);
  assert.match(financePage, /soleRestrictedProjectId/);
  assert.match(financePage, /Site Manager accounts must belong to an assigned Project\./);
  assert.match(financePage, /\.\.\.\(values\.projectId \? \{ projectId: values\.projectId \} : \{\}\)/);
  assert.match(financePage, /Company account/);
  assert.match(payrollPage, /usePermission\('finance\.accounts\.manage'\)/);
  assert.match(payrollWorkspace, /const canAccessPayrollRuns = props\.canReadPayroll \|\| props\.canCreatePayrollPayment/);
  assert.match(payrollWorkspace, /account\.projectId === projectId/);
  assert.match(payrollWorkspace, /ProjectAccountCreateModal/);
  assert.match(payrollWorkspace, /Add Cash \/ Bank account/);
  assert.match(payrollApi, /projectId: string \| null/);
  const financePermissions = shell.match(/const FINANCE_PERMISSIONS = \[([\s\S]*?)\] as const;/)?.[1] ?? '';
  assert.doesNotMatch(financePermissions, /finance\.accounts\.manage/);
});
