import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const UNCHANGED_HASHES = Object.freeze({
  'apps/api/src/modules/approvals/approvals.repository.ts': 'f6473e796d9b50d64f0710c046af997937def40d8d4c840b4d967c9b3b52ca8a',
  'apps/api/src/modules/approvals/index.ts': 'f84482361c084f239bb208ff310712331e7a758f7a3229ec7bec4b3e15d13331',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'apps/web/src/features/approvals/pages/approvals-page.tsx': '434ccafaa183c3433e0c9da949ec509b9c774f7ba097ad926fb8a6ad45b69641',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9',
  'packages/database/prisma/migration-gates.json': 'e997821262f820a52fd463c95ebc4570ca811c59e45ba0c64f2e7dcdc7efddfd',
  'packages/database/prisma/migration-checksums.json': '9601424e96fc92aecc627e398a9daf3b9506da945486190783e790007046e1f2'
});

const schema = await readFile('apps/api/src/modules/approvals/approvals.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/approvals/approvals.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/approvals/approvals.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/approvals/approvals.routes.ts', 'utf8');
const browserApi = await readFile('apps/web/src/features/approvals/api/approvals-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/approvals/hooks/approvals.ts', 'utf8');
const admin = await readFile('apps/web/src/features/approvals/components/approval-admin.tsx', 'utf8');
const integrationTest = await readFile('tests/integration/module-22-api.integration.test.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-22-browser.spec.mjs', 'utf8');
const freeze = await readFile('docs/PASS-411-MODULE-22-DELEGATION-READBACK-CONTRACT-FREEZE.md', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

/** Return the SHA-256 digest for one protected file. */
async function sha256(file) {
  return createHash('sha256').update(await readFile(file)).digest('hex');
}

/** Collect JavaScript/TypeScript production files below one root. */
async function collectCodeFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectCodeFiles(target));
    else if (entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name)) files.push(target);
  }
  return files;
}

/** Count one symbol across current production code to prove wiring without blind deletion. */
async function productionReferenceCount(name) {
  const files = [...await collectCodeFiles('apps'), ...await collectCodeFiles('packages')];
  const pattern = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  for (const file of files) count += ((await readFile(file, 'utf8')).match(pattern) ?? []).length;
  return count;
}

