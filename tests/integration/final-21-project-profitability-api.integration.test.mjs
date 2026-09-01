import assert from 'node:assert/strict';
import test from 'node:test';

const live = process.env.RUN_FOUNDATION_DB_TESTS === '1';

const COMPANY_A_ID = '00000000-0000-4000-8000-000000019801';
const COMPANY_B_ID = '00000000-0000-4000-8000-000000019802';
const ADMIN_A_ID = '00000000-0000-4000-8000-000000019810';
const SCOPED_A_ID = '00000000-0000-4000-8000-000000019811';
const NO_FINANCE_A_ID = '00000000-0000-4000-8000-000000019812';
const ADMIN_B_ID = '00000000-0000-4000-8000-000000019813';
const ADMIN_A_ROLE_ID = '00000000-0000-4000-8000-000000019820';
const SCOPED_A_ROLE_ID = '00000000-0000-4000-8000-000000019821';
const NO_FINANCE_A_ROLE_ID = '00000000-0000-4000-8000-000000019822';
const ADMIN_B_ROLE_ID = '00000000-0000-4000-8000-000000019823';
const CLIENT_A_ID = '00000000-0000-4000-8000-000000019830';
const CLIENT_B_ID = '00000000-0000-4000-8000-000000019831';
const PROJECT_A_ID = '00000000-0000-4000-8000-000000019840';
const PROJECT_A2_ID = '00000000-0000-4000-8000-000000019841';
const PROJECT_B_ID = '00000000-0000-4000-8000-000000019842';
const STAGE_A1_ID = '00000000-0000-4000-8000-000000019850';
const STAGE_A2_ID = '00000000-0000-4000-8000-000000019851';
const STAGE_B_ID = '00000000-0000-4000-8000-000000019852';
const VENDOR_A_ID = '00000000-0000-4000-8000-000000019860';
const PERIOD_A_ID = '00000000-0000-4000-8000-000000019870';
const PERIOD_B_ID = '00000000-0000-4000-8000-000000019871';
const BANK_GL_A_ID = '00000000-0000-4000-8000-000000019880';
const ADVANCE_GL_A_ID = '00000000-0000-4000-8000-000000019881';
const AR_GL_A_ID = '00000000-0000-4000-8000-000000019882';
const REVENUE_GL_A_ID = '00000000-0000-4000-8000-000000019883';
const BANK_GL_B_ID = '00000000-0000-4000-8000-000000019884';
const BANK_A_ID = '00000000-0000-4000-8000-000000019890';
const BANK_B_ID = '00000000-0000-4000-8000-000000019891';
const INVOICE_A1_ID = '00000000-0000-4000-8000-000000019900';
const INVOICE_A2_ID = '00000000-0000-4000-8000-000000019901';
const DRAFT_INVOICE_ID = '00000000-0000-4000-8000-000000019902';
const RECEIPT_STAGE1_ID = '00000000-0000-4000-8000-000000019910';
const RECEIPT_STAGE2_ID = '00000000-0000-4000-8000-000000019911';
const RECEIPT_PROJECT_ID = '00000000-0000-4000-8000-000000019912';
const RECEIPT_ADVANCE_ID = '00000000-0000-4000-8000-000000019913';
const ALLOCATION_STAGE1_ID = '00000000-0000-4000-8000-000000019920';
const ALLOCATION_STAGE2_ID = '00000000-0000-4000-8000-000000019921';
const ALLOCATION_PROJECT_ID = '00000000-0000-4000-8000-000000019922';
const SUPPLIER_INVOICE_ID = '00000000-0000-4000-8000-000000019930';
const DRAFT_SUPPLIER_INVOICE_ID = '00000000-0000-4000-8000-000000019931';
const SUPPLIER_PAYMENT_ID = '00000000-0000-4000-8000-000000019940';
const DRAFT_SUPPLIER_PAYMENT_ID = '00000000-0000-4000-8000-000000019941';
const PASSWORD = 'Final21-project-profitability-B19.8-password!';
const AUTH_ACTION_TOKEN_SECRET = 'test-only-final21-project-profitability-secret-0123456789abcdef';

const PROFITABILITY_PERMISSIONS = [
  'project_profitability.read',
  'project_profitability.finance.read',
  'project_profitability.portfolio.read'
];

/** Load compiled runtime packages only for the explicitly enabled disposable PostgreSQL gate. */
async function loadRuntime() {
  const testing = await import('@construction-erp/testing');
  const { buildApp } = await import('../../apps/api/dist/app.js');
  const { hashPassword } = await import('../../apps/api/dist/plugins/authentication.js');
  return { testing, buildApp, hashPassword };
}

