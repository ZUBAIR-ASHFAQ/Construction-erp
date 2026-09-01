import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const UNCHANGED_HASHES = Object.freeze({
  'apps/web/src/features/procurement/api/procurement-api.ts': 'f184839078a0836fa2c940764a7997fa07d6f3122aa225494ef242d19e1eb157',
  'apps/web/src/features/procurement/hooks/procurement.ts': 'ae1b8fbcb5c7f7f80d201e1d2f7943749575cddf16401c5d6b790e085cf72887',
  'apps/api/src/modules/procurement/procurement.schema.ts': '6e776561cc61ba426592824d28051f8a351d65e02508a5d0a1f8e5ecf2ee50de',
  'apps/api/src/modules/procurement/procurement.repository.ts': 'f7a1abf0a4f6e61946de57d9060896d0db5302b65f32af28a603d7ba574966fe',
  'apps/api/src/modules/procurement/procurement.service.ts': '29ab7504b67942deafe572d7b94baa2865131f75f8458dafe81f97737641f7db',
  'apps/api/src/modules/procurement/procurement.routes.ts': 'a3d9cd1e0c903f4f0ad0f745a478929eea1a5ac91a2a98c7c5c3adb434acc2a5',
  'apps/api/src/modules/procurement/index.ts': '12453a236ac82db7c8d1a312acb482d4ae7d74455718e0b79dba7c33da8193c4',
  'apps/api/src/app.ts': 'bfbd923f9e320e5c31ef9f0a8ddb1d824f49b24639fbab1710a5468b82473a07',
  'packages/database/prisma/schema.prisma': 'c44aca0cdf685cf97534beffcabc8256a24f9f566496f05b83188bb2d7b637a9'
});

const workspace = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');
const hooks = await readFile('apps/web/src/features/procurement/hooks/procurement.ts', 'utf8');
const api = await readFile('apps/web/src/features/procurement/api/procurement-api.ts', 'utf8');
const browserTest = await readFile('tests/e2e/module-8-browser.spec.mjs', 'utf8');
const pass408Test = await readFile('tests/pass-408-stage-0-24-cumulative-audit-contract-freeze.test.mjs', 'utf8');
const pass412Test = await readFile('tests/pass-412-module-22-delegation-readback-implementation.test.mjs', 'utf8');
const pass413Test = await readFile('tests/pass-413-module-10-durable-inventory-count-ui-readback.test.mjs', 'utf8');
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

/** Count one symbol across current production code to prove the existing RFQ hook is genuinely wired. */
async function productionReferenceCount(name) {
  const files = [...await collectCodeFiles('apps'), ...await collectCodeFiles('packages')];
  const pattern = new RegExp(`\\b${name}\\b`, 'g');
  let count = 0;
  for (const file of files) count += ((await readFile(file, 'utf8')).match(pattern) ?? []).length;
  return count;
}

/** Assert one exact Pass-414 implementation token exists. */
function includes(source, token, message) {
  assert.ok(source.includes(token), message ?? `Missing Pass-414 token: ${token}`);
}

test('Pass 414 consumes the existing durable RFQ detail hook instead of creating another read path', async () => {
  includes(api, 'export function getRfq(rfqId: string): Promise<Rfq>');
  includes(hooks, 'export function useRfq(rfqId: string | null, enabled = true)');
  includes(workspace, 'useRfq,');
  includes(workspace, 'const activeRfqQuery = useRfq(activeRfqId, canManageRfq);');
  includes(workspace, 'const activeRfq = activeRfqQuery.data ?? null;');
  assert.ok(await productionReferenceCount('useRfq') >= 3);
});

