import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('finalized Employee Salary is a Project cost and cash settlement never duplicates it', async () => {
  const [payrollService, profitabilityService, projectDetails] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/api/src/modules/project-profitability/project-profitability.service.ts'),
    read('apps/web/src/features/projects/components/project-details-panel.tsx')
  ]);
  const finalizeFlow = payrollService.slice(payrollService.indexOf('async finalizePayrollRun'), payrollService.indexOf('/** Get one Payroll Run detail'));
  const paymentFlow = payrollService.slice(payrollService.indexOf('async createPayrollPayment'), payrollService.indexOf('async reversePayrollPayment'));
  assert.match(finalizeFlow, /upsertPayrollCostActual/);
  assert.match(finalizeFlow, /projectId: allocation\.projectId/);
  assert.match(finalizeFlow, /description: `Employee Salary cost/);
  assert.doesNotMatch(paymentFlow, /upsertPayrollCostActual/);
  assert.match(profitabilityService, /labour:\s*'labourCost'/);
  assert.match(projectDetails, /Includes finalized Employee Salaries/);
});

test('payment proofs use durable linked documents, versioned edits and persistent downloads', async () => {
  const [documentSchema, documentRepository, documentService, proofActions, supplierWorkspace, subcontractWorkspace] = await Promise.all([
    read('apps/api/src/modules/documents-audit/documents-audit.schema.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.repository.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.service.ts'),
    read('apps/web/src/features/documents-audit/components/payment-proof-actions.tsx'),
    read('apps/web/src/features/supplier-payables/components/supplier-payables-workspace.tsx'),
    read('apps/web/src/features/vendors-subcontractors/components/subcontract-payments-workspace.tsx')
  ]);
  assert.match(documentSchema, /'supplier_payment'/);
  assert.match(documentSchema, /'subcontract_payment'/);
  assert.match(documentRepository, /this\.db\.supplierPayment\.findFirst/);
  assert.match(documentRepository, /this\.db\.subcontractPayment\.findFirst/);
  assert.match(documentService, /supplier_payables\.read/);
  assert.match(documentService, /subcontractors\.read/);
  assert.match(proofActions, /createDocumentLink/);
  assert.match(proofActions, /uploadDocumentVersion/);
  assert.match(proofActions, /Download proof/);
  assert.match(proofActions, /Edit proof/);
  assert.doesNotMatch(proofActions, /Attach proof/);
  assert.match(supplierWorkspace, /resourceType="supplier_payment"/);
  assert.match(subcontractWorkspace, /resourceType="subcontract_payment"/);
  assert.match(supplierWorkspace, /Payment proof \(optional\)/);
  assert.match(subcontractWorkspace, /Payment proof \(optional\)/);
});

test('client payment proof stays optional, persistent, retryable and downloadable', async () => {
  const workspace = await read('apps/web/src/features/client-receipts/components/client-receipts-workspace.tsx');
  assert.match(workspace, /Payment evidence \(optional\)/);
  assert.match(workspace, /resourceType: 'client_receipt'/);
  assert.match(workspace, /resourceType="client_receipt"/);
  assert.match(workspace, /PaymentProofActions/);
  assert.doesNotMatch(workspace, /attachSelectedReceiptEvidence/);
  assert.match(workspace, /downloadReceiptEvidence/);
  assert.match(workspace, /Download evidence/);
});

test('Employee ledger exposes a regenerated print-ready salary slip for every salary payment', async () => {
  const [repository, service, schema, api, workspace] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts'),
    read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx')
  ]);
  assert.match(repository, /payments:\s*\{[\s\S]*cashBankAccount/);
  assert.match(service, /salarySlip:\s*\{/);
  assert.match(service, /absenceDeduction: line\.absenceDeduction/);
  assert.match(service, /advanceRecovery: line\.advanceDeduction/);
  assert.match(service, /paymentDate: dateOnly\(payment\.paymentDate\)/);
  assert.match(schema, /salarySlip: z\.object/);
  assert.match(api, /salarySlip\?: Readonly/);
  assert.match(workspace, /View payment slip/);
  assert.match(workspace, /Payment date/);
  assert.match(workspace, /Download print-ready slip/);
  assert.match(workspace, /salary-slip-\$\{slip\.paymentNo\}\.html/);
});

test('finalized payslip is exposed independently on the Employee salary ledger', async () => {
  const [repository, service, schema, api, workspace] = await Promise.all([
    read('apps/api/src/modules/labour-payroll/labour-payroll.repository.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.service.ts'),
    read('apps/api/src/modules/labour-payroll/labour-payroll.schema.ts'),
    read('apps/web/src/features/labour-payroll/api/labour-payroll-api.ts'),
    read('apps/web/src/features/labour-payroll/components/labour-payroll-workspace.tsx')
  ]);
  assert.match(repository, /payslip: \{ select: \{ id: true, generatedAt: true \} \}/);
  assert.match(service, /payslip:\s*\{[\s\S]*payslipId: line\.payslip\.id/);
  assert.match(service, /settlements: postedPayments\.map/);
  assert.match(schema, /payslip: z\.object\([\s\S]*payslipId: uuidSchema/);
  assert.match(schema, /settlements: z\.array/);
  assert.match(api, /payslip\?: Readonly/);
  assert.match(workspace, /function downloadLedgerPayslip/);
  assert.match(workspace, /Payment history/);
  assert.match(workspace, /Outstanding/);
  assert.match(workspace, /Download payslip/);
});
