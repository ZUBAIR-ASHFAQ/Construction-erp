import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');
const schema = read('apps/api/src/modules/purchase-orders/purchase-orders.schema.ts');
const repository = read('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
const service = read('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
const routes = read('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
const prisma = read('packages/database/prisma/schema.prisma');
const migration = read('packages/database/prisma/migrations/20260826000600_module_9_direct_purchase_exception/migration.sql');
const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
const repairContract = read('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md');
const moduleContract = read('docs/modules/purchase-orders/STAGE-14-MODULE-9-CONTRACT.md');
const api = read('apps/web/src/features/purchase-orders/api/purchase-orders-api.ts');
const workspace = read('apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx');
const page = read('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
const integration = read('tests/integration/module-9-api.integration.test.mjs');
const browser = read('tests/e2e/module-9-browser.spec.mjs');

// Confirm the frozen repair plan marks only the reviewed Module 9 direct-purchase item complete.
test('Pass 364 closes M9-01 while preserving the later Module 9 repair boundary', () => {
  assert.match(repairContract, /M9-01[\s\S]*?IMPLEMENTED_PASS_364/);
  assert.match(moduleContract, /Pass 364/);
  assert.match(moduleContract, /purchase_orders\.direct_purchase/);
  assert.match(moduleContract, /Pass 365/);
});

// Confirm the smallest durable persistence change stores the required exception reason on Purchase Order.
test('Pass 364 adds one direct-purchase reason field without a parallel business table', () => {
  const purchaseOrder = prisma.match(/model PurchaseOrder \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(purchaseOrder, /directPurchaseReason\s+String\?\s+@map\("direct_purchase_reason"\)\s+@db\.Text/);
  assert.doesNotMatch(prisma, /model\s+DirectPurchase/);
});

// Confirm PostgreSQL enforces one and only one Purchase Order source and registers authority without role auto-grants.
test('Pass 364 migration enforces quotation xor direct-purchase reason and adds explicit authority', () => {
  assert.match(migration, /ADD COLUMN "direct_purchase_reason" TEXT/);
  assert.match(migration, /Legacy quotation-less Purchase Order/);
  assert.match(migration, /purchase_orders_purchase_source_ck/);
  assert.match(migration, /"quotation_id" IS NOT NULL AND "direct_purchase_reason" IS NULL/);
  assert.match(migration, /"quotation_id" IS NULL AND "direct_purchase_reason" IS NOT NULL/);
  assert.match(migration, /purchase_orders\.direct_purchase/);
  assert.doesNotMatch(migration, /INSERT INTO\s+"role_permissions"/i);
  assert.ok(gates.gates.length >= 44);
  const pass364Gate = gates.gates.find((gate) => gate.gate === 'post-stage-23-module-9-direct-purchase-exception-repair');
  assert.ok(pass364Gate);
  assert.deepEqual(pass364Gate.migrations, ['20260826000600_module_9_direct_purchase_exception']);
  assert.match(checksums.migrations['20260826000600_module_9_direct_purchase_exception'], /^[a-f0-9]{64}$/);
});

// Confirm the six original permissions remain stable and the source-required direct-purchase authority is additive only.
test('Pass 364 preserves source permissions and adds only direct-purchase authority', () => {
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
    'purchase_orders.direct_purchase'
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(schema, /MODULE_9_SOURCE_PERMISSION_CODES/);
  assert.doesNotMatch(schema, /purchase_orders\.cancel/);
});

// Confirm input validation has exactly the quotation-backed and authorized direct-purchase source shapes.
test('Pass 364 create schema requires either selected quotation or direct-purchase reason', () => {
  assert.match(schema, /z\.discriminatedUnion\('quotationId'/);
  assert.match(schema, /quotationId: uuidSchema/);
  assert.match(schema, /quotationId: z\.null\(\)/);
  assert.match(schema, /directPurchaseReason: directPurchaseReasonSchema/);
  assert.match(schema, /z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2000\)/);
});

// Confirm service owns the direct-purchase rule, Project-scoped permission check and Vendor qualification check.
test('Pass 364 service validates direct-purchase authority and active qualified Vendor', () => {
  assert.match(service, /private async requireDirectPurchaseException/);
  assert.match(service, /'purchase_orders\.direct_purchase'/);
  assert.match(service, /VENDOR_ACTIVE/);
  assert.match(service, /VENDOR_QUALIFIED/);
  assert.match(service, /Direct purchase requires a reason/);
  assert.match(service, /Direct purchase requires an active qualified Vendor/);
});

// Confirm direct Purchase Orders follow the normal approval workflow before issue and carry reason into approval/audit evidence.
test('Pass 364 keeps Module 22 approval and durable reason evidence in the normal PO lifecycle', () => {
  assert.match(service, /requestApprovalInTransaction/);
  assert.match(service, /directPurchaseReason: response\.directPurchaseReason/);
  assert.match(service, /purchaseSource: response\.quotationId \? 'QUOTATION' : 'DIRECT_PURCHASE'/);
  assert.match(service, /directPurchaseAuthorizedByPermission/);
  assert.match(service, /purchase_order\.created/);
  assert.match(service, /purchase_order\.submitted/);
  assert.match(service, /purchase_order\.issued/);
});

// Confirm a DRAFT cannot silently change between quotation-backed and direct-purchase identity.
test('Pass 364 prevents Purchase Order source switching during draft edits', () => {
  assert.match(service, /const isDirectPurchase = current\.quotationId === null/);
  assert.match(service, /isDirectPurchase && input\.quotationId !== undefined/);
  assert.match(service, /!isDirectPurchase && input\.directPurchaseReason !== undefined/);
});

// Confirm repository persistence remains inside the existing Purchase Order repository without a parallel abstraction.
test('Pass 364 repository reads and writes the persisted direct-purchase reason', () => {
  assert.match(repository, /directPurchaseReason\?: string \| null/);
  assert.match(repository, /direct_purchase_reason AS "directPurchaseReason"/);
  assert.match(repository, /directPurchaseReason: input\.directPurchaseReason \?\? null/);
  assert.doesNotMatch(repository, /DirectPurchaseRepository/);
});

// Confirm the reviewed HTTP surface stays at eight operations and direct purchase remains a branch of create.
test('Pass 364 keeps the eight-route Module 9 API and documents the direct-purchase create branch', () => {
  const methodMatches = routes.match(/app\.(?:get|post|patch)\('/g) ?? [];
  assert.equal(methodMatches.length, 8);
  assert.match(routes, /oneOf:/);
  assert.match(routes, /quotationId: \{ type: 'null' \}/);
  assert.match(routes, /directPurchaseReason: \{ type: 'string', minLength: 1, maxLength: 2000 \}/);
  assert.doesNotMatch(routes, /direct-purchase['"]\s*,\s*method:/i);
});

// Confirm React exposes the exception only to users with explicit authority and submits the required reason.
test('Pass 364 React editor supports permission-aware direct purchase without a new feature subsystem', () => {
  assert.match(page, /usePermission\('purchase_orders\.direct_purchase'\)/);
  assert.match(workspace, /sourceMode: z\.enum\(\['QUOTATION', 'DIRECT_PURCHASE'\]\)/);
  assert.match(workspace, /Direct-purchase reason/);
  assert.match(workspace, /props\.canDirectPurchase/);
  assert.match(workspace, /quotationId: null/);
  assert.match(workspace, /directPurchaseReason: values\.directPurchaseReason\.trim\(\)/);
  assert.match(api, /quotationId: null; directPurchaseReason: string/);
});

// Confirm integration and browser coverage exercise persistence, approval evidence and direct-purchase UI behavior.
test('Pass 364 prepares API and browser verification for the direct-purchase exception', () => {
  assert.match(integration, /directPurchaseReason/);
  assert.match(integration, /payloadSnapshot\.directPurchaseReason/);
  assert.match(integration, /payloadSnapshot\.purchaseSource/);
  assert.match(integration, /quotationId: null/);
  assert.match(integration, /module9-buyer-no-direct@example\.test/);
  assert.match(integration, /assert\.equal\(response\.statusCode, 403/);
  assert.match(browser, /DIRECT_PURCHASE/);
  assert.match(browser, /directPurchaseReason/);
  assert.match(browser, /PO-0002/);
});
