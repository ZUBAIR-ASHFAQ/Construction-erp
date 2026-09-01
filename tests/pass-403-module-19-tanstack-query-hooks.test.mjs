import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const hooks = await readFile('apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts', 'utf8');
const doc = await readFile('docs/PASS-403-MODULE-19-TANSTACK-QUERY-HOOKS.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-403-module-19-tanstack-query-hooks.test.mjs', 'utf8');

const unchangedProductionFiles = Object.freeze({
  'apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts': '7759fe6c585315ef4f77a1bc62b9f0082b0bb378a9d1e437ca748e6bc1352c91',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b416e8fb63f462a18d63818f712d25b28e2a971ac84bcb4cfc76f96c433b61da',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'c9117d730a79fbe0c5f2077fd236e39c2db741b5bc648c934e8594e33dd4e71f',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '555e62cc397ab16ea36980fdcc55ce200a2bd7368b67c36b6393b16d94c88e28',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07'
});

/** Assert one required Pass-403 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-403 token: ${token}`);
}

/** Return one source slice between two stable implementation tokens. */
function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing source start token: ${startToken}`);
  assert.ok(end > start, `Missing source end token: ${endToken}`);
  return source.slice(start, end);
}

/** Calculate one regression hash for production that Pass 403 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 403 adds the four reviewed read hooks and seven command hooks only', async () => {
  await access('apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts');
  for (const name of ['useRfis', 'useRfiDetails', 'useSubmittals', 'useSubmittalDetails']) {
    includes(hooks, `export function ${name}(`);
  }
  for (const name of [
    'useCreateRfi', 'useRespondRfi', 'useCloseRfi', 'useReopenRfi',
    'useCreateSubmittal', 'useSubmitSubmittal', 'useReviewSubmittal'
  ]) includes(hooks, `export function ${name}(`);

  assert.equal((hooks.match(/return useQuery\(/g) ?? []).length, 4);
  assert.equal((hooks.match(/return useMutation\(/g) ?? []).length, 7);
  assert.match(doc, /four read hooks and seven command hooks/);
});

test('Pass 403 uses stable resource-specific query keys and guarded reads', () => {
  includes(hooks, "const MODULE_19_QUERY_KEY = ['module-19', 'rfi-submittals'] as const;");
  includes(hooks, "[...MODULE_19_QUERY_KEY, 'rfis', projectId, input]");
  includes(hooks, "[...MODULE_19_QUERY_KEY, 'rfi', rfiId]");
  includes(hooks, "[...MODULE_19_QUERY_KEY, 'submittals', projectId, input]");
  includes(hooks, "[...MODULE_19_QUERY_KEY, 'submittal', submittalId]");
  assert.equal((hooks.match(/retry: false/g) ?? []).length, 4);
  assert.equal((hooks.match(/enabled: enabled && projectId\.length > 0/g) ?? []).length, 2);
  includes(hooks, 'enabled: enabled && rfiId !== null');
  includes(hooks, 'enabled: enabled && submittalId !== null');
});

test('Pass 403 creates one fresh Foundation idempotency key for every write execution', () => {
  includes(hooks, 'return crypto.randomUUID();');
  assert.equal((hooks.match(/newIdempotencyKey\(\)/g) ?? []).length, 8, 'Expected one helper declaration plus seven command calls.');
  const reads = sourceSlice(hooks, '/** Load one bounded Project RFI register page', '/** Create one RFI and refresh only');
  assert.ok(!reads.includes('newIdempotencyKey()'), 'Read hooks must never create idempotency keys.');
});

test('Pass 403 invalidates only the affected RFI caches', () => {
  const create = sourceSlice(hooks, 'export function useCreateRfi()', '/** Append one RFI response');
  includes(create, 'invalidateRfiRegister(queryClient, data.projectId)');
  assert.ok(!create.includes('invalidateRfiDetail'));

  const respond = sourceSlice(hooks, 'export function useRespondRfi()', '/** Close one RFI');
  includes(respond, 'invalidateRfiDetail(queryClient, variables.rfiId)');
  assert.ok(!respond.includes('invalidateRfiRegister'));

  const close = sourceSlice(hooks, 'export function useCloseRfi()', '/** Reopen one RFI');
  includes(close, 'invalidateRfiDetail(queryClient, data.id)');
  includes(close, 'invalidateRfiRegister(queryClient, data.projectId)');

  const reopen = sourceSlice(hooks, 'export function useReopenRfi()', '/** Create one Submittal');
  includes(reopen, 'invalidateRfiDetail(queryClient, data.id)');
  includes(reopen, 'invalidateRfiRegister(queryClient, data.projectId)');
});

test('Pass 403 invalidates only the affected Submittal caches', () => {
  const create = sourceSlice(hooks, 'export function useCreateSubmittal()', '/** Submit one Submittal revision');
  includes(create, 'invalidateSubmittalRegister(queryClient, data.projectId)');
  assert.ok(!create.includes('invalidateSubmittalDetail'));

  const submit = sourceSlice(hooks, 'export function useSubmitSubmittal()', '/** Record one Submittal review');
  includes(submit, 'invalidateSubmittalDetail(queryClient, variables.submittalId)');
  includes(submit, 'invalidateSubmittalRegister(queryClient, data.projectId)');

  const reviewStart = hooks.indexOf('export function useReviewSubmittal()');
  assert.ok(reviewStart >= 0);
  const review = hooks.slice(reviewStart);
  includes(review, 'invalidateSubmittalDetail(queryClient, variables.submittalId)');
  includes(review, 'invalidateSubmittalRegister(queryClient, data.projectId)');
});

test('Pass 403 avoids broad whole-module cache invalidation shortcuts', () => {
  assert.doesNotMatch(hooks, /invalidateQueries\(\{ queryKey: MODULE_19_QUERY_KEY \}\)/);
  assert.equal((hooks.match(/queryClient\.invalidateQueries/g) ?? []).length, 4, 'Only four focused invalidation helpers should call QueryClient directly.');
});

test.skip('Pass 403 preserves the typed API client and complete Module-19 backend/database contract', async () => {
  for (const [file, expected] of Object.entries(unchangedProductionFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed during the hooks-only pass.`);
  }
});