/** Create one balanced Finance Journal with simple Project/Stage dimensions. */
async function createJournal(client, input) {
  await client.journal.create({
    data: {
      id: input.id,
      companyId: input.companyId ?? COMPANY_A_ID,
      journalNo: input.journalNo,
      postingDate: new Date(`${input.postingDate}T00:00:00.000Z`),
      sourceType: input.sourceType,
      sourceId: input.sourceId ?? null,
      sourceKey: input.sourceKey,
      description: input.description ?? input.sourceKey,
      status: input.status ?? 'POSTED',
      periodId: input.periodId ?? PERIOD_A_ID,
      createdBy: input.createdBy ?? ADMIN_A_ID,
      postedAt: input.status === 'DRAFT' ? null : new Date(`${input.postingDate}T12:00:00.000Z`),
      totalDebit: input.amount,
      totalCredit: input.amount,
      lines: { create: input.lines }
    }
  });
}

/** Seed users, roles, scopes and source-module rows needed by the Module 19 integration scenarios. */
async function seedScenario(client, hashPassword) {
  const passwordHash = await hashPassword(PASSWORD);
  await client.company.createMany({ data: [
    { id: COMPANY_A_ID, legalName: 'B19.8 Company A Ltd', displayName: 'B19.8 Company A', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } },
    { id: COMPANY_B_ID, legalName: 'B19.8 Company B Ltd', displayName: 'B19.8 Company B', status: 'ACTIVE', baseCurrency: 'PKR', timeZone: 'Asia/Karachi', locale: 'en-PK', fiscalSettings: { fiscalYearStartMonth: 7 } }
  ] });

  const permissions = [];
  for (const code of PROFITABILITY_PERMISSIONS) {
    permissions.push(await client.permission.upsert({
      where: { code },
      update: { description: code, domain: 'project_profitability' },
      create: { code, description: code, domain: 'project_profitability' }
    }));
  }
  await client.role.createMany({ data: [
    { id: ADMIN_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'system-admin', name: 'B19.8 System Admin A', isSystem: true, status: 'ACTIVE' },
    { id: SCOPED_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b19-8-scoped', name: 'B19.8 Scoped Reader', isSystem: false, status: 'ACTIVE' },
    { id: NO_FINANCE_A_ROLE_ID, companyId: COMPANY_A_ID, code: 'b19-8-no-finance', name: 'B19.8 No Finance', isSystem: false, status: 'ACTIVE' },
    { id: ADMIN_B_ROLE_ID, companyId: COMPANY_B_ID, code: 'system-admin', name: 'B19.8 System Admin B', isSystem: true, status: 'ACTIVE' }
  ] });
  const readPermission = permissions.find((permission) => permission.code === 'project_profitability.read');
  await client.rolePermission.createMany({ data: [
    ...permissions.map((permission) => ({ roleId: ADMIN_A_ROLE_ID, permissionCode: permission.code })),
    ...permissions.map((permission) => ({ roleId: SCOPED_A_ROLE_ID, permissionCode: permission.code })),
    ...permissions.map((permission) => ({ roleId: ADMIN_B_ROLE_ID, permissionCode: permission.code })),
    { roleId: NO_FINANCE_A_ROLE_ID, permissionCode: readPermission.code }
  ] });
  await client.user.createMany({ data: [
    { id: ADMIN_A_ID, companyId: COMPANY_A_ID, email: 'b19-8-admin-a@example.test', name: 'B19.8 Admin A', passwordHash, status: 'ACTIVE' },
    { id: SCOPED_A_ID, companyId: COMPANY_A_ID, email: 'b19-8-scoped-a@example.test', name: 'B19.8 Scoped A', passwordHash, status: 'ACTIVE' },
    { id: NO_FINANCE_A_ID, companyId: COMPANY_A_ID, email: 'b19-8-no-finance-a@example.test', name: 'B19.8 No Finance A', passwordHash, status: 'ACTIVE' },
    { id: ADMIN_B_ID, companyId: COMPANY_B_ID, email: 'b19-8-admin-b@example.test', name: 'B19.8 Admin B', passwordHash, status: 'ACTIVE' }
  ] });
  await client.userRole.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: ADMIN_A_ID, roleId: ADMIN_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, roleId: SCOPED_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: NO_FINANCE_A_ID, roleId: NO_FINANCE_A_ROLE_ID, status: 'ACTIVE' },
    { companyId: COMPANY_B_ID, userId: ADMIN_B_ID, roleId: ADMIN_B_ROLE_ID, status: 'ACTIVE' }
  ] });

  await client.client.createMany({ data: [
    { id: CLIENT_A_ID, companyId: COMPANY_A_ID, code: 'B198-CLIENT-A', legalName: 'B19.8 Client A Ltd', displayName: 'B19.8 Client A', billingAddress: 'Lahore, Pakistan', status: 'ACTIVE' },
    { id: CLIENT_B_ID, companyId: COMPANY_B_ID, code: 'B198-CLIENT-B', legalName: 'B19.8 Client B Ltd', displayName: 'B19.8 Client B', billingAddress: 'Karachi, Pakistan', status: 'ACTIVE' }
  ] });
  await client.project.createMany({ data: [
    { id: PROJECT_A_ID, companyId: COMPANY_A_ID, projectCode: 'B198-A', name: 'B19.8 Reconciliation Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '50000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
    { id: PROJECT_A2_ID, companyId: COMPANY_A_ID, projectCode: 'B198-A2', name: 'B19.8 Random Advance Project', clientId: CLIENT_A_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '20000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_A_ID },
    { id: PROJECT_B_ID, companyId: COMPANY_B_ID, projectCode: 'B198-B', name: 'B19.8 Foreign Project', clientId: CLIENT_B_ID, status: 'ACTIVE', currency: 'PKR', projectModel: 'FIXED_PRICE', projectValue: '30000000.00', startDate: new Date('2026-07-01T00:00:00.000Z'), plannedEndDate: new Date('2027-06-30T00:00:00.000Z'), projectManagerUserId: ADMIN_B_ID }
  ] });
  await client.projectStage.createMany({ data: [
    { id: STAGE_A1_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '60.0000', plannedAmount: '30000000.00', status: 'ACTIVE' },
    { id: STAGE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, code: 'FINISH', name: 'Finishing', sequenceNo: 2, weightPercent: '40.0000', plannedAmount: '20000000.00', status: 'ACTIVE' },
    { id: STAGE_B_ID, companyId: COMPANY_B_ID, projectId: PROJECT_B_ID, code: 'GREY', name: 'Grey Structure', sequenceNo: 1, weightPercent: '100.0000', plannedAmount: '30000000.00', status: 'ACTIVE' }
  ] });
  await client.userProjectScope.createMany({ data: [
    { companyId: COMPANY_A_ID, userId: SCOPED_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' },
    { companyId: COMPANY_A_ID, userId: NO_FINANCE_A_ID, projectId: PROJECT_A_ID, status: 'ACTIVE' }
  ] });
  await client.stageProgressUpdate.createMany({ data: [
    { stageId: STAGE_A1_ID, progressPercent: '60.0000', progressDate: new Date('2026-08-20T00:00:00.000Z'), enteredBy: ADMIN_A_ID, approvedBy: ADMIN_A_ID, approvedAt: new Date('2026-08-20T12:00:00.000Z'), status: 'APPROVED' },
    { stageId: STAGE_A1_ID, progressPercent: '95.0000', progressDate: new Date('2026-08-25T00:00:00.000Z'), enteredBy: ADMIN_A_ID, status: 'SUBMITTED' },
    { stageId: STAGE_A1_ID, progressPercent: '80.0000', progressDate: new Date('2026-09-02T00:00:00.000Z'), enteredBy: ADMIN_A_ID, approvedBy: ADMIN_A_ID, approvedAt: new Date('2026-09-02T12:00:00.000Z'), status: 'APPROVED' },
    { stageId: STAGE_A2_ID, progressPercent: '25.0000', progressDate: new Date('2026-08-22T00:00:00.000Z'), enteredBy: ADMIN_A_ID, approvedBy: ADMIN_A_ID, approvedAt: new Date('2026-08-22T12:00:00.000Z'), status: 'APPROVED' }
  ] });

  await client.glAccount.createMany({ data: [
    { id: BANK_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' },
    { id: ADVANCE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-ADVANCE', name: 'Client Advance', accountType: 'LIABILITY', status: 'ACTIVE' },
    { id: AR_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-RECEIVABLE', name: 'Client Receivable', accountType: 'ASSET', status: 'ACTIVE' },
    { id: REVENUE_GL_A_ID, companyId: COMPANY_A_ID, accountCode: 'CLIENT-REVENUE', name: 'Client Revenue', accountType: 'REVENUE', status: 'ACTIVE' },
    { id: BANK_GL_B_ID, companyId: COMPANY_B_ID, accountCode: 'BANK-001', name: 'Operating Bank', accountType: 'ASSET', status: 'ACTIVE' }
  ] });
  await client.cashBankAccount.createMany({ data: [
    { id: BANK_A_ID, companyId: COMPANY_A_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_A_ID, status: 'ACTIVE' },
    { id: BANK_B_ID, companyId: COMPANY_B_ID, code: 'BANK-001', name: 'Operating Bank', accountType: 'BANK', glAccountId: BANK_GL_B_ID, status: 'ACTIVE' }
  ] });
  await client.fiscalPeriod.createMany({ data: [
    { id: PERIOD_A_ID, companyId: COMPANY_A_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' },
    { id: PERIOD_B_ID, companyId: COMPANY_B_ID, fiscalYear: 2027, periodNo: 2, startDate: new Date('2026-08-01T00:00:00.000Z'), endDate: new Date('2026-08-31T00:00:00.000Z'), status: 'OPEN' }
  ] });

  await client.costActual.createMany({ data: [
    { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, category: 'material', sourceType: 'inventory_issue', sourceId: 'B198-COST-1', sourceKey: 'b19-8:cost:1', amount: '300.00', postingDate: new Date('2026-08-21T00:00:00.000Z') },
    { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A2_ID, category: 'labour', sourceType: 'payroll', sourceId: 'B198-COST-2', sourceKey: 'b19-8:cost:2', amount: '200.00', postingDate: new Date('2026-08-22T00:00:00.000Z') },
    { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: null, category: 'site_expense', sourceType: 'site_expense', sourceId: 'B198-COST-3', sourceKey: 'b19-8:cost:3', amount: '100.00', postingDate: new Date('2026-08-22T00:00:00.000Z') },
    { companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, category: 'other', sourceType: 'future', sourceId: 'B198-COST-FUTURE', sourceKey: 'b19-8:cost:future', amount: '9999.00', postingDate: new Date('2026-09-01T00:00:00.000Z') }
  ] });

  await client.clientInvoice.create({ data: {
    id: INVOICE_A1_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID,
    invoiceNo: 'INV-B198-A1', invoiceDate: new Date('2026-08-20T00:00:00.000Z'), dueDate: new Date('2026-09-19T00:00:00.000Z'), status: 'ISSUED', subtotal: '1200.00', taxAmount: '0.00', totalAmount: '1200.00',
    lines: { create: [
      { stageId: STAGE_A1_ID, description: 'B19.8 Stage 1 billing', amount: '1000.00', revenueAccountId: REVENUE_GL_A_ID },
      { stageId: null, description: 'B19.8 Project-only billing', amount: '200.00', revenueAccountId: REVENUE_GL_A_ID }
    ] }
  } });
  await client.clientInvoice.create({ data: {
    id: INVOICE_A2_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID,
    invoiceNo: 'INV-B198-A2', invoiceDate: new Date('2026-08-22T00:00:00.000Z'), dueDate: new Date('2026-09-21T00:00:00.000Z'), status: 'ISSUED', subtotal: '500.00', taxAmount: '0.00', totalAmount: '500.00',
    lines: { create: [{ stageId: STAGE_A2_ID, description: 'B19.8 Stage 2 billing', amount: '500.00', revenueAccountId: REVENUE_GL_A_ID }] }
  } });
  await client.clientInvoice.create({ data: {
    id: DRAFT_INVOICE_ID, companyId: COMPANY_A_ID, projectId: PROJECT_A_ID, clientId: CLIENT_A_ID,
    invoiceNo: 'INV-B198-DRAFT', invoiceDate: new Date('2026-08-23T00:00:00.000Z'), status: 'DRAFT', subtotal: '9999.00', taxAmount: '0.00', totalAmount: '9999.00',
    lines: { create: [{ stageId: STAGE_A1_ID, description: 'Ignored draft invoice', amount: '9999.00', revenueAccountId: REVENUE_GL_A_ID }] }
  } });

  await createJournal(client, {
    id: '00000000-0000-4000-8000-000000019950', journalNo: 'JRN-B198-INV1', postingDate: '2026-08-20', sourceType: 'client_invoice', sourceId: INVOICE_A1_ID, sourceKey: `client_invoice:${INVOICE_A1_ID}`, amount: '1200.00',
    lines: [
      { accountId: AR_GL_A_ID, projectId: PROJECT_A_ID, stageId: null, debit: '1200.00', credit: '0.00', description: 'AR' },
      { accountId: REVENUE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, debit: '0.00', credit: '1000.00', description: 'Stage 1 revenue' },
      { accountId: REVENUE_GL_A_ID, projectId: PROJECT_A_ID, stageId: null, debit: '0.00', credit: '200.00', description: 'Project-only revenue' }
    ]
  });
  await createJournal(client, {
    id: '00000000-0000-4000-8000-000000019951', journalNo: 'JRN-B198-INV2', postingDate: '2026-08-22', sourceType: 'client_invoice', sourceId: INVOICE_A2_ID, sourceKey: `client_invoice:${INVOICE_A2_ID}`, amount: '500.00',
    lines: [
      { accountId: AR_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A2_ID, debit: '500.00', credit: '0.00', description: 'AR' },
      { accountId: REVENUE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A2_ID, debit: '0.00', credit: '500.00', description: 'Stage 2 revenue' }
    ]
  });
  await createJournal(client, {
    id: '00000000-0000-4000-8000-000000019952', journalNo: 'JRN-B198-DRAFT-INV', postingDate: '2026-08-23', sourceType: 'client_invoice', sourceId: DRAFT_INVOICE_ID, sourceKey: `client_invoice:${DRAFT_INVOICE_ID}`, amount: '9999.00', status: 'DRAFT',
    lines: [
      { accountId: AR_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, debit: '9999.00', credit: '0.00', description: 'Ignored draft AR' },
      { accountId: REVENUE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, debit: '0.00', credit: '9999.00', description: 'Ignored draft revenue' }
    ]
  });

  await client.clientReceipt.createMany({ data: [
    { id: RECEIPT_STAGE1_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, receiptNo: 'CR-B198-1', receiptDate: new Date('2026-08-23T00:00:00.000Z'), amount: '800.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-23T12:00:00.000Z') },
    { id: RECEIPT_STAGE2_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A2_ID, receiptNo: 'CR-B198-2', receiptDate: new Date('2026-08-24T00:00:00.000Z'), amount: '400.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'INVOICE_PAYMENT', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-24T12:00:00.000Z') },
    { id: RECEIPT_PROJECT_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A_ID, stageId: null, receiptNo: 'CR-B198-3', receiptDate: new Date('2026-08-25T00:00:00.000Z'), amount: '300.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'ADVANCE', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-25T12:00:00.000Z') },
    { id: RECEIPT_ADVANCE_ID, companyId: COMPANY_A_ID, clientId: CLIENT_A_ID, projectId: PROJECT_A2_ID, stageId: null, receiptNo: 'CR-B198-ADVANCE', receiptDate: new Date('2026-08-26T00:00:00.000Z'), amount: '500000.00', paymentMethod: 'BANK', cashBankAccountId: BANK_A_ID, receiptType: 'ADVANCE', status: 'POSTED', createdBy: ADMIN_A_ID, postedAt: new Date('2026-08-26T12:00:00.000Z') }
  ] });
  await client.clientReceiptAllocation.createMany({ data: [
    { id: ALLOCATION_STAGE1_ID, receiptId: RECEIPT_STAGE1_ID, clientInvoiceId: INVOICE_A1_ID, amount: '600.00', allocatedAt: new Date('2026-08-24T12:00:00.000Z'), allocatedBy: ADMIN_A_ID },
    { id: ALLOCATION_STAGE2_ID, receiptId: RECEIPT_STAGE2_ID, clientInvoiceId: INVOICE_A2_ID, amount: '300.00', allocatedAt: new Date('2026-08-25T12:00:00.000Z'), allocatedBy: ADMIN_A_ID },
    { id: ALLOCATION_PROJECT_ID, receiptId: RECEIPT_PROJECT_ID, clientInvoiceId: INVOICE_A1_ID, amount: '100.00', allocatedAt: new Date('2026-08-26T12:00:00.000Z'), allocatedBy: ADMIN_A_ID }
  ] });

  const receiptJournalData = [
    ['019960', 'JRN-B198-R1', '2026-08-23', 'client_receipt', RECEIPT_STAGE1_ID, `client_receipt:${RECEIPT_STAGE1_ID}`, '800.00', PROJECT_A_ID, STAGE_A1_ID, BANK_GL_A_ID, ADVANCE_GL_A_ID],
    ['019961', 'JRN-B198-A1', '2026-08-24', 'client_receipt_allocation', ALLOCATION_STAGE1_ID, `client_receipt_allocation:${ALLOCATION_STAGE1_ID}`, '600.00', PROJECT_A_ID, STAGE_A1_ID, ADVANCE_GL_A_ID, AR_GL_A_ID],
    ['019962', 'JRN-B198-R2', '2026-08-24', 'client_receipt', RECEIPT_STAGE2_ID, `client_receipt:${RECEIPT_STAGE2_ID}`, '400.00', PROJECT_A_ID, STAGE_A2_ID, BANK_GL_A_ID, ADVANCE_GL_A_ID],
    ['019963', 'JRN-B198-A2', '2026-08-25', 'client_receipt_allocation', ALLOCATION_STAGE2_ID, `client_receipt_allocation:${ALLOCATION_STAGE2_ID}`, '300.00', PROJECT_A_ID, STAGE_A2_ID, ADVANCE_GL_A_ID, AR_GL_A_ID],
    ['019964', 'JRN-B198-R3', '2026-08-25', 'client_receipt', RECEIPT_PROJECT_ID, `client_receipt:${RECEIPT_PROJECT_ID}`, '300.00', PROJECT_A_ID, null, BANK_GL_A_ID, ADVANCE_GL_A_ID],
    ['019965', 'JRN-B198-A3', '2026-08-26', 'client_receipt_allocation', ALLOCATION_PROJECT_ID, `client_receipt_allocation:${ALLOCATION_PROJECT_ID}`, '100.00', PROJECT_A_ID, null, ADVANCE_GL_A_ID, AR_GL_A_ID],
    ['019966', 'JRN-B198-ADV', '2026-08-26', 'client_receipt', RECEIPT_ADVANCE_ID, `client_receipt:${RECEIPT_ADVANCE_ID}`, '500000.00', PROJECT_A2_ID, null, BANK_GL_A_ID, ADVANCE_GL_A_ID]
  ];
  for (const [suffix, journalNo, postingDate, sourceType, sourceId, sourceKey, amount, projectId, stageId, debitAccountId, creditAccountId] of receiptJournalData) {
    await createJournal(client, {
      id: `00000000-0000-4000-8000-000000${suffix}`, journalNo, postingDate, sourceType, sourceId, sourceKey, amount,
      lines: [
        { accountId: debitAccountId, projectId, stageId, debit: amount, credit: '0.00', description: `${sourceType} debit` },
        { accountId: creditAccountId, projectId, stageId, debit: '0.00', credit: amount, description: `${sourceType} credit` }
      ]
    });
  }
  await createJournal(client, {
    id: '00000000-0000-4000-8000-000000019967', journalNo: 'JRN-B198-DRAFT-RECEIPT', postingDate: '2026-08-27', sourceType: 'client_receipt', sourceId: 'B198-DRAFT-RECEIPT', sourceKey: 'client_receipt:B198-DRAFT', amount: '9999.00', status: 'DRAFT',
    lines: [
      { accountId: BANK_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, debit: '9999.00', credit: '0.00', description: 'Ignored draft cash' },
      { accountId: ADVANCE_GL_A_ID, projectId: PROJECT_A_ID, stageId: STAGE_A1_ID, debit: '0.00', credit: '9999.00', description: 'Ignored draft advance' }
    ]
  });

  await client.vendor.create({ data: { id: VENDOR_A_ID, companyId: COMPANY_A_ID, code: 'B198-VENDOR', legalName: 'B19.8 Vendor Ltd', displayName: 'B19.8 Vendor', status: 'ACTIVE', qualificationStatus: 'QUALIFIED', currency: 'PKR' } });
  await client.supplierInvoice.create({ data: {
    id: SUPPLIER_INVOICE_ID, companyId: COMPANY_A_ID, vendorId: VENDOR_A_ID, projectId: PROJECT_A_ID, invoiceNo: 'SUP-B198-1', invoiceDate: new Date('2026-08-26T00:00:00.000Z'), dueDate: new Date('2026-09-25T00:00:00.000Z'), status: 'POSTED', subtotal: '900.00', taxAmount: '0.00', totalAmount: '900.00',
    lines: { create: [
      { stageId: STAGE_A1_ID, description: 'B19.8 supplier stage cost', amount: '600.00' },
      { stageId: null, description: 'B19.8 supplier project cost', amount: '300.00' }
    ] }
  } });
  await client.supplierInvoice.create({ data: {
    id: DRAFT_SUPPLIER_INVOICE_ID, companyId: COMPANY_A_ID, vendorId: VENDOR_A_ID, projectId: PROJECT_A_ID, invoiceNo: 'SUP-B198-DRAFT', invoiceDate: new Date('2026-08-27T00:00:00.000Z'), status: 'DRAFT', subtotal: '9999.00', taxAmount: '0.00', totalAmount: '9999.00',
    lines: { create: [{ stageId: STAGE_A1_ID, description: 'Ignored draft supplier invoice', amount: '9999.00' }] }
  } });
  await client.supplierPayment.createMany({ data: [
    { id: SUPPLIER_PAYMENT_ID, companyId: COMPANY_A_ID, vendorId: VENDOR_A_ID, projectId: PROJECT_A_ID, paymentNo: 'SP-B198-1', paymentDate: new Date('2026-08-27T00:00:00.000Z'), amount: '250.00', cashBankAccountId: BANK_A_ID, status: 'POSTED' },
    { id: DRAFT_SUPPLIER_PAYMENT_ID, companyId: COMPANY_A_ID, vendorId: VENDOR_A_ID, projectId: PROJECT_A_ID, paymentNo: 'SP-B198-DRAFT', paymentDate: new Date('2026-08-27T00:00:00.000Z'), amount: '100.00', cashBankAccountId: BANK_A_ID, status: 'DRAFT' }
  ] });
  await client.supplierPaymentAllocation.createMany({ data: [
    { supplierPaymentId: SUPPLIER_PAYMENT_ID, supplierInvoiceId: SUPPLIER_INVOICE_ID, amount: '250.00', allocatedAt: new Date('2026-08-27T12:00:00.000Z') },
    { supplierPaymentId: DRAFT_SUPPLIER_PAYMENT_ID, supplierInvoiceId: SUPPLIER_INVOICE_ID, amount: '100.00', allocatedAt: new Date('2026-08-27T13:00:00.000Z') }
  ] });
}

/** Run one Project Profitability scenario against the disposable PostgreSQL/API runtime. */
async function withApi(work) {
  const { testing, buildApp, hashPassword } = await loadRuntime();
  const client = testing.createFoundationTestDatabaseClient(testing.loadFoundationTestEnvironment());
  let app;
  try {
    await client.$connect();
    await testing.resetFoundationTestData(client);
    await seedScenario(client, hashPassword);
    app = buildApp({ database: client, nodeEnv: 'test', logLevel: 'silent', authActionTokenSecret: AUTH_ACTION_TOKEN_SECRET });
    await app.ready();
    await work({ app, client });
  } finally {
    if (app) await app.close();
    else await client.$disconnect().catch(() => undefined);
  }
}

/** Login one seeded actor and return its opaque access token. */
async function signIn(app, email) {
  const response = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email, password: PASSWORD } });
  assert.equal(response.statusCode, 200, response.body);
  return response.json().data.accessToken;
}

