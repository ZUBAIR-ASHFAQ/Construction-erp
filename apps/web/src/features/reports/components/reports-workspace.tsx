import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useClients } from '../../clients/hooks/clients.js';
import { getDocumentDownload, listDocuments, type DocumentLinkResourceType } from '../../documents-audit/api/documents-api.js';
import { useFinanceAccounts, useFinancePeriods } from '../../finance/hooks/finance.js';
import { useProjectStages } from '../../project-stages/hooks/project-stages.js';
import { useProjects } from '../../projects/hooks/projects.js';
import { useSubcontractors, useVendors } from '../../vendors-subcontractors/hooks/vendors-subcontractors.js';
import {
  REPORT_CODES,
  type ReportAnalyticsOverview,
  type ReportCode,
  type ReportFilters,
  type RunReportInput,
  type SavedReportFilter
} from '../api/reports-api.js';
import {
  useReportCatalog,
  useRunReport,
  useReportsAnalyticsOverview,
  useSaveReportFilter,
  useSavedReportFilters
} from '../hooks/reports.js';

type FilterField = Exclude<keyof ReportFilters, 'page' | 'pageSize' | 'cashBankAccountId' | 'search'>;

type ReportsWorkspaceProps = Readonly<{
  canRead: boolean;
  canViewOverview: boolean;
  canExport: boolean;
  canSaveFilters: boolean;
  canReadProjects: boolean;
  canReadClients: boolean;
  canReadVendors: boolean;
  canReadSubcontractors: boolean;
  canReadFinance: boolean;
  canReadStages: boolean;
  canReadDocuments: boolean;
}>;

