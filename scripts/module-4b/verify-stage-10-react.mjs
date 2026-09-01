import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_9_ACCEPTED = 'STAGE_9_ACCEPTED_READY_FOR_STAGE_10';
const evidencePath = path.resolve('module-4b-evidence', 'stage-10-react.json');

/** Read one JSON evidence file and return null when it does not exist. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage9 = await readJson('module-6-evidence/stage-9-live.json');
const stage9LiveAccepted = stage9?.status === STAGE_9_ACCEPTED
  && stage9?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-4b-evidence/stage-10-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 196
  && [
    'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_197',
    'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_10_MODULE_4B_INTEGRATION_SECURITY_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-4b-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: integrationPrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-4b-integration-security-regression', 'npm', ['run', 'module-4b:integration-security:gate']],
  ['module-4b-react-contract', 'node', ['--test', 'tests/module-4b-static.test.mjs']],
  ['module-4a-static-regression', 'node', ['--test', 'tests/module-4a-static.test.mjs']],
  ['boq-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/boq/api/boq-api.ts']],
  ['boq-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/boq/hooks/boq.ts']],
  ['module-6-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts']],
  ['module-6-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts']],
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
  ? (stage9LiveAccepted
      ? 'STAGE_10_MODULE_4B_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_10_MODULE_4B_REACT_PREPARED_STAGE_9_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-10-module-4b-react-evidence',
  generatedAt: new Date().toISOString(),
  pass: 197,
  stage: 10,
  module: '4B - BOQ Project Mapping',
  businessModule: '4 - BOQ Management',
  status,
  stage9LiveAccepted,
  reactCoverage: [
    'BOQ register readback shows nullable Tender and Project relationships',
    'existing BOQ create form supports Tender-only, Project-only and combined creation',
    'Project discovery reuses the existing Project register instead of inventing a lookup route',
    'Project-linked BOQ item grid exposes optional WBS and Cost Code mapping controls',
    'WBS mapping options reuse the existing Module 6 WBS tree read contract',
    'Cost Code mapping options reuse the existing bounded Module 6 Cost Code read contract',
    'blank mapping controls are removed before the existing whole-set BOQ item command is sent',
    'server-calculated readback displays persisted WBS and Cost Code IDs',
    'Tender-only BOQs keep mapping controls unavailable'
  ],
  intentionallyAbsent: [
    'No new BOQ route or Project-attachment command.',
    'No Cost Type relationship is added to BOQ items.',
    'No Project filter is invented for the BOQ list route.',
    'CSV import keeps the reviewed commercial columns; mappings are selected after import.',
    'The current auth identity does not expose exact effective permissions per Project, so Project-specific write controls remain conservative and the API stays authoritative.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newReactFiles: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 198 - Module 4B Playwright Project BOQ and WBS/Cost Code mapping workflow verification.'
    : 'Repair the failed Pass-197 React mapping check before adding Stage-10 Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4B Stage-10 React evidence written to ${written}`);

if (!passed) process.exitCode = 1;
