import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_ROOTS = ['apps', 'packages'];
const NPM_SCRIPT_REFERENCE = /npm run|\bnpx\b|--workspaces?\b/i;

/** Read and parse one package.json file. */
function readPackage(relativePath = 'package.json') {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

/** List every package manifest that belongs to the active pnpm workspace. */
function listPackageManifests() {
  const manifests = ['package.json'];
  for (const rootName of PACKAGE_ROOTS) {
    for (const entry of readdirSync(path.join(ROOT, rootName), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifest = path.join(rootName, entry.name, 'package.json');
      if (existsSync(path.join(ROOT, manifest))) manifests.push(manifest);
    }
  }
  return manifests.sort();
}

test('PN4 converts active package scripts from npm workspace syntax to pnpm', () => {
  for (const manifest of listPackageManifests()) {
    const scripts = readPackage(manifest).scripts ?? {};
    for (const [name, command] of Object.entries(scripts)) {
      assert.doesNotMatch(command, NPM_SCRIPT_REFERENCE, `${manifest} script ${name} still uses npm workspace syntax`);
    }
  }
});

test('PN4 keeps root developer commands simple and preserves the existing script names', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts['dev:api'], 'pnpm --filter @construction-erp/api dev');
  assert.equal(scripts['dev:web'], 'pnpm --filter @construction-erp/web dev');
  assert.equal(scripts.typecheck, 'pnpm --recursive --if-present run typecheck');
  assert.equal(scripts['db:generate'], 'pnpm --filter @construction-erp/database prisma:generate');
  assert.equal(scripts['db:migrate:dev'], 'pnpm --filter @construction-erp/database prisma:migrate:dev --');
  assert.equal(scripts.test, 'pnpm test:static');
  assert.equal(
    scripts['verify:toolchain'],
    'pnpm check:workspace && pnpm db:validate && pnpm db:generate && pnpm typecheck && pnpm build'
  );
});

test('PN4 package-script conversion remains compatible with the PN5 recursive build command', () => {
  const scripts = readPackage().scripts;
  assert.equal(scripts['build:packages'], 'pnpm --recursive --filter \"./packages/**\" --if-present run build');
  assert.equal(scripts.build, 'pnpm --recursive --if-present run build');
});

test('PN4 converts database package script chaining without changing Prisma commands', () => {
  const scripts = readPackage('packages/database/package.json').scripts;
  assert.equal(scripts.build, 'pnpm prisma:generate && tsc -p tsconfig.build.json');
  assert.equal(scripts.typecheck, 'pnpm prisma:generate && tsc --noEmit -p tsconfig.json');
  assert.equal(scripts['prisma:generate'], 'prisma generate --schema prisma/schema.prisma');
});

test('PN4 package scripts remain converted while PN9 completes Playwright runtime conversion', () => {
  const playwright = readFileSync(path.join(ROOT, 'playwright.config.mjs'), 'utf8');
  assert.equal(existsSync(path.join(ROOT, 'package-lock.json')), false);
  assert.match(playwright, /pnpm --filter @construction-erp\/api start/);
});
