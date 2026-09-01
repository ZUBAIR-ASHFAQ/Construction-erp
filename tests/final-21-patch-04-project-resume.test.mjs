import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const webHooks = await readFile('apps/web/src/features/projects/hooks/projects.ts', 'utf8');
const webDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');

/** Keep the repair command narrow: one optional reason and the existing projects.activate authority. */
test('PATCH 04: resume API is wired end-to-end without new permission or persistence', () => {
  assert.match(schema, /POST', route: '\/api\/v1\/projects\/:id\/resume'/);
  assert.match(schema, /resumeProjectBodySchema = z\.object\(\{[\s\S]*reason: closeReasonSchema\.optional\(\)/);
  assert.match(routes, /app\.post\('\/api\/v1\/projects\/:id\/resume'/);
  assert.match(routes, /operationId: 'module6ResumeProject'/);
  assert.match(service, /async resumeProject\(projectId: string, input: ResumeProjectBody\)/);
  assert.match(service, /'projects\.activate'/);
  assert.doesNotMatch(schema, /projects\.resume/);
});

/** Resume must revalidate the activation prerequisites before reopening operational writes. */
test('PATCH 04: resume revalidates dates, commercial model and active Project references', () => {
  const start = service.indexOf('async resumeProject');
  const end = service.indexOf('/** Mark one ACTIVE Project complete', start);
  const resume = service.slice(start, end);

  assert.match(resume, /before\.status === PROJECT_ACTIVE/);
  assert.match(resume, /before\.status !== PROJECT_SUSPENDED/);
  assert.match(resume, /assertValidDateRange\(before\.startDate, before\.plannedEndDate\)/);
  assert.match(resume, /assertValidCommercialModel\(before\.projectModel, before\.projectValue, before\.costPlusPercent\)/);
  assert.match(resume, /requireActiveProjectReferences/);
  assert.match(resume, /transitionProjectStatus\(projectId, PROJECT_SUSPENDED, PROJECT_ACTIVE\)/);
});

/** Resume must preserve one auditable lifecycle transition and use the existing generic Project event contract. */
test('PATCH 04: resume writes status history, audit evidence and generic status-change outbox event', () => {
  const start = service.indexOf('async resumeProject');
  const end = service.indexOf('/** Mark one ACTIVE Project complete', start);
  const resume = service.slice(start, end);

  assert.match(resume, /fromStatus: PROJECT_SUSPENDED/);
  assert.match(resume, /toStatus: PROJECT_ACTIVE/);
  assert.match(resume, /reason: input\.reason \?\? null/);
  assert.match(resume, /action: 'project\.resumed'/);
  assert.match(resume, /eventType: 'project\.status_changed'/);
  assert.doesNotMatch(resume, /eventType: 'project\.resumed'/);
});

/** The Project workspace must expose resume only to activation-authorized users on suspended Projects. */
test('PATCH 04: React API, hook and lifecycle control expose controlled resume', () => {
  assert.match(webApi, /export function resumeProject\(projectId: string, input: ProjectLifecycleReasonInput = \{\}\)/);
  assert.match(webApi, /projects\/\$\{projectId\}\/resume/);
  assert.match(webHooks, /export function useResumeProject\(projectId: string\)/);
  assert.match(webDetails, /canActivate && project\.status === 'SUSPENDED'/);
  assert.match(webDetails, /Resume Project/);
});
