import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const packageJson = JSON.parse(await readFile('packages/contracts/package.json', 'utf8'));
const indexSource = await readFile('packages/contracts/src/index.ts', 'utf8');
const primitivesSource = await readFile('packages/contracts/src/primitives.ts', 'utf8');
const sourceKeySource = await readFile('packages/contracts/src/source-key.ts', 'utf8');
const resourceSource = await readFile('packages/contracts/src/resource-reference.ts', 'utf8');
const documentSource = await readFile('packages/contracts/src/document-reference.ts', 'utf8');
const eventSource = await readFile('packages/contracts/src/integration-event.ts', 'utf8');
const financeSource = await readFile('packages/contracts/src/financial-posting.ts', 'utf8');
const outboxTypes = await readFile('packages/outbox/src/types.ts', 'utf8');
const outboxPackage = JSON.parse(await readFile('packages/outbox/package.json', 'utf8'));
const schema = await readFile('packages/database/prisma/schema.prisma', 'utf8');


test('Pass 16 activates the Foundation contracts package', () => {
  assert.equal(packageJson.name, '@construction-erp/contracts');
  assert.equal(packageJson.version, '0.16.0');
  for (const symbol of [
    'createStableSourceKey',
    'serializeStableSourceKey',
    'createResourceReference',
    'createDocumentReference',
    'createDocumentVersionReference',
    'INTEGRATION_EVENT_ENVELOPE_VERSION',
    'createFinancialPostingCommand'
  ]) assert.match(indexSource, new RegExp(symbol));
});

test('stable source keys use module/type/record/optional-line identity and deterministic serialization', () => {
  assert.match(sourceKeySource, /sourceModule/);
  assert.match(sourceKeySource, /sourceType/);
  assert.match(sourceKeySource, /sourceId/);
  assert.match(sourceKeySource, /sourceLineId/);
  assert.match(sourceKeySource, /serializeStableSourceKey/);
  assert.match(sourceKeySource, /value\.length/);
});

test('cross-cutting resource reference keeps generic resource type and id semantics', () => {
  assert.match(resourceSource, /resourceType:\s*string/);
  assert.match(resourceSource, /resourceId:\s*string/);
  assert.match(resourceSource, /createResourceReference/);
  assert.doesNotMatch(resourceSource, /ApprovalResourceReference|createApprovalResourceReference/);
});

test('document references distinguish document-level and immutable version-level references', () => {
  assert.match(documentSource, /kind:\s*'document'/);
  assert.match(documentSource, /kind:\s*'document-version'/);
  assert.match(documentSource, /documentId/);
  assert.match(documentSource, /versionId/);
});

test('canonical integration event envelope carries company, actor, scope, resource and correlation metadata', () => {
  for (const pattern of [
    /schemaVersion/,
    /eventId/,
    /eventType/,
    /companyId/,
    /actorUserId/,
    /projectScope/,
    /resource:/,
    /requestId/,
    /correlationId/,
    /occurredAt/,
    /payload/
  ]) assert.match(eventSource, pattern);
});

test('outbox aliases the canonical integration envelope instead of defining a competing wire contract', () => {
  assert.equal(outboxPackage.dependencies['@construction-erp/contracts'], 'workspace:*');
  assert.match(outboxTypes, /IntegrationEventEnvelope/);
  assert.match(outboxTypes, /INTEGRATION_EVENT_ENVELOPE_VERSION/);
  assert.match(outboxTypes, /export type OutboxEnvelope = IntegrationEventEnvelope/);
});

test('financial posting command preserves money as decimal strings and defers posting-engine rules', () => {
  assert.match(financeSource, /debit:\s*string/);
  assert.match(financeSource, /credit:\s*string/);
  assert.match(financeSource, /normalizeDecimalString/);
  assert.match(financeSource, /sourceKey/);
  assert.match(financeSource, /accountId:\s*string/);
  assert.match(financeSource, /postingDate/);
  assert.match(financeSource, /currency/);
  assert.match(financeSource, /Finance Core later owns account/);
  assert.doesNotMatch(financeSource, /Number\(input\.debit/);
  assert.doesNotMatch(financeSource, /parseFloat/);
});

test('contract primitives reject unstable identifiers and binary-floating financial transport', () => {
  assert.match(primitivesSource, /STABLE_TOKEN/);
  assert.match(primitivesSource, /ISO_CURRENCY/);
  assert.match(primitivesSource, /DECIMAL/);
  assert.match(primitivesSource, /decimal strings/);
});

test('Pass 16 adds no dedicated integration-contract database tables', () => {
  assert.doesNotMatch(schema, /model\s+IntegrationContract/);
  assert.doesNotMatch(schema, /model\s+FinancialPostingCommand/);
  assert.doesNotMatch(schema, /model\s+DocumentReference/);
});
