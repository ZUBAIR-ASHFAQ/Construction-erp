import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

const financeRoutes = await read('apps/api/src/modules/finance/finance.routes.ts');
const financeSchema = await read('apps/api/src/modules/finance/finance.schema.ts');
const financeService = await read('apps/api/src/modules/finance/finance.service.ts');
const financeWebApi = await read('apps/web/src/features/finance/api/finance-api.ts');
const financeHooks = await read('apps/web/src/features/finance/hooks/finance.ts');

const projectRoutes = await read('apps/api/src/modules/projects/projects.routes.ts');
const projectSchema = await read('apps/api/src/modules/projects/projects.schema.ts');
const projectService = await read('apps/api/src/modules/projects/projects.service.ts');
const projectWebApi = await read('apps/web/src/features/projects/api/projects-api.ts');
const projectHooks = await read('apps/web/src/features/projects/hooks/projects.ts');

const equipmentRoutes = await read('apps/api/src/modules/equipment/equipment.routes.ts');
const equipmentSchema = await read('apps/api/src/modules/equipment/equipment.schema.ts');
const equipmentService = await read('apps/api/src/modules/equipment/equipment.service.ts');
const equipmentWebApi = await read('apps/web/src/features/equipment/api/equipment-api.ts');
const equipmentHooks = await read('apps/web/src/features/equipment/hooks/equipment.ts');

const supplierRoutes = await read('apps/api/src/modules/supplier-payables/supplier-payables.routes.ts');
const supplierSchema = await read('apps/api/src/modules/supplier-payables/supplier-payables.schema.ts');
const supplierService = await read('apps/api/src/modules/supplier-payables/supplier-payables.service.ts');
const supplierWebApi = await read('apps/web/src/features/supplier-payables/api/supplier-payables-api.ts');

const receiptRoutes = await read('apps/api/src/modules/client-receipts/client-receipts.routes.ts');
const receiptSchema = await read('apps/api/src/modules/client-receipts/client-receipts.schema.ts');
const receiptService = await read('apps/api/src/modules/client-receipts/client-receipts.service.ts');
const receiptWebApi = await read('apps/web/src/features/client-receipts/api/client-receipts-api.ts');
const receiptHooks = await read('apps/web/src/features/client-receipts/hooks/client-receipts.ts');

const payrollRoutes = await read('apps/api/src/modules/labour-payroll/labour-payroll.routes.ts');
const payrollSchema = await read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts');
const payrollService = await read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts');
const payrollWebApi = await read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts');
const payrollHooks = await read('apps/web/src/features/labour-payroll/hooks/labour-payroll.ts');

