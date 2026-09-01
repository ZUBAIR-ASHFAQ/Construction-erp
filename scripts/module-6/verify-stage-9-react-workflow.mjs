import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-react-workflow.json');

/** Read one JSON evidence file and return null when that evidence is absent. */
async function readJson(relativePath) {
  try {
    return JSON.parse(await readFile(relativePath, 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

const pass175 = await readJson('acceptance-evidence/pass-175-final-handoff-live.json');
const stage8 = await readJson('module-24b-evidence/stage-8-live.json');
const repairHold = await readJson('module-24b-evidence/stage-8-repair-hold.json');
const module6LiveHandoffAccepted = pass175?.status === PASS_175_ACCEPTED
  && pass175?.runtimeVerificationComplete === true
  && pass175?.module6Allowed === true
  && stage8?.status === STAGE_8_ACCEPTED
  && repairHold?.status === HOLD_CLEARED
  && repairHold?.module6Allowed === true;

const results = [];
const steps = [
  ['module-6-react-register', 'npm', ['run', 'module-6:react-register:gate']],
  ['module-6-react-workflow-static', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-6-web-api-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/wbs-cost-codes/api/wbs-cost-codes-api.ts']],
  ['module-6-web-hooks-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/web/src/features/wbs-cost-codes/hooks/wbs-cost-codes.ts']],
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
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_REACT_WORKFLOW_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_9_REACT_WORKFLOW_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-react-workflow-evidence',
  generatedAt: new Date().toISOString(),
  pass: 186,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  reactCoverage: [
    'permission-aware Module 6 workspace navigation',
    'Project selection through the existing Project register contract',
    'WBS tree readback with server-derived hierarchy level',
    'React Hook Form plus Zod WBS create and update forms',
    'bounded Company Cost Code master list and create form',
    'complete-set Project mapping editor using WBS, Cost Code and Cost Type UUID relationships',
    'client-side duplicate mapping validation plus authoritative server error display',
    'bodyless freeze command with session-only acknowledgement instead of invented durable freeze state',
    'no browser-owned Company, actor, permission, Project scope or WBS level fields'
  ],
  unresolvedReactContract: [
    'Cost Type master cannot be completed because the reviewed API defines no Cost Type list/create route.',
    'Archive controls remain absent because the reviewed API defines no archive command.',
    'Persistent freeze status and reopen/revision controls remain absent because the reviewed contract defines no durable freeze-state or reopen API.',
    'The current auth identity exposes company permissions and Project scope, but not exact effective permissions per Project; Project-scoped action visibility cannot be made exact without an explicit contract change.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  componentsGenerated: 1,
  pagesGenerated: 1,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: 'Pass 187 - Module 6 Playwright WBS, Cost Code, mapping, permission and freeze workflow verification.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 React-workflow evidence written to ${written}`);

if (!passed) process.exitCode = 1;
