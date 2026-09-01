import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_11_ACCEPTED = 'STAGE_11_ACCEPTED_READY_FOR_STAGE_12';
const evidencePath = path.resolve('module-7-evidence', 'stage-12-react.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage11 = await readJson('module-15a-evidence/stage-11-live.json');
const stage11LiveAccepted = stage11?.status === STAGE_11_ACCEPTED
  && stage11?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-7-evidence/stage-12-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 218
  && [
    'STAGE_12_MODULE_7_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_219',
    'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_12_MODULE_7_INTEGRATION_SECURITY_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-7-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-7-integration-security-regression', 'npm', ['run', 'module-7:integration-security:gate']],
  ['module-7-react-static-suite', 'node', ['--test', 'tests/module-7-static.test.mjs']],
  ['module-7-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/budgets-job-cost/api/budgets-job-cost-api.ts']],
  ['module-7-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/budgets-job-cost/hooks/budgets-job-cost.ts']],
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
  ? (stage11LiveAccepted
      ? 'STAGE_12_MODULE_7_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_12_MODULE_7_REACT_PREPARED_STAGE_11_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-12-module-7-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 219,
  stage: 12,
  module: '7 - Budgeting & Job Costing',
  status,
  stage11LiveAccepted,
  reactCoverage: [
    'typed browser API for the seven source operations plus the Pass-361 latest-DRAFT recovery read',
    'TanStack Query current-budget, latest-DRAFT, job-cost and bounded ledger reads plus reviewed mutations',
    'React Hook Form plus Zod for budget creation, exact-decimal budget lines and forecast assumptions',
    'Project selector reuses the existing Project register and leaves Project authorization server-authoritative',
    'budget grid plus selected cost-code drilldown using existing Module-6 WBS/mapping readback when authorized',
    'budget versus committed versus actual versus forecast, EAC, variance, revenue and margin server readback',
    'forecast ETC and comment editing while final forecast values stay response-only',
    'source-derived commitment and actual ledger remains read-only with bounded pagination',
    'permission-aware navigation and sensitive action visibility without weakening backend enforcement'
  ],
  intentionallyAbsent: [
    'No commitment or actual create/update/delete UI is added because those histories are source-derived.',
    'No generic budget list/history, custom approval, reopen or reconciliation UI is invented; Pass 361 adds only latest-DRAFT recovery.',
    'No Cost Type master endpoint is invented; authorized Module-6 assignment IDs are reused when available.',
    'An unfinished DRAFT is recoverable after reload through the bounded latest-DRAFT read added by Pass 361.',
    'Exact Project-level Module-7 permission lists are not exposed by /auth/me, so sensitive writes stay hidden unless the corresponding Company permission is visible.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newReactFiles: 4,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 220 - Module 7 Playwright Budgeting & Job Costing workflow verification.'
    : 'Repair the failed Pass-219 React check before adding Stage-12 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 7 Stage-12 React evidence written to ${written}`);

if (!passed) process.exitCode = 1;
