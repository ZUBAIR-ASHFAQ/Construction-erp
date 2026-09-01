import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

const [
  repairContract,
  passDoc,
  module4aContract,
  module4bContract,
  prisma,
  schema,
  repository,
  service,
  routes,
  moduleIndex,
  webApi,
  webHooks,
  webPanel,
  integration,
  e2e
] = await Promise.all([
  read('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md'),
  read('docs/PASS-367-MODULE-4-BOQ-DURABLE-REVISION-READBACK.md'),
  read('docs/modules/boq/STAGE-6-MODULE-4A-CONTRACT.md'),
  read('docs/modules/boq/STAGE-10-MODULE-4B-CONTRACT.md'),
  read('packages/database/prisma/schema.prisma'),
  read('apps/api/src/modules/boq/boq.schema.ts'),
  read('apps/api/src/modules/boq/boq.repository.ts'),
  read('apps/api/src/modules/boq/boq.service.ts'),
  read('apps/api/src/modules/boq/boq.routes.ts'),
  read('apps/api/src/modules/boq/index.ts'),
  read('apps/web/src/features/boq/api/boq-api.ts'),
  read('apps/web/src/features/boq/hooks/boq.ts'),
  read('apps/web/src/features/boq/components/boq-revision-panel.tsx'),
  read('tests/integration/module-4a-api.integration.test.mjs'),
  read('tests/e2e/module-4a-browser.spec.mjs')
]);

// Close the exact frozen M4A-01 gap without widening BOQ write authority.
test('Pass 367 closes M4A-01 as a narrow durable readback repair', () => {
  assert.match(repairContract, /M4A-01 — Durable revision\/detail readback/);
  assert.match(repairContract, /Decision: `IMPLEMENTED_PASS_367`/);
  assert.match(passDoc, /GET `?\/api\/v1\/boqs\/:id`?/);
  assert.match(passDoc, /GET `?\/api\/v1\/boqs\/:id\/revisions\/:revId`?/);
  for (const contract of [module4aContract, module4bContract]) {
    assert.match(contract, /Pass 367 amendment — durable revision readback/);
  }
});

