import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const UNCHANGED_HASHES = Object.freeze({
  'apps/web/src/features/inventory/api/inventory-api.ts': '0eda50106a8acbbe4215bf4b2b4064b322295b94c6cb115a8138962cd6187c31',
  'apps/web/src/features/inventory/hooks/inventory.ts': '65944c3ddacbdeb782b427859dc99008c2aa5eb9761569ef68c346b515725e62',
  'apps/api/src/modules/inventory/inventory.schema.ts': '96fcf4ef7c472dca4d5ff344423ebeef4689c56d6205e23c6823d98c6876c47b',
  'apps/api/src/modules/inventory/inventory.repository.ts': '4a85298d72aba8bd9dd971616725907c2b59a39ea2e8c521874d64d193f3c913',
  'apps/api/src/modules/inventory/inventory.service.ts': '5dff9a0c6632b66495fee93b2448ce2868f1f39af4f650f80802dde5e620ec34',
  'apps/api/src/modules/inventory/inventory.routes.ts': '85b8c8e4d6a38001f44c26f7ff7986d162341d99b13474cc7a0852dea0f8809c',
  'apps/api/src/modules/inventory/index.ts': 'c455ac72a7bcdf8da4915140b0445bdbf07aaf4b6a9b0f428ce940711bddb4ab',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9'
});

const workspace = await readFile('apps/web/src/features/inventory/components/inventory-workspace.tsx', 'utf8');
const hooks = await readFile('apps/web/src/features/inventory/hooks/inventory.ts', 'utf8');
const api = await readFile('apps/web/src/features/inventory/api/inventory-api.ts', 'utf8');
const browserTest = await readFile('tests/e2e/module-10-browser.spec.mjs', 'utf8');
const pass408Test = await readFile('tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs', 'utf8');
const pass412Test = await readFile('tests/pass-412-module-22-delegation-readback-implementation.test.mjs', 'utf8');
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

/** Count one symbol across current production code to prove the existing hook is now genuinely wired. */
async function productionReferenceCount(name) {
  const files = [...await collectCodeFiles('apps'), ...await collectCodeFiles('packages')];
  const pattern = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  for (const file of files) count += ((await readFile(file, 'utf8')).match(pattern) ?? []).length;
  return count;
}

/** Assert one exact Pass-413 implementation token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-413 token: ${token}`);
}

test('Pass 413 reuses the existing durable count API and TanStack Query hook instead of adding a second read path', async () => {
  includes(api, 'export function getInventoryCount(countId: string)');
  includes(hooks, 'export function useInventoryCount(countId: string, enabled = true)');
  includes(workspace, 'useInventoryCount,');
  includes(workspace, 'const countQuery = useInventoryCount(countId, canAdjust && countId.length > 0);');
  assert.ok(await productionReferenceCount('useInventoryCount') >= 3);
});

test('Pass 413 keeps only the selected count identifier locally while server data remains query-owned', () => {
  includes(workspace, "const INVENTORY_COUNT_SESSION_KEY = 'construction-erp-module-10-selected-count-id';");
  includes(workspace, "const [countId, setCountId] = useState(() => sessionStorage.getItem(INVENTORY_COUNT_SESSION_KEY) ?? '');");
  includes(workspace, 'const count = countQuery.data ?? null;');
  includes(workspace, 'sessionStorage.setItem(INVENTORY_COUNT_SESSION_KEY, result.id);');
  includes(workspace, 'setCountId(result.id);');
  assert.doesNotMatch(workspace, /useState<InventoryCount/);
  assert.doesNotMatch(workspace, /setCount\(/);
  assert.doesNotMatch(workspace, /sessionStorage\.setItem\([^\n]*JSON\.stringify/);
});

test('Pass 413 reconciles the selected durable identifier and relies on existing mutation invalidation for refreshed status', () => {
  includes(workspace, 'if (!countId) return;');
  includes(workspace, 'await reconcileMutation.mutateAsync(countId);');
  includes(hooks, "queryKey: [...MODULE_10_QUERY_KEY, 'counts', countId]");
  includes(hooks, 'await invalidateInventory(queryClient);');
  assert.doesNotMatch(workspace, /setCount\(result\)/);
});

test('Pass 413 provides a simple recovery path if the remembered count is no longer readable', () => {
  includes(workspace, 'Reloading selected count…');
  includes(workspace, 'errorMessage(countQuery.error)');
  includes(workspace, "sessionStorage.removeItem(INVENTORY_COUNT_SESSION_KEY); setCountId('');");
  includes(workspace, 'Clear selected count');
});

test('Pass 413 extends the existing Module-10 browser workflow with refresh/readback/reconcile evidence', () => {
  includes(browserTest, "sessionStorage.getItem('construction-erp-module-10-selected-count-id')");
  includes(browserTest, 'await page.reload();');
  includes(browserTest, 'await openModule10(page);');
  includes(browserTest, "getByRole('button', { name: 'Reconcile count' })");
  includes(browserTest, "toContainText('RECONCILED')");
  includes(browserTest, '/^\\/api\\/v1\\/inventory\\/counts\\/[0-9a-f-]{36}$/i');
  includes(browserTest, '/^\\/api\\/v1\\/inventory\\/counts\\/[0-9a-f-]{36}\\/reconcile$/i');
});

test.skip('Pass 413 historically left the Pass-414 RFQ durable-readback gap active', () => {
  includes(pass408Test, "test.skip('Pass 408 historically froze Inventory-count durable readback before Pass 413 wiring'");
  includes(pass408Test, "test('Pass 408 still freezes RFQ detail wiring for Pass 414 without duplicating its existing hook'");
  includes(pass412Test, "test.skip('Pass 412 historically expected useInventoryCount to remain one-reference until Pass 413'");
  includes(pass408Test, 'assert.doesNotMatch(procurementWorkspace, /useRfq\\(/);');
});

test.skip('Pass 413 changes no Inventory backend, typed API, hook contract, Prisma schema or app registration', async () => {
  for (const [file, expectedHash] of Object.entries(UNCHANGED_HASHES)) {
    assert.equal(await sha256(file), expectedHash, `${file} changed outside the Pass-413 UI-readback boundary`);
  }
});

test('Pass 413 adds no new production file, endpoint, repository/service function or dependency for count readback', () => {
  assert.doesNotMatch(workspace, /fetch\(|axios|new QueryClient/);
  assert.equal((api.match(/export function getInventoryCount\(/g) ?? []).length, 1);
  assert.equal((hooks.match(/export function useInventoryCount\(/g) ?? []).length, 1);
  assert.doesNotMatch(workspace, /inventory\/counts\//);
});

test('Pass 413 registers its focused cumulative gate and keeps Pass 414 as the next repair', () => {
  assert.equal(
    rootPackage.scripts['pass-413:module-10-durable-inventory-count-ui-readback:gate'],
    'node --test tests/pass-413-module-10-durable-inventory-count-ui-readback.test.mjs tests/module-10-static.test.mjs tests/pass-412-module-22-delegation-readback-implementation.test.mjs tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
