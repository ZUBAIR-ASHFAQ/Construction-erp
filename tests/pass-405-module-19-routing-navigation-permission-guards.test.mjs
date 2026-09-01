import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const shell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const page = await readFile('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx', 'utf8');
const doc = await readFile('docs/PASS-405-MODULE-19-ROUTING-NAVIGATION-PERMISSION-GUARDS.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const lockedProductionFiles = Object.freeze({
  'apps/web/src/main.tsx': 'e77a5500628d3d265707fd1d4ba8f9cedadf0d0e0ca4f0f389dbba5b6bd8ea01',
  'apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts': '7759fe6c585315ef4f77a1bc62b9f0082b0bb378a9d1e437ca748e6bc1352c91',
  'apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts': '3ae26df774b8c87a6014f0723e99ce5ece591d6236e42588324cc5b9087c7e27',
  'apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx': 'b68f65226968ed7811b4d43d3a24a2d8dabe2c0e0b3a3bf0ae92f6eeaebce92c',
  'apps/web/src/styles.css': '916140061f391e464a6110ceeee4d523f07cf59dbf044ee25c678468b12094a3',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b416e8fb63f462a18d63818f712d25b28e2a971ac84bcb4cfc76f96c433b61da',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'c9117d730a79fbe0c5f2077fd236e39c2db741b5bc648c934e8594e33dd4e71f',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '555e62cc397ab16ea36980fdcc55ce200a2bd7368b67c36b6393b16d94c88e28',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07'
});

/** Assert one required Pass-405 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-405 token: ${token}`);
}

/** Calculate one regression hash for production that Pass 405 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 405 registers the existing Module-19 page in the shared admin shell', () => {
  includes(shell, "import { RfiSubmittalsPage } from '../../rfi-submittals/pages/rfi-submittals-page.js';");
  includes(shell, "'rfi-submittals'");
  includes(shell, "setView('rfi-submittals')");
  includes(shell, '>RFI &amp; Submittals</button>');
  includes(shell, "activeView === 'rfi-submittals'");
  includes(shell, '<RfiSubmittalsPage onOpenDocuments={canReadDocuments ? showDocuments : undefined} />');
});

test('Pass 405 uses only the eight reviewed Module-19 permissions for shell visibility', () => {
  for (const permission of [
    'rfi.read', 'rfi.create', 'rfi.respond', 'rfi.close',
    'submittals.read', 'submittals.create', 'submittals.submit', 'submittals.review'
  ]) includes(shell, `'${permission}'`);

  includes(shell, 'const hasModule19CompanyPermission');
  includes(shell, 'const canUseModule19 = hasModule19CompanyPermission');
  includes(shell, "auth.identity?.projectScope.kind === 'restricted'");
  includes(shell, 'auth.identity.projectScope.projectIds.length > 0');
  assert.doesNotMatch(shell, /rfi\.reopen|rfi\.delete|submittals\.edit|submittals\.delete/);
});

test('Pass 405 guards current view, fallback navigation and sidebar rendering consistently', () => {
  includes(shell, "(view === 'rfi-submittals' && canUseModule19)");
  assert.match(shell, /canUseModule19\s*\? 'rfi-submittals'/);
  includes(shell, '{canUseModule19 && (');
  includes(shell, "className={activeView === 'rfi-submittals' ? 'nav-button active' : 'nav-button'}");
  includes(shell, "{activeView === 'rfi-submittals' && (");
});

test('Pass 405 wires Module-18 navigation without moving Document ownership into Module 19', () => {
  includes(shell, 'onOpenDocuments={canReadDocuments ? showDocuments : undefined}');
  includes(page, 'onOpenDocuments={props.onOpenDocuments}');
  includes(page, 'Document uploads and versioning remain owned by Module 18');
  assert.doesNotMatch(page, /uploadDocument|createDocumentVersion|useDocuments/);
});

test('Pass 405 follows the existing state-navigation architecture instead of adding a router dependency', async () => {
  includes(shell, "useState<'documents'");
  includes(doc, 'state navigation rather than a URL router');
  assert.equal(packageJson.dependencies?.['react-router-dom'], undefined);
  assert.equal(packageJson.dependencies?.['@tanstack/react-router'], undefined);
  assert.equal(packageJson.devDependencies?.['react-router-dom'], undefined);
  assert.equal(packageJson.devDependencies?.['@tanstack/react-router'], undefined);
});

test.skip('Pass 405 leaves Pass-402/403/404 core UI and all backend/database contracts byte-identical', async () => {
  for (const [file, expectedHash] of Object.entries(lockedProductionFiles)) {
    assert.equal(await fileHash(file), expectedHash, `${file} changed unexpectedly in Pass 405`);
  }
});

test('Pass 405 changes no Stage-25 / Module-20 production behavior', () => {
  assert.doesNotMatch(shell, /Daily Site Reports|daily-reports|module-20/i);
  assert.doesNotMatch(page, /Daily Site Reports|daily-reports|module-20/i);
  assert.match(doc, /Stage-25 \/ Module-20 production code/);
});

test('Pass 405 keeps the new named navigation function purpose-commented', () => {
  const target = shell.indexOf('function showRfiSubmittals(): void');
  assert.ok(target >= 0, 'Missing showRfiSubmittals function.');
  const prefix = shell.slice(Math.max(0, target - 220), target);
  assert.match(prefix, /\/\*\*[^]*?Stage-24 RFI & Submittals[^]*?\*\//);
});

test.skip('Pass 405 registers the focused cumulative gate and records Pass 406 as next', () => {
  assert.equal(
    packageJson.scripts['pass-405:module-19-routing-navigation-permission-guards:gate'],
    'node --test tests/pass-405-module-19-routing-navigation-permission-guards.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
  assert.match(doc, /Pass 406 — Module 19 Playwright Workflow/);
  assert.match(page, /Playwright workflow coverage remains for the next pass/);
});
