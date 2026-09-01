import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const expectedRoutes = Object.freeze({
  'budgets-job-cost': [
    'GET /api/v1/projects/:projectId/budgets/current',
    'POST /api/v1/projects/:projectId/budgets',
    'PUT /api/v1/projects/:projectId/budgets/:id/lines',
    'POST /api/v1/projects/:projectId/budgets/:id/freeze',
    'GET /api/v1/projects/:projectId/job-cost',
    'GET /api/v1/projects/:projectId/job-cost/ledger',
    'PUT /api/v1/projects/:projectId/forecast'
  ],
  'client-billing': [
    'GET /api/v1/client-billing/projects/:projectId/settings',
    'PUT /api/v1/client-billing/projects/:projectId/settings',
    'GET /api/v1/client-billing/claims',
    'POST /api/v1/client-billing/claims',
    'PATCH /api/v1/client-billing/claims/:id',
    'POST /api/v1/client-billing/claims/:id/finalize',
    'POST /api/v1/client-billing/claims/:id/invoice',
    'GET /api/v1/client-billing/invoices',
    'GET /api/v1/client-billing/invoices/:id'
  ],
  clients: [
    'GET /api/v1/clients',
    'POST /api/v1/clients',
    'GET /api/v1/clients/:id',
    'PATCH /api/v1/clients/:id',
    'POST /api/v1/clients/:id/contacts',
    'PATCH /api/v1/clients/:id/contacts/:contactId'
  ],
  employees: [
    'GET /api/v1/employees',
    'POST /api/v1/employees',
    'GET /api/v1/employees/:id',
    'PATCH /api/v1/employees/:id',
    'POST /api/v1/employees/:id/compensation',
    'POST /api/v1/employees/:id/status'
  ],
  equipment: [
    'GET /api/v1/equipment',
    'POST /api/v1/equipment',
    'POST /api/v1/equipment/:id/assignments',
    'POST /api/v1/equipment/:id/usage',
    'POST /api/v1/equipment/:id/maintenance',
    'GET /api/v1/equipment/:id/history'
  ],
  finance: [
    'GET /api/v1/finance/accounts',
    'POST /api/v1/finance/accounts',
    'GET /api/v1/finance/journals',
    'POST /api/v1/finance/journals',
    'POST /api/v1/finance/journals/:id/post',
    'POST /api/v1/finance/journals/:id/reverse',
    'GET /api/v1/finance/ledger',
    'GET /api/v1/finance/trial-balance',
    'GET /api/v1/finance/cash-bank',
    'GET /api/v1/finance/periods',
    'POST /api/v1/finance/reconciliations',
    'POST /api/v1/finance/periods/:id/close'
  ],
  inventory: [
    'GET /api/v1/inventory/materials',
    'POST /api/v1/inventory/materials',
    'GET /api/v1/inventory/stock',
    'GET /api/v1/inventory/ledger',
    'POST /api/v1/inventory/issues',
    'POST /api/v1/inventory/transfers',
    'POST /api/v1/inventory/adjustments'
  ],
  'labour-payroll': [
    'GET /api/v1/attendance',
    'POST /api/v1/attendance',
    'PATCH /api/v1/attendance/:id',
    'GET /api/v1/payroll/runs',
    'POST /api/v1/payroll/runs',
    'POST /api/v1/payroll/runs/:id/calculate',
    'POST /api/v1/payroll/runs/:id/finalize',
    'GET /api/v1/payroll/runs/:id'
  ],
  procurement: [
    'GET /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions',
    'POST /api/v1/procurement/requisitions/:id/approve',
    'GET /api/v1/procurement/purchase-orders',
    'POST /api/v1/procurement/purchase-orders',
    'GET /api/v1/procurement/purchase-orders/:id',
    'POST /api/v1/procurement/purchase-orders/:id/issue',
    'POST /api/v1/procurement/purchase-orders/:id/cancel',
    'POST /api/v1/procurement/goods-receipts',
    'GET /api/v1/procurement/goods-receipts/:id'
  ],
  'project-stages': [
    'GET /api/v1/projects/:projectId/stages',
    'POST /api/v1/projects/:projectId/stages',
    'PATCH /api/v1/projects/:projectId/stages/:stageId',
    'POST /api/v1/projects/:projectId/stages/baseline/freeze',
    'POST /api/v1/projects/:projectId/stages/:stageId/progress',
    'POST /api/v1/projects/:projectId/stages/:stageId/progress/:updateId/approve',
    'GET /api/v1/projects/:projectId/stages/:stageId/financials'
  ],
  'project-team': [
    'GET /api/v1/projects/:projectId/team',
    'POST /api/v1/projects/:projectId/team',
    'PATCH /api/v1/projects/:projectId/team/:assignmentId',
    'POST /api/v1/projects/:projectId/team/:assignmentId/end'
  ],
  projects: [
    'GET /api/v1/projects',
    'POST /api/v1/projects',
    'GET /api/v1/projects/:id',
    'PATCH /api/v1/projects/:id',
    'POST /api/v1/projects/:id/activate',
    'POST /api/v1/projects/:id/suspend',
    'POST /api/v1/projects/:id/complete',
    'POST /api/v1/projects/:id/close'
  ],
  'site-expenses': [
    'GET /api/v1/site-expenses',
    'POST /api/v1/site-expenses',
    'GET /api/v1/site-expenses/:id',
    'PATCH /api/v1/site-expenses/:id',
    'POST /api/v1/site-expenses/:id/post',
    'POST /api/v1/site-expenses/:id/reverse'
  ],
  'supplier-payables': [
    'GET /api/v1/supplier-payables/invoices',
    'POST /api/v1/supplier-payables/invoices',
    'GET /api/v1/supplier-payables/invoices/:id',
    'POST /api/v1/supplier-payables/invoices/:id/post',
    'GET /api/v1/supplier-payables/payments',
    'POST /api/v1/supplier-payables/payments',
    'POST /api/v1/supplier-payables/payments/:id/allocations',
    'GET /api/v1/supplier-payables/aging'
  ],
  'vendors-subcontractors': [
    'GET /api/v1/vendors',
    'POST /api/v1/vendors',
    'GET /api/v1/vendors/:id',
    'PATCH /api/v1/vendors/:id',
    'POST /api/v1/vendors/:id/contacts',
    'GET /api/v1/subcontractors',
    'POST /api/v1/subcontractors',
    'PATCH /api/v1/subcontractors/:id'
  ]
});

