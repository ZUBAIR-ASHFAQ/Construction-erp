import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-react.json');

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

const reactDataEvidence = await readJson('module-21-evidence/stage-21-react-data.json');
const reactDataPrepared = reactDataEvidence?.pass === 329
  && [
    'STAGE_21_MODULE_21_REACT_DATA_READY_FOR_PASS_330',
    'STAGE_21_MODULE_21_REACT_DATA_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING'
  ].includes(reactDataEvidence?.status)
  && Array.isArray(reactDataEvidence?.checks)
  && reactDataEvidence.checks.every((check) => check.status === 'passed');

const now = new Date().toISOString();
const results = [{
  name: 'module-21-react-data-evidence',
  status: reactDataPrepared ? 'passed' : 'failed',
  startedAt: now,
  finishedAt: now,
  code: reactDataPrepared ? 0 : 1,
  signal: null
}];

const steps = [
  ['module-21-react-data-regression', 'npm', ['run', 'module-21:react-data:gate']],
  ['module-21-react-workspace-static-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-react-workspace-typescript-syntax',
    'tsc',
    [
      '--noEmit',
      '--noCheck',
      '--jsx',
      'react-jsx',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      'apps/web/src/features/scheduling/api/scheduling-api.ts',
      'apps/web/src/features/scheduling/hooks/scheduling.ts',
      'apps/web/src/features/scheduling/components/scheduling-workspace.tsx',
      'apps/web/src/features/scheduling/pages/scheduling-page.tsx',
      'apps/web/src/features/administration/components/admin-shell.tsx'
    ]
  ],
  ['module-5-static-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-static-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-24b-static-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (reactDataPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = reactDataPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage20LiveAccepted
      ? 'STAGE_21_MODULE_21_REACT_READY_FOR_PASS_331'
      : 'STAGE_21_MODULE_21_REACT_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-react-workspace-evidence',
  generatedAt: new Date().toISOString(),
  pass: 330,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  reactDataPrepared,
  reactCoverage: [
    'Project selection reuses the existing Module-5 Project register and keeps Project authorization server-owned',
    'current Schedule creation/read uses only the reviewed Schedule operations and exposes no generic CRUD',
    'Activity table supports source-defined planning fields, hierarchy, optional Module-6 WBS mapping, milestones and planning edits',
    'Gantt-style view positions activities from reviewed planned dates without claiming CPM, float, resource loading or P6 parity',
    'complete first-scope FS dependency replacement exposes whole nonnegative lag and leaves cycle authority on the API/database',
    'immutable baseline history shows latest baseline planned dates beside current planned dates',
    'progress entry uses exact decimal percent text and append-only server history',
    'look-ahead uses the reviewed queryless two-week server view without inventing browser date filters',
    'navigation and action visibility use existing Schedule permissions while the API remains authoritative for Project-scoped access'
  ],
  intentionallyAbsent: [
    'No CPM, critical-path, float, resource-leveling or P6 engine is added.',
    'No baseline delete, reopen or revision command is invented.',
    'No dependency type beyond the guaranteed FS token is exposed.',
    'No look-ahead query field is invented.',
    'No Change Order, Daily Report or external scheduler integration is pulled forward.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  newMigrations: 0,
  publicRoutesAdded: 0,
  productionFilesChanged: 4,
  reactComponentsAdded: 1,
  reactPagesAdded: 1,
  adminShellIntegrated: true,
  sharedStylesUpdated: true,
  advancedCpmAdded: false,
  externalSchedulerSyncAdded: false,
  changeOrderIntegrationAdded: false,
  dailyReportIntegrationAdded: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: passed
    ? 'Pass 331 - Module 21 Playwright Project Scheduling main workflow and permission verification.'
    : 'Repair the failed Pass-330 React workspace check before adding Scheduling Playwright coverage.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 React workspace evidence written to ${written}`);
if (!passed) process.exitCode = 1;
