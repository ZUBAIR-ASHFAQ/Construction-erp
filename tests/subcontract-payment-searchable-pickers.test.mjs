import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('Subcontractor Payment uses searchable Subcontractor and Subcontract / Project pickers', async () => {
  const workspace = await read('apps/web/src/features/vendors-subcontractors/components/subcontract-payments-workspace.tsx');

  assert.match(workspace, /paymentSubcontractorSearch/);
  assert.match(workspace, /search: paymentSubcontractorSearch\.trim\(\)/);
  assert.match(workspace, /id="subcontract-payment-subcontractor-search"/);
  assert.match(workspace, /placeholder="Search subcontractors by name or specialty"/);
  assert.match(workspace, /id="subcontract-payment-contract-search"/);
  assert.match(workspace, /Search subcontract Projects by name or code/);
  assert.match(workspace, /filteredAvailableContracts/);
  assert.match(workspace, /contract\.project\.projectCode/);
  assert.match(workspace, /contract\.project\.name/);
  assert.match(workspace, /role="combobox"/);
  assert.match(workspace, /className="project-client-option"/);
  assert.doesNotMatch(workspace, /<select \{\.\.\.form\.register\('subcontractorId'/);
  assert.doesNotMatch(workspace, /<select \{\.\.\.form\.register\('subcontractContractId'/);
});

test('Payment picker keeps ids in hidden registered fields and scopes contract loading to the selected subcontractor', async () => {
  const workspace = await read('apps/web/src/features/vendors-subcontractors/components/subcontract-payments-workspace.tsx');

  assert.match(workspace, /form\.setValue\('subcontractorId', subcontractor\.id/);
  assert.match(workspace, /form\.setValue\('subcontractContractId', contract\.subcontractContractId/);
  assert.match(workspace, /<input type="hidden" \{\.\.\.form\.register\('subcontractorId'\)\} \/>/);
  assert.match(workspace, /<input type="hidden" \{\.\.\.form\.register\('subcontractContractId'\)\} \/>/);
  assert.match(workspace, /props\.view === 'payment' && selectedSubcontractorId \? \{ subcontractorId: selectedSubcontractorId \} : \{\}/);
});

test('Existing backend search and ledger filters support the payment picker without a duplicate API', async () => {
  const [api, schema, repository] = await Promise.all([
    read('apps/web/src/features/vendors-subcontractors/api/vendors-subcontractors-api.ts'),
    read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.schema.ts'),
    read('apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.repository.ts')
  ]);

  assert.match(api, /search\?: string/);
  assert.match(api, /query\.set\('search', input\.search\)/);
  assert.match(schema, /search: searchSchema\.optional\(\)/);
  assert.match(repository, /name: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(repository, /specialty: \{ contains: search, mode: 'insensitive' as const \}/);
  assert.match(api, /if \(input\.subcontractorId\) query\.set\('subcontractorId', input\.subcontractorId\)/);
});
