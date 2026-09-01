import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const contract = await readFile('docs/modules/procurement/STAGE-13-MODULE-8-CONTRACT.md', 'utf8');
const contractGate = await readFile('scripts/module-8/verify-stage-13-contract.mjs', 'utf8');
const persistenceGate = await readFile('scripts/module-8/verify-stage-13-persistence.mjs', 'utf8');
const schemaGate = await readFile('scripts/module-8/verify-stage-13-schema.mjs', 'utf8');
const repositoryGate = await readFile('scripts/module-8/verify-stage-13-repository.mjs', 'utf8');
const serviceGate = await readFile('scripts/module-8/verify-stage-13-service.mjs', 'utf8');
const httpGate = await readFile('scripts/module-8/verify-stage-13-http.mjs', 'utf8');
const integrationSecurityGate = await readFile('scripts/module-8/verify-stage-13-integration-security.mjs', 'utf8');
const reactGate = await readFile('scripts/module-8/verify-stage-13-react.mjs', 'utf8');
const playwrightGate = await readFile('scripts/module-8/verify-stage-13-playwright.mjs', 'utf8');
const operationsGate = await readFile('scripts/module-8/verify-stage-13-operations.mjs', 'utf8');
const finalGate = await readFile('scripts/module-8/verify-stage-13.mjs', 'utf8');
const browserTest = await readFile('tests/e2e/module-8-browser.spec.mjs', 'utf8');
const playwrightConfig = await readFile('playwright.config.mjs', 'utf8');
const webApi = await readFile('apps/web/src/features/procurement/api/procurement-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/procurement/hooks/procurement.ts', 'utf8');
const webWorkspace = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');
const webPage = await readFile('apps/web/src/features/procurement/pages/procurement-page.tsx', 'utf8');
const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
const webStyles = await readFile('apps/web/src/styles.css', 'utf8');
const integrationTest = await readFile('tests/integration/module-8-api.integration.test.mjs', 'utf8');
const routes = await readFile('apps/api/src/modules/procurement/procurement.routes.ts', 'utf8');
const moduleIndex = await readFile('apps/api/src/modules/procurement/index.ts', 'utf8');
const app = await readFile('apps/api/src/app.ts', 'utf8');
const schema = await readFile('apps/api/src/modules/procurement/procurement.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/procurement/procurement.service.ts', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260824000300_module_8_procurement_rfq_core/migration.sql', 'utf8');
const rfqItemRepairMigration = await readFile('packages/database/prisma/migrations/20260826000500_module_8_rfq_item_relational_integrity/migration.sql', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const gateManifest = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const checksumManifest = JSON.parse(await readFile('packages/database/prisma/migration-checksums.json', 'utf8'));
const rootPackage = JSON.parse(await readFile('package.json', 'utf8'));

// Freeze the corrected Part-I supplier/vendor ownership together with the Appendix transaction tables.
test('Pass 223 freezes the eight reviewed Module 8 persistence resources', () => {
  for (const table of [
    'vendors',
    'vendor_contacts',
    'purchase_requisitions',
    'purchase_requisition_items',
    'rfqs',
    'rfq_vendors',
    'supplier_quotations',
    'supplier_quotation_items',
  ]) assert.match(contract, new RegExp(`\\b${table}\\b`));
  assert.match(contract, /Module 8 owns exactly these reviewed persistence resources/);
  assert.match(contract, /vendors\nvendor_contacts\npurchase_requisitions\npurchase_requisition_items\nrfqs\nrfq_vendors\nsupplier_quotations\nsupplier_quotation_items/);
});

// Enforce the Part-I correction that every procurement vendor reference roots in Module 8.
test('Pass 223 freezes Module 8 supplier vendor master ownership', () => {
  for (const field of ['code', 'legal_name', 'display_name', 'tax_no', 'payment_terms_days', 'currency', 'status', 'qualification_status']) {
    assert.match(contract, new RegExp(`\\b${field}\\b`));
  }
  assert.match(contract, /All RFQ, supplier quotation and later Purchase Order `vendor_id` values must reference this Module-8 `vendors` master/);
  assert.match(contract, /Subcontractor Management may link to an existing vendor but must not replace or duplicate the supplier master/);
});

// Keep the corrected dependency matrix rather than the older unqualified Module-24 wording.
test('Pass 223 freezes the five corrected hard prerequisites', () => {
  for (const dependency of [
    'Module 5   Project Management',
    'Module 6   WBS & Cost Codes',
    'Module 7   Budgeting & Job Costing',
    'Module 22  Approval Workflows',
    'Module 24B Project Scope Activation',
  ]) assert.ok(contract.includes(dependency), `Missing dependency: ${dependency}`);
  assert.match(contractGate, /24B - Project Scope Activation/);
});

// Keep the public surface exactly on the eight business operations supplied by Appendix A.
test('Pass 223 freezes exactly eight reviewed Module 8 public operations', () => {
  for (const route of [
    'GET  /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions/:id/submit',
    'POST /api/v1/procurement/rfqs',
    'POST /api/v1/procurement/rfqs/:id/issue',
    'POST /api/v1/procurement/rfqs/:id/quotations',
    'GET  /api/v1/procurement/rfqs/:id/comparison',
    'POST /api/v1/procurement/rfqs/:id/select-quotation',
  ]) assert.ok(contract.includes(route), `Missing route: ${route}`);
  assert.match(contractGate, /reviewedRouteCount: 8/);
});

// Do not invent vendor CRUD just because Part I adds the vendor master ownership.
test('Pass 223 records the vendor master API gap without adding vendor routes', () => {
  assert.match(contract, /Vendor-master API gap/);
  assert.match(contract, /route table defines no vendor-master list, create, read, update, archive or contact-management endpoint/);
  assert.match(contract, /GET  \/api\/v1\/procurement\/vendors/);
  assert.match(contractGate, /publicVendorMasterRouteCount: 0/);
  assert.match(contractGate, /vendorMasterPublicApiGapRecorded: true/);
});

// Preserve the original source omission while proving the reviewed Pass-362 structural amendment is explicit.
test('Pass 223 records the rfq_item_id source inconsistency and Pass 362 resolves it explicitly', () => {
  assert.match(contract, /supplier_quotation_items\.rfq_item_id/);
  assert.match(contract, /does \*\*not\*\* define an `rfq_items` table/);
  assert.match(contract, /cannot safely assume that every `rfq_item_id` is a `purchase_requisition_items.id`/);
  assert.match(contract, /Pass 362 post-Stage-23 RFQ-item integrity amendment/);
  assert.match(contract, /one minimal `rfq_items` snapshot table plus a real foreign key/);
  assert.match(contractGate, /rfqItemRelationshipGapRecorded: true/);
  assert.match(contractGate, /rfqItemRelationshipResolvedByPass362: true/);
});

// Respect the future Module-10 item master instead of creating an invalid premature FK.
test('Pass 223 freezes the nullable future inventory item reference correctly', () => {
  assert.match(contract, /`item_id` is nullable/);
  assert.match(contract, /owning inventory\/material item master is Module 10/);
  assert.match(contract, /must not create a false foreign key to a table that does not yet exist/);
  assert.match(contractGate, /inventoryItemForeignKeyDeferredUntilModule10: true/);
});

// Preserve server authority for scope, actors, numbering, lifecycle and calculated totals.
test('Pass 223 freezes server-owned procurement authority', () => {
  for (const field of [
    'companyId',
    'actorUserId',
    'permissions',
    'projectScope',
    'requestedBy',
    'buyerUserId',
    'prNo',
    'rfqNo',
    'status',
  ]) assert.match(contract, new RegExp(`\\b${field}\\b`));
  assert.match(contract, /server quotation totals/);
  assert.match(contract, /server derives Company, actor and Project authorization/);
  assert.match(contract, /Financial decimals must serialize without binary-floating precision loss/);
});

// Keep procurement cost coding dependent on Module 6 and budget blocking dependent on Module 7.
test('Pass 223 freezes cost structure and budget ownership boundaries', () => {
  assert.match(contract, /active Project\/WBS\/Cost-Code\/Cost-Type posting combination owned by Module 6/);
  assert.match(contract, /Module 7 is the budget\/job-cost owner/);
  assert.match(contract, /must not create or overwrite Project budgets, commitments or actuals/);
  assert.match(contract, /PROCUREMENT_BUDGET_BLOCK/);
  assert.match(contract, /source does not define the exact budget-block threshold\/tolerance policy/);
});

// Reuse Module 22 without duplicating an approval state machine.
test('Pass 223 freezes the approval integration boundary', () => {
  assert.match(contract, /uses Module 22 Approval Workflows when required/);
  assert.match(contract, /owning module controls its business state transition after an approval decision/);
  assert.match(contract, /does not define a separate Module-8 approve\/reject route/);
  assert.match(contract, /must not duplicate the approval engine/);
});

// Selection remains pre-commitment until Module 9 or Module 11 creates a binding document.
test('Pass 223 prevents quotation selection from creating financial commitment', () => {
  assert.match(contract, /Quotation selection is pre-commitment only/);
  assert.match(contract, /must \*\*not\*\* create a Module-7 `cost_commitments` row, Finance journal or payable/);
  assert.match(contractGate, /selectionCreatesFinancialCommitment: false/);
});

// Freeze the source permission vocabulary without inventing vendor administration permissions.
test('Pass 223 freezes the five reviewed Module 8 permissions', () => {
  for (const permission of [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ]) assert.match(contract, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(contract, /source defines no separate vendor-master permission token/);
});

// Keep public business conflicts to the six reviewed codes.
test('Pass 223 freezes the six reviewed Module 8 error codes', () => {
  for (const code of [
    'REQUISITION_NOT_FOUND',
    'RFQ_NOT_FOUND',
    'RFQ_CLOSED',
    'QUOTATION_INVALID',
    'PROCUREMENT_BUDGET_BLOCK',
    'INVALID_VENDOR_SELECTION',
  ]) assert.match(contract, new RegExp(code));
  assert.match(contract, /Do not invent a larger public Module-8 error-code vocabulary/);
});

// Keep the source event set visible while leaving emission to a later service pass.
test('Pass 223 freezes the four reviewed Module 8 events', () => {
  for (const eventName of [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ]) assert.match(contract, new RegExp(eventName.replaceAll('.', '\\.')));
  assert.match(contract, /Pass 223 does not emit events or write audit\/outbox rows/);
});

// Do not fabricate complex quotation normalization rules the source never defines.
test('Pass 223 records comparison normalization gaps', () => {
  assert.match(contract, /normalized quantities\/currency\/tax assumptions/);
  assert.match(contract, /exchange-rate source\/date/);
  assert.match(contract, /unit-conversion master/);
  assert.match(contract, /tax normalization formula/);
  assert.match(contract, /must not fabricate a sophisticated bid-evaluation engine/);
});

// Preserve the revision/return-to-draft business rule without inventing missing commands.
test('Pass 223 records missing requisition revision commands', () => {
  assert.match(contract, /submitted\/approved requisitions are not silently edited/);
  assert.match(contract, /reviewed route table exposes no such command/);
  assert.match(contract, /POST   \/api\/v1\/procurement\/requisitions\/:id\/return-to-draft/);
  assert.match(contract, /POST   \/api\/v1\/procurement\/requisitions\/:id\/revise/);
});

// Keep React and import behavior reserved for later passes without extending the HTTP surface.
test('Pass 223 reserves the reviewed React boundary without generating an import API', () => {
  assert.match(contract, /apps\/web\/src\/features\/procurement\//);
  for (const ui of ['Requisition register', 'RFQ builder', 'Vendor invitation', 'Quotation entry/import', 'Side-by-side comparison', 'Selection approval']) {
    assert.match(contract, new RegExp(ui.replace('/', '\\/')));
  }
  assert.match(contract, /no dedicated import\/upload endpoint/);
  assert.match(contract, /No React code is generated in Pass 223/);
});

// Register one fail-honest contract gate and keep runtime activation on genuine Stage-12 evidence.
test('Pass 223 registers the fail-honest Stage-13 contract gate', () => {
  assert.equal(
    rootPackage.scripts['module-8:contract:gate'],
    'node scripts/module-8/verify-stage-13-contract.mjs',
  );
  assert.match(contractGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(contractGate, /STAGE_13_MODULE_8_CONTRACT_FROZEN_READY_FOR_PASS_224/);
  assert.match(contractGate, /STAGE_13_MODULE_8_CONTRACT_FROZEN_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(contractGate, /productionRuntimeActivationAllowed: passed && stage12LiveAccepted/);
  assert.match(contractGate, /persistencePreparationAllowed: passed/);
});

// Pass 223 must remain contract-only and point to persistence next.
test('Pass 223 keeps implementation on reviewed persistence next', () => {
  assert.match(contract, /Pass 223 is contract-only/);
  assert.match(contract, /Pass 224 - Module 8 reviewed Prisma models, constraints, indexes and migration/);
  assert.match(contractGate, /productionFilesGenerated: false/);
  assert.match(contractGate, /databaseMigrationGenerated: false/);
  assert.match(contractGate, /Pass 224 - Module 8 reviewed Prisma models, constraints, indexes and migration/);
});

// Preserve the original eight-table Stage-13 migration while allowing exactly one reviewed Pass-362 support table now.
test('Pass 224 keeps the eight reviewed source tables and Pass 362 adds only rfq_items', () => {
  for (const [model, table] of [
    ['Vendor', 'vendors'],
    ['VendorContact', 'vendor_contacts'],
    ['PurchaseRequisition', 'purchase_requisitions'],
    ['PurchaseRequisitionItem', 'purchase_requisition_items'],
    ['Rfq', 'rfqs'],
    ['RfqVendor', 'rfq_vendors'],
    ['SupplierQuotation', 'supplier_quotations'],
    ['SupplierQuotationItem', 'supplier_quotation_items'],
  ]) {
    assert.match(prisma, new RegExp(`model\\s+${model}\\s*\\{[\\s\\S]*?@@map\\("${table}"\\)`));
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.doesNotMatch(migration, /CREATE TABLE "rfq_items"/);
  assert.match(prisma, /model\s+RfqItem\s*\{[\s\S]*?@@map\("rfq_items"\)/);
  assert.match(rfqItemRepairMigration, /CREATE TABLE "rfq_items"/);
  assert.match(persistenceGate, /inferredTablesAdded: \['rfq_items'\]/);
});

// Part I requires every procurement vendor reference to resolve to the Module-8 vendor master.
test('Pass 224 roots RFQ and quotation vendor ids in vendors', () => {
  const invitation = prisma.match(/model RfqVendor \{[\s\S]*?\n\}/)?.[0] ?? '';
  const quotation = prisma.match(/model SupplierQuotation \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(invitation, /vendor\s+Vendor\s+@relation/);
  assert.match(quotation, /vendor\s+Vendor\s+@relation/);
  assert.match(migration, /rfq_vendors_vendor_fkey[\s\S]*?REFERENCES "vendors"\("id"\)/);
  assert.match(migration, /supplier_quotations_vendor_fkey[\s\S]*?REFERENCES "vendors"\("id"\)/);
  assert.match(migration, /vendors_company_fkey[\s\S]*?REFERENCES "companies"\("id"\)/);
});

// Keep vendor master tokens flexible and do not invent duplicate-code policy.
test('Pass 224 keeps vendor status qualification string-backed without inventing code uniqueness', () => {
  const vendor = prisma.match(/model Vendor \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(vendor, /status\s+String\s+@db\.VarChar\(32\)/);
  assert.match(vendor, /qualificationStatus\s+String\?/);
  assert.match(vendor, /@@index\(\[companyId, code\]/);
  assert.doesNotMatch(vendor, /@@unique\(\[companyId, code\]/);
  assert.doesNotMatch(prisma, /enum\s+(VendorStatus|VendorQualificationStatus|RfqStatus|QuotationStatus)/);
  assert.match(contract, /Vendor `code` receives an index but \*\*not\*\* an invented uniqueness rule/);
});

// Company/Project identity and requester/buyer authority must be referentially scoped server-side.
test('Pass 224 enforces Company Project requester and buyer scope at persistence', () => {
  assert.match(migration, /purchase_requisitions_project_company_fkey[\s\S]*?REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /purchase_requisitions_requester_company_fkey[\s\S]*?REFERENCES "users"\("id", "company_id"\)/);
  assert.match(migration, /rfqs_project_company_fkey[\s\S]*?REFERENCES "projects"\("id", "company_id"\)/);
  assert.match(migration, /rfqs_buyer_company_fkey[\s\S]*?REFERENCES "users"\("id", "company_id"\)/);
  assert.match(migration, /module_8_validate_rfq_requisition_scope/);
  assert.match(migration, /same Company and Project as the RFQ/);
});

// Requisition lines reuse the existing Module-6 cost structure and reject non-posting combinations.
test('Pass 224 validates requisition item cost structure against Module 6', () => {
  const item = prisma.match(/model PurchaseRequisitionItem \{[\s\S]*?\n\}/)?.[0] ?? '';
  for (const field of ['wbsNodeId', 'costCodeId', 'costTypeId']) assert.match(item, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(item, /projectCostCodeId|costStructureId/);
  assert.match(migration, /module_8_validate_pr_item_cost_scope/);
  assert.match(migration, /FROM "project_cost_codes" mapping/);
  assert.match(migration, /mapping\."is_posting_allowed" = TRUE/);
});

// The future inventory item reference must stay nullable and unenforced until Module 10 exists.
test('Pass 224 defers the Module 10 inventory item foreign key', () => {
  const item = prisma.match(/model PurchaseRequisitionItem \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(item, /itemId\s+String\?\s+@map\("item_id"\) @db\.Uuid/);
  assert.match(migration, /"item_id" UUID/);
  assert.doesNotMatch(migration, /FOREIGN KEY \("item_id"\)/);
  assert.match(contract, /real Module-10 inventory\/material FK remains deferred/);
  assert.match(persistenceGate, /inventoryItemForeignKeyDeferredUntilModule10: true/);
});

// Pass 362 must activate a real RFQ-item target without pretending it is a requisition-item FK.
test('Pass 362 enforces supplier quotation RFQ-item referential integrity', () => {
  const item = prisma.match(/model SupplierQuotationItem \{[\s\S]*?\n\}/)?.[0] ?? '';
  const rfqItem = prisma.match(/model RfqItem \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.match(item, /rfqItemId\s+String\s+@map\("rfq_item_id"\) @db\.Uuid/);
  assert.match(item, /rfqItem\s+RfqItem\s+@relation/);
  assert.match(rfqItem, /requisitionItemId\s+String\?/);
  assert.match(rfqItemRepairMigration, /supplier_quotation_items_rfq_item_fkey/);
  assert.match(rfqItemRepairMigration, /FOREIGN KEY \("rfq_item_id"\) REFERENCES "rfq_items"\("id"\)/);
  assert.doesNotMatch(rfqItemRepairMigration, /FOREIGN KEY \("rfq_item_id"\) REFERENCES "purchase_requisition_items"/);
  assert.match(rfqItemRepairMigration, /module_8_validate_supplier_quotation_item_scope/);
  assert.match(persistenceGate, /rfqItemForeignKeyEnforced: true/);
  assert.match(persistenceGate, /rfqItemRelationshipResolvedByPass362: true/);
});

// Enforce same-company vendor invitations and quotation origin without inventing vendor CRUD.
test('Pass 224 enforces vendor invitation and quotation scope with database triggers', () => {
  assert.match(migration, /module_8_validate_rfq_vendor_scope/);
  assert.match(migration, /RFQ vendor must belong to the same Company as the RFQ/);
  assert.match(migration, /module_8_validate_supplier_quotation_scope/);
  assert.match(migration, /FROM "rfq_vendors"/);
  assert.match(migration, /Supplier quotation vendor must be invited to the RFQ inside the same Company/);
});

// Document numbers are server-owned and collision-safe inside the Company, while lifecycle tokens remain service-owned.
test('Pass 224 locks company-scoped procurement document identity without inventing lifecycle enums', () => {
  assert.match(migration, /purchase_requisitions_company_pr_no_uq/);
  assert.match(migration, /rfqs_company_rfq_no_uq/);
  assert.match(contract, /`pr_no` and `rfq_no` unique within Company scope/);
  assert.doesNotMatch(prisma, /enum\s+(PurchaseRequisitionStatus|RfqStatus|RfqVendorResponseStatus|SupplierQuotationStatus)/);
});

// All estimated/quotation numbers must use PostgreSQL decimal types, never binary floating persistence.
test('Pass 224 keeps procurement quantities rates and quotation money decimal-safe', () => {
  for (const field of ['quantity', 'estimatedRate', 'subtotal', 'tax', 'total', 'unitRate', 'discount']) {
    assert.match(prisma, new RegExp(`\\b${field}\\b[\\s\\S]{0,90}@db\\.Decimal`));
  }
  assert.doesNotMatch(migration, /DOUBLE PRECISION|\bREAL\b/);
});

// Do not fabricate date formulas, selected-quotation state or financial commitments in persistence.
test('Pass 224 avoids unsupported RFQ date selection and commitment persistence', () => {
  const rfq = prisma.match(/model Rfq \{[\s\S]*?\n\}/)?.[0] ?? '';
  const quotation = prisma.match(/model SupplierQuotation \{[\s\S]*?\n\}/)?.[0] ?? '';
  assert.doesNotMatch(migration, /due_date[^\n]*>=\s*"issue_date"|issue_date[^\n]*<=\s*"due_date"/i);
  assert.doesNotMatch(`${rfq}\n${quotation}`, /selectedQuotationId|selectionReason|exceptionReason|approvalRequestId/);
  assert.doesNotMatch(migration, /INSERT INTO "cost_commitments"|CREATE TABLE "procurement_policies"/);
  assert.match(persistenceGate, /selectionCreatesFinancialCommitment: false/);
});

// Retain exactly the reviewed Stage-13 migration gate and immutable checksum after later stages append migrations.
test('Pass 224 retains its Stage-13 migration gate with a locked checksum', () => {
  const stage13Gates = gateManifest.gates.filter((entry) => entry.stage === 13);
  assert.equal(stage13Gates.length, 1);
  const latest = stage13Gates[0];
  assert.equal(latest.gate, 'module-8-procurement-rfq-core-persistence');
  assert.deepEqual(latest.migrations, ['20260824000300_module_8_procurement_rfq_core']);
  assert.match(checksumManifest.migrations['20260824000300_module_8_procurement_rfq_core'] ?? '', /^[a-f0-9]{64}$/);
});

// Persistence remains fail-honest: static preparation may continue while Stage-12 live deployment handoff is absent.
test('Pass 224 registers the fail-honest Stage-13 persistence gate', () => {
  assert.equal(rootPackage.scripts['module-8:persistence:gate'], 'node scripts/module-8/verify-stage-13-persistence.mjs');
  assert.match(persistenceGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(persistenceGate, /runtimeVerificationComplete === true/);
  assert.match(persistenceGate, /STAGE_13_MODULE_8_PERSISTENCE_READY_FOR_PASS_225/);
  assert.match(persistenceGate, /STAGE_13_MODULE_8_PERSISTENCE_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(persistenceGate, /runtimeDeploymentAllowed: passed && stage12LiveAccepted/);
});

// Pass 224 must stop at persistence and point only to the reviewed Zod boundary next.
test('Pass 224 stays persistence-only and points to Pass 225 schema boundary', () => {
  assert.match(contract, /Pass 224 therefore remains persistence-only/);
  assert.match(contract, /Pass 225 - Module 8 Zod request\/response schema boundary/);
  assert.match(persistenceGate, /publicRoutesGenerated: false/);
  assert.match(persistenceGate, /apiGenerated: false/);
  assert.match(persistenceGate, /repositoryGenerated: false/);
  assert.match(persistenceGate, /serviceGenerated: false/);
  assert.match(persistenceGate, /reactGenerated: false/);
});



// Freeze the same eight reviewed Module-8 routes and five permissions at the Zod boundary.
test('Pass 225 exports exactly the reviewed Module 8 route and permission inventories', () => {
  for (const route of [
    '/api/v1/procurement/requisitions',
    '/api/v1/procurement/requisitions/:id/submit',
    '/api/v1/procurement/rfqs',
    '/api/v1/procurement/rfqs/:id/issue',
    '/api/v1/procurement/rfqs/:id/quotations',
    '/api/v1/procurement/rfqs/:id/comparison',
    '/api/v1/procurement/rfqs/:id/select-quotation',
  ]) assert.match(schema, new RegExp(route.replace(/[/:]/g, (value) => `\\${value}`)));
  for (const permission of [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ]) assert.match(schema, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(schemaGate, /reviewedRouteCount: 8/);
  assert.match(schemaGate, /publicVendorMasterRouteCount: 0/);
});

// Choose only one Project filter plus bounded pagination for the source-underspecified requisition register.
test('Pass 225 keeps requisition-list query narrow and Project-safe', () => {
  const query = schema.match(/export const listPurchaseRequisitionsQuerySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(query, /projectId:\s*uuidSchema\.optional\(\)/);
  assert.match(query, /\.\.\.paginationQueryShape/);
  assert.doesNotMatch(query, /status|search|vendorId|requestedBy|requiredDate/);
  assert.match(schema, /MODULE_8_MAX_PAGE_SIZE = 100/);
  assert.match(schemaGate, /requisitionListFilters: \['projectId', 'page', 'pageSize'\]/);
});

// Keep PR creation on explicit business inputs while requester, numbering, state and totals remain server-owned.
test('Pass 225 requisition schemas accept only reviewed browser business inputs', () => {
  const item = schema.match(/export const purchaseRequisitionItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const body = schema.match(/export const createPurchaseRequisitionBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['itemId', 'description', 'quantity', 'unit', 'estimatedRate', 'wbsNodeId', 'costCodeId', 'costTypeId']) {
    assert.match(item, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['projectId', 'requiredDate', 'purpose', 'items']) assert.match(body, new RegExp(`\\b${field}\\b`));
  for (const forbidden of ['companyId', 'requestedBy', 'prNo', 'status', 'actorUserId', 'permissions', 'projectScope']) {
    assert.doesNotMatch(`${item}\n${body}`, new RegExp(`\\b${forbidden}\\b`));
  }
  assert.match(body, /z\.array\(purchaseRequisitionItemInputSchema\)\.min\(1\)/);
});

// Submission remains an explicit bodyless command rather than an arbitrary lifecycle patch.
test('Pass 225 keeps purchase requisition submission bodyless', () => {
  assert.match(schema, /submitPurchaseRequisitionBodySchema = z\.object\(\{\}\)\.strict\(\)/);
  assert.doesNotMatch(schema.match(/submitPurchaseRequisitionBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '', /status|approval|return|revision/);
});

// RFQ creation keeps buyer/numbering/date ordering server-owned while Pass 362 requires exactly one line source.
test('Pass 362 RFQ create schema keeps server authority and requires requisition xor direct items', () => {
  const body = schema.slice(
    schema.indexOf('export const createRfqBodySchema'),
    schema.indexOf('/** Issue one RFQ')
  );
  for (const field of ['projectId', 'requisitionId', 'issueDate', 'dueDate', 'items']) assert.match(body, new RegExp(`\\b${field}\\b`));
  for (const forbidden of ['companyId', 'rfqNo', 'buyerUserId', 'status']) assert.doesNotMatch(body, new RegExp(`\\b${forbidden}\\b`));
  assert.match(body, /Provide either one requisitionId or direct RFQ items, but not both/);
  assert.doesNotMatch(body, /issueDate\s*[<>]=?|dueDate\s*[<>]=?/);
  assert.match(schemaGate, /rfqDateOrderingRuleInvented: false/);
});

// RFQ issue accepts Vendor identities only; invitation time/response state are not browser authority.
test('Pass 225 RFQ issue schema accepts a deduplicated vendor set only', () => {
  const body = schema.match(/export const issueRfqBodySchema =[\s\S]*?\n\}\)\.strict\(\);/)?.[0] ?? '';
  assert.match(body, /vendorIds:\s*z\.array\(uuidSchema\)\.min\(1\)\.superRefine/);
  assert.match(body, /new Set\(vendorIds\)/);
  assert.doesNotMatch(body, /invitedAt|responseStatus|status|qualificationStatus/);
});

// Browser quotation inputs carry source facts, never the calculated header/line totals.
test('Pass 225 quotation schemas keep totals server-calculated and decimals exact', () => {
  const line = schema.match(/export const supplierQuotationItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  const body = schema.match(/export const recordSupplierQuotationBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  for (const field of ['rfqItemId', 'quantity', 'unitRate', 'discount', 'tax']) assert.match(line, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(line, /\btotal\b/);
  for (const field of ['vendorId', 'quoteNo', 'quoteDate', 'validUntil', 'leadTimeDays', 'items']) assert.match(body, new RegExp(`\\b${field}\\b`));
  assert.doesNotMatch(body, /\bsubtotal\b|\btotal\b|\bstatus\b|companyId|actorUserId/);
  assert.match(schema, /const moneySchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schema, /const quantityRateSchema = z\.string\(\)\.trim\(\)\.regex/);
  assert.match(schemaGate, /quotationHeaderTotalsBrowserOwned: false/);
  assert.match(schemaGate, /quotationLineTotalBrowserOwned: false/);
});

// Do not invent comparison filters, exchange rates, ranking scores or tie-break outputs while the source is silent.
test('Pass 225 comparison boundary remains minimal and assumption-free', () => {
  assert.match(schema, /getRfqComparisonQuerySchema = z\.object\(\{\}\)\.strict\(\)/);
  const response = schema.match(/export const rfqComparisonResponseSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(response, /rfqId:\s*uuidSchema/);
  assert.match(response, /quotations:\s*z\.array\(supplierQuotationResponseSchema\)/);
  assert.doesNotMatch(response, /exchangeRate|currency|rank|score|lowest|tieBreak|evaluatedPrice/);
  assert.match(schemaGate, /comparisonRankingFieldsInvented: false/);
  assert.match(schemaGate, /comparisonExchangeRateFieldsInvented: false/);
});

// Use one narrow rationale field for normal/exception selection context without creating a commitment payload.
test('Pass 225 quotation selection accepts only quotation identity and optional rationale', () => {
  const body = schema.match(/export const selectQuotationBodySchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(body, /quotationId:\s*uuidSchema/);
  assert.match(body, /rationale:\s*rationaleSchema\.optional\(\)/);
  assert.doesNotMatch(body, /commitment|amount|budget|journal|payable|approvedBy|status/);
  assert.match(schemaGate, /selectionCreatesFinancialCommitment: false/);
  assert.match(schemaGate, /Use one optional rationale field/);
});

// Keep the Vendor API gap explicit while exposing repaired RFQ-line identity through existing RFQ contracts only.
test('Pass 363 keeps RFQ-line identity and adds only the frozen Vendor/readback amendment', () => {
  assert.match(schema, /createVendorBodySchema/);
  assert.match(schema, /listVendorsQuerySchema/);
  assert.match(schema, /MODULE_8_REPAIR_HTTP_ROUTES/);
  const quoteLine = schema.match(/export const supplierQuotationItemInputSchema =[\s\S]*?\.strict\(\);/)?.[0] ?? '';
  assert.match(quoteLine, /rfqItemId:\s*uuidSchema/);
  assert.match(schema, /export const rfqItemInputSchema/);
  assert.match(schema, /export const rfqItemResponseSchema/);
  assert.match(schema, /items:\s*z\.array\(rfqItemResponseSchema\)\.min\(1\)/);
  assert.match(schema, /Provide either one requisitionId or direct RFQ items, but not both/);
  assert.match(schemaGate, /rfqItemIdentityExposedThroughRfqResponse: true/);
  assert.match(schemaGate, /directRfqItemsSupported: true/);
  assert.match(schemaGate, /vendorMasterPublicApiGapRecorded: true/);
  assert.doesNotMatch(schema, /createRfqItem|updateRfqItem|deleteRfqItem|listRfqItems/);
});

// Lifecycle/status vocabularies remain string-backed until the controlling source enumerates tokens.
test('Pass 225 does not invent procurement lifecycle enums', () => {
  assert.match(schema, /const statusTokenSchema = z\.string\(\)\.trim\(\)\.min\(1\)\.max\(32\)/);
  assert.doesNotMatch(schema, /z\.enum\(\['(?:DRAFT|SUBMITTED|ISSUED|CLOSED|SELECTED)/);
  assert.doesNotMatch(schema, /PurchaseRequisitionStatus|RfqStatus|SupplierQuotationStatus|VendorStatus/);
  assert.match(schemaGate, /statusEnumsInvented: false/);
  assert.match(schemaGate, /vendorStatusEnumsInvented: false/);
});

// Define safe readback shapes for all eight operations without exposing Company ownership internals.
test('Pass 225 defines requisition RFQ quotation comparison and selection response schemas', () => {
  for (const name of [
    'purchaseRequisitionResponseSchema',
    'listPurchaseRequisitionsResponseSchema',
    'rfqResponseSchema',
    'supplierQuotationResponseSchema',
    'rfqComparisonResponseSchema',
    'selectQuotationResponseSchema',
  ]) assert.match(schema, new RegExp(`export const ${name}`));
  const responses = schema.slice(schema.indexOf('export const purchaseRequisitionItemResponseSchema'));
  assert.doesNotMatch(responses, /companyId:\s*uuidSchema/);
  assert.match(schema, /subtotal:\s*moneySchema/);
  assert.match(schema, /total:\s*moneySchema/);
});

// Reuse the shared error envelope for exactly the six reviewed Module-8 business codes.
test('Pass 225 exports only reviewed Module 8 business errors through shared error classes', () => {
  for (const code of [
    'REQUISITION_NOT_FOUND',
    'RFQ_NOT_FOUND',
    'RFQ_CLOSED',
    'QUOTATION_INVALID',
    'PROCUREMENT_BUDGET_BLOCK',
    'INVALID_VENDOR_SELECTION',
  ]) assert.match(schema, new RegExp(code));
  assert.match(schema, /new NotFoundError/);
  assert.match(schema, /new ValidationError/);
  assert.match(schema, /new ConflictError/);
  assert.match(schema, /export function createModule8Error/);
});

// Schema generation stays fail-honest and stops before repository/service/HTTP/React work.
test('Pass 225 registers fail-honest schema gate and points only to Pass 226 repository', () => {
  assert.equal(rootPackage.scripts['module-8:schema:gate'], 'node scripts/module-8/verify-stage-13-schema.mjs');
  assert.match(schemaGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(schemaGate, /STAGE_13_MODULE_8_SCHEMA_READY_FOR_PASS_226/);
  assert.match(schemaGate, /STAGE_13_MODULE_8_SCHEMA_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(schemaGate, /runtimeDeploymentAllowed: passed && stage12LiveAccepted/);
  assert.match(schemaGate, /repositoryGenerated: false/);
  assert.match(schemaGate, /serviceGenerated: false/);
  assert.match(schemaGate, /routesGenerated: false/);
  assert.match(schemaGate, /reactGenerated: false/);
  assert.match(schemaGate, /Pass 226 - Module 8 Company\/Project-scoped repository/);
});

// Require every requisition register/read query to carry explicit Module-24B Project visibility in addition to Company scope.
test('Pass 226 repository enforces Company ownership and explicit Project visibility for requisition reads', () => {
  assert.match(repository, /requireCompanyRepositoryScope/);
  assert.match(repository, /type ProcurementProjectVisibilityRepositoryInput = Readonly<\{/);
  assert.match(repository, /allowedProjectIds: readonly string\[\] \| null/);
  assert.match(repository, /function buildProjectVisibilityWhere/);
  assert.match(repository, /async listPurchaseRequisitions\(input: ListPurchaseRequisitionsRepositoryInput\)/);
  assert.match(repository, /visibility: ProcurementProjectVisibilityRepositoryInput/);
  assert.match(repository, /async findPurchaseRequisitionById[\s\S]*?visibility: ProcurementProjectVisibilityRepositoryInput/);
  assert.match(repositoryGate, /projectVisibilityRequiredForProjectScopedReads: true/);
});

// Keep list pagination bounded by the same Zod-level Module-8 maximum and deterministic at repository level.
test('Pass 226 repository bounds requisition pagination before Prisma', () => {
  assert.match(repository, /MODULE_8_MAX_PAGE_SIZE/);
  assert.match(repository, /function assertPageWindow/);
  assert.match(repository, /Repository take must be between 1 and \$\{MODULE_8_MAX_PAGE_SIZE\}/);
  assert.match(repository, /skip: input\.skip/);
  assert.match(repository, /take: input\.take/);
  assert.match(repositoryGate, /requisitionPaginationBounded: true/);
});

// Prepare transaction-safe orchestration without moving business state policy into the repository.
test('Pass 226 repository supports transactions and state-sensitive Project requisition and RFQ locks', () => {
  assert.match(repository, /type RepositoryClient = DatabaseClient \| TransactionClient/);
  assert.match(repository, /async lockProjectForProcurementWrite/);
  assert.match(repository, /FROM projects[\s\S]*?FOR UPDATE/);
  assert.match(repository, /async lockPurchaseRequisitionForWrite/);
  assert.match(repository, /FROM purchase_requisitions[\s\S]*?FOR UPDATE/);
  assert.match(repository, /async lockRfqForWrite/);
  assert.match(repository, /FROM rfqs[\s\S]*?FOR UPDATE/);
  assert.match(repositoryGate, /transactionClientSupported: true/);
});

// Validate Project cost structures through Module 6 while keeping status/activity interpretation for the service pass.
test('Pass 226 repository validates requisition cost identities against posting-enabled Module 6 mappings', () => {
  assert.match(repository, /async findPostingCostStructures/);
  assert.match(repository, /this\.db\.projectCostCode\.findMany/);
  assert.match(repository, /isPostingAllowed: true/);
  assert.match(repository, /wbsNodeId: item\.wbsNodeId/);
  assert.match(repository, /costCodeId: item\.costCodeId/);
  assert.match(repository, /costTypeId: item\.costTypeId/);
  assert.match(repository, /requestedStructures\.some\(\(item\) => !validKeys\.has\(costStructureKey\(item\)\)\)/);
  assert.match(repositoryGate, /postingCombinationValidationPrepared: true/);
});

// Requisition creation stores only server-supplied numbering/state plus reviewed business line values.
test('Pass 226 repository creates requisitions without client authority or invented lifecycle rules', () => {
  const create = repository.match(/async createPurchaseRequisition\([\s\S]*?\n  \}/)?.[0] ?? '';
  for (const field of ['projectId', 'prNo', 'requestedBy', 'requiredDate', 'status', 'purpose']) {
    assert.match(create, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['itemId', 'description', 'quantity', 'unit', 'estimatedRate', 'wbsNodeId', 'costCodeId', 'costTypeId']) {
    assert.match(create, new RegExp(`\\b${field}\\b`));
  }
  assert.match(create, /scope\.createData/);
  assert.doesNotMatch(repository, /\bPurchaseRequisitionStatus\b|z\.enum|['"](?:DRAFT|SUBMITTED|APPROVED)['"]/);
});

// Module 8 owns Vendor rows, but Pass 226 must expose only reads needed by issue/quotation workflows because public vendor CRUD is still unspecified.
test('Pass 363 amends the historical read-only Vendor boundary with narrow non-destructive master methods', () => {
  assert.match(repository, /async findVendorsByIds/);
  assert.match(repository, /async listVendors/);
  assert.match(repository, /async createVendor/);
  assert.match(repository, /async updateVendor/);
  assert.match(repository, /async updateVendorStatus/);
  assert.match(repository, /async createVendorContact/);
  assert.match(repository, /async updateVendorContact/);
  assert.doesNotMatch(repository, /this\.db\.vendor\.(?:delete|deleteMany)/);
  assert.match(repositoryGate, /vendorMasterWriteMethodsGenerated: false/);
});

// Keep RFQ source requisition, buyer and invitation records within authenticated Company and Project boundaries.
test('Pass 226 repository scopes RFQ creation and invitations without inventing vendor state tokens', () => {
  assert.match(repository, /async createRfq/);
  assert.match(repository, /id: input\.requisitionId, projectId: input\.projectId/);
  assert.match(repository, /id: input\.buyerUserId/);
  assert.match(repository, /async createRfqInvitations/);
  assert.match(repository, /vendors\.length !== vendorIds\.length/);
  assert.match(repository, /async listRfqVendors/);
  assert.match(repository, /companyId: scope\.companyId/);
  assert.match(repositoryGate, /rfqInvitationCompanyScopePrepared: true/);
});

// Store quotation totals supplied only by the later service and require the quotation Vendor to have an RFQ invitation.
test('Pass 226 repository persists service-calculated quotations only for invited vendors', () => {
  assert.match(repository, /async createSupplierQuotation/);
  assert.match(repository, /this\.findRfqVendor\(projectId, input\.rfqId, input\.vendorId\)/);
  for (const field of ['subtotal', 'tax', 'total']) assert.match(repository, new RegExp(`\\b${field}: input\\.${field}\\b`));
  assert.match(repository, /total: item\.total/);
  assert.doesNotMatch(repository, /\+\s*item\.unitRate|Number\(|parseFloat\(|Math\./);
  assert.match(repositoryGate, /quotationTotalsCalculatedInRepository: false/);
  assert.match(repositoryGate, /quotationInvitationScopePrepared: true/);
});

// Repository revalidates every quotation line through the exact Company/Project RFQ before persistence.
test('Pass 362 repository validates the repaired RFQ-item target', () => {
  assert.match(repository, /async findRfqItemsByIds/);
  assert.match(repository, /this\.db\.rfqItem\.findMany/);
  assert.match(repository, /rfqId,/);
  assert.match(repository, /projectId,/);
  assert.match(repository, /requestedRfqItemIds\.length !== input\.items\.length/);
  assert.match(repository, /rfqItems\.length !== requestedRfqItemIds\.length/);
  assert.match(repository, /rfqItemId: item\.rfqItemId/);
  assert.match(repositoryGate, /rfqItemScopeValidationPrepared: true/);
});

// Selection support is limited to controlled state persistence; no ranking engine, selected-column invention or financial commitment is added.
test('Pass 226 repository keeps quotation selection pre-commitment and assumption-free', () => {
  assert.match(repository, /async updateSupplierQuotationStatus/);
  assert.match(repository, /async updateRfqStatus/);
  assert.doesNotMatch(repository, /selectedQuotationId|selectionRationale|exceptionReason|evaluatedPrice|ranking|exchangeRate|lowestOffer/);
  assert.doesNotMatch(repository, /costCommitment\.(?:create|update|upsert)|journal\.(?:create|update)|apInvoice\.(?:create|update)/);
  assert.match(repositoryGate, /selectionPersistenceColumnInvented: false/);
  assert.match(repositoryGate, /financialCommitmentWriteMethodsGenerated: false/);
  assert.match(repositoryGate, /comparisonRankingCalculatedInRepository: false/);
});

// Register the fail-honest repository gate and stop before Module-8 service/HTTP/React generation.
test('Pass 226 registers fail-honest repository gate and points only to Pass 227 service', () => {
  assert.equal(rootPackage.scripts['module-8:repository:gate'], 'node scripts/module-8/verify-stage-13-repository.mjs');
  assert.match(repositoryGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(repositoryGate, /STAGE_13_MODULE_8_REPOSITORY_READY_FOR_PASS_227/);
  assert.match(repositoryGate, /STAGE_13_MODULE_8_REPOSITORY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(repositoryGate, /runtimeDeploymentAllowed: passed && stage12LiveAccepted/);
  assert.match(repositoryGate, /serviceGenerated: false/);
  assert.match(repositoryGate, /routesGenerated: false/);
  assert.match(repositoryGate, /reactGenerated: false/);
  assert.match(repositoryGate, /Pass 227 - Module 8 service\/business rules/);
});

// Pass 227 must revalidate exact Module-24B Project permission instead of trusting route/UI visibility alone.
test('Pass 227 revalidates Module 8 Project resource policy in the service', () => {
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(service, /projectScope/);
  assert.match(service, /scope\.kind === 'not-resolved'/);
  assert.match(service, /procurement\.pr\.read/);
  assert.match(service, /procurement\.pr\.create/);
  assert.match(service, /procurement\.rfq\.manage/);
  assert.match(service, /procurement\.quotation\.record/);
  assert.match(service, /procurement\.quotation\.select/);
  assert.match(serviceGate, /projectResourcePolicyRevalidated: true/);
});

// Business numbers must use Foundation numbering inside the owning service transaction.
test('Pass 227 allocates PR and RFQ numbers through Foundation numbering', () => {
  assert.match(service, /allocateCompanyNumber/);
  assert.match(service, /PURCHASE_REQUISITION_SEQUENCE_KEY = 'procurement\.pr'/);
  assert.match(service, /RFQ_SEQUENCE_KEY = 'procurement\.rfq'/);
  assert.match(service, /sequenceKey: PURCHASE_REQUISITION_SEQUENCE_KEY/);
  assert.match(service, /sequenceKey: RFQ_SEQUENCE_KEY/);
  assert.match(serviceGate, /requisitionSequenceKey: 'procurement\.pr'/);
  assert.match(serviceGate, /rfqSequenceKey: 'procurement\.rfq'/);
});

// Lifecycle values may exist internally but must not leak into a new public Zod enum vocabulary.
test('Pass 227 keeps procurement lifecycle tokens internal and string-backed', () => {
  for (const token of ['REQUISITION_DRAFT', 'RFQ_DRAFT', 'RFQ_ISSUED', 'QUOTATION_RECEIVED', 'QUOTATION_SELECTED']) {
    assert.match(service, new RegExp(`const ${token} =`));
  }
  assert.doesNotMatch(schema, /PurchaseRequisitionStatus|RfqStatus|SupplierQuotationStatus|VendorStatus/);
  assert.doesNotMatch(schema, /z\.enum\(\['(?:DRAFT|SUBMITTED|ISSUED|SELECTED)/);
  assert.match(serviceGate, /lifecycleTokensInternalOnly: true/);
  assert.match(serviceGate, /publicLifecycleEnumsAdded: false/);
});

// Requisition submission may reuse Module 22 but must keep the business-state transition in Module 8.
test('Pass 227 integrates optional requisition approval through Module 22 without a second approval engine', () => {
  assert.match(service, /ApprovalsService/);
  assert.match(service, /requestApprovalInTransaction/);
  assert.match(service, /resourceType: 'purchase_requisition'/);
  assert.match(service, /sourceModule: 'procurement'/);
  assert.match(service, /sourceType: 'purchase-requisition-submit'/);
  assert.match(service, /REQUISITION_PENDING_APPROVAL/);
  assert.match(service, /requisitionStatusFromApproval/);
  assert.doesNotMatch(service, /createApprovalDefinition|appendApprovalAction|approvalAction\.create/);
  assert.match(serviceGate, /requisitionApprovalUsesModule22: true/);
});

// The only Module-7 policy enforced now is structural budget readiness; no hidden amount threshold is invented.
test('Pass 227 checks a frozen Module 7 budget without writing job cost or inventing thresholds', () => {
  assert.match(service, /BudgetsJobCostingRepository/);
  assert.match(service, /findLatestProjectBudgetByStatus\(projectId, BUDGET_FROZEN\)/);
  assert.match(service, /PROCUREMENT_BUDGET_BLOCK/);
  assert.doesNotMatch(service, /costCommitment\.(?:create|update|upsert)|costActual\.(?:create|update|upsert)/);
  assert.doesNotMatch(service, /budgetTolerance|budgetThreshold|overBudgetPercent|availableBudget/);
  assert.match(serviceGate, /budgetBoundaryReadOnly: true/);
  assert.match(serviceGate, /module7CommitmentWritesGenerated: false/);
});

// Requisition lines must still resolve to active Module-6 posting structures at the sensitive service write.
test('Pass 227 revalidates active WBS Cost Code and Cost Type records', () => {
  assert.match(service, /WbsCostCodesRepository/);
  assert.match(service, /requireActiveCostStructures/);
  assert.match(service, /findPostingCostStructures/);
  assert.match(service, /findWbsNodesByIds/);
  assert.match(service, /findCostCodesByIds/);
  assert.match(service, /findCostTypesByIds/);
  assert.match(service, /COST_STRUCTURE_ACTIVE/);
});

// Vendor eligibility uses only an internal implementation token and creates no vendor-management API.
test('Pass 363 preserves active-qualified RFQ eligibility while adding the reviewed Vendor amendment', () => {
  assert.match(service, /VENDOR_ACTIVE = 'ACTIVE'/);
  assert.match(service, /VENDOR_QUALIFIED = 'QUALIFIED'/);
  assert.match(service, /requireEligibleVendors/);
  assert.match(service, /qualificationStatus/);
  assert.match(service, /async createVendor/);
  assert.match(service, /async updateVendor/);
  assert.doesNotMatch(repository, /this\.db\.vendor\.(?:delete|deleteMany)/);
  assert.match(serviceGate, /vendorEligibilityInternalTokens: \['ACTIVE', 'QUALIFIED'\]/);
});

// Quotation totals must be calculated with exact arithmetic and never trusted from browser fields.
test('Pass 227 calculates supplier quotation totals exactly in the service', () => {
  assert.match(service, /function decimalToScale4/);
  assert.match(service, /function moneyToMinorUnits/);
  assert.match(service, /PRODUCT_ROUND_HALF_UP/);
  assert.match(service, /quantityRateToMinorUnits/);
  assert.match(service, /gross - discount/);
  assert.match(service, /subtotal: minorUnitsToMoney\(subtotal\)/);
  assert.match(service, /tax: minorUnitsToMoney\(tax\)/);
  assert.match(service, /total: minorUnitsToMoney\(total\)/);
  assert.doesNotMatch(service, /\bparseFloat\(|\bparseInt\(|\bMath\.round\(/);
  assert.match(serviceGate, /quotationTotalsCalculatedServerSide: true/);
});

// Comparison may be conservative but must not invent FX/ranking contracts or silently compare mismatched quantities.
test('Pass 227 keeps quotation comparison conservative without inventing FX or ranking fields', () => {
  assert.match(repository, /async findCompanyBaseCurrency/);
  assert.match(service, /requireComparableQuotations/);
  assert.match(service, /vendor\.currency/);
  assert.match(service, /quotationQuantitySignature/);
  assert.match(service, /rfqItemId/);
  assert.match(service, /storedMoneyToMinorUnits/);
  assert.doesNotMatch(service, /\b(?:exchangeRate|fxRate|currencyConversion|evaluatedPrice|scoreWeight|weightedScore)\s*[=:]/);
  assert.doesNotMatch(schema, /\b(?:rank|score|evaluatedPrice|exchangeRate)\s*:/);
  assert.match(serviceGate, /comparisonRankingFieldsAdded: false/);
});

// Selected-vendor rationale remains durable in audit/outbox because the source defines no selection column.
test('Pass 227 preserves selection rationale in audit and outbox without inventing a selected quotation column', () => {
  assert.match(service, /requireRationaleForNonLowestSelection/);
  assert.match(service, /isLowestByStoredTotal/);
  assert.match(service, /rationale: input\.rationale\?\.trim\(\) \?\? null/);
  assert.match(service, /eventType: 'rfq\.quotation_selected'/);
  assert.doesNotMatch(repository, /selectedQuotationId|selectionRationale|exceptionReason/);
  assert.match(serviceGate, /selectionRationaleStoredInAuditOutboxOnly: true/);
  assert.match(serviceGate, /selectionPersistenceColumnInvented: false/);
});

// All four reviewed events belong to atomic service transactions; creation writes do not invent extra integration events.
test('Pass 227 emits exactly the reviewed procurement outbox event vocabulary', () => {
  for (const eventName of [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ]) assert.match(service, new RegExp(`eventType: '${eventName.replaceAll('.', '\\.')}'`));
  assert.doesNotMatch(service, /eventType: 'purchase_requisition\.created'/);
  assert.doesNotMatch(service, /eventType: 'rfq\.created'/);
  assert.match(service, /recordAudit/);
  assert.match(service, /recordOutboxEvent/);
  assert.match(service, /withTransaction/);
});

// Quotation selection must end Module 8 at a recommendation state with no accounting/job-cost side effect.
test('Pass 227 keeps quotation selection pre-commitment', () => {
  assert.match(service, /financialCommitmentCreated: false/);
  assert.doesNotMatch(service, /FinanceRepository|journal\.(?:create|update)|apInvoice\.(?:create|update)/);
  assert.doesNotMatch(service, /costCommitment\.(?:create|update|upsert)|createCommitment|postCommitment/);
  assert.match(serviceGate, /selectionCreatesFinancialCommitment: false/);
  assert.match(serviceGate, /financeWritesGenerated: false/);
});

// Service creates stable RFQ line snapshots and revalidates quotation item ownership before writes.
test('Pass 362 service resolves RFQ item identity without a separate subsystem', () => {
  assert.match(service, /sourceRequisition\.items\.map/);
  assert.match(service, /requisitionItemId: item\.id/);
  assert.match(service, /requisitionItemId: null/);
  assert.match(service, /repository\.findRfqItemsByIds/);
  assert.match(service, /requestedRfqItemIds\.length !== calculated\.items\.length/);
  assert.match(serviceGate, /rfqItemScopeRevalidatedByService: true/);
});

// Register the fail-honest service gate and stop before HTTP/React generation.
test('Pass 227 registers fail-honest service gate and points only to Pass 228 HTTP', () => {
  assert.equal(rootPackage.scripts['module-8:service:gate'], 'node scripts/module-8/verify-stage-13-service.mjs');
  assert.match(serviceGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(serviceGate, /STAGE_13_MODULE_8_SERVICE_READY_FOR_PASS_228/);
  assert.match(serviceGate, /STAGE_13_MODULE_8_SERVICE_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(serviceGate, /runtimeDeploymentAllowed: passed && stage12LiveAccepted/);
  assert.match(serviceGate, /routesGenerated: false/);
  assert.match(serviceGate, /reactGenerated: false/);
  assert.match(serviceGate, /Pass 228 - Module 8 Fastify routes/);
});


// Add only the reviewed HTTP/OpenAPI/module-registration layer in Pass 228.
test('Pass 228 adds the Module 8 route and index files without generating React', () => {
  assert.match(routes, /registerProcurementRoutes/);
  assert.match(moduleIndex, /registerProcurementRoutes/);
  assert.match(contract, /Pass 228 adds only the HTTP\/OpenAPI\/module-registration layer/);
  assert.match(contract, /React Procurement pages remain deferred to Pass 230/);
});

// Register exactly the eight reviewed method/path pairs and no vendor CRUD or commitment endpoints.
test('Pass 363 preserves the eight source routes and adds only the frozen repair route family', () => {
  const expected = [
    ['get', '/api/v1/procurement/requisitions'],
    ['post', '/api/v1/procurement/requisitions'],
    ['post', '/api/v1/procurement/requisitions/:id/submit'],
    ['post', '/api/v1/procurement/rfqs'],
    ['post', '/api/v1/procurement/rfqs/:id/issue'],
    ['post', '/api/v1/procurement/rfqs/:id/quotations'],
    ['get', '/api/v1/procurement/rfqs/:id/comparison'],
    ['post', '/api/v1/procurement/rfqs/:id/select-quotation'],
  ];
  for (const [method, route] of expected) {
    assert.ok(routes.includes(`app.${method}('${route}'`), `${method.toUpperCase()} ${route}`);
  }
  assert.match(routes, /module8ListVendors/);
  assert.match(routes, /module8GetPurchaseRequisition/);
  assert.match(routes, /module8RevisePurchaseRequisition/);
  assert.match(routes, /module8ListRfqs/);
  assert.match(routes, /module8GetRfq/);
  assert.doesNotMatch(routes, /commitments|actuals|journals|payables/);
});

// Every operation authenticates, while Project-specific permission evaluation remains service-authoritative.
test('Pass 363 authenticates source and repair routes while preserving Module 24B Project permission semantics', () => {
  const authCalls = (routes.match(/await authenticateRequest\(request, options\.database\);/g) ?? []).length;
  const securedSchemas = (routes.match(/security: BEARER_SECURITY/g) ?? []).length;
  assert.ok(authCalls >= 18);
  assert.ok(securedSchemas >= 18);
  assert.doesNotMatch(routes, /hasPermission|requireRoutePermission/);
  assert.match(service, /findEffectivePermissionCodesForProject/);
  assert.match(service, /listProjectIdsWithPermission/);
  assert.match(httpGate, /projectPermissionRemainsServiceAuthoritative: true/);
});

// Reparse every body/params/query segment through the frozen Pass-225 Zod schemas.
test('Pass 228 keeps strict Zod validation at the HTTP boundary', () => {
  for (const zodSchema of [
    'listPurchaseRequisitionsQuerySchema',
    'createPurchaseRequisitionBodySchema',
    'procurementIdParamsSchema',
    'submitPurchaseRequisitionBodySchema',
    'createRfqBodySchema',
    'issueRfqBodySchema',
    'recordSupplierQuotationBodySchema',
    'getRfqComparisonQuerySchema',
    'selectQuotationBodySchema',
  ]) assert.match(routes, new RegExp(`parseRequest\\(${zodSchema}`));
  assert.match(routes, /request\.body \?\? \{\}/);
  assert.match(routes, /additionalProperties: false/);
});

// Validate all success DTOs against the existing response schemas before serialization.
test('Pass 228 validates every success response through the Pass 225 schemas', () => {
  for (const responseSchema of [
    'listPurchaseRequisitionsResponseSchema',
    'createPurchaseRequisitionResponseSchema',
    'submitPurchaseRequisitionResponseSchema',
    'createRfqResponseSchema',
    'issueRfqResponseSchema',
    'recordSupplierQuotationResponseSchema',
    'rfqComparisonResponseSchema',
    'selectQuotationResponseSchema',
  ]) assert.match(routes, new RegExp(`${responseSchema}\\.parse`));
  assert.match(httpGate, /responseZodValidationRetained: true/);
});

// Keep money and quantity/rate values serialized as exact strings in OpenAPI.
test('Pass 228 documents exact decimal strings and keeps quotation totals server-owned', () => {
  assert.match(routes, /const MONEY_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  assert.match(routes, /const QUANTITY_RATE_JSON_SCHEMA = \{[\s\S]*type: 'string'/);
  const quotationBody = routes.match(/operationId: 'module8RecordSupplierQuotation'[\s\S]*?response:/)?.[0] ?? '';
  assert.doesNotMatch(quotationBody, /subtotal:/);
  assert.doesNotMatch(quotationBody, /total:/);
  assert.match(routes, /const QUOTATION_ITEM_INPUT_JSON_SCHEMA = \{[\s\S]*discount: MONEY_JSON_SCHEMA[\s\S]*tax: MONEY_JSON_SCHEMA/);
  assert.match(quotationBody, /items: \{ type: 'array', minItems: 1, items: QUOTATION_ITEM_INPUT_JSON_SCHEMA \}/);
  assert.match(httpGate, /exactDecimalOpenApiSerialization: true/);
});

// Do not accept Company, actor, numbering, lifecycle or approval authority in request bodies.
test('Pass 228 keeps all reviewed server-owned procurement authority out of HTTP bodies', () => {
  const requestSections = [...routes.matchAll(/operationId: 'module8[^']+'[\s\S]*?response:/g)]
    .map((match) => match[0])
    .join('\n');
  for (const field of [
    'companyId',
    'actorUserId',
    'requestedBy',
    'buyerUserId',
    'prNo',
    'rfqNo',
    'approvalResult',
    'financialCommitmentAmount',
  ]) assert.doesNotMatch(requestSections, new RegExp(`\\b${field}\\s*:`));
});

// Keep only source-reviewed Module-8 business errors plus established shared Foundation errors.
test('Pass 228 documents the reviewed Module 8 error vocabulary without inventing new business codes', () => {
  for (const code of [
    'REQUISITION_NOT_FOUND',
    'RFQ_NOT_FOUND',
    'RFQ_CLOSED',
    'QUOTATION_INVALID',
    'PROCUREMENT_BUDGET_BLOCK',
    'INVALID_VENDOR_SELECTION',
  ]) assert.match(routes, new RegExp(code));
  for (const shared of [
    'INVALID_REQUEST',
    'INVALID_COST_STRUCTURE',
    'AUTHENTICATION_REQUIRED',
    'AUTH_SESSION_EXPIRED',
    'FORBIDDEN',
    'RESOURCE_NOT_FOUND',
    'INTERNAL_SERVER_ERROR',
  ]) assert.match(routes, new RegExp(shared));
  assert.doesNotMatch(routes, /VENDOR_NOT_FOUND|REQUISITION_ALREADY_APPROVED|RFQ_NOT_READY|QUOTE_DUPLICATE/);
});

// Publish Module 8 through its index and compose it after its Module-7 prerequisite.
test('Pass 228 exports and registers the Module 8 Fastify plugin', () => {
  assert.match(moduleIndex, /export \{ ProcurementRepository \} from '\.\/procurement\.repository\.js'/);
  assert.match(moduleIndex, /export \{ ProcurementService \} from '\.\/procurement\.service\.js'/);
  assert.match(moduleIndex, /export \{ registerProcurementRoutes \} from '\.\/procurement\.routes\.js'/);
  assert.match(app, /import \{ registerProcurementRoutes \} from '\.\/modules\/procurement\/index\.js'/);
  assert.match(app, /app\.register\(registerBudgetsJobCostingRoutes, \{[\s\S]*database: options\.database,[\s\S]*budgetApprovalDefinitionCode: options\.budgetApprovalDefinitionCode \?\? null[\s\S]*\}\);[\s\S]*app\.register\(registerProcurementRoutes/);
});

// Wire only the narrow server-owned approval and non-lowest rationale policy configuration.
test('Pass 228 wires Module 8 service policy options through buildApp', () => {
  assert.match(routes, /requisitionApprovalDefinitionCode: options\.requisitionApprovalDefinitionCode \?\? null/);
  assert.match(routes, /requireRationaleForNonLowestSelection: options\.requireRationaleForNonLowestSelection === true/);
  assert.match(app, /procurementRequisitionApprovalDefinitionCode\?: string \| null/);
  assert.match(app, /procurementRequireRationaleForNonLowestSelection\?: boolean/);
  assert.match(app, /requisitionApprovalDefinitionCode: options\.procurementRequisitionApprovalDefinitionCode \?\? null/);
  assert.match(app, /requireRationaleForNonLowestSelection: options\.procurementRequireRationaleForNonLowestSelection === true/);
});

// Give all eight reviewed operations stable OpenAPI operation IDs and one consistent module tag.
test('Pass 363 preserves the eight stable source OpenAPI operations and documents repair operations', () => {
  for (const operationId of [
    'module8ListPurchaseRequisitions',
    'module8CreatePurchaseRequisition',
    'module8SubmitPurchaseRequisition',
    'module8CreateRfq',
    'module8IssueRfq',
    'module8RecordSupplierQuotation',
    'module8GetRfqComparison',
    'module8SelectQuotation',
  ]) assert.match(routes, new RegExp(operationId));
  assert.ok((routes.match(/tags: \['Module 8 - Procurement & RFQ'\]/g) ?? []).length >= 18);
  for (const operationId of ['module8ListVendors', 'module8CreateVendor', 'module8GetPurchaseRequisition', 'module8RevisePurchaseRequisition', 'module8ListRfqs', 'module8GetRfq']) assert.match(routes, new RegExp(operationId));
});

// Register the fail-honest Pass-228 gate and stop at integration/security verification next.
test('Pass 228 HTTP gate is registered and points only to Pass 229', () => {
  assert.equal(rootPackage.scripts['module-8:http:gate'], 'node scripts/module-8/verify-stage-13-http.mjs');
  assert.match(httpGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(httpGate, /STAGE_13_MODULE_8_HTTP_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(httpGate, /STAGE_13_MODULE_8_HTTP_READY_FOR_PASS_229/);
  assert.match(httpGate, /runtimeDeploymentAllowed: passed && stage12LiveAccepted/);
  assert.match(httpGate, /exactReviewedRouteCount: 8/);
  assert.match(httpGate, /publicVendorMasterRoutesAdded: 0/);
  assert.match(httpGate, /commitmentWriteRoutesAdded: 0/);
  assert.match(httpGate, /Pass 229 - Module 8 PostgreSQL\/Fastify integration/);
  assert.match(contract, /Pass 229 - Module 8 PostgreSQL\/Fastify integration/);
});


// Prepare the full reviewed Procurement workflow over the actual Fastify/PostgreSQL boundary.
test('Pass 229 prepares real Module 8 requisition through quotation-selection integration coverage', () => {
  for (const fragment of [
    'Module 8 PostgreSQL/Fastify workflow covers requisition, RFQ, quotation comparison and pre-commitment selection',
    '/api/v1/procurement/requisitions',
    '/api/v1/procurement/rfqs',
    '/issue',
    '/quotations',
    '/comparison',
    '/select-quotation',
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ]) assert.ok(integrationTest.includes(fragment), fragment);
  assert.match(integrationTest, /costCommitment\.count/);
  assert.match(integrationTest, /journal\.count/);
  assert.match(integrationTest, /financialCommitmentCreated, false/);
});

// Verify optional approval reuse without making Module 22 own the requisition lifecycle.
test('Pass 229 prepares Module 22 approval integration and replay-safety verification', () => {
  assert.match(integrationTest, /procurementRequisitionApprovalDefinitionCode: 'PROCUREMENT_PR'/);
  assert.match(integrationTest, /PENDING_APPROVAL/);
  assert.match(integrationTest, /approvalRequest\.findMany/);
  assert.match(integrationTest, /eventType: 'approval\.requested'/);
  assert.match(integrationTest, /requests\.length, 1/);
});

// Cover Project RBAC, tenant isolation, closed Projects, budget readiness and browser authority rejection.
test('Pass 229 prepares negative authorization and Project budget security verification', () => {
  for (const token of [
    'module8-reader@example.test',
    'module8-member@example.test',
    'module8-admin-b@example.test',
    'FORBIDDEN',
    'PROCUREMENT_BUDGET_BLOCK',
    'INVALID_REQUEST',
    'CLOSED_PROJECT_ID',
  ]) assert.match(integrationTest, new RegExp(token.replace('.', '\\.')));
  assert.match(integrationTest, /companyId: COMPANY_B_ID/);
  assert.match(integrationTest, /requestedBy: ADMIN_B_ID/);
  assert.match(integrationTest, /prNo: 'ATTACK-PR'/);
});

// Keep Vendor eligibility, exact totals, conservative comparison and non-lowest rationale inside source-backed rules.
test('Pass 229 prepares Vendor, quotation and comparison validation coverage without invented FX', () => {
  for (const code of ['INVALID_VENDOR_SELECTION', 'RFQ_CLOSED', 'QUOTATION_INVALID']) {
    assert.match(integrationTest, new RegExp(code));
  }
  assert.match(integrationTest, /VENDOR_INACTIVE_ID/);
  assert.match(integrationTest, /VENDOR_UNQUALIFIED_ID/);
  assert.match(integrationTest, /VENDOR_EUR_ID/);
  assert.match(integrationTest, /procurementRequireRationaleForNonLowestSelection: true/);
  assert.match(integrationTest, /unsupported cross-currency normalization instead of inventing FX/);
  assert.match(integrationTest, /subtotal, '240\.00'/);
  assert.match(integrationTest, /total, '245\.00'/);
});

// Verify Stage-13 database triggers at their real persistence boundary.
test('Pass 229 prepares direct database scope-trigger verification', () => {
  assert.match(integrationTest, /purchaseRequisitionItem\.create/);
  assert.match(integrationTest, /client\.rfq\.create/);
  assert.match(integrationTest, /client\.rfqVendor\.create/);
  assert.match(integrationTest, /client\.supplierQuotation\.create/);
  assert.match(integrationTest, /assert\.rejects/);
});

// Lock generated OpenAPI to the exact eight reviewed operations and forbidden surfaces.
test('Pass 229 live OpenAPI verification checks exactly eight Module 8 operations and narrow authority', () => {
  for (const operationId of [
    'module8ListPurchaseRequisitions',
    'module8CreatePurchaseRequisition',
    'module8SubmitPurchaseRequisition',
    'module8CreateRfq',
    'module8IssueRfq',
    'module8RecordSupplierQuotation',
    'module8GetRfqComparison',
    'module8SelectQuotation',
  ]) assert.match(integrationTest, new RegExp(operationId));
  assert.match(integrationTest, /documented\.sort\(\), actual\.sort\(\)/);
  assert.match(integrationTest, /\/api\/v1\/procurement\/vendors/);
  assert.match(integrationTest, /convert-to-po/);
  assert.match(integrationTest, /\/api\/v1\/procurement\/commitments/);
  assert.match(integrationTest, /queryNames, \['page', 'pageSize', 'projectId'\]/);
});

// Register the guarded static/live verification and advance only to the React pass after genuine live verification.
test('Pass 229 integration-security gate is registered, fail-honest and points only to Pass 230', () => {
  assert.equal(
    rootPackage.scripts['test:integration:module-8'],
    'node -e "if (process.env.RUN_FOUNDATION_DB_TESTS !== \'1\') throw new Error(\'Set RUN_FOUNDATION_DB_TESTS=1 for Module 8 live integration/security verification.\')" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 tests/integration/module-8-api.integration.test.mjs'
  );
  assert.equal(rootPackage.scripts['module-8:integration-security:gate'], 'node scripts/module-8/verify-stage-13-integration-security.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-8:integration-security:gate:live'], 'node scripts/module-8/verify-stage-13-integration-security.mjs --mode=live');
  assert.match(integrationSecurityGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(integrationSecurityGate, /STAGE_12_LIVE_HANDOFF_REQUIRED/);
  assert.match(integrationSecurityGate, /STAGE_13_MODULE_8_INTEGRATION_SECURITY_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(integrationSecurityGate, /STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230/);
  assert.match(integrationSecurityGate, /runtimeVerificationComplete: passed && mode === 'live' && stage12LiveAccepted/);
  assert.match(integrationSecurityGate, /productionRuntimeChanges: 0/);
  assert.match(integrationSecurityGate, /financialCommitmentWritesAdded: 0/);
  assert.match(integrationSecurityGate, /Pass 230 - Module 8 React Procurement/);
  assert.match(contract, /Pass 230 - Module 8 React Procurement/);
});


// Build the source-defined React feature folders and keep the browser on the eight reviewed operations only.
test('Pass 363 keeps the four-file React feature and adds only the frozen repair API surfaces', () => {
  for (const operation of [
    'listPurchaseRequisitions',
    'createPurchaseRequisition',
    'submitPurchaseRequisition',
    'createRfq',
    'issueRfq',
    'recordSupplierQuotation',
    'getRfqComparison',
    'selectQuotation',
  ]) assert.match(webApi, new RegExp(`export function ${operation}\\b`));
  for (const operation of ['listVendors', 'createVendor', 'changeVendorLifecycle', 'getPurchaseRequisition', 'revisePurchaseRequisition', 'listRfqs', 'getRfq']) assert.match(webApi, new RegExp(`export function ${operation}\\b`));
  assert.doesNotMatch(webApi, /convert-to-po|commitments|journals|payables/);
});

// Keep TanStack Query as the server-state owner and invalidate one narrow Module-8 query family after writes.
test('Pass 230 uses TanStack Query for requisition and quotation server state', () => {
  assert.match(webHooks, /const MODULE_8_QUERY_KEY = \['module-8', 'procurement'\]/);
  assert.match(webHooks, /usePurchaseRequisitions/);
  assert.match(webHooks, /useRfqComparison/);
  assert.ok((webHooks.match(/useMutation\(/g) ?? []).length >= 9);
  assert.match(webHooks, /invalidateQueries\(\{ queryKey: MODULE_8_QUERY_KEY \}\)/);
});

// Use React Hook Form plus Zod for every source-defined browser write workflow and exact decimal strings.
test('Pass 230 validates requisition RFQ quotation and selection inputs in the browser', () => {
  assert.match(webWorkspace, /zodResolver/);
  assert.match(webWorkspace, /useFieldArray/);
  assert.match(webWorkspace, /requisitionFormSchema/);
  assert.match(webWorkspace, /rfqFormSchema/);
  assert.match(webWorkspace, /issueRfqFormSchema/);
  assert.match(webWorkspace, /quotationFormSchema/);
  assert.match(webWorkspace, /selectionFormSchema/);
  assert.match(webWorkspace, /at most 4 decimal places/);
  assert.match(webWorkspace, /at most 2 decimal places/);
});

// Reuse Module-6 posting assignments and never send Company/actor/numbering/lifecycle/totals from React.
test('Pass 230 reuses Project cost structures and keeps procurement authority server-owned', () => {
  assert.match(webWorkspace, /useWbsTree/);
  assert.match(webWorkspace, /useCostCodes/);
  assert.match(webWorkspace, /assignment\.wbsNodeId/);
  assert.match(webWorkspace, /assignment\.costCodeId/);
  assert.match(webWorkspace, /assignment\.costTypeId/);
  for (const field of ['companyId', 'actorUserId', 'requestedBy', 'buyerUserId', 'prNo', 'rfqNo', 'subtotal', 'total', 'status']) {
    assert.doesNotMatch(webApi, new RegExp(`${field}\\?:`));
  }
});

// UI keeps unresolved Vendor/RFQ register gaps explicit while using real RFQ line identities from the existing response.
test('Pass 363 React reopens durable RFQs and still uses server-owned RFQ item ids', () => {
  assert.match(webPage, /Vendor-master amendment and durable RFQ\/Requisition readback/);
  assert.match(webWorkspace, /quotationLinesFromRfq/);
  assert.match(webWorkspace, /Existing RFQs/);
  assert.match(webApi, /listVendors/);
  assert.match(webApi, /listRfqs/);
  assert.match(webApi, /getRfq\(/);
  assert.doesNotMatch(webApi, /listRfqItems|getRfqItem|createRfqItem|updateRfqItem/);
});

// Render the minimum source UI: requisition register, RFQ builder, vendor invitation, quote entry/import, comparison and selection.
test('Pass 230 renders the minimum Procurement UI from Appendix A', () => {
  for (const heading of [
    'Purchase requisition register',
    'RFQ builder & Vendor invitation',
    'Supplier quotation entry / local import',
    'Quotation comparison & selection approval',
  ]) assert.ok(webWorkspace.includes(heading), heading);
  assert.match(webWorkspace, /Lowest stored total/);
  assert.match(webWorkspace, /No financial commitment is created by this selection/);
});

// Keep permission visibility narrow while leaving exact Project-scoped authorization to the API.
test('Pass 230 adds permission-aware Procurement navigation and Project selection', () => {
  for (const permission of [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ]) assert.match(adminShell, new RegExp(permission.replaceAll('.', '\\.')));
  assert.match(adminShell, /activeView === 'procurement'/);
  assert.match(adminShell, /<ProcurementPage \/>/);
  assert.match(webPage, /useProjectWorkspaceVisibility/);
  assert.match(webPage, /selectedIsInRestrictedScope/);
});

// Add only local Module-8 styling and keep the shared shell/theme intact.
test('Pass 230 styles the Procurement workspace without introducing a new UI framework', () => {
  assert.match(webStyles, /\/\* Module 8 Procurement & RFQ \*\//);
  assert.match(webStyles, /\.module8-project-picker/);
  assert.match(webStyles, /\.module8-comparison-table/);
  assert.match(webStyles, /@media \(max-width: 720px\)/);
});

// Register the fail-honest React gate and advance only to Stage-13 Playwright verification.
test('Pass 230 React gate is registered and points only to Pass 231', () => {
  assert.equal(rootPackage.scripts['module-8:react:gate'], 'node scripts/module-8/verify-stage-13-react.mjs');
  assert.match(reactGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(reactGate, /STAGE_13_MODULE_8_REACT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(reactGate, /productionBackendChanges: 0/);
  assert.match(reactGate, /databaseChanges: 0/);
  assert.match(reactGate, /newReactFiles: 4/);
  assert.match(reactGate, /Pass 231 - Module 8 Playwright Procurement & RFQ workflow verification/);
  assert.match(contract, /Pass 231 - Module 8 Playwright Procurement & RFQ workflow verification/);
});


// Prepare one genuine browser workflow over the real web/API/database boundary without adding production functionality.
test('Pass 231 prepares the real Module 8 requisition to quotation-selection browser workflow', () => {
  assert.match(browserTest, /@playwright\/test/);
  assert.match(browserTest, /resetFoundationTestData/);
  assert.match(browserTest, /Procurement & RFQ/);
  assert.match(browserTest, /Create purchase requisition/);
  assert.match(browserTest, /Create requisition/);
  assert.match(browserTest, /Submit/);
  assert.match(browserTest, /Create RFQ/);
  assert.match(browserTest, /Issue RFQ/);
  assert.match(browserTest, /Record quotation/);
  assert.match(browserTest, /Local JSON line import/);
  assert.match(browserTest, /Quotation comparison & selection approval/);
  assert.match(browserTest, /Lowest stored total/);
  assert.match(browserTest, /No financial commitment is created by this selection/);
});

// Recheck browser input authority, reviewed readback routes and the pre-commitment boundary at the UI/API edge.
test('Pass 231 verifies narrow Module 8 browser authority and read-only user denial', () => {
  for (const field of [
    'companyId', 'actorUserId', 'projectScope', 'requestedBy', 'buyerUserId',
    'prNo', 'rfqNo', 'subtotal', 'financialCommitmentCreated'
  ]) assert.match(browserTest, new RegExp(field));
  assert.match(browserTest, /assertModule8AuthorityBoundary/);
  assert.match(browserTest, /vendorReads/);
  assert.match(browserTest, /rfqDetailReads/);
  assert.match(browserTest, /vendor-contacts/);
  assert.match(browserTest, /convert-to-po/);
  assert.match(browserTest, /commitments/);
  assert.match(browserTest, /database\.costCommitment\.count/);
  assert.match(browserTest, /database\.journal\.count/);
  assert.match(browserTest, /toBe\(403\)/);
  assert.match(browserTest, /Create requisition' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Create RFQ' \}\)\)\.toHaveCount\(0\)/);
  assert.match(browserTest, /Record quotation' \}\)\)\.toHaveCount\(0\)/);
});

// Register Module 8 as one isolated Playwright target and keep the live browser run explicitly guarded.
test('Pass 231 registers isolated Module 8 Playwright scripts and config', () => {
  assert.equal(rootPackage.scripts['test:e2e:module-8'], 'npm run build && npm run test:db:prepare && playwright test --config playwright.config.mjs');
  assert.equal(rootPackage.scripts['module-8:playwright:gate'], 'node scripts/module-8/verify-stage-13-playwright.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-8:playwright:gate:live'], 'node scripts/module-8/verify-stage-13-playwright.mjs --mode=live');
  assert.match(playwrightConfig, /RUN_MODULE_8_E2E/);
  assert.match(playwrightConfig, /module-8-browser\.spec\.mjs/);
  assert.match(playwrightGate, /RUN_MODULE_8_E2E_REQUIRED/);
  assert.match(playwrightGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
});

// Keep the pass fail-honest until the prior live handoff exists and advance only to operations verification.
test('Pass 231 Playwright gate preserves Stage 12 live prerequisite and points only to Pass 232', () => {
  assert.match(playwrightGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(playwrightGate, /STAGE_12_LIVE_HANDOFF_REQUIRED/);
  assert.match(playwrightGate, /STAGE_13_MODULE_8_PLAYWRIGHT_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(playwrightGate, /STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232/);
  assert.match(playwrightGate, /runtimeVerificationComplete: passed && mode === 'live' && stage12LiveAccepted/);
  assert.match(playwrightGate, /productionRuntimeChanges: 0/);
  assert.match(playwrightGate, /databaseChanges: 0/);
  assert.match(playwrightGate, /Pass 232 - Module 8 operational, migration and concurrency verification/);
  assert.match(contract, /Pass 232 - Module 8 operational, migration and concurrency verification/);
});


// Pass 232 adds verification-only operational coverage over the existing Module-8 runtime and persistence boundary.
test('Pass 232 registers isolated Module 8 operational verification without production changes', () => {
  assert.equal(rootPackage.scripts['test:operations:module-8'], 'node -e "if (process.env.RUN_FOUNDATION_DB_TESTS !== \'1\') throw new Error(\'Set RUN_FOUNDATION_DB_TESTS=1 for Module 8 operational verification.\')" && npm run test:env:check && npm run test:db:prepare && npm run build:packages && npm run build --workspace @construction-erp/api && node --test --test-concurrency=1 --test-name-pattern="^Module 8 operational" tests/integration/module-8-api.integration.test.mjs');
  assert.equal(rootPackage.scripts['module-8:operations:gate'], 'node scripts/module-8/verify-stage-13-operations.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-8:operations:gate:live'], 'node scripts/module-8/verify-stage-13-operations.mjs --mode=live');
  assert.match(operationsGate, /productionRuntimeChanges: 0/);
  assert.match(operationsGate, /databaseChanges: 0/);
  assert.match(operationsGate, /newMigrations: 0/);
  assert.match(operationsGate, /publicApiChanges: 0/);
});

// Verify concurrency safety around server numbering and the three state-changing reviewed commands that support replay.
test('Pass 232 prepares concurrent numbering and retry-safe procurement lifecycle verification', () => {
  assert.match(integrationTest, /Module 8 operational concurrency serializes numbering and retry-safe procurement lifecycle commands/);
  assert.match(integrationTest, /Array\.from\(\{ length: 6 \}/);
  assert.match(integrationTest, /\['PR-0001', 'PR-0002', 'PR-0003', 'PR-0004', 'PR-0005', 'PR-0006'\]/);
  assert.match(integrationTest, /\['RFQ-0001', 'RFQ-0002', 'RFQ-0003', 'RFQ-0004'\]/);
  assert.match(integrationTest, /purchase_requisition\.submitted/);
  assert.match(integrationTest, /rfq\.issued/);
  assert.match(integrationTest, /rfq\.quotation_selected/);
  assert.match(integrationTest, /prSequence\.nextValue, 7n/);
  assert.match(integrationTest, /rfqSequence\.nextValue, 5n/);
});

// Selection remains pre-commitment even when the same valid selection command is retried concurrently.
test('Pass 232 keeps concurrent quotation selection pre-commitment and side-effect safe', () => {
  assert.match(integrationTest, /selectionResponses = await Promise\.all/);
  assert.match(integrationTest, /supplierQuotation\.count\(\{ where: \{ rfqId: rfq\.id, status: 'SELECTED' \} \}\), 1/);
  assert.match(integrationTest, /costCommitment\.count\(\{ where: \{ companyId: COMPANY_ID \} \}\), 0/);
  assert.match(integrationTest, /journal\.count\(\{ where: \{ companyId: COMPANY_ID \} \}\), 0/);
  assert.match(contract, /Pass 362 later resolves only the RFQ-item data-integrity gap without introducing a commitment, journal, payable, Purchase Order conversion/);
});

// Reject service-calculated values outside DECIMAL(18,2) without leaving partial quotation/event state.
test('Pass 232 prepares quotation rejection atomicity verification', () => {
  assert.match(integrationTest, /Module 8 operational rollback boundaries and query plans preserve atomic procurement state and reviewed indexes/);
  assert.match(integrationTest, /99999999999999\.9999/);
  assert.match(integrationTest, /QUOTATION_INVALID/);
  assert.match(integrationTest, /supplierQuotation\.count\(\{ where: \{ rfqId: rfq\.id \} \}\), 0/);
  assert.match(integrationTest, /supplier_quotation\.received/);
  assert.match(integrationTest, /invitationAfterRejectedQuote\.responseStatus, 'INVITED'/);
});

// Policy failure before selection must leave RFQ and quotation state unchanged until an authorized rationale-bearing retry succeeds.
test('Pass 232 prepares non-lowest selection rollback verification', () => {
  assert.match(integrationTest, /procurementRequireRationaleForNonLowestSelection: true/);
  assert.match(integrationTest, /INVALID_VENDOR_SELECTION/);
  assert.match(integrationTest, /rfqAfterRejectedSelection\.status, 'ISSUED'/);
  assert.match(integrationTest, /supplierQuotation\.count\(\{ where: \{ rfqId: rfq\.id, status: 'SELECTED' \} \}\), 0/);
  assert.match(integrationTest, /Specialist delivery lead-time exception/);
});

// Verify reviewed Stage-13 index names through EXPLAIN without introducing unstable hard latency thresholds.
test('Pass 232 prepares query-plan verification for reviewed procurement indexes', () => {
  for (const index of [
    'vendors_company_status_qualification_idx',
    'purchase_requisitions_company_project_status_required_idx',
    'rfqs_company_project_status_due_idx',
    'rfq_vendors_rfq_response_idx',
    'supplier_quotations_rfq_status_total_idx',
    'supplier_quotation_items_quotation_idx',
  ]) assert.match(integrationTest, new RegExp(index));
  assert.match(integrationTest, /SET LOCAL enable_seqscan = off/);
  assert.match(operationsGate, /hardDurationThresholds: false/);
  assert.doesNotMatch(integrationTest, /performance\.now\(|Date\.now\(\)[\s\S]{0,100}(?:<|>)\s*\d+\s*(?:ms|milliseconds)/);
});

// Live operations must not run until the prior Stage and both runtime verification handoffs are genuine.
test('Pass 232 operations gate is fail-honest and verifies both supported migration paths before live concurrency work', () => {
  assert.match(operationsGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(operationsGate, /STAGE_12_LIVE_HANDOFF_REQUIRED/);
  assert.match(operationsGate, /STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230/);
  assert.match(operationsGate, /STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232/);
  assert.match(operationsGate, /STAGE_13_MODULE_8_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /STAGE_13_MODULE_8_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(operationsGate, /RUN_FOUNDATION_DB_TESTS_REQUIRED/);
  assert.match(operationsGate, /db:migrations:verify/);
  assert.match(operationsGate, /test:operations:module-8/);
});

// Pass 232 is the final operational preparation step before the dedicated Stage-13 acceptance gate.
test('Pass 232 points only to Pass 233 final Stage-13 acceptance', () => {
  assert.match(operationsGate, /STAGE_13_MODULE_8_OPERATIONS_VERIFIED_READY_FOR_PASS_233/);
  assert.match(operationsGate, /STAGE_13_MODULE_8_OPERATIONS_PREPARED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(operationsGate, /Pass 233 - Module 8 final Stage-13 acceptance gate/);
  assert.match(contract, /Pass 233 - Module 8 final Stage-13 acceptance gate/);
  assert.match(contract, /Pass 232 adds no production runtime code, database migration or public API/);
});


// Pass 233 closes Stage 13 with one final static/live acceptance boundary and no product behavior changes.
test('Pass 233 registers the final Module 8 Stage-13 acceptance scripts only', () => {
  assert.equal(rootPackage.scripts['module-8:gate'], 'node scripts/module-8/verify-stage-13.mjs --mode=static');
  assert.equal(rootPackage.scripts['module-8:gate:live'], 'node scripts/module-8/verify-stage-13.mjs --mode=live');
  assert.equal(rootPackage.scripts['module-8:acceptance:live'], 'npm run module-8:gate:live');
  assert.match(finalGate, /productionRuntimeChanges: 0/);
  assert.match(finalGate, /databaseChanges: 0/);
  assert.match(finalGate, /newMigrations: 0/);
  assert.match(finalGate, /publicApiChanges: 0/);
});

// The live acceptance cannot bypass the prior Stage-12 handoff or any prepared Stage-13 live proof.
test('Pass 233 preserves every required live handoff before Stage-13 acceptance', () => {
  assert.match(finalGate, /STAGE_12_ACCEPTED_READY_FOR_STAGE_13/);
  assert.match(finalGate, /STAGE_13_MODULE_8_INTEGRATION_SECURITY_VERIFIED_READY_FOR_PASS_230/);
  assert.match(finalGate, /STAGE_13_MODULE_8_PLAYWRIGHT_VERIFIED_READY_FOR_PASS_232/);
  assert.match(finalGate, /STAGE_13_MODULE_8_OPERATIONS_VERIFIED_READY_FOR_PASS_233/);
  assert.match(finalGate, /STAGE_12_LIVE_HANDOFF_REQUIRED/);
  assert.match(finalGate, /STAGE_13_INTEGRATION_SECURITY_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_13_PLAYWRIGHT_LIVE_VERIFICATION_REQUIRED/);
  assert.match(finalGate, /STAGE_13_OPERATIONS_LIVE_VERIFICATION_REQUIRED/);
});

// The final static gate rechecks all hard prerequisites, Module 8, workspace, migrations and test syntax.
test('Pass 233 reruns the complete Stage-13 static acceptance surface', () => {
  for (const check of [
    'module-5-static-regression',
    'module-6-static-regression',
    'module-7-static-regression',
    'module-22-static-regression',
    'module-24b-static-regression',
    'module-8-static-suite',
    'full-static-regression',
    'workspace-contract',
    'migration-policy',
    'module-8-integration-test-syntax',
    'module-8-playwright-test-syntax',
    'playwright-config-syntax',
    'procurement-service-syntax',
    'procurement-repository-syntax',
  ]) assert.match(finalGate, new RegExp(check));
});

// Genuine live acceptance installs dependencies and runs the real DB/browser/operations chain plus Module-7 regression.
test('Pass 233 prepares the guarded dependency-backed Stage-13 live acceptance chain', () => {
  for (const check of [
    'clean-install',
    'typecheck',
    'lint',
    'prisma-validate',
    'prisma-generate',
    'clean-and-previous-migrations',
    'build',
    'prepare-integration-database',
    'module-8-backend-security-integration',
    'module-8-browser-workflow',
    'module-8-operational-verification',
    'module-7-operational-regression',
  ]) assert.match(finalGate, new RegExp(check));
  assert.match(finalGate, /MODULE_8_LIVE_GATE_CONFIRM/);
  assert.match(finalGate, /MIGRATION_TEST_CONFIRM/);
  assert.match(finalGate, /RUN_MODULE_8_E2E/);
});

// Freeze the final Module-8 ownership and pre-commitment boundary exactly as reviewed.
test('Pass 233 freezes the final Module 8 ownership routes permissions events and source gaps', () => {
  for (const table of [
    'vendors', 'vendor_contacts', 'purchase_requisitions', 'purchase_requisition_items',
    'rfqs', 'rfq_vendors', 'supplier_quotations', 'supplier_quotation_items',
  ]) assert.match(finalGate, new RegExp(`'${table}'`));
  assert.match(finalGate, /routeCount: 8/);
  for (const permission of [
    'procurement.pr.read',
    'procurement.pr.create',
    'procurement.rfq.manage',
    'procurement.quotation.record',
    'procurement.quotation.select',
  ]) assert.match(finalGate, new RegExp(permission.replaceAll('.', '\\.')));
  for (const event of [
    'purchase_requisition.submitted',
    'rfq.issued',
    'supplier_quotation.received',
    'rfq.quotation_selected',
  ]) assert.match(finalGate, new RegExp(event.replaceAll('.', '\\.')));
  assert.match(finalGate, /quotationSelectionCreatesFinancialCommitment: false/);
  assert.match(finalGate, /purchaseOrderCommitmentDeferredToStage14: true/);
  assert.match(finalGate, /no Vendor-master public management API/);
  assert.match(finalGate, /pass362RfqItemIntegrityRepair: true/);
});

// Only the genuine live gate can activate Stage 14; the static archive remains fail-honest while Stage 12 is blocked.
test('Pass 233 advances only genuine acceptance to Stage 14 Module 9 Purchase Orders', () => {
  assert.match(finalGate, /STAGE_13_ACCEPTED_READY_FOR_STAGE_14/);
  assert.match(finalGate, /STAGE_13_STATIC_GATE_PASSED_STAGE_12_LIVE_HANDOFF_PENDING/);
  assert.match(finalGate, /Stage 14 - Module 9 Purchase Orders/);
  assert.match(contract, /Pass 233 final Stage-13 acceptance/);
  assert.match(contract, /Pass 234 - Stage 14 \/ Module 9 Purchase Orders contract freeze/);
});
