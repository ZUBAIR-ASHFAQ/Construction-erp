import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { runStep, safeEnvironmentSummary, writeEvidence } from '../foundation/gate-lib.mjs';

const ACCEPTED_STAGE_7 = 'STAGE_7_ACCEPTED_READY_FOR_STAGE_8';
const modeArg = process.argv.find((argument) => argument.startsWith('--mode='));
const mode = modeArg?.split('=')[1] ?? 'static';
const evidencePath = path.resolve(
  'module-18-evidence',
  mode === 'live' ? 'project-relationship-persistence-live.json' : 'project-relationship-persistence.json'
);

/** Read genuine Stage-7 acceptance before running the Project-dependent migration against PostgreSQL. */
async function readStage7LiveAcceptance() {
  try {
    return JSON.parse(await readFile('module-5-evidence/stage-7-live.json', 'utf8'));
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return null;
    throw error;
  }
}

/** Write one blocked persistence result without touching the migration-test database. */
async function writeBlockedEvidence(reason, stage7LiveAccepted) {
  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-relationship-persistence-repair',
    generatedAt: new Date().toISOString(),
    status: 'BLOCKED',
    pass: 168,
    mode,
    stage7LiveAccepted,
    reason,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: false,
    nextPass: 'Pass 169 - Module 18 Project repository and service security repair.',
    environment: safeEnvironmentSummary(process.env),
    checks: []
  };
  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project persistence evidence written to ${written}`);
}

if (!['static', 'live'].includes(mode)) {
  throw new Error('Module 18 Project relationship persistence gate mode must be static or live.');
}

const stage7 = await readStage7LiveAcceptance();
const stage7LiveAccepted = stage7?.status === ACCEPTED_STAGE_7;

if (mode === 'live' && !stage7LiveAccepted) {
  await writeBlockedEvidence('STAGE_7_LIVE_ACCEPTANCE_REQUIRED', false);
  process.exitCode = 1;
} else if (mode === 'live' && !process.env.MIGRATION_TEST_DATABASE_URL) {
  await writeBlockedEvidence('MIGRATION_TEST_DATABASE_URL_REQUIRED', true);
  process.exitCode = 1;
} else if (mode === 'live' && process.env.MIGRATION_TEST_CONFIRM !== 'RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE') {
  await writeBlockedEvidence('MIGRATION_TEST_CONFIRM_REQUIRED', true);
  process.exitCode = 1;
} else {
  const results = [];
  const steps = [
    ['pass-167-react-readback', 'npm', ['run', 'module-24b:react-readback:gate']],
    ['module-18-focused-static', 'node', ['--test', 'tests/module-18-static.test.mjs']],
    ['migration-system-static', 'node', ['--test', 'tests/migration-system.test.mjs']],
    ['migration-policy', 'node', ['scripts/migrations/check-migrations.mjs']],
    ['workspace-and-stack', 'node', ['scripts/check-workspace.mjs']]
  ];

  if (mode === 'live') {
    steps.push(['prisma-project-relationship-migration', 'npm', ['run', 'db:migrations:verify']]);
  }

  for (const [name, command, args] of steps) {
    const result = await runStep(name, command, args);
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const passed = results.length === steps.length && results.every((result) => result.status === 'passed');
  const status = passed
    ? (mode === 'live'
        ? 'MODULE_18_PROJECT_RELATIONSHIP_PERSISTENCE_VERIFIED_REPAIR_HOLD_ACTIVE'
        : 'MODULE_18_PROJECT_RELATIONSHIP_PERSISTENCE_PREPARED_REPAIR_HOLD_ACTIVE')
    : 'BLOCKED';

  const evidence = {
    formatVersion: 1,
    kind: 'construction-erp-module-18-project-relationship-persistence-repair',
    generatedAt: new Date().toISOString(),
    status,
    pass: 168,
    mode,
    stage7LiveAccepted,
    migration: '20260823000600_module_18_project_relationship_activation',
    persistenceCoverage: [
      'document_folders gains nullable same-company project_id ownership',
      'documents gains nullable same-company project_id ownership',
      'document_upload_intents carries the trusted nullable Project target through the signed-upload lifecycle',
      'folder trees cannot mix company-wide and Project-scoped ownership',
      'documents cannot be placed in a folder with a different nullable Project scope',
      'upload intents cannot disagree with their folder or existing document Project scope',
      'existing company-wide rows remain valid because project_id is nullable'
    ],
    productionBackendBehaviorChanges: 0,
    apiRoutesAdded: 0,
    permissionsAdded: 0,
    migrationCountAdded: 1,
    repairHoldActive: true,
    module6Allowed: false,
    runtimeVerificationComplete: passed && mode === 'live' && stage7LiveAccepted,
    nextPass: 'Pass 169 - Module 18 Project repository and service security repair.',
    environment: safeEnvironmentSummary(process.env),
    checks: results
  };

  const written = await writeEvidence(evidencePath, evidence);
  console.log(`Module 18 Project persistence evidence written to ${written}`);
  if (!passed) process.exitCode = 1;
}
