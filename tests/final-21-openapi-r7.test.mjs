import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const targets = Object.freeze([
  { file: 'apps/api/src/modules/equipment/equipment.routes.ts', routes: 7, bodies: 5, queries: 2, params: 5 },
  { file: 'apps/api/src/modules/inventory/inventory.routes.ts', routes: 7, bodies: 4, queries: 3, params: 0 },
  { file: 'apps/api/src/modules/labour-payroll/labour-payroll.routes.ts', routes: 8, bodies: 5, queries: 2, params: 4 },
  { file: 'apps/api/src/modules/procurement/procurement.routes.ts', routes: 10, bodies: 6, queries: 2, params: 5 },
  { file: 'apps/api/src/modules/vendors-subcontractors/vendors-subcontractors.routes.ts', routes: 8, bodies: 5, queries: 2, params: 4 }
]);

/** Count one literal OpenAPI token in a route source file. */
function count(source, token) {
  return source.split(token).length - 1;
}

for (const target of targets) {
  test(`R7 completes Fastify/OpenAPI metadata for ${target.file}`, async () => {
    const source = await readFile(target.file, 'utf8');
    assert.equal(count(source, 'app.get(') + count(source, 'app.post(') + count(source, 'app.patch(') + count(source, 'app.put(') + count(source, 'app.delete('), target.routes);
    assert.equal(count(source, 'security: BEARER_SECURITY'), target.routes);
    assert.equal(count(source, 'response: {'), target.routes);
    assert.equal(count(source, 'body:'), target.bodies);
    assert.equal(count(source, 'querystring:'), target.queries);
    assert.equal(count(source, 'params:'), target.params);
    assert.match(source, /required: \['code', 'message', 'requestId'\]/);
    assert.doesNotMatch(source, /companyId:\s/);
  });
}
