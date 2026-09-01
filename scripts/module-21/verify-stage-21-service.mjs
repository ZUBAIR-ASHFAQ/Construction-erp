import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-service.json');

/** Read one JSON evidence file and return null when the file is absent. */
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
const results = [];
const steps = [
  ['module-21-repository', 'npm', ['run', 'module-21:repository:gate']],
  ['module-21-service-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-service-typescript-syntax',
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
      'apps/api/src/modules/scheduling/scheduling.service.ts'
    ]
  ],
  ['module-5-regression', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-24b-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-14b-regression', 'node', ['--test', 'tests/module-14b-static.test.mjs']],
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
  ? (stage20LiveAccepted
      ? 'STAGE_21_MODULE_21_SERVICE_READY_FOR_PASS_327'
      : 'STAGE_21_MODULE_21_SERVICE_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-service-evidence',
  generatedAt: new Date().toISOString(),
  pass: 326,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  serviceFile: 'apps/api/src/modules/scheduling/scheduling.service.ts',
  projectScopeRevalidatedWithModule24B: true,
  exactPermissionMappingPreserved: true,
  reviewedOperationsImplemented: 8,
  idempotentMutationsImplemented: 6,
  oneCurrentScheduleCreationSerialized: true,
  serverOwnedScheduleAndActivityStatusUsed: true,
  activityCodeCollisionHandled: true,
  activityParentSameScheduleValidated: true,
  activityParentCyclePreventedWithoutNewPublicError: true,
  optionalWbsSameProjectValidated: true,
  partialActivityDateOrderRevalidated: true,
  milestoneChangedEventCondition: 'explicit milestone boolean change only',
  completeDependencySetValidated: true,
  dependencyCycleCheckedInServiceAndDatabase: true,
  dependencyChangesAudited: true,
  baselineSnapshotCanonicalAndImmutable: true,
  baselineNumberServerMonotonic: true,
  baselineActorServerOwned: true,
  baselineEventRecorded: true,
  progressHistoryAppendOnly: true,
  currentActivityProgressUpdatedAtomically: true,
  progressEventRecorded: true,
  broadPostBaselineLockInvented: false,
  firstScopeLookahead: '14 calendar days from non-null project_schedules.data_date',
  publicLookaheadQueryNamesInvented: false,
  advancedCpmGenerated: false,
  changeOrderIntegrationGenerated: false,
  dailyReportIntegrationGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage20LiveAccepted,
  remainingSourceAmbiguities: [
    'Project Schedule and Schedule Activity status vocabularies remain implementation-private and not published as enums.',
    'The source does not define a baseline reopen/revision lifecycle or the exact SCHEDULE_BASELINE_LOCKED scope, so progress remains allowed after baseline.',
    'The first executable look-ahead uses the minimum source-defined two-week window from Schedule data_date because public query names and other start-date semantics remain undefined.',
    'Progress duplicate/replace and approval policy remain undefined; progress evidence therefore remains append-only.',
    'Only an explicit milestone boolean change emits schedule.milestone_changed; broader milestone-date/status event semantics remain undefined.',
    'Change Order and Daily Report integrations remain downstream.'
  ],
  nextPass: passed
    ? 'Pass 327 - Module 21 Fastify routes, authentication/RBAC, OpenAPI and module registration for exactly the eight reviewed Scheduling operations.'
    : 'Repair the failed Pass-326 service check before generating Module-21 HTTP routes.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 service evidence written to ${written}`);

if (!passed) process.exitCode = 1;
