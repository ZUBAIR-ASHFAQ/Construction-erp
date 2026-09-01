import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

/** Return whether one repository path exists. */
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('R13 removes repository and service methods with no active caller', async () => {
  const [admin, documents, employees, finance] = await Promise.all([
    read('apps/api/src/modules/administration/administration.repository.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.repository.ts'),
    read('apps/api/src/modules/employees/employees.repository.ts'),
    read('apps/api/src/modules/finance/finance.service.ts')
  ]);

  assert.doesNotMatch(admin, /listActiveProjectIdsForUser|ActiveProjectMembershipLookupInput/);
  assert.match(admin, /resolveProjectScopeForAuthentication[\s\S]*?userProjectScope\.findMany/);
  assert.doesNotMatch(documents, /listDocumentLinks\(/);
  assert.doesNotMatch(employees, /findEmployeeCompensationForDate\(/);
  assert.doesNotMatch(finance, /async postSourceJournal\(/);
  assert.match(finance, /async postSourceJournalInTransaction\(/);
});

test('R13 removes unused production imports, constants, and compatibility aliases', async () => {
  const [stageService, payrollService, shared, contracts, numbering] = await Promise.all([
    read('apps/api/src/modules/project-stages/project-stages.service.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('packages/shared/src/index.ts'),
    read('packages/contracts/src/index.ts'),
    read('packages/numbering/src/types.ts')
  ]);

  assert.doesNotMatch(stageService, /\bwithTransaction\b/);
  assert.doesNotMatch(payrollService, /ATTENDANCE_PRESENT/);
  assert.doesNotMatch(shared, /API_VERSION_PREFIX/);
  assert.doesNotMatch(contracts, /ServiceStatus/);
  assert.doesNotMatch(numbering, /NumberingTransaction|TransactionClient/);
});

test('R13 removes schema type aliases that had no consumer', async () => {
  const source = (await Promise.all([
    read('apps/api/src/modules/client-receipts/client-receipts.schema.ts'),
    read('apps/api/src/modules/administration/administration.schema.ts'),
    read('apps/api/src/modules/equipment/equipment.schema.ts'),
    read('apps/api/src/modules/project-team/project-team.schema.ts'),
    read('apps/api/src/modules/project-stages/project-stages.schema.ts'),
    read('apps/api/src/modules/client-billing/client-billing.schema.ts')
  ])).join('\n');

  for (const name of [
    'ClientReceiptIdParams', 'UserIdParams', 'RoleIdParams', 'SignOutBody', 'EmptyCommandBody',
    'Module12EventType', 'ProjectTeamProjectParams', 'ProjectTeamAssignmentParams',
    'ProjectStageProjectParams', 'ProjectStageParams', 'StageProgressApprovalParams',
    'ClientBillingMethod', 'ProgressClaimStatus', 'administrationErrorCodeSchema'
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${name}\\b`), `${name} should stay removed.`);
  }
});

test('R13 deliverable does not carry generated recovery backup directories', async () => {
  assert.equal(await exists('backups'), false);
});
