import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile('apps/api/src/modules/clients/clients.schema.ts', 'utf8');
const repository = await readFile('apps/api/src/modules/clients/clients.repository.ts', 'utf8');
const service = await readFile('apps/api/src/modules/clients/clients.service.ts', 'utf8');
const routes = await readFile('apps/api/src/modules/clients/clients.routes.ts', 'utf8');
const webApi = await readFile('apps/web/src/features/clients/api/clients-api.ts', 'utf8');
const webPage = await readFile('apps/web/src/features/clients/pages/clients-page.tsx', 'utf8');
const webDetails = await readFile('apps/web/src/features/clients/components/client-details-panel.tsx', 'utf8');

test('Client code is server-owned for create and update requests', () => {
  const createBlock = schema.slice(schema.indexOf('export const createClientBodySchema'), schema.indexOf('/** Update only user-maintained'));
  const updateBlock = schema.slice(schema.indexOf('export const updateClientBodySchema'), schema.indexOf('/** Update editable Contact'));
  assert.doesNotMatch(createBlock, /\bcode\s*:/);
  assert.doesNotMatch(updateBlock, /\bcode\s*:/);
  assert.match(repository, /ensureClientNumberSequence/);
  assert.match(repository, /sequenceKey: 'client'/);
  assert.match(repository, /prefix: 'CLI-'/);
  assert.match(service, /allocateCompanyNumber\(tx, \{ sequenceKey: CLIENT_SEQUENCE_KEY \}\)/);
  assert.doesNotMatch(webApi.slice(webApi.indexOf('export type CreateClientInput'), webApi.indexOf('export type UpdateClientInput')), /\bcode\??:/);
  assert.doesNotMatch(webPage.slice(webPage.indexOf('Create client'), webPage.indexOf("dialog?.kind === 'open'")), /register\('code'\)|>Code</);
});

test('Client create optionally creates one contact in the same backend transaction', () => {
  assert.match(schema, /contact: createClientContactBodySchema\.optional\(\)/);
  assert.match(routes, /contact: \{[\s\S]*required: \['name'\]/);
  assert.match(service, /if \(input\.contact\) \{[\s\S]*repository\.createClientContact/);
  assert.match(service, /action: 'client\.contact_created'/);
  assert.match(webPage, /Primary contact \(optional\)/);
  assert.match(webPage, /contactName/);
  assert.match(webPage, /contactEmail/);
  assert.match(webPage, /contactPhone/);
});

test('Client Info hides financial summary and reveals contact fields only from Add contact', () => {
  assert.doesNotMatch(webDetails, /Project and financial summary|Open Client Projects/);
  assert.match(webDetails, /showContactForm/);
  assert.match(webDetails, /\+ Add contact/);
  assert.match(webDetails, /showContactForm &&/);
  assert.match(webDetails, /contactForm\.handleSubmit\(handleContact\)/);
});
