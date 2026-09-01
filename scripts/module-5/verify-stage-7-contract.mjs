import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_6 = 'STAGE_6_ACCEPTED_READY_FOR_STAGE_7';
const evidencePath = path.resolve('module-5-evidence', 'stage-7-contract.json');

/** Read Module 4A live evidence without treating missing or blocked evidence as acceptance. */
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
  ['module-4a-static-prerequisite', 'npm', ['run', 'module-4a:gate']],
  ['module-5-contract-suite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-5-stage-7-contract-evidence',
  generatedAt: new Date().toISOString(),
  status: passed
    ? (stage6LiveAccepted
        ? 'STAGE_7_CONTRACT_FROZEN_READY_FOR_IMPLEMENTATION'
        : 'STAGE_7_CONTRACT_FROZEN_STAGE_6_LIVE_ACCEPTANCE_PENDING')
    : 'BLOCKED',
  module: '5 - Project Management',
  contractOnly: true,
  stage6LiveAccepted,
  ownedTables: ['projects', 'project_status_history'],
  deferredToModule24B: ['project_members', 'PUT /api/v1/projects/:id/members', 'project.member_changed'],
  approvedStage7RouteCount: 7,
  stage7Permissions: ['projects.read', 'projects.create', 'projects.update', 'projects.activate', 'projects.close'],
  reservedModule24BPermission: 'projects.manage_members',
  stage7Events: ['project.created', 'project.activated', 'project.completed', 'project.closed'],
  runtimeImplementationAllowed: passed && stage6LiveAccepted,
  nextPass: passed && stage6LiveAccepted
    ? 'Pass 138 - Module 5 Prisma models and reviewed migration'
    : 'Pass 138 persistence may be prepared, but Stage 7 activation remains blocked until Module 4A live Stage-6 acceptance',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 5 Stage-7 contract evidence written to ${written}`);

if (passed) {
  console.log(stage6LiveAccepted
    ? 'Module 5 contract frozen. Stage 7 runtime implementation may begin with Pass 138.'
    : 'Module 5 contract frozen. Stage 7 activation remains blocked until Stage 6 live acceptance.');
} else {
  process.exitCode = 1;
}
