import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_5 = 'STAGE_5_ACCEPTED_READY_FOR_STAGE_6';
const evidencePath = path.resolve('module-4a-evidence', 'stage-6-react-workflow.json');

/** Read genuine Module 3 live acceptance before deciding whether the completed Stage-6 React workflow is runtime-ready. */
async function readStage5LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-3-evidence/stage-5-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage5 = await readStage5LiveAcceptance();
const stage5LiveAccepted = stage5?.status === ACCEPTED_STAGE_5;
const results = [];
const steps = [
  ['full-dependency-free-static-regression', 'npm', ['run', 'test:static']],
  ['module-4a-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/boq/api/boq-api.ts']],
  ['module-4a-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/boq/hooks/boq.ts']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage5LiveAccepted
      ? 'STAGE_6_REACT_WORKFLOW_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_6_REACT_WORKFLOW_PREPARED_STAGE_5_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-4a-stage-6-react-workflow-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '4A - BOQ Commercial Core',
  pass: 133,
  stage5LiveAccepted,
  reactCoverage: [
    'hierarchical draft BOQ item grid using transient rowKey and parentRowKey',
    'server-calculated item amounts and revision total review',
    'session-available revision comparison without inventing a revision-history API',
    'explicit boq.freeze bodyless freeze command',
    'explicit boq.export CSV action',
    'permission-aware edit, freeze and export controls',
    'no Project/WBS/cost-code controls before Module 4B'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  deferredColumns: ['project_id', 'wbs_node_id', 'cost_code_id'],
  nextPass: 'Pass 134 - Module 4A Playwright BOQ browser workflow and permission verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 4A Stage-6 React-workflow evidence written to ${written}`);

if (!passed) process.exitCode = 1;
