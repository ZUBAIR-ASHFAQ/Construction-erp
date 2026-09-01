import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = 'apps/api/src/modules/project-profitability';
const FEATURE = 'apps/web/src/features/project-profitability';
const LIVE = 'tests/integration/final-21-project-profitability-api.integration.test.mjs';
const E2E = 'tests/e2e/final-21-project-profitability-browser.spec.mjs';
const DOC = 'docs/PASS-B19-10-FINAL21-PROJECT-PROFITABILITY-FINAL-ACCEPTANCE.md';
const EVIDENCE = 'acceptance-evidence/pass-b19-10-project-profitability-final-acceptance.json';

/** Read one project file as UTF-8 text. */
function read(relativePath) { return readFileSync(path.join(ROOT, relativePath), 'utf8'); }

/** Count literal route registrations without adding production complexity. */
function routeCount(text) { return [...text.matchAll(/app\.(?:get|post|put|patch|delete)\('/g)].length; }

test('B19.10 freezes the five-file backend and four-part React feature', () => {
  assert.deepEqual(readdirSync(path.join(ROOT, MODULE)).sort(), ['index.ts', 'project-profitability.repository.ts', 'project-profitability.routes.ts', 'project-profitability.schema.ts', 'project-profitability.service.ts']);
  assert.deepEqual(readdirSync(path.join(ROOT, FEATURE)).sort(), ['api', 'components', 'hooks', 'pages']);
});

test('B19.10 freezes exactly four read-only Project Profitability HTTP operations', () => {
  const routes = read(`${MODULE}/project-profitability.routes.ts`);
  assert.equal(routeCount(routes), 4);
  assert.equal([...routes.matchAll(/app\.get\('/g)].length, 4);
  assert.doesNotMatch(routes, /app\.(?:post|put|patch|delete)\('/);
  for (const operationId of ['getProjectProfitabilitySummary', 'getProjectProfitabilityStages', 'getProjectProfitabilityTrend', 'getProjectProfitabilityPortfolio']) assert.match(routes, new RegExp(`operationId: '${operationId}'`));
});

test('B19.10 freezes the three permissions and three stable business errors', () => {
  const schema = read(`${MODULE}/project-profitability.schema.ts`);
  for (const permission of ['project_profitability.read', 'project_profitability.finance.read', 'project_profitability.portfolio.read']) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  for (const code of ['PROFITABILITY_SCOPE_FORBIDDEN', 'PROFITABILITY_SOURCE_INCOMPLETE', 'INVALID_PROFITABILITY_FILTER']) assert.match(schema, new RegExp(code));
});

test('B19.10 keeps Project Profitability derived and adds no database migration or cache', () => {
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migrations = readdirSync(path.join(ROOT, 'packages/database/prisma/migrations'), { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b19[_-]?10/i.test(name)), false);
  assert.match(read(DOC), /adds no database migration/i);
});

test('B19.10 freezes profit, cash, outstanding and Stage reconciliation invariants', () => {
  const service = read(`${MODULE}/project-profitability.service.ts`);
  assert.match(service, /const profitAmount = recognizedRevenue - actualCost/);
  assert.match(service, /const advanceAmount = receiptFinancials\.received - receiptFinancials\.allocated/);
  assert.match(service, /const outstandingAmount = billedAmount - receiptFinancials\.allocated/);
  assert.match(service, /requireStageReconciliation/);
  assert.match(service, /projectOnly/);
});

test('B19.10 freezes source ownership to Modules 9, 15, 16, 17, 18 and approved Stage progress', () => {
  const repository = read(`${MODULE}/project-profitability.repository.ts`);
  for (const source of ['costActual.findMany', 'clientInvoiceLine.findMany', 'journalLine.findMany', 'journal.findMany', 'supplierInvoice.findMany', 'projectStage.findMany']) assert.match(repository, new RegExp(source.replace('.', '\\.')));
  assert.match(repository, /status: 'APPROVED'/);
  assert.match(repository, /accountType: 'REVENUE'/);
});

test('B19.10 replays guarded reconciliation/security integration and freezes live OpenAPI', () => {
  const live = read(LIVE);
  for (const text of ['reconciles Modules 9, 15, 16, 17 and 18 without double counting', 'random Rs. 500,000 Client advance', 'permission, Project scope and cross-Company', 'portfolio intersects all three permissions', 'OpenAPI exposes exactly four read-only']) assert.match(live, new RegExp(text, 'i'));
  assert.match(read('scripts/testing/run-integration.mjs'), /final-21-project-profitability-api\.integration\.test\.mjs/);
});

test('B19.10 adds one guarded Playwright workflow over all four frozen GET operations', () => {
  const e2e = read(E2E);
  const config = read('playwright.config.mjs');
  for (const text of ['summary -> Stage -> trend -> portfolio', 'Cash is separate from profit', '500,000.00', 'four frozen GET operations']) assert.match(e2e, new RegExp(text, 'i'));
  assert.match(e2e, /isAllowedProjectProfitabilityPath/);
  assert.match(config, /RUN_FINAL_21_PROJECT_PROFITABILITY_E2E/);
  assert.match(config, /final-21-project-profitability-browser\.spec\.mjs/);
});

test('B19.10 keeps the React browser read-only and server-derived', () => {
  const api = read(`${FEATURE}/api/project-profitability-api.ts`);
  const component = read(`${FEATURE}/components/project-profitability-workspace.tsx`);
  assert.doesNotMatch(api, /method:\s*['"](?:POST|PUT|PATCH|DELETE)/);
  assert.match(component, /Cash is separate from profit/);
  assert.match(component, /Project-only/);
  assert.match(component, /does not create unsafe cross-currency grand totals/);
  assert.match(component, /four frozen GET operations/);
});

test('B19.10 supersedes the B19.9 gate without growing the package-script surface', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(Object.keys(pkg.scripts).length < 100, true);
  assert.equal(pkg.scripts['final-21-project-profitability:b19-9:gate'], undefined);
  assert.ok(pkg.scripts['final-21-project-profitability:b19-10:gate']);
  assert.match(pkg.scripts['test:final-21-project-profitability-alignment'], /b19-10-final-acceptance/);
});

test('B19.10 keeps new verification helpers junior-readable with short purpose comments', () => {
  for (const relativePath of [E2E, 'tests/final-21-project-profitability-b19-10-final-acceptance.test.mjs']) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      assert.match(lines.slice(Math.max(0, index - 4), index).join('\n'), /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});

test('B19.10 records final freeze evidence and hands off to cross-module integration completion', () => {
  const doc = read(DOC);
  const evidence = JSON.parse(read(EVIDENCE));
  for (const text of ['Module 19 is frozen', 'cross-module integration completion', 'Client Received is not Profit', 'Playwright']) assert.match(doc, new RegExp(text, 'i'));
  assert.equal(evidence.pass, 'B19.10');
  assert.equal(evidence.moduleFrozen, true);
  assert.equal(evidence.publicRouteCount, 4);
  assert.equal(evidence.permissionCount, 3);
  assert.equal(evidence.stableErrorCount, 3);
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.nextPass, 'B20.1 Cross-module Integration Completion alignment audit');
});
