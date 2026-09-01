import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-react-register.json');

/** Read genuine Module 4A live acceptance before deciding whether Stage-7 UI may be considered runtime-ready. */
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
      ? 'STAGE_7_REACT_REGISTER_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_7_REACT_REGISTER_PREPARED_STAGE_6_LIVE_ACCEPTANCE_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-react-register-evidence',
  generatedAt: new Date().toISOString(),
  status,
  module: '5 - Project Management',
  pass: 146,
  stage6LiveAccepted,
  reactCoverage: [
    'permission-aware Project Management workspace navigation',
    'server-paginated Project register with search, status, Client and Tender filters',
    'React Hook Form + Zod Project create form',
    'permission-aware active Client, WON Tender and active Project Manager choices',
    'Project detail with append-only lifecycle history',
    'TanStack Query ownership of Project server state',
    'no Project membership controls before Module 24B'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  membershipDeferredToModule24B: true,
  nextPass: 'Pass 147 - Module 5 React Project edit, lifecycle controls and commercial summary.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 React-register evidence written to ${written}`);

if (!passed) process.exitCode = 1;
