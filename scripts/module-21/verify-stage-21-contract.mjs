import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-contract.json');

/** Read one optional JSON evidence file and return null when it is absent. */
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
  ['module-5-project-prerequisite', 'node', ['--test', 'tests/module-5-static.test.mjs']],
  ['module-6-optional-wbs-regression', 'node', ['--test', 'tests/module-6-static.test.mjs']],
  ['module-24b-project-scope-regression', 'node', ['--test', 'tests/module-24b-static.test.mjs']],
  ['module-14b-stage-20-regression', 'node', ['--test', 'tests/module-14b-static.test.mjs']],
  ['module-21-contract-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  ['workspace-contract', 'node', ['scripts/check-workspace.mjs']],
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
      ? 'STAGE_21_MODULE_21_CONTRACT_FROZEN_READY_FOR_PASS_323'
      : 'STAGE_21_MODULE_21_CONTRACT_FROZEN_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-contract-evidence',
  generatedAt: new Date().toISOString(),
  pass: 322,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  contractOnly: true,
  stage20LiveAccepted,
  hardPrerequisites: ['5 - Project Management'],
  optionalPrerequisites: ['6 - WBS & Cost Codes for optional activity mapping'],
  projectScopeReusesModule24B: true,
  ownedTables: [
    'project_schedules',
    'schedule_activities',
    'schedule_dependencies',
    'schedule_baselines',
    'schedule_progress_updates',
  ],
  reviewedRouteCount: 8,
  reviewedRoutes: [
    'GET /api/v1/projects/:projectId/schedule',
    'POST /api/v1/projects/:projectId/schedule',
    'POST /api/v1/projects/:projectId/schedule/activities',
    'PATCH /api/v1/projects/:projectId/schedule/activities/:id',
    'PUT /api/v1/projects/:projectId/schedule/dependencies',
    'POST /api/v1/projects/:projectId/schedule/baseline',
    'POST /api/v1/projects/:projectId/schedule/progress',
    'GET /api/v1/projects/:projectId/schedule/lookahead',
  ],
  reviewedPermissions: [
    'schedule.read',
    'schedule.manage',
    'schedule.baseline',
    'schedule.progress',
  ],
  reviewedErrors: [
    'SCHEDULE_NOT_FOUND',
    'DUPLICATE_ACTIVITY_CODE',
    'SCHEDULE_DEPENDENCY_CYCLE',
    'SCHEDULE_BASELINE_LOCKED',
    'INVALID_PROGRESS_UPDATE',
  ],
  reviewedEvents: [
    'schedule.created',
    'schedule.baselined',
    'schedule.progress_updated',
    'schedule.milestone_changed',
  ],
  oneCurrentSchedulePerProject: true,
  activityCodeUniqueInsideSchedule: true,
  optionalWbsMapping: true,
  dependencyGraphCycleFree: true,
  guaranteedDependencyTypes: ['FS'],
  baselineSnapshotImmutable: true,
  baselineNumberUniqueInsideSchedule: true,
  fullCpmP6ParityClaimed: false,
  externalSchedulerIntegrationGenerated: false,
  changeOrderIntegrationGeneratedEarly: false,
  dailyReportIntegrationGeneratedEarly: false,
  extraPermissionsInvented: false,
  extraRoutesInvented: false,
  productionFilesGenerated: false,
  databaseMigrationGenerated: false,
  unresolvedSourceAmbiguities: [
    'Project Schedule status vocabulary is not enumerated.',
    'Schedule Activity status vocabulary is not enumerated.',
    'The workflow requires an activity owner, but no owner field is defined.',
    'The workflow mentions planned duration, but no duration field is defined.',
    'Activity hierarchy depth and parent-change/cycle rules are not defined.',
    'Dependency types other than guaranteed finish-start are not enumerated.',
    'Negative lead and fractional lag-day semantics are not defined.',
    'The canonical baseline snapshot_json shape is not defined.',
    'The baseline numbering start value is not defined.',
    'The baseline reopen/revision lifecycle and exact SCHEDULE_BASELINE_LOCKED scope are not defined.',
    'The exact post-baseline Activity fields that remain editable are not enumerated.',
    'Forecast start and complete revised-forecast persistence are not defined.',
    'Look-ahead query parameter names and start-date semantics are not defined.',
    'Progress duplicate/replace behavior for one Activity/data_date is not defined.',
    'Progress approval is not defined.',
    'The schedule.milestone_changed emission condition is not defined.',
    'Optional baseline-approval notification has no Scheduling approval route or dependency.',
    'Approved Change Order schedule impact is deferred to Module 17 and Stage 27 integration.',
    'External scheduler import/sync contracts are intentionally absent.',
    'Advanced CPM/P6 calculations, calendars and resources are outside medium scope.',
  ],
  productionRuntimeActivationAllowed: passed && stage20LiveAccepted,
  persistencePreparationAllowed: passed,
  nextPass: passed
    ? 'Pass 323 - Module 21 Project Scheduling Prisma models, constraints, indexes and Stage-21 migration. Deployment remains blocked until the Stage-20 live handoff is genuine.'
    : 'Repair the failed Pass-322 contract check before preparing Stage-21 Project Scheduling persistence.',
  environment: safeEnvironmentSummary(process.env),
  checks: results,
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 contract evidence written to ${written}`);

if (!passed) process.exitCode = 1;
