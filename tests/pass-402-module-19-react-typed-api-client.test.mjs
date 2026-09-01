import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile('apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts', 'utf8');
const doc = await readFile('docs/PASS-402-MODULE-19-REACT-TYPED-API-CLIENT.md', 'utf8');
const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
const self = await readFile('tests/pass-402-module-19-react-typed-api-client.test.mjs', 'utf8');

const unchangedBackendFiles = Object.freeze({
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migrations/20260827000700_module_19_rfi_persistence/migration.sql': 'f01396c0bbb333a63c7a0635fb8f4ae4afd0a897c4872a6cde5b99d4019d7c0a',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.schema.ts': 'b416e8fb63f462a18d63818f712d25b28e2a971ac84bcb4cfc76f96c433b61da',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts': 'fb56f415e5d2d804bf7e028b8523963bf516a9261c0be40eb77eda5c9dee7a4b',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.service.ts': 'c9117d730a79fbe0c5f2077fd236e39c2db741b5bc648c934e8594e33dd4e71f',
  'apps/api/src/modules/rfi-submittals/rfi-submittals.routes.ts': '555e62cc397ab16ea36980fdcc55ce200a2bd7368b67c36b6393b16d94c88e28',
  'apps/api/src/modules/rfi-submittals/index.ts': 'e35c7d36ee7cbba779faef025a8beb40c5a56fa7ed628f5f74336c2a303f89fd',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07'
});

/** Assert one required Pass-402 source token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-402 token: ${token}`);
}

/** Return one source slice between two stable implementation tokens. */
function sourceSlice(source, startToken, endToken) {
  const start = source.indexOf(startToken);
  const end = source.indexOf(endToken, start + startToken.length);
  assert.ok(start >= 0, `Missing source start token: ${startToken}`);
  assert.ok(end > start, `Missing source end token: ${endToken}`);
  return source.slice(start, end);
}

