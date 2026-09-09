import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboard = await readFile('apps/web/src/features/dashboard/components/dashboard-workspace.tsx', 'utf8');
const documentsPage = await readFile('apps/web/src/features/documents-audit/pages/documents-page.tsx', 'utf8');
const documentBrowser = await readFile('apps/web/src/features/documents-audit/components/document-browser.tsx', 'utf8');
const documentDetails = await readFile('apps/web/src/features/documents-audit/components/document-details-panel.tsx', 'utf8');
const styles = await readFile('apps/web/src/styles.css', 'utf8');

function unlabeledCells(source) {
  return [...source.matchAll(/<td(?![^>]*\bdata-label=)[^>]*>/g)].map((match) => match[0]);
}

test('Dashboard dense tables provide responsive cell labels', () => {
  assert.equal(unlabeledCells(dashboard).length, 0);
  assert.match(dashboard, /data-label="Recognized revenue"/);
  assert.match(dashboard, /data-label="Physical progress"/);
  assert.match(dashboard, /data-label="Outstanding"/);
});

test('Documents workspace scopes responsive tables and labels every data cell', () => {
  assert.match(documentsPage, /className="admin-stack documents-workspace"/);
  assert.equal(unlabeledCells(documentsPage).length, 0);
  assert.equal(unlabeledCells(documentBrowser).length, 0);
  assert.equal(unlabeledCells(documentDetails).length, 0);
  assert.match(documentBrowser, /data-label="Download"|data-label="Action"/);
  assert.match(documentDetails, /data-label="Checksum"/);
});

test('Dashboard and Documents tables stay inside the viewport and stack on small screens', () => {
  assert.match(styles, /\.dashboard-workspace \.table-wrap,\s*\.documents-workspace \.table-wrap \{\s*overflow-x: hidden;/s);
  assert.match(styles, /\.dashboard-workspace \.admin-table th,[\s\S]*?\.documents-workspace \.admin-table td \{[\s\S]*?white-space: normal;[\s\S]*?overflow-wrap: anywhere;/);
  assert.match(styles, /@media \(max-width: 760px\) \{[\s\S]*?content: attr\(data-label\);/);
  assert.match(styles, /\.dashboard-workspace \.pagination-row,[\s\S]*?\.documents-workspace \.pagination-row \{\s*flex-direction: column;/s);
});
