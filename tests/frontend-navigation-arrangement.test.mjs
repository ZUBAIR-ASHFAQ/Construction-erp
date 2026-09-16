import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('workspace navigation follows the corrected module grouping and order', async () => {
  const shell = await read('apps/web/src/features/administration/components/admin-shell.tsx');
  const navStart = shell.indexOf('<div className="nav-scroll">');
  const navEnd = shell.indexOf('<div className="sidebar-footer">', navStart);
  const nav = shell.slice(navStart, navEnd);
  const summaries = [
    'Overview',
    'Projects',
    'Client Module',
    'Supplier Module',
    'Subcontractor Module',
    'Procurement',
    'Inventory Module',
    'Equipment',
    'Finance & Cost Control',
    'Employee Management',
    'Site Operations',
    'Analytics & Reports',
    'Documents & Audit',
    'Administration'
  ];

  let previous = -1;
  for (const summary of summaries) {
    const position = nav.indexOf(`<summary>${summary}</summary>`);
    assert.notEqual(position, -1, `${summary} should appear in navigation`);
    assert.ok(position > previous, `${summary} should appear after the previous module group`);
    previous = position;
  }

  assert.ok(nav.indexOf('>Materials</button>') < nav.indexOf('>Inventory</button>'));
  assert.ok(nav.indexOf('>Client Invoices</button>') < nav.indexOf('>New Payment</button>'));
  assert.ok(nav.indexOf('>Finance Core</button>') < nav.indexOf('>Budget & Cost Tracking</button>'));
});

test('duplicate create-only sidebar pages are removed while list-page create functionality remains', async () => {
  const [shell, clients, vendors, employees] = await Promise.all([
    read('apps/web/src/features/administration/components/admin-shell.tsx'),
    read('apps/web/src/features/clients/pages/clients-page.tsx'),
    read('apps/web/src/features/vendors-subcontractors/components/vendors-subcontractors-workspace.tsx'),
    read('apps/web/src/features/employees/pages/employees-page.tsx')
  ]);
  const navStart = shell.indexOf('<div className="nav-scroll">');
  const navEnd = shell.indexOf('<div className="sidebar-footer">', navStart);
  const nav = shell.slice(navStart, navEnd);

  for (const duplicateView of ['client-add', 'supplier-add', 'subcontractor-add', 'employee-add']) {
    assert.doesNotMatch(nav, new RegExp(`navigationButtonClass\\(activeView, '${duplicateView}'\\)`));
  }

  assert.match(clients, />\s*Create client\s*<\/button>/s);
  assert.match(vendors, />\s*Add supplier\s*<\/button>/s);
  assert.match(vendors, />\s*Add subcontractor\s*<\/button>/s);
  assert.match(employees, />\s*Add Employee\s*<\/button>/s);

  // Keep the existing focused create views available to internal module shortcuts; only the duplicate sidebar links are removed.
  assert.match(shell, /<ClientsPage initialCreate/);
  assert.match(shell, /<VendorsSubcontractorsPage entity="supplier" initialCreate/);
  assert.match(shell, /<VendorsSubcontractorsPage entity="subcontractor" initialCreate/);
  assert.match(shell, /<EmployeesPage view="create" \/>/);
});

test('breadcrumbs use the same corrected module ownership as the sidebar', async () => {
  const shell = await read('apps/web/src/features/administration/components/admin-shell.tsx');

  assert.match(shell, /documents: \{ section: 'Documents & Audit', label: 'Documents' \}/);
  assert.match(shell, /'supplier-payables': \{ section: 'Supplier Module', label: 'Supplier Payables' \}/);
  assert.match(shell, /'client-billing': \{ section: 'Client Module', label: 'Client Billing' \}/);
  assert.match(shell, /finance: \{ section: 'Finance & Cost Control', label: 'Finance Core' \}/);
  assert.match(shell, /procurement: \{ section: 'Procurement', label: 'Procurement' \}/);
  assert.match(shell, /equipment: \{ section: 'Equipment', label: 'Equipment Management' \}/);
  assert.match(shell, /'site-expenses': \{ section: 'Site Operations', label: 'Site Expenses' \}/);
  assert.match(shell, /reports: \{ section: 'Analytics & Reports', label: 'Reports & Analytics' \}/);
});