/** Execute one authenticated Project Profitability GET request. */
async function profitabilityGet(app, token, url) {
  return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
}

/** Return one stable public error code from a Fastify error response. */
function errorCode(response) {
  return response.json().error?.code;
}

/** Convert one two-decimal API money value to integer minor units for reconciliation assertions. */
function money(value) {
  const [whole, fraction = '00'] = value.split('.');
  return BigInt(whole) * 100n + BigInt(`${fraction}00`.slice(0, 2));
}

/** Sum one financial field across Stage rows plus the Project-only reconciliation bucket. */
function reconciledStageField(payload, field) {
  return payload.stages.reduce((sum, stage) => sum + money(stage[field]), 0n) + money(payload.projectOnly[field]);
}

test('B19.8 live Project summary reconciles Modules 9, 15, 16, 17 and 18 without double counting', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-a@example.test');
    const response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data, {
      projectId: PROJECT_A_ID,
      projectCode: 'B198-A',
      projectName: 'B19.8 Reconciliation Project',
      currency: 'PKR',
      asOfDate: '2026-08-29',
      recognizedRevenue: '1700.00',
      actualCost: '600.00',
      profitAmount: '1100.00',
      billedAmount: '1700.00',
      receivedAmount: '1500.00',
      allocatedAmount: '1000.00',
      advanceAmount: '500.00',
      outstandingAmount: '700.00',
      supplierPayableAmount: '650.00'
    });
  });
});

