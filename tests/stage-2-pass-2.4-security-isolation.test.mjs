import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Read one repository-relative UTF-8 source file. */
async function source(relativePath) {
  return readFile(path.join(root, relativePath), 'utf8');
}

/** Count non-overlapping regular-expression matches in source text. */
function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

test('Pass 2.4 validates project scope kinds instead of silently widening malformed input', async () => {
  const context = await source('packages/request-context/src/context.ts');
  assert.match(context, /value\.kind !== 'restricted'/);
  assert.match(context, /!Array\.isArray\(value\.projectIds\)/);
  assert.match(context, /projectScope must be not-resolved, all, or restricted with project IDs/);
});

test('Pass 2.4 keeps company ownership defensive for malformed runtime records', async () => {
  const tenantScope = await source('packages/tenant-scope/src/scope.ts');
  assert.match(tenantScope, /typeof value !== 'string'/);
  assert.match(tenantScope, /throw new CrossCompanyAccessError\(\)/);
});

test('Pass 2.4 protected route modules authenticate every registered business route', async () => {
  const modulesRoot = path.join(root, 'apps/api/src/modules');
  const entries = await readdir(modulesRoot, { recursive: true, withFileTypes: true });
  const routeFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.routes.ts'))
    .map((entry) => path.join(entry.parentPath, entry.name));

  for (const file of routeFiles) {
    const text = await readFile(file, 'utf8');
    const routeCount = countMatches(text, /\bapp\.(?:get|post|put|patch|delete)\s*\(/g)
      + countMatches(text, /\bapp\.route\s*\(/g);
    const authenticationCount = countMatches(text, /\bauthenticateRequest\(request,/g);
    const publicAuthRoutes = file.endsWith('administration.routes.ts') ? 6 : 0;

    assert.equal(
      authenticationCount,
      routeCount - publicAuthRoutes,
      `${path.relative(root, file)} must authenticate every non-public route exactly once.`
    );
  }
});

test('Pass 2.4 authentication derives authority from session and repository data only', async () => {
  const authentication = await source('apps/api/src/plugins/authentication.ts');
  assert.match(authentication, /companyId: session\.user\.companyId/);
  assert.match(authentication, /findEffectivePermissionCodesForAuthentication/);
  assert.match(authentication, /resolveProjectScopeForAuthentication/);
  assert.doesNotMatch(authentication, /x-company-id|x-project-id|x-project-scope/i);
});

test('Pass 2.4 top-level RFI and Submittal lifecycle writes keep company and project predicates', async () => {
  const repository = await source('apps/api/src/modules/rfi-submittals/rfi-submittals.repository.ts');

  const rfiStart = repository.indexOf('  async updateRfiLifecycle(');
  const rfiEnd = repository.indexOf('  /** List Project-scoped Submittals', rfiStart);
  const rfiBlock = repository.slice(rfiStart, rfiEnd);
  assert.match(rfiBlock, /requireCompanyRepositoryScope\(\)/);
  assert.match(rfiBlock, /this\.db\.rfi\.updateMany\(/);
  assert.match(rfiBlock, /companyId: scope\.companyId/);
  assert.match(rfiBlock, /projectId: rfi\.projectId/);

  const submittalStart = repository.indexOf('  async updateSubmittalStatus(');
  const submittalEnd = repository.indexOf('  /** Lock one visible Submittal', submittalStart);
  const submittalBlock = repository.slice(submittalStart, submittalEnd);
  assert.match(submittalBlock, /requireCompanyRepositoryScope\(\)/);
  assert.match(submittalBlock, /this\.db\.submittal\.updateMany\(/);
  assert.match(submittalBlock, /companyId: scope\.companyId/);
  assert.match(submittalBlock, /projectId: submittal\.projectId/);
});