// Preserve the six source operations and add exactly the two approved read-only repair operations.
test('Pass 367 preserves six source BOQ operations and adds exactly two GET repairs', () => {
  const sourceSection = schema.slice(
    schema.indexOf('export const MODULE_4A_HTTP_ROUTES'),
    schema.indexOf('/** Pass 367 adds only')
  );
  const repairSection = schema.slice(
    schema.indexOf('export const MODULE_4_PASS_367_HTTP_ROUTES'),
    schema.indexOf('/** Reviewed Module 4A permissions')
  );
  assert.equal((sourceSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 6);
  assert.equal((repairSection.match(/Object\.freeze\(\{ method:/g) ?? []).length, 2);
  assert.equal((repairSection.match(/method: 'GET'/g) ?? []).length, 2);
  assert.match(repairSection, /\/api\/v1\/boqs\/:id/);
  assert.match(repairSection, /\/api\/v1\/boqs\/:id\/revisions\/:revId/);
  assert.doesNotMatch(routes, /app\.(?:post|put|patch|delete)\('\/api\/v1\/boqs\/:id\/items/);
});

// Reuse existing persistence and repository reads instead of adding a history subsystem.
test('Pass 367 needs no database resource, migration or repository function', () => {
  assert.doesNotMatch(prisma, /Pass367|pass_367|boq_revision_history/i);
  for (const method of ['findBoqById', 'listBoqRevisions', 'findBoqRevisionById', 'listBoqRevisionItems', 'sumBoqRevisionAmount']) {
    assert.ok(repository.includes(method), method);
    assert.ok(service.includes(method), method);
  }
  assert.doesNotMatch(repository, /getBoqDetails|getRevisionDetails/);
  assert.match(passDoc, /no Prisma model or database table/);
  assert.match(passDoc, /no migration/);
  assert.match(passDoc, /no repository function/);
});

// Read services must reapply the same Company/Project resource policy using boq.read.
test('Pass 367 service authorizes both readback methods with boq.read', () => {
  const detail = service.slice(service.indexOf('async getBoqDetails'), service.indexOf('/** Load one authorized historical'));
  const revision = service.slice(service.indexOf('async getRevisionDetails'), service.indexOf('/** Create one tender-linked'));
  for (const section of [detail, revision]) {
    assert.match(section, /findBoqById/);
    assert.match(section, /requireBoqPermission/);
    assert.match(section, /'boq\.read'/);
    assert.doesNotMatch(section, /recordAuditLog|recordOutboxEvent/);
  }
  assert.match(revision, /findBoqRevisionById/);
  assert.match(revision, /listBoqRevisionItems/);
  assert.match(revision, /sumBoqRevisionAmount/);
});

// Keep the new HTTP surface authenticated, schema-validated and read-only.
test('Pass 367 Fastify readback routes are authenticated and OpenAPI documented', () => {
  for (const operationId of ['module4Pass367GetBoqDetails', 'module4Pass367GetBoqRevisionDetails']) {
    assert.ok(routes.includes(`operationId: '${operationId}'`), operationId);
  }
  assert.match(routes, /app\.get\('\/api\/v1\/boqs\/:id'/);
  assert.match(routes, /app\.get\('\/api\/v1\/boqs\/:id\/revisions\/:revId'/);
  assert.match(routes, /boqDetailsResponseSchema/);
  assert.match(routes, /boqRevisionDetailsResponseSchema/);
  assert.match(routes, /BOQ_NOT_FOUND_RESPONSE/);
  assert.match(moduleIndex, /MODULE_4_PASS_367_HTTP_ROUTES/);
  assert.match(moduleIndex, /boqDetailsResponseSchema/);
});

// Do not invent permission, error or event vocabulary to support reads.
test('Pass 367 adds no permission stable error or domain event', () => {
  const permissions = schema.slice(schema.indexOf('MODULE_4A_PERMISSION_CODES'), schema.indexOf('MODULE_4A_ERROR_CODES'));
  const errors = schema.slice(schema.indexOf('MODULE_4A_ERROR_CODES'), schema.indexOf('MODULE_4A_EVENT_TYPES'));
  const events = schema.slice(schema.indexOf('MODULE_4A_EVENT_TYPES'), schema.indexOf('MODULE_4A_HTTP_ROUTES'));
  assert.doesNotMatch(permissions, /history|detail|revision_read/);
  assert.doesNotMatch(errors, /HISTORY|DETAIL/);
  assert.doesNotMatch(events, /read|viewed|history/);
  assert.match(passDoc, /no permission/);
  assert.match(passDoc, /no stable error/);
  assert.match(passDoc, /no domain event/);
});

// TanStack Query owns BOQ history and individual revision snapshots after reload.
test('Pass 367 React API and hooks load durable BOQ and revision readback', () => {
  assert.match(webApi, /export function getBoqDetails/);
  assert.match(webApi, /export function getBoqRevisionDetails/);
  assert.match(webHooks, /export function useBoqDetails/);
  assert.match(webHooks, /export function useBoqRevisionDetails/);
  assert.match(webHooks, /queryKey: \[\.\.\.BOQS_QUERY_KEY, 'detail', boqId\]/);
  assert.match(webHooks, /queryKey: \[\.\.\.BOQS_QUERY_KEY, 'detail', boqId, 'revision', revisionId\]/);
});

// The existing UI must stop relying on mutation snapshots stored only in browser memory.
test('Pass 367 revision panel restores history and comparison from server queries', () => {
  assert.match(webPanel, /Durable revision history/);
  assert.match(webPanel, /useBoqDetails\(boq\.id\)/);
  assert.match(webPanel, /useBoqRevisionDetails\(boq\.id, activeRevisionId\)/);
  assert.match(webPanel, /Revision comparison/);
  assert.match(webPanel, /loaded from the server instead of browser-session memory/);
  assert.doesNotMatch(webPanel, /Revisions created in this session/);
  assert.doesNotMatch(webPanel, /workspaces|activeWorkspace|savedWorkspaces/);
});

// Prepare live API proof for historical readback, read-only RBAC and Company isolation.
test('Pass 367 integration coverage includes durable readback and negative authorization', () => {
  assert.match(integration, /Module 4 Pass 367 readback reloads durable revision history and enforces read authorization/);
  assert.match(integration, /boq-reader@example\.test/);
  assert.match(integration, /boq-no-permission@example\.test/);
  assert.match(integration, /boq-admin-b@example\.test/);
  assert.match(integration, /details\.revisions\.map\(\(revision\) => revision\.revisionNo\), \[2, 1\]/);
  assert.match(integration, /assertSafePublicError\(denied, 403, 'FORBIDDEN'\)/);
  assert.match(integration, /assertSafePublicError\(hidden, 404, 'BOQ_NOT_FOUND'\)/);
});

// Prepare browser proof that a page reload still exposes both historical revisions and comparison.
test('Pass 367 Playwright workflow proves history survives browser reload', () => {
  assert.match(e2e, /Reload the browser and prove history\/comparison now come back from durable server reads/);
  assert.match(e2e, /await page\.reload\(\)/);
  assert.match(e2e, /Durable revision history/);
  assert.match(e2e, /Revision 1 · FROZEN/);
  assert.match(e2e, /Revision 2 · DRAFT/);
  assert.match(e2e, /reloadedComparison/);
});

// Preserve the exact scope: readback only, no generic BOQ or BOQ-item CRUD expansion.
test('Pass 367 does not add generic item CRUD or unrelated Module 4 authority', () => {
  assert.doesNotMatch(routes, /\/items\/:itemId/);
  assert.doesNotMatch(routes, /app\.delete\('/);
  assert.doesNotMatch(routes, /app\.patch\('/);
  assert.doesNotMatch(webApi, /deleteBoq|patchBoq|deleteBoqItem|updateBoqItem/);
  assert.match(passDoc, /no item CRUD endpoint/);
});
