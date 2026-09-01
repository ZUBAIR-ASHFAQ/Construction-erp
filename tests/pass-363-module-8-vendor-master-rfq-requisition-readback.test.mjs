import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pass = await readFile('docs/PASS-363-MODULE-8-VENDOR-MASTER-RFQ-REQUISITION-READBACK.md', 'utf8');
const repair = await readFile('docs/PASS-358-STAGE-0-23-REPAIR-CONTRACT-FREEZE.md', 'utf8');
const contract = await readFile('docs/modules/procurement/STAGE-13-MODULE-8-CONTRACT.md', 'utf8');
const schema = await readFile('apps/api/src/modules/procurement/procurement.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/procurement/procurement.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/procurement/procurement.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/procurement/procurement.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/procurement/api/procurement-api.ts', 'utf8');
const hooks = await readFile('apps/web/src/features/procurement/hooks/procurement.ts', 'utf8');
const workspace = await readFile('apps/web/src/features/procurement/components/procurement-workspace.tsx', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migrations = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));

// Close only the two Module-8 repairs frozen for Pass 363.
test('Pass 363 closes M8-02 and M8-03 without pulling later integrations forward', () => {
  assert.match(repair, /M8-02[\s\S]*IMPLEMENTED_PASS_363/);
  assert.match(repair, /M8-03[\s\S]*IMPLEMENTED_PASS_363/);
  assert.match(pass, /Stage-26 Finance adapter/);
  assert.match(pass, /Stage-27 integration/);
  assert.match(contract, /Purchase Order conversion\/commitment remains Module 9/);
});

// Preserve the original source routes and enumerate the reviewed repair surface separately.
test('Pass 363 preserves the eight source operations and adds eleven repair operations', () => {
  const sourceBlock = schema.slice(schema.indexOf('MODULE_8_HTTP_ROUTES'), schema.indexOf('MODULE_8_REPAIR_HTTP_ROUTES'));
  const repairBlock = schema.slice(schema.indexOf('MODULE_8_REPAIR_HTTP_ROUTES'), schema.indexOf('MODULE_8_SERVER_OWNED_REQUEST_FIELDS'));
  assert.equal([...sourceBlock.matchAll(/Object\.freeze\(\{ method:/g)].length, 8);
  assert.equal([...repairBlock.matchAll(/Object\.freeze\(\{ method:/g)].length, 11);
  assert.match(repairBlock, /\/api\/v1\/procurement\/vendors/);
  assert.match(repairBlock, /\/api\/v1\/procurement\/requisitions\/:id\/revise/);
  assert.match(repairBlock, /\/api\/v1\/procurement\/rfqs\/:id/);
});

// Vendor master is non-destructive and remains inside Module 8 ownership.
test('Pass 363 implements a narrow non-destructive Vendor master', () => {
  for (const method of ['listVendors', 'createVendor', 'updateVendor', 'updateVendorStatus', 'createVendorContact', 'updateVendorContact']) {
    assert.match(repository, new RegExp(`async ${method}\\b`));
  }
  assert.doesNotMatch(repository, /vendor\.(?:delete|deleteMany)/);
  assert.match(service, /procurement\.rfq\.manage/);
  assert.match(service, /VENDOR_ARCHIVED = 'ARCHIVED'/);
  assert.match(routes, /module8ArchiveVendor/);
  assert.match(routes, /module8RestoreVendor/);
});

// Vendor writes cannot accept Company or lifecycle authority from ordinary create/update clients.
test('Pass 363 keeps Vendor ownership and lifecycle server-authoritative', () => {
  const create = schema.slice(schema.indexOf('createVendorBodySchema'), schema.indexOf('updateVendorBodySchema'));
  assert.doesNotMatch(create, /companyId|createdBy|status:\s*statusTokenSchema/);
  assert.match(service, /requireCompanyPermission/);
  assert.match(service, /VENDOR_ACTIVE/);
  assert.match(service, /VENDOR_QUALIFIED/);
});

// Requisition revision is a controlled command, not silent editing.
test('Pass 363 controls requisition revision with ownership, reason, state and downstream-reference checks', () => {
  assert.match(schema, /revisePurchaseRequisitionBodySchema/);
  assert.match(schema, /reason:/);
  assert.match(service, /current\.requestedBy !== security\.actorUserId/);
  assert.match(service, /\[REQUISITION_SUBMITTED, REQUISITION_RETURNED, REQUISITION_REJECTED\]/);
  assert.match(service, /hasRfqForRequisition/);
  assert.match(service, /REQUISTION_DRAFT|REQUISITION_DRAFT/);
  assert.match(service, /purchase_requisition\.revised/);
  assert.match(repository, /targetStatus: string/);
  assert.doesNotMatch(repository, /status:\s*'DRAFT'/);
});

// Durable readback allows browser recovery without an RFQ-item subsystem.
test('Pass 363 adds bounded requisition and RFQ readback only', () => {
  assert.match(service, /async getPurchaseRequisition/);
  assert.match(service, /async listRfqs/);
  assert.match(service, /async getRfq/);
  assert.match(routes, /module8GetPurchaseRequisition/);
  assert.match(routes, /module8ListRfqs/);
  assert.match(routes, /module8GetRfq/);
  assert.doesNotMatch(routes, /rfq-items|rfq\/items|rfqs\/:rfqId\/items/);
});

// Keep React on the same small feature and reuse its requisition editor.
test('Pass 363 React supports Vendor selection, durable RFQ reopen and controlled revision', () => {
  assert.match(webApi, /export function listVendors/);
  assert.match(webApi, /export function revisePurchaseRequisition/);
  assert.match(webApi, /export function listRfqs/);
  assert.match(hooks, /useRevisePurchaseRequisition/);
  assert.match(workspace, /handleStartRequisitionRevision/);
  assert.match(workspace, /handleOpenRfq/);
  assert.match(workspace, /Vendor master/);
  assert.match(workspace, /Save revision/);
});

// No persistence expansion is needed because Vendor tables already belong to Module 8.
test('Pass 363 adds no database model or migration', () => {
  assert.match(prisma, /model Vendor \{/);
  assert.match(prisma, /model VendorContact \{/);
  assert.ok(migrations.gates.length >= 43);
  assert.match(pass, /does not add a database table, migration/);
});

// Avoid financial or downstream module scope creep.
test('Pass 363 keeps selection and Vendor management pre-commitment', () => {
  for (const text of [repository, service, routes]) {
    assert.doesNotMatch(text, /FinanceRepository|apInvoice\.(?:create|update)|journal\.(?:create|update)|costCommitment\.(?:create|update|upsert)/);
  }
  assert.match(pass, /Purchase Order conversion/);
});

// Keep code-generation structure simple and explicit.
test('Pass 363 keeps the existing five-file backend and four-file React feature', () => {
  assert.match(pass, /existing Module-8 five-file backend/);
  assert.match(pass, /existing four-file React feature/);
  assert.match(pass, /New named functions have short purpose comments/);
});
