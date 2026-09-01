import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const browser = await readFile('tests/e2e/module-19-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const page = await readFile('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx', 'utf8');
const doc = await readFile('docs/PASS-406-MODULE-19-PLAYWRIGHT-WORKFLOW.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));

const lockedProductionFiles = Object.freeze({
  'apps/web/src/main.tsx': 'e77a5500628d3d265707fd1d4ba8f9cedadf0d0e0ca4f0f389dbba5b6bd8ea01',
  'apps/web/src/features/administration/components/admin-shell.tsx': '22ae1b8d5340ea9fa0e886ffbdeb8e6227309ac7b866ae00dd3aeb38a8896efc',
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

/** Assert one required Pass-406 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-406 token: ${token}`);
}

/** Calculate one regression hash for production that Pass 406 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 406 adds one real Module-19 Playwright workflow with the accepted Project/Document/RBAC seed graph', () => {
  includes(browser, "import { expect, test } from '@playwright/test';");
  includes(browser, "await import('@construction-erp/testing')");
  includes(browser, "await import('../../apps/api/dist/plugins/authentication.js')");
  includes(browser, "sequenceKey: 'rfi'");
  includes(browser, "sequenceKey: 'submittal'");
  includes(browser, 'database.documentVersion.create');
  includes(browser, 'currentVersionId: DOCUMENT_VERSION_ID');
  includes(browser, 'database.projectMember.createMany');
});

test('Pass 406 drives the complete reviewed RFI create/respond/close/reopen workflow and durable reload readback', () => {
  for (const token of [
    "name: 'Create RFI'",
    "name: 'Open thread'",
    "name: 'Append response'",
    "name: 'Close RFI'",
    "getByLabel('Reopen reason')",
    "name: 'Reopen RFI'",
    'await page.reload()',
    'Use the reviewed connection detail attached to this response.'
  ]) includes(browser, token);
  includes(browser, "expect(rfi.status).toBe('OPEN')");
  includes(browser, 'database.rfiResponse.count');
});

test('Pass 406 drives Submittal create/submit/revise-resubmit and proves two durable revisions', () => {
  for (const token of [
    "name: 'Create Submittal'",
    "name: 'Open package'",
    "name: 'Submit revision'",
    "selectOption('REVISE_RESUBMIT')",
    "name: 'Record review decision'",
    "getByLabel('Optional replacement Document ID')",
    "toContainText('Revision 1')",
    "toContainText('Revision 2')",
    "toContainText('REVISE_RESUBMIT')",
    "toContainText('SUBMITTED')"
  ]) includes(browser, token);
  includes(browser, 'expect(revisions).toHaveLength(2)');
  includes(browser, "expect(revisions[1]?.documentId).toBe(DOCUMENT_ID)");
});

test('Pass 406 verifies read-only UI denial and direct denied write attempts without expanding permissions', () => {
  for (const permission of ['rfi.read', 'submittals.read', 'projects.read']) includes(browser, `'${permission}'`);
  for (const token of [
    'rfi.create is required for this command.',
    'rfi.respond is required to append a response.',
    'rfi.close is required to close this RFI.',
    'submittals.create is required for this command.',
    'submittals.review is required to record a review decision.',
    'pass406-reader-denied-rfi-create',
    'pass406-reader-denied-rfi-respond',
    'pass406-reader-denied-rfi-close',
    'pass406-reader-denied-rfi-reopen',
    'pass406-reader-denied-submittal-create',
    'pass406-reader-denied-submittal-submit',
    'pass406-reader-denied-submittal-review'
  ]) includes(browser, token);
  assert.doesNotMatch(browser, /rfi\.reopen['"]\s*,|submittals\.delete|rfi\.delete/);
});

test('Pass 406 integrates Module 19 into the one-module-at-a-time Playwright selector', () => {
  includes(playwrightConfig, "const runModule19 = process.env.RUN_MODULE_19_E2E === '1';");
  includes(playwrightConfig, 'runModule16, runModule19].filter(Boolean).length');
  includes(playwrightConfig, 'RUN_MODULE_19_E2E=1 before running Playwright.');
  includes(playwrightConfig, ': runModule19');
  includes(playwrightConfig, "? 'module-19-browser.spec.mjs'");
});

test('Pass 406 registers guarded live and focused static commands', () => {
  assert.equal(
    packageJson.scripts['test:e2e:module-19'],
    "node -e \"if (process.env.RUN_MODULE_19_E2E !== '1' || process.env.RUN_FOUNDATION_DB_TESTS !== '1') throw new Error('Set RUN_MODULE_19_E2E=1 and RUN_FOUNDATION_DB_TESTS=1 for Module 19 live browser verification.')\" && npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs"
  );
  assert.equal(
    packageJson.scripts['pass-406:module-19-playwright-workflow:gate'],
    'node --test tests/pass-406-module-19-playwright-workflow.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});

test.skip('Pass 406 leaves all accepted backend/database/core React contracts byte-identical to Pass 405', async () => {
  for (const [file, expectedHash] of Object.entries(lockedProductionFiles)) {
    assert.equal(await fileHash(file), expectedHash, `${file} changed unexpectedly in Pass 406`);
  }
});

test('Pass 406 changes the Module-19 page only to retire the obsolete next-pass Playwright note', () => {
  includes(page, 'Pass 406 adds the browser workflow coverage for lifecycle, durable reload readback and denied actions without expanding the accepted API contract.');
  assert.doesNotMatch(page, /Playwright workflow coverage remains for the next pass/);
  includes(doc, 'only production-source edit is the explanatory note');
});

test('Pass 406 keeps Stage 25 deferred and records Pass 407 as final Module-19 acceptance', () => {
  includes(doc, 'Pass 407 — Stage 24 / Module 19 Final Acceptance');
  includes(doc, 'It should not begin Stage 25 / Module 20 production work unless Stage 24 is accepted.');
  assert.doesNotMatch(browser, /daily-reports|Daily Site Reports/);
});
