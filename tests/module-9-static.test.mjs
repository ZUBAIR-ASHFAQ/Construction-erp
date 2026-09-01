import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/purchase-orders/STAGE-14-MODULE-9-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-9/verify-stage-14-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-9/verify-stage-14-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-9/verify-stage-14-schema.mjs', 'utf8');
const schema = await readFile('apps/api/src/modules/purchase-orders/purchase-orders.schema.ts', 'utf8');
const repositoryGate = await readFile('scripts/module-9/verify-stage-14-repository.mjs', 'utf8');
const repository = await readFile('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts', 'utf8');
const serviceGate = await readFile('scripts/module-9/verify-stage-14-service.mjs', 'utf8');
const service = await readFile('apps/api/src/modules/purchase-orders/purchase-orders.service.ts', 'utf8');
const httpGate = await readFile('scripts/module-9/verify-stage-14-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-9/verify-stage-14-integration-security.mjs', 'utf8');
const integrationTest = await readFile('tests/integration/module-9-api.integration.test.mjs', 'utf8');
const reactGate = await readFile('scripts/module-9/verify-stage-14-react.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-9/verify-stage-14-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-9/verify-stage-14-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-9/verify-stage-14.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-9-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const serverConfig = await readFile('packages/config/src/server.ts', 'utf8');
const apiMain = await readFile('apps/api/src/main.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/purchase-orders/api/purchase-orders-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/purchase-orders/hooks/purchase-orders.ts', 'utf8');
const webWorkspace = await readFile('apps/web/src/features/purchase-orders/components/purchase-orders-workspace.tsx', 'utf8');
const webPage = await readFile('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const routes = await readFile('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/purchase-orders/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260824000400_module_9_purchase_orders_core/migration.sql', 'utf8');
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

// Freeze the corrected Stage-14 prerequisite and Purchase Order position in the execution sequence.
test('Pass 234 freezes Stage 14 after Procurement and before Inventory', () => {
  assert.match(contract, /Stage 13  Module 8 - Procurement & RFQ/);
  assert.match(contract, /Stage 14  Module 9 - Purchase Orders/);
  assert.match(contract, /Stage 15  Module 10 - Inventory & Materials/);
  assert.match(contractGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
});

// Freeze only the three source-defined Purchase Order persistence resources.
test('Pass 234 freezes exactly three reviewed Module 9 tables', () => {
  for (const table of ['purchase_orders', 'purchase_order_items', 'purchase_order_revisions']) {
    assert.match(contract, new RegExp(`\\b${table}\\b`));
  }
  assert.match(contract, /Module 9 owns exactly these three reviewed persistence resources/);
  assert.match(contractGate, /ownedTables: \[/);
});

// Keep the corrected hard dependencies exactly on Modules 8, 7 and 22.
test('Pass 234 freezes the corrected Module 9 hard prerequisites', () => {
  for (const dependency of [
    'Module 8   Procurement & RFQ',
    'Module 7   Budgeting & Job Costing',
    'Module 22  Approval Workflows',
  ]) assert.ok(contract.includes(dependency), `Missing dependency: ${dependency}`);
  for (const prerequisite of [
    '8 - Procurement & RFQ',
    '7 - Budgeting & Job Costing',
    '22 - Approval Workflows',
  ]) assert.match(contractGate, new RegExp(prerequisite.replaceAll('&', '\\&')));
});

// Part I requires every Purchase Order vendor reference to use Module 8 Vendor master.
test('Pass 234 freezes Module 8 Vendor and quotation authority', () => {
  assert.match(contract, /`vendor_id` resolves to the Module-8 `vendors` master/);
  assert.match(contract, /`quotation_id`, when present, resolves to the Module-8 supplier quotation selected through the reviewed RFQ workflow/);
  assert.match(contract, /must not create a second competing quotation-selection master/);
  assert.match(contractGate, /vendorMasterOwner: '8 - Procurement & RFQ'/);
  assert.match(contractGate, /quotationMasterOwner: '8 - Procurement & RFQ'/);
});

// Preserve the nullable future Inventory item reference without a premature Module-10 foreign key.
test('Pass 234 defers the Module 10 Inventory item foreign key', () => {
  assert.match(contract, /`item_id` is nullable while the owning Inventory item master is Module 10/);
  assert.match(contract, /must \*\*not\*\* create a required foreign key to a future table/);
  assert.match(contractGate, /inventoryItemForeignKeyDeferredUntilModule10: true/);
});

// Freeze all and only the eight business operations supplied by the Purchase Order route table.
test('Pass 234 freezes exactly eight reviewed Module 9 public operations', () => {
  for (const route of [
    'GET   /api/v1/purchase-orders',
    'POST  /api/v1/purchase-orders',
    'GET   /api/v1/purchase-orders/:id',
    'PATCH /api/v1/purchase-orders/:id',
    'POST  /api/v1/purchase-orders/:id/submit',
    'POST  /api/v1/purchase-orders/:id/issue',
    'POST  /api/v1/purchase-orders/:id/revise',
    'POST  /api/v1/purchase-orders/:id/cancel',
  ]) assert.ok(contract.includes(route), `Missing route: ${route}`);
  assert.match(contractGate, /reviewedRouteCount: 8/);
});

// Do not add undocumented generic lifecycle or downstream receipt/invoice endpoints.
test('Pass 234 rejects generic or premature Purchase Order APIs', () => {
  for (const routePattern of [
    /DELETE \/api\/v1\/purchase-orders\/:id/,
    /POST   \/api\/v1\/purchase-orders\/:id\/approve/,
    /POST   \/api\/v1\/purchase-orders\/:id\/reject/,
    /POST   \/api\/v1\/purchase-orders\/:id\/receipt/,
    /POST   \/api\/v1\/purchase-orders\/:id\/invoice/,
    /POST   \/api\/v1\/purchase-orders\/direct-purchase-exceptions/,
  ]) assert.match(contract, routePattern);
  assert.match(contract, /Do not add generic CRUD routes automatically/);
});

// Freeze browser authority so scope, numbering, status, totals and consumption remain server-owned.
test('Pass 234 freezes server-owned Purchase Order authority', () => {
  for (const field of [
    'companyId', 'actorUserId', 'allowedProjectIds', 'poNo', 'status', 'subtotal', 'tax', 'total',
    'lineTotal', 'receivedQty', 'invoicedAmount', 'revisionNo', 'approvedAt', 'createdBy',
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
  assert.match(contract, /remain server-owned and must not be accepted as normal browser authority/);
  assert.match(contractGate, /browserCanWriteReceivedOrInvoicedConsumption: false/);
});

// Freeze concurrency-safe numbering and the documented commercial validation rules.
test('Pass 234 freezes the required PO validation contract', () => {
  assert.match(contract, /PO number generated by a concurrency-safe number sequence/);
  assert.match(contract, /Issued PO total must match line totals\/tax and the approved currency/);
  assert.match(contract, /Cost coding is required for project-costed lines/);
  assert.match(contract, /Revision cannot reduce below already received\/invoiced value/);
  assert.match(contract, /Direct-purchase bypass requires explicit permission and reason/);
});

// Do not fabricate a tax/rounding formula or an FX/currency master that the source does not define.
test('Pass 234 records monetary and approved-currency gaps', () => {
  assert.match(contract, /Monetary\/tax formula gap/);
  assert.match(contract, /whether line_total includes or excludes tax/);
  assert.match(contract, /rounding scale\/mode per line versus header/);
  assert.match(contract, /Approved-currency gap/);
  assert.match(contract, /must not invent an FX\/currency master/);
});

// Issue, revision and cancellation must own the Module-7 commitment adapter atomically and idempotently.
test('Pass 234 freezes the Module 7 commitment boundary', () => {
  assert.match(contract, /PO issue must create\/update source-keyed Module-7 commitment rows atomically/);
  assert.match(contract, /PO revision must atomically adjust the corresponding remaining commitment/);
  assert.match(contract, /PO cancellation must atomically cancel\/reduce the remaining commitment/);
  assert.match(contract, /retries must remain idempotent/);
  assert.match(contractGate, /issueCreatesOrUpdatesJobCostCommitment: true/);
  assert.match(contractGate, /revisionAndCancellationUpdateCommitmentAtomically: true/);
  assert.match(contractGate, /browserCanWriteCommitmentsDirectly: false/);
});

// Keep Finance/AP outside Stage 14 because Part I defers the adapter to Module 15B.
test('Pass 234 defers Finance supplier posting to Module 15B', () => {
  assert.match(contract, /Part I explicitly defers supplier\/PO Finance source adapters to \*\*Module 15B\*\*/);
  for (const forbidden of ['supplier AP invoice', 'payment allocation', 'Finance journal for the PO itself', 'supplier subledger posting']) {
    assert.match(contract, new RegExp(forbidden));
  }
  assert.match(contractGate, /financeAdapterDeferredToModule15B: true/);
});

// Preserve future receipt/invoice consumption without adding early browser write routes.
test('Pass 234 freezes downstream receipt and invoice consumption boundary', () => {
  assert.match(contract, /Module 10 later owns goods receipts and ordered-quantity consumption/);
  assert.match(contract, /Module 15B later owns supplier invoice\/AP integration/);
  assert.match(contract, /must not invent receipt, invoice or stock endpoints inside Purchase Orders/);
  assert.match(contractGate, /inventoryReceiptsDeferredToModule10: true/);
});

// Keep the six named permission tokens and explicitly record the missing cancel/direct-purchase tokens.
test('Pass 234 freezes the six named permissions without inventing two missing permissions', () => {
  for (const permission of [
    'purchase_orders.read',
    'purchase_orders.create',
    'purchase_orders.edit',
    'purchase_orders.submit',
    'purchase_orders.issue',
    'purchase_orders.revise',
  ]) assert.match(contract, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(contract, /does \*\*not\*\* name `purchase_orders\.cancel`/);
  assert.match(contract, /does not invent `purchase_orders\.direct_purchase`/);
  assert.match(contractGate, /cancelPermissionGapRecorded: true/);
  assert.match(contractGate, /directPurchasePermissionGapRecorded: true/);
});

// Preserve the direct-purchase business rule while refusing to invent its missing API/persistence contract.
test('Pass 234 records the direct-purchase exception gap explicitly', () => {
  assert.match(contract, /approved direct-purchase exception/);
  assert.match(contract, /a dedicated direct-purchase permission token/);
  assert.match(contract, /a purchase_orders direct_purchase_reason field/);
  assert.match(contract, /does not silently create a seventh permission token/);
  assert.match(contractGate, /directPurchasePersistenceGapRecorded: true/);
});

// Freeze the five stable Module-9 business conflict codes only.
test('Pass 234 freezes the five reviewed Module 9 error codes', () => {
  for (const code of [
    'PO_NOT_FOUND',
    'PO_NOT_APPROVED',
    'PO_ALREADY_ISSUED',
    'PO_REVISION_BELOW_CONSUMED_VALUE',
    'PO_BUDGET_BLOCK',
  ]) assert.match(contract, new RegExp(code));
  assert.match(contract, /Do not invent a larger public Module-9 business error vocabulary/);
});

// Freeze exactly the five documented Purchase Order domain events.
test('Pass 234 freezes the five reviewed Module 9 events', () => {
  for (const eventName of [
    'purchase_order.created',
    'purchase_order.submitted',
    'purchase_order.issued',
    'purchase_order.revised',
    'purchase_order.cancelled',
  ]) assert.match(contract, new RegExp(eventName.replaceAll('.', '\\.')));
  assert.match(contract, /Pass 234 does not emit events or create audit\/outbox records/);
});

// Do not add an undocumented fourth revision-line table or hide the history gap.
test('Pass 234 records the controlled revision-history gap', () => {
  assert.match(contract, /no revision-line snapshot table/);
  assert.match(contract, /does not add an undocumented fourth table/);
  assert.match(contract, /Foundation audit before\/after records remaining mandatory/);
  assert.match(contractGate, /revisionLineHistoryGapRecorded: true/);
});

// Keep cancellation reason as a source requirement while recording the missing durable field.
test('Pass 234 records the cancellation reason storage gap', () => {
  assert.match(contract, /cancel route requires a reason/);
  assert.match(contract, /does not define a `cancel_reason` column/);
  assert.match(contractGate, /cancellationReasonStorageGapRecorded: true/);
});

// Reserve only the reviewed React feature and keep downstream actions read-only until their owning modules exist.
test('Pass 234 freezes the later React Purchase Orders boundary', () => {
  assert.match(contract, /apps\/web\/src\/features\/purchase-orders\//);
  for (const ui of ['PO register', 'Draft editor', 'Approval timeline', 'Printable PO preview', 'Receipt/invoice progress', 'Commitment status']) {
    assert.match(contract, new RegExp(ui.replace('/', '\\/')));
  }
  assert.match(contract, /No React code is generated in Pass 234/);
});

// Register one fail-honest contract gate that can prepare persistence without activating Stage 14 runtime early.
test('Pass 234 registers the fail-honest Stage-14 contract gate', () => {
  assert.equal(
    rootPackage.scripts['module-9:contract:gate'],
    'node scripts/module-9/verify-stage-14-contract.mjs',
  );
  assert.match(contractGate, /STAGE_14_MODULE_9_CONTRACT_FROZEN_READY_FOR_PASS_235/);
  assert.match(contractGate, /STAGE_14_MODULE_9_CONTRACT_FROZEN_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(contractGate, /productionRuntimeActivationAllowed: passed && stage13LiveAccepted/);
  assert.match(contractGate, /persistencePreparationAllowed: passed/);
});

// Pass 234 remains the historical contract-only freeze after later reviewed Stage-14 layers are appended.
test('Pass 234 contract boundary remains intact after later reviewed Stage-14 layers are appended', async () => {
  assert.match(contract, /Pass 234 is contract-only/);
  assert.match(contract, /Pass 235 - Module 9 reviewed Prisma models, constraints, indexes and migration/);
  assert.match(contractGate, /productionFilesGenerated: false/);
  assert.match(contractGate, /databaseMigrationGenerated: false/);
  assert.match(prisma, /model\s+PurchaseOrder\s*\{/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.schema.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Pass 235 creates exactly the three source-defined Prisma models and no inferred fourth Purchase Order table.
test('Pass 235 keeps three source-defined Purchase Order models while Pass 365 adds one reviewed support snapshot model', () => {
  for (const model of ['PurchaseOrder', 'PurchaseOrderItem', 'PurchaseOrderRevision']) {
    assert.match(prisma, new RegExp(`model\\s+${model}\\s*\\{`));
  }
  assert.match(prisma, /model\s+PurchaseOrderRevisionItem\s*\{/);
  assert.doesNotMatch(migration, /CREATE TABLE "purchase_order_revision_items"/);
  assert.doesNotMatch(prisma, /model\s+DirectPurchaseException\s*\{/);
  assert.match(migration, /CREATE TABLE "purchase_orders"/);
  assert.match(migration, /CREATE TABLE "purchase_order_items"/);
  assert.match(migration, /CREATE TABLE "purchase_order_revisions"/);
});

// Enforce Company/Project ownership and the corrected Part-I Vendor master relationship.
test('Pass 235 enforces Company Project and Module 8 Vendor scope', () => {
  assert.match(prisma, /vendor\s+Vendor\s+@relation\(fields: \[vendorId, companyId\], references: \[id, companyId\]/);
  assert.match(migration, /purchase_orders_project_company_fkey/);
  assert.match(migration, /purchase_orders_vendor_company_fkey/);
  assert.match(migration, /FOREIGN KEY \("vendor_id", "company_id"\) REFERENCES "vendors"\("id", "company_id"\)/);
});

// quotation_id is a real Module-8 FK, with same Vendor/Company/Project-chain protection but no duplicated selection master.
test('Pass 235 enforces quotation relationship scope without duplicating selection state', () => {
  assert.match(prisma, /quotationId\s+String\?\s+@map\("quotation_id"\) @db\.Uuid/);
  assert.match(migration, /purchase_orders_quotation_fkey/);
  assert.match(migration, /module_9_validate_po_quotation_scope/);
  assert.match(migration, /quotation_vendor_id IS DISTINCT FROM NEW\."vendor_id"/);
  assert.match(migration, /quotation_company_id IS DISTINCT FROM NEW\."company_id"/);
  assert.match(migration, /quotation_project_id IS DISTINCT FROM NEW\."project_id"/);
  assert.match(contract, /does \*\*not\*\* invent a second selected-quotation table/);
});

// Costed PO lines must use one posting-enabled Module-6 Project cost combination.
test('Pass 235 validates Purchase Order line cost structure against Module 6', () => {
  assert.match(migration, /module_9_validate_po_item_cost_scope/);
  assert.match(migration, /FROM "project_cost_codes" mapping/);
  assert.match(migration, /mapping\."is_posting_allowed" = TRUE/);
  for (const fk of ['purchase_order_items_wbs_node_fkey', 'purchase_order_items_cost_code_fkey', 'purchase_order_items_cost_type_fkey']) {
    assert.match(migration, new RegExp(fk));
  }
});

// The future Module-10 item reference remains nullable and intentionally unenforced in Stage 14.
test('Pass 235 keeps item_id as a deferred nullable Module 10 reference', () => {
  assert.match(prisma, /itemId\s+String\?\s+@map\("item_id"\) @db\.Uuid/);
  assert.match(migration, /"item_id" UUID,/);
  assert.match(migration, /purchase_order_items_future_item_idx/);
  assert.doesNotMatch(migration, /FOREIGN KEY \("item_id"\)/);
  assert.match(persistenceGate, /inventoryItemForeignKeyDeferredUntilModule10: true/);
});

// Downstream receipt/invoice consumption starts at zero and cannot be browser-owned in this persistence pass.
test('Pass 235 initializes downstream consumption without adding downstream modules', () => {
  assert.match(prisma, /receivedQty\s+Decimal @default\(0\)/);
  assert.match(prisma, /invoicedAmount\s+Decimal @default\(0\)/);
  assert.match(migration, /"received_qty" DECIMAL\(18,4\) NOT NULL DEFAULT 0/);
  assert.match(migration, /"invoiced_amount" DECIMAL\(18,2\) NOT NULL DEFAULT 0/);
  assert.match(migration, /purchase_order_items_received_qty_nonnegative/);
  assert.match(persistenceGate, /receivedAndInvoicedConsumptionServerOwned: true/);
});

// Controlled revision history uses the source-defined header only and locks revision numbers inside a PO.
test('Pass 235 persists controlled revision headers without inventing revision-line tables', () => {
  assert.match(prisma, /@@unique\(\[purchaseOrderId, revisionNo\], map: "purchase_order_revisions_po_revision_uq"\)/);
  assert.match(migration, /purchase_order_revisions_revision_positive/);
  assert.match(migration, /module_9_validate_po_revision_creator_scope/);
  assert.doesNotMatch(migration, /CREATE TABLE "purchase_order_revision_items"/);
  assert.match(persistenceGate, /revisionLineHistoryTableInvented: false/);
});

// Preserve all explicitly frozen source gaps instead of solving them with undocumented persistence.
test('Pass 235 does not invent direct-purchase cancellation Finance approval or commitment columns', () => {
  for (const forbidden of [
    'direct_purchase', 'direct_purchase_reason', 'cancel_reason', 'approval_request_id',
    'commitment_id', 'journal_id', 'goods_receipt_id',
  ]) assert.doesNotMatch(migration, new RegExp(`"${forbidden}"`));
  assert.match(persistenceGate, /directPurchaseFieldsInvented: false/);
  assert.match(persistenceGate, /cancellationReasonColumnInvented: false/);
  assert.match(persistenceGate, /commitmentPersistenceChanged: false/);
  assert.match(persistenceGate, /financePersistenceChanged: false/);
});

// Persist exact decimals but do not invent the source-missing tax/rounding policy in the database.
test('Pass 235 preserves decimal precision without inventing a tax formula', () => {
  assert.match(prisma, /taxRate\s+Decimal @map\("tax_rate"\) @db\.Decimal\(18, 4\)/);
  assert.match(prisma, /lineTotal\s+Decimal @map\("line_total"\) @db\.Decimal\(18, 2\)/);
  assert.match(migration, /purchase_order_items_tax_rate_nonnegative/);
  assert.doesNotMatch(migration, /line_total"\s*=|subtotal"\s*=|total"\s*=\s*"subtotal"/);
  assert.match(persistenceGate, /taxFormulaInvented: false/);
});

// Register one Stage-14 persistence migration and the fail-honest Pass-235 gate.
test('Pass 235 registers migration and persistence gate', () => {
  assert.equal(rootPackage.scripts['module-9:persistence:gate'], 'node scripts/module-9/verify-stage-14-persistence.mjs');
  assert.match(persistenceGate, /20260824000400_module_9_purchase_orders_core/);
  assert.match(persistenceGate, /STAGE_14_MODULE_9_PERSISTENCE_READY_FOR_PASS_236/);
  assert.match(persistenceGate, /STAGE_14_MODULE_9_PERSISTENCE_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && stage13LiveAccepted/);
});

// Pass 235 remains the historical persistence-only checkpoint while later reviewed layers are appended.
test('Pass 235 remains persistence-only while later reviewed layers are appended', async () => {
  assert.match(contract, /Pass 235 implements only the reviewed Stage-14 persistence boundary|Pass 235 implements only the reviewed Stage-14 persistence layer/);
  assert.match(persistenceGate, /publicRoutesGenerated: false/);
  assert.match(persistenceGate, /repositoryGenerated: false/);
  assert.match(persistenceGate, /serviceGenerated: false/);
  assert.match(persistenceGate, /reactGenerated: false/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.schema.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Freeze the same eight reviewed routes and six named permissions at the Module-9 Zod boundary.
test('Pass 236 exports exactly the reviewed Purchase Order route and permission inventories', () => {
  for (const route of [
    '/api/v1/purchase-orders',
    '/api/v1/purchase-orders/:id',
    '/api/v1/purchase-orders/:id/submit',
    '/api/v1/purchase-orders/:id/issue',
    '/api/v1/purchase-orders/:id/revise',
    '/api/v1/purchase-orders/:id/cancel',
  ]) assert.match(schema, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  assert.doesNotMatch(schema, /purchase_orders\.cancel/);
  assert.match(schema, /MODULE_9_SOURCE_PERMISSION_CODES/);
  assert.match(schema, /purchase_orders\.direct_purchase/);
  assert.match(schemaGate, /reviewedRouteCount: 8/);
  assert.match(schemaGate, /reviewedPermissionCount: 6/);
});

// The list/search route gets only one Project filter, the explicit search intent and bounded pagination.
test('Pass 236 keeps Purchase Order register query narrow and Project-safe', () => {
  const query = schema.match(/export const listPurchaseOrdersQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(query, /search:\s*searchSchema\.optional\(\)/);
  assert.match(query, /projectId:\s*uuidSchema\.optional\(\)/);
  assert.match(query, /\.\.\.paginationQueryShape/);
  assert.doesNotMatch(query, /vendorId|status|orderDate|currency/);
  assert.match(schema, /MODULE_9_MAX_PAGE_SIZE = 100/);
  assert.match(schemaGate, /listFilters: \['search', 'projectId', 'page', 'pageSize'\]/);
});

// PO line input accepts only source-defined commercial/cost fields and excludes server-calculated or downstream state.
test('Pass 236 Purchase Order line schema keeps totals and consumption server-owned', () => {
  const line = schema.match(/export const purchaseOrderItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['itemId', 'description', 'quantity', 'unit', 'unitRate', 'taxRate', 'wbsNodeId', 'costCodeId', 'costTypeId']) {
    assert.match(line, new RegExp(`\\b${field}\\b`));
  }
  for (const forbidden of ['lineTotal', 'receivedQty', 'invoicedAmount', 'companyId', 'status']) {
    assert.doesNotMatch(line, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(line, /itemId:\s*uuidSchema\.nullable\(\)\.optional\(\)/);
});

// Pass 364 explicitly amends the historical Pass-236 quotation-only boundary without adding another route.
test('Pass 236 source create fields remain preserved while Pass 364 adds the narrow direct-purchase branch', () => {
  const body = schema.match(/export const createPurchaseOrderBodySchema =[\s\S]*?\]\);/)?.[0] ?? '';
  for (const field of ['projectId', 'vendorId', 'quotationId', 'orderDate', 'currency', 'deliveryAddress', 'terms', 'items']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(body, /z\.discriminatedUnion\('quotationId'/);
  assert.match(body, /quotationId:\s*uuidSchema/);
  assert.match(body, /quotationId:\s*z\.null\(\)/);
  assert.match(body, /directPurchaseReason:\s*directPurchaseReasonSchema/);
  for (const forbidden of ['poNo', 'status', 'subtotal', 'tax', 'total', 'actorUserId']) {
    assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(schemaGate, /quotationBackedCreateOnlyUntilDirectPurchaseContractResolved: true/);
});

// Draft PATCH remains partial and strict while preventing nullable-quotation bypass and server-owned writes.
test('Pass 236 draft update schema accepts only reviewed editable business fields', () => {
  const body = schema.match(/export const updatePurchaseOrderBodySchema =[\s\S]*?At least one editable Purchase Order field must be provided\.'/)?.[0] ?? '';
  for (const field of ['projectId', 'vendorId', 'quotationId', 'orderDate', 'currency', 'deliveryAddress', 'terms', 'items']) {
    assert.match(body, new RegExp(`\\b${field}\\b`));
  }
  assert.match(body, /quotationId:\s*uuidSchema\.optional\(\)/);
  assert.doesNotMatch(body, /quotationId:\s*uuidSchema\.nullable/);
  for (const forbidden of ['poNo', 'status', 'subtotal', 'lineTotal', 'receivedQty', 'invoicedAmount']) {
    assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`));
  }
});

// Submit and issue are commands with no browser-owned approval, status, total or commitment payload.
test('Pass 236 keeps submit and issue commands bodyless', () => {
  assert.match(schema, /submitPurchaseOrderBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.match(schema, /issuePurchaseOrderBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  const commands = [
    schema.match(/submitPurchaseOrderBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '',
    schema.match(/issuePurchaseOrderBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '',
  ].join('\n');
  assert.doesNotMatch(commands, /approval|status|total|commitment|currency/);
});

// Controlled revisions carry a reason plus commercial changes but cannot silently switch Project/Vendor/quotation identity.
test('Pass 236 revision schema narrows controlled changes and requires reason', () => {
  const body = schema.match(/export const revisePurchaseOrderBodySchema =[\s\S]*?A controlled revision must include at least one commercial change\.'/)?.[0] ?? '';
  assert.match(body, /reason:\s*reasonSchema/);
  for (const field of ['orderDate', 'currency', 'deliveryAddress', 'terms', 'items']) assert.match(body, new RegExp(`\\b${field}\\b`));
  for (const forbidden of ['projectId', 'vendorId', 'quotationId', 'revisionNo', 'approvedAt', 'totalBefore', 'totalAfter']) {
    assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(schemaGate, /revisionCanChangeProjectVendorOrQuotationIdentity: false/);
});

// Cancellation has its source-required reason but does not invent the missing authorization token or persistence field.
test('Pass 236 cancellation schema accepts reason only and preserves the permission gap', () => {
  const body = schema.match(/export const cancelPurchaseOrderBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(body, /reason:\s*reasonSchema/);
  assert.doesNotMatch(body, /permission|status|commitment|cancelledBy|cancelReason/);
  assert.match(schemaGate, /cancelPermissionInvented: false/);
  assert.match(schemaGate, /cancelReasonAccepted: true/);
  assert.match(schemaGate, /not a new Purchase Order persistence column/);
});

// Match Pass-235 database precision and sign constraints without inventing a tax percentage ceiling or calculation formula.
test('Pass 236 uses exact decimal strings without inventing tax policy', () => {
  assert.match(schema, /money must be a non-negative decimal string with at most 16 whole digits and 2 decimal places/);
  assert.match(schema, /quantity must be a positive decimal string with at most 14 whole digits and 4 decimal places/);
  assert.match(schema, /tax rate must be a non-negative decimal string with at most 5 whole digits and 4 decimal places/);
  assert.doesNotMatch(schema, /taxRate[^\n]*(max\(100\)|<=\s*100|<\s*100)/);
  assert.match(schemaGate, /taxPercentageRangeInvented: false/);
  assert.match(schemaGate, /taxCalculationFormulaInvented: false/);
  assert.match(schemaGate, /exactDecimalStringsUsed: true/);
});

// Status remains a generic read-only token and currency normalization does not create an FX/currency master.
test('Pass 236 does not invent PO lifecycle or currency-master vocabulary', () => {
  assert.match(schema, /statusTokenSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.doesNotMatch(schema, /purchaseOrderStatusSchema = z\.enum|enum\s+PurchaseOrderStatus/);
  assert.match(schema, /currencySchema = z\.string\(\)\.trim\(\)\.length\(3\)/);
  assert.match(schemaGate, /statusEnumInvented: false/);
  assert.match(schemaGate, /currencyMasterInvented: false/);
});

// Readback exposes receipt/invoice progress and controlled revisions without leaking Company/request authority.
test('Pass 236 response schemas expose reviewed PO progress and revision history safely', () => {
  const item = schema.match(/export const purchaseOrderItemResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(item, /receivedQty:\s*nonNegativeRateSchema/);
  assert.match(item, /invoicedAmount:\s*moneySchema/);
  const response = schema.match(/export const purchaseOrderResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(response, /items:\s*z\.array\(purchaseOrderItemResponseSchema\)/);
  assert.match(response, /revisions:\s*z\.array\(purchaseOrderRevisionResponseSchema\)/);
  assert.doesNotMatch(response, /companyId|actorUserId|permissions|allowedProjectIds/);
  assert.match(schemaGate, /responseIncludesConsumptionProgress: true/);
  assert.match(schemaGate, /responseIncludesRevisionHistory: true/);
});

// Revision response keeps server numbering/approval/actor fields as read-only output.
test('Pass 236 defines controlled revision readback with server-owned authority', () => {
  const response = schema.match(/export const purchaseOrderRevisionResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['revisionNo', 'reason', 'totalBefore', 'totalAfter', 'approvedAt', 'createdBy']) {
    assert.match(response, new RegExp(`\\b${field}\\b`));
  }
  assert.match(response, /approvedAt:\s*timestampSchema\.nullable\(\)/);
});

// The server-owned field inventory makes the later repository/service/route authority boundary auditable.
test('Pass 236 freezes server-owned Purchase Order request authority in one exported inventory', () => {
  for (const field of [
    'companyId', 'actorUserId', 'permissions', 'allowedProjectIds', 'poNo', 'status', 'subtotal', 'tax', 'total',
    'lineTotal', 'receivedQty', 'invoicedAmount', 'revisionNo', 'approvedAt', 'createdBy', 'commitmentId', 'approvalDecision',
  ]) assert.match(schema, new RegExp(`'${field}'`));
  assert.match(schemaGate, /serverOwnedTotalsAcceptedFromBrowser: false/);
  assert.match(schemaGate, /serverOwnedConsumptionAcceptedFromBrowser: false/);
});

// Export only the five reviewed Module-9 conflicts and map them through shared platform errors.
test('Pass 236 exposes only reviewed Module 9 business error codes', () => {
  for (const code of ['PO_NOT_FOUND', 'PO_NOT_APPROVED', 'PO_ALREADY_ISSUED', 'PO_REVISION_BELOW_CONSUMED_VALUE', 'PO_BUDGET_BLOCK']) {
    assert.match(schema, new RegExp(`'${code}'`));
  }
  assert.match(schema, /export function createModule9Error\(code: Module9ErrorCode\): AppError/);
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ConflictError/);
  assert.doesNotMatch(schema, /PO_CANCEL_FORBIDDEN|PO_DIRECT_PURCHASE_FORBIDDEN|PO_CURRENCY_MISMATCH/);
  assert.match(schemaGate, /reviewedErrorCount: 5/);
});

// Pass 236 remains the historical schema checkpoint while later reviewed layers are appended.
test('Pass 236 remains the schema checkpoint while later reviewed layers are appended', async () => {
  assert.equal(rootPackage.scripts['module-9:schema:gate'], 'node scripts/module-9/verify-stage-14-schema.mjs');
  assert.match(schemaGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(schemaGate, /STAGE_14_MODULE_9_SCHEMA_READY_FOR_PASS_237/);
  assert.match(schemaGate, /STAGE_14_MODULE_9_SCHEMA_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage13LiveAccepted/);
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
  assert.match(schemaGate, /Pass 237 - Module 9 Company\/Project-scoped repository/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Keep all five source-defined Purchase Order events visible for later service/outbox work without emitting them in the schema pass.
test('Pass 236 freezes all five Purchase Order event names without runtime emission', () => {
  for (const event of [
    'purchase_order.created', 'purchase_order.submitted', 'purchase_order.issued',
    'purchase_order.revised', 'purchase_order.cancelled',
  ]) assert.match(schema, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(schemaGate, /reviewedEventCount: 5/);
  assert.doesNotMatch(schema, /outbox\.publish|outbox\.enqueue|audit\.record/);
});


// Pass 237 remains the reviewed repository checkpoint after later reviewed layers are appended.
test('Pass 237 repository boundary remains intact after later reviewed layers are appended', async () => {
  assert.match(repository, /export class PurchaseOrdersRepository/);
  assert.match(repository, /DatabaseClient \| TransactionClient/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.repository.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Company ownership must come from trusted request scope and list/detail reads must accept explicit Project visibility.
test('Pass 237 scopes Purchase Order reads by Company and allowed Project visibility', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /PurchaseOrderProjectVisibilityRepositoryInput/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /buildProjectVisibilityWhere/);
  assert.match(repository, /async listPurchaseOrders/);
  assert.match(repository, /async findPurchaseOrderById/);
  assert.match(repositoryGate, /projectVisibilityRequiredForProjectScopedReads: true/);
});

// The list query remains bounded and the vague source search intent is kept narrow instead of inventing filters.
test('Pass 237 keeps PO register pagination bounded and search limited to PO number', () => {
  assert.match(repository, /MODULE_9_MAX_PAGE_SIZE/);
  assert.match(repository, /assertPageWindow/);
  assert.match(repository, /poNo: \{/);
  assert.match(repository, /contains: search/);
  assert.match(repositoryGate, /registerSearchLimitedToPoNumber: true/);
  assert.doesNotMatch(repository, /deliveryAddress:\s*\{\s*contains:/);
});

// State-sensitive writes have explicit Project/PO row locks while lifecycle decisions remain for the service.
test('Pass 237 prepares concurrency locks without moving lifecycle policy into repository', () => {
  assert.match(repository, /async lockProjectForPurchaseOrderWrite/);
  assert.match(repository, /async lockPurchaseOrderForWrite/);
  assert.match(repository, /FOR UPDATE/);
  assert.match(repository, /async updatePurchaseOrderStatus/);
  assert.match(repositoryGate, /purchaseOrderLifecycleDecidedInRepository: false/);
});

// Module 8 remains authoritative for Vendor and quotation reads and this repository never mutates Vendor or quotation state.
test('Pass 237 reuses Module 8 Vendor and quotation authority read-only', () => {
  assert.match(repository, /async findVendorById/);
  assert.match(repository, /async findSupplierQuotationById/);
  assert.match(repository, /rfq:\s*\{[\s\S]*projectId,[\s\S]*companyId: scope\.companyId/);
  assert.doesNotMatch(repository, /this\.db\.vendor\.(create|update|delete|upsert)/);
  assert.doesNotMatch(repository, /this\.db\.supplierQuotation\.(create|update|delete|upsert)/);
  assert.match(repositoryGate, /module8VendorWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /quotationSelectionDecisionMadeInRepository: false/);
});

// PO lines must resolve through posting-enabled Module-6 Project cost mappings before persistence.
test('Pass 237 prepares posting-enabled cost-structure validation', () => {
  assert.match(repository, /async findPostingCostStructures/);
  assert.match(repository, /this\.db\.projectCostCode\.findMany/);
  assert.match(repository, /isPostingAllowed: true/);
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId']) assert.match(repository, new RegExp(field));
  assert.match(repositoryGate, /postingCombinationValidationPrepared: true/);
});

// Draft creation and replacement persist service-calculated totals only; the repository does not calculate money or status policy.
test('Pass 237 persists server-reviewed PO data without calculating totals in repository', () => {
  assert.match(repository, /async createPurchaseOrder/);
  assert.match(repository, /async replacePurchaseOrder/);
  for (const field of ['subtotal: input.subtotal', 'tax: input.tax', 'total: input.total']) {
    assert.ok(repository.includes(field), `Missing server-reviewed field: ${field}`);
  }
  assert.match(repositoryGate, /purchaseOrderTotalsCalculatedInRepository: false/);
  assert.doesNotMatch(repository, /quantityRateToMinorUnits|calculate.*Tax|calculate.*Total/);
});

// Controlled revision persistence gets a lock-safe next-number primitive and creator Company scope but no invented revision-line table.
test('Pass 237 keeps its original revision primitive while Pass 365 adds reviewed immutable line snapshots', () => {
  assert.match(repository, /async findNextRevisionNumber/);
  assert.match(repository, /_max: \{ revisionNo: true \}/);
  assert.match(repository, /async createPurchaseOrderRevision/);
  assert.match(repository, /this\.db\.user\.findFirst/);
  assert.match(repository, /purchaseOrderRevisionItem\.createMany/);
  assert.match(repositoryGate, /revisionBusinessRulesAppliedInRepository: false/);
});

// Module 7 source-derived commitments are exposed only as transaction primitives; exact source/status policy remains unresolved.
test('Pass 237 prepares Module 7 commitment adapter primitives without inventing source tokens', () => {
  assert.match(repository, /async listCostCommitmentsBySource/);
  assert.match(repository, /async upsertCostCommitment/);
  assert.match(repository, /this\.db\.costCommitment\.upsert/);
  assert.match(repository, /companyId_projectId_sourceType_sourceId_sourceLineId/);
  assert.match(repository, /isPostingAllowed: true/);
  assert.match(repositoryGate, /module7CommitmentUpsertPrimitivePrepared: true/);
  assert.match(repositoryGate, /commitmentSourceTypeInvented: false/);
  assert.match(repositoryGate, /commitmentStatusVocabularyInvented: false/);
  assert.doesNotMatch(repository, /const\s+PURCHASE_ORDER_COMMITMENT_SOURCE_TYPE/);
});

// Stage 14 still defers Finance, Inventory receipt writes, cancel permission and direct-purchase permission decisions.
test('Pass 237 does not cross unresolved or downstream Module 9 boundaries', () => {
  assert.doesNotMatch(repository, /journal\.(create|update|upsert)|payable\.(create|update|upsert)/);
  assert.doesNotMatch(repository, /goodsReceipt\.(create|update|upsert)|inventoryBalance\.(create|update|upsert)/);
  assert.doesNotMatch(repository, /purchase_orders\.cancel|purchase_orders\.direct_purchase/);
  assert.match(repositoryGate, /financeWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /inventoryReceiptWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /cancelPermissionInvented: false/);
  assert.match(repositoryGate, /directPurchasePermissionInvented: false/);
});

// Register the fail-honest Pass-237 repository gate and preserve the Stage-13 live handoff blocker.
test('Pass 237 registers the Stage-14 repository gate', () => {
  assert.equal(rootPackage.scripts['module-9:repository:gate'], 'node scripts/module-9/verify-stage-14-repository.mjs');
  assert.match(repositoryGate, /STAGE_14_MODULE_9_REPOSITORY_READY_FOR_PASS_238/);
  assert.match(repositoryGate, /STAGE_14_MODULE_9_REPOSITORY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage13LiveAccepted/);
});


// Pass 238 remains the reviewed service checkpoint after Pass 239 appends HTTP without React.
test('Pass 238 service checkpoint remains intact after later reviewed layers are appended', async () => {
  assert.match(service, /export class PurchaseOrdersService/);
  assert.match(repository, /async updatePurchaseOrderCommercialHeader/);
  assert.match(repository, /without deleting\/recreating line IDs or downstream consumption state/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.service.ts');
  await access('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Project permissions are revalidated through Module 24B for all read/write operations.
test('Pass 238 revalidates Project resource policy and maps cancel to the closest reviewed permission', () => {
  assert.match(service, /private async requireProjectPermission/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
  ]) assert.match(service, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(service, /cancelPurchaseOrder[\s\S]*?'purchase_orders\.revise'/);
  assert.doesNotMatch(service, /purchase_orders\.cancel/);
  assert.match(service, /purchase_orders\.direct_purchase/);
  assert.match(serviceGate, /cancelPermissionInvented: false/);
});

// The normal Stage-14 path must reuse the selected Module-8 quotation/Vendor authority.
test('Pass 238 requires the selected qualified Module 8 quotation chain', () => {
  assert.match(service, /private async requireSelectedQuotation/);
  assert.match(service, /VENDOR_ACTIVE = 'ACTIVE'/);
  assert.match(service, /VENDOR_QUALIFIED = 'QUALIFIED'/);
  assert.match(service, /QUOTATION_SELECTED = 'SELECTED'/);
  assert.match(service, /RFQ_SELECTED = 'SELECTED'/);
  assert.match(service, /quotation\.vendorId !== vendorId/);
  assert.match(service, /requireQuotationTotal/);
  assert.match(serviceGate, /normalCreatePathQuotationBackedOnly: true/);
  assert.match(serviceGate, /directPurchasePathStillBlocked: true/);
});

// PO numbers and all money values are server-owned and calculated without floating-point arithmetic.
test('Pass 238 prepares concurrency-safe numbering and exact server PO calculations', () => {
  assert.match(service, /PURCHASE_ORDER_SEQUENCE_KEY = 'purchase-order'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: PURCHASE_ORDER_SEQUENCE_KEY \}\)/);
  assert.match(service, /function prepareCommercials/);
  assert.match(service, /function calculateLine/);
  assert.match(service, /BigInt/);
  assert.match(service, /divideRoundHalfUp/);
  assert.match(service, /TAX_PRODUCT_TO_MINOR_UNITS_DIVISOR/);
  assert.doesNotMatch(service, /parseFloat|Number\(item\.quantity\)|Math\.round/);
  assert.match(serviceGate, /taxCalculationInferenceExplicit: true/);
  assert.match(serviceGate, /lineTotalIncludesTax: true/);
});

// The source leaves budget thresholds undefined, so the service only enforces the reviewed frozen-budget readiness boundary.
test('Pass 238 enforces a frozen Module 7 budget without inventing amount thresholds', () => {
  assert.match(service, /BUDGET_FROZEN = 'FROZEN'/);
  assert.match(service, /findLatestProjectBudgetByStatus\(projectId, BUDGET_FROZEN\)/);
  assert.match(service, /createModule9Error\('PO_BUDGET_BLOCK'\)/);
  assert.doesNotMatch(service, /budgetTolerance|overBudgetPercent|approvalThreshold/);
  assert.match(serviceGate, /no amount threshold\/tolerance invented/);
});

// Submission must use Module 22 and must not silently bypass approval when configuration is absent.
test('Pass 238 submits Purchase Orders through Module 22 Approval Workflows', () => {
  assert.match(service, /purchaseOrderApprovalDefinitionCode/);
  assert.match(service, /requestApprovalInTransaction/);
  assert.match(service, /resourceType: 'purchase_order'/);
  assert.match(service, /sourceType: 'purchase-order-submit'/);
  assert.match(service, /Purchase Order approval workflow is not configured/);
  assert.match(serviceGate, /purchaseOrderApprovalUsesModule22: true/);
  assert.match(serviceGate, /purchaseOrderApprovalConfigurationRequired: true/);
});

// Issue must require approval and update Module-7 commitment rows inside the same owning transaction.
test('Pass 238 issues only approved POs and creates atomic source-keyed Module 7 commitments', () => {
  assert.match(service, /async issuePurchaseOrder/);
  assert.match(service, /if \(approval\.status !== 'APPROVED'\) throw createModule9Error\('PO_NOT_APPROVED'\)/);
  assert.match(service, /COMMITMENT_SOURCE_TYPE = 'purchase_order'/);
  assert.match(service, /sourceLineId: item\.id/);
  assert.match(service, /originalAmount: amount/);
  assert.match(service, /remainingAmount: amount/);
  assert.match(service, /await this\.writeActiveCommitments\(repository, new WbsCostCodesRepository\(tx\), issued, false\)/);
  assert.match(serviceGate, /issueCommitmentsAtomicWithPoIssue: true/);
});

// Controlled revisions preserve issued history, audit line/rate changes and do not reset consumed downstream rows.
test('Pass 238 guards controlled revision against consumed lines and preserves header-only line identity', () => {
  assert.match(service, /async revisePurchaseOrder/);
  assert.match(service, /hasDownstreamConsumption\(before\.items\)/);
  assert.match(service, /PO_REVISION_BELOW_CONSUMED_VALUE/);
  assert.match(service, /updatePurchaseOrderCommercialHeader/);
  assert.match(service, /createPurchaseOrderRevision/);
  assert.match(service, /approvedAt: now/);
  assert.match(service, /purchaseOrderAuditSnapshot\(before\)/);
  assert.match(serviceGate, /consumedLineReplacementPolicy:/);
  assert.match(serviceGate, /freshRevisionApprovalWorkflowInvented: false/);
});

// Issued currency changes remain blocked because the source defines no FX/approved-currency conversion contract.
test('Pass 238 keeps issued currency revision fail-closed without inventing FX', () => {
  assert.match(service, /Issued Purchase Order currency cannot be revised until an approved FX\/currency contract exists/);
  assert.doesNotMatch(service, /exchangeRate|fxRate|currencyConversion/);
  assert.match(serviceGate, /issuedCurrencyRevisionBlockedUntilApprovedFxContract: true/);
});

// Cancellation still zeros commitment atomically; Pass 365 additionally persists reason/actor/time evidence.
test('Pass 238 cancellation remains atomic while Pass 365 adds durable cancellation evidence', () => {
  assert.match(service, /async cancelPurchaseOrder/);
  assert.match(service, /private async cancelRemainingCommitments/);
  assert.match(service, /remainingAmount: '0\.00'/);
  assert.match(service, /COMMITMENT_CANCELLED = 'CANCELLED'/);
  assert.match(service, /reason: cancelled\.cancelReason/);
  assert.match(serviceGate, /cancellationReasonStoredInAuditOutboxOnly: true/);
  assert.match(repository, /cancelReason: input\.reason/);
  assert.match(repository, /cancelledAt: input\.cancelledAt/);
  assert.match(repository, /cancelledBy: input\.cancelledBy/);
});

// All five reviewed Purchase Order events are emitted transactionally, with no undocumented sixth domain event.
test('Pass 238 prepares exactly the five reviewed Purchase Order outbox events', () => {
  for (const event of [
    'purchase_order.created', 'purchase_order.submitted', 'purchase_order.issued',
    'purchase_order.revised', 'purchase_order.cancelled',
  ]) assert.match(service, new RegExp(`eventType: '${event.replaceAll('.', '\\.')}|'${event.replaceAll('.', '\\.')}'`));
  assert.match(serviceGate, /reviewedOutboxEventsPrepared:/);
  assert.doesNotMatch(service, /eventType: 'purchase_order\.updated'/);
});

// No downstream Finance/AP, Inventory receipt or cost-actual writes are allowed in Stage 14.
test('Pass 238 does not cross Finance Inventory or actual-cost ownership boundaries', () => {
  assert.doesNotMatch(service, /journal\.(create|update|upsert)|payable\.(create|update|upsert)/);
  assert.doesNotMatch(service, /goodsReceipt\.(create|update|upsert)|inventoryBalance\.(create|update|upsert)/);
  assert.doesNotMatch(service, /costActual\.(create|update|upsert)/);
  assert.match(serviceGate, /financeWritesGenerated: false/);
  assert.match(serviceGate, /inventoryReceiptWritesGenerated: false/);
});

// Register the fail-honest Pass-238 service gate and preserve the preceding live handoff blocker.
test('Pass 238 registers the Stage-14 service gate', () => {
  assert.equal(rootPackage.scripts['module-9:service:gate'], 'node scripts/module-9/verify-stage-14-service.mjs');
  assert.match(serviceGate, /STAGE_14_MODULE_9_SERVICE_READY_FOR_PASS_239/);
  assert.match(serviceGate, /STAGE_14_MODULE_9_SERVICE_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage13LiveAccepted/);
});


// Add only the reviewed HTTP/OpenAPI/module-registration layer in Pass 239.
test('Pass 239 HTTP boundary remains intact after the reviewed React layer is appended', async () => {
  assert.match(routes, /registerPurchaseOrdersRoutes/);
  assert.match(moduleIndex, /registerPurchaseOrdersRoutes/);
  assert.match(contract, /Pass 239 adds only the Fastify HTTP\/OpenAPI\/module-registration layer/);
  await access('apps/api/src/modules/purchase-orders/purchase-orders.routes.ts');
  await access('apps/api/src/modules/purchase-orders/index.ts');
  await access('apps/web/src/features/purchase-orders/pages/purchase-orders-page.tsx');
});

// Register exactly the eight reviewed method/path pairs and no generic/downstream endpoints.
test('Pass 239 registers exactly the eight frozen Module 9 HTTP operations', () => {
  const expected = [
    ['get', '/api/v1/purchase-orders'],
    ['post', '/api/v1/purchase-orders'],
    ['get', '/api/v1/purchase-orders/:id'],
    ['patch', '/api/v1/purchase-orders/:id'],
    ['post', '/api/v1/purchase-orders/:id/submit'],
    ['post', '/api/v1/purchase-orders/:id/issue'],
    ['post', '/api/v1/purchase-orders/:id/revise'],
    ['post', '/api/v1/purchase-orders/:id/cancel'],
  ];
  for (const [method, route] of expected) {
    assert.ok(routes.includes(`app.${method}('${route}'`), `${method.toUpperCase()} ${route}`);
  }
  assert.equal((routes.match(/app\.(?:get|post|put|patch|delete)\('/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /\/api\/v1\/purchase-orders\/:id\/delete|app\.delete\(/);
  assert.doesNotMatch(routes, /\/api\/v1\/purchase-orders\/direct-purchase|goods-receipts|invoices|journals|payables/);
});

// Every operation authenticates while exact Project permission evaluation stays service-authoritative.
test('Pass 239 authenticates every route and preserves service-authoritative Project permissions', () => {
  assert.equal((routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length, 8);
  assert.equal((routes.match(/security: BEARER_SECURITY/g) ?? []).length, 8);
  assert.doesNotMatch(routes, /hasPermission|requireRoutePermission/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(httpGate, /projectPermissionRemainsServiceAuthoritative: true/);
});

// Reparse all query/params/body segments through the frozen Pass-236 Zod boundary.
test('Pass 239 keeps strict Zod validation at the HTTP boundary', () => {
  for (const zodSchema of [
    'listPurchaseOrdersQuerySchema',
    'createPurchaseOrderBodySchema',
    'purchaseOrderIdParamsSchema',
    'updatePurchaseOrderBodySchema',
    'submitPurchaseOrderBodySchema',
    'issuePurchaseOrderBodySchema',
    'revisePurchaseOrderBodySchema',
    'cancelPurchaseOrderBodySchema',
  ]) assert.match(routes, new RegExp(`parseRequest\\(${zodSchema}`));
  assert.match(routes, /request\.body \?\? \{\}/);
  assert.match(routes, /additionalProperties: false/);
});

// Validate all success DTOs through the existing response schemas before serialization.
test('Pass 239 validates every success response through the Pass 236 schemas', () => {
  for (const responseSchema of [
    'listPurchaseOrdersResponseSchema',
    'createPurchaseOrderResponseSchema',
    'getPurchaseOrderResponseSchema',
    'updatePurchaseOrderResponseSchema',
    'submitPurchaseOrderResponseSchema',
    'issuePurchaseOrderResponseSchema',
    'revisePurchaseOrderResponseSchema',
    'cancelPurchaseOrderResponseSchema',
  ]) assert.match(routes, new RegExp(`${responseSchema}\\.parse`));
  assert.match(httpGate, /responseZodValidationRetained: true/);
});

// Keep commercial decimals as strings and all computed/consumed values out of request bodies.
test('Pass 239 documents exact decimal strings and server-owned PO values', () => {
  assert.match(routes, /const MONEY_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  assert.match(routes, /const QUANTITY_RATE_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  assert.match(routes, /const TAX_RATE_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  const requestSections = [...routes.matchAll(/operationId: 'module9[^']+'[\s\S]*?response:/g)]
    .map((match) => match[0])
    .join('\n');
  for (const field of [
    'companyId', 'actorUserId', 'poNo', 'status', 'subtotal', 'tax', 'total',
    'lineTotal', 'receivedQty', 'invoicedAmount', 'revisionNo', 'approvedAt',
    'createdBy', 'commitmentId', 'approvalDecision',
  ]) assert.doesNotMatch(requestSections, new RegExp(`\\b${field}\\s*:`));
  assert.match(httpGate, /exactDecimalOpenApiSerialization: true/);
});

// Pass 364 keeps the same POST route while exposing the narrow quotation/direct-purchase body alternatives.
test('Pass 239 route count remains frozen while Pass 364 amends the create request shape', () => {
  const createOperation = routes.match(/operationId: 'module9CreatePurchaseOrder'[\s\S]*?response:/)?.[0] ?? '';
  assert.match(createOperation, /oneOf:/);
  assert.match(createOperation, /quotationId: UUID_JSON_SCHEMA/);
  assert.match(createOperation, /quotationId: \{ type: 'null' \}/);
  assert.match(createOperation, /directPurchaseReason/);
  assert.match(httpGate, /directPurchaseRouteAdded: false/);
});

// Submit/issue remain bodyless commands; revise/cancel expose only source-reviewed command fields.
test('Pass 239 keeps explicit PO command bodies narrow', () => {
  assert.equal((routes.match(/body: \{ type: 'object', additionalProperties: false \}/g) ?? []).length, 2);
  const reviseOperation = routes.match(/operationId: 'module9RevisePurchaseOrder'[\s\S]*?response:/)?.[0] ?? '';
  assert.match(reviseOperation, /required: \['reason'\]/);
  assert.match(reviseOperation, /anyOf:/);
  assert.doesNotMatch(reviseOperation, /projectId:|vendorId:|quotationId:/);
  const cancelOperation = routes.match(/operationId: 'module9CancelPurchaseOrder'[\s\S]*?response:/)?.[0] ?? '';
  assert.match(cancelOperation, /required: \['reason'\]/);
  assert.doesNotMatch(cancelOperation, /cancelPermission|purchase_orders\.cancel/);
});

// Keep only source-reviewed Module-9 business conflicts plus established shared Foundation errors.
test('Pass 239 documents the reviewed Module 9 error vocabulary without inventing business codes', () => {
  for (const code of [
    'PO_NOT_FOUND', 'PO_NOT_APPROVED', 'PO_ALREADY_ISSUED',
    'PO_REVISION_BELOW_CONSUMED_VALUE', 'PO_BUDGET_BLOCK',
  ]) assert.match(routes, new RegExp(code));
  for (const shared of [
    'INVALID_REQUEST', 'INVALID_COST_STRUCTURE', 'AUTHENTICATION_REQUIRED',
    'AUTH_SESSION_EXPIRED', 'FORBIDDEN', 'RESOURCE_NOT_FOUND', 'INTERNAL_SERVER_ERROR',
  ]) assert.match(routes, new RegExp(shared));
  assert.doesNotMatch(routes, /PO_CANCEL_NOT_ALLOWED|DIRECT_PURCHASE_FORBIDDEN|PO_VENDOR_INVALID|PO_CURRENCY_INVALID/);
});

// Publish Module 9 after Module 8 and pass only the server-owned approval configuration.
test('Pass 239 exports and registers the Module 9 Fastify plugin', () => {
  assert.match(moduleIndex, /export \{ PurchaseOrdersRepository \} from '\.\/purchase-orders\.repository\.js'/);
  assert.match(moduleIndex, /export \{ PurchaseOrdersService \} from '\.\/purchase-orders\.service\.js'/);
  assert.match(moduleIndex, /export \{ registerPurchaseOrdersRoutes \} from '\.\/purchase-orders\.routes\.js'/);
  assert.match(app, /import \{ registerPurchaseOrdersRoutes \} from '\.\/modules\/purchase-orders\/index\.js'/);
  assert.match(app, /app\.register\(registerProcurementRoutes,[\s\S]*app\.register\(registerPurchaseOrdersRoutes/);
  assert.match(app, /purchaseOrderApprovalDefinitionCode\?: string \| null/);
  assert.match(routes, /purchaseOrderApprovalDefinitionCode: options\.purchaseOrderApprovalDefinitionCode \?\? null/);
  assert.match(app, /purchaseOrderApprovalDefinitionCode: options\.purchaseOrderApprovalDefinitionCode \?\? null/);
});

// Give all eight reviewed operations stable OpenAPI IDs and one consistent module tag.
test('Pass 239 prepares eight stable Module 9 OpenAPI operations', () => {
  for (const operationId of [
    'module9ListPurchaseOrders', 'module9CreatePurchaseOrder', 'module9GetPurchaseOrder',
    'module9UpdatePurchaseOrder', 'module9SubmitPurchaseOrder', 'module9IssuePurchaseOrder',
    'module9RevisePurchaseOrder', 'module9CancelPurchaseOrder',
  ]) assert.match(routes, new RegExp(operationId));
  assert.equal((routes.match(/tags: \['Module 9 - Purchase Orders'\]/g) ?? []).length, 8);
  assert.match(httpGate, /openApiOperationsPrepared: true/);
});

// Register the fail-honest Pass-239 gate and stop at integration/security next.
test('Pass 239 HTTP gate is registered and points only to Pass 240', () => {
  assert.equal(rootPackage.scripts['module-9:http:gate'], 'node scripts/module-9/verify-stage-14-http.mjs');
  assert.match(httpGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(httpGate, /STAGE_14_MODULE_9_HTTP_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /STAGE_14_MODULE_9_HTTP_READY_FOR_PASS_240/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage13LiveAccepted/);
  assert.match(httpGate, /exactReviewedRouteCount: 8/);
  assert.match(httpGate, /directPurchaseRouteAdded: false/);
  assert.match(httpGate, /financePostingRoutesAdded: 0/);
  assert.match(httpGate, /inventoryReceiptRoutesAdded: 0/);
  assert.match(httpGate, /Pass 240 - Module 9 PostgreSQL\/Fastify integration/);
  assert.match(contract, /Pass 240 - Module 9 PostgreSQL\/Fastify integration/);
});


// Prepare the real Stage-14 PO workflow over Fastify, Prisma and PostgreSQL without changing production runtime code.
test('Pass 240 prepares end-to-end Purchase Order issue, revision, cancel and commitment coverage', () => {
  for (const fragment of [
    'Module 9 PostgreSQL/Fastify workflow covers draft, approval, issue, revision, cancellation and Module-7 commitments',
    '/api/v1/purchase-orders',
    '/submit',
    '/issue',
    '/revise',
    '/cancel',
    'purchase_order.created',
    'purchase_order.submitted',
    'purchase_order.issued',
    'purchase_order.revised',
    'purchase_order.cancelled',
  ]) assert.ok(integrationTest.includes(fragment), fragment);
  assert.match(integrationTest, /costCommitment\.findMany/);
  assert.match(integrationTest, /sourceType: 'purchase_order'/);
  assert.match(integrationTest, /remainingAmount\.toString\(\), '315'/);
  assert.match(integrationTest, /remainingAmount\.toString\(\) === '0'/);
});

// Keep Module 22 approval authoritative and verify retry-safe issue behavior before commitment consumption exists.
test('Pass 240 prepares Approval Workflow and issue replay-safety verification', () => {
  assert.match(integrationTest, /purchaseOrderApprovalDefinitionCode: 'PURCHASE_ORDER'/);
  assert.match(integrationTest, /resourceType: 'purchase_order'/);
  assert.match(integrationTest, /payload: \{ action: 'APPROVE'/);
  assert.match(integrationTest, /approvalAction\.count/);
  assert.match(integrationTest, /eventType: 'purchase_order\.issued'/);
  assert.match(integrationTest, /\}\), 1\);/);
});

// Cover authentication, Project permission, tenant isolation, closed Project and server-owned request authority.
test('Pass 240 prepares negative security and budget-readiness coverage', () => {
  for (const token of [
    'module9-reader@example.test',
    'module9-admin-b@example.test',
    'FORBIDDEN',
    'PO_NOT_FOUND',
    'PO_BUDGET_BLOCK',
    'INVALID_REQUEST',
    'CLOSED_PROJECT_ID',
    "poNo: 'ATTACK-PO'",
  ]) assert.match(integrationTest, new RegExp(token.replaceAll('.', '\\.')));
  assert.match(integrationTest, /companyId: COMPANY_B_ID/);
  assert.match(integrationTest, /actorUserId: ADMIN_B_ID/);
});

// Keep Vendor/quotation and commercial totals server-authoritative while covering the reviewed Pass 364 exception.
test('Pass 364 covers selected quotation validation and authorized direct purchase', () => {
  assert.match(integrationTest, /VENDOR_INACTIVE_ID/);
  assert.match(integrationTest, /UNSELECTED_QUOTATION_ID/);
  assert.match(integrationTest, /quotationId: null/);
  assert.match(integrationTest, /directPurchaseReason/);
  assert.match(integrationTest, /payloadSnapshot\.directPurchaseReason/);
  assert.match(integrationTest, /payloadSnapshot\.purchaseSource/);
  assert.match(integrationTest, /subtotal, '200\.00'/);
  assert.match(integrationTest, /tax, '10\.00'/);
  assert.match(integrationTest, /total, '210\.00'/);
});

// Attack the three Stage-14 database scope protections directly instead of relying only on application validation.
test('Pass 240 prepares direct PostgreSQL scope-trigger verification', () => {
  assert.match(integrationTest, /purchaseOrder\.create/);
  assert.match(integrationTest, /purchaseOrderItem\.create/);
  assert.match(integrationTest, /purchaseOrderRevision\.create/);
  assert.match(integrationTest, /VENDOR_ALT_ID/);
  assert.match(integrationTest, /WBS_B_ID/);
  assert.match(integrationTest, /createdBy: ADMIN_B_ID/);
  assert.equal((integrationTest.match(/assert\.rejects/g) ?? []).length >= 3, true);
});

// Lock generated OpenAPI to the exact eight reviewed operations and keep downstream modules out of Module 9.
test('Pass 240 live OpenAPI verification checks exactly eight Module 9 operations and forbidden surfaces', () => {
  for (const operationId of [
    'module9ListPurchaseOrders', 'module9CreatePurchaseOrder', 'module9GetPurchaseOrder',
    'module9UpdatePurchaseOrder', 'module9SubmitPurchaseOrder', 'module9IssuePurchaseOrder',
    'module9RevisePurchaseOrder', 'module9CancelPurchaseOrder',
  ]) assert.match(integrationTest, new RegExp(operationId));
  assert.match(integrationTest, /documented\.sort\(\), actual\.sort\(\)/);
  assert.match(integrationTest, /direct-purchase/);
  assert.match(integrationTest, /\/receipt/);
  assert.match(integrationTest, /\/invoice/);
  assert.match(integrationTest, /\/post-finance/);
  assert.match(integrationTest, /\/commitments/);
  assert.match(integrationTest, /queryNames, \['page', 'pageSize', 'projectId', 'search'\]/);
});

// Stage 14 must not post Finance journals even though PO issue creates a Module-7 purchasing commitment.
test('Pass 240 preserves the Finance and Inventory ownership boundaries', () => {
  assert.match(integrationTest, /journal\.count/);
  assert.match(integrationTest, /assert\.equal\(journals, 0\)/);
  assert.match(integrationSecurityGate, /financePostingWritesAdded: 0/);
  assert.match(integrationSecurityGate, /inventoryReceiptWritesAdded: 0/);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /databaseChanges: 0/);
  assert.match(integrationSecurityGate, /newMigrations: 0/);
});

// Register guarded static/live verification and advance only to React after genuine Stage-13 live handoff.
test('Pass 240 integration-security gate is fail-honest and points only to Pass 241', () => {
  assert.match(rootPackage.scripts['test:integration:module-9'], /RUN_FOUNDATION_DB_TESTS/);
  assert.match(rootPackage.scripts['test:integration:module-9'], /tests\/integration\/module-9-api\.integration\.test\.mjs/);
  assert.equal(rootPackage.scripts['module-9:integration-security:gate'], 'node scripts/module-9/verify-stage-14-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-9:integration-security:gate:live'], 'node scripts/module-9/verify-stage-14-integration-security.mjs --mode=live');
  assert.match(integrationSecurityGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(integrationSecurityGate, /STAGE_13_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_14_MODULE_9_INTEGRATION_SECURITY_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage13LiveAccepted/);
  assert.match(integrationSecurityGate, /Pass 241 - Module 9 React Purchase Orders/);
  assert.match(contract, /Pass 241 - Module 9 React Purchase Orders/);
});

// Pass 241 must expose only the eight reviewed Purchase Order operations to the browser.
test('Pass 241 browser API maps exactly the eight reviewed Module 9 operations', () => {
  for (const functionName of [
    'listPurchaseOrders', 'createPurchaseOrder', 'getPurchaseOrder', 'updatePurchaseOrder',
    'submitPurchaseOrder', 'issuePurchaseOrder', 'revisePurchaseOrder', 'cancelPurchaseOrder',
  ]) assert.match(webApi, new RegExp(`export function ${functionName}\\b`));
  assert.equal((webApi.match(/authenticatedRequest<PurchaseOrder/g) ?? []).length, 8);
  assert.doesNotMatch(webApi, /purchase-orders\/[^`'"}]+\/(?:receipt|invoice|approve|reject|direct-purchase|commitments)/);
});

// TanStack Query owns all server state while existing Module 22 and Module 7 reads are reused instead of new APIs.
test('Pass 241 hooks reuse TanStack Query plus existing Approval and job-cost contracts', () => {
  assert.match(webHooks, /from '@tanstack\/react-query'/);
  assert.match(webHooks, /listApprovalInbox/);
  assert.match(webHooks, /getApprovalRequest/);
  assert.match(webHooks, /resourceType: 'purchase_order'/);
  assert.match(webHooks, /getJobCostLedger/);
  assert.match(webHooks, /item\.recordType === 'COMMITMENT'/);
  assert.match(webHooks, /item\.sourceType === 'purchase_order'/);
  assert.match(webHooks, /item\.sourceId === purchaseOrderId/);
  assert.equal((webHooks.match(/return useMutation\(/g) ?? []).length, 6);
});

// Forms must use React Hook Form + Zod and keep commercial decimal values as strings.
test('Pass 241 draft and command forms use RHF plus Zod with exact decimal strings', () => {
  assert.match(webWorkspace, /useFieldArray/);
  assert.match(webWorkspace, /useForm/);
  assert.match(webWorkspace, /zodResolver/);
  assert.match(webWorkspace, /const exactQuantitySchema = z\.string\(\)/);
  assert.match(webWorkspace, /const exactRateSchema = z\.string\(\)/);
  assert.match(webWorkspace, /const exactTaxRateSchema = z\.string\(\)/);
  for (const field of ['quantity', 'unitRate', 'taxRate']) {
    assert.match(webApi, new RegExp(`${field}: string`));
  }
  assert.doesNotMatch(webApi, /type CreatePurchaseOrderInput[\s\S]{0,800}\b(?:poNo|status|subtotal|lineTotal|receivedQty|invoicedAmount)\s*:/);
});

// Reuse Module 6 cost structures and keep Vendor/quotation discovery out because Module 8 exposes no lookup CRUD routes.
test('Pass 241 reuses reviewed Project cost structure and does not invent Vendor or quotation lookup APIs', () => {
  assert.match(webWorkspace, /useWbsTree/);
  assert.match(webWorkspace, /useCostCodes/);
  assert.match(webWorkspace, /costStructures/);
  assert.match(webWorkspace, /costTypeId/);
  assert.match(webWorkspace, /Vendor UUID/);
  assert.match(webWorkspace, /Selected quotation UUID/);
  assert.doesNotMatch(webApi, /listVendors|listQuotations|getVendor|getQuotation/);
});

// Deliver every source-required Stage-14 React surface.
test('Pass 241 renders the complete minimum Purchase Orders UI', () => {
  for (const heading of [
    'Purchase Order register', 'Draft editor', 'Approval timeline', 'Printable PO preview',
    'Receipt / invoice progress', 'Commitment status',
  ]) assert.ok(webWorkspace.includes(heading), `Missing Module 9 UI: ${heading}`);
  assert.match(webWorkspace, /Create draft PO/);
  assert.match(webWorkspace, /Controlled revision/);
  assert.match(webWorkspace, /Cancel remaining commitment/);
});

// Approval visibility must come from the already-approved Module 22 inbox instead of a fabricated PO approval endpoint.
test('Pass 241 approval timeline is a read-only reuse of Module 22', () => {
  assert.match(webHooks, /loadVisibleApprovalTimeline/);
  assert.match(webHooks, /listApprovalInbox\(\{ resourceType: 'purchase_order'/);
  assert.match(webHooks, /return getApprovalRequest\(match\.id\)/);
  assert.doesNotMatch(webApi, /approval-request|approval-timeline|approvals/);
});

// Receipt/invoice progress and job-cost commitment status are read-only downstream projections.
test('Pass 241 keeps receipt invoice and commitment controls read-only', () => {
  assert.match(webWorkspace, /receivedQty/);
  assert.match(webWorkspace, /invoicedAmount/);
  assert.match(webHooks, /loadPurchaseOrderCommitments/);
  assert.match(webWorkspace, /Commitment status/);
  assert.doesNotMatch(webApi, /goods-receipts|supplier-invoices|finance|journals/);
  assert.match(webWorkspace, /window\.print\(\)/);
});

// Pass 364 supersedes the historical direct-purchase fail-closed UI while cancellation remains source-faithful.
test('Pass 241 UI remains source-faithful after the Pass 364 direct-purchase amendment', () => {
  assert.match(webPage, /purchase_orders\.direct_purchase/);
  assert.match(webPage, /purchase_orders\.revise/);
  assert.match(webWorkspace, /Direct purchase exception/);
  assert.match(webWorkspace, /directPurchaseReason/);
  assert.match(webWorkspace, /Controlled revision history/);
});

// Navigation and action visibility must use only the six stable Module 9 permissions.
test('Pass 241 adds permission-aware Purchase Orders navigation', () => {
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
  ]) {
    assert.match(webPage + adminShell, new RegExp(permission.replaceAll('.', '\\.')));
  }
  assert.match(adminShell, /activeView === 'purchase-orders'/);
  assert.match(adminShell, />Purchase Orders<\/button>/);
  assert.match(adminShell, /<PurchaseOrdersPage \/>/);
  assert.doesNotMatch(webPage + adminShell, /purchase_orders\.cancel/);
  assert.match(webPage, /purchase_orders\.direct_purchase/);
});

// Keep Module 9 styling local to the existing stylesheet and support browser print preview without a new document endpoint.
test('Pass 241 adds responsive and print-safe Purchase Order styles', () => {
  assert.match(webStyles, /Module 9 Purchase Orders/);
  assert.match(webStyles, /module9-project-picker/);
  assert.match(webStyles, /module9-print-preview/);
  assert.match(webStyles, /@media print/);
  assert.match(webStyles, /@media \(max-width:/);
});

// Register the fail-honest React gate and advance only to the reviewed Playwright pass.
test('Pass 241 React gate is fail-honest and points only to Pass 242', () => {
  assert.equal(rootPackage.scripts['module-9:react:gate'], 'node scripts/module-9/verify-stage-14-react.mjs');
  assert.match(reactGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(reactGate, /STAGE_14_MODULE_9_REACT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(reactGate, /STAGE_14_MODULE_9_REACT_PREPARED_FOR_DEPENDENCY_BACKED_BUILD/);
  assert.match(reactGate, /newReactFiles: 4/);
  assert.match(reactGate, /Pass 242 - Module 9 Playwright Purchase Order workflow verification/);
});


// Pass 242 must run the complete browser lifecycle without adding a ninth Purchase Order route.
test('Pass 242 prepares the complete Purchase Order Playwright workflow', () => {
  for (const fragment of [
    'quotation-backed draft, approval, issue, commitment visibility, controlled revision/cancel and permission denial',
    'Create draft PO',
    'Submit for approval',
    'Refresh approval status',
    'Issue PO',
    'Controlled revision',
    'Cancel remaining commitment',
    'Purchase Order Approval',
    "sourceType: 'purchase_order'",
    "eventType: 'purchase_order.issued'",
  ]) assert.ok(browserTest.includes(fragment), fragment);
  assert.match(browserTest, /approvePurchaseOrderInUi/);
  assert.match(browserTest, /getByRole\('button', \{ name: 'Approvals' \}\)/);
  assert.match(browserTest, /remainingAmount\.toString\(\)\)\.toBe\('0'\)/);
});

// Browser writes stay on the existing eight operations and never gain downstream authority.
test('Pass 242 browser authority remains inside the reviewed Module 9 route contract', () => {
  assert.match(browserTest, /function isAllowedModule9Path/);
  assert.match(browserTest, /expect\(isAllowedModule9Path\(request\.method, request\.pathname\)\)\.toBe\(true\)/);
  for (const forbidden of [
    'companyId', 'actorUserId', 'poNo', 'status', 'subtotal', 'lineTotal',
    'receivedQty', 'invoicedAmount', 'revisionNo', 'approvedAt', 'commitmentId', 'approvalDecision',
  ]) assert.match(browserTest, new RegExp(`'${forbidden}'`));
  assert.match(browserTest, /pathname\.includes\('\/receipt'\)/);
  assert.match(browserTest, /pathname\.includes\('\/invoice'\)/);
  assert.match(browserTest, /pathname\.includes\('\/commitments'\)/);
  assert.match(browserTest, /pathname\.includes\('\/finance'\)/);
});

// The real production startup must receive the same approval-definition configuration used by integration tests.
test('Pass 242 wires Purchase Order approval configuration through production startup', () => {
  assert.match(serverConfig, /purchaseOrderApprovalDefinitionCode: string \| null/);
  assert.match(serverConfig, /PURCHASE_ORDER_APPROVAL_DEFINITION_CODE/);
  assert.match(serverConfig, /key: 'PURCHASE_ORDER_APPROVAL_DEFINITION_CODE'/);
  assert.match(apiMain, /purchaseOrderApprovalDefinitionCode: config\.purchaseOrderApprovalDefinitionCode/);
  assert.match(playwrightConfig, /PURCHASE_ORDER_APPROVAL_DEFINITION_CODE: 'PURCHASE_ORDER'/);
});

// Approval decisions belong to Module 22; the owning PO replays its existing submit command to synchronize terminal state.
test('Pass 242 exposes a narrow pending-approval synchronization action before issue', () => {
  assert.match(webWorkspace, /normalizedStatus\(selected\.status\) === 'PENDING_APPROVAL'/);
  assert.match(webWorkspace, /Refresh approval status/);
  assert.match(webWorkspace, /handleSubmitPurchaseOrder/);
  assert.doesNotMatch(webApi, /refresh-approval|sync-approval|approve-purchase-order/);
});

// Permission-negative browser coverage must prove both hidden controls and API-side denial.
test('Pass 242 prepares read-only browser denial coverage', () => {
  assert.match(browserTest, /READER_EMAIL/);
  assert.match(browserTest, /Create draft PO' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Issue PO' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Controlled revision' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Cancel remaining commitment' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /expect\(deniedCreate\.status\(\)\)\.toBe\(403\)/);
  assert.match(browserTest, /expect\(deniedCancel\.status\(\)\)\.toBe\(403\)/);
});

// Register a fail-honest static/live Playwright gate and advance only to Pass 243 after genuine browser execution.
test('Pass 242 Playwright gate is registered and points only to Pass 243', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-9'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-9:playwright:gate'], 'node scripts/module-9/verify-stage-14-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-9:playwright:gate:live'], 'node scripts/module-9/verify-stage-14-playwright.mjs --mode=live');
  assert.match(playwrightConfig, /RUN_MODULE_9_E2E/);
  assert.match(playwrightConfig, /module-9-browser\.spec\.mjs/);
  assert.match(playwrightGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(playwrightGate, /STAGE_13_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /RUN_MODULE_9_E2E_REQUIRED/);
  assert.match(playwrightGate, /STAGE_14_MODULE_9_PLAYWRIGHT_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243/);
  assert.match(playwrightGate, /runtimeVerificationComplete: passed && mode === 'live' && stage13LiveAccepted/);
  assert.match(playwrightGate, /Pass 243 - Module 9 operational, migration and concurrency verification/);
});


// Pass 243 adds verification-only operational coverage over the existing Module-9 runtime and persistence boundary.
test('Pass 243 registers isolated Module 9 operational verification without production changes', () => {
  assert.equal(rootPackage.scripts['test:operations:module-9'].includes('--test-name-pattern="^Module 9 operational"'), true);
  assert.equal(rootPackage.scripts['module-9:operations:gate'], 'node scripts/module-9/verify-stage-14-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-9:operations:gate:live'], 'node scripts/module-9/verify-stage-14-operations.mjs --mode=live');
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
  assert.match(operationsGate, /financeWritesAdded: 0/);
  assert.match(operationsGate, /inventoryWritesAdded: 0/);
});

// Concurrent draft creation must serialize Project numbering while issue/cancel retries remain side-effect safe.
test('Pass 243 prepares concurrent PO numbering plus retry-safe issue and cancellation verification', () => {
  assert.match(integrationTest, /Module 9 operational concurrency serializes numbering and retry-safe issue revision cancellation commands/);
  assert.match(integrationTest, /Array\.from\(\{ length: 6 \}/);
  for (const number of ['PO-0001', 'PO-0002', 'PO-0003', 'PO-0004', 'PO-0005', 'PO-0006']) {
    assert.match(integrationTest, new RegExp(number));
  }
  assert.match(integrationTest, /eventType: 'purchase_order\.issued'/);
  assert.match(integrationTest, /eventType: 'purchase_order\.cancelled'/);
  assert.match(integrationTest, /sequence\.nextValue, 7n/);
});

// Controlled revisions must serialize on the PO lock and allocate monotonic revision numbers.
test('Pass 243 prepares concurrent controlled revision numbering verification', () => {
  assert.match(integrationTest, /Concurrent controlled revision A/);
  assert.match(integrationTest, /Concurrent controlled revision B/);
  assert.match(integrationTest, /revisions\.map\(\(revision\) => revision\.revisionNo\), \[1, 2\]/);
  assert.match(integrationTest, /action: 'purchase_order\.revised'/);
  assert.match(integrationTest, /eventType: 'purchase_order\.revised'/);
});

// Late outbox failures intentionally happen after business writes so transaction rollback can prove there is no partial state.
test('Pass 243 prepares issue revision and cancellation rollback injection', () => {
  assert.match(integrationTest, /module_9_ops_fail_outbox_event/);
  assert.match(integrationTest, /Module 9 operational rollback boundaries and query plans preserve atomic Purchase Order state and reviewed indexes/);
  for (const event of ['purchase_order.issued', 'purchase_order.revised', 'purchase_order.cancelled']) {
    assert.match(integrationTest, new RegExp(`installOutboxFailure\\(client, '${event.replace('.', '\\.')}'\\)`));
  }
  assert.match(integrationTest, /afterFailedIssue\.status, 'PENDING_APPROVAL'/);
  assert.match(integrationTest, /afterFailedRevision\.terms, 'Net 30 days'/);
  assert.match(integrationTest, /afterFailedCancellation\.status, 'ISSUED'/);
  assert.match(integrationTest, /activeCommitments\[0\]\.status, 'ACTIVE'/);
  assert.match(integrationTest, /removeOutboxFailure\(client\)/);
});

// Verify reviewed Stage-14 indexes through EXPLAIN without unstable latency thresholds.
test('Pass 243 prepares query-plan verification for Purchase Order and commitment indexes', () => {
  for (const index of [
    'purchase_orders_company_project_status_order_idx',
    'purchase_orders_company_vendor_status_idx',
    'purchase_orders_quotation_idx',
    'purchase_order_items_po_cost_structure_idx',
    'purchase_order_revisions_po_approved_idx',
    'cost_commitments_source_key_uq'
  ]) assert.match(integrationTest, new RegExp(index));
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
  assert.doesNotMatch(integrationTest, /performance\.now\(|Date\.now\(\)[\s\S]{0,100}(?:<|>)\s*\d+\s*(?:ms|milliseconds)/);
});

// Live operations cannot bypass the accepted prior Stage or the backend/browser live handoffs and must verify both migration paths first.
test('Pass 243 operations gate is fail-honest and verifies both supported migration paths before live concurrency work', () => {
  assert.match(operationsGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(operationsGate, /STAGE_13_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241/);
  assert.match(operationsGate, /STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243/);
  assert.match(operationsGate, /STAGE_14_MODULE_9_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_14_MODULE_9_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-9/);
});

// Pass 243 is the final operational preparation step before the dedicated Stage-14 acceptance gate.
test('Pass 243 points only to Pass 244 final Stage-14 acceptance', () => {
  assert.match(operationsGate, /STAGE_14_MODULE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_244/);
  assert.match(operationsGate, /STAGE_14_MODULE_9_OPERATIONS_PREPARED_STAGE_13_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /Pass 244 - Module 9 final Stage-14 acceptance gate/);
});


// Pass 244 adds only the dedicated fail-honest final Stage-14 acceptance gate.
test('Pass 244 registers the final Stage 14 static and live acceptance commands', () => {
  assert.equal(rootPackage.scripts['module-9:gate'], 'node scripts/module-9/verify-stage-14.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-9:gate:live'], 'node scripts/module-9/verify-stage-14.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-9:acceptance:live'], 'node scripts/module-9/verify-stage-14.mjs --mode=live');
  assert.match(finalGate, /pass: 244/);
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
  assert.match(finalGate, /publicApiChanges: 0/);
});

// Final acceptance must not manufacture live evidence when the prior Stage or the three Stage-14 runtime handoffs are missing.
test('Pass 244 final acceptance is fail-honest across the complete live handoff chain', () => {
  assert.match(finalGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(finalGate, /STAGE_13_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_14_MODULE_9_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_241/);
  assert.match(finalGate, /STAGE_14_MODULE_9_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_243/);
  assert.match(finalGate, /STAGE_14_MODULE_9_OPERATIONS_VERIFIED_READY_FOR_PASS_244/);
  assert.match(finalGate, /STAGE_14_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_14_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_14_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /runtimeVerificationComplete: passed/);
  assert.match(finalGate, /mode === 'live'/);
});

// Stage 14 closes only the exact Purchase Order business boundary reviewed in the source.
test('Pass 244 final acceptance preserves exact Module 9 tables routes permissions events and deferred adapters', () => {
  for (const table of ['purchase_orders', 'purchase_order_items', 'purchase_order_revisions']) {
    assert.match(finalGate, new RegExp(`'${table}'`));
  }
  assert.match(finalGate, /routeCount: 8/);
  for (const permission of [
    'purchase_orders.read', 'purchase_orders.create', 'purchase_orders.edit',
    'purchase_orders.submit', 'purchase_orders.issue', 'purchase_orders.revise',
  ]) assert.match(finalGate, new RegExp(permission.replaceAll('.', '\\.')));
  for (const event of [
    'purchase_order.created', 'purchase_order.submitted', 'purchase_order.issued',
    'purchase_order.revised', 'purchase_order.cancelled',
  ]) assert.match(finalGate, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(finalGate, /inventoryReceiptWritesDeferredToStage15: true/);
  assert.match(finalGate, /financeSourceAdapterDeferredToStage26: true/);
  assert.match(finalGate, /exactApprovedBusinessModuleCount: 24/);
  assert.match(finalGate, /stageSuffixCreatesBusinessModule: false/);
});

// The final static gate must regress the Purchase Order dependency boundary before any live deployment attempt.
test('Pass 244 static gate regresses Module 6 7 8 22 24B plus full workspace and migration contracts', () => {
  for (const fragment of [
    'module-6-static-regression',
    'module-7-static-regression',
    'module-8-static-regression',
    'module-22-static-regression',
    'module-24b-static-regression',
    'module-9-static-suite',
    'full-static-regression',
    'workspace-contract',
    'migration-policy',
    'module-9-integration-test-syntax',
    'module-9-playwright-test-syntax',
  ]) assert.match(finalGate, new RegExp(fragment));
});

// A genuine live acceptance reruns clean/previous migrations and the Module-9 backend/browser/operations chain before Stage 15.
test('Pass 244 live gate verifies the complete runtime chain and advances only to Stage 15 Inventory', () => {
  assert.match(finalGate, /MODULE_9_LIVE_GATE_CONFIRM/);
  assert.match(finalGate, /RUN_CONSTRUCTION_ERP_MODULE_9_LIVE_GATE/);
  assert.match(finalGate, /MIGRATION_TEST_CONFIRM/);
  assert.match(finalGate, /RESET_CONSTRUCTION_ERP_MIGRATION_TEST_DATABASE/);
  assert.match(finalGate, /db:migrations:verify/);
  assert.match(finalGate, /test:integration:module-9/);
  assert.match(finalGate, /test:e2e:module-9/);
  assert.match(finalGate, /test:operations:module-9/);
  assert.match(finalGate, /test:operations:module-8/);
  assert.match(finalGate, /test:operations:module-7/);
  assert.match(finalGate, /STAGE_14_ACCEPTED_READY_FOR_STAGE_15/);
  assert.match(finalGate, /Stage 15 - Module 10 Inventory & Materials/);
});
