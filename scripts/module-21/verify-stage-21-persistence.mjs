import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-persistence.json');

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
  ['module-21-contract', 'npm', ['run', 'module-21:contract:gate']],
  ['module-21-persistence-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['migration-system-suite', 'node', ['--test', 'tests/migration-system.test.mjs']],
  ['database-schema-suite', 'node', ['--test', 'tests/database.test.mjs']],
  ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']],
  ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
];

for (const [name, command, args] of steps) {
  const result = await runStep(name, command, args);
  results.push(result);
  if (result.status !== 'passed') break;
}

const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
const status = passed
  ? (stage20LiveAccepted
      ? 'STAGE_21_MODULE_21_PERSISTENCE_PREPARED_SCHEMA_PENDING'
      : 'STAGE_21_MODULE_21_PERSISTENCE_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-persistence-evidence',
  generatedAt: new Date().toISOString(),
  pass: 323,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  migration: '20260826000100_module_21_project_scheduling_core',
  ownedTables: [
    'project_schedules',
    'schedule_activities',
    'schedule_dependencies',
    'schedule_baselines',
    'schedule_progress_updates',
  ],
  oneCurrentSchedulePerProject: true,
  projectCompanyForeignKeyEnforced: true,
  activityCodeUniqueInsideSchedule: true,
  activityParentSameScheduleEnforced: true,
  optionalWbsSameProjectEnforced: true,
  activityPercentPrecision: 'DECIMAL(7,4)',
  activityPercentRangeEnforced: true,
  actualFinishRequiresComplete: true,
  guaranteedDependencyTypes: ['FS'],
  dependencyLagUsesWholeNonnegativeDays: true,
  dependencySameScheduleEnforced: true,
  dependencyCycleCheckPrepared: true,
  baselineNumberUniqueInsideSchedule: true,
  baselineSnapshotsImmutableAtDatabase: true,
  baselineCreatorSameCompanyEnforced: true,
  progressPercentPrecision: 'DECIMAL(7,4)',
  progressActivitySameScheduleEnforced: true,
  progressUpdaterSameCompanyEnforced: true,
  progressHistoryImmutableAtDatabase: true,
  progressActivityDateUniquenessInvented: false,
  statusEnumsInvented: false,
  activityOwnerOrDurationInvented: false,
  advancedCpmOrP6PersistenceInvented: false,
  externalSchedulerPersistenceInvented: false,
  changeOrderIntegrationGeneratedEarly: false,
  dailyReportIntegrationGeneratedEarly: false,
  apiSchemaGenerated: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  publicRoutesGenerated: false,
  reactGenerated: false,
  productionRuntimeActivationAllowed: false,
  unresolvedSourceAmbiguities: [
    'Project Schedule and Schedule Activity status vocabularies remain undefined.',
    'Activity owner and persisted planned duration remain undefined.',
    'Hierarchy depth and full parent-cycle policy remain undefined beyond same-Schedule and no-self-parent persistence checks.',
    'Dependency types beyond FS and lead/fractional lag behavior remain undefined.',
    'Canonical baseline snapshot_json key shape and baseline numbering start remain undefined.',
    'Baseline reopen/revision lifecycle and exact SCHEDULE_BASELINE_LOCKED scope remain undefined.',
    'Forecast start and complete revised-forecast persistence remain undefined.',
    'Look-ahead query names/start-date semantics remain undefined.',
    'Progress duplicate/replace and approval policies remain undefined.',
    'schedule.milestone_changed emission condition remains undefined.',
  ],
  nextPass: passed
    ? 'Pass 324 - Module 21 strict Zod/API schema boundary for the eight reviewed Scheduling operations.'
    : 'Repair the failed Pass-323 persistence check before continuing Stage 21.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 persistence evidence written to ${written}`);

if (!passed) process.exitCode = 1;