test('B19.8 live Stage drill-down reconciles every financial field and ignores unapproved or future progress', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-a@example.test');
    const response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A_ID}/stages?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json().data;
    assert.equal(payload.stages.length, 2);
    assert.equal(payload.stages[0].physicalProgressPercent, '60');
    assert.equal(payload.stages[1].physicalProgressPercent, '25');
    assert.equal(payload.stages[0].profitAmount, '700.00');
    assert.equal(payload.stages[1].profitAmount, '300.00');
    assert.equal(payload.projectOnly.profitAmount, '100.00');
    assert.equal(payload.projectOnly.supplierPayableAmount, '650.00');
    for (const field of ['recognizedRevenue', 'actualCost', 'profitAmount', 'billedAmount', 'receivedAmount', 'allocatedAmount', 'advanceAmount', 'outstandingAmount', 'supplierPayableAmount']) {
      assert.equal(reconciledStageField(payload, field), money(payload.projectTotal[field]), `Stage reconciliation failed for ${field}`);
    }
  });
});

test('B19.8 live random Rs. 500,000 Client advance changes cash position but not Project profit', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-a@example.test');
    const response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A2_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json().data;
    assert.equal(payload.receivedAmount, '500000.00');
    assert.equal(payload.advanceAmount, '500000.00');
    assert.equal(payload.billedAmount, '0.00');
    assert.equal(payload.recognizedRevenue, '0.00');
    assert.equal(payload.actualCost, '0.00');
    assert.equal(payload.profitAmount, '0.00');
  });
});