/** Preserve the current Finance reverse command contract while later integrity patches change only its business rules. */
test('PATCH 00 baseline: Finance reverse command stays wired end-to-end', () => {
  assert.match(financeSchema, /POST', route: '\/api\/v1\/finance\/journals\/:id\/reverse'/);
  assert.match(financeRoutes, /app\.post\('\/api\/v1\/finance\/journals\/:id\/reverse'/);
  assert.match(financeService, /async reverseJournal\(journalId: string, idempotencyKey: string, input: ReverseJournalBody = \{\}\)/);
  assert.match(financeWebApi, /export function reverseFinanceJournal\(journalId: string, postingDate\?: string\)/);
  assert.match(financeWebApi, /finance\/journals\/\$\{encodeURIComponent\(journalId\)\}\/reverse/);
  assert.match(financeHooks, /export function useReverseFinanceJournal\(\)/);
});

/** Preserve the currently supported Project lifecycle API surface before lifecycle integrity is repaired. */
test('PATCH 00 baseline: Project lifecycle commands stay aligned between API and web', () => {
  for (const action of ['activate', 'suspend', 'complete', 'close']) {
    assert.ok(projectSchema.includes(`POST', route: '/api/v1/projects/:id/${action}'`));
    assert.ok(projectRoutes.includes(`app.post('/api/v1/projects/:id/${action}'`));
  }

  assert.match(projectService, /async activateProject\(projectId: string\)/);
  assert.match(projectService, /async suspendProject\(projectId: string, input: SuspendProjectBody\)/);
  assert.match(projectService, /async completeProject\(projectId: string\)/);
  assert.match(projectService, /async closeProject\(projectId: string, input: CloseProjectBody\)/);
  assert.match(projectWebApi, /export function suspendProject\(/);
  assert.match(projectWebApi, /export function closeProject\(/);
  assert.match(projectHooks, /export function useSuspendProject\(/);
  assert.match(projectHooks, /export function useCloseProject\(/);
});

/** Preserve Equipment assignment creation wiring; the later fix may add an end command without changing this contract. */
test('PATCH 00 baseline: Equipment assignment creation stays wired end-to-end', () => {
  assert.match(equipmentSchema, /POST', route: '\/api\/v1\/equipment\/:id\/assignments'/);
  assert.match(equipmentRoutes, /app\.post\('\/api\/v1\/equipment\/:id\/assignments'/);
  assert.match(equipmentService, /async assignEquipment\(/);
  assert.match(equipmentWebApi, /export function assignEquipment\(equipmentId: string, input: AssignEquipmentInput\)/);
  assert.match(equipmentHooks, /export function useAssignEquipment\(equipmentId: string\)/);
});

/** Preserve Supplier Payment creation/allocation contracts while accounting treatment is repaired later. */
test('PATCH 00 baseline: Supplier payment and allocation stay wired end-to-end', () => {
  for (const route of [
    "POST', route: '/api/v1/supplier-payables/payments'",
    "POST', route: '/api/v1/supplier-payables/payments/:id/allocations'"
  ]) assert.ok(supplierSchema.includes(route));

  assert.match(supplierRoutes, /app\.post\('\/api\/v1\/supplier-payables\/payments'/);
  assert.match(supplierRoutes, /app\.post\('\/api\/v1\/supplier-payables\/payments\/:id\/allocations'/);
  assert.match(supplierService, /async createSupplierPayment\(/);
  assert.match(supplierService, /async allocateSupplierPayment\(/);
  assert.match(supplierWebApi, /supplier-payables\/payments/);
  assert.match(supplierWebApi, /supplier-payables\/payments\/\$\{encodeURIComponent\(paymentId\)\}\/allocations/);
});

/** Preserve Client Receipt allocation wiring while future work adds stage attribution without breaking the API owner. */
test('PATCH 00 baseline: Client receipt allocation stays wired end-to-end', () => {
  assert.match(receiptSchema, /POST', route: '\/api\/v1\/client-receipts\/:id\/allocations'/);
  assert.match(receiptRoutes, /app\.post\('\/api\/v1\/client-receipts\/:id\/allocations'/);
  assert.match(receiptService, /async allocateClientReceipt\(/);
  assert.match(receiptWebApi, /export function allocateClientReceipt\(receiptId: string, input: AllocateClientReceiptInput\)/);
  assert.match(receiptHooks, /export function useAllocateClientReceipt\(receiptId: string \| null\)/);
});

/** Preserve Payroll finalization wiring while a later patch adds a controlled correction path. */
test('PATCH 00 baseline: Payroll finalization stays wired end-to-end', () => {
  assert.match(payrollSchema, /POST', route: '\/api\/v1\/payroll\/runs\/:id\/finalize'/);
  assert.match(payrollRoutes, /app\.post\('\/api\/v1\/payroll\/runs\/:id\/finalize'/);
  assert.match(payrollService, /async finalizePayrollRun\(/);
  assert.match(payrollWebApi, /export function finalizePayrollRun\(payrollRunId: string\)/);
  assert.match(payrollHooks, /export function useFinalizePayrollRun\(payrollRunId: string\)/);
});

// These TODOs are intentionally non-executing in PATCH 00. They define the exact integrity regressions
// that subsequent surgical patches must turn into passing executable tests without changing unrelated behavior.
test.todo('Finance source-owned journals cannot be reversed independently of their source transaction');
test('Project SUSPENDED status has a controlled path back to ACTIVE and close readiness cannot be bypassed', () => {
  assert.match(projectService, /async resumeProject\(projectId: string, input: ResumeProjectBody\)/);
  assert.match(projectService, /transitionProjectStatus\(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE\)/);
  assert.match(projectService, /repository\.isProjectReadyToClose\(projectId\)/);
  assert.doesNotMatch(projectService, /closeReadinessCheck/);
});
test('Open-ended Equipment assignments can be ended before the asset is reassigned', () => {
  assert.match(equipmentSchema, /POST', route: '\/api\/v1\/equipment\/:id\/assignments\/:assignmentId\/end'/);
  assert.match(equipmentRoutes, /app\.post\('\/api\/v1\/equipment\/:id\/assignments\/:assignmentId\/end'/);
  assert.match(equipmentService, /async endAssignment\(equipmentId: string, assignmentId: string/);
  assert.match(equipmentService, /repository\.findLatestUsageDate\(equipmentId, assignmentId\)/);
  assert.match(equipmentService, /equipment\.assignment_ended/);
  assert.match(equipmentWebApi, /export function endEquipmentAssignment\(equipmentId: string, assignmentId: string, endDate: string\)/);
  assert.match(equipmentHooks, /export function useEndEquipmentAssignment\(equipmentId: string\)/);
});
test.todo('Unallocated Supplier Payments do not reduce AP until allocation');
test.todo('Client Receipt allocations persist deterministic stage attribution for multi-stage invoices');
test.todo('Finalized Payroll has a controlled compensating correction path');
