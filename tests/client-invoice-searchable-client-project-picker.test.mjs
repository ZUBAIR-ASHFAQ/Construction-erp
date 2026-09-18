import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('new Client Invoice uses single searchable Client and Project comboboxes', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  assert.match(workspace, /id="client-invoice-client-search"/);
  assert.match(workspace, /id="client-invoice-project-search"/);
  assert.match(workspace, /role="combobox"/);
  assert.match(workspace, /handleClientSearch/);
  assert.match(workspace, /handleProjectSearch/);
  assert.match(workspace, /search: clientSearchText\.trim\(\)/);
  assert.match(workspace, /search: projectSearchText\.trim\(\)/);
  assert.match(workspace, /project-client-options/);
});

test('Client Invoice exposes full Client creation beside the main Client picker and keeps inline Project creation', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  const page = read('apps/web/src/features/client-billing/pages/client-billing-page.tsx');
  assert.match(workspace, /useCreateClient\(\)/);
  assert.match(workspace, /onClick=\{openQuickClientDialog\}>\+ Create client<\/button>/);
  assert.match(workspace, /quickClientSchema|submitQuickClient|quickDialog === 'client'/);
  assert.match(page, /canCreateClients=\{usePermission\('clients\.create'\)\}/);
  assert.match(workspace, /useCreateProject\(\)/);
  assert.match(workspace, />\+ Create project<\/button>/);
  assert.match(workspace, /setProjectId\(project\.id\)/);
  assert.match(page, /canCreateProjects=\{usePermission\('projects\.create'\)\}/);
});

test('Client Invoice full Client popup matches Client Management fields and does not add Create client inside the nested Project popup', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  for (const label of [
    'Display name',
    'Legal name',
    'Tax number',
    'Credit terms (days)',
    'Billing address',
    'Contact name',
    'Contact title',
    'Contact email',
    'Contact phone',
    'Primary contact'
  ]) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  const projectDialog = workspace.slice(workspace.indexOf("{props.canCreateInvoices && props.createModalOpen && quickDialog === 'project' ? ("));
  assert.doesNotMatch(projectDialog, /openQuickClientDialog|>\+ Create client<\/button>/);
});

test('inline Project popup keeps the complete Project Management create fields and existing Client picker', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  for (const label of [
    'Project name',
    'Client',
    'Commercial model',
    'Project value',
    'Currency',
    'Start date',
    'Planned end date',
    'Location (optional)'
  ]) {
    assert.match(workspace, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workspace, /id="client-invoice-quick-project-client-search"/);
  assert.match(workspace, /handleQuickProjectClientSearch/);
  assert.doesNotMatch(workspace, /openQuickClientDialog\('project'\)/);
  assert.match(workspace, /<option value="FIXED_PRICE">Fixed Price<\/option>/);
  assert.match(workspace, /<option value="COST_PLUS_PERCENTAGE">Cost \+ Percentage<\/option>/);
  assert.match(workspace, /quickProjectModel === 'COST_PLUS_PERCENTAGE'/);
  assert.match(workspace, /projectValue: values\.projectValue/);
  assert.match(workspace, /currency: values\.currency\.toUpperCase\(\)/);
  assert.match(workspace, /startDate: values\.startDate/);
  assert.match(workspace, /plannedEndDate: values\.plannedEndDate/);
  assert.match(workspace, /location: values\.location \|\| null/);
});

test('creating a Project from Client Invoice preserves invoice lines and returns to the invoice', () => {
  const workspace = read('apps/web/src/features/client-billing/components/client-billing-workspace.tsx');
  assert.match(workspace, /preserveInvoiceFormOnNextProjectChange/);
  assert.match(workspace, /preserveInvoiceFormOnNextProjectChange\.current = true;\s*setClientId\(project\.clientId\);[\s\S]*setProjectId\(project\.id\)/);
});
