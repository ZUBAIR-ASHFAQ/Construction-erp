import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const DOCUMENTS = 'apps/api/src/modules/documents-audit';
const SITE_EXPENSES = 'apps/api/src/modules/site-expenses';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

/** Return whether one repository path exists relative to the project root. */
function exists(relativePath) {
  return existsSync(new URL(relativePath, ROOT));
}

/** Confirm Module 21 now recognizes Site Expense as an allow-listed link target. */
test('B15.7 allows documents to link to the Site Expense resource type', () => {
  const schema = read(`${DOCUMENTS}/documents-audit.schema.ts`);
  const resourceTypes = schema.match(/DOCUMENT_LINK_RESOURCE_TYPES = Object\.freeze\(\[[\s\S]*?\] as const\)/)?.[0] ?? '';
  for (const resourceType of ['project', 'employee', 'project_stage', 'client_invoice', 'site_expense']) {
    assert.match(resourceTypes, new RegExp(`'${resourceType}'`));
  }
  assert.match(schema, /resourceType: z\.enum\(DOCUMENT_LINK_RESOURCE_TYPES\)/);
});

/** Confirm Site Expense links resolve only through the authenticated company and preserve Project/Stage dimensions. */
test('B15.7 resolves Site Expense document targets with company Project and Stage ownership', () => {
  const repository = read(`${DOCUMENTS}/documents-audit.repository.ts`);
  const method = repository.match(/async findLinkableResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /requireCompanyRepositoryScope\(\)/);
  assert.match(method, /this\.db\.siteExpense\.findFirst/);
  assert.match(method, /scope\.where\(\{ id: resourceId \}\)/);
  assert.match(method, /select: \{ id: true, projectId: true, stageId: true \}/);
  assert.match(method, /projectId: expense\.projectId, stageId: expense\.stageId/);
});

/** Confirm linking/unlinking a Site Expense requires Site Expense read authority in the exact Project scope. */
test('B15.7 protects Site Expense document links with company or Project permission checks', () => {
  const service = read(`${DOCUMENTS}/documents-audit.service.ts`);
  assert.match(service, /private async requireLinkedProjectPermission/);
  assert.match(service, /security\.permissions\.includes\(permission\)/);
  assert.match(service, /findEffectivePermissionCodesForProject\(projectId/);
  assert.match(service, /resourceType === 'site_expense'[\s\S]*?'site_expenses\.read'/);
  assert.match(service, /link\.linkedResourceType === 'site_expense'[\s\S]*?'site_expenses\.read'/);
  assert.match(service, /DOCUMENT_SCOPE_FORBIDDEN/);
});

/** Confirm Project consistency still blocks a document from being attached across Projects. */
test('B15.7 retains cross-Project document-link rejection for Site Expense evidence', () => {
  const service = read(`${DOCUMENTS}/documents-audit.service.ts`);
  const method = service.match(/async linkDocumentToResource[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /document\.projectId && resource\.projectId && document\.projectId !== resource\.projectId/);
  assert.match(method, /requireProjectPermission\(usersRepository, resource\.projectId, 'documents\.link'/);
  assert.match(method, /projectId: resource\.projectId \?\? document\.projectId/);
  assert.match(method, /stageId: resource\.stageId/);
});

/** Confirm the direct Site Expense evidence reference accepts only active, same-company Project evidence. */
test('B15.7 tightens the primary Site Expense evidence lookup to active Project-authorized documents', () => {
  const repository = read(`${SITE_EXPENSES}/site-expenses.repository.ts`);
  const method = repository.match(/async findProjectEvidenceDocument[\s\S]*?\n  \}/)?.[0] ?? '';
  assert.match(method, /requireCompanyRepositoryScope\(\)/);
  assert.match(method, /status: 'active'/);
  assert.match(method, /\{ projectId \}/);
  assert.match(method, /links: \{ some: \{ companyId: scope\.companyId, projectId \} \}/);
  assert.doesNotMatch(method, /status: \{ not: 'DELETED' \}/);
});

/** Confirm B15.7 is an integration alignment pass and adds no route or migration scope. */
test('B15.7 changes document integration only and keeps the frozen Site Expense surface', () => {
  const routes = read(`${SITE_EXPENSES}/site-expenses.routes.ts`);
  assert.equal((routes.match(/app\.(?:get|post|patch|put|delete)\('\/api\/v1\/site-expenses/g) ?? []).length, 6);
  assert.equal(exists('apps/web/src/features/site-expenses'), true);

  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  const siteExpenseMigrations = migrations.filter((name) => name.includes('final21_site_expense'));
  assert.deepEqual(siteExpenseMigrations.sort(), [
    '20260829001900_final21_site_expenses',
    '20260829002000_final21_site_expense_contract'
  ]);
});

/** Confirm every named function introduced or touched for B15.7 remains purpose-commented. */
test('B15.7 keeps changed functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    `${DOCUMENTS}/documents-audit.service.ts`,
    `${DOCUMENTS}/documents-audit.repository.ts`,
    `${SITE_EXPENSES}/site-expenses.repository.ts`
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const isFunction = /^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(line)
        || /^\s*(?:private\s+|public\s+|protected\s+)?async\s+[A-Za-z_$][\w$]*\s*\(/.test(line);
      if (!isFunction) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});
