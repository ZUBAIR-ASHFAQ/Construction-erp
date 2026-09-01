import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (file) => readFileSync(file, 'utf8');
const prisma = read('packages/database/prisma/schema.prisma');
const migration = read('packages/database/prisma/migrations/20260826000700_module_9_revision_history_cancellation_evidence/migration.sql');
const gates = JSON.parse(read('packages/database/prisma/migration-gates.json'));
const checksums = JSON.parse(read('packages/database/prisma/migration-checksums.json'));
const schema = read('apps/api/src/modules/purchase-orders/purchase-orders.schema.ts');
const repository = read('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
const service = read('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
const routes = read('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
const repairContract = read('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md');
const moduleContract = read('docs/modules/purchase-orders/STAGE-14-MODULE-9-CONTRACT.md');
const passDoc = read('docs/PASS-365-MODULE-9-REVISION-HISTORY-CANCELLATION-EVIDENCE.md');
const api = read('apps/web/src/features/purchase-orders/api/purchase-orders-api.ts');
const workspace = read('apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx');
const integration = read('tests/integration/module-9-api.integration.test.mjs');
const browser = read('tests/e2e/module-9-browser.spec.mjs');

// Confirm Pass 365 closes only the two frozen Module-9 history/evidence items.
test('Pass 365 closes M9-02 and M9-03 while leaving tax and FX policy unresolved', () => {
  assert.match(repairContract, /M9-02[\s\S]*?IMPLEMENTED_PASS_365/);
  assert.match(repairContract, /M9-03[\s\S]*?IMPLEMENTED_PASS_365/);
  assert.match(repairContract, /M9-04[\s\S]*?POLICY_REQUIRED/);
  assert.match(moduleContract, /Pass 365 amendment/);
  assert.match(passDoc, /closes frozen repair items \*\*M9-02\*\* and \*\*M9-03\*\*/);
});

// Confirm the minimum persistence adds one support model and durable cancellation evidence to the existing PO.
test('Pass 365 adds one immutable revision-line support model and three cancellation fields', () => {
  assert.match(prisma, /model PurchaseOrderRevisionItem \{/);
  assert.match(prisma, /snapshotSide\s+String\s+@map\("snapshot_side"\)/);
  assert.match(prisma, /purchaseOrderRevisionId\s+String\s+@map\("purchase_order_revision_id"\)/);
  assert.match(prisma, /cancelReason\s+String\?\s+@map\("cancel_reason"\)/);
  assert.match(prisma, /cancelledAt\s+DateTime\?\s+@map\("cancelled_at"\)/);
  assert.match(prisma, /cancelledBy\s+String\?\s+@map\("cancelled_by"\)/);
  assert.doesNotMatch(prisma, /model\s+PurchaseOrderCancellation/);
});

// Confirm the migration recovers old evidence, protects new cancellation transitions and locks revision history.
test('Pass 365 migration backfills history and makes revision/cancellation evidence immutable', () => {
  assert.match(migration, /CREATE TABLE "purchase_order_revision_items"/);
  assert.match(migration, /'BEFORE'/);
  assert.match(migration, /'AFTER'/);
  assert.match(migration, /FROM "audit_logs"/);
  assert.match(migration, /ADD COLUMN "cancel_reason" TEXT/);
  assert.match(migration, /ADD COLUMN "cancelled_at" TIMESTAMPTZ\(6\)/);
  assert.match(migration, /ADD COLUMN "cancelled_by" UUID/);
  assert.match(migration, /purchase_orders_cancellation_evidence_integrity/);
  assert.match(migration, /cancellation evidence is immutable after cancellation/);
  assert.match(migration, /purchase_order_revisions_immutable/);
  assert.match(migration, /purchase_order_revision_items_immutable/);
  assert.doesNotMatch(migration, /INSERT INTO\s+"permissions"/i);
});

// Confirm the historical Pass-365 migration remains locked even when later reviewed repair migrations are appended.
test('Pass 365 migration 45 remains registered with a locked checksum', () => {
  assert.equal(gates.gates.length >= 45, true);
  const pass365Gate = gates.gates.find((gate) => gate.gate === 'post-stage-23-module-9-revision-history-cancellation-evidence-repair');
  assert.ok(pass365Gate);
  assert.deepEqual(pass365Gate.migrations, ['20260826000700_module_9_revision_history_cancellation_evidence']);
  assert.match(checksums.migrations['20260826000700_module_9_revision_history_cancellation_evidence'], /^[a-f0-9]{64}$/);
});

// Confirm the reviewed Module-9 public contract does not expand to generic history or cancellation APIs.
test('Pass 365 preserves eight routes, current permissions, five errors and five events', () => {
  const methodMatches = routes.match(/app\.(?:get|post|patch)\('/g) ?? [];
  assert.equal(methodMatches.length, 8);
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
    'purchase_orders.direct_purchase'
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  assert.doesNotMatch(schema, /purchase_orders\.cancel/);
  assert.match(moduleContract, /five stable errors and five domain events remain unchanged/);
  assert.doesNotMatch(routes, /revision-items/);
});

// Confirm the service snapshots exact before/after line state during the existing controlled revision transaction.
test('Pass 365 service writes exact before and after line snapshots during revision', () => {
  assert.match(service, /function revisionSnapshotItems/);
  assert.match(service, /beforeItems: revisionSnapshotItems\(before\.items\)/);
  assert.match(service, /afterItems: revisionSnapshotItems\(revised\.items\)/);
  assert.match(repository, /Persist one immutable revision header plus exact before\/after line snapshots/);
  assert.match(repository, /snapshotSide: 'BEFORE'/);
  assert.match(repository, /snapshotSide: 'AFTER'/);
  assert.match(repository, /purchaseOrderRevisionItem\.createMany/);
});

// Confirm cancellation reason, actor and time are server-owned and persisted in the same transaction as cancellation.
test('Pass 365 persists durable server-owned cancellation evidence atomically', () => {
  assert.match(service, /async cancelPurchaseOrder/);
  assert.match(service, /const security = requireRequestSecurityContext\(\)/);
  assert.match(service, /cancelledBy: security\.actorUserId/);
  assert.match(service, /cancelledAt: now/);
  assert.match(repository, /async cancelPurchaseOrder/);
  assert.match(repository, /cancelReason: input\.reason/);
  assert.match(repository, /cancelledAt: input\.cancelledAt/);
  assert.match(repository, /cancelledBy: input\.cancelledBy/);
});

// Confirm existing readback exposes immutable snapshots and cancellation evidence without another endpoint.
test('Pass 365 extends existing PO detail readback with revision snapshots and cancellation evidence', () => {
  assert.match(schema, /purchaseOrderRevisionItemResponseSchema/);
  assert.match(schema, /snapshotSide: z\.enum\(\['BEFORE', 'AFTER'\]\)/);
  assert.match(schema, /cancelReason: reasonSchema\.nullable\(\)/);
  assert.match(schema, /cancelledAt: timestampSchema\.nullable\(\)/);
  assert.match(schema, /cancelledBy: uuidSchema\.nullable\(\)/);
  assert.match(routes, /snapshotSide: \{ type: 'string', enum: \['BEFORE', 'AFTER'\] \}/);
});

// Confirm the existing React feature renders the durable readback without a second state subsystem.
test('Pass 365 React workspace shows line-level revision and cancellation evidence', () => {
  assert.match(api, /export type PurchaseOrderRevisionItem/);
  assert.match(api, /snapshotSide: 'BEFORE' \| 'AFTER'/);
  assert.match(workspace, /Controlled revision history/);
  assert.match(workspace, /item\.snapshotSide/);
  assert.match(workspace, /Cancellation evidence/);
  assert.match(workspace, /selected\.cancelReason/);
  assert.doesNotMatch(workspace, /useState<PurchaseOrderRevisionItem/);
});

// Confirm API integration coverage proves durable line snapshots and cancellation persistence.
test('Pass 365 integration scenarios verify exact revision snapshots and cancellation evidence', () => {
  assert.match(integration, /purchaseOrderRevisionItem\.count/);
  assert.match(integration, /purchaseOrderRevision\.update/);
  assert.match(integration, /purchaseOrderRevisionItem\.update/);
  assert.match(integration, /Tampered cancellation reason/);
  assert.match(integration, /snapshotSide/);
  assert.match(integration, /cancelReason/);
  assert.match(integration, /cancelledAt/);
  assert.match(integration, /cancelledBy/);
});

// Confirm browser coverage exercises both visible evidence surfaces and direct DB persistence checks.
test('Pass 365 browser scenario verifies revision line and cancellation evidence readback', () => {
  assert.match(browser, /revisionLineDetails/);
  assert.match(browser, /toContainText\('BEFORE'\)/);
  assert.match(browser, /toContainText\('AFTER'\)/);
  assert.match(browser, /Cancellation evidence/);
  assert.match(browser, /cancelReason/);
  assert.match(browser, /cancelledBy/);
});

// Confirm this repair does not pull later Finance/integration work or unsupported policy into Module 9.
test('Pass 365 preserves later Finance/integration boundaries and M9-04 policy boundary', () => {
  assert.match(passDoc, /no public route, no permission, no business event, no business module and no Finance\/Inventory write/);
  assert.match(passDoc, /Stage-26 Finance adapters and Stage-27 cross-module completion remain deferred/);
  assert.match(passDoc, /tax\/rounding and issued-PO FX repricing gap remains policy-required/);
});
