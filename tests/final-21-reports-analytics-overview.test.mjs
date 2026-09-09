import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = new URL('../', import.meta.url);

/** Read one project file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(new URL(relativePath, ROOT), 'utf8');
}

test('Reports exposes a strict authenticated executive-overview read endpoint', () => {
  const schema = read('apps/api/src/modules/reports/reports.schema.ts');
  const routes = read('apps/api/src/modules/reports/reports.routes.ts');
  assert.match(schema, /reportAnalyticsOverviewQuerySchema = z\.object\(\{[\s\S]*projectId: uuidSchema\.optional\(\)/);
  assert.match(schema, /reportAnalyticsOverviewResponseSchema = z\.object\(\{/);
  assert.match(routes, /app\.get\(`\$\{REPORTS_API_BASE\}\/overview`/);
  assert.match(routes, /operationId: 'getReportsAnalyticsOverview'/);
  assert.match(routes, /preHandler: \[authenticate\]/);
  assert.match(routes, /parseRequest\(reportAnalyticsOverviewQuerySchema, request\.query, 'query'\)/);
});

test('Reports derives company and Project positions from profitability and posted cash sources', () => {
  const service = read('apps/api/src/modules/reports/reports.service.ts');
  for (const marker of [
    'ProjectProfitabilityService',
    'commercialSummary.totalRevenue',
    'commercialSummary.totalCost',
    'project.outstandingAmount',
    'project.supplierPayableAmount',
    'listCashBankAccounts',
    'ratioToPercent',
    'grossProfit'
  ]) assert.match(service, new RegExp(marker.replace('.', '\\.')));
  assert.match(service, /query\.projectId \? Promise\.resolve\(0n\) : this\.readCashBankBalance\(\)/);
  assert.doesNotMatch(service, /\$queryRaw|\$executeRaw|SELECT\s+/i);
});

test('Reports landing renders overall profit or loss and a server-backed Project filter', () => {
  const api = read('apps/web/src/features/reports/api/reports-api.ts');
  const hooks = read('apps/web/src/features/reports/hooks/reports.ts');
  const workspace = read('apps/web/src/features/reports/components/reports-workspace.tsx');
  assert.match(api, /getReportsAnalyticsOverview\(projectId\?: string\)/);
  assert.match(hooks, /useReportsAnalyticsOverview\(projectId\?: string/);
  for (const label of [
    'Total Client Received', 'Total Project Cost', 'Gross Profit', 'Overall Margin', 'Client Receivables',
    'Supplier Payables', 'Cash / Bank', 'Overall company position', 'Profitability by Project', 'All Projects'
  ]) assert.ok(workspace.includes(label), `missing ${label}`);
  assert.match(workspace, /positionLabel = isBreakEven \? 'Break-even' : isLoss \? 'Loss' : 'Profit'/);
  assert.match(workspace, /Profit \/ Loss = Total client cash received − Total Project cost/);
  assert.match(workspace, /projectOverviewQuery = useReportsAnalyticsOverview\(analyticsProjectId \|\| undefined/);
});
