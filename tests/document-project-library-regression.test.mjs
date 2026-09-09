import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('project document visibility includes directly-owned and Project-linked documents', async () => {
  const repository = await read('apps/api/src/modules/documents-audit/documents-audit.repository.ts');
  const visibility = repository.match(/function buildProjectVisibilityWhere[\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(visibility, /AND: \[\{/);
  assert.match(visibility, /projectId: \{ in: projectIds \}/);
  assert.match(visibility, /links: \{ some: \{ projectId: \{ in: projectIds \} \} \}/);
});

test('document download accepts Document read access before linked business-module fallbacks', async () => {
  const service = await read('apps/api/src/modules/documents-audit/documents-audit.service.ts');
  const method = service.match(/async createDownloadUrl[\s\S]*?\n  \}/)?.[0] ?? '';

  assert.match(method, /canReadDocument/);
  assert.match(method, /linkedResourceType === 'supplier_invoice'[\s\S]*'supplier_payables\.read'/);
  assert.match(method, /linkedResourceType === 'client_receipt'[\s\S]*'client_receipts\.read'/);
  assert.match(method, /createSignedDownloadUrl/);
});

test('Document Browser exposes a direct current-version download action', async () => {
  const browser = await read('apps/web/src/features/documents-audit/components/document-browser.tsx');

  assert.match(browser, /useDocumentDownload/);
  assert.match(browser, /async function downloadDocument/);
  assert.match(browser, /anchor\.download = download\.version\.originalName/);
  assert.match(browser, /'Downloading…' : 'Download'/);
});