test('B19.8 live source filters exclude draft and post-as-of invoice, receipt, payable, cost and progress data', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-a@example.test');
    const response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    const payload = response.json().data;
    assert.notEqual(payload.billedAmount, '11699.00');
    assert.notEqual(payload.receivedAmount, '11499.00');
    assert.notEqual(payload.actualCost, '10599.00');
    assert.equal(payload.supplierPayableAmount, '650.00');
  });
});

test('B19.8 live DAY trend uses only Finance revenue and Module 9 actual cost by posting date', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-a@example.test');
    const response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A_ID}/trend?fromDate=2026-08-20&toDate=2026-08-22&granularity=DAY`);
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.points, [
      { periodStart: '2026-08-20', periodEnd: '2026-08-20', recognizedRevenue: '1200.00', actualCost: '0.00', profitAmount: '1200.00' },
      { periodStart: '2026-08-21', periodEnd: '2026-08-21', recognizedRevenue: '0.00', actualCost: '300.00', profitAmount: '-300.00' },
      { periodStart: '2026-08-22', periodEnd: '2026-08-22', recognizedRevenue: '500.00', actualCost: '300.00', profitAmount: '200.00' }
    ]);
  });
});

test('B19.8 live permission, Project scope and cross-Company requests fail closed with the frozen error', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const scopedToken = await signIn(app, 'b19-8-scoped-a@example.test');
    const noFinanceToken = await signIn(app, 'b19-8-no-finance-a@example.test');
    const adminAToken = await signIn(app, 'b19-8-admin-a@example.test');

    let response = await profitabilityGet(app, scopedToken, `/api/v1/project-profitability/projects/${PROJECT_A_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    response = await profitabilityGet(app, scopedToken, `/api/v1/project-profitability/projects/${PROJECT_A2_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'PROFITABILITY_SCOPE_FORBIDDEN');
    response = await profitabilityGet(app, noFinanceToken, `/api/v1/project-profitability/projects/${PROJECT_A_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'PROFITABILITY_SCOPE_FORBIDDEN');
    response = await profitabilityGet(app, adminAToken, `/api/v1/project-profitability/projects/${PROJECT_B_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'PROFITABILITY_SCOPE_FORBIDDEN');
  });
});

test('B19.8 live portfolio intersects all three permissions, explicit scope and Company ownership', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const adminToken = await signIn(app, 'b19-8-admin-a@example.test');
    const scopedToken = await signIn(app, 'b19-8-scoped-a@example.test');
    let response = await profitabilityGet(app, adminToken, '/api/v1/project-profitability/portfolio?asOfDate=2026-08-29&page=1&pageSize=10');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((item) => item.projectId).sort(), [PROJECT_A_ID, PROJECT_A2_ID].sort());
    response = await profitabilityGet(app, scopedToken, '/api/v1/project-profitability/portfolio?asOfDate=2026-08-29&page=1&pageSize=10');
    assert.equal(response.statusCode, 200, response.body);
    assert.deepEqual(response.json().data.items.map((item) => item.projectId), [PROJECT_A_ID]);
  });
});

test('B19.8 live foreign Company administrator can see only its own Project and never Company A values', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const token = await signIn(app, 'b19-8-admin-b@example.test');
    let response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_B_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(response.json().data.projectId, PROJECT_B_ID);
    assert.equal(response.json().data.profitAmount, '0.00');
    response = await profitabilityGet(app, token, `/api/v1/project-profitability/projects/${PROJECT_A_ID}?asOfDate=2026-08-29`);
    assert.equal(response.statusCode, 403, response.body);
    assert.equal(errorCode(response), 'PROFITABILITY_SCOPE_FORBIDDEN');
  });
});


test('B19.10 live OpenAPI exposes exactly four read-only Project Profitability operations', { skip: !live }, async () => {
  await withApi(async ({ app }) => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    assert.equal(response.statusCode, 200, response.body);
    const spec = response.json();
    const expected = [
      ['get', '/api/v1/project-profitability/projects/{projectId}', 'getProjectProfitabilitySummary'],
      ['get', '/api/v1/project-profitability/projects/{projectId}/stages', 'getProjectProfitabilityStages'],
      ['get', '/api/v1/project-profitability/projects/{projectId}/trend', 'getProjectProfitabilityTrend'],
      ['get', '/api/v1/project-profitability/portfolio', 'getProjectProfitabilityPortfolio']
    ];
    for (const [method, path, operationId] of expected) {
      assert.equal(spec.paths[path][method].operationId, operationId);
      assert.deepEqual(spec.paths[path][method].security, [{ bearerAuth: [] }]);
      for (const forbiddenMethod of ['post', 'put', 'patch', 'delete']) assert.equal(spec.paths[path][forbiddenMethod], undefined);
    }
    assert.equal(Object.keys(spec.paths).filter((path) => path.startsWith('/api/v1/project-profitability')).length, 4);
  });
});
