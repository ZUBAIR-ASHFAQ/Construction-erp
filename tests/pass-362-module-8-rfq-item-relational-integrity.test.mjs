import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pass = await readFile('docs/PASS-362-MODULE-8-RFQ-ITEM-RELATIONAL-INTEGRITY.md', 'utf8');
const repairContract = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const moduleContract = await readFile('docs/modules/procurement/STAGE-13-MODULE-8-CONTRACT.md', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260826000500_module_8_rfq_item_relational_integrity/migration.sql', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksums = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const schema = await readFile('apps/api/src/modules/procurement/procurement.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/procurement/procurement.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/procurement/procurement.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/procurement/api/procurement-api.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');
const integration = await readFile('tests/integration/module-8-api.integration.test.mjs', 'utf8');
const e2e = await readFile('tests/e2e/module-8-browser.spec.mjs', 'utf8');

// Keep Pass 362 on the single M8-01 repair boundary frozen by Pass 358.
test('Pass 362 closes only M8-01 and keeps later repairs deferred', () => {
  assert.match(repairContract, /M8-01 — `supplier_quotation_items\.rfq_item_id` has no enforceable target/);
  assert.match(repairContract, /IMPLEMENTED_PASS_362/);
  assert.match(pass, /does \*\*not\*\* start Vendor-master management\/readback/);
  assert.match(pass, /Stage 26 Finance source adapters or Stage 27 cross-module completion/);
});

// Prove the repair adds one narrow RFQ line snapshot model and a real quotation-line relation.
test('Pass 362 adds one RfqItem support model with the real quotation-line FK', () => {
  assert.match(prisma, /model RfqItem \{[\s\S]*?@@map\("rfq_items"\)/);
  assert.match(prisma, /requisitionItemId\s+String\?/);
  assert.match(prisma, /quotationItems\s+SupplierQuotationItem\[\]/);
  assert.match(prisma, /rfqItem\s+RfqItem\s+@relation\(fields: \[rfqItemId\], references: \[id\]/);
  assert.doesNotMatch(prisma, /supplier_quotation_items_unresolved_rfq_item_idx/);
});

// Keep migration history append-only and assign this repair to one post-Stage-23 gate.
test('Pass 362 migration is checksum locked and assigned to one repair gate', () => {
  assert.ok(gates.gates.length >= 43);
  const pass362Gate = gates.gates.find((gate) => gate.gate === 'post-stage-23-module-8-rfq-item-relational-integrity-repair');
  assert.ok(pass362Gate);
  assert.deepEqual(pass362Gate.migrations, ['20260826000500_module_8_rfq_item_relational_integrity']);
  assert.match(checksums.migrations['20260826000500_module_8_rfq_item_relational_integrity'], /^[a-f0-9]{64}$/);
});

// Verify historical opaque IDs are normalized before the foreign key is activated.
test('Pass 362 migration safely backfills historical quotation item identities', () => {
  assert.match(migration, /CREATE TEMP TABLE "module_8_rfq_item_backfill_map"/);
  assert.match(migration, /COUNT\(DISTINCT quotation\."rfq_id"\)/);
  assert.match(migration, /WHEN identity_use\."rfq_count" = 1 THEN grouped\."old_rfq_item_id"/);
  assert.match(migration, /ELSE gen_random_uuid\(\)/);
  assert.match(migration, /UPDATE "supplier_quotation_items" quotation_item/);
  assert.ok(migration.indexOf('UPDATE "supplier_quotation_items" quotation_item') < migration.indexOf('supplier_quotation_items_rfq_item_fkey'));
});

// Verify database-level scope constraints protect both requisition and RFQ ownership.
test('Pass 362 database triggers reject cross-source and cross-RFQ relationships', () => {
  assert.match(migration, /module_8_validate_rfq_item_requisition_scope/);
  assert.match(migration, /RFQ item must come from the RFQ source requisition/);
  assert.match(migration, /module_8_validate_supplier_quotation_item_scope/);
  assert.match(migration, /Supplier quotation item must belong to the same RFQ as the quotation/);
  assert.match(migration, /module_8_validate_supplier_quotation_header_item_scope/);
});

// Keep direct RFQ line creation inside the existing RFQ create command instead of adding CRUD.
test('Pass 362 RFQ schema requires exactly one line source and exposes authoritative line ids', () => {
  assert.match(schema, /rfqItemInputSchema/);
  assert.match(schema, /Provide either one requisitionId or direct RFQ items, but not both/);
  assert.match(schema, /rfqItemResponseSchema/);
  assert.match(schema, /items: z\.array\(rfqItemResponseSchema\)\.min\(1\)/);
  const body = schema.slice(schema.indexOf('export const createRfqBodySchema'), schema.indexOf('/** Issue one RFQ'));
  assert.doesNotMatch(body, /\bcompanyId\b|\bbuyerUserId\b|\brfqNo\b|\bstatus\b/);
});

// Keep repository behavior small: create snapshots and resolve only exact RFQ-owned item IDs.
test('Pass 362 repository persists RFQ snapshots and validates item ownership', () => {
  assert.match(repository, /async createRfq\(/);
  assert.match(repository, /items:\s*\{\s*create:/);
  assert.match(repository, /async findRfqItemsByIds\(/);
  assert.match(repository, /rfqId,/);
  assert.match(repository, /projectId:/);
  assert.doesNotMatch(repository, /async createRfqItem\(|async updateRfqItem\(|async deleteRfqItem\(/);
});

// Verify the service derives requisition snapshots server-side and rejects foreign quotation line IDs.
test('Pass 362 service derives safe line snapshots and validates quotation line identity', () => {
  assert.match(service, /sourceRequisition\.items\.map/);
  assert.match(service, /requisitionItemId: item\.id/);
  assert.match(service, /RFQ must contain at least one line/);
  assert.match(service, /findRfqItemsByIds\(rfq\.projectId, rfq\.id, requestedRfqItemIds\)/);
  assert.match(service, /throw createModule8Error\('QUOTATION_INVALID'\)/);
});

// Preserve the original eight public operations; Pass 362 changes shape but adds no route.
test('Pass 362 adds no public RFQ-item route or new permission/error vocabulary', () => {
  const httpRoutes = schema.slice(
    schema.indexOf('export const MODULE_8_HTTP_ROUTES'),
    schema.indexOf('export const MODULE_8_REPAIR_HTTP_ROUTES')
  );
  assert.equal([...httpRoutes.matchAll(/Object\.freeze\(\{ method:/g)].length, 8);
  assert.doesNotMatch(routes, /rfq-items|rfq\/items|rfqs\/:rfqId\/items/);
  assert.match(moduleContract, /adds no public operation, permission or event/);
});

// Keep React on server-returned RFQ line identities without a second data surface.
test('Pass 362 React consumes RFQ response items for quotation entry', () => {
  assert.match(webApi, /items:/);
  assert.match(workspace, /rfq\.items/);
  assert.doesNotMatch(webApi, /\/rfq-items|\/rfqs\/.*\/items/);
});

// Keep dependency-backed tests ready for the exact repaired security boundary.
test('Pass 362 integration and browser coverage include RFQ-item integrity', () => {
  assert.match(integration, /rfq_items|rfqItemId/);
  assert.match(integration, /rfqItem|quotation item/i);
  assert.match(e2e, /rfq\.items|rfqItemId|rfqItem/);
  assert.match(e2e, /eight reviewed Module-8 endpoint shapes/i);
});

// Preserve the major later-module boundary: selecting a quote remains pre-commitment.
test('Pass 362 keeps quotation selection pre-commitment', () => {
  assert.match(moduleContract, /selection remains pre-commitment/i);
  assert.match(integration, /costCommitment\.count/);
  assert.match(integration, /journal\.count/);
  assert.match(pass, /Purchase Order conversion, commitments, journals or payables/);
});