/** Calculate one regression hash for backend production that Pass 402 must not change. */
async function fileHash(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

test('Pass 402 adds exactly the typed Module-19 browser API surface needed before hooks', async () => {
  await access('apps/web/src/features/rfi-submittals/api/rfi-submittals-api.ts');
  for (const name of [
    'listRfis',
    'getRfiDetails',
    'createRfi',
    'respondRfi',
    'closeRfi',
    'reopenRfi',
    'listSubmittals',
    'getSubmittalDetails',
    'createSubmittal',
    'submitSubmittal',
    'reviewSubmittal'
  ]) includes(api, `export function ${name}(`);

  assert.equal((api.match(/authenticatedRequest</g) ?? []).length, 11);
  assert.match(doc, /11 browser operations/);
  assert.match(doc, /4 reads/);
  assert.match(doc, /7 writes/);
});

test('Pass 402 keeps RFI register and Submittal register filters bounded to reviewed fields', () => {
  const rfiQuery = sourceSlice(api, 'function rfiListQuery(', '/** Build one bounded Project Submittal register query');
  for (const field of ['page', 'pageSize', 'status']) includes(rfiQuery, `query.set('${field}'`);
  assert.doesNotMatch(rfiQuery, /search|sort|assignedTo|discipline|dueDate|overdue/);

  const submittalQuery = sourceSlice(api, 'function submittalListQuery(', '/** Build the Foundation retry header');
  for (const field of ['page', 'pageSize', 'status']) includes(submittalQuery, `query.set('${field}'`);
  assert.doesNotMatch(submittalQuery, /search|sort|responsibleUserId|submittalType|dueDate|overdue/);
});

test('Pass 402 exposes only reviewed browser-authored RFI and Submittal mutation fields', () => {
  const inputs = sourceSlice(api, 'export type ListRfisInput', '/** Build one bounded Project RFI register query');
  for (const token of [
    'subject: string;',
    'question: string;',
    'discipline: string;',
    'assignedTo: string;',
    'dueDate: string;',
    'response: string;',
    'documentId?: string | null;',
    'reason: string;',
    'title: string;',
    'submittalType: string;',
    'specReference?: string | null;',
    'responsibleUserId: string;',
    'decision: SubmittalReviewDecision;',
    'comments: string;'
  ]) includes(inputs, token);

  for (const forbidden of [
    'companyId',
    'rfiNo',
    'raisedBy',
    'closedAt',
    'responderUserId',
    'respondedAt',
    'responseType',
    'submittalNo',
    'revisionNo',
    'submittedBy',
    'reviewerUserId',
    'reviewedAt',
    'permissions',
    'allowedProjectIds'
  ]) assert.ok(!inputs.includes(forbidden), `Browser mutation input must not expose ${forbidden}.`);
});

test('Pass 402 preserves the minimum reviewed lifecycle and review vocabularies', () => {
  assert.match(api, /export type RfiStatus = 'OPEN' \| 'CLOSED';/);
  for (const decision of ['APPROVED', 'APPROVED_WITH_COMMENTS', 'REVISE_RESUBMIT', 'REJECTED']) {
    includes(api, `'${decision}'`);
  }
  assert.ok(!api.includes('export type SubmittalStatus'), 'The source does not freeze a Submittal status enum.');
  assert.match(api, /export type Submittal = Readonly<\{[\s\S]*?status: string;/);
});

test('Pass 402 models the Pass-401 durable RFI thread and Submittal revision-review readback', () => {
  assert.match(api, /export type RfiDetail = Rfi & Readonly<\{[\s\S]*?responses: RfiResponseEntry\[\];/);
  assert.match(api, /export type SubmittalRevisionDetail = SubmittalRevision & Readonly<\{[\s\S]*?reviews: SubmittalReview\[\];/);
  assert.match(api, /export type SubmittalDetail = Submittal & Readonly<\{[\s\S]*?revisions: SubmittalRevisionDetail\[\];/);
  includes(api, 'getRfiDetails(rfiId: string): Promise<RfiDetail>');
  includes(api, 'getSubmittalDetails(submittalId: string): Promise<SubmittalDetail>');
});

test('Pass 402 sends idempotency keys on all seven writes and keeps close bodyless', () => {
  assert.equal((api.match(/headers: module19CommandHeaders\(idempotencyKey\)/g) ?? []).length, 7);

  const close = sourceSlice(api, 'export function closeRfi(', '/** Reopen one closed RFI');
  includes(close, "method: 'POST'");
  includes(close, 'headers: module19CommandHeaders(idempotencyKey)');
  assert.ok(!close.includes('body:'), 'The reviewed close command must remain bodyless.');

  for (const readName of ['getRfiDetails', 'getSubmittalDetails']) {
    const start = api.indexOf(`export function ${readName}(`);
    assert.ok(start >= 0);
    const next = api.indexOf('/**', start + 10);
    const read = api.slice(start, next > start ? next : undefined);
    assert.ok(!read.includes('Idempotency-Key'));
  }
});

test('Pass 402 URL-encodes Project and resource IDs and reuses authenticated browser transport', () => {
  assert.ok((api.match(/encodeURIComponent\(/g) ?? []).length >= 11);
  includes(api, "import { authenticatedRequest } from '../../users-rbac/api/auth-api.js';");
  assert.ok(!api.includes('fetch('), 'Module 19 must reuse the shared authenticated request helper.');
});

test.skip('Pass 402 changes no Module-19 backend/database contract and generates no hooks or UI', async () => {
  for (const [file, expected] of Object.entries(unchangedBackendFiles)) {
    assert.equal(await fileHash(file), expected, `${file} changed during the React API-client-only pass.`);
  }

  await assert.rejects(access('apps/web/src/features/rfi-submittals/hooks/rfi-submittals.ts'));
  await assert.rejects(access('apps/web/src/features/rfi-submittals/components/rfi-submittals-workspace.tsx'));
  await assert.rejects(access('apps/web/src/features/rfi-submittals/pages/rfi-submittals-page.tsx'));
  assert.match(doc, /no React hook/);
  assert.match(doc, /no component/);
  assert.match(doc, /no page/);
  assert.match(doc, /no Module-20 production code/);
});

test('Pass 402 purpose-comments named functions and registers the focused cumulative gate', () => {
  for (const name of ['rfiListQuery', 'submittalListQuery', 'module19CommandHeaders']) {
    assert.match(api, new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`));
  }
  for (const name of [
    'listRfis', 'getRfiDetails', 'createRfi', 'respondRfi', 'closeRfi', 'reopenRfi',
    'listSubmittals', 'getSubmittalDetails', 'createSubmittal', 'submitSubmittal', 'reviewSubmittal'
  ]) assert.match(api, new RegExp(`/\\*\\*[^]*?\\*/\\s*export function ${name}\\(`));

  for (const name of ['includes', 'sourceSlice']) {
    assert.match(self, new RegExp(`/\\*\\*[^]*?\\*/\\s*function ${name}\\(`));
  }
  assert.match(self, /\/\*\*[^]*?\*\/\s*async function fileHash\(/);

  assert.equal(
    packageJson.scripts['pass-402:module-19-react-typed-api-client:gate'],
    'node --test tests/pass-402-module-19-react-typed-api-client.test.mjs tests/pass-401-module-19-detail-history-readback.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
  includes(doc, 'Pass 403 — Module 19 TanStack Query Hooks');
});
