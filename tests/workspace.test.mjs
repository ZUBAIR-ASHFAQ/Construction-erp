import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const currentFullModules = [
  'administration',
  'budgets-job-cost',
  'client-billing',
  'client-receipts',
  'clients',
  'documents-audit',
  'employees',
  'equipment',
  'finance',
  'inventory',
  'labour-payroll',
  'procurement',
  'project-profitability',
  'project-stages',
  'project-team',
  'projects',
  'reports',
  'dashboard',
  'site-expenses',
  'supplier-payables',
  'vendors-subcontractors'
];

/** Read one workspace package.json as parsed JSON. */
async function readPackage(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath, 'package.json'), 'utf8'));
}

/** Return every production TypeScript/JavaScript source file below one directory. */
async function listProductionSources(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'dist' && entry.name !== 'node_modules') files.push(...await listProductionSources(fullPath));
    } else if (/\.(?:ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/** Check whether the nearest non-empty line above a declaration is a short line or block comment. */
function hasPurposeComment(lines, declarationIndex) {
  let index = declarationIndex - 1;
  while (index >= 0 && lines[index].trim() === '') index -= 1;
  if (index < 0) return false;
  const previous = lines[index].trim();
  return previous.startsWith('//') || previous.endsWith('*/');
}

/** Find named functions and top-level class methods without a nearby purpose comment. */
function findUncommentedFunctions(source, relativePath) {
  const lines = source.split(/\r?\n/);
  const missing = [];
  let braceDepth = 0;
  let classBodyDepth = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(?:export\s+)?class\s+[A-Za-z_$][\w$]*/.test(line) && line.includes('{')) classBodyDepth = braceDepth + 1;

    const functionMatch = line.match(/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[<(]/);
    const arrowMatch = line.match(/^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/);
    const methodMatch = classBodyDepth !== null && braceDepth === classBodyDepth
      ? line.match(/^\s*(?:(?:public|private|protected)\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*\(/)
      : null;
    const name = functionMatch?.[1] ?? arrowMatch?.[1] ?? methodMatch?.[1];
    if (name && !hasPurposeComment(lines, index)) missing.push(`${relativePath}:${index + 1} ${name}()`);

    braceDepth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
    if (classBodyDepth !== null && braceDepth < classBodyDepth) classBodyDepth = null;
  }

  return missing;
}

test('required TypeScript monorepo stack stays unchanged', async () => {
  const rootPackage = await readPackage('.');
  const api = await readPackage('apps/api');
  const web = await readPackage('apps/web');
  const database = await readPackage('packages/database');

  assert.deepEqual(rootPackage.workspaces, ['apps/*', 'packages/*']);
  assert.ok(rootPackage.devDependencies.typescript);
  assert.ok(api.dependencies.fastify);
  assert.ok(web.dependencies.react);
  assert.ok(web.devDependencies.vite);
  assert.ok(database.dependencies['@prisma/client']);
  assert.ok(database.devDependencies.prisma);
});

test('current backend modules keep the approved five-file shape', async () => {
  for (const moduleName of currentFullModules) {
    const files = (await readdir(path.join(root, 'apps/api/src/modules', moduleName))).sort();
    const sourceFiles = files.filter((name) => name.endsWith('.ts'));
    assert.equal(sourceFiles.length, 5, `${moduleName} must keep exactly five backend TypeScript files`);
    assert.ok(sourceFiles.includes('index.ts'), `${moduleName} needs index.ts`);
    for (const suffix of ['routes.ts', 'service.ts', 'repository.ts', 'schema.ts']) {
      assert.ok(sourceFiles.some((name) => name.endsWith(suffix)), `${moduleName} needs ${suffix}`);
    }
  }
});

test('B18.4 promotes Client Receipts to the approved five-file backend shape', async () => {
  const files = (await readdir(path.join(root, 'apps/api/src/modules/client-receipts'))).filter((name) => name.endsWith('.ts')).sort();
  assert.deepEqual(files, [
    'client-receipts.repository.ts',
    'client-receipts.routes.ts',
    'client-receipts.schema.ts',
    'client-receipts.service.ts',
    'index.ts'
  ]);
});

test('current React features keep api hooks components and pages folders', async () => {
  for (const moduleName of currentFullModules) {
    const entries = await readdir(path.join(root, 'apps/web/src/features', moduleName), { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
    assert.deepEqual(directories, ['api', 'components', 'hooks', 'pages'], `${moduleName} React structure changed`);
  }
});

test('R1 keeps only current Final-21 and maintenance commands in the root script surface', async () => {
  const rootPackage = await readPackage('.');
  const scriptNames = Object.keys(rootPackage.scripts ?? {});

  assert.ok(rootPackage.scripts['test:static']);
  assert.ok(rootPackage.scripts['test:final-21']);
  assert.ok(rootPackage.scripts['db:migrations:verify']);
  assert.ok(rootPackage.scripts['final-21-client-billing:b17-1:gate']);
  assert.equal(scriptNames.some((name) => /^module-|^pass-|^audit-repair:|^baseline:|^stages-/.test(name)), false);
  assert.ok(scriptNames.length < 100, `root script surface is still too large: ${scriptNames.length}`);
});

test('R1 static and integration runners exclude legacy module and pass-era wildcard ownership', async () => {
  const staticRunner = await readFile(path.join(root, 'scripts/testing/run-static.mjs'), 'utf8');
  const integrationRunner = await readFile(path.join(root, 'scripts/testing/run-integration.mjs'), 'utf8');
  const playwrightConfig = await readFile(path.join(root, 'playwright.config.mjs'), 'utf8');

  assert.doesNotMatch(staticRunner, /tests\/\*\.test\.mjs|module-24|pass-\d+/);
  assert.match(staticRunner, /final-21-/);
  assert.doesNotMatch(integrationRunner, /module-\d+-api\.integration/);
  assert.match(integrationRunner, /final-21-site-expenses-api\.integration/);
  assert.match(integrationRunner, /final-21-supplier-payables-api\.integration/);
  assert.doesNotMatch(playwrightConfig, /RUN_MODULE_/);
});


test('R2 preserves the compiler verification chain after PN4 switches active scripts to pnpm', async () => {
  const rootPackage = await readPackage('.');
  assert.equal(rootPackage.packageManager, 'pnpm@10.34.5');
  assert.equal(
    rootPackage.scripts['verify:toolchain'],
    'pnpm check:workspace && pnpm db:validate && pnpm db:generate && pnpm typecheck && pnpm build'
  );
});

test('R2 keeps every local workspace dependency aligned to the referenced workspace version', async () => {
  const groups = ['apps', 'packages'];
  const workspaces = [];

  for (const group of groups) {
    const entries = await readdir(path.join(root, group), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const relativeDir = path.join(group, entry.name);
      workspaces.push({ relativeDir, manifest: await readPackage(relativeDir) });
    }
  }

  const localVersions = new Map(workspaces.map(({ manifest }) => [manifest.name, manifest.version]));
  for (const { relativeDir, manifest } of workspaces) {
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies']) {
      for (const [name, requestedVersion] of Object.entries(manifest[section] ?? {})) {
        const localVersion = localVersions.get(name);
        if (!localVersion) continue;
        assert.ok(
          requestedVersion === localVersion || requestedVersion === `workspace:${localVersion}` || requestedVersion === 'workspace:*',
          `${relativeDir} requests ${name}@${requestedVersion}, expected local workspace version ${localVersion}`
        );
      }
    }
  }
});

test('every named production function has a short purpose comment', async () => {
  const roots = [path.join(root, 'apps'), path.join(root, 'packages'), path.join(root, 'scripts')];
  const sourceFiles = (await Promise.all(roots.map(listProductionSources))).flat().sort();
  const missing = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8');
    missing.push(...findUncommentedFunctions(source, path.relative(root, file)));
  }

  assert.equal(
    missing.length,
    0,
    `Add a short purpose comment above each named function/method:\n${missing.slice(0, 80).join('\n')}${missing.length > 80 ? `\n...and ${missing.length - 80} more` : ''}`
  );
});