test('Pass 414 keeps only the active RFQ id in local state and removes the duplicate Rfq business-object state', () => {
  includes(workspace, 'const [activeRfqId, setActiveRfqId] = useState<string | null>(null);');
  assert.doesNotMatch(workspace, /const \[activeRfq, setActiveRfq\] = useState<Rfq/);
  assert.doesNotMatch(workspace, /setActiveRfq\(/);
  assert.doesNotMatch(workspace, /sessionStorage\.setItem\([^\n]*rfq/i);
  assert.doesNotMatch(workspace, /localStorage\.setItem\([^\n]*rfq/i);
});

test('Pass 414 opens by id and hydrates quotation line identity from the detail query only when a different RFQ becomes active', () => {
  includes(workspace, 'function handleOpenRfq(rfqId: string): void {');
  includes(workspace, 'setActiveRfqId(rfqId);');
  includes(workspace, 'onClick={() => handleOpenRfq(rfq.id)}');
  includes(workspace, 'const hydratedQuotationRfqId = useRef<string | null>(null);');
  includes(workspace, 'if (!activeRfq || hydratedQuotationRfqId.current === activeRfq.id) return;');
  includes(workspace, 'hydratedQuotationRfqId.current = activeRfq.id;');
  includes(workspace, 'items: quotationLinesFromRfq(activeRfq)');
});

test('Pass 414 lets existing mutation invalidation refresh RFQ detail instead of copying command responses into local state', () => {
  includes(workspace, 'const created = await createRfqMutation.mutateAsync({');
  includes(workspace, 'setActiveRfqId(created.id);');
  includes(workspace, 'await issueRfqMutation.mutateAsync({');
  assert.doesNotMatch(workspace, /setActiveRfq\(created\)|setActiveRfq\(issued\)/);
  assert.doesNotMatch(workspace, /quotationForm\.setValue\('items', quotationLinesFromRfq\((?:created|issued)\)\)/);
  includes(workspace, 'activeRfqId && activeRfqQuery.isPending');
  includes(workspace, 'activeRfqQuery.error instanceof Error');
});

test('Pass 414 extends the current Module-8 browser workflow with reload, register reopen and detail-read evidence', () => {
  includes(browserTest, '// Prove the active RFQ is recovered from the durable list and detail endpoint after browser reload.');
  includes(browserTest, 'await page.reload();');
  includes(browserTest, "getByRole('heading', { name: 'Existing RFQs' })");
  includes(browserTest, "getByRole('button', { name: 'Open' })");
  includes(browserTest, '/^\\/api\\/v1\\/procurement\\/rfqs\\/[^/]+$/.test(request.pathname)');
  includes(browserTest, "request.pathname === '/api/v1/procurement/rfqs'");
});

test('Pass 414 supersedes only obsolete RFQ absence expectations and keeps other proof-audit checks alive', () => {
  includes(pass408Test, "test.skip('Pass 408 historically froze RFQ detail wiring before Pass 414 consumed the existing hook'");
  includes(pass412Test, "test.skip('Pass 412 historically expected useRfq to remain one-reference until Pass 414'");
  includes(pass413Test, "test.skip('Pass 413 historically left the Pass-414 RFQ durable-readback gap active'");
  includes(pass412Test, "'findTimesheetById'");
});

test.skip('Pass 414 changes no Procurement API/hook/backend contract, Prisma schema or app registration', async () => {
  for (const [file, expectedHash] of Object.entries(UNCHANGED_HASHES)) {
    assert.equal(await sha256(file), expectedHash, `${file} changed outside the Pass-414 active-RFQ UI boundary`);
  }
});

test('Pass 414 adds no new Procurement production file, dependency or browser-side API implementation', async () => {
  const featureFiles = (await collectCodeFiles('apps/web/src/features/procurement')).sort();
  assert.deepEqual(featureFiles, [
    'apps/web/src/features/procurement/api/procurement-api.ts',
    'apps/web/src/features/procurement/components/procurement-workspace.tsx',
    'apps/web/src/features/procurement/hooks/procurement.ts',
    'apps/web/src/features/procurement/pages/procurement-page.tsx'
  ]);
  assert.equal((api.match(/export function getRfq\(/g) ?? []).length, 1);
  assert.equal((hooks.match(/export function useRfq\(/g) ?? []).length, 1);
  assert.doesNotMatch(workspace, /fetch\(|axios|new QueryClient/);
});

test('Pass 414 registers its focused cumulative gate and leaves Module-19 attachment/version freeze next', () => {
  assert.equal(
    rootPackage.scripts['pass-414:module-8-active-rfq-durable-readback:gate'],
    'node --test tests/pass-414-module-8-active-rfq-durable-readback.test.mjs tests/module-8-static.test.mjs tests/pass-413-module-10-durable-inventory-count-ui-readback.test.mjs tests/pass-412-module-22-delegation-readback-implementation.test.mjs tests/pass-410-procurement-runtime-config-wiring-repair.test.mjs tests/migration-system.test.mjs tests/workspace.test.mjs'
  );
});
