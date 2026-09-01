import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

/** Read one repository source file as UTF-8 for static repair assertions. */
function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

/** Confirm legacy implementation-stage variable names are replaced by business-domain names. */
test('R12 replaces legacy Module-number workspace variables with domain names', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const legacyName of [
    'hasModule8CompanyPermission',
    'canUseModule8',
    'hasModule12CompanyPermission',
    'canUseModule12',
    'hasModule16CompanyPermission',
    'canUseModule16'
  ]) {
    assert.doesNotMatch(shell, new RegExp(legacyName));
  }
  for (const domainName of [
    'hasProcurementCompanyPermission',
    'canUseProcurement',
    'hasEquipmentCompanyPermission',
    'canUseEquipment',
    'hasClientBillingCompanyPermission',
    'canUseClientBilling'
  ]) {
    assert.match(shell, new RegExp(domainName));
  }
});

/** Confirm shared frontend authorization helpers remove repeated permission and restricted-scope expressions. */
test('R12 centralizes workspace visibility rules in the existing auth hook file', () => {
  const auth = read('apps/web/src/features/administration/hooks/auth.tsx');
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const helper of [
    'hasAnyIdentityPermission',
    'hasRestrictedProjectMembership',
    'canUseProjectScopedWorkspace'
  ]) {
    assert.match(auth, new RegExp(`export function ${helper}`));
    assert.match(shell, new RegExp(helper));
  }
  assert.match(auth, /useDocumentWorkspaceVisibility[\s\S]*hasAnyIdentityPermission[\s\S]*hasRestrictedProjectMembership/);
  assert.match(auth, /useProjectWorkspaceVisibility[\s\S]*hasAnyIdentityPermission[\s\S]*hasRestrictedProjectMembership/);
});

/** Confirm workspace access and fallback selection use one typed map instead of a long nested conditional chain. */
test('R12 simplifies AdminShell access and fallback selection', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  assert.match(shell, /type WorkspaceView =/);
  assert.match(shell, /const viewAccess: Readonly<Record<WorkspaceView, boolean>>/);
  assert.match(shell, /WORKSPACE_VIEW_ORDER\.find\(\(candidate\) => viewAccess\[candidate\]\) \?\? null/);
  assert.doesNotMatch(shell, /const fallbackView = canReadDocuments[\s\S]*\? 'documents'[\s\S]*\? 'clients'/);
});

/** Confirm trivial one-line navigation wrappers were removed while required workspace actions remain explicit. */
test('R12 removes unnecessary one-line AdminShell navigation functions', () => {
  const shell = read('apps/web/src/features/administration/components/admin-shell.tsx');
  for (const name of [
    'showDocuments',
    'showProjectStages',
    'showProjectTeam',
    'showFinance',
    'showBudgetsJobCost',
    'showProcurement',
    'showInventory',
    'showVendorsSubcontractors',
    'showEquipment',
    'showEmployees',
    'showLabourPayroll',
    'showSiteExpenses',
    'showSupplierPayables',
    'showClientBilling',
    'showClientReceipts',
    'showProjectProfitability',
    'showOrganizationProfile',
    'showUsers',
    'showRoles',
    'showDepartments'
  ]) {
    assert.doesNotMatch(shell, new RegExp(`function ${name}\\(`));
  }
  for (const view of ['site-expenses', 'supplier-payables', 'client-billing', 'departments']) {
    assert.match(shell, new RegExp(`setView\\('${view}'\\)`));
  }
  assert.match(shell, /function showClientProjects\(/);
  assert.match(shell, /function showProjects\(/);
});

/** Confirm R12 preserves the mandated five-file backend module structure and adds no migration. */
test('R12 changes readability only and preserves backend structure and migration history', () => {
  for (const moduleName of ['administration', 'documents-audit', 'supplier-payables']) {
    const files = readdirSync(new URL(`../apps/api/src/modules/${moduleName}/`, import.meta.url))
      .filter((name) => name.endsWith('.ts'))
      .sort();
    assert.equal(files.length, 5, `${moduleName} should remain a five-file backend module`);
    assert.ok(files.includes('index.ts'));
  }
  const migrations = readdirSync(new URL('../packages/database/prisma/migrations/', import.meta.url));
  assert.equal(migrations.some((name) => /r12|readability/i.test(name)), false);
});

/** Confirm each named function changed in R12 keeps the project purpose-comment standard. */
test('R12 keeps changed named functions junior-readable with short purpose comments', () => {
  for (const relativePath of [
    'apps/web/src/features/administration/components/admin-shell.tsx',
    'apps/web/src/features/administration/hooks/auth.tsx'
  ]) {
    const lines = read(relativePath).split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      if (!/^\s*(?:export\s+)?(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/.test(lines[index])) continue;
      const previous = lines.slice(Math.max(0, index - 4), index).join('\n');
      assert.match(previous, /\/\*\*[^]*\*\//, `${relativePath}:${index + 1} needs a short purpose comment`);
    }
  }
});
