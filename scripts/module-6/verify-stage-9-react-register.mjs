import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-react-register.json');

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
  ['module-6-api-contract-static', 'npm', ['run', 'module-6:api-contract:gate']],
  ['module-6-react-static-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
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
      ? 'STAGE_9_REACT_REGISTER_PREPARED_FOR_DEPENDENCY_BACKED_BUILD'
      : 'STAGE_9_REACT_REGISTER_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-react-register-evidence',
  generatedAt: new Date().toISOString(),
  pass: 185,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  reactCoverage: [
    'typed browser API for exactly the seven reviewed Module 6 operations',
    'TanStack Query WBS-tree and bounded Cost Code reads',
    'TanStack Query WBS create/update, Cost Code create, mapping replacement and freeze mutations',
    'single Module 6 query family invalidated after successful mutations',
    'no browser-owned Company, actor, permission, Project scope or derived WBS level fields',
    'bodyless browser freeze command',
    'no invented Cost Type CRUD, archive or reopen browser API'
  ],
  unresolvedReactContract: [
    'Cost Type master cannot be completed because the reviewed API defines no Cost Type read/create route.',
    'Archive controls remain absent because the reviewed API defines no archive command.',
    'Persistent freeze status and reopen/revision controls remain absent because the reviewed contract defines no durable freeze-state or reopen API.'
  ],
  productionBackendChanges: 0,
  databaseChanges: 0,
  componentsGenerated: false,
  pagesGenerated: false,
  runtimeVerificationComplete: false,
  dependencyBackedWebBuildRequired: true,
  nextPass: 'Pass 186 - Module 6 React WBS tree, Cost Code, Project mapping, validation and freeze workflow.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 React-register evidence written to ${written}`);

if (!passed) process.exitCode = 1;
