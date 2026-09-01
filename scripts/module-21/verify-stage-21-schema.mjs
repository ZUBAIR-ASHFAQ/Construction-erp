import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const STAGE_20_ACCEPTED = 'STAGE_20_ACCEPTED_READY_FOR_STAGE_21';
const evidencePath = path.resolve('module-21-evidence', 'stage-21-schema.json');

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
  ['module-21-persistence', 'npm', ['run', 'module-21:persistence:gate']],
  ['module-21-schema-suite', 'node', ['--test', 'tests/module-21-static.test.mjs']],
  [
    'module-21-schema-typescript-syntax',
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
      'apps/api/src/modules/scheduling/scheduling.schema.ts'
    ]
  ],
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
      ? 'STAGE_21_MODULE_21_SCHEMA_READY_FOR_PASS_325'
      : 'STAGE_21_MODULE_21_SCHEMA_PREPARED_STAGE_20_LIVE_HANDOFF_PENDING')
  : 'BLOCKED';
const evidence = {
  formatVersion: 1,
  kind: 'construction-erp-stage-21-module-21-project-scheduling-schema-evidence',
  generatedAt: new Date().toISOString(),
  pass: 324,
  stage: 21,
  module: '21 - Project Scheduling',
  status,
  stage20LiveAccepted,
  schemaFile: 'apps/api/src/modules/scheduling/scheduling.schema.ts',
  reviewedRouteCount: 8,
  reviewedPermissions: [
    'schedule.read',
    'schedule.manage',
    'schedule.baseline',
    'schedule.progress'
  ],
  reviewedErrors: [
    'SCHEDULE_NOT_FOUND',
    'DUPLICATE_ACTIVITY_CODE',
    'SCHEDULE_DEPENDENCY_CYCLE',
    'SCHEDULE_BASELINE_LOCKED',
    'INVALID_PROGRESS_UPDATE'
  ],
  reviewedEvents: [
    'schedule.created',
    'schedule.baselined',
    'schedule.progress_updated',
    'schedule.milestone_changed'
  ],
  createScheduleBrowserFields: ['name', 'dataDate'],
  createActivityBrowserFields: [
    'parentId',
    'activityCode',
    'name',
    'wbsNodeId',
    'plannedStart',
    'plannedFinish',
    'milestone'
  ],
  activityProgressFieldsAcceptedOnPlanningCreateOrPatch: false,
  activityStatusAcceptedFromBrowser: false,
  dependencyTypesAccepted: ['FS'],
  dependencyLagWholeNonnegativeDays: true,
  dependencyCycleValidatedInSchemaOnly: false,
  baselineBodyless: true,
  baselineSnapshotBrowserOwned: false,
  baselineSnapshotCanonicalKeys: ['schedule', 'activities', 'dependencies'],
  progressBrowserFields: [
    'activityId',
    'dataDate',
    'percentComplete',
    'actualStart',
    'actualFinish',
    'forecastFinish',
    'remarks'
  ],
  percentCompleteSerializedAsExactDecimalString: true,
  actualFinishRequiresCompleteAtApiBoundary: true,
  lookaheadQueryFiltersInvented: false,
  scheduleStatusEnumInvented: false,
  activityStatusEnumInvented: false,
  activityOwnerOrDurationInvented: false,
  advancedCpmOrP6FieldsInvented: false,
  extraRoutesInvented: false,
  extraPermissionsInvented: false,
  repositoryGenerated: false,
  serviceGenerated: false,
  routesGenerated: false,
  indexGenerated: false,
  reactGenerated: false,
  runtimeDeploymentAllowed: passed && stage20LiveAccepted,
  remainingSourceAmbiguities: [
    'Project Schedule and Schedule Activity status vocabularies remain undefined.',
    'Activity owner and persisted planned duration remain undefined.',
    'Full Activity parent-cycle policy remains a service concern beyond no-self/same-Schedule persistence.',
    'Dependency types beyond FS and lead/fractional lag behavior remain undefined.',
    'Baseline numbering start and reopen/revision policy remain undefined.',
    'Exact SCHEDULE_BASELINE_LOCKED scope and post-baseline editable Activity fields remain undefined.',
    'Look-ahead start-date/window semantics remain undefined; no query filters are accepted in Pass 324.',
    'Progress duplicate/replace and approval policy remain undefined.',
    'schedule.milestone_changed emission condition remains undefined.',
    'Change Order and Daily Report integrations remain downstream.'
  ],
  nextPass: passed
    ? 'Pass 325 - Module 21 Company/Project-scoped Scheduling repository primitives using only the Pass-324 schemas and Pass-323 persistence.'
    : 'Repair the failed Pass-324 schema check before generating the Module-21 repository.',
  environment: safeEnvironmentSummary(process.env),
  checks: results
};

const written = await writeEvidence(evidencePath, evidence);
console.log(`Module 21 Stage-21 schema evidence written to ${written}`);

if (!passed) process.exitCode = 1;
