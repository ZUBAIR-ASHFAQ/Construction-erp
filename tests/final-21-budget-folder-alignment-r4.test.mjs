import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

const backend = 'apps/api/src/modules/budgets-job-cost';
const web = 'apps/web/src/features/budgets-job-cost';

/** Return true when the requested path exists. */
async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

test('R4 keeps the Budget backend in the exact five-file Final-21 folder', async () => {
  assert.deepEqual((await readdir(backend)).sort(), [
    'budgets-job-cost.repository.ts',
    'budgets-job-cost.routes.ts',
    'budgets-job-cost.schema.ts',
    'budgets-job-cost.service.ts',
    'index.ts'
  ]);
  assert.equal(await pathExists('apps/api/src/modules/budgets-job-costing'), false);
});

test('R4 keeps the Budget React feature under the required Final-21 feature slug', async () => {
  assert.deepEqual((await readdir(web)).sort(), ['api', 'components', 'hooks', 'pages']);
  assert.equal(await pathExists('apps/web/src/features/budgets-job-costing'), false);
  assert.equal(await pathExists(`${web}/api/budgets-job-cost-api.ts`), true);
  assert.equal(await pathExists(`${web}/hooks/budgets-job-cost.ts`), true);
  assert.equal(await pathExists(`${web}/pages/budgets-job-cost-page.tsx`), true);
});

test('R4 application imports use the aligned Budget module and feature paths', async () => {
  const apiApp = await readFile('apps/api/src/app.ts', 'utf8');
  const adminShell = await readFile('apps/web/src/features/administration/components/admin-shell.tsx', 'utf8');
  assert.match(apiApp, /\.\/modules\/budgets-job-cost\/index\.js/);
  assert.doesNotMatch(apiApp, /budgets-job-costing/);
  assert.match(adminShell, /\.\.\/\.\.\/budgets-job-cost\/pages\/budgets-job-cost-page\.js/);
  assert.doesNotMatch(adminShell, /budgets-job-costing/);
});
