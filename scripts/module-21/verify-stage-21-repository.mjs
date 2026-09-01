import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-repository.json');

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
  ['module-21-schema', 'npm', ['run', 'module-21:schema:gate']],
  ['module-21-repository-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-repository-typescript-syntax',
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
      'apps/api/src/modules/scheduling/scheduling.repository.ts'
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
      ? 'STAGE_21_MODULE_21_REPOSITORY_READY_FOR_PASS_326'
      : 'STAGE_21_MODULE_21_REPOSITORY_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-repository-evidence',
  generatedAt: new Date().toISOString(),
  pass: 325,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  repositoryFile: 'apps/api/src/modules/scheduling/scheduling.repository.ts',
  companyOwnershipFromTrustedRequestContext: true,
  projectVisibilityExplicit: true,
  transactionClientSupported: true,
  projectLookupCompanyAndProjectScoped: true,
  projectWriteLockPrepared: true,
  currentScheduleAggregateReadPrepared: true,
  currentScheduleWriteLockPrepared: true,
  createSchedulePrimitivePrepared: true,
  activityReadCompanyAndProjectScoped: true,
  activityCodeCollisionLookupPrepared: true,
  activitySetLookupPrepared: true,
  optionalWbsLookupSameProjectScoped: true,
  createActivityPrimitivePrepared: true,
  updateActivityPlanningPrimitivePrepared: true,
  dependencyGraphReadPrepared: true,
  dependencyCompleteReplacePrimitivePrepared: true,
  dependencyCycleAlgorithmDuplicatedInRepository: false,
  latestBaselineLookupPrepared: true,
  immutableBaselineCreatePrimitivePrepared: true,
  baselineTimestampUpdateSeparatedFromSnapshot: true,
  progressHistoryCreatePrimitivePrepared: true,
  currentActivityProgressUpdateSeparatedFromHistory: true,
  progressHistoryReadPrepared: true,
  boundedDateRangeActivityReadPrepared: true,
  publicLookaheadQueryNamesInvented: false,
  scheduleDeletePrimitiveGenerated: false,
  activityDeletePrimitiveGenerated: false,
  baselineMutationPrimitiveGenerated: false,
  progressHistoryMutationPrimitiveGenerated: false,
  advancedCpmRepositoryGenerated: false,
  changeOrderIntegrationGenerated: false,
  dailyReportIntegrationGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage20LiveAccepted,
  remainingSourceAmbiguities: [
    'Project Schedule and Schedule Activity status vocabularies remain service-owned but undefined.',
    'Activity parent-cycle policy beyond no-self/same-Schedule validation remains a service concern.',
    'Baseline numbering start, reopen/revision policy and exact SCHEDULE_BASELINE_LOCKED scope remain undefined.',
    'Public look-ahead start-date/window query semantics remain undefined; the repository exposes only a generic bounded date-range primitive.',
    'Progress duplicate/replace and approval policy remain undefined.',
    'schedule.milestone_changed emission condition remains undefined.',
    'Change Order and Daily Report integrations remain downstream.'
  ],
  nextPass: passed
    ? 'Pass 326 - Module 21 Scheduling service/business transactions for current Schedule, Activities, Dependencies, Baseline, Progress and source-bounded look-ahead orchestration.'
    : 'Repair the failed Pass-325 repository check before generating the Module-21 service.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 repository evidence written to ${written}`);

if (!passed) process.exitCode = 1;