/** Assert one exact implementation token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-412 token: ${token}`);
}

test('Pass 412 implements exactly the frozen delegation GET alongside the seven source routes', () => {
  includes(freeze, 'After Pass 412, Module 22 may expose exactly eight public routes');
  assert.equal((routes.match(/app\.(?:get|post|patch)\('/g) ?? []).length, 8);
  assert.equal((routes.match(/app\.get\('\/api\/v1\/approvals\/delegations'/g) ?? []).length, 1);
  assert.equal((routes.match(/app\.post\('\/api\/v1\/approvals\/delegations'/g) ?? []).length, 1);
  assert.doesNotMatch(routes, /approvals\/delegations\/:id/);
  assert.doesNotMatch(routes, /app\.(?:patch|delete)\('\/api\/v1\/approvals\/delegations/);
  assert.equal((schema.match(/Object\.freeze\(\{ method:/g) ?? []).length, 8);
});

test('Pass 412 keeps the delegation query strict and bounded to page and pageSize', () => {
  includes(schema, 'export const listApprovalDelegationsQuerySchema = z.object({');
  includes(schema, '...paginationQueryShape');
  includes(routes, "const query = parseRequest(listApprovalDelegationsQuerySchema, request.query, 'query');");
  includes(routes, 'additionalProperties: false');
  assert.doesNotMatch(routes.match(/app\.get\('\/api\/v1\/approvals\/delegations'[\s\S]*?\n  \}\);/)?.[0] ?? '', /status|fromUserId|toUserId|search|sort/);
});

test('Pass 412 service reuses the existing company-scoped repository reader and permission', () => {
  includes(service, 'async listDelegations(input: ListApprovalDelegationsQuery)');
  includes(service, "security.permissions.includes('approval_delegations.manage')");
  includes(service, 'this.repository.listDelegationsForCompany({');
  includes(service, 'skip: (page - 1) * pageSize');
  includes(service, 'take: pageSize');
  includes(repository, 'const scope = requireCompanyRepositoryScope();');
  includes(repository, "orderBy: [{ fromDate: 'desc' }, { id: 'asc' }]");
  assert.doesNotMatch(service.match(/async listDelegations[\s\S]*?\n  \}/)?.[0] ?? '', /companyId/);
});

test('Pass 412 returns only the frozen delegation page fields and does not expose companyId', () => {
  const method = service.match(/async listDelegations[\s\S]*?\n  \}/)?.[0] ?? '';
  for (const token of ['id:', 'fromUserId:', 'toUserId:', 'fromDate:', 'toDate:', 'scope:', 'status:', 'page,', 'pageSize,', 'total:']) {
    includes(method, token);
  }
  assert.doesNotMatch(method, /companyId/);
  includes(routes, "required: ['items', 'page', 'pageSize', 'total']");
  includes(routes, "required: ['id', 'fromUserId', 'toUserId', 'fromDate', 'toDate', 'scope', 'status']");
  includes(routes, "required: ['resourceTypes']");
});

test('Pass 412 adds the typed browser list API and a dedicated TanStack Query key', () => {
  includes(browserApi, 'export type ListApprovalDelegationsInput');
  includes(browserApi, 'export type ApprovalDelegationPage');
  includes(browserApi, 'export function listApprovalDelegations(');
  includes(browserApi, '`approvals/delegations${suffix}`');
  includes(hooks, "const APPROVAL_DELEGATIONS_QUERY_KEY = [...APPROVALS_QUERY_KEY, 'delegations'] as const;");
  includes(hooks, 'export function useApprovalDelegations(input: ListApprovalDelegationsInput = {})');
  includes(hooks, 'queryKey: [...APPROVAL_DELEGATIONS_QUERY_KEY, input]');
  includes(hooks, 'queryFn: () => listApprovalDelegations(input)');
});

test('Pass 412 invalidates only the delegation list and affected inbox after create', () => {
  const createHook = hooks.match(/export function useCreateApprovalDelegation\(\)[\s\S]*?\n\}/)?.[0] ?? '';
  includes(createHook, 'queryClient.invalidateQueries({ queryKey: APPROVAL_DELEGATIONS_QUERY_KEY })');
  includes(createHook, 'queryClient.invalidateQueries({ queryKey: APPROVAL_INBOX_QUERY_KEY })');
  assert.doesNotMatch(createHook, /queryKey: APPROVALS_QUERY_KEY/);
});

test('Pass 412 renders durable existing delegations without copying server rows into component state', () => {
  includes(admin, 'useApprovalDelegations({ page, pageSize })');
  includes(admin, 'Existing delegations');
  includes(admin, 'Company approval delegations');
  includes(admin, 'delegation.scope.resourceTypes.join');
  includes(admin, 'Page {page} of {totalPages}');
  assert.doesNotMatch(admin, /useState<ApprovalDelegation|useState<ApprovalDelegationPage/);
});

test('Pass 412 extends live API and browser coverage for durable readback and security', () => {
  includes(integrationTest, 'delegation readback is paginated, permission-safe and company-scoped');
  includes(integrationTest, "url: '/api/v1/approvals/delegations?page=1&pageSize=1'");
  includes(integrationTest, "url: '/api/v1/approvals/delegations?pageSize=101'");
  includes(integrationTest, "'companyId' in response.json().data.items[0]");
  includes(integrationTest, 'approval-limited-a@example.test');
  includes(integrationTest, 'approval-admin-b@example.test');
  includes(browserTest, "getByRole('heading', { name: 'Existing delegations' })");
  includes(browserTest, 'Reload proves the delegation list comes from durable server state');
});

test.skip('Pass 412 adds no permission, stable error, event, repository function or database change', async () => {
  assert.doesNotMatch(schema, /approval_delegations\.read/);
  assert.equal((schema.match(/'approval_delegations\.manage'/g) ?? []).length, 1);
  for (const [file, expectedHash] of Object.entries(UNCHANGED_HASHES)) {
    assert.equal(await sha256(file), expectedHash, `${file} changed outside the frozen Pass-412 implementation boundary`);
  }
});

test('Pass 412 wires the previously one-reference delegation reader while preserving the remaining proof-audit candidates', async () => {
  assert.ok(await productionReferenceCount('listDelegationsForCompany') >= 2);
  assert.ok(await productionReferenceCount('listApprovalDelegations') >= 2);
  assert.ok(await productionReferenceCount('useApprovalDelegations') >= 2);
  // Pass 3.7 intentionally wires the previously frozen Document link service into its final HTTP route.
  assert.ok(await productionReferenceCount('linkDocumentToResource') >= 2);

  for (const candidate of [
    'listDocumentLinks', 'findGoodsReceiptById',
    'countPayrollCalculationExceptions', 'findApprovalRequestForCompany', 'findActiveDelegation',
    'resolveRestrictedProjectScope', 'listScheduleBaselines', 'listScheduleProgressUpdates',
    'listChangeRequestLines', 'listEstimateItems', 'listProgressClaimLines',
    'listRetentionEntriesForSourceIds', 'findRetentionLedgerBySource', 'findTimesheetById'
  ]) {
    assert.equal(await productionReferenceCount(candidate), 1, `${candidate} changed before its planned repair/proof pass`);
  }
});

test.skip('Pass 412 historically expected useRfq to remain one-reference until Pass 414', async () => {
  assert.equal(await productionReferenceCount('useRfq'), 1);
});

test.skip('Pass 412 historically expected useInventoryCount to remain one-reference until Pass 413', async () => {
  assert.equal(await productionReferenceCount('useInventoryCount'), 1);
});

test('Pass 412 keeps the cumulative repair sequence pointed at Inventory count UI repair next', () => {
  assert.equal(
    rootPackage.scripts['pass-412:module-22-delegation-readback-implementation:gate'],
    'node --test tests/pass-412-module-22-delegation-readback-implementation.test.mjs tests/module-22-static.test.mjs tests/pass-411-module-22-delegation-readback-contract-freeze.test.mjs tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
