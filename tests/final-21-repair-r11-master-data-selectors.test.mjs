import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** Read one repository source file as UTF-8 for static repair assertions. */
function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** Verify Project create/filter/edit reuses Client and User reads instead of raw identifier inputs. */
test('R11 replaces Project Client and manager raw IDs with existing selectors', () => {
  const page = read('apps/web/src/features/projects/pages/projects-page.tsx');
  const detail = read('apps/web/src/features/projects/components/project-details-panel.tsx');
  assert.match(page, /useClients/);
  assert.match(page, /listUsers/);
  assert.match(page, /Select active Client/);
  assert.match(page, /Project Manager/);
  assert.doesNotMatch(page, /placeholder="Client UUID"|placeholder="Optional User UUID"|placeholder="Optional UUID"/);
  assert.match(detail, /useClients/);
  assert.match(detail, /listUsers/);
  assert.match(detail, /Current Client preserved/);
  assert.match(detail, /Current manager assignment preserved/);
  assert.doesNotMatch(detail, /<label>Client ID|Project Manager ID \(optional\)<input/);
});

/** Verify Project Team reads Projects Employees and Stages for selection and editing. */
test('R11 replaces Project Team raw Project Employee and Stage identifiers with selectors', () => {
  const workspace = read('apps/web/src/features/project-team/components/project-team-workspace.tsx');
  assert.match(workspace, /useProjects/);
  assert.match(workspace, /useEmployees/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /Select active Employee/);
  assert.match(workspace, /Edit Assignment/);
  assert.doesNotMatch(workspace, /<label>Project UUID|<label>Employee UUID|Stage UUID \(optional\)<input|window\.prompt\('Stage UUID/);
});

/** Verify Procurement consumes existing Inventory and Stage read models for required references. */
test('R11 replaces Procurement Material Stage and Warehouse raw IDs with existing selectors', () => {
  const page = read('apps/web/src/features/procurement/pages/procurement-page.tsx');
  const workspace = read('apps/web/src/features/procurement/components/procurement-workspace.tsx');
  assert.match(page, /inventory\.read/);
  assert.match(page, /stages\.read/);
  assert.match(workspace, /useMaterials/);
  assert.match(workspace, /useInventoryStock/);
  assert.match(workspace, /useProjectStages/);
  assert.match(workspace, /Select material/);
  assert.match(workspace, /Select warehouse/);
  assert.doesNotMatch(workspace, /<label>Material ID<input|<label>Stage ID, optional<input|<label>Warehouse ID<input/);
});

/** Verify Finance uses readable Account Project Stage and Cash Bank selectors for entry and filters. */
test('R11 replaces Finance raw dimension IDs with existing source selectors', () => {
  const page = read('apps/web/src/features/finance/pages/finance-page.tsx');
  const journal = read('apps/web/src/features/finance/components/finance-journal-workspace.tsx');
  assert.match(page, /useProjects/);
  assert.match(page, /useProjectStages/);
  assert.match(page, /Parent account/);
  assert.match(page, /All accounts/);
  assert.match(page, /Cash\/Bank account<select/);
  assert.doesNotMatch(page, /Parent account ID<input|Account ID<input|Project ID<input|Stage ID<input|Cash\/Bank account UUID/);
  assert.match(journal, /useProjects/);
  assert.match(journal, /useProjectStages/);
  assert.match(journal, /Company level/);
  assert.doesNotMatch(journal, /Project ID<input|Stage ID<input|Optional UUID/);
});

/** Verify Project Stage progress reuses Documents for evidence selection. */
test('R11 replaces Stage progress evidence UUID entry with the existing Documents selector', () => {
  const workspace = read('apps/web/src/features/project-stages/components/project-stages-workspace.tsx');
  assert.match(workspace, /useDocuments/);
  assert.match(workspace, /Evidence document \(optional\)/);
  assert.match(workspace, /No evidence document/);
  assert.doesNotMatch(workspace, /Evidence Document UUID \(optional\)<input/);
});

/** Verify Site Expense supporting references no longer fall back to raw Project Stage Finance or Document IDs. */
test('R11 removes Site Expense raw reference fallbacks while preserving frozen category handling', () => {
  const workspace = read('apps/web/src/features/site-expenses/components/site-expenses-workspace.tsx');
  assert.match(workspace, /Project read permission required/);
  assert.match(workspace, /Stage read permission required/);
  assert.match(workspace, /Finance read permission required/);
  assert.match(workspace, /Document read permission required/);
  assert.doesNotMatch(workspace, /placeholder="Project UUID"|placeholder="Optional Stage UUID"|placeholder="Cash\/Bank account UUID"|placeholder="Optional Document UUID"/);
  assert.match(workspace, /frozen Module 14 API has no separate category-catalog route/i);
});

/** Verify Audit Project Stage and Actor filters reuse existing source reads while generic resource ID remains explicit. */
test('R11 replaces Audit actor Project and Stage raw filters with selectors', () => {
  const page = read('apps/web/src/features/documents-audit/pages/documents-page.tsx');
  assert.match(page, /listUsers/);
  assert.match(page, /useProjects/);
  assert.match(page, /useProjectStages/);
  assert.match(page, /All actors/);
  assert.match(page, /All Projects/);
  assert.doesNotMatch(page, /Actor user ID<input|Project ID<input|Stage ID<input|placeholder="UUID"/);
  assert.match(page, /Resource ID<input/);
});

/** Verify R11 does not invent source catalogs that are absent from the frozen API contracts. */
test('R11 leaves only documented no-catalog identifier exceptions without adding backend CRUD', () => {
  const siteApi = read('apps/web/src/features/site-expenses/api/site-expenses-api.ts');
  const procurementRoutes = read('apps/api/src/modules/procurement/procurement.routes.ts');
  const supplierPayables = read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx');
  assert.doesNotMatch(siteApi, /site-expenses\/categories|categories\?/);
  assert.doesNotMatch(procurementRoutes, /app\.get\('\/api\/v1\/procurement\/goods-receipts'/);
  assert.match(supplierPayables, /Goods Receipt ID \(optional\)/);
});