/** Extract literal Fastify routes in source order for one module. */
function extractRoutes(source) {
  return [...source.matchAll(/app\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)/gi)]
    .map((match) => `${match[1].toUpperCase()} ${match[2]}`);
}

test('R6 keeps implemented business-module routes on the approved Final-21 contract plus reconciled usability reads', async () => {
  for (const [moduleName, routes] of Object.entries(expectedRoutes)) {
    const source = await read(`apps/api/src/modules/${moduleName}/${moduleName}.routes.ts`);
    assert.deepEqual(extractRoutes(source), routes, `${moduleName} route contract drifted`);
  }
});

test('R6 explicitly separates required Administration routes from justified auth support commands', async () => {
  const [schema, routes] = await Promise.all([
    read('apps/api/src/modules/administration/administration.schema.ts'),
    read('apps/api/src/modules/administration/administration.routes.ts')
  ]);
  const actual = extractRoutes(routes);
  const required = [
    'POST /api/v1/auth/login', 'POST /api/v1/auth/logout', 'GET /api/v1/auth/me',
    'GET /api/v1/admin/users', 'POST /api/v1/admin/users', 'PATCH /api/v1/admin/users/:id',
    'GET /api/v1/admin/roles', 'POST /api/v1/admin/roles', 'PUT /api/v1/admin/roles/:id/permissions',
    'PUT /api/v1/admin/users/:id/roles', 'PUT /api/v1/admin/users/:id/project-scopes',
    'GET /api/v1/admin/departments', 'POST /api/v1/admin/departments'
  ];
  const support = [
    'POST /api/v1/auth/refresh',
    'POST /api/v1/auth/invitations/accept',
    'POST /api/v1/auth/password-reset/request',
    'POST /api/v1/auth/password-reset/complete'
  ];
  const organizationProfile = [
    'GET /api/v1/admin/organization-profile',
    'PATCH /api/v1/admin/organization-profile'
  ];

  for (const route of [...required, ...support, ...organizationProfile]) assert.ok(actual.includes(route), `missing ${route}`);
  assert.equal(actual.length, required.length + support.length + organizationProfile.length);
  assert.match(schema, /ADMINISTRATION_REQUIRED_HTTP_ROUTES/);
  assert.match(schema, /ADMINISTRATION_SUPPORT_HTTP_ROUTES/);
  assert.match(schema, /ADMINISTRATION_ORGANIZATION_PROFILE_HTTP_ROUTES/);
});

