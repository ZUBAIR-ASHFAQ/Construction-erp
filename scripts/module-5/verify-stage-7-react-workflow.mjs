import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-react-workflow.json');

/** Read genuine Module 4A live acceptance before deciding whether the completed Stage-7 React workflow is runtime-ready. */
async function readStage6LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-4a-evidence/stage-6-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const stage6 = await readStage6LiveAcceptance();
const stage6LiveAccepted = stage6?.status === ACCEPTED_STAGE_6;
const results = [];
const steps = [
  ['module-5-api-contract-static', 'npm', ['run', 'module-5:api-contract:gate']],
  ['module-5-react-static-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-5-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/projects/api/projects-api.ts']],
  ['module-5-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/projects/hooks/projects.ts']],
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
  ? (stage6LiveAccepted
      ? 'STAGE_7_REACT_WORKFLOW_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_7_REACT_WORKFLOW_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-react-workflow-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '5 - Project Management',
  pass: 147,
  stage6LiveAccepted,
  reactCoverage: [
    'editable Project master form using the existing Stage-7 PATCH contract',
    'permission-aware DRAFT activation and ACTIVE completion lifecycle controls',
    'permission-aware COMPLETED close command with optional reason',
    'bodyless activation and completion requests with lifecycle state owned by the server',
    'permission-aware Client and Tender commercial/source summary',
    'honest placeholders for downstream Project modules that do not exist yet',
    'no Project membership controls before Module 24B'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  membershipDeferredToModule24B: true,
  nextPass: 'Pass 148 - Module 5 Playwright Project browser workflow and permission verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 React-workflow evidence written to ${written}`);

if (!passed) process.exitCode = 1;
