import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Extract one Prisma model block for focused source-readiness checks. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  return schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?@@map\\([^\\n]+\\)\\n\\}`))?.[0] ?? '';
}

/** Confirm the B15.1 audit boundary remains preserved while later B15 passes add only approved layers. */
test('B15.1 baseline remains intact while later approved Site Expense layers are added', () => {
  assert.equal(exists('docs/PASS-B15-1-FINAL21-SITE-EXPENSE-BASELINE-AUDIT.md'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.repository.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.service.ts'), true);
  assert.equal(exists('apps/api/src/modules/site-expenses/site-expenses.routes.ts'), true);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.match(prisma, /model ExpenseCategory\b/);
  assert.match(prisma, /model SiteExpense\b/);
  const migrations = new URL('../packages/database/prisma/migrations/', import.meta.url);
  assert.equal(existsSync(new URL('20260829001900_final21_site_expenses/', migrations)), true);
});

/** Confirm all hard B15 prerequisites are registered before Site Expense is introduced. */
test('B15.1 confirms Project Stage Finance Budget and Documents prerequisites are present', () => {
  const app = read('apps/api/src/app.ts');
  for (const registration of [
    'registerProjectsRoutes',
    'registerProjectStagesRoutes',
    'registerFinanceRoutes',
    'registerBudgetsJobCostRoutes',
    'registerDocumentsRoutes',
    'registerLabourPayrollRoutes'
  ]) {
    assert.ok(app.includes(registration), `missing prerequisite ${registration}`);
  }
  assert.equal(app.includes('registerSiteExpensesRoutes'), true);
});

/** Confirm the Finance source-posting seam needed for atomic Site Expense accounting already exists. */
test('B15.1 confirms Finance supports transaction-owned idempotent source journals', () => {
  const finance = read('apps/api/src/modules/finance/finance.service.ts');
  assert.match(finance, /sourceKey: string/);
  assert.match(finance, /private async postSourceJournalOnce\(tx: TransactionClient/);
  assert.match(finance, /async postSourceJournalInTransaction\(tx: TransactionClient/);
  assert.match(finance, /findJournalBySourceKey\(input\.sourceKey\)/);
  assert.match(finance, /JOURNAL_UNBALANCED/);
});

/** Confirm Module 9 already supports the final Site Expense source-derived cost category and idempotent key. */
test('B15.1 confirms Project Cost is ready for source-derived site_expense actuals', () => {
  const budgetSchema = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.schema.ts');
  const actual = prismaModel('CostActual');
  assert.match(budgetSchema, /'site_expense'/);
  assert.match(actual, /projectId\s+String/);
  assert.match(actual, /stageId\s+String\?/);
  assert.match(actual, /sourceKey\s+String/);
  assert.match(actual, /@@unique\(\[companyId, sourceKey\]/);
  assert.match(actual, /stage\s+ProjectStage\?\s+@relation\(fields: \[stageId, projectId\]/);
});

/** Confirm Project and Stage repositories provide the company/project scope checks B15 will reuse. */
test('B15.1 confirms Project and Stage ownership checks are available', () => {
  const projects = read('apps/api/src/modules/projects/projects.repository.ts');
  const stages = read('apps/api/src/modules/project-stages/project-stages.repository.ts');
  assert.match(projects, /requireCompanyRepositoryScope/);
  assert.match(projects, /async findProjectById\(id: string\)/);
  assert.match(stages, /requireCompanyRepositoryScope/);
  assert.match(stages, /async findStage\(projectId: string, stageId: string\)/);
  assert.match(stages, /where: scope\.where\(\{ id: stageId, projectId \}\)/);
});

/** Confirm the Documents prerequisite remains present after the later approved Site Expense link integration. */
test('B15.1 Documents prerequisite remains intact after B15.7 enables site_expense linking', () => {
  const documents = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  assert.match(documents, /DOCUMENT_LINK_RESOURCE_TYPES/);
  assert.match(documents, /'project_stage'/);
  assert.match(documents, /'client_invoice'/);
  assert.match(documents, /'site_expense'/);
});

/** Confirm the B14 Prisma source blocker found during dependency audit is repaired without a migration. */
test('B15.1 removes the duplicate Project attendance relation before the next Prisma migration', () => {
  const project = prismaModel('Project');
  assert.equal((project.match(/attendanceEntries\s+AttendanceEntry\[\]/g) ?? []).length, 1);
});

/** Confirm the audit freezes the exact next implementation boundary for B15.2. */
test('B15.1 hands off only the two required Site Expense persistence models to B15.2', () => {
  const audit = read('docs/PASS-B15-1-FINAL21-SITE-EXPENSE-BASELINE-AUDIT.md');
  assert.match(audit, /B15\.2 - add the Final-21 `expense_categories` and `site_expenses` Prisma models plus one forward migration/i);
  assert.match(audit, /No Site Expense runtime, API, UI, or database migration is intentionally implemented here/i);
  assert.match(audit, /one accounting effect and one Project\/Stage actual-cost effect in one transaction/i);
  assert.match(audit, /Reversal is compensating history, never deletion/i);
});
