import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_8_ACCEPTED = 'STAGE_8_ACCEPTED_READY_FOR_STAGE_9';
const PASS_175_ACCEPTED = 'PASS_175_FINAL_REPAIR_AUDIT_ACCEPTED_READY_FOR_MODULE_6';
const HOLD_CLEARED = 'STAGE_8_REPAIR_HOLD_CLEARED';
const evidencePath = path.resolve('module-6-evidence', 'stage-9-service.json');

/** Read one JSON evidence file and return null when it is absent. */
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

const repositoryEvidence = await readJson('module-6-evidence/stage-9-repository.json');
const repositoryPrepared = repositoryEvidence?.pass === 179
  && [
    'STAGE_9_REPOSITORY_READY_FOR_PASS_180',
    'STAGE_9_REPOSITORY_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING'
  ].includes(repositoryEvidence?.status)
  && Array.isArray(repositoryEvidence?.checks)
  && repositoryEvidence.checks.every((check) => check.status === 'passed');

const results = [{
  name: 'module-6-repository-evidence',
  status: repositoryPrepared ? 'passed' : 'failed',
  startedAt: new Date().toISOString(),
  finishedAt: new Date().toISOString(),
  code: repositoryPrepared ? 0 : 1,
  signal: null
}];
const steps = [
  ['module-6-service-suite', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-6-service-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts']],
  ['module-6-repository-syntax', 'node', ['--experimental-strip-types', '--check', 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.repository.ts']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']]
];

if (repositoryPrepared) {
  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }
}

const passed = repositoryPrepared
  && results.length === steps.length + 1
  && results.every((result) => result.status === 'passed');
const status = passed
  ? (module6LiveHandoffAccepted
      ? 'STAGE_9_SERVICE_READY_FOR_PASS_181'
      : 'STAGE_9_SERVICE_PREPARED_STAGE_8_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';

const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-module-6-stage-9-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 180,
  stage: 9,
  module: '6 - WBS & Cost Codes',
  status,
  module6LiveHandoffAccepted,
  serviceFile: 'apps/api/src/modules/wbs-cost-codes/wbs-cost-codes.service.ts',
  serviceBoundary: {
    exactProjectPermissionRevalidation: true,
    serverDerivedHierarchyLevel: true,
    hierarchyCyclePrecheck: true,
    descendantLevelsRemainConsistent: true,
    wholeSetMappingReplacementIsTransactional: true,
    activePostingReferencesRequired: true,
    auditAndOutboxShareBusinessTransactions: true
  },
  reviewedEvents: [
    'wbs.node_created',
    'wbs.updated',
    'cost_code.created',
    'project.cost_structure_frozen'
  ],
  intentionallyAbsent: [
    'Cost Type CRUD because the reviewed Stage-9 HTTP table defines no Cost Type operations.',
    'Archive/reopen service commands because the reviewed API table defines none.',
    'A mapping-changed outbox event because the source event list does not define one.',
    'Durable freeze state or mutation blocking after freeze because the source defines no storage/reopen contract.'
  ],
  unresolvedSourceAmbiguities: [
    'Cost Type master has no reviewed list/create HTTP operation.',
    'Unused-code/node archive has no reviewed command.',
    'The freeze command has no durable freeze-state model or reviewed reopen/revision command.',
    'Public status/category vocabularies remain unenumerated.'
  ],
  routesGenerated: false,
  reactRuntimeGenerated: false,
  runtimeDeploymentAllowed: passed && module6LiveHandoffAccepted,
  nextPass: passed
    ? 'Pass 181 - Module 6 Fastify routes, module index and app registration using the seven reviewed operations only.'
    : 'Repair the failed Pass-180 service check before generating Module-6 routes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 6 Stage-9 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
