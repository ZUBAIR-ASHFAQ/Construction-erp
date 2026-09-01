import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const ROOT = new URL('../', import.meta.url);
const SCHEMA = 'apps/api/src/modules/reports/reports.schema.ts';

/** Read one repository text file relative to the project root. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('B20.3 freezes the five Final-21 Reports permissions and four stable errors', () => {
  const schema = read(SCHEMA);
  for (const permission of [
    'reports.read',
    'reports.export',
    'reports.finance.read',
    'reports.hr.read',
    'reports.save_filters'
  ]) assert.ok(schema.includes(`'${permission}'`), `missing permission ${permission}`);

  for (const code of [
    'REPORT_NOT_FOUND',
    'REPORT_SCOPE_FORBIDDEN',
    'REPORT_FILTER_INVALID',
    'REPORT_EXPORT_FAILED'
  ]) assert.ok(schema.includes(`'${code}'`), `missing error ${code}`);
});

test('B20.3 allow-lists the required report families and rejects user-defined report codes', () => {
  const schema = read(SCHEMA);
  for (const code of [
    'project-cost',
    'budget-vs-actual',
    'project-profit-loss',
    'stage-progress',
    'stage-cost',
    'stage-billing',
    'stage-receipts',
    'client-billing',
    'client-payments',
    'client-outstanding',
    'client-advance',
    'client-aging',
    'supplier-purchases',
    'supplier-payables',
    'supplier-payments',
    'supplier-aging',
    'attendance',
    'payroll',
    'labour-cost',
    'cash-bank',
    'general-ledger',
    'profit-loss',
    'balance-sheet',
    'cash-flow'
  ]) assert.ok(schema.includes(`'${code}'`), `missing report code ${code}`);
  assert.match(schema, /reportCodeSchema = z\.enum\(REPORT_CODES\)/);
  assert.doesNotMatch(schema, /user[- ]defined report|custom sql|raw sql/i);
});

test('B20.3 keeps report requests bounded and strict', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /REPORTS_MAX_PAGE_SIZE = 100/);
  assert.match(schema, /REPORTS_MAX_DATE_RANGE_DAYS = 366/);
  assert.match(schema, /pageSize: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(REPORTS_MAX_PAGE_SIZE\)/);
  assert.match(schema, /report date range cannot exceed/);
  assert.match(schema, /toDate cannot precede fromDate/);
  assert.match(schema, /reportFiltersSchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)\.superRefine\(validateReportDateRange\)/);
});

test('B20.3 keeps ownership formulas and query authority server-owned', () => {
  const schema = read(SCHEMA);
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'allowedProjectIds',
    'formula',
    'expression',
    'metricExpression',
    'sql',
    'queryText'
  ]) assert.ok(schema.includes(`'${field}'`), `missing server-owned marker ${field}`);

  const runBody = schema.match(/runReportBodySchema = z\.object\(\{[\s\S]*?\}\)\.strict\(\)/)?.[0] ?? '';
  assert.match(runBody, /reportCode:/);
  assert.match(runBody, /filters:/);
  assert.doesNotMatch(runBody, /companyId:|formula:|expression:|sql:/);
});

test('B20.3 allow-lists export formats and freezes report run states', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /REPORT_OUTPUT_FORMATS = Object\.freeze\(\['PDF', 'EXCEL', 'CSV'\] as const\)/);
  for (const status of ['QUEUED', 'RUNNING', 'COMPLETED', 'FAILED']) {
    assert.ok(schema.includes(`'${status}'`), `missing run status ${status}`);
  }
  assert.match(schema, /outputFormat: outputFormatSchema/);
});

test('B20.3 boundary schemas remain the frozen contracts used by later service and HTTP work', () => {
  const schema = read(SCHEMA);
  for (const contract of [
    'reportCatalogQuerySchema',
    'runReportBodySchema',
    'createReportExportBodySchema',
    'reportRunIdParamsSchema',
    'savedReportFiltersQuerySchema',
    'saveReportFilterBodySchema',
    'reportCatalogResponseSchema',
    'runReportResponseSchema',
    'reportRunResponseSchema',
    'reportDownloadResponseSchema',
    'savedReportFiltersResponseSchema'
  ]) assert.match(schema, new RegExp(`export const ${contract}\\b`), `missing ${contract}`);

  const service = read('apps/api/src/modules/reports/reports.service.ts');
  assert.match(service, /reportCatalogResponseSchema/);
  assert.match(service, /reportRunResponseSchema/);
  assert.match(service, /savedReportFiltersResponseSchema/);
});

test('B20.3 maps all stable report errors into the shared API error envelope', () => {
  const schema = read(SCHEMA);
  assert.match(schema, /export function createReportsError\(code: ReportsErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new AuthorizationError/);
  assert.match(schema, /new ValidationError/);
  assert.match(schema, /new ConflictError/);
});

test('B20.3 keeps named helper functions documented for junior-developer readability', () => {
  const schema = read(SCHEMA);
  for (const functionName of ['isValidDateOnly', 'dateOrdinal', 'validateReportDateRange', 'createReportsError']) {
    const functionIndex = schema.indexOf(`function ${functionName}`);
    assert.ok(functionIndex > 0, `missing function ${functionName}`);
    const preceding = schema.slice(Math.max(0, functionIndex - 180), functionIndex);
    assert.match(preceding, /\/\*\*[\s\S]*?\*\//, `missing purpose comment for ${functionName}`);
  }
});
