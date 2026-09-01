import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/projects/projects.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const webDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');

/** Verify Project close cannot silently skip the mandatory repository readiness gate. */
test('PATCH 05 makes Project close readiness mandatory in the active service path', () => {
  assert.match(service, /export type ProjectsServiceOptions = Readonly<Record<never, never>>/);
  assert.match(service, /_options: ProjectsServiceOptions = \{\}/);
  assert.doesNotMatch(service, /closeReadinessCheck/);
  assert.match(service, /if \(!\(await repository\.isProjectReadyToClose\(projectId\)\)\) \{\s*throw createProjectError\('PROJECT_NOT_READY'\);/);
  assert.match(routes, /const service = new ProjectsService\(options\.database\);/);
});

/** Verify the close gate checks only source-owned open work that remains actionable after Project completion. */
test('PATCH 05 close readiness covers operational, billing, receipt and payable blockers', () => {
  assert.match(repository, /async isProjectReadyToClose\(projectId: string\): Promise<boolean>/);
  for (const table of [
    'project_team_assignments',
    'equipment_assignments',
    'purchase_orders',
    'supplier_invoices',
    'progress_claims',
    'client_invoices',
    'client_receipts',
    'supplier_payments'
  ]) {
    assert.ok(repository.includes(table), `close readiness must inspect ${table}`);
  }

  assert.match(repository, /line\.received_qty < line\.quantity/);
  assert.match(repository, /invoice\.total_receivable > COALESCE/);
  assert.match(repository, /receipt\.amount > COALESCE/);
  assert.match(repository, /invoice\.total_amount > COALESCE/);
  assert.match(repository, /payment\.amount > COALESCE/);
  assert.match(repository, /assignment\.company_id = \$\{scope\.companyId\}::uuid/);
  assert.match(repository, /assignment\.project_id = \$\{projectId\}::uuid/);
});

/** Preserve the existing close HTTP and React contracts while the backend adds the mandatory gate. */
test('PATCH 05 keeps the Project close API and frontend contract unchanged', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/projects\/:id\/close'/);
  assert.match(routes, /summary: 'Close one completed Project after readiness checks'/);
  assert.match(routes, /reason: \{ type: 'string', minLength: 1, maxLength: 5000 \}/);
  assert.match(routes, /'PROJECT_NOT_READY'/);
  assert.match(webApi, /export function closeProject\(projectId: string, input: CloseProjectInput = \{\}\)/);
  assert.match(webDetails, /project\.status === 'COMPLETED'/);
  assert.match(webDetails, /lifecycleError instanceof Error/);
});
