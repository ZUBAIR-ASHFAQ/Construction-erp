import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/subcontracts/subcontracts.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/subcontracts/subcontracts.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/subcontracts/subcontracts.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/subcontracts/subcontracts.routes.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260827000200_module_11_readback_revision_retention_repair/migration.sql', 'utf8');
const browserApi = await readFile('apps/web/src/features/subcontracts/api/subcontracts-api.ts', 'utf8');
const browserHooks = await readFile('apps/web/src/features/subcontracts/hooks/subcontracts.ts', 'utf8');
const browserWorkspace = await readFile('apps/web/src/features/subcontracts/components/subcontracts-workspace.tsx', 'utf8');
const repairContract = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const passDoc = await readFile('docs/PASS-370-MODULE-11-READBACK-REVISION-RETENTION.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));
const migrationGates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

/** Collect named top-level functions and class methods that lack an immediately preceding purpose comment. */
function missingPurposeComments(source, className) {
  const lines = source.split(/\r?\n/);
  let braceDepth = 0;
  let classBodyDepth = null;
  const missing = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (new RegExp(`^\\s*export\\s+class\\s+${className}`).test(line) && line.includes('{')) classBodyDepth = braceDepth + 1;
    const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[<(]/);
    const methodMatch = classBodyDepth !== null && braceDepth === classBodyDepth
      ? line.match(/^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\(/)
      : null;
    const name = functionMatch?.[1] ?? methodMatch?.[1];
    if (name) {
      let previous = index - 1;
      while (previous >= 0 && lines[previous].trim() === '') previous -= 1;
      if (previous < 0 || !(lines[previous].trim().startsWith('//') || lines[previous].trim().endsWith('*/'))) missing.push(`${index + 1}:${name}`);
    }
    braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (classBodyDepth !== null && braceDepth < classBodyDepth) classBodyDepth = null;
  }
  return missing;
}

test('Pass 370 freezes all three Module-11 local repair items as implemented', () => {
  for (const id of ['M11-01', 'M11-02', 'M11-03']) assert.match(repairContract, new RegExp(`${id}[\\s\\S]{0,900}IMPLEMENTED_PASS_370`));
  assert.match(repairContract, /M11-04[\s\S]{0,400}DEFER_STAGE_26/);
});

test('Pass 370 keeps the historical eight routes separate from exactly six repair routes', () => {
  const historical = schema.match(/export const MODULE_11_HTTP_ROUTES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  const repair = schema.match(/export const MODULE_11_PASS_370_HTTP_ROUTES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.equal((historical.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
  assert.equal((repair.match(/Object\.freeze\(\{ method:/g) ?? []).length, 6);
});

test('Pass 370 exposes bounded detail, application, revision and retention reads', () => {
  for (const path of [
    '/api/v1/subcontracts/:id',
    '/api/v1/subcontracts/:id/payment-applications',
    '/api/v1/subcontracts/:id/revisions',
    '/api/v1/subcontracts/:id/retention'
  ]) assert.ok(routes.includes(path), `Missing repair read ${path}`);
  assert.match(schema, /listSubcontractHistoryQuerySchema/);
  assert.match(schema, /MODULE_11_MAX_PAGE_SIZE/);
});

test('Pass 370 adds only approved revision and bodyless retention-release writes', () => {
  assert.match(routes, /app\.post\('\/api\/v1\/subcontracts\/:id\/revisions'/);
  assert.match(routes, /app\.post\('\/api\/v1\/subcontracts\/:id\/retention\/release'/);
  assert.match(schema, /releaseSubcontractRetentionBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.doesNotMatch(schema, /releaseAmount|retentionReleaseAmount/);
});

test('Pass 370 adds only two narrow immutable evidence models', () => {
  assert.match(prisma, /model SubcontractRevision \{/);
  assert.match(prisma, /model SubcontractRetentionRelease \{/);
  assert.match(migration, /CREATE TABLE "subcontract_revisions"/);
  assert.match(migration, /CREATE TABLE "subcontract_retention_releases"/);
  assert.match(migration, /subcontract_revisions_immutable/);
  assert.match(migration, /subcontract_retention_releases_immutable/);
});

test('Pass 370 protects same-Company revision and retention actors at the database boundary', () => {
  assert.match(migration, /module_11_validate_revision_actor_scope/);
  assert.match(migration, /module_11_validate_retention_release_actor_scope/);
  assert.match(migration, /REFERENCES "users"\("id"\)/);
});

test('Pass 370 revision service preserves line identity and approved commercial history', () => {
  assert.match(service, /must provide every existing scope line exactly once/i);
  assert.match(service, /Only an EXECUTED subcontract can receive an approved revision/);
  assert.match(service, /CERTIFIED_VALUE_EXCEEDS_CONTRACT/);
  assert.match(service, /createSubcontractRevision/);
  assert.match(service, /beforeSnapshotJson/);
  assert.match(service, /afterSnapshotJson/);
  assert.match(service, /eventType: 'subcontract\.revised'/);
});

test('Pass 370 revision refreshes existing Module-7 commitment sources rather than creating another cost subsystem', () => {
  assert.match(service, /writeActiveCommitments\(repository, updated\)/);
  assert.doesNotMatch(service, /costActual\.(?:create|update|upsert)|apInvoice\.(?:create|update|upsert)/);
});

test('Pass 370 retention release is server-calculated, append-only and allows close only after release', () => {
  assert.match(service, /retainedTotal - releasedBefore/);
  assert.match(service, /subcontracts\.certify/);
  assert.match(service, /subcontracts\.close/);
  assert.match(service, /createSubcontractRetentionRelease/);
  assert.match(service, /retentionTotal - releasedRetention !== 0n/);
  assert.doesNotMatch(service, /eventType: 'subcontract\.retention_released'/);
});

test('Pass 370 adds repository functions for durable history without Finance or Change-Order writes', () => {
  for (const name of [
    'listPaymentApplicationsPageBySubcontract', 'listSubcontractRevisions', 'nextSubcontractRevisionNo',
    'updateExecutedSubcontractRevision', 'createSubcontractRevision', 'listSubcontractRetentionReleases',
    'sumSubcontractRetentionReleased', 'createSubcontractRetentionRelease'
  ]) assert.match(repository, new RegExp(`async ${name}\\b`));
  assert.doesNotMatch(repository, /apInvoice\.(?:create|update|upsert)|changeOrder\.(?:create|update|upsert)/);
});

test('Pass 370 keeps exactly the existing seven permissions and five stable errors', () => {
  const permissions = schema.match(/export const MODULE_11_PERMISSION_CODES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  const errors = schema.match(/export const MODULE_11_ERROR_CODES =[\s\S]*?\] as const\);/)?.[0] ?? '';
  assert.equal((permissions.match(/'[^']+'/g) ?? []).length, 7);
  assert.equal((errors.match(/'[^']+'/g) ?? []).length, 5);
  assert.doesNotMatch(permissions, /revision|retention/);
});

test('Pass 370 browser API and hooks expose all durable repair operations', () => {
  for (const name of [
    'getSubcontract', 'listSubcontractPaymentApplications', 'listSubcontractRevisions', 'getSubcontractRetention',
    'createSubcontractRevision', 'releaseSubcontractRetention'
  ]) assert.match(browserApi, new RegExp(`function ${name}\\b`));
  for (const name of [
    'useSubcontract', 'useSubcontractPaymentApplications', 'useSubcontractRevisions', 'useSubcontractRetention',
    'useCreateSubcontractRevision', 'useReleaseSubcontractRetention'
  ]) assert.match(browserHooks, new RegExp(`function ${name}\\b`));
});

test('Pass 370 UI displays durable history and preserves server ownership of release amount', () => {
  assert.match(browserWorkspace, /Durable application & certification history/);
  assert.match(browserWorkspace, /Approved Subcontract revisions/);
  assert.match(browserWorkspace, /Retention ledger/);
  assert.match(browserWorkspace, /Release outstanding retention/);
  assert.doesNotMatch(browserWorkspace, /Release amount/);
});

test('Pass 370 keeps named Module-11 backend and React functions purpose-commented', () => {
  assert.deepEqual(missingPurposeComments(repository, 'SubcontractsRepository'), []);
  assert.deepEqual(missingPurposeComments(service, 'SubcontractsService'), []);
  assert.deepEqual(missingPurposeComments(routes, 'NeverMatches'), []);
  assert.deepEqual(missingPurposeComments(browserApi, 'NeverMatches'), []);
  assert.deepEqual(missingPurposeComments(browserHooks, 'NeverMatches'), []);
  assert.deepEqual(missingPurposeComments(browserWorkspace, 'NeverMatches'), []);
});

test('Pass 370 registers one migration gate and keeps deferred Stage-26/27 boundaries explicit', () => {
  const gate = migrationGates.gates.find((entry) => entry.gate === 'post-stage-23-module-11-readback-revision-retention-repair');
  assert.deepEqual(gate?.migrations, ['20260827000200_module_11_readback_revision_retention_repair']);
  assert.match(passDoc, /Stage 26/);
  assert.match(passDoc, /Stage 27/);
  assert.equal(rootPackage.scripts['pass-370:module-11-readback-revision-retention:gate'], 'node --test tests/pass-370-module-11-readback-revision-retention.test.mjs tests/module-11-static.test.mjs');
});
