import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260830000400_final21_client_billing_cross_module_reconciliation/migration.sql', 'utf8');
const gates = JSON.parse(await readFile('packages/database/prisma/migration-gates.json', 'utf8'));
const service = await readFile('apps/api/src/modules/client-billing/client-billing.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/client-billing/client-billing.routes.ts', 'utf8');
const billingSchema = await readFile('apps/api/src/modules/client-billing/client-billing.schema.ts', 'utf8');
const stageRepository = await readFile('apps/api/src/modules/project-stages/project-stages.repository.ts', 'utf8');
const documentSchema = await readFile('apps/api/src/modules/documents-audit/documents-audit.schema.ts', 'utf8');
const documentRepository = await readFile('apps/api/src/modules/documents-audit/documents-audit.repository.ts', 'utf8');
const documentService = await readFile('apps/api/src/modules/documents-audit/documents-audit.service.ts', 'utf8');
const passDoc = await readFile('docs/PASS-B17-8-FINAL21-CLIENT-BILLING-CROSS-MODULE-RECONCILIATION.md', 'utf8');

/** Extract one function or method region for focused reconciliation assertions. */
function region(source, name, nextName) {
  const start = source.indexOf(`${name}(`);
  assert.ok(start >= 0, `${name} was not found.`);
  const end = nextName ? source.indexOf(`${nextName}(`, start + 1) : source.length;
  return source.slice(start, end >= 0 ? end : source.length);
}

test('B17.8 keeps its forward-only owner-chain reconciliation migration registered as historical gate 52', () => {
  const gate = gates.gates.find((entry) => entry.gate === 'final-21-pass-b17-8-client-billing-cross-module-reconciliation');
  assert.equal(gate?.stage, 52);
  assert.deepEqual(gate?.migrations, ['20260830000400_final21_client_billing_cross_module_reconciliation']);
  assert.match(migration, /Progress Claim Client\/Project ownership is inconsistent/);
  assert.match(migration, /Client Invoice Client\/Project ownership is inconsistent/);
  assert.match(migration, /Client Invoice Claim ownership is inconsistent/);
});

test('B17.8 protects Progress Claim and Client Invoice ownership against direct database drift', () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION "final21_validate_client_billing_owner_scope"/);
  assert.match(migration, /project\."client_id" IS DISTINCT FROM claim\."client_id"/);
  assert.match(migration, /claim\."project_id" IS DISTINCT FROM invoice\."project_id"/);
  assert.match(migration, /claim\."client_id" IS DISTINCT FROM invoice\."client_id"/);
  assert.match(migration, /CREATE TRIGGER "progress_claims_owner_scope_integrity"/);
  assert.match(migration, /CREATE TRIGGER "client_invoices_claim_scope_integrity"/);
  assert.match(prisma, /B17\.8 also protects the Client -> Project owner chain/);
});

test('B17.8 keeps the service-owned Client chain deterministic from Project to Claim and Invoice', () => {
  const createClaim = region(service, 'createClaimOnce', 'updateClaim');
  const createInvoice = region(service, 'createInvoiceOnce', 'listInvoices');
  assert.match(createClaim, /clientId: project\.clientId/);
  assert.match(createInvoice, /projectId: claim\.projectId/);
  assert.match(createInvoice, /clientId: claim\.clientId/);
  assert.match(createInvoice, /claimId: claim\.id/);
  assert.doesNotMatch(routes, /clientId.*body|companyId.*body/);
});

test('B17.8 keeps Stage billing source-owned by issued or posted Client Invoice lines only', () => {
  const billed = region(stageRepository, 'sumStageBilled');
  assert.match(billed, /this\.db\.clientInvoiceLine\.aggregate/);
  assert.match(billed, /stageId/);
  assert.match(billed, /status: \{ in: \['ISSUED', 'POSTED'\] \}/);
  assert.doesNotMatch(billed, /progressClaimLine|journalLine|stageProgressUpdate/);
});

test('B17.8 preserves Stage attribution through Claim to Invoice and Finance without a second billing source', () => {
  const createInvoice = region(service, 'createInvoiceOnce', 'listInvoices');
  const posting = region(service, 'postInvoiceToFinance', 'createInvoice');
  assert.match(createInvoice, /allocateCertifiedInvoiceLines\(claim\.lines, subtotal, accounts\.revenue\.id\)/);
  assert.match(posting, /projectId: invoice\.projectId,\s*stageId: line\.stageId/);
  assert.match(posting, /projectId: invoice\.projectId, stageId: null, debit:/);
  assert.doesNotMatch(stageRepository, /FinanceRepository|journalLine/);
});

test('B17.8 proves the Client Invoice Finance source key is stable, checked and Company-unique', () => {
  const posting = region(service, 'postInvoiceToFinance', 'createInvoice');
  const journalModel = prisma.match(/model Journal \{[\s\S]*?@@map\("journals"\)\n\}/)?.[0] ?? '';
  assert.match(service, /return `client_invoice:\$\{invoiceId\}`/);
  assert.match(posting, /findJournalBySourceKey\(sourceKey\)/);
  assert.match(posting, /existingJournal\.sourceType !== 'client_invoice'/);
  assert.match(posting, /existingJournal\.sourceId !== invoice\.id/);
  assert.match(journalModel, /@@unique\(\[companyId, sourceKey\]/);
});

test('B17.8 proves Module 21 owns authorized Client Invoice document links', () => {
  assert.match(documentSchema, /'client_invoice'/);
  assert.match(documentRepository, /resourceType === 'client_invoice'/);
  assert.match(documentRepository, /this\.db\.clientInvoice\.findFirst/);
  assert.match(documentRepository, /where: scope\.where\(\{ id: resourceId \}\)/);
  assert.match(documentService, /resourceType === 'client_invoice'/);
  assert.match(documentService, /!hasPermission\('client_invoices\.read'\)/);
  assert.match(documentService, /document\.projectId && resource\.projectId && document\.projectId !== resource\.projectId/);
  assert.match(documentService, /projectId: resource\.projectId \?\? document\.projectId/);
});

test('B17.8 keeps Client Invoice document-link idempotency in Module 21 instead of Client Billing', () => {
  const linkModel = prisma.match(/model DocumentLink \{[\s\S]*?@@map\("document_links"\)\n\}/)?.[0] ?? '';
  assert.match(linkModel, /@@unique\(\[documentId, linkedResourceType, linkedResourceId\]/);
  assert.match(documentRepository, /error\.code !== 'P2002'/);
  assert.doesNotMatch(service, /DocumentLink|DocumentsRepository|documents\.link/);
});

test('B17.8 keeps the exact nine-route Client Billing boundary and adds no cross-module CRUD', () => {
  const routeCount = [...routes.matchAll(/app\.(get|post|put|patch|delete)\('/g)].length;
  assert.equal(routeCount, 9);
  assert.equal((billingSchema.match(/route: '\/api\/v1\/client-billing/g) ?? []).length, 9);
  assert.doesNotMatch(routes, /documents|financials|journal/);
});

test('B17.8 documents single-owner reconciliation and leaves React completion to B17.9', () => {
  assert.match(passDoc, /Client -> Project -> Stage -> Claim -> Client Invoice -> Finance/);
  assert.match(passDoc, /Stage billing does not sum Progress Claims or Finance Journal lines/);
  assert.match(passDoc, /Module 21 already allow-lists `client_invoice`/);
  assert.match(passDoc, /No double counting/);
  assert.match(passDoc, /B17\.9 - Client Billing React completion/);
});
