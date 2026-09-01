import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_10_ACCEPTED = 'STAGE_10_ACCEPTED_READY_FOR_STAGE_11';
const evidencePath = path.resolve('module-15a-evidence', 'stage-11-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
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

const integrationEvidence = await readJson('module-15a-evidence/stage-11-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 207
  && [
    'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_208',
    'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_11_MODULE_15A_INTEGRATION_SECURITY_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-15a-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-15a-integration-security-regression', 'npm', ['run', 'module-15a:integration-security:gate']],
  ['module-15a-react-static-suite', 'node', ['--test', 'tests/module-15a-static.test.mjs']],
  ['finance-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/finance/api/finance-api.ts']],
  ['finance-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/finance/hooks/finance.ts']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (integrationPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = integrationPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage10LiveAccepted
      ? 'STAGE_11_MODULE_15A_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_11_MODULE_15A_REACT_PREPARED_STAGE_10_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-11-module-15a-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 208,
  stage: 11,
  module: '15A - Finance Core',
  businessModule: '15 - Finance & Accounting',
  status,
  stage10LiveAccepted,
  reactCoverage: [
    'typed browser API for exactly the six reviewed Finance Core operations',
    'TanStack Query bounded Chart-of-Accounts reads and period-scoped trial balance reads',
    'TanStack Query manual-journal, post, reverse and period-close mutations',
    'manual journal form keeps journal number, period, source identity, status and totals server-owned',
    'decimal debit and credit values remain strings from form input through API request and readback',
    'post, reverse and period close remain bodyless browser commands',
    'Finance navigation is permission-aware and Project-scope aware without weakening backend authorization',
    'Stage-11 UI exposes accounts, journal entry/posting/reversal, trial balance and period close only'
  ],
  intentionallyAbsent: [
    'No AP invoice, AR invoice, payment, allocation, aging or source-adapter UI is added before Module 15B.',
    'No account setup UI is invented because the reviewed Stage-11 API has no account create/update route.',
    'No fiscal-period list/setup/reopen UI is invented because those routes are not defined.',
    'No journal register/detail UI is invented because the reviewed API has no journal list/detail route.',
    'Exact Project-level Finance permission lists are not exposed by /auth/me, so Project-scoped action visibility remains best-effort and the API stays authoritative.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newReactFiles: 4,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 209 - Module 15A Playwright Finance Core workflow verification.'
    : 'Repair the failed Pass-208 React Finance Core check before adding Stage-11 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 15A Stage-11 React evidence written to ${written}`);

if (!passed) process.exitCode = 1;