test('R6 keeps only the Final-21 Document routes plus the bounded Document Browser read', async () => {
  const [schema, routes] = await Promise.all([
    read('apps/api/src/modules/documents-audit/documents-audit.schema.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.routes.ts')
  ]);
  assert.deepEqual(extractRoutes(routes), [
    'POST /api/v1/documents/uploads/init',
    'POST /api/v1/documents/uploads/complete',
    'GET /api/v1/documents',
    'GET /api/v1/documents/:id',
    'POST /api/v1/documents/:id/versions',
    'POST /api/v1/documents/:id/links',
    'DELETE /api/v1/documents/:id/links/:linkId',
    'GET /api/v1/documents/:id/download',
    'GET /api/v1/audit-logs'
  ]);
  assert.match(schema, /MODULE_21_HTTP_ROUTES/);
  assert.match(schema, /DOCUMENT_BROWSER_HTTP_ROUTES/);
  assert.doesNotMatch(`${schema}\n${routes}`, /documents\/folders|DocumentFolder|folderId/);
});

test('R6 aligns active Document and DocumentVersion persistence with Final-21 critical fields', async () => {
  const prisma = await read('packages/database/prisma/schema.prisma');
  const document = prisma.match(/model Document \{[\s\S]*?@@map\("documents"\)\n\}/)?.[0] ?? '';
  const version = prisma.match(/model DocumentVersion \{[\s\S]*?@@map\("document_versions"\)\n\}/)?.[0] ?? '';

  for (const field of ['fileName', 'mimeType', 'sizeBytes', 'createdBy', 'createdAt']) {
    assert.match(document, new RegExp(`\\b${field}\\b`));
  }
  for (const field of ['documentId', 'versionNo', 'storageKey', 'checksum', 'createdBy', 'createdAt']) {
    assert.match(version, new RegExp(`\\b${field}\\b`));
  }
  assert.doesNotMatch(prisma, /model DocumentFolder\b/);
  assert.doesNotMatch(document, /folderId|ownerUserId/);
  assert.doesNotMatch(version, /uploadedBy|uploadedAt/);
});

test('R6 removes folder persistence and UI while keeping immutable signed-upload behavior', async () => {
  const sources = await Promise.all([
    read('apps/api/src/modules/documents-audit/documents-audit.repository.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.service.ts'),
    read('apps/web/src/features/documents-audit/api/documents-api.ts'),
    read('apps/web/src/features/documents-audit/hooks/documents.ts'),
    read('apps/web/src/features/documents-audit/components/document-browser.tsx')
  ]);
  const source = sources.join('\n');
  assert.doesNotMatch(source, /DocumentFolder|folderId|listFolders|createFolder/);
  assert.match(source, /createSignedUploadUrl/);
  assert.match(source, /currentVersionId/);
  assert.match(source, /fileName/);
  assert.match(source, /createdBy/);
});

test('R6 uses one forward migration and leaves historical migrations untouched', async () => {
  const migration = await read('packages/database/prisma/migrations/20260830000200_final21_r6_route_document_contract/migration.sql');
  assert.match(migration, /ADD COLUMN "file_name"/);
  assert.match(migration, /ADD COLUMN "created_by"/);
  assert.match(migration, /RENAME COLUMN "uploaded_by" TO "created_by"/);
  assert.match(migration, /DROP TABLE IF EXISTS "document_folders"/);
  assert.match(migration, /DROP COLUMN IF EXISTS "folder_id"/);
  assert.match(migration, /final21_check_document_upload_project_scope/);
});

