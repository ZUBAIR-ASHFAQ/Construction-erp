import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');
const backend = 'apps/api/src/modules/finance';
const web = 'apps/web/src/features/finance';

/** Verify R10 adds one bounded read-only period selector without fiscal-period CRUD. */
test('R10 exposes bounded fiscal-period selection while preserving explicit close ownership', async () => {
  const [schema, routes] = await Promise.all([
    read(`${backend}/finance.schema.ts`),
    read(`${backend}/finance.routes.ts`)
  ]);

  assert.match(schema, /GET', route: '\/api\/v1\/finance\/periods'/);
  assert.match(schema, /listFinancePeriodsQuerySchema/);
  assert.match(schema, /listFinancePeriodsResponseSchema/);
  assert.match(routes, /app\.get\('\/api\/v1\/finance\/periods'/);
  assert.match(routes, /LIST_PERIODS_QUERY_JSON_SCHEMA/);
  assert.doesNotMatch(`${schema}\n${routes}`, /app\.post\('\/api\/v1\/finance\/periods'|periods\/:id\/reopen|createFinancePeriod/);
});

/** Verify R10 period reads stay Company-scoped and do not bypass Finance permissions. */
test('R10 lists fiscal periods through Company-scoped repository and service policy', async () => {
  const [repository, service] = await Promise.all([
    read(`${backend}/finance.repository.ts`),
    read(`${backend}/finance.service.ts`)
  ]);

  assert.match(repository, /async listFiscalPeriods\(input: ListFinancePeriodsRepositoryInput\)/);
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /this\.db\.fiscalPeriod\.findMany/);
  assert.match(repository, /this\.db\.fiscalPeriod\.count/);
  assert.match(service, /async listFiscalPeriods\(input: ListFinancePeriodsQuery\)/);
  assert.match(service, /finance\.read/);
  assert.match(service, /finance\.periods\.close/);
  assert.match(service, /new FinanceRepository\(this\.db\)\.listFiscalPeriods/);
});

/** Verify the Finance UI uses readable period selectors instead of raw fiscal-period UUID fields. */
test('R10 replaces raw fiscal-period UUID entry with period selectors in ledger trial balance and close', async () => {
  const [api, hooks, page] = await Promise.all([
    read(`${web}/api/finance-api.ts`),
    read(`${web}/hooks/finance.ts`),
    read(`${web}/pages/finance-page.tsx`)
  ]);

  assert.match(api, /function listFinancePeriods/);
  assert.match(api, /finance\/periods/);
  assert.match(hooks, /function useFinancePeriods/);
  assert.match(page, /formatPeriodLabel/);
  assert.match(page, /openPeriods/);
  assert.match(page, /ledgerForm\.register\('periodId'\)/);
  assert.match(page, /trialForm\.register\('periodId'\)/);
  assert.match(page, /closePeriodForm\.register\('periodId'\)/);
  assert.doesNotMatch(page, /Fiscal period ID<input/);
  assert.doesNotMatch(page, /Cash Flow|Balance Sheet|Profit and Loss|P&L/);
});
