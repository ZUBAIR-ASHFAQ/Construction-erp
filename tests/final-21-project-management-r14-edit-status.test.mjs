import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/projects/projects.schema.ts', 'utf8');
const service = await readFile('apps/api/src/modules/projects/projects.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/projects/projects.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/projects/api/projects-api.ts', 'utf8');
const webDetails = await readFile('apps/web/src/features/projects/components/project-details-panel.tsx', 'utf8');

/** Keep lifecycle authority on the dedicated backend command instead of accepting status in normal PATCH data. */
test('R14 keeps Project creation Draft and activation server-owned', () => {
  assert.match(schema, /Create one company-owned DRAFT Project without accepting server-owned lifecycle fields/);
  assert.match(schema, /PROJECT_SERVER_OWNED_REQUEST_FIELDS[\s\S]*'status'/);
  assert.doesNotMatch(schema.match(/export const createProjectBodySchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/)?.[1] ?? '', /\bstatus\s*:/);
  assert.doesNotMatch(schema.match(/export const updateProjectBodySchema = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/)?.[1] ?? '', /\bstatus\s*:/);
});

/** Verify the backend activation path still owns authorization, transition history, audit and outbox evidence. */
test('R14 uses the existing audited Draft to Active backend transition', () => {
  assert.match(routes, /POST[\s\S]*\/api\/v1\/projects\/:id\/activate|projects\/:id\/activate/);
  assert.match(service, /async activateProject\(projectId: string\)/);
  assert.match(service, /'projects\.activate'/);
  assert.match(service, /transitionProjectStatus\(projectId, PROJECT_DRAFT, PROJECT_ACTIVE\)/);
  assert.match(service, /createProjectStatusHistory\([\s\S]*fromStatus: PROJECT_DRAFT,[\s\S]*toStatus: PROJECT_ACTIVE/);
  assert.match(service, /action: 'project\.activated'/);
  assert.match(service, /eventType: 'project\.status_changed'/);
});

/** Show status in Edit Project and make Active available only through the real lifecycle command. */
test('R14 Edit Project exposes Draft to Active without putting status in PATCH', () => {
  assert.match(webDetails, /status: z\.enum\(\['DRAFT', 'ACTIVE', 'SUSPENDED', 'COMPLETED', 'CLOSED'\]\)/);
  assert.match(webDetails, /status: project\.status/);
  assert.match(webDetails, /Project status[\s\S]*editForm\.register\('status'\)/);
  assert.match(webDetails, /canActivateFromEdit = project\.status === 'DRAFT' && canActivate/);
  assert.match(webDetails, /canActivateFromEdit && <option value="ACTIVE">ACTIVE<\/option>/);
  assert.match(webDetails, /requestsActivation = project\.status === 'DRAFT' && values\.status === 'ACTIVE'/);
  assert.match(webDetails, /await updateMutation\.mutateAsync\(\{[\s\S]*location: values\.location \|\| null[\s\S]*\}\);[\s\S]*if \(requestsActivation\) \{[\s\S]*await activateMutation\.mutateAsync\(\)/);
  assert.doesNotMatch(webDetails.match(/await updateMutation\.mutateAsync\(\{([\s\S]*?)\}\);/)?.[1] ?? '', /\bstatus\s*:/);
});

/** Keep the browser API contract explicit: master PATCH has no status while activate remains a separate command. */
test('R14 browser API keeps update and activation contracts separate', () => {
  const updateType = webApi.match(/export type UpdateProjectInput = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? '';
  assert.doesNotMatch(updateType, /\bstatus\??\s*:/);
  assert.match(webApi, /export function activateProject\(projectId: string\): Promise<Project>/);
  assert.match(webApi, /`projects\/\$\{projectId\}\/activate`/);
});
