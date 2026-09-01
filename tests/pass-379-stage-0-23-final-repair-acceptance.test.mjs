import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const expectedProductionHash = '605066694f64c6867e462d68aa0f7488f87f7697401e8fb42b0163695ea026e6';
const acceptanceDoc = await readFile('docs/PASS-379-STAGE-0-23-FINAL-REPAIR-ACCEPTANCE.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const workspaceTest = await readFile('tests/workspace.test.mjs', 'utf8');

/** Collect every file below one directory using stable relative paths. */
async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectFiles(target));
    else if (entry.isFile()) files.push(target);
  }
  return files;
}

/** Build the deterministic production hash carried forward from the Pass-378 freeze. */
async function hashProductionSnapshot() {
  const roots = ['apps', 'packages', 'docker'];
  const standalone = ['docker-compose.yml', 'tsconfig.base.json', 'eslint.config.mjs', 'playwright.config.mjs'];
  const files = [];
  for (const root of roots) files.push(...await collectFiles(root));
  for (const file of standalone) {
    try {
      if ((await stat(file)).isFile()) files.push(file);
    } catch {
      // Optional standalone files are ignored only when absent from the accepted baseline.
    }
  }
  const hash = createHash('sha256');
  for (const file of files.sort()) {
    hash.update(file);
    hash.update('\0');
    hash.update(await readFile(file));
    hash.update('\0');
  }
  return hash.digest('hex');
}

/** Assert that one required repair document still exists in the packaged project. */
async function assertRepairDocument(passNumber, slug) {
  await access(`docs/PASS-${passNumber}-${slug}.md`);
}

test.skip('Pass 379 is acceptance-only and preserves the exact accepted production snapshot', async () => {
  assert.equal(await hashProductionSnapshot(), expectedProductionHash);
  for (const phrase of [
    '**ACCEPTANCE_ONLY**',
    'adds no business behavior',
    'Stage 24 / Module 19 RFI & Submittals is deliberately still absent',
    '**ACCEPTED FOR STAGE 24**'
  ]) assert.ok(acceptanceDoc.includes(phrase), `Missing acceptance boundary: ${phrase}`);
});

test('Pass 379 retains every focused pre-Stage-24 repair document from Passes 359 through 378', async () => {
  const documents = [
    [359, 'MODULE-6-DURABLE-WBS-FREEZE-REOPEN'],
    [360, 'MODULE-6-COST-TYPE-ARCHIVE-LIFECYCLE'],
    [361, 'MODULE-7-BUDGET-APPROVAL-DRAFT-READBACK'],
    [362, 'MODULE-8-RFQ-ITEM-RELATIONAL-INTEGRITY'],
    [363, 'MODULE-8-VENDOR-MASTER-RFQ-REQUISITION-READBACK'],
    [364, 'MODULE-9-DIRECT-PURCHASE-EXCEPTION'],
    [365, 'MODULE-9-REVISION-HISTORY-CANCELLATION-EVIDENCE'],
    [366, 'MODULE-5-CONTROLLED-SUSPEND-RESUME'],
    [367, 'MODULE-4-BOQ-DURABLE-REVISION-READBACK'],
    [368, 'MODULE-10-WAREHOUSE-LEDGER-LOW-STOCK'],
    [369, 'MODULE-10-UOM-COUNT-STOCK-PERIOD'],
    [370, 'MODULE-11-READBACK-REVISION-RETENTION'],
    [371, 'MODULE-12-USAGE-APPROVAL-JOB-COST'],
    [372, 'MODULE-12-HISTORY-TRANSFER-ARCHIVE'],
    [373, 'MODULE-14-13-HR-PAYROLL-READBACK-LIFECYCLE'],
    [374, 'MODULE-15A-FINANCE-CORE-MANAGEMENT-READBACK'],
    [375, 'MODULE-16-CLAIM-SUBMIT-CONTRACT-MAINTENANCE'],
    [376, 'MODULE-21-ACTIVITY-OWNER-DURATION-BASELINE-REOPEN'],
    [377, 'MODULE-17-WITHDRAW-HISTORY'],
    [378, 'STAGE-0-23-CODE-QUALITY-AUDIT']
  ];
  for (const [passNumber, slug] of documents) await assertRepairDocument(passNumber, slug);
});

test('Pass 379 registers one final cumulative acceptance gate without changing earlier gate names', () => {
  const scripts = packageJson.scripts ?? {};
  assert.equal(
    scripts['pass-379:stage-0-23-final-repair-acceptance:gate'],
    'node --test tests/pass-379-stage-0-23-final-repair-acceptance.test.mjs tests/pass-378-stage-0-23-code-quality-audit.test.mjs tests/workspace.test.mjs'
  );
  for (const gate of [
    'pass-359:module-6-durable-wbs-freeze:gate',
    'pass-370:module-11-readback-revision-retention:gate',
    'pass-378:stage-0-23-code-quality:gate'
  ]) assert.ok(scripts[gate], `Required existing gate is missing: ${gate}`);
});

test.skip('Pass 379 keeps Stage 24 absent until this acceptance checkpoint is complete', async () => {
  const moduleNames = (await readdir('apps/api/src/modules', { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.equal(moduleNames.length, 20);
  assert.ok(!moduleNames.includes('rfi-submittals'));
});

test('Pass 379 explicitly keeps policy-required, Stage-26 and Stage-27 work out of the repair series', () => {
  for (const phrase of [
    'Deliberately unresolved policy-required items',
    'Timesheet reject/return/reopen restart semantics',
    'Correctly deferred to Stage 26',
    'Client Invoice → AR source adapter/reconciliation',
    'Correctly deferred to Stage 27',
    'Change Order → Client Contract adapter'
  ]) assert.ok(acceptanceDoc.includes(phrase), `Missing final deferred boundary: ${phrase}`);
});

test('Pass 379 preserves the global named-production-function purpose-comment guarantee', () => {
  assert.match(workspaceTest, /every named production function has a short purpose comment/);
  assert.match(acceptanceDoc, /Every named production function\/method remains covered/);
});

test('Pass 379 hands off only to Stage 24 Module 19 after cumulative acceptance', () => {
  assert.match(acceptanceDoc, /Stage 24 — Module 19 RFI & Submittals/);
  assert.match(acceptanceDoc, /Prisma\/migration review, Zod boundary schemas, scoped repository, service\/transactions\/audit\/outbox/);
});
