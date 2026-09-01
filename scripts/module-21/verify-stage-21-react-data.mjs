import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-react-data.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage20 = await readJson('module-14b-evidence/stage-20-live.json');
const stage20LiveAccepted = stage20?.status === STAGE_20_ACCEPTED
  && stage20?.runtimeVerificationComplete === true;

const integrationEvidence = await readJson('module-21-evidence/stage-21-integration-security.json');
const integrationPrepared = integrationEvidence?.pass === 328
  && [
    'STAGE_21_MODULE_21_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_329',
    'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_FOR_LIVE_RUN',
    'STAGE_21_MODULE_21_INTEGRATION_SECURITY_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'
  ].includes(integrationEvidence?.status)
  && Array.isArray(integrationEvidence?.checks)
  && integrationEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-21-integration-security-evidence',
  status: integrationPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: integrationPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-21-integration-security-regression', 'npm', ['run', 'module-21:integration-security:gate']],
  ['module-21-react-data-static-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-react-data-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/web/src/features/scheduling/api/scheduling-api.ts',
      'apps/web/src/features/scheduling/hooks/scheduling.ts'
    ]
  ],
  ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
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
  ? (stage20LiveAccepted
      ? 'STAGE_21_MODULE_21_REACT_DATA_READY_FOR_PASS_330'
      : 'STAGE_21_MODULE_21_REACT_DATA_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-react-data-evidence',
  generatedAt: new Date().toISOString(),
  pass: 329,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  integrationPrepared,
  reactDataCoverage: [
    'typed browser API covers exactly the eight reviewed current Schedule, Activity, dependency, baseline, progress and look-ahead operations',
    'all six Scheduling writes send browser-generated Idempotency-Key while Company, actor, Project authorization, lifecycle and baseline authority stay server-owned',
    'baseline creation remains a bodyless command and look-ahead remains queryless because public filter names are not source-defined',
    'Activity progress remains an exact decimal string and dependency type remains the guaranteed first-scope FS token',
    'TanStack Query owns current Schedule and derived look-ahead server state for each Project',
    'Activity and progress mutations refresh current Schedule plus look-ahead while dependency and baseline mutations refresh only the current Schedule aggregate',
    'no React component, page, navigation or CSS is generated in this data-layer pass',
    'no generic CRUD, baseline reopen, CPM/P6, external scheduler sync, Change Order or Daily Report browser operation is invented'
  ],
  intentionallyAbsent: [
    'No Scheduling component, page, Gantt view, admin-shell navigation or CSS is generated in Pass 329.',
    'No look-ahead query field is invented because the reviewed API exposes no public query names.',
    'No Schedule or Activity delete/reopen command is generated.',
    'No advanced CPM, P6, resource-leveling or external scheduler client contract is generated.',
    'No Change Order or Daily Report integration is pulled forward.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicRoutesAdded: 0,
  productionFilesChanged: 2,
  reactComponentsAdded: 0,
  reactPagesAdded: 0,
  reviewedRouteCount: 8,
  reviewedWriteCount: 6,
  bodylessCommandCount: 1,
  onlyGuaranteedDependencyType: 'FS',
  lookaheadBrowserQueryFields: 0,
  advancedCpmAdded: false,
  externalSchedulerSyncAdded: false,
  changeOrderIntegrationAdded: false,
  dailyReportIntegrationAdded: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 330 - Module 21 Project Scheduling React workspace using only the reviewed Stage-21 operations.'
    : 'Repair the failed Pass-329 React data-layer check before generating the Project Scheduling workspace.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 React data evidence written to ${written}`);
if (!passed) process.exitCode = 1;
