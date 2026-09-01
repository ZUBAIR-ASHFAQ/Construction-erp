import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const MODULE = 'apps/api/src/modules/project-profitability/';
const LIVE = 'tests/integration/final-21-project-profitability-api.integration.test.mjs';
const DOC = 'docs/PASS-B19-8-FINAL21-PROJECT-PROFITABILITY-RECONCILIATION-SECURITY.md';
const EVIDENCE = 'acceptance-evidence/pass-b19-8-project-profitability-reconciliation-security.json';

/** Read one project file relative to the repository root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B19.8 keeps Module 19 read-only and preserves historical no-persistence no-migration evidence', () => {
  const files = readdirSync(new URL(MODULE, ROOT)).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'index.ts',
    'project-profitability.repository.ts',
    'project-profitability.routes.ts',
    'project-profitability.schema.ts',
    'project-profitability.service.ts'
  ]);
  const evidence = JSON.parse(read(EVIDENCE));
  assert.equal(evidence.reactFeatureAdded, false);
  assert.equal(readdirSync(new URL('apps/web/src/features/project-profitability/', ROOT)).length, 4);
  const prisma = read('packages/database/prisma/schema.prisma');
  assert.doesNotMatch(prisma, /model ProjectProfitability|model ProjectProfitabilitySnapshot/);
  const migrations = readdirSync(new URL('packages/database/prisma/migrations/', ROOT), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(migrations.some((name) => /b19[_-]?8/i.test(name)), false);
});

test('B19.8 live coverage seeds the five authoritative source groups and does not invent a profitability source table', () => {
  const live = read(LIVE);
  for (const source of [
    'costActual.createMany',
    'clientInvoice.create',
    'clientReceipt.createMany',
    'supplierInvoice.create',
    "sourceType: 'client_invoice'",
    "sourceType: 'client_receipt'"
  ]) assert.ok(live.includes(source), `missing live source ${source}`);
  assert.doesNotMatch(live, /projectProfitability\.(?:create|update|upsert)|projectProfitabilitySnapshot/);
});

test('B19.8 freezes one concrete cross-module reconciliation with no double counting', () => {
  const live = read(LIVE);
  for (const expected of [
    "recognizedRevenue: '1700.00'",
    "actualCost: '600.00'",
    "profitAmount: '1100.00'",
    "billedAmount: '1700.00'",
    "receivedAmount: '1500.00'",
    "allocatedAmount: '1000.00'",
    "advanceAmount: '500.00'",
    "outstandingAmount: '700.00'",
    "supplierPayableAmount: '650.00'"
  ]) assert.ok(live.includes(expected), `missing frozen reconciliation ${expected}`);
  assert.match(live, /reconciles Modules 9, 15, 16, 17 and 18 without double counting/);
});

test('B19.8 proves Stage plus Project-only values reconcile to the Project total for every financial field', () => {
  const live = read(LIVE);
  assert.match(live, /function reconciledStageField/);
  assert.match(live, /payload\.stages\.reduce/);
  assert.match(live, /money\(payload\.projectOnly\[field\]\)/);
  for (const field of [
    'recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount',
    'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount'
  ]) assert.ok(live.includes(`'${field}'`), `missing Stage reconciliation field ${field}`);
});

test('B19.8 proves approved physical progress remains independent from submitted and future progress', () => {
  const live = read(LIVE);
  assert.match(live, /progressPercent: '60\.0000'.*status: 'APPROVED'/s);
  assert.match(live, /progressPercent: '95\.0000'.*status: 'SUBMITTED'/s);
  assert.match(live, /progressPercent: '80\.0000'.*2026-09-02.*status: 'APPROVED'/s);
  assert.match(live, /physicalProgressPercent, '60'/);
  assert.match(live, /physicalProgressPercent, '25'/);
});

test('B19.8 freezes the canonical random Rs. 500,000 advance as cash without profit', () => {
  const live = read(LIVE);
  assert.match(live, /random Rs\. 500,000 Client advance changes cash position but not Project profit/);
  assert.match(live, /receivedAmount, '500000\.00'/);
  assert.match(live, /advanceAmount, '500000\.00'/);
  assert.match(live, /recognizedRevenue, '0\.00'/);
  assert.match(live, /profitAmount, '0\.00'/);
});

test('B19.8 verifies approved-posted and as-of source filtering', () => {
  const live = read(LIVE);
  assert.match(live, /status: 'DRAFT'.*9999\.00/s);
  assert.match(live, /postingDate: new Date\('2026-09-01/);
  assert.match(live, /source filters exclude draft and post-as-of invoice, receipt, payable, cost and progress data/);
  assert.match(live, /supplierPayableAmount, '650\.00'/);
});

test('B19.8 verifies trend ownership stays Finance revenue minus Module 9 actual cost', () => {
  const live = read(LIVE);
  assert.match(live, /DAY trend uses only Finance revenue and Module 9 actual cost by posting date/);
  assert.match(live, /recognizedRevenue: '1200\.00', actualCost: '0\.00', profitAmount: '1200\.00'/);
  assert.match(live, /recognizedRevenue: '0\.00', actualCost: '300\.00', profitAmount: '-300\.00'/);
  assert.match(live, /recognizedRevenue: '500\.00', actualCost: '300\.00', profitAmount: '200\.00'/);
});

test('B19.8 verifies permission, explicit Project scope and cross-Company isolation fail closed', () => {
  const live = read(LIVE);
  for (const actor of ['b19-8-scoped-a@example.test', 'b19-8-no-finance-a@example.test', 'b19-8-admin-b@example.test']) {
    assert.ok(live.includes(actor), `missing security actor ${actor}`);
  }
  assert.match(live, /PROFITABILITY_SCOPE_FORBIDDEN/);
  assert.match(live, /portfolio intersects all three permissions, explicit scope and Company ownership/);
  assert.match(live, /foreign Company administrator can see only its own Project/);
});

test('B19.8 keeps the production repository and service security gates authoritative during integration', () => {
  const repository = read(`${MODULE}project-profitability.repository.ts`);
  const service = read(`${MODULE}project-profitability.service.ts`);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /visibleProjectIds/);
  assert.match(service, /requireRequestSecurityContext/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission\('project_profitability\.portfolio\.read'/);
  assert.match(service, /requireRecognizedRevenueOwnership/);
  assert.match(service, /requireStageReconciliation/);
});

test('B19.8 guarded live coverage remains wired after the B19.10 gate supersession', () => {
  const runner = read('scripts/testing/run-integration.mjs');
  const pkg = JSON.parse(read('package.json'));
  assert.match(runner, /final-21-project-profitability-api\.integration\.test\.mjs/);
  assert.equal(Object.keys(pkg.scripts).length < 100, true);
  assert.equal(pkg.scripts['final-21-project-profitability:b19-8:gate'], undefined);
  assert.equal(pkg.scripts['final-21-project-profitability:b19-9:gate'], undefined);
  assert.ok(pkg.scripts['final-21-project-profitability:b19-10:gate']);
  assert.equal(pkg.scripts['final-21-project-profitability:b19-7:gate'], undefined);
  assert.match(pkg.scripts['test:final-21-project-profitability-alignment'], /b19-10-final-acceptance/);
});

test('B19.8 keeps new verification helpers junior-readable with short purpose comments', () => {
  const lines = read(LIVE).split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
    assert.match(lines.slice(Math.max(0, index - 4), index).join('\n'), /\/\*\*[^]*\*\//, `${LIVE}:${index + 1} needs a short purpose comment`);
  }
});

test('B19.8 records reconciliation/security evidence and hands off only to the React pass', () => {
  const doc = read(DOC);
  const evidence = JSON.parse(read(EVIDENCE));
  for (const text of ['Modules 9, 15, 16, 17 and 18', 'Rs. 500,000', 'cross-Company', 'no double counting', 'B19.9']) {
    assert.match(doc, new RegExp(text, 'i'));
  }
  assert.equal(evidence.pass, 'B19.8');
  assert.equal(evidence.databaseMigrationAdded, false);
  assert.equal(evidence.productionFilesChanged, false);
  assert.equal(evidence.liveIntegrationCoverageAdded, true);
  assert.equal(evidence.nextPass, 'B19.9 Project Profitability React feature');
});
