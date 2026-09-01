import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');

/** Extract one class method region for focused service assertions. */
function methodRegion(source, methodName, nextMethodName) {
  const start = source.indexOf(`${methodName}(`);
  assert.ok(start >= 0, `${methodName} was not found.`);
  const end = nextMethodName ? source.indexOf(`${nextMethodName}(`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('B17.5 validates every non-null claim Stage through the Project-scoped repository read', () => {
  const region = methodRegion(service, 'requireClaimStages', 'requireCostPlusBasis');
  assert.match(region, /claimStageIds\(lines\)/);
  assert.match(region, /findProjectStagesByIds\(projectId, stageIds, visibility\)/);
  assert.match(region, /stages\.length !== stageIds\.length/);
  assert.match(region, /createClientBillingError\('BILLING_STAGE_INVALID'\)/);
});

test('B17.5 validates Stage ownership before claim create and line replacement', () => {
  const create = methodRegion(service, 'createClaimOnce', 'updateClaim');
  const update = methodRegion(service, 'updateClaimOnce', 'finalizeClaim');
  assert.match(create, /requireClaimStages\(repository, project\.id, input\.lines, visibility\)/);
  assert.match(update, /input\.lines !== undefined/);
  assert.match(update, /requireClaimStages\(repository, project\.id, input\.lines, broadVisibility\)/);
  assert.ok(create.indexOf('requireClaimStages') < create.indexOf('repository.createClaim'), 'Stage validation must run before claim persistence.');
  assert.ok(update.indexOf('requireClaimStages') < update.indexOf('repository.updateDraftClaim'), 'Stage validation must run before replacing claim lines.');
});

test('B17.5 keeps the Project commercial model authoritative for Client Billing settings', () => {
  const helper = methodRegion(service, 'requireBillingMethod', 'pageWindow');
  const update = methodRegion(service, 'updateSettingsOnce', 'listClaims');
  assert.match(helper, /billingMethod !== project\.projectModel/);
  assert.match(helper, /COST_PLUS_PERCENTAGE/);
  assert.match(helper, /project\.costPlusPercent/);
  assert.match(update, /input\.billingMethod !== project\.projectModel/);
  assert.match(update, /createClientBillingError\('INVALID_BILLING_BASIS'\)/);
});

test('B17.5 rejects inactive billing settings for claim writes and finalization without blocking settings deactivation itself', () => {
  const create = methodRegion(service, 'createClaimOnce', 'updateClaim');
  const update = methodRegion(service, 'updateClaimOnce', 'finalizeClaim');
  const finalize = methodRegion(service, 'finalizeClaimOnce', 'createInvoice');
  const settings = methodRegion(service, 'updateSettingsOnce', 'listClaims');
  for (const region of [create, update, finalize]) assert.match(region, /settings\?\.status === 'INACTIVE'/);
  assert.doesNotMatch(settings, /input\.status === 'INACTIVE'.*INVALID_BILLING_BASIS/s);
});

test('B17.5 derives the Cost + Percentage Project ceiling only from posted actual-cost sources and Project percent', () => {
  const region = methodRegion(service, 'requireCostPlusBasis', 'getSettings');
  assert.match(region, /sumProjectCostActuals\(project\.id, visibility, periodEnd\)/);
  assert.match(region, /sumFinalizedClaimGross\(project\.id, visibility\)/);
  assert.match(region, /projectCost \+ percentageOf\(projectCost, project\.costPlusPercent\)/);
  assert.match(region, /priorGross \+ gross > projectLimit/);
  assert.match(repository, /costActual\.aggregate/);
  assert.doesNotMatch(region, /budgetLine|costCommitment|forecastLine|physicalProgress/i);
});

test('B17.5 also protects each claimed Stage against its own Cost + Percentage source basis', () => {
  const region = methodRegion(service, 'requireCostPlusBasis', 'getSettings');
  assert.match(region, /sumStageCostActuals\(project\.id, stageIds, visibility, periodEnd\)/);
  assert.match(region, /sumFinalizedClaimLinesByStage\(project\.id, stageIds, visibility\)/);
  assert.match(region, /claimedMinorUnitsByStage\(lines\)/);
  assert.match(region, /cost \+ percentageOf\(cost, project\.costPlusPercent\)/);
  assert.match(region, /prior \+ claimed > limit/);
});

test('B17.5 applies Cost + Percentage validation only at server-side finalization and preserves Fixed Price manual claim lines', () => {
  const finalize = methodRegion(service, 'finalizeClaimOnce', 'createInvoice');
  assert.match(finalize, /billingMethod === 'COST_PLUS_PERCENTAGE'/);
  assert.match(finalize, /requireCostPlusBasis\(repository, project, current\.periodEnd, current\.lines, visibility\)/);
  assert.match(finalize, /current\.lines\.reduce/);
  assert.doesNotMatch(finalize, /stageProgress|physicalProgress|progressPercent/);
});

test('B17.5 retains source-supported retention and does not invent deductions or advance-recovery formulas', () => {
  const finalize = methodRegion(service, 'finalizeClaimOnce', 'createInvoice');
  assert.match(finalize, /percentageOf\(gross, settings\?\.retentionPercent \?\? null\)/);
  assert.match(finalize, /const deductions = 0n/);
  assert.doesNotMatch(finalize, /advanceRecoveryEnabled|advanceRecoveryAmount|deductionPercent/);
  assert.doesNotMatch(service, /advanceRecoveryAmount|deductionPercent/);
});

test('B17.5 repository bounds Cost + Percentage actual-cost reads by the claim period end when supplied', () => {
  const project = methodRegion(repository, 'sumProjectCostActuals', 'sumStageCostActuals');
  const stage = methodRegion(repository, 'sumStageCostActuals', 'sumFinalizedClaimGross');
  assert.match(project, /throughDate\?: Date/);
  assert.match(project, /postingDate: \{ lte: throughDate \}/);
  assert.match(stage, /throughDate\?: Date/);
  assert.match(stage, /postingDate: \{ lte: throughDate \}/);
});

test('B17.5 repository exposes only aggregate finalized-claim reads needed to prevent repeated Cost + Percentage certification', () => {
  const project = methodRegion(repository, 'sumFinalizedClaimGross', 'sumFinalizedClaimLinesByStage');
  const stage = methodRegion(repository, 'sumFinalizedClaimLinesByStage', 'findGlAccountById');
  assert.match(project, /progressClaim\.aggregate/);
  assert.match(project, /status: 'FINALIZED'/);
  assert.match(project, /_sum: \{ grossValue: true \}/);
  assert.match(stage, /progressClaimLine\.groupBy/);
  assert.match(stage, /claim: \{ is: \{ companyId: scope\.companyId, projectId, status: 'FINALIZED' \} \}/);
  assert.match(stage, /_sum: \{ amount: true \}/);
  assert.doesNotMatch(project + stage, /create\(|update\(|delete/);
});