test.skip('Pass 403 generates no UI, routing or Module-20 production code', async () => {
  await assert.rejects(access('apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx'));
  await assert.rejects(access('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx'));
  assert.match(doc, /no component/);
  assert.match(doc, /no page/);
  assert.match(doc, /no router\/navigation registration/);
  assert.match(doc, /no Module-20 production code/);
});

test('Pass 403 purpose-comments every named function and registers the cumulative gate', () => {
  for (const name of [
    'newIdempotencyKey', 'invalidateRfiRegister', 'invalidateRfiDetail',
    'invalidateSubmittalRegister', 'invalidateSubmittalDetail'
  ]) assert.match(hooks, new RegExp(`/\\*\\*[^]*?\\*/\\s*(?:async )?function ${name}\\(`));

  for (const name of [
    'useRfis', 'useRfiDetails', 'useSubmittals', 'useSubmittalDetails',
    'useCreateRfi', 'useRespondRfi', 'useCloseRfi', 'useReopenRfi',
    'useCreateSubmittal', 'useSubmitSubmittal', 'useReviewSubmittal'
  ]) assert.match(hooks, new RegExp(`/\\*\\*[^]*?\\*/\\s*export function ${name}\\(`));

  for (const name of ['includes', 'sourceSlice']) {
    assert.match(self, new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`));
  }
  assert.match(self, /\/\*\*[^]*?\*\/\s*async function fileHash\(/);

  assert.equal(
    packageJson.scripts['pass-403:module-19-tanstack-query-hooks:gate'],
    'node --test tests/pass-403-module-19-tanstack-query-hooks.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
  includes(doc, 'Pass 404 — Module 19 Accessible Permission-Aware React UI');
});
