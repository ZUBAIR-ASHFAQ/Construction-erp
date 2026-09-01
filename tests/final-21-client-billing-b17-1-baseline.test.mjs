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

/** Extract one Prisma model block for focused Client Billing assertions. */
function prismaModel(name) {
  const schema = read('packages/database/prisma/schema.prisma');
  const start = schema.indexOf(`model ${name} {`);
  if (start < 0) return '';
  let depth = 0;
  for (let index = start; index < schema.length; index += 1) {
    if (schema[index] === '{') depth += 1;
    if (schema[index] === '}') {
      depth -= 1;
      if (depth === 0) return schema.slice(start, index + 1);
    }
  }
  return '';
}

/** Extract literal route declarations from the frozen Client Billing route contract. */
function frozenRoutes() {
  const schema = read('apps/api/src/modules/client-billing/client-billing.schema.ts');
  return [...schema.matchAll(/method:\s*'([^']+)'\s*,\s*route:\s*'([^']+)'/g)].map((match) => `${match[1]} ${match[2]}`);
}

test('B17.1 records a non-destructive Client Billing alignment audit', () => {
  assert.equal(exists('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md'), true);
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.match(audit, /non-destructive alignment audit/i);
  assert.match(audit, /no Client Billing production implementation change and no database migration/i);
  assert.match(audit, /B17\.2 - Client Billing persistence integrity alignment/i);
});

test('B17.1 keeps the existing five-file backend and four-folder React feature', () => {
  for (const file of [
    'client-billing.routes.ts',
    'client-billing.service.ts',
    'client-billing.repository.ts',
    'client-billing.schema.ts',
    'index.ts'
  ]) assert.equal(exists(`apps/api/src/modules/client-billing/${file}`), true, `missing ${file}`);

  for (const folder of ['api', 'hooks', 'components', 'pages']) {
    assert.equal(exists(`apps/web/src/features/client-billing/${folder}`), true, `missing ${folder}`);
  }
});

test('B17.1 confirms Final-21 Client Billing persistence exists without Contract-era active models', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  for (const model of ['ProjectBillingSetting', 'ProgressClaim', 'ProgressClaimLine', 'ClientInvoice', 'ClientInvoiceLine']) {
    assert.match(prisma, new RegExp(`model ${model}\\b`));
  }
  assert.doesNotMatch(prisma, /model ClientContract\b/);
  assert.doesNotMatch(prisma, /model RetentionLedger\b/);
});

test('B17.1 freezes exactly the nine merged Client Billing routes', () => {
  assert.deepEqual(frozenRoutes(), [
    'GET /api/v1/client-billing/projects/:projectId/settings',
    'PUT /api/v1/client-billing/projects/:projectId/settings',
    'GET /api/v1/client-billing/claims',
    'POST /api/v1/client-billing/claims',
    'PATCH /api/v1/client-billing/claims/:id',
    'POST /api/v1/client-billing/claims/:id/finalize',
    'POST /api/v1/client-billing/claims/:id/invoice',
    'GET /api/v1/client-billing/invoices',
    'GET /api/v1/client-billing/invoices/:id'
  ]);
});

test('B17.1 confirms all hard prerequisite modules are registered and reusable', () => {
  const app = read('apps/api/src/app.ts');
  for (const registration of [
    'registerClientsRoutes',
    'registerProjectsRoutes',
    'registerProjectStagesRoutes',
    'registerBudgetsJobCostRoutes',
    'registerFinanceRoutes',
    'registerDocumentsRoutes',
    'registerClientBillingRoutes'
  ]) assert.ok(app.includes(registration), `missing prerequisite ${registration}`);
});

test('B17.1 preserves the originally observed Stage ownership gap as historical audit evidence', () => {
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.match(audit, /Stage ownership is not enforced/i);
  assert.match(audit, /ProgressClaimLine\.stageId.*without a Prisma relation to `ProjectStage`/s);
  assert.match(audit, /ClientInvoiceLine\.stageId.*without a Prisma relation to `ProjectStage`/s);
  assert.match(audit, /B17\.2 should add safe forward-only Stage relationship\/integrity support/i);
});

test('B17.1 preserves the originally observed invoice Stage-attribution gap as historical audit evidence', () => {
  const repository = read('apps/api/src/modules/client-billing/client-billing.repository.ts');
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.match(audit, /Invoice creation discards Stage billing attribution/i);
  assert.match(repository, /lines: readonly ClientInvoiceLineWrite\[\]/);
});

test('B17.1 records the missing Cost + Percentage approved-cost basis integration', () => {
  const service = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const budgetRepository = read('apps/api/src/modules/budgets-job-cost/budgets-job-cost.repository.ts');
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.match(budgetRepository, /async sumCostActuals\(projectId: string\)/);
  assert.doesNotMatch(service, /BudgetsJobCostingRepository|sumCostActuals/);
  assert.match(service, /current\.lines\.reduce\(\(sum, line\) => sum \+ moneyToMinorUnits\(line\.amount\)/);
  assert.match(audit, /Cost \+ Percentage billing basis is not implemented/i);
});

test('B17.1 records the missing Finance AR posting while confirming Finance source posting is ready', () => {
  const billingService = read('apps/api/src/modules/client-billing/client-billing.service.ts');
  const financeService = read('apps/api/src/modules/finance/finance.service.ts');
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.doesNotMatch(billingService, /financePostingDeferred/);
  assert.match(billingService, /postSourceJournalInTransaction/);
  assert.match(financeService, /async postSourceJournalInTransaction\(tx: TransactionClient/);
  assert.match(audit, /Client Invoice is not posted to Finance \/ AR/i);
});

test('B17.1 preserves the originally observed incomplete OpenAPI and React Stage UX audit evidence', () => {
  const routes = read('apps/api/src/modules/client-billing/client-billing.routes.ts');
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  const audit = read('docs/PASS-B17-1-FINAL21-CLIENT-BILLING-ALIGNMENT-AUDIT.md');
  assert.match(routes, /operationId:/);
  assert.match(workspace, /useProjectStages/);
  assert.doesNotMatch(workspace, /Stage ID \(optional\)/);
  assert.match(audit, /OpenAPI is not complete enough/i);
  assert.match(audit, /React Stage and calculation UX is incomplete/i);
  assert.match(audit, /raw Stage UUID/i);
  assert.equal(frozenRoutes().length, 9);
});

test('B17.1 confirms Module 21 already owns Client Invoice document linking', () => {
  const documentSchema = read('apps/api/src/modules/documents-audit/documents-audit.schema.ts');
  const documentRepository = read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
  const documentService = read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  assert.match(documentSchema, /'client_invoice'/);
  assert.match(documentRepository, /resourceType === 'client_invoice'/);
  assert.match(documentService, /client_invoices\.read/);
});
