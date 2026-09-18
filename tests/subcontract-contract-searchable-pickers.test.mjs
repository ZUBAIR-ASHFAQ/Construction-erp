import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

test('Subcontract Contract modal uses one searchable Subcontractor and Project picker instead of native selects', () => {
  const workspace = read('apps/web/src/features/vendors-subcontractors/components/subcontract-contracts-workspace.tsx');

  assert.match(workspace, /subcontractorSearch/);
  assert.match(workspace, /projectSearch/);
  assert.match(workspace, /useSubcontractors\(\{[\s\S]*search: subcontractorSearch\.trim\(\)/);
  assert.match(workspace, /useProjects\(\{[\s\S]*search: projectSearch\.trim\(\)/);
  assert.match(workspace, /id="subcontract-contract-subcontractor-search"/);
  assert.match(workspace, /placeholder="Search subcontractors by name or specialty"/);
  assert.match(workspace, /id="subcontract-contract-project-search"/);
  assert.match(workspace, /placeholder="Search Projects by name or code"/);
  assert.match(workspace, /role="combobox"/);
  assert.match(workspace, /className="project-client-option"/);
  assert.doesNotMatch(workspace, /<select \{\.\.\.props\.form\.register\('subcontractorId'\)\}>/);
  assert.doesNotMatch(workspace, /<select \{\.\.\.props\.form\.register\('projectId'\)\}>/);
});

test('Subcontractor search is server-backed by name, phone and specialty and Project search is server-backed by code/name', () => {
  const subcontractorApi = read('apps/web/src/features/vendors-subcontractors/api/vendors-subcontractors-api.ts');
  const subcontractorSchema = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts');
  const subcontractorRepository = read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts');
  const projectApi = read('apps/web/src/features/projects/api/projects-api.ts');
  const projectSchema = read('apps/api/src/modules/projects/projects.schema.ts');
  const projectRepository = read('apps/api/src/modules/projects/projects.repository.ts');

  assert.match(subcontractorApi, /search\?: string/);
  assert.match(subcontractorApi, /query\.set\('search', input\.search\)/);
  assert.match(subcontractorSchema, /search: searchSchema\.optional\(\)/);
  assert.match(subcontractorRepository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(subcontractorRepository, /phone: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(subcontractorRepository, /specialty: \{ contains: search, mode: 'insensitive' as const \}/);

  assert.match(projectApi, /search\?: string/);
  assert.match(projectApi, /query\.set\('search', input\.search\)/);
  assert.match(projectSchema, /search: searchSchema\.optional\(\)/);
  assert.match(projectRepository, /projectCode: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(projectRepository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
});

test('Contract create and edit keep selected ids in hidden registered fields and readable labels in sync', () => {
  const workspace = read('apps/web/src/features/vendors-subcontractors/components/subcontract-contracts-workspace.tsx');

  assert.match(workspace, /form\.setValue\('subcontractorId', subcontractor\.id/);
  assert.match(workspace, /form\.setValue\('projectId', project\.id/);
  assert.match(workspace, /<input type="hidden" \{\.\.\.props\.form\.register\('subcontractorId'\)\} \/>/);
  assert.match(workspace, /<input type="hidden" \{\.\.\.props\.form\.register\('projectId'\)\} \/>/);
  assert.match(workspace, /setSubcontractorSearch\(contract\.subcontractor\.name\)/);
  assert.match(workspace, /setProjectSearch\(contract\.project\.name\)/);
});
