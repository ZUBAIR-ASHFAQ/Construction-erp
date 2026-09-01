import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const evidencePath = path.resolve('module-15a-evidence', 'stage-11-contract.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage10 = await readJson('module-4b-evidence/stage-10-live.json');
const stage10LiveAccepted = stage10?.status === STAGE_10_ACCEPTED
  && stage10?.runtimeVerificationComplete === true;
const results = [];
const steps = [
  ['module-4b-static-prerequisite', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-15a-contract-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage10LiveAccepted
      ? 'STAGE_11_MODULE_15A_CONTRACT_FROZEN_READY_FOR_PASS_202'
      : 'STAGE_11_MODULE_15A_CONTRACT_FROZEN_STAGE_10_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-11-module-15a-finance-core-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 201,
  stage: 11,
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  status,
  contractOnly: true,
  stage10LiveAccepted,
  ownedTables: ['gl_accounts', 'fiscal_periods', 'journals', 'journal_lines'],
  deferred15BTables: ['ap_invoices', 'ar_invoices', 'payments', 'payment_allocations'],
  reviewedCoreRouteCount: 6,
  deferred15BRouteCount: 4,
  reviewedCoreRoutes: [
    'GET /api/v1/finance/accounts',
    'POST /api/v1/finance/journals',
    'POST /api/v1/finance/journals/:id/post',
    'POST /api/v1/finance/journals/:id/reverse',
    'GET /api/v1/finance/trial-balance',
    'POST /api/v1/finance/periods/:id/close',
  ],
  reviewedCorePermissions: [
    'finance.accounts.read',
    'finance.journals.read',
    'finance.journals.create',
    'finance.journals.post',
    'finance.periods.close',
    'finance.reports.read',
  ],
  deferred15BPermissions: ['finance.ap.manage', 'finance.ar.manage', 'finance.payments.manage'],
  reviewedCoreEvents: ['journal.posted', 'journal.reversed', 'accounting_period.closed'],
  deferred15BEvents: ['ap_invoice.posted', 'ar_invoice.posted', 'payment.posted'],
  reusesFoundationNumbering: true,
  reusesFoundationIdempotency: true,
  reusesFoundationFinancialPostingContract: true,
  unresolvedSourceAmbiguities: [
    'Chart-of-Accounts configuration is required by the workflow, but the reviewed route table defines only GET /finance/accounts.',
    'Fiscal-period configuration is required by the workflow, but the reviewed route table defines only period close and no list/create/open/reopen operation.',
    'finance.journals.read and journal/ledger UI are defined, but the reviewed route table has no journal list/detail operation.',
    'Period-close rules mention reopen/adjustment, but no reopen/adjustment route or exact workflow is defined.',
    'Finance account types, status values, journal source types and lifecycle tokens are not enumerated.',
    'The source does not state whether journals.period_id is browser-supplied or derived from posting_date.',
    'journal_lines.cost_structure_id has no explicit foreign-key target and does not exactly match the existing Foundation posting command dimensions.',
    'Reversal is required, but the source tables do not define an explicit reversal linkage field.',
    'Source posting requires idempotency, but Finance defines no separate idempotency persistence and must reuse Foundation.',
  ],
  productionRuntimeActivationAllowed: passed && stage10LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 202 - Module 15A reviewed Finance Core Prisma models and migration. Deployment remains blocked until the Stage-10 live handoff is genuine.'
    : 'Repair the failed Pass-201 contract check before preparing Finance Core persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
