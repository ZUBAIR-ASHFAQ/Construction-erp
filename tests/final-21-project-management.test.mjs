import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prisma = await readFile('packages/database/prisma/schema.prisma', 'utf8');
const migration = await readFile('packages/database/prisma/migrations/20260829000100_final21_project_commercial_model/migration.sql', 'utf8');
const schema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/projects/projects.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const webPage = await readFile('apps/web/src/features/projects/pages/projects-page.tsx', 'utf8');
const webDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');

/** Extract one Prisma model block for focused Final-21 assertions. */
function prismaModel(name) {
  const match = prisma.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `Prisma model ${name} was not found.`);
  return match[1];
}

test('Project persistence owns the final commercial model and optional manager/location fields', () => {
  const project = prismaModel('Project');
  assert.match(project, /projectModel\s+String\s+@default\("FIXED_PRICE"\)\s+@map\("project_model"\)/);
  assert.match(project, /projectValue\s+Decimal\s+@default\(0\)\s+@map\("project_value"\)/);
  assert.match(project, /costPlusPercent\s+Decimal\?\s+@map\("cost_plus_percent"\)/);
  assert.match(project, /projectManagerUserId\s+String\?/);
  assert.match(project, /location\s+String\?/);

  assert.match(migration, /ADD COLUMN "project_model" VARCHAR\(32\) NOT NULL DEFAULT 'FIXED_PRICE'/);
  assert.match(migration, /ADD COLUMN "project_value" DECIMAL\(18,2\) NOT NULL DEFAULT 0/);
  assert.match(migration, /ADD COLUMN "cost_plus_percent" DECIMAL\(7,4\)/);
  assert.match(migration, /ALTER COLUMN "project_manager_user_id" DROP NOT NULL/);
  assert.match(migration, /ALTER COLUMN "location" DROP NOT NULL/);
  assert.match(migration, /projects_cost_plus_percent_ck/);
});

test('active Project API contract creates directly from Client with Fixed Price or Cost + Percentage', () => {
  assert.match(schema, /projectModelSchema = z\.enum\(\['FIXED_PRICE', 'COST_PLUS_PERCENTAGE'\]\)/);
  assert.match(schema, /projectValue: projectValueSchema/);
  assert.match(schema, /costPlusPercent: costPlusPercentSchema\.nullable\(\)\.optional\(\)/);
  assert.doesNotMatch(schema, /tenderId/);

  assert.match(routes, /Create one DRAFT Project directly from a Client/);
  assert.match(routes, /projectModel: PROJECT_MODEL_JSON_SCHEMA/);
  assert.match(routes, /projectValue: PROJECT_VALUE_JSON_SCHEMA/);
  assert.doesNotMatch(routes, /tenderId|Tender/);
  assert.match(routes, /app\.post\('\/api\/v1\/projects\/:id\/resume'/);
  assert.match(routes, /operationId: 'module6ResumeProject'/);
});

test('Project close always applies source-derived readiness before the COMPLETED-to-CLOSED transition', () => {
  assert.match(repository, /async isProjectReadyToClose\(projectId: string\): Promise<boolean>/);
  assert.match(service, /repository\.isProjectReadyToClose\(projectId\)/);
  assert.doesNotMatch(service, /closeReadinessCheck/);
  assert.match(service, /PROJECT_NOT_READY/);
});

test('Project repository and service contain no active Tender linkage or Tender validation', () => {
  for (const source of [repository, service]) {
    assert.doesNotMatch(source, /tenderId|findTender|lockTender|findProjectByTender|TENDER_WON|Tender/);
  }

  assert.match(repository, /projectModel: input\.projectModel/);
  assert.match(repository, /projectValue: input\.projectValue/);
  assert.match(repository, /costPlusPercent: input\.costPlusPercent \?\? null/);
  assert.match(service, /assertValidCommercialModel/);
  assert.match(service, /clientId: input\.clientId/);
});

test('Project update clears Fixed Price markup and validates Cost + Percentage as one merged commercial state', () => {
  assert.match(service, /input\.projectModel === PROJECT_MODEL_FIXED_PRICE\s*\? null/);
  assert.match(service, /assertValidCommercialModel\(nextProjectModel, nextProjectValue, nextCostPlusPercent\)/);
  assert.match(service, /costPlusPercent: nextCostPlusPercent/);
});

test('Project lifecycle keeps the generic status-change event and adds the controlled SUSPENDED-to-ACTIVE repair command', () => {
  assert.match(schema, /'project\.status_changed'/);
  assert.match(schema, /resumeProjectBodySchema = z\.object/);
  assert.match(service, /async resumeProject\(projectId: string, input: ResumeProjectBody\)/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE\)/);
  assert.match(service, /action: 'project\.resumed'/);
  assert.match(service, /eventType: 'project\.status_changed'/);
});

test('Project React API and workspace expose commercial fields without Tender controls', () => {
  for (const source of [webApi, webPage, webDetails]) {
    assert.doesNotMatch(source, /tenderId/);
  }

  assert.match(webApi, /export function resumeProject\(projectId: string/);
  assert.match(webDetails, /Resume Project/);

  assert.match(webApi, /ProjectModel = 'FIXED_PRICE' \| 'COST_PLUS_PERCENTAGE'/);
  assert.match(webPage, /Commercial model/);
  assert.match(webPage, /Project value/);
  assert.match(webDetails, /Project commercial basis/);
});
