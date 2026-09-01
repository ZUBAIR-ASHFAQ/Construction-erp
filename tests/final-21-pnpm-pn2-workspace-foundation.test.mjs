import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_MANAGER = 'pnpm@10.34.5';

/** Read one repository file as UTF-8 text. */
function read(relativePath) {
  return readFileSync(path.join(ROOT, relativePath), 'utf8');
}

/** Read and parse one package.json file. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(read(relativePath));
}

test('PN2 pins the pnpm 10 workspace foundation without generating a lockfile early', () => {
  const pkg = readPackage();
  assert.equal(pkg.packageManager, PACKAGE_MANAGER);
  assert.deepEqual(pkg.workspaces, ['apps/*', 'packages/*']);
  assert.equal(read('pnpm-workspace.yaml'), "packages:\n  - 'apps/*'\n  - 'packages/*'\n");
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
});

test('PN2 workspace foundation remains intact after PN4 converts active package scripts', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts['dev:api'], 'pnpm --filter @construction-erp/api dev');
  assert.equal(scripts.typecheck, 'pnpm --recursive --if-present run typecheck');
  assert.equal(scripts['db:generate'], 'pnpm --filter @construction-erp/database prisma:generate');
  assert.equal(
    scripts['verify:toolchain'],
    'pnpm check:workspace && pnpm db:validate && pnpm db:generate && pnpm typecheck && pnpm build'
  );
});

test('PN2 workspace foundation remains intact after the PN3 workspace-protocol conversion', () => {
  const apiPackage = readPackage('apps/api/package.json');
  assert.equal(apiPackage.dependencies['@construction-erp/database'], 'workspace:*');
  assert.match(JSON.stringify(apiPackage), /workspace:\*/);
});
