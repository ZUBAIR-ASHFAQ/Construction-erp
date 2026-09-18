import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Add subcontractor uses a single searchable Project combobox backed by Project search', () => {
  const workspace = read('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx');
  assert.match(workspace, /subcontractorProjectSearch/);
  assert.match(workspace, /useProjects\(\{[\s\S]*search: subcontractorProjectSearch\.trim\(\)/);
  assert.match(workspace, /id="subcontractor-project-search"/);
  assert.match(workspace, /placeholder="Search Projects by name or code"/);
  assert.match(workspace, /handleSubcontractorProjectSearch/);
  assert.match(workspace, /handleSubcontractorProjectSelect/);
  assert.doesNotMatch(workspace, /<select id="subcontractor-project"/);

  const api = read('apps/web/src/features/projects/api/projects-api.ts');
  const schema = read('apps/api/src/modules/projects/projects.schema.ts');
  const repository = read('apps/api/src/modules/projects/projects.repository.ts');
  assert.match(api, /search\?: string/);
  assert.match(api, /query\.set\('search', input\.search\)/);
  assert.match(schema, /search: searchSchema\.optional\(\)/);
  assert.match(repository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
});

test('Create client inside Create project matches the complete Client Management create fields and payload', () => {
  const workspace = read('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx');
  for (const label of [
    'Display name', 'Legal name', 'Tax number', 'Credit terms (days)', 'Billing address',
    'Contact name', 'Contact title', 'Contact email', 'Contact phone', 'Primary contact'
  ]) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workspace, /taxNo: values\.taxNo \? values\.taxNo : null/);
  assert.match(workspace, /creditTermsDays: values\.creditTermsDays/);
  assert.match(workspace, /title: values\.contactTitle \? values\.contactTitle : null/);
  assert.match(workspace, /email: values\.contactEmail \? values\.contactEmail : null/);
  assert.match(workspace, /phone: values\.contactPhone \? values\.contactPhone : null/);
  assert.match(workspace, /isPrimary: values\.contactIsPrimary/);

  const routes = read('apps/api/src/modules/clients/clients.routes.ts');
  const service = read('apps/api/src/modules/clients/clients.service.ts');
  const repository = read('apps/api/src/modules/clients/clients.repository.ts');
  assert.match(routes, /required: \['legalName', 'displayName', 'billingAddress'\]/);
  assert.match(service, /if \(input\.contact\)/);
  assert.match(repository, /creditTermsDays: input\.creditTermsDays \?\? null/);
});

test('search picker options keep neutral component styling instead of inheriting global blue buttons', () => {
  const styles = read('apps/web/src/styles.css');
  assert.match(styles, /button:not\(\.nav-button\):not\(\.link-button\):not\(\.danger-button\):not\(\.secondary-button\):not\(\.project-client-option\),/);
  assert.match(styles, /\.project-client-option\[aria-selected='true'\][\s\S]*background: #f5f6f7/);
});