test('R6 wires the Organization Profile through Administration API service repository and React without Company CRUD', async () => {
  const [schema, repository, service, routes, adminApi, shell, page] = await Promise.all([
    read('apps/api/src/modules/administration/administration.schema.ts'),
    read('apps/api/src/modules/administration/administration.repository.ts'),
    read('apps/api/src/modules/administration/administration.service.ts'),
    read('apps/api/src/modules/administration/administration.routes.ts'),
    read('apps/web/src/features/administration/api/admin-api.ts'),
    read('apps/web/src/features/administration/components/admin-shell.tsx'),
    read('apps/web/src/features/administration/pages/organization-profile-page.tsx')
  ]);

  assert.match(schema, /updateOrganizationProfileBodySchema/);
  assert.match(schema, /legalName:\s*nameSchema\.optional\(\)/);
  assert.match(schema, /displayName:\s*nameSchema\.optional\(\)/);
  assert.doesNotMatch(schema, /updateOrganizationProfileBodySchema[\s\S]{0,600}baseCurrency:/);
  assert.doesNotMatch(schema, /updateOrganizationProfileBodySchema[\s\S]{0,600}fiscalSettings:/);
  assert.match(repository, /getOrganizationProfile\(\)[\s\S]*this\.db\.company\.findUnique/);
  assert.match(repository, /updateOrganizationProfile\(input[\s\S]*this\.db\.company\.update/);
  assert.match(service, /getOrganizationProfile\(\)[\s\S]*admin\.users\.read/);
  assert.match(service, /updateOrganizationProfile\(input[\s\S]*admin\.users\.manage/);
  assert.match(service, /company\.organization_profile_updated/);
  assert.doesNotMatch(routes, /app\.(?:post|delete)\('\/api\/v1\/admin\/organization-profile'/);
  assert.match(adminApi, /getOrganizationProfile/);
  assert.match(adminApi, /updateOrganizationProfile/);
  assert.match(shell, /Organization profile/);
  assert.match(page, /Base currency/);
  assert.match(page, /read-only here/);
});

/** R8 keeps only proven authentication-support routes and makes their OpenAPI ownership explicit. */
test('R8 reconciles extra authentication routes as intentional support rather than business CRUD', async () => {
  const [routes, authApi, signInPage] = await Promise.all([
    read('apps/api/src/modules/administration/administration.routes.ts'),
    read('apps/web/src/features/administration/api/auth-api.ts'),
    read('apps/web/src/features/administration/pages/sign-in-page.tsx')
  ]);

  for (const operationId of [
    'administrationRefreshSession',
    'administrationAcceptInvitation',
    'administrationRequestPasswordReset',
    'administrationCompletePasswordReset'
  ]) {
    const operationStart = routes.indexOf(`operationId: '${operationId}'`);
    assert.ok(operationStart >= 0, `missing ${operationId}`);
    const block = routes.slice(Math.max(0, operationStart - 150), operationStart + 700);
    assert.match(block, /tags: \['Authentication Support'\]/);
    assert.match(block, /security: \[\]/);
  }

  assert.match(authApi, /request<AuthSessionResult>\('auth\/refresh'/);
  assert.match(authApi, /'auth\/invitations\/accept'/);
  assert.match(authApi, /'auth\/password-reset\/request'/);
  assert.match(authApi, /'auth\/password-reset\/complete'/);
  assert.match(signInPage, /requestPasswordReset/);
  assert.match(signInPage, /acceptInvitation/);
  assert.match(signInPage, /completePasswordReset/);
});

/** R8 keeps the one extra Module 21 read because the required Document Browser consumes it, and bounds its OpenAPI query. */
test('R8 reconciles GET documents as the bounded required Document Browser read', async () => {
  const [routes, schema, api, browser] = await Promise.all([
    read('apps/api/src/modules/documents-audit/documents-audit.routes.ts'),
    read('apps/api/src/modules/documents-audit/documents-audit.schema.ts'),
    read('apps/web/src/features/documents-audit/api/documents-api.ts'),
    read('apps/web/src/features/documents-audit/components/document-browser.tsx')
  ]);

  const listRouteStart = routes.indexOf("app.get('/api/v1/documents'");
  assert.ok(listRouteStart >= 0);
  const listRouteBlock = routes.slice(listRouteStart, listRouteStart + 1800);
  assert.match(listRouteBlock, /description: 'Bounded authenticated read required by the Module 21 React document browser/);
  assert.match(listRouteBlock, /additionalProperties: false/);
  assert.match(listRouteBlock, /pageSize: \{ type: 'integer', minimum: 1, maximum: MODULE_21_MAX_PAGE_SIZE \}/);
  assert.match(listRouteBlock, /authenticateRequest\(request, options\.database\)/);
  assert.match(listRouteBlock, /parseRequest\(listDocumentsQuerySchema, request\.query, 'query'\)/);

  assert.match(schema, /DOCUMENT_BROWSER_HTTP_ROUTES/);
  assert.match(schema, /Object\.freeze\(\{ method: 'GET', route: '\/api\/v1\/documents' \}\)/);
  assert.match(api, /authenticatedRequest<DocumentPage>\(`documents\$\{suffix\}`\)/);
  assert.match(browser, /useDocuments\(\{ \.\.\.filters, page, pageSize: 20 \}\)/);
  assert.doesNotMatch(`${routes}\n${schema}\n${api}\n${browser}`, /documents\/folders|upload-intents|documents\/:id\/(?:archive|restore)/);
});
