import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const apiModulesDir = path.join(root, 'apps/api/src/modules');
const webFeaturesDir = path.join(root, 'apps/web/src/features');
const shellPath = path.join(webFeaturesDir, 'administration/components/admin-shell.tsx');

/** Return sorted direct child directory names. */
async function listDirectories(directory) {
  return (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/** Return all page component files below the web feature tree. */
async function listPageFiles() {
  const featureNames = await listDirectories(webFeaturesDir);
  const pages = [];
  for (const featureName of featureNames) {
    const pagesDir = path.join(webFeaturesDir, featureName, 'pages');
    try {
      for (const name of await readdir(pagesDir)) {
        if (name.endsWith('-page.tsx')) pages.push(path.join(pagesDir, name));
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  return pages.sort();
}

/** Extract one quoted WorkspaceView sequence from source. */
function extractQuotedValues(source) {
  return [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

test('R7 keeps every active backend module paired with a browser feature area and registered API routes', async () => {
  const [apiModules, webFeatures, appSource] = await Promise.all([
    listDirectories(apiModulesDir),
    listDirectories(webFeaturesDir),
    readFile(path.join(root, 'apps/api/src/app.ts'), 'utf8')
  ]);

  assert.deepEqual(webFeatures, apiModules, 'backend modules and browser feature areas must stay aligned');
  for (const moduleName of apiModules) {
    assert.match(appSource, new RegExp(`from './modules/${moduleName}/index\\.js'`), `${moduleName} must be imported by app.ts`);
  }
});

test('R7 keeps every browser page imported and rendered by the authenticated shell or sign-in flow', async () => {
  const [shell, pageFiles] = await Promise.all([readFile(shellPath, 'utf8'), listPageFiles()]);
  assert.equal(pageFiles.length, 26, 'unexpected browser page count');

  for (const pageFile of pageFiles) {
    const source = await readFile(pageFile, 'utf8');
    const pageName = source.match(/export function (\w+Page)\b/)?.[1];
    assert.ok(pageName, `${path.relative(root, pageFile)} must export a page component`);
    assert.match(shell, new RegExp(`import \\{ ${pageName} \\}`), `${pageName} must be imported by AdminShell`);
    if (pageName === 'SignInPage') {
      assert.match(shell, /if \(!auth\.identity\) return <SignInPage \/>/);
    } else {
      assert.match(shell, new RegExp(`<${pageName}(?:\\s|/|>)`), `${pageName} must have a render branch`);
    }
  }
});

test('R7 keeps every authenticated workspace view present in order, access, navigation, and render wiring', async () => {
  const shell = await readFile(shellPath, 'utf8');
  const typeBlock = shell.match(/type WorkspaceView =([\s\S]*?);/)?.[1] ?? '';
  const orderBlock = shell.match(/const WORKSPACE_VIEW_ORDER[^=]*= \[([\s\S]*?)\];/)?.[1] ?? '';
  const accessBlock = shell.match(/const viewAccess:[\s\S]*?= \{([\s\S]*?)\n  \};/)?.[1] ?? '';

  const views = extractQuotedValues(typeBlock);
  const order = extractQuotedValues(orderBlock);
  const access = [...accessBlock.matchAll(/^\s*(?:'([^']+)'|([a-z][\w-]*)):/gm)].map((match) => match[1] ?? match[2]);
  const navigation = [...shell.matchAll(/navigationButtonClass\(activeView, '([^']+)'\)/g)].map((match) => match[1]);
  const rendered = [...shell.matchAll(/activeView === '([^']+)'/g)].map((match) => match[1]);

  assert.equal(views.length, 25, 'unexpected authenticated workspace view count');
  assert.deepEqual(order, views, 'workspace fallback order must cover every view exactly once');
  assert.deepEqual(new Set(access), new Set(views), 'permission access map must cover every view');
  assert.deepEqual(new Set(navigation), new Set(views), 'navigation must expose every authorized view');
  assert.deepEqual(new Set(rendered), new Set(views), 'render branches must cover every view');
});
