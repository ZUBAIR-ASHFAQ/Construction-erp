import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const currentFullModules = [
  'administration',
  'budgets-job-cost',
  'client-billing',
  'client-receipts',
  'clients',
  'dashboard',
  'documents-audit',
  'employees',
  'equipment',
  'finance',
  'inventory',
  'labour-payroll',
  'procurement',
  'project-stages',
  'project-team',
  'projects',
  'reports',
  'site-expenses',
  'supplier-payables',
  'vendors-subcontractors'
];

/** Read one JSON file from the repository root. */
async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}


/** Return every workspace package manifest with its relative directory. */
async function listWorkspacePackages() {
  const workspaces = [];
  for (const group of ['apps', 'packages']) {
    const entries = await readdir(path.join(root, group), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativeDir = path.join(group, entry.name);
      const manifest = await readJson(path.join(relativeDir, 'package.json'));
      workspaces.push({ relativeDir, manifest });
    }
  }
  return workspaces;
}

/** Confirm local workspace dependency versions match the package versions they reference. */
function verifyWorkspaceDependencyVersions(workspaces) {
  const localVersions = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest.version]));
  for (const { relativeDir, manifest } of workspaces) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, requestedVersion] of Object.entries(manifest[section] ?? {})) {
        const localVersion = localVersions.get(name);
        if (!localVersion) continue;
        assert.ok(
          requestedVersion === localVersion || requestedVersion === `workspace:${localVersion}` || requestedVersion === 'workspace:*',
          `${relativeDir} requests ${name}@${requestedVersion}, but the workspace version is ${localVersion}`
        );
      }
    }
  }
}

/** Confirm one required repository path exists. */
async function requirePath(relativePath) {
  await access(path.join(root, relativePath));
}

const rootPackage = await readJson('package.json');
const apiPackage = await readJson('apps/api/package.json');
const webPackage = await readJson('apps/web/package.json');
const databasePackage = await readJson('packages/database/package.json');

assert.deepEqual(rootPackage.workspaces, ['apps/*', 'packages/*']);
assert.ok(rootPackage.devDependencies.typescript, 'root TypeScript dependency is required');
assert.ok(apiPackage.dependencies.fastify, 'Fastify is required by the API');
assert.ok(webPackage.dependencies.react, 'React is required by the web app');
assert.ok(webPackage.devDependencies.vite, 'Vite is required by the web app');
assert.ok(databasePackage.dependencies['@prisma/client'], 'Prisma Client is required by the database package');
assert.ok(databasePackage.devDependencies.prisma, 'Prisma CLI is required by the database package');
assert.equal(rootPackage.packageManager, 'pnpm@10.34.5', 'PN2 requires the pinned pnpm package-manager contract');
assert.ok(rootPackage.scripts?.['verify:toolchain'], 'R2 toolchain verification script is required');

const workspacePackages = await listWorkspacePackages();
verifyWorkspaceDependencyVersions(workspacePackages);

for (const relativePath of [
  'apps/api/src/app.ts',
  'apps/api/src/main.ts',
  'apps/web/src/main.tsx',
  'packages/database/prisma/schema.prisma',
  'packages/database/prisma/migration-gates.json',
  'packages/database/prisma/migration-checksums.json'
]) {
  await requirePath(relativePath);
}

const currentBackendModules = [...currentFullModules, 'project-profitability'].sort();
const currentWebFeatures = [...currentFullModules, 'project-profitability'].sort();

const backendModules = (await readdir(path.join(root, 'apps/api/src/modules'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const webFeatures = (await readdir(path.join(root, 'apps/web/src/features'), { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
assert.deepEqual(backendModules, currentBackendModules);
assert.deepEqual(webFeatures, currentWebFeatures);

console.log('Workspace structure and required stack are valid for the current Final-21 implementation.');
