import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/clients/clients.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/clients/clients.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/clients/clients.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/clients/clients.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/clients/api/clients-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/clients/hooks/clients.ts', 'utf8');
const webPage = await readFile('apps/web/src/features/clients/pages/clients-page.tsx', 'utf8');
const webDetails = await readFile('apps/web/src/features/clients/components/client-details-panel.tsx', 'utf8');
const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const adminSchema = await readFile('apps/api/src/modules/administration/administration.schema.ts', 'utf8');
const billingRepository = await readFile('apps/api/src/modules/client-billing/client-billing.repository.ts', 'utf8');
const receiptsRepository = await readFile('apps/api/src/modules/client-receipts/client-receipts.repository.ts', 'utf8');

/** Return true when a source contains one literal token. */
function contains(source, token) {
  return source.includes(token);
}

test('Client Management active contract contains only final Client permissions and exact routes', () => {
  for (const permission of ['clients.read', 'clients.create', 'clients.update']) assert.match(schema, new RegExp(permission.replace('.', '\\.')));
  for (const route of [
    '/api/v1/clients',
    '/api/v1/clients/:id',
    '/api/v1/clients/:id/contacts',
    '/api/v1/clients/:id/contacts/:contactId'
  ]) assert.match(schema, new RegExp(route.replaceAll('/', '\\/').replace(':', '\\:')));
  assert.doesNotMatch(schema, /\/api\/v1\/clients\/:id\/archive/);
  assert.doesNotMatch(schema, /opportunities\.(?:read|manage)|\/api\/v1\/opportunities/);
});

test('Client and Contact schemas support final nullable fields and normalized communication values', () => {
  assert.match(schema, /creditTermsDays: creditTermsDaysSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /title: contactTitleSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /email: emailSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /phone: phoneSchema\.nullable\(\)\.optional\(\)/);
  assert.match(schema, /value\.toLowerCase\(\)/);
  assert.match(schema, /replace\(\/\[\\s\(\)\.\-\]\//);
});

test('Client Management repository contains final Contact update and project-scoped master summary reads', () => {
  for (const token of ['findClientContact', 'updateClientContact', 'getClientProjectSummary', 'project.count', 'allowedProjectIds']) {
    assert.equal(contains(repository, token), true, `Repository is missing ${token}`);
  }
  assert.doesNotMatch(repository, /clientInvoice\.aggregate|clientReceipt/);
  assert.match(billingRepository, /async readClientBillingSummary/);
  assert.match(receiptsRepository, /async readReceiptFinancialTotals/);
  for (const token of ['countClientOpportunities', 'listOpportunities', 'findOpportunityById', 'createOpportunity']) {
    assert.equal(contains(repository, token), false, `Repository still contains ${token}`);
  }
});

test('Client Management service emits status changes and audits Client and Contact master writes', () => {
  assert.match(service, /'client\.status_changed'/);
  assert.match(service, /action: 'client\.contact_created'/);
  assert.match(service, /action: 'client\.contact_updated'/);
  assert.match(service, /canReadBilling = hasPermission\('client_billing\.read'\)/);
  assert.match(service, /canReadReceipts = hasPermission\('client_receipts\.read'\)/);
  assert.match(service, /billingSummary:/);
  assert.match(service, /receiptSummary:/);
  assert.match(service, /readReceiptFinancialTotals\(\{ clientId, allowedProjectIds \}\)/);
  assert.doesNotMatch(service, /receiptSummaryAvailable/);
  assert.doesNotMatch(service, /DUPLICATE_PRIMARY_CONTACT|archiveClient\(/);
});

test('Client Management routes expose the documented Contact PATCH and no archive command route', () => {
  assert.match(routes, /app\.patch\('\/api\/v1\/clients\/:id\/contacts\/:contactId'/);
  assert.match(routes, /updateClientContactBodySchema/);
  assert.match(routes, /status: \{ type: 'string', enum: \['ACTIVE', 'ARCHIVED'\] \}/);
  assert.doesNotMatch(routes, /app\.post\('\/api\/v1\/clients\/:id\/archive'/);
});

test('Client Management Prisma relations enforce same-company Contact ownership', () => {
  assert.match(prisma, /creditTermsDays Int\?\s+@map\("credit_terms_days"\)/);
  assert.match(prisma, /title\s+String\?\s+@db\.VarChar\(160\)/);
  assert.match(prisma, /email\s+String\?\s+@db\.VarChar\(320\)/);
  assert.match(prisma, /phone\s+String\?\s+@db\.VarChar\(50\)/);
  assert.match(prisma, /client\s+Client\s+@relation\(fields: \[clientId, companyId\], references: \[id, companyId\]/);
});

test('Client Management web supports Client lifecycle, Contact updates and source-derived summaries', () => {
  assert.match(webApi, /updateClientContact/);
  assert.match(webHooks, /useUpdateClientContact/);
  assert.match(webDetails, /Project and financial summary/);
  assert.match(webDetails, /Archive client/);
  assert.match(webDetails, /Reactivate client/);
  assert.match(webDetails, /Save contact/);
  for (const value of ['Received', 'Allocated', 'Advance \/ unallocated', 'Outstanding', 'Restricted']) assert.match(webDetails, new RegExp(value));
  for (const source of [webApi, webHooks, webPage, webDetails]) assert.doesNotMatch(source, /Opportunity|opportunit/i);
});

test('historical opportunity permissions are absent from active Final-21 Administration code', () => {
  assert.doesNotMatch(adminSchema, /opportunities\.(?:read|manage)|isRemovedFinal21PermissionCode|REMOVED_FINAL_21_PERMISSION_CODES/);
});
