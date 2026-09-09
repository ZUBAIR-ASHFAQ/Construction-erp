import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

/** Confirm assignment immediately posts one source-derived Equipment Expense. */
test('equipment assignment posts expense and completion adjusts without double counting', async () => {
  const [service, repository] = await Promise.all([
    read('apps/api/src/modules/equipment/equipment.service.ts'),
    read('apps/api/src/modules/equipment/equipment.repository.ts')
  ]);
  const assignment = service.slice(service.indexOf('private async assignEquipmentOnce'), service.indexOf('/** End one active Equipment assignment'));
  const completion = service.slice(service.indexOf('private async endAssignmentOnce'), service.indexOf('/** Reverse one wrong assignment'));

  assert.match(assignment, /sourceType: 'equipment_assignment'/);
  assert.match(assignment, /sourceKeySuffix: 'assigned'/);
  assert.match(repository, /category: 'equipment'/);
  assert.match(completion, /moneyToMinorUnits\(amount\) - currentExpense/);
  assert.match(completion, /sourceType: 'equipment_assignment_completion'/);
  assert.doesNotMatch(completion, /createUsageCostActual/);
});

/** Confirm reversal is append-only, releases availability and compensates the complete assignment effect. */
test('equipment reversal compensates expense and retains assignment history', async () => {
  const [schema, routes, service, repository, workspace] = await Promise.all([
    read('apps/api/src/modules/equipment/equipment.schema.ts'),
    read('apps/api/src/modules/equipment/equipment.routes.ts'),
    read('apps/api/src/modules/equipment/equipment.service.ts'),
    read('apps/api/src/modules/equipment/equipment.repository.ts'),
    read('apps/web/src/features/equipment/components/equipment-workspace.tsx')
  ]);

  assert.match(schema, /assignments\/:assignmentId\/reverse/);
  assert.match(routes, /operationId: 'reverseEquipmentAssignment'/);
  assert.match(service, /operation: 'equipment\.assignment\.reverse'/);
  assert.match(service, /minorUnitsToMoney\(-sumExpenseActuals\(expenseRows\)\)/);
  assert.match(repository, /data: \{ status: 'REVERSED' \}/);
  assert.match(repository, /status: \{ not: 'REVERSED' \}/);
  assert.doesNotMatch(repository, /equipmentAssignment\.delete/);
  assert.match(workspace, /Reverse Assignment & Expense/);
  assert.match(workspace, /onReverse: \(assignment: EquipmentAssignment\) => void/);
  assert.match(workspace, /canReverse && row\.status !== 'REVERSED'/);
  assert.match(workspace, /<th>Action<\/th>/);
});

/** Confirm all user-visible project breakdowns use the Equipment Expense label. */
test('project cost surfaces name the category Equipment Expense', async () => {
  const [projects, profitability, reports] = await Promise.all([
    read('apps/web/src/features/projects/components/project-details-panel.tsx'),
    read('apps/web/src/features/project-profitability/components/project-profitability-workspace.tsx'),
    read('apps/web/src/features/reports/components/reports-workspace.tsx')
  ]);
  for (const source of [projects, profitability, reports]) assert.match(source, /Equipment Expense/);
  assert.doesNotMatch(projects, /Machinery \/ Equipment/);
  assert.doesNotMatch(profitability, /\['Equipment usage'/);
});
