import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const financeRepository = await readFile('apps/api/src/modules/finance/finance.repository.ts', 'utf8');

/** Extract one class method body region by method name for focused repository assertions. */
function methodRegion(source, methodName, nextMethodName) {
  const start = source.indexOf(`async ${methodName}`);
  assert.ok(start >= 0, `${methodName} was not found.`);
  const end = nextMethodName ? source.indexOf(`async ${nextMethodName}`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('B17.4 repository resolves Stage ownership by Company and Project without browser authority', () => {
  const region = methodRegion(repository, 'findProjectStagesByIds', 'sumProjectCostActuals');
  assert.match(region, /projectIsVisible\(projectId, visibility\)/);
  assert.match(region, /projectStage\.findMany/);
  assert.match(region, /scope\.where\(\{ projectId, id: \{ in: ids \} \}\)/);
  assert.match(region, /select: \{ id: true, projectId: true, status: true \}/);
});

test('B17.4 repository exposes source-derived Project and Stage actual-cost reads only', () => {
  const projectRegion = methodRegion(repository, 'sumProjectCostActuals', 'sumStageCostActuals');
  const stageRegion = methodRegion(repository, 'sumStageCostActuals', 'findGlAccountById');
  assert.match(projectRegion, /costActual\.aggregate/);
  assert.match(projectRegion, /scope\.where\(\{ projectId,/);
  assert.match(stageRegion, /costActual\.groupBy/);
  assert.match(stageRegion, /by: \['stageId'\]/);
  assert.match(stageRegion, /scope\.where\(\{ projectId, stageId: \{ in: ids \},/);
  assert.doesNotMatch(projectRegion + stageRegion, /costCommitment|budgetLine|forecastLine/);
});

test('B17.4 repository resolves Finance accounts inside Company scope without posting journals', () => {
  const byId = methodRegion(repository, 'findGlAccountById', 'findGlAccountByCode');
  const byCode = methodRegion(repository, 'findGlAccountByCode', 'findSettings');
  for (const region of [byId, byCode]) {
    assert.match(region, /glAccount\.findFirst/);
    assert.match(region, /accountCode: true, accountType: true, status: true/);
    assert.doesNotMatch(region, /journal\.|postSourceJournal/);
  }
});


test('B17.4 keeps transaction locks and reuses the Finance-owned source-key lookup seam', () => {
  const lock = methodRegion(repository, 'lockClaim', 'createClaim');
  assert.match(lock, /FOR UPDATE/);
  assert.match(lock, /company_id = \${scope\.companyId}::uuid/);
  assert.match(financeRepository, /async findJournalBySourceKey\(sourceKey: string\)/);
  assert.doesNotMatch(repository, /async findJournalBySourceKey/);
});

test('B17.4 invoice persistence accepts a complete Stage-aware line set', () => {
  assert.match(repository, /export type ClientInvoiceLineWrite/);
  const region = methodRegion(repository, 'createInvoice', 'listInvoices');
  assert.match(region, /lines: readonly ClientInvoiceLineWrite\[\]/);
  assert.match(region, /input\.lines\.map\(\(line\) => \(\{/);
  assert.match(region, /stageId: line\.stageId/);
  assert.match(region, /amount: line\.amount/);
  assert.match(region, /revenueAccountId: line\.revenueAccountId/);
  assert.doesNotMatch(region, /stageId: null, description: input\.description/);
});

test('B17.4 keeps business calculation and Finance posting out of the repository while later service passes may complete them', () => {
  assert.doesNotMatch(repository, /percentageOf\(|postSourceJournalInTransaction|FinanceService/);
  assert.match(service, /postSourceJournalInTransaction/);
});
