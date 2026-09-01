import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const freeze = await readFile('docs/PASS-303-STAGE-20-SOURCE-GAP-FREEZE.md', 'utf8');
const module6 = JSON.parse(await readFile('module-6-evidence/stage-9-static.json', 'utf8'));
const module7 = JSON.parse(await readFile('module-7-evidence/stage-12-static.json', 'utf8'));
const module8 = JSON.parse(await readFile('module-8-evidence/stage-13-static.json', 'utf8'));
const module9 = JSON.parse(await readFile('module-9-evidence/stage-14-static.json', 'utf8'));
const module10 = JSON.parse(await readFile('module-10-evidence/stage-15-static.json', 'utf8'));
const module11 = JSON.parse(await readFile('module-11-evidence/stage-16-static.json', 'utf8'));
const module12 = JSON.parse(await readFile('module-12-evidence/stage-17-static.json', 'utf8'));
const module14a = JSON.parse(await readFile('module-14a-evidence/stage-18-static.json', 'utf8'));
const module15a = JSON.parse(await readFile('module-15a-evidence/stage-11-static.json', 'utf8'));
const module13 = JSON.parse(await readFile('module-13-evidence/stage-19-static.json', 'utf8'));

test('Pass 303 freezes three explicit source-gap categories before Stage 20', () => {
  assert.match(freeze, /Category A — Must be resolved before Stage 20 Payroll runtime implementation/);
  assert.match(freeze, /Category B — Explicitly deferred to Stage 26 \/ Stage 27/);
  assert.match(freeze, /Category C — Source amendment required, but not a Stage 20 Payroll blocker/);
  assert.match(freeze, /Stage 20 runtime generation is blocked by Category A/);
});

test('Pass 303 carries the Stage-20 Workforce and Employee blockers forward without inventing runtime behavior', () => {
  assert.ok(module13.unresolvedSourceContract.some((item) => item.includes('Payroll-period lock')));
  assert.ok(module13.unresolvedSourceContract.some((item) => item.includes('overtime multiplier')));
  assert.ok(module13.unresolvedSourceContract.some((item) => item.includes('Payroll source-key')));
  assert.ok(module14a.unresolvedSourceContract.some((item) => item.includes('Compensation components/effective dates')));
  assert.ok(module14a.unresolvedSourceContract.some((item) => item.includes('salary-specific')));
  assert.match(freeze, /Effective compensation and pay authority/);
  assert.match(freeze, /Overtime and approved labor-rate policy/);
  assert.match(freeze, /Approved Timesheet eligibility and Payroll-period locking/);
  assert.match(freeze, /At-most-once Payroll consumption\/source identity/);
});

test('Pass 303 preserves previously recorded non-Payroll contract gaps instead of mixing repairs into Stage 20', () => {
  assert.ok(module6.unresolvedSourceContract.some((item) => item.includes('Cost Type master')));
  assert.ok(module7.unresolvedSourceContract.some((item) => item.includes('Pass 361 adds one bounded latest-DRAFT recovery read')));
  assert.ok(module8.unresolvedSourceContract.some((item) => item.includes('Vendor-master')));
  assert.ok(module9.unresolvedSourceContract.some((item) => item.includes('direct-purchase')));
  assert.ok(module10.unresolvedSourceContract.some((item) => item.includes('Warehouse')));
  assert.ok(module11.unresolvedSourceContract.some((item) => item.includes('subcontract list/detail')));
  assert.ok(module12.unresolvedSourceContract.some((item) => item.includes('Approved usage')));
  assert.ok(module15a.unresolvedSourceContract.some((item) => item.includes('account create/update')));
  for (const moduleName of [
    'Module 6 — WBS & Cost Codes',
    'Module 7 — Budgeting & Job Costing',
    'Module 8 — Procurement & RFQ',
    'Module 9 — Purchase Orders',
    'Module 10 — Inventory & Materials',
    'Module 11 — Subcontractor Management',
    'Module 12 — Equipment Management',
    'Module 15A — Finance Core',
  ]) assert.ok(freeze.includes(moduleName), `Missing frozen gap section: ${moduleName}`);
});

test('Pass 303 keeps Finance source adapters and cross-module proof at their corrected later gates', () => {
  assert.equal(module9.financeSourceAdapterDeferredToStage26, true);
  assert.equal(module10.financeSourceAdapterDeferredToStage26, true);
  assert.equal(module11.financeSourceAdapterDeferredToStage26, true);
  assert.match(freeze, /Module 15B AP\/AR tables and supplier\/client payment allocation behavior remain Stage 26 work/);
  assert.match(freeze, /Employee -> Timesheet -> Payroll finalization -> labor-cost posting is atomic\/idempotent remains a Stage-27 release proof/);
});

test('Pass 303 is documentation and verification only and hands off to Pass 304', () => {
  for (const phrase of [
    'no database table or relation',
    'no Prisma model',
    'no migration',
    'no repository function',
    'no service logic',
    'no Fastify route',
    'no React component/hook/API client',
    'no permission code',
    'no Payroll calculation rule',
    'Pass 304 — Compensation and labor-rate authority contract',
  ]) assert.ok(freeze.includes(phrase), `Missing Pass-303 boundary: ${phrase}`);
});