const uuidOrEmptySchema = z.union([z.literal(''), z.string().uuid('Use a valid UUID.')]);
const dateOrEmptySchema = z.union([z.literal(''), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.')]);

const REPORT_FILTER_FIELDS: Readonly<Record<ReportCode, readonly FilterField[]>> = Object.freeze({
  'project-cost': ['projectId'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId', 'asOfDate'],
  'project-expenses': ['projectId', 'stageId', 'fromDate', 'toDate', 'status'],
  'project-material': ['projectId', 'stageId', 'warehouseId', 'materialId'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-billing': ['clientId', 'projectId', 'fromDate', 'toDate', 'status'],
  'client-payments': ['clientId', 'projectId', 'stageId', 'fromDate', 'toDate', 'status'],
  'client-outstanding': ['clientId', 'projectId'],
  'client-advance': ['clientId', 'projectId'],
  'client-aging': ['clientId', 'projectId', 'asOfDate'],
  'supplier-purchases': ['projectId'],
  'supplier-payables': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status'],
  'supplier-payments': ['vendorId', 'projectId', 'fromDate', 'toDate', 'status'],
  'supplier-aging': ['vendorId', 'projectId', 'asOfDate'],
  'subcontractor-contracts': ['subcontractorId', 'projectId', 'status'],
  'subcontractor-payments': ['subcontractorId', 'projectId', 'fromDate', 'toDate', 'status'],
  'subcontractor-ledger': ['subcontractorId', 'projectId', 'status'],
  'equipment-usage': ['projectId', 'fromDate', 'toDate'],
  attendance: ['projectId', 'employeeId', 'fromDate', 'toDate'],
  payroll: [],
  'employee-payments': ['employeeId', 'fromDate', 'toDate', 'status'],
  'labour-cost': ['projectId', 'stageId', 'fromDate', 'toDate'],
  'cash-bank': ['status'],
  'cash-accounts': ['projectId', 'status'],
  'bank-accounts': ['projectId', 'status'],
  'general-ledger': ['periodId', 'accountId', 'projectId', 'stageId'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

const REQUIRED_FILTER_FIELDS: Readonly<Partial<Record<ReportCode, readonly FilterField[]>>> = Object.freeze({
  'project-cost': ['projectId'],
  'budget-vs-actual': ['projectId'],
  'project-profit-loss': ['projectId'],
  'stage-progress': ['projectId'],
  'stage-cost': ['projectId', 'stageId'],
  'stage-billing': ['projectId', 'stageId'],
  'stage-receipts': ['projectId', 'stageId'],
  'client-outstanding': ['clientId'],
  'client-advance': ['clientId'],
  'labour-cost': ['projectId'],
  'general-ledger': ['periodId'],
  'profit-loss': ['periodId'],
  'balance-sheet': ['periodId'],
  'cash-flow': ['periodId']
});

const PAGINATED_REPORTS = new Set<ReportCode>([
  'project-cost',
  'project-expenses',
  'project-material',
  'client-billing',
  'client-payments',
  'client-aging',
  'supplier-purchases',
  'supplier-payables',
  'supplier-payments',
  'supplier-aging',
  'subcontractor-contracts',
  'subcontractor-payments',
  'subcontractor-ledger',
  'equipment-usage',
  'attendance',
  'payroll',
  'employee-payments',
  'labour-cost',
  'cash-bank',
  'cash-accounts',
  'bank-accounts',
  'general-ledger'
]);

const FILTER_LABELS: Readonly<Record<FilterField, string>> = {
  projectId: 'Project',
  stageId: 'Project stage',
  clientId: 'Client',
  vendorId: 'Supplier',
  subcontractorId: 'Subcontractor',
  employeeId: 'Employee ID',
  warehouseId: 'Warehouse ID',
  materialId: 'Material ID',
  periodId: 'Fiscal period',
  accountId: 'General Ledger account',
  fromDate: 'From date',
  toDate: 'To date',
  asOfDate: 'As-of date',
  status: 'Status',
};

const reportFilterFormSchema = z.object({
  reportCode: z.enum(REPORT_CODES),
  projectId: uuidOrEmptySchema,
  stageId: uuidOrEmptySchema,
  clientId: uuidOrEmptySchema,
  vendorId: uuidOrEmptySchema,
  subcontractorId: uuidOrEmptySchema,
  employeeId: uuidOrEmptySchema,
  warehouseId: uuidOrEmptySchema,
  materialId: uuidOrEmptySchema,
  periodId: uuidOrEmptySchema,
  accountId: uuidOrEmptySchema,
  fromDate: dateOrEmptySchema,
  toDate: dateOrEmptySchema,
  asOfDate: dateOrEmptySchema,
  status: z.string().trim().max(80),
}).superRefine((value, context) => {
  if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['toDate'], message: 'To date cannot precede from date.' });
  }
  for (const field of REQUIRED_FILTER_FIELDS[value.reportCode] ?? []) {
    if (!value[field]) context.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${FILTER_LABELS[field]} is required for this report.` });
  }
});

type FilterFormValues = z.infer<typeof reportFilterFormSchema>;

const EMPTY_FORM: FilterFormValues = {
  reportCode: 'stage-progress',
  projectId: '',
  stageId: '',
  clientId: '',
  vendorId: '',
  subcontractorId: '',
  employeeId: '',
  warehouseId: '',
  materialId: '',
  periodId: '',
  accountId: '',
  fromDate: '',
  toDate: '',
  asOfDate: '',
  status: '',
};

type ReportSection = Readonly<{
  id: string;
  title: string;
  description: string;
  codes: readonly ReportCode[];
}>;

const REPORT_SECTIONS: readonly ReportSection[] = Object.freeze([
  {
    id: 'suppliers',
    title: 'Suppliers',
    description: 'Supplier purchases, invoices, payments and outstanding balances.',
    codes: ['supplier-payables', 'supplier-payments', 'supplier-purchases', 'supplier-aging']
  },
  {
    id: 'subcontractors',
    title: 'Subcontractors',
    description: 'Subcontract agreements, payments and remaining contract balances.',
    codes: ['subcontractor-payments', 'subcontractor-contracts', 'subcontractor-ledger']
  },
  {
    id: 'clients',
    title: 'Clients',
    description: 'Client invoices, payments, outstanding balances, advances and aging.',
    codes: ['client-billing', 'client-payments', 'client-outstanding', 'client-advance', 'client-aging']
  },
  {
    id: 'equipment',
    title: 'Equipment',
    description: 'Posted Equipment usage with Project, date, quantity, rate and cost.',
    codes: ['equipment-usage']
  },
  {
    id: 'people',
    title: 'Employees & Payroll',
    description: 'Employee salary payments, payroll runs, attendance and Project labour cost.',
    codes: ['employee-payments', 'payroll', 'attendance', 'labour-cost']
  },
  {
    id: 'projects',
    title: 'Projects & Cost Control',
    description: 'Project cost, budget, profitability, material and stage performance.',
    codes: ['project-cost', 'budget-vs-actual', 'project-profit-loss', 'project-expenses', 'project-material', 'stage-progress', 'stage-cost', 'stage-billing', 'stage-receipts']
  },
  {
    id: 'accounts',
    title: 'Cash & Bank Accounts',
    description: 'Cash and Bank account registers plus the combined Cash/Bank view.',
    codes: ['cash-accounts', 'bank-accounts', 'cash-bank']
  },
  {
    id: 'finance',
    title: 'Finance & Statements',
    description: 'General Ledger and core financial statements.',
    codes: ['general-ledger', 'profit-loss', 'balance-sheet', 'cash-flow']
  }
]);

const REPORT_DISPLAY_NAMES: Readonly<Partial<Record<ReportCode, string>>> = Object.freeze({
  'supplier-payables': 'Supplier Invoices',
  'supplier-payments': 'Supplier Payments',
  'subcontractor-payments': 'Subcontractor Payments',
  'client-billing': 'Client Invoices',
  'client-payments': 'Client Payments',
  'equipment-usage': 'Equipment Usage',
  'employee-payments': 'Employee Payments',
  payroll: 'Payroll Runs'
});

const REPORT_DESCRIPTIONS: Readonly<Partial<Record<ReportCode, string>>> = Object.freeze({
  'supplier-purchases': 'Purchase orders raised for suppliers.',
  'supplier-payables': 'Posted supplier invoices and outstanding amounts.',
  'supplier-payments': 'Payments made to suppliers from Cash/Bank.',
  'supplier-aging': 'Supplier outstanding grouped by aging position.',
  'subcontractor-contracts': 'Agreed Project contracts and lifecycle status.',
  'subcontractor-payments': 'Posted payments made against subcontract contracts.',
  'subcontractor-ledger': 'Contract value, paid amount and remaining balance.',
  'equipment-usage': 'Every posted Equipment usage entry with Project, date, quantity, rate and cost.',
  'client-billing': 'Issued Client invoices and billed amounts.',
  'client-payments': 'Client receipts and their Project allocation.',
  'client-outstanding': 'Client amount still due for collection.',
  'client-advance': 'Unallocated Client advances held by Project.',
  'client-aging': 'Client receivables by aging position.',
  'cash-accounts': 'Cashbook accounts with opening and current balances.',
  'bank-accounts': 'Bank accounts with account numbers and current balances.',
  'employee-payments': 'Employee salary payments with payment number, date, amount and Cash/Bank account.',
  payroll: 'Payroll run history and status.'
});

/** Business-facing columns for the register-style lists. Internal IDs and nested line payloads stay out of the table. */
const REPORT_LIST_COLUMNS: Readonly<Partial<Record<ReportCode, readonly string[]>>> = Object.freeze({
  'supplier-payables': ['invoiceNo', 'invoiceDate', 'dueDate', 'status', 'totalAmount', 'allocatedAmount', 'outstandingAmount'],
  'supplier-payments': ['paymentNo', 'paymentDate', 'status', 'amount', 'allocatedAmount', 'remainingAmount', 'reference'],
  'supplier-purchases': ['poNo', 'orderDate', 'currency', 'status', 'subtotal', 'taxAmount', 'totalAmount'],
  'supplier-aging': ['invoiceNo', 'invoiceDate', 'dueDate', 'totalAmount', 'allocatedAmount', 'outstandingAmount', 'ageDays'],
  'subcontractor-contracts': ['subcontractor', 'project', 'contractDate', 'contractAmount', 'status', 'finishedAt'],
  'subcontractor-payments': ['paymentNo', 'paymentDate', 'subcontractor', 'project', 'cashBankAccount', 'amount', 'status', 'reference'],
  'subcontractor-ledger': ['subcontractor', 'project', 'contractDate', 'contractAmount', 'paidAmount', 'balanceAmount', 'status'],
  'client-billing': ['invoiceNo', 'invoiceDate', 'dueDate', 'status', 'totalAmount', 'allocatedAmount', 'outstandingAmount'],
  'client-payments': ['receiptNo', 'receiptDate', 'receiptType', 'paymentMethod', 'status', 'amount', 'allocatedAmount', 'unallocatedAmount', 'reference'],
  'equipment-usage': ['usageDate', 'projectName', 'stageName', 'quantity', 'rate', 'amount', 'status'],
  attendance: ['workDate', 'employeeName', 'projectName', 'stageName', 'status', 'hours', 'overtimeHours'],
  payroll: ['payCycle', 'periodStart', 'periodEnd', 'status', 'createdByName', 'finalizedAt', 'overtimeMultiplier'],
  'employee-payments': ['paymentNo', 'paymentDate', 'employeeName', 'payrollPeriod', 'cashBankAccountName', 'amount', 'status', 'reference'],
  'cash-bank': ['code', 'name', 'accountType', 'accountNumber', 'projectName', 'balance', 'status'],
  'cash-accounts': ['code', 'name', 'accountNumber', 'projectName', 'balance', 'status'],
  'bank-accounts': ['code', 'name', 'accountNumber', 'projectName', 'balance', 'status']
});

const TECHNICAL_REPORT_COLUMNS = new Set([
  'id', 'createdAt', 'updatedAt', 'createdBy', 'enteredBy', 'allocatedBy', 'costActualId', 'financeJournalId',
  'lines', 'items', 'allocations', 'goodsReceipts', 'projectAllocation', 'payslip'
]);

type ReportDisplayLookups = Readonly<{
  vendorNames: ReadonlyMap<string, string>;
  projectNames: ReadonlyMap<string, string>;
  clientNames: ReadonlyMap<string, string>;
  subcontractorNames: ReadonlyMap<string, string>;
}>;

/** Turn a server field key into a readable column heading. */
function displayColumnName(column: string): string {
  const explicit: Readonly<Record<string, string>> = {
    vendorId: 'Supplier',
    subcontractorId: 'Subcontractor',
    projectId: 'Project',
    clientId: 'Client',
    cashBankAccountId: 'Cash / Bank account'
  };
  if (explicit[column]) return explicit[column];
  return column.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, (value) => value.toUpperCase());
}

/** Return one readable request error without exposing backend internals. */
function errorMessage(error: unknown): string | null {
  return error instanceof Error ? error.message : null;
}

/** Build only the selected report's documented business filters from validated form values. */
function businessFiltersFromValues(values: FilterFormValues): ReportFilters {
  const entries = REPORT_FILTER_FIELDS[values.reportCode]
    .map((field) => [field, values[field].trim()] as const)
    .filter((entry) => entry[1] !== '');
  return Object.fromEntries(entries) as ReportFilters;
}

/** Add bounded browser pagination only for reports whose server contract supports it. */
function runFiltersFromValues(values: FilterFormValues, page: number): ReportFilters {
  const filters = businessFiltersFromValues(values);
  return PAGINATED_REPORTS.has(values.reportCode) ? { ...filters, page, pageSize: 25 } : filters;
}

/** Convert one saved server filter back into the visible form fields for its report. */
function formValuesFromSavedFilter(saved: SavedReportFilter): FilterFormValues {
  const storedFields = REPORT_FILTER_FIELDS[saved.reportCode]
    .map((field) => [field, saved.filters[field]] as const)
    .filter((entry): entry is readonly [FilterField, string] => typeof entry[1] === 'string');
  return { ...EMPTY_FORM, reportCode: saved.reportCode, ...Object.fromEntries(storedFields) };
}

/** Seed one report with only the compatible shared Project and date filters from the command center. */
function formValuesWithGlobalFilters(
  reportCode: ReportCode,
  projectId: string,
  fromDate: string,
  toDate: string
): FilterFormValues {
  const fields = REPORT_FILTER_FIELDS[reportCode];
  return {
    ...EMPTY_FORM,
    reportCode,
    ...(fields.includes('projectId') && projectId ? { projectId } : {}),
    ...(fields.includes('fromDate') && fromDate ? { fromDate } : {}),
    ...(fields.includes('toDate') && toDate ? { toDate } : {}),
    ...(fields.includes('asOfDate') && toDate ? { asOfDate: toDate } : {})
  };
}

/** Build a compact business register instead of exposing every internal source-model field. */
function reportColumns(reportCode: ReportCode, rows: Record<string, unknown>[]): string[] {
  const available = new Set(rows.flatMap((row) => Object.keys(row)));
  const preferred = (REPORT_LIST_COLUMNS[reportCode] ?? []).filter((column) => available.has(column));
  if (preferred.length > 0) return [...preferred];

  return [...available]
    .filter((column) => !TECHNICAL_REPORT_COLUMNS.has(column))
    .filter((column) => !column.endsWith('Id'))
    .filter((column) => rows.some((row) => {
      const value = row[column];
      return value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value);
    }))
    .slice(0, 9);
}

/** Use report-specific financial wording so "paid", "allocated", and "remaining" are never ambiguous. */
function displayReportColumnName(reportCode: ReportCode, column: string): string {
  const reportLabels: Readonly<Partial<Record<ReportCode, Readonly<Record<string, string>>>>> = {
    'supplier-payables': { invoiceNo: 'Invoice', allocatedAmount: 'Paid', outstandingAmount: 'Remaining' },
    'supplier-payments': { paymentNo: 'Payment', amount: 'Total', allocatedAmount: 'Allocated', remainingAmount: 'Remaining' },
    'supplier-aging': { invoiceNo: 'Invoice', allocatedAmount: 'Paid', outstandingAmount: 'Remaining', ageDays: 'Age days' },
    'supplier-purchases': { poNo: 'PO' },
    'subcontractor-payments': { paymentNo: 'Payment', cashBankAccount: 'Cash / Bank account' },
    'subcontractor-ledger': { paidAmount: 'Paid', balanceAmount: 'Remaining' },
    'client-billing': { invoiceNo: 'Invoice', allocatedAmount: 'Received', outstandingAmount: 'Remaining' },
    'client-payments': { receiptNo: 'Receipt', allocatedAmount: 'Allocated', unallocatedAmount: 'Unallocated' },
    'employee-payments': { paymentNo: 'Payment', cashBankAccountName: 'Cash / Bank account' }
  };
  return reportLabels[reportCode]?.[column] ?? displayColumnName(column);
}

/** Resolve one nested source object into the same concise labels used by the operational workspaces. */
function displayNestedRecord(record: Record<string, unknown>): string {
  const name = record.displayName ?? record.name ?? record.legalName;
  const code = record.projectCode ?? record.code ?? record.paymentNo ?? record.invoiceNo;
  if (typeof name === 'string' && typeof code === 'string') return `${code} · ${name}`;
  if (typeof name === 'string') return name;
  if (typeof code === 'string') return code;
  return Object.values(record)
    .filter((item): item is string | number => typeof item === 'string' || typeof item === 'number')
    .slice(0, 3)
    .join(' · ') || '—';
}

/** Format one server-returned report cell without recalculating any source-owned values. */
function displayReportValue(value: unknown, column: string, lookups: ReportDisplayLookups): string {
  if (value === null || value === undefined || value === '') return '—';
  if (column === 'vendorId' && typeof value === 'string') return lookups.vendorNames.get(value) ?? 'Unknown supplier';
  if (column === 'projectId' && typeof value === 'string') return lookups.projectNames.get(value) ?? 'Unknown Project';
  if (column === 'clientId' && typeof value === 'string') return lookups.clientNames.get(value) ?? 'Unknown Client';
  if (column === 'subcontractorId' && typeof value === 'string') return lookups.subcontractorNames.get(value) ?? 'Unknown subcontractor';
  if (column === 'category' && value === 'labour') return 'Employee Salaries';
  if (column === 'category' && value === 'security') return 'Security Employee Salaries';
  if (typeof value === 'object' && !Array.isArray(value)) return displayNestedRecord(value as Record<string, unknown>);
  if (Array.isArray(value)) return value.map((item) => displayReportValue(item, column, lookups)).join(', ');
  if (typeof value === 'string' && /(?:amount|balance|subtotal|total|cost|rate)$/i.test(column) && /^-?\d+(?:\.\d+)?$/.test(value)) {
    const negative = value.startsWith('-');
    const unsigned = negative ? value.slice(1) : value;
    const [integer = '0', fraction = ''] = unsigned.split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${negative ? '-' : ''}${grouped}${fraction ? `.${fraction}` : ''}`;
  }
  return String(value).replaceAll('_', ' ');
}

/** Return the compact context line shown below the primary reference, matching the native module lists. */
function reportRowSubtitle(reportCode: ReportCode, row: Record<string, unknown>, lookups: ReportDisplayLookups): string | null {
  const projectId = typeof row.projectId === 'string' ? row.projectId : null;
  const projectName = projectId ? lookups.projectNames.get(projectId) : null;
  if (reportCode.startsWith('supplier-')) {
    const vendorId = typeof row.vendorId === 'string' ? row.vendorId : null;
    const supplier = vendorId ? lookups.vendorNames.get(vendorId) : null;
    return [supplier ? `Supplier ${supplier}` : null, projectName ? `Project ${projectName}` : null].filter(Boolean).join(' · ') || null;
  }
  if (reportCode.startsWith('client-')) {
    const clientId = typeof row.clientId === 'string' ? row.clientId : null;
    const client = clientId ? lookups.clientNames.get(clientId) : null;
    return [client ? `Client ${client}` : null, projectName ? `Project ${projectName}` : null].filter(Boolean).join(' · ') || null;
  }
  if (reportCode.startsWith('subcontractor-')) {
    const subcontractor = row.subcontractor && typeof row.subcontractor === 'object' ? displayNestedRecord(row.subcontractor as Record<string, unknown>) : null;
    const project = row.project && typeof row.project === 'object' ? displayNestedRecord(row.project as Record<string, unknown>) : projectName;
    return [subcontractor, project].filter(Boolean).join(' · ') || null;
  }
  if (reportCode === 'employee-payments') {
    const employeeNo = typeof row.employeeNo === 'string' ? row.employeeNo : null;
    const employeeName = typeof row.employeeName === 'string' ? row.employeeName : null;
    return [employeeNo, employeeName].filter(Boolean).join(' · ') || null;
  }
  if (reportCode === 'equipment-usage' || reportCode === 'attendance') {
    const project = typeof row.projectName === 'string' ? row.projectName : projectName;
    const stage = typeof row.stageName === 'string' ? row.stageName : null;
    return [project, stage].filter(Boolean).join(' · ') || null;
  }
  return null;
}

/** Identify the register reference that should carry the secondary business context line. */
function primaryReportColumn(reportCode: ReportCode, columns: readonly string[]): string | null {
  const preferred: Readonly<Partial<Record<ReportCode, string>>> = {
    'supplier-payables': 'invoiceNo',
    'supplier-payments': 'paymentNo',
    'supplier-purchases': 'poNo',
    'supplier-aging': 'invoiceNo',
    'subcontractor-payments': 'paymentNo',
    'client-billing': 'invoiceNo',
    'client-payments': 'receiptNo',
    'employee-payments': 'paymentNo',
    'equipment-usage': 'usageDate',
    attendance: 'employeeName'
  };
  const candidate = preferred[reportCode];
  return candidate && columns.includes(candidate) ? candidate : columns[0] ?? null;
}

type ReportEvidenceReference = Readonly<{
  resourceType?: DocumentLinkResourceType;
  resourceId?: string;
  documentId?: string;
  reference: string;
  actionLabel: string;
  fallbackFileName: string;
}>;

const SOURCE_AUTHORIZED_EVIDENCE_REPORTS = new Set<ReportCode>([
  'supplier-payables',
  'supplier-payments',
  'supplier-aging',
  'subcontractor-payments'
]);

const DOCUMENT_PERMISSION_EVIDENCE_REPORTS = new Set<ReportCode>([
  'client-billing',
  'client-payments',
  'client-aging',
  'project-expenses'
]);

/** Return whether this report can expose an original source attachment to the current actor. */
function canDownloadReportEvidence(reportCode: ReportCode, canReadDocuments: boolean): boolean {
  return SOURCE_AUTHORIZED_EVIDENCE_REPORTS.has(reportCode)
    || (canReadDocuments && DOCUMENT_PERMISSION_EVIDENCE_REPORTS.has(reportCode));
}

/** Resolve one report row to the immutable ERP document that represents its uploaded source evidence. */
function reportEvidenceReference(reportCode: ReportCode, row: Record<string, unknown>): ReportEvidenceReference | null {
  const id = typeof row.id === 'string' ? row.id : null;
  const documentId = typeof row.documentId === 'string' ? row.documentId : null;
  const invoiceNo = typeof row.invoiceNo === 'string' ? row.invoiceNo : null;
  const paymentNo = typeof row.paymentNo === 'string' ? row.paymentNo : null;
  const receiptNo = typeof row.receiptNo === 'string' ? row.receiptNo : null;

  if (reportCode === 'supplier-payables' && id && invoiceNo) {
    return { resourceType: 'supplier_invoice', resourceId: id, reference: invoiceNo, actionLabel: 'Download invoice', fallbackFileName: `supplier-invoice-${invoiceNo}` };
  }
  if (reportCode === 'supplier-aging' && typeof row.supplierInvoiceId === 'string' && invoiceNo) {
    return { resourceType: 'supplier_invoice', resourceId: row.supplierInvoiceId, reference: invoiceNo, actionLabel: 'Download invoice', fallbackFileName: `supplier-invoice-${invoiceNo}` };
  }
  if (reportCode === 'supplier-payments' && id && paymentNo) {
    return { resourceType: 'supplier_payment', resourceId: id, reference: paymentNo, actionLabel: 'Download proof', fallbackFileName: `supplier-payment-proof-${paymentNo}` };
  }
  if (reportCode === 'subcontractor-payments' && id && paymentNo) {
    return { resourceType: 'subcontract_payment', resourceId: id, reference: paymentNo, actionLabel: 'Download proof', fallbackFileName: `subcontract-payment-proof-${paymentNo}` };
  }
  if (reportCode === 'client-billing' && id && invoiceNo) {
    return { resourceType: 'client_invoice', resourceId: id, reference: invoiceNo, actionLabel: 'Download invoice', fallbackFileName: `client-invoice-${invoiceNo}` };
  }
  if (reportCode === 'client-aging' && typeof row.invoiceId === 'string' && invoiceNo) {
    return { resourceType: 'client_invoice', resourceId: row.invoiceId, reference: invoiceNo, actionLabel: 'Download invoice', fallbackFileName: `client-invoice-${invoiceNo}` };
  }
  if (reportCode === 'client-payments' && id && receiptNo) {
    return { resourceType: 'client_receipt', resourceId: id, reference: receiptNo, actionLabel: 'Download proof', fallbackFileName: `client-payment-${receiptNo}` };
  }
  if (reportCode === 'project-expenses' && id) {
    const reference = typeof row.expenseNo === 'string' ? row.expenseNo : id;
    return {
      ...(documentId ? { documentId } : { resourceType: 'site_expense' as const, resourceId: id }),
      reference,
      actionLabel: 'Download proof',
      fallbackFileName: `site-expense-${reference}`
    };
  }
  return null;
}

/** Download the exact original image/PDF attached to one selected business record. */
async function downloadReportEvidence(reference: ReportEvidenceReference): Promise<void> {
  let documentId = reference.documentId ?? null;
  let fallbackFileName = reference.fallbackFileName;

  if (!documentId) {
    if (!reference.resourceType || !reference.resourceId) throw new Error(`No proof is attached to ${reference.reference}.`);
    const documents = await listDocuments({
      resourceType: reference.resourceType,
      resourceId: reference.resourceId,
      page: 1,
      pageSize: 1
    });
    const document = documents.items[0];
    if (!document) throw new Error(`No original image or PDF is attached to ${reference.reference}.`);
    documentId = document.id;
    fallbackFileName = document.fileName || fallbackFileName;
  }

  const download = await getDocumentDownload(documentId);
  const response = await fetch(download.url);
  if (!response.ok) throw new Error(`Original-file download failed with status ${response.status}.`);
  const objectUrl = URL.createObjectURL(await response.blob());
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = download.version.originalName || fallbackFileName;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
}

/** Format one exact server-owned money value without applying browser arithmetic. */
function displayMoney(value: string, currency: string): string {
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [integer = '0', fraction = ''] = unsigned.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${negative ? '-' : ''}${grouped}.${fraction.padEnd(2, '0').slice(0, 2)}`;
}

/** Convert a server-calculated margin into a bounded visual bar width only. */
function marginBarWidth(value: string): string {
  const percentage = Number(value);
  return `${Number.isFinite(percentage) ? Math.min(100, Math.abs(percentage)) : 0}%`;
}

/** Render the currency-safe executive metrics and Project margin bars. */
function AnalyticsOverview({
  data,
  projectOptions,
  selectedProjectId,
  onProjectChange
}: Readonly<{
  data: ReportAnalyticsOverview;
  projectOptions: readonly Readonly<{ id: string; label: string }>[];
  selectedProjectId: string;
  onProjectChange(projectId: string): void;
}>) {
  return (
    <section className="admin-card reports-overview" aria-labelledby="analytics-overview-title">
      <div className="section-heading compact-heading reports-overview-heading">
        <div>
          <span className="eyebrow">Executive analytics</span>
          <h2 id="analytics-overview-title">Business performance overview</h2>
          <p className="muted">Posted financial position as of {data.asOfDate}. Select a report below for detailed analysis.</p>
        </div>
        <span className="reports-live-badge">Source derived</span>
      </div>

      <div className="reports-overview-filter">
        <label>
          Project view
          <select value={selectedProjectId} onChange={(event) => onProjectChange(event.target.value)}>
            <option value="">All Projects</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
          </select>
        </label>
        <p className="muted">
          {selectedProjectId
            ? 'Showing the complete source-derived financial position for the selected Project.'
            : 'All fixed-price and cost-plus Projects in your permitted scope are included.'}
        </p>
      </div>

      {data.currencies.map((summary) => {
        const metrics: readonly (readonly [string, string])[] = [
          ['Total Client Received', displayMoney(summary.totalRevenue, summary.currency)],
          ['Total Project Cost', displayMoney(summary.totalProjectCost, summary.currency)],
          ['Gross Profit', displayMoney(summary.grossProfit, summary.currency)],
          ['Overall Margin %', `${summary.overallMarginPercent}%`],
          ['Client Receivables', displayMoney(summary.clientReceivables, summary.currency)],
          ['Supplier Payables', displayMoney(summary.supplierPayables, summary.currency)],
          ...(selectedProjectId ? [] : [['Cash / Bank', displayMoney(summary.cashBank, summary.currency)] as const])
        ];
        const isLoss = summary.grossProfit.startsWith('-');
        const isBreakEven = summary.grossProfit === '0.00';
        const positionLabel = isBreakEven ? 'Break-even' : isLoss ? 'Loss' : 'Profit';
        return (
          <div className="reports-currency-overview" key={summary.currency}>
            {data.currencies.length > 1 && <h3>{summary.currency} position</h3>}
            <div className={isLoss ? 'reports-company-position is-loss' : 'reports-company-position'}>
              <div>
                <span className="eyebrow">{selectedProjectId ? 'Selected Project position' : 'Overall company position'}</span>
                <strong>{positionLabel}</strong>
                <p>
                  {selectedProjectId ? 'This Project' : `${summary.projects.length} Project${summary.projects.length === 1 ? '' : 's'}`} {isBreakEven ? 'is at break-even' : `is in ${positionLabel.toLowerCase()}`}.
                </p>
              </div>
              <div className="reports-company-position-value">
                <strong>{displayMoney(summary.grossProfit, summary.currency)}</strong>
                <span>{summary.overallMarginPercent}% margin</span>
              </div>
            </div>
            <p className="reports-profit-definition">
              <strong>Profit / Loss = Total client cash received − Total Project cost.</strong>
              {' '}Project cost includes posted material, Employee Salaries, Equipment Expense, subcontractor, site, security, and other Project expenses. Salary and Supplier cash settlements are not counted a second time.
            </p>
            <dl className="reports-metric-grid">
              {metrics.map(([label, value]) => {
                const isProfitMetric = label === 'Gross Profit' || label === 'Overall Margin %';
                const isNegative = isProfitMetric && value.includes('-');
                return (
                  <div className={isNegative ? 'reports-metric-card reports-negative' : 'reports-metric-card'} key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                );
              })}
            </dl>

            <div className="reports-project-profitability">
              <div className="reports-project-heading">
                <div>
                  <span className="eyebrow">Portfolio view</span>
                  <h3>Profitability by Project</h3>
                </div>
                <span className="muted">Margin = gross profit / client revenue</span>
              </div>
              {summary.projects.length === 0 ? (
                <p className="muted">No visible Projects have profitability data yet.</p>
              ) : (
                <div className="reports-project-bars">
                  {summary.projects.map((project) => {
                    const negative = project.marginPercent.startsWith('-');
                    return (
                      <div className="reports-project-row" key={project.projectId}>
                        <div className="reports-project-label">
                          <strong>{project.projectName}</strong>
                          <span>{project.projectCode}</span>
                        </div>
                        <div
                          className="reports-project-track"
                          role="meter"
                          aria-label={`${project.projectName} margin`}
                          aria-valuenow={Number(project.marginPercent)}
                          aria-valuemin={-100}
                          aria-valuemax={100}
                        >
                          <span
                            className={negative ? 'reports-project-bar is-negative' : 'reports-project-bar'}
                            style={{ width: marginBarWidth(project.marginPercent) }}
                          />
                        </div>
                        <strong className={negative ? 'reports-margin-value is-negative' : 'reports-margin-value'}>
                          {displayMoney(project.grossProfit, summary.currency)} · {project.marginPercent}%
                        </strong>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

/** Render the permission-filtered Module 20 catalog, native register lists, saved filters and row downloads. */
export function ReportsWorkspace(props: ReportsWorkspaceProps) {
  const form = useForm<FilterFormValues>({ resolver: zodResolver(reportFilterFormSchema), defaultValues: EMPTY_FORM });
  const [selectedReportCode, setSelectedReportCode] = useState<ReportCode | null>(null);
  const [analyticsProjectId, setAnalyticsProjectId] = useState('');
  const [globalProjectId, setGlobalProjectId] = useState('');
  const [globalFromDate, setGlobalFromDate] = useState('');
  const [globalToDate, setGlobalToDate] = useState('');
  const [activeSectionId, setActiveSectionId] = useState('suppliers');
  const [savedFilterName, setSavedFilterName] = useState('');
  const [downloadingEvidenceKey, setDownloadingEvidenceKey] = useState<string | null>(null);
  const [evidenceDownloadError, setEvidenceDownloadError] = useState<string | null>(null);
  const [appliedInput, setAppliedInput] = useState<RunReportInput | null>(null);
  const watchedProjectId = form.watch('projectId');
  const projectsQuery = useProjects({ page: 1, pageSize: 100 }, props.canReadProjects);
  const clientsQuery = useClients({ page: 1, pageSize: 100 }, props.canReadClients);
  const vendorsQuery = useVendors({ ...(globalProjectId ? { projectId: globalProjectId } : {}), page: 1, pageSize: 100 }, props.canReadVendors);
  const subcontractorsQuery = useSubcontractors({ ...(globalProjectId ? { projectId: globalProjectId } : {}), page: 1, pageSize: 100 }, props.canReadSubcontractors);
  const stagesQuery = useProjectStages(watchedProjectId || null, props.canReadStages && Boolean(watchedProjectId));
  const financeAccountsQuery = useFinanceAccounts({ page: 1, pageSize: 100 }, props.canReadFinance);
  const financePeriodsQuery = useFinancePeriods({ page: 1, pageSize: 100 }, props.canReadFinance);
  const vendorNames = useMemo(() => new Map((vendorsQuery.data?.items ?? []).map((vendor) => [vendor.id, vendor.displayName])), [vendorsQuery.data?.items]);
  const catalogQuery = useReportCatalog(props.canRead);
  const runMutation = useRunReport();
  const saveFilterMutation = useSaveReportFilter();
  const savedFiltersQuery = useSavedReportFilters(selectedReportCode, props.canRead && props.canSaveFilters);
  const selectedReport = catalogQuery.data?.items.find((item) => item.code === selectedReportCode) ?? null;
  const overviewEnabled = props.canRead && props.canViewOverview && selectedReport === null;
  const portfolioOverviewQuery = useReportsAnalyticsOverview(undefined, overviewEnabled);
  const projectOverviewQuery = useReportsAnalyticsOverview(analyticsProjectId || undefined, overviewEnabled && Boolean(analyticsProjectId));
  const overviewQuery = analyticsProjectId ? projectOverviewQuery : portfolioOverviewQuery;
  const analyticsProjectOptions = useMemo(() => (
    portfolioOverviewQuery.data?.currencies.flatMap((currency) => currency.projects.map((project) => ({
      id: project.projectId,
      label: `${project.projectCode} · ${project.projectName}`
    }))).sort((left, right) => left.label.localeCompare(right.label)) ?? []
  ), [portfolioOverviewQuery.data]);
  const projectOptions = useMemo(() => {
    if (projectsQuery.data?.items.length) {
      return projectsQuery.data.items.map((project) => ({ id: project.id, label: `${project.projectCode} · ${project.name}` }));
    }
    return analyticsProjectOptions;
  }, [analyticsProjectOptions, projectsQuery.data?.items]);
  const projectNames = useMemo(() => new Map(projectOptions.map((project) => [project.id, project.label])), [projectOptions]);
  const clientNames = useMemo(() => new Map((clientsQuery.data?.items ?? []).map((client) => [client.id, `${client.code} · ${client.displayName}`])), [clientsQuery.data?.items]);
  const subcontractorNames = useMemo(() => new Map((subcontractorsQuery.data?.items ?? []).map((subcontractor) => [subcontractor.id, subcontractor.name])), [subcontractorsQuery.data?.items]);
  const reportLookups = useMemo<ReportDisplayLookups>(() => ({ vendorNames, projectNames, clientNames, subcontractorNames }), [clientNames, projectNames, subcontractorNames, vendorNames]);
  const catalogByCode = useMemo(() => new Map((catalogQuery.data?.items ?? []).map((report) => [report.code, report])), [catalogQuery.data?.items]);
  const availableSections = useMemo(() => REPORT_SECTIONS.map((section) => ({
    ...section,
    reports: section.codes
      .map((code) => catalogByCode.get(code))
      .filter((report): report is NonNullable<typeof report> => Boolean(report))
  })).filter((section) => section.reports.length > 0), [catalogByCode]);
  const activeSection = availableSections.find((section) => section.id === activeSectionId) ?? availableSections[0] ?? null;
  const activeFilterFields = selectedReportCode ? REPORT_FILTER_FIELDS[selectedReportCode] : [];
  const columns = selectedReportCode ? reportColumns(selectedReportCode, runMutation.data?.rows ?? []) : [];
  const primaryColumn = selectedReportCode ? primaryReportColumn(selectedReportCode, columns) : null;
  const currentPage = runMutation.data?.page ?? 1;
  const pageSize = runMutation.data?.pageSize ?? 25;
  const pageCount = runMutation.data?.total === undefined ? null : Math.max(1, Math.ceil(runMutation.data.total / pageSize));
  const canGoNext = runMutation.data !== undefined && (
    pageCount !== null ? currentPage < pageCount : runMutation.data.rows.length === pageSize
  );
  const showEvidenceActions = selectedReportCode !== null
    && canDownloadReportEvidence(selectedReportCode, props.canReadDocuments)
    && (runMutation.data?.rows.some((row) => reportEvidenceReference(selectedReportCode, row) !== null) ?? false);

  useEffect(() => {
    if (!selectedReportCode) return;
    const selectedStillAllowed = catalogQuery.data?.items.some((item) => item.code === selectedReportCode) ?? false;
    if (!selectedStillAllowed) {
      setSelectedReportCode(null);
      form.reset(EMPTY_FORM);
    }
  }, [catalogQuery.data, form, selectedReportCode]);

  useEffect(() => {
    if (availableSections.length === 0) return;
    if (!availableSections.some((section) => section.id === activeSectionId)) {
      setActiveSectionId(availableSections[0]?.id ?? 'suppliers');
    }
  }, [activeSectionId, availableSections]);


  /** Change report and clear filters/results that belong to the previously selected report contract. */
  function handleReportChange(reportCode: ReportCode | null): void {
    setSelectedReportCode(reportCode);
    form.reset(reportCode
      ? formValuesWithGlobalFilters(reportCode, globalProjectId, globalFromDate, globalToDate)
      : EMPTY_FORM);
    runMutation.reset();
    setAppliedInput(null);
    setSavedFilterName('');
    setEvidenceDownloadError(null);
    setDownloadingEvidenceKey(null);
  }

  /** Download the original uploaded proof for one selected report row. */
  async function handleEvidenceDownload(reference: ReportEvidenceReference): Promise<void> {
    const key = `${reference.resourceType ?? 'document'}:${reference.resourceId ?? reference.documentId ?? reference.reference}`;
    setEvidenceDownloadError(null);
    setDownloadingEvidenceKey(key);
    try {
      await downloadReportEvidence(reference);
    } catch (error) {
      setEvidenceDownloadError(error instanceof Error ? error.message : `The original file for ${reference.reference} could not be downloaded.`);
    } finally {
      setDownloadingEvidenceKey(null);
    }
  }

  /** Show one business section at a time and clear detail from another section. */
  function handleSectionChange(sectionId: string): void {
    setActiveSectionId(sectionId);
    const section = REPORT_SECTIONS.find((item) => item.id === sectionId);
    if (selectedReportCode && section && !section.codes.includes(selectedReportCode)) handleReportChange(null);
  }

  /** Open one list report and run it immediately when its shared filters are sufficient. */
  function handleCatalogView(reportCode: ReportCode): void {
    const values = formValuesWithGlobalFilters(reportCode, globalProjectId, globalFromDate, globalToDate);
    handleReportChange(reportCode);
    const parsed = reportFilterFormSchema.safeParse(values);
    if (!parsed.success) {
      form.reset(values);
      void form.trigger();
      requestAnimationFrame(() => document.getElementById('report-filters')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
      return;
    }
    handleRunReport(parsed.data);
    requestAnimationFrame(() => document.getElementById('report-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  /** Apply the global Project selection to the overview and any compatible detailed report. */
  function handleGlobalProjectChange(projectId: string): void {
    setGlobalProjectId(projectId);
    setAnalyticsProjectId(projectId);
    if (selectedReportCode && REPORT_FILTER_FIELDS[selectedReportCode].includes('projectId')) {
      form.setValue('projectId', projectId, { shouldValidate: true });
      form.setValue('stageId', '');
    }
  }

  /** Apply one global date boundary only to compatible detailed reports. */
  function handleGlobalDateChange(field: 'fromDate' | 'toDate', value: string): void {
    if (field === 'fromDate') setGlobalFromDate(value);
    else setGlobalToDate(value);
    if (!selectedReportCode) return;
    const fields = REPORT_FILTER_FIELDS[selectedReportCode];
    if (fields.includes(field)) form.setValue(field, value, { shouldValidate: true });
    if (field === 'toDate' && fields.includes('asOfDate')) form.setValue('asOfDate', value, { shouldValidate: true });
  }

  /** Clear the shared report context and the selected report's matching fields. */
  function handleResetGlobalFilters(): void {
    setGlobalProjectId('');
    setAnalyticsProjectId('');
    setGlobalFromDate('');
    setGlobalToDate('');
    if (selectedReportCode) {
      form.reset({ ...EMPTY_FORM, reportCode: selectedReportCode });
      runMutation.reset();
      setAppliedInput(null);
    }
  }

  /** Run the selected report from validated filters and start at its first bounded page. */
  function handleRunReport(values: FilterFormValues): void {
    const baseFilters = businessFiltersFromValues(values);
    setAppliedInput({ reportCode: values.reportCode, filters: baseFilters });
    runMutation.mutate({ reportCode: values.reportCode, filters: runFiltersFromValues(values, 1) });
  }

  /** Request another bounded result page from the same submitted filter snapshot. */
  function handleResultPage(page: number): void {
    if (!appliedInput || page < 1) return;
    runMutation.mutate({
      reportCode: appliedInput.reportCode,
      filters: { ...appliedInput.filters, page, pageSize: 25 }
    });
  }

  /** Save the current validated business filters under the authenticated user. */
  function handleSaveFilter(values: FilterFormValues): void {
    const name = savedFilterName.trim();
    if (!name) return;
    saveFilterMutation.mutate({
      reportCode: values.reportCode,
      name,
      filters: businessFiltersFromValues(values)
    }, {
      onSuccess: () => setSavedFilterName('')
    });
  }

  /** Apply one user-owned saved filter and clear any result from a previous filter snapshot. */
  function handleApplySavedFilter(saved: SavedReportFilter): void {
    setSelectedReportCode(saved.reportCode);
    form.reset(formValuesFromSavedFilter(saved));
    runMutation.reset();
    setAppliedInput(null);
  }

  if (!props.canRead) {
    return (
      <section className="admin-card">
        <h1>Reports & Analytics</h1>
        <p className="muted"><code>reports.read</code> permission is required to open Module 20.</p>
      </section>
    );
  }

  return (
    <div className="reports-workspace">
      <section className="admin-card reports-command-center">
        <div className="section-heading reports-page-heading">
          <div>
            <span className="eyebrow">Management reporting</span>
            <h1>Reports & Analytics</h1>
            <p className="muted">One professional report center for Projects, suppliers, subcontractors, Clients, Cash, Bank and Finance.</p>
          </div>
          <span className="reports-live-badge">Live source data</span>
        </div>
        <div className="reports-global-filterbar" aria-label="Global report filters">
          <div className="reports-global-filter-heading">
            <strong>Global filters</strong>
            <span>Applied automatically when the selected report supports them.</span>
          </div>
          <label>
            Project
            <select value={globalProjectId} onChange={(event) => handleGlobalProjectChange(event.target.value)}>
              <option value="">All permitted Projects</option>
              {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
            </select>
          </label>
          <label>
            From date
            <input type="date" value={globalFromDate} onChange={(event) => handleGlobalDateChange('fromDate', event.target.value)} />
          </label>
          <label>
            To / as-of date
            <input type="date" min={globalFromDate || undefined} value={globalToDate} onChange={(event) => handleGlobalDateChange('toDate', event.target.value)} />
          </label>
          <button type="button" className="secondary-button" onClick={handleResetGlobalFilters}>Reset</button>
        </div>
        {catalogQuery.isPending && <p>Loading report catalog…</p>}
        <div className="reports-library-heading">
          <div>
            <h2>Report Catalog</h2>
            <p className="muted">Choose a business section, then open the exact list you need. Data remains permission and Project scoped by the server.</p>
          </div>
          {activeSection && <span className="reports-library-count">{activeSection.reports.length} report{activeSection.reports.length === 1 ? '' : 's'}</span>}
        </div>
        {errorMessage(catalogQuery.error) && <div className="form-error" role="alert">{errorMessage(catalogQuery.error)}</div>}
        {catalogQuery.data && catalogQuery.data.items.length === 0 && <p className="muted">No reports are available for the current permissions.</p>}
        {availableSections.length > 0 && (
          <div className="reports-section-selector" role="tablist" aria-label="Report business sections">
            {availableSections.map((section) => (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={activeSection?.id === section.id}
                className={activeSection?.id === section.id ? 'reports-section-tab is-active' : 'reports-section-tab'}
                onClick={() => handleSectionChange(section.id)}
              >
                {section.title}
              </button>
            ))}
          </div>
        )}
        {activeSection && (
          <section className="reports-section-panel" aria-labelledby={`report-section-${activeSection.id}`}>
            <div className="reports-section-panel-heading">
              <div>
                <h3 id={`report-section-${activeSection.id}`}>{activeSection.title}</h3>
                <p>{activeSection.description}</p>
              </div>
            </div>
            <div className="reports-dataset-list">
              {activeSection.reports.map((report) => (
                <div className={selectedReportCode === report.code ? 'reports-dataset-row is-active' : 'reports-dataset-row'} key={report.code}>
                  <div className="reports-dataset-copy">
                    <strong>{REPORT_DISPLAY_NAMES[report.code] ?? report.name}</strong>
                    <span>{REPORT_DESCRIPTIONS[report.code] ?? `Source-derived ${report.domain.toLowerCase()} report.`}</span>
                  </div>
                  <div className="reports-dataset-actions">
                    <button type="button" className="secondary-button" onClick={() => handleCatalogView(report.code)}>
                      View
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </section>

      {!selectedReport && props.canViewOverview && overviewQuery.data && (
        <AnalyticsOverview
          data={overviewQuery.data}
          projectOptions={projectOptions}
          selectedProjectId={analyticsProjectId}
          onProjectChange={handleGlobalProjectChange}
        />
      )}
      {!selectedReport && props.canViewOverview && overviewQuery.isPending && (
        <section className="admin-card reports-overview-loading" aria-live="polite"><p>Loading executive analytics…</p></section>
      )}
      {!selectedReport && props.canViewOverview && errorMessage(overviewQuery.error) && (
        <section className="admin-card">
          <div className="form-error" role="alert">{errorMessage(overviewQuery.error)}</div>
          {analyticsProjectId && <button type="button" className="secondary-button" onClick={() => setAnalyticsProjectId('')}>Back to all Projects</button>}
        </section>
      )}
      {!selectedReport && !props.canViewOverview && (
        <section className="admin-card"><p className="muted">Financial overview requires Reports Finance, Finance, and Project Profitability portfolio access.</p></section>
      )}

      {selectedReport && (
        <section className="admin-card reports-selected-data" id="report-results" aria-label="Report Results">
          <div className="reports-selected-data-heading">
            <div>
              <span className="eyebrow">Selected list</span>
              <h2>{REPORT_DISPLAY_NAMES[selectedReport.code] ?? selectedReport.name}</h2>
              <p className="muted">{REPORT_DESCRIPTIONS[selectedReport.code] ?? selectedReport.domain}</p>
            </div>
            <div className="reports-selected-data-actions">
              <span className="muted">Download the original uploaded invoice or payment proof from the row you need.</span>
              <button type="button" className="secondary-button" onClick={() => handleReportChange(null)}>Close list</button>
            </div>
          </div>
          {runMutation.isPending && <p>Loading {REPORT_DISPLAY_NAMES[selectedReport.code] ?? selectedReport.name}…</p>}
          {!runMutation.data && !runMutation.isPending && <p className="muted">Use View above to load this list, or adjust its filters below and run it again.</p>}
          {errorMessage(runMutation.error) && <div className="form-error" role="alert">{errorMessage(runMutation.error)}</div>}
          {evidenceDownloadError && <div className="form-error" role="alert">{evidenceDownloadError}</div>}
          {runMutation.data && (
            <>
              <p className="muted reports-result-meta">Generated {new Date(runMutation.data.generatedAt).toLocaleString()}{runMutation.data.asOfDate ? ` · As of ${runMutation.data.asOfDate}` : ''}</p>
              {runMutation.data.rows.length === 0 ? <p>No matching rows.</p> : (
                <div className="table-wrap reports-selected-table-wrap">
                  <table className="admin-table reports-result-table reports-register-table">
                    <thead>
                      <tr>
                        {columns.map((column) => <th key={column}>{displayReportColumnName(selectedReport.code, column)}</th>)}
                        {showEvidenceActions && <th className="reports-row-action-heading">Proof</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {runMutation.data.rows.map((row, rowIndex) => {
                        const subtitle = reportRowSubtitle(selectedReport.code, row, reportLookups);
                        const evidenceReference = reportEvidenceReference(selectedReport.code, row);
                        const evidenceKey = evidenceReference
                          ? `${evidenceReference.resourceType ?? 'document'}:${evidenceReference.resourceId ?? evidenceReference.documentId ?? evidenceReference.reference}`
                          : null;
                        return (
                          <tr key={rowIndex}>
                            {columns.map((column) => (
                              <td key={column}>
                                {column === primaryColumn ? (
                                  <div className="reports-primary-cell">
                                    <strong>{displayReportValue(row[column], column, reportLookups)}</strong>
                                    {subtitle && <small>{subtitle}</small>}
                                  </div>
                                ) : displayReportValue(row[column], column, reportLookups)}
                              </td>
                            ))}
                            {showEvidenceActions && (
                              <td className="reports-row-action-cell">
                                {evidenceReference ? (
                                  <button
                                    type="button"
                                    className="secondary-button"
                                    disabled={downloadingEvidenceKey !== null}
                                    onClick={() => void handleEvidenceDownload(evidenceReference)}
                                  >
                                    {downloadingEvidenceKey === evidenceKey ? 'Downloading…' : evidenceReference.actionLabel}
                                  </button>
                                ) : <span className="muted">—</span>}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {PAGINATED_REPORTS.has(runMutation.data.reportCode) && (
                <div className="pagination-row">
                  <button type="button" className="secondary-button" disabled={currentPage <= 1 || runMutation.isPending} onClick={() => handleResultPage(currentPage - 1)}>Previous</button>
                  <span>Page {currentPage}{pageCount === null ? '' : ` of ${pageCount}`}{runMutation.data.total === undefined ? '' : ` · ${runMutation.data.total} row(s)`}</span>
                  <button type="button" className="secondary-button" disabled={!canGoNext || runMutation.isPending} onClick={() => handleResultPage(currentPage + 1)}>Next</button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {selectedReport && (
        <section className="admin-card" id="report-filters">
          <h2>Report Filters</h2>
          <p className="muted">Only filters documented for the selected report are sent. Company, permissions and Project scope stay server-derived.</p>
          <form className="admin-form" onSubmit={form.handleSubmit(handleRunReport)}>
            {activeFilterFields.length === 0 ? (
              <p className="muted">This report does not require additional filters.</p>
            ) : (
              <div className="reports-filter-grid">
                {activeFilterFields.map((field) => (
                  <label key={field}>
                    {FILTER_LABELS[field]}
                    {field === 'projectId' ? (
                      <select {...form.register(field)}>
                        <option value="">All permitted Projects</option>
                        {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.label}</option>)}
                      </select>
                    ) : field === 'stageId' ? (
                      <select {...form.register(field)} disabled={!watchedProjectId}>
                        <option value="">{watchedProjectId ? 'All Project stages' : 'Select a Project first'}</option>
                        {(stagesQuery.data?.items ?? []).map((stage) => <option key={stage.id} value={stage.id}>{stage.code} · {stage.name}</option>)}
                      </select>
                    ) : field === 'clientId' ? (
                      <select {...form.register(field)}><option value="">All Clients</option>{(clientsQuery.data?.items ?? []).map((client) => <option key={client.id} value={client.id}>{client.code} · {client.displayName}</option>)}</select>
                    ) : field === 'vendorId' ? (
                      <select {...form.register(field)}><option value="">All suppliers</option>{(vendorsQuery.data?.items ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.code} · {vendor.displayName}</option>)}</select>
                    ) : field === 'subcontractorId' ? (
                      <select {...form.register(field)}><option value="">All subcontractors</option>{(subcontractorsQuery.data?.items ?? []).map((subcontractor) => <option key={subcontractor.id} value={subcontractor.id}>{subcontractor.name} · {subcontractor.specialty}</option>)}</select>
                    ) : field === 'periodId' ? (
                      <select {...form.register(field)}><option value="">Select fiscal period</option>{(financePeriodsQuery.data?.items ?? []).map((period) => <option key={period.id} value={period.id}>{period.fiscalYear} / {period.periodNo} · {period.startDate} to {period.endDate}</option>)}</select>
                    ) : field === 'accountId' ? (
                      <select {...form.register(field)}><option value="">All General Ledger accounts</option>{(financeAccountsQuery.data?.items ?? []).map((account) => <option key={account.id} value={account.id}>{account.accountCode} · {account.name}</option>)}</select>
                    ) : (
                      <input type={field === 'fromDate' || field === 'toDate' || field === 'asOfDate' ? 'date' : 'text'} placeholder={field.endsWith('Id') ? 'Record identifier' : undefined} {...form.register(field)} />
                    )}
                    {form.formState.errors[field] && <span className="field-error">{form.formState.errors[field]?.message}</span>}
                  </label>
                ))}
              </div>
            )}
            <div className="reports-action-row">
              <button type="submit" disabled={runMutation.isPending}>{runMutation.isPending ? 'Running…' : 'Run Report'}</button>
            </div>
          </form>
        </section>
      )}

      {props.canSaveFilters && selectedReport && (
        <section className="admin-card">
          <h2>Saved Filters</h2>
          <div className="reports-save-row">
            <label>
              Filter name
              <input value={savedFilterName} maxLength={100} onChange={(event) => setSavedFilterName(event.target.value)} placeholder="e.g. Current Project" />
            </label>
            <button type="button" disabled={!savedFilterName.trim() || saveFilterMutation.isPending} onClick={() => void form.handleSubmit(handleSaveFilter)()}>
              {saveFilterMutation.isPending ? 'Saving…' : 'Save current filters'}
            </button>
          </div>
          {errorMessage(saveFilterMutation.error) && <div className="form-error" role="alert">{errorMessage(saveFilterMutation.error)}</div>}
          {savedFiltersQuery.isPending && <p>Loading saved filters…</p>}
          {errorMessage(savedFiltersQuery.error) && <div className="form-error" role="alert">{errorMessage(savedFiltersQuery.error)}</div>}
          {savedFiltersQuery.data && savedFiltersQuery.data.items.length === 0 && <p className="muted">No saved filters for this report.</p>}
          {savedFiltersQuery.data && savedFiltersQuery.data.items.length > 0 && (
            <div className="reports-saved-list">
              {savedFiltersQuery.data.items.map((saved) => (
                <button key={saved.id} type="button" className="secondary-button" onClick={() => handleApplySavedFilter(saved)}>{saved.name}<span className="muted"> · {new Date(saved.createdAt).toLocaleString()} · {saved.id}</span></button>
              ))}
            </div>
          )}
        </section>
      )}

    </div>
  );
}
