import { useState } from 'react';
import { webConfig } from '../../../config.js';
import {
  canUseProjectScopedWorkspace,
  hasAnyIdentityPermission,
  hasRestrictedProjectMembership,
  useAuth,
  useDocumentWorkspaceVisibility,
  usePermission,
  useProjectWorkspaceVisibility
} from '../hooks/auth.js';
import { DocumentsPage } from '../../documents-audit/pages/documents-page.js';
import { ClientsPage } from '../../clients/pages/clients-page.js';
import { ProjectsPage } from '../../projects/pages/projects-page.js';
import { ProjectStagesPage } from '../../project-stages/pages/project-stages-page.js';
import { ProjectTeamPage } from '../../project-team/pages/project-team-page.js';
import { FinancePage } from '../../finance/pages/finance-page.js';
import { BudgetsJobCostPage } from '../../budgets-job-cost/pages/budgets-job-cost-page.js';
import { ProcurementPage } from '../../procurement/pages/procurement-page.js';
import { InventoryPage } from '../../inventory/pages/inventory-page.js';
import { MaterialsPage } from '../../inventory/pages/materials-page.js';
import { VendorsSubcontractorsPage } from '../../vendors-subcontractors/pages/vendors-subcontractors-page.js';
import { SubcontractContractsPage } from '../../vendors-subcontractors/pages/subcontract-contracts-page.js';
import { SubcontractPaymentsPage } from '../../vendors-subcontractors/pages/subcontract-payments-page.js';
import { EquipmentPage } from '../../equipment/pages/equipment-page.js';
import { EmployeesPage } from '../../employees/pages/employees-page.js';
import { LabourPayrollPage } from '../../labour-payroll/pages/labour-payroll-page.js';
import { SiteExpensesPage } from '../../site-expenses/pages/site-expenses-page.js';
import { SupplierPayablesPage } from '../../supplier-payables/pages/supplier-payables-page.js';
import { ClientBillingPage } from '../../client-billing/pages/client-billing-page.js';
import { ClientReceiptsPage } from '../../client-receipts/pages/client-receipts-page.js';
import { ProjectProfitabilityPage } from '../../project-profitability/pages/project-profitability-page.js';
import { ReportsPage } from '../../reports/pages/reports-page.js';
import { DashboardPage } from '../../dashboard/pages/dashboard-page.js';
import { DepartmentsPage } from '../pages/departments-page.js';
import { OrganizationProfilePage } from '../pages/organization-profile-page.js';
import { RolesPage } from '../pages/roles-page.js';
import { SignInPage } from '../pages/sign-in-page.js';
import { UsersPage } from '../pages/users-page.js';

// Stable feature names retained for module-contract discovery: Suppliers & Subcontractors, Supplier Payables, Client Receipts / Payments.

type WorkspaceView =
  | 'dashboard'
  | 'documents'
  | 'clients'
  | 'client-add'
  | 'client-payment'
  | 'client-ledger'
  | 'projects'
  | 'project-stages'
  | 'project-team'
  | 'finance'
  | 'account-ledger'
  | 'budgets-job-cost'
  | 'procurement'
  | 'materials'
  | 'inventory'
  | 'vendors-subcontractors'
  | 'suppliers'
  | 'supplier-add'
  | 'supplier-payment'
  | 'supplier-ledger'
  | 'subcontractors'
  | 'subcontractor-add'
  | 'subcontractor-contracts'
  | 'subcontractor-payment'
  | 'subcontractor-ledger'
  | 'equipment'
  | 'employees'
  | 'labour-payroll'
  | 'site-expenses'
  | 'supplier-payables'
  | 'client-billing'
  | 'client-receipts'
  | 'project-profitability'
  | 'reports'
  | 'organization-profile'
  | 'users'
  | 'roles'
  | 'departments';

const PROJECT_STAGES_PERMISSIONS = [
  'stages.read',
  'stages.manage',
  'stages.baseline.freeze',
  'stages.progress.update',
  'stages.progress.approve',
  'stages.financial.read'
] as const;
const PROJECT_TEAM_PERMISSIONS = ['project_team.read', 'project_team.manage'] as const;
const FINANCE_PERMISSIONS = [
  'finance.read',
  'finance.accounts.manage',
  'finance.journals.create',
  'finance.journals.post',
  'finance.journals.reverse',
  'finance.periods.close',
  'finance.reconcile'
] as const;
const BUDGET_PERMISSIONS = [
  'budgets.read',
  'budgets.create',
  'budgets.edit',
  'budgets.freeze',
  'job_cost.read',
  'forecast.update'
] as const;
const PROCUREMENT_PERMISSIONS = [
  'procurement.read',
  'requisitions.create',
  'requisitions.approve',
  'purchase_orders.create',
  'purchase_orders.issue',
  'goods_receipts.create'
] as const;
const MATERIAL_PERMISSIONS = ['inventory.read', 'materials.manage'] as const;
const INVENTORY_PERMISSIONS = [
  'inventory.read',
  'inventory.transfer',
  'inventory.issue',
  'inventory.adjust'
] as const;
const VENDOR_PERMISSIONS = [
  'vendors.read',
  'vendors.create',
  'vendors.update',
  'subcontractors.read',
  'subcontractors.manage'
] as const;
const EQUIPMENT_PERMISSIONS = [
  'equipment.read',
  'equipment.manage',
  'equipment.assign',
  'equipment.usage.create',
  'equipment.maintenance.manage'
] as const;
const EMPLOYEE_PERMISSIONS = [
  'employees.read',
  'employees.create',
  'employees.update',
  'employees.compensation.manage'
] as const;
const LABOUR_PAYROLL_PERMISSIONS = [
  'attendance.read',
  'attendance.create',
  'attendance.correct',
  'payroll.read',
  'payroll.create',
  'payroll.calculate',
  'payroll.finalize'
] as const;
const SITE_EXPENSE_PERMISSIONS = [
  'site_expenses.read',
  'site_expenses.create',
  'site_expenses.update',
  'site_expenses.post',
  'site_expenses.reverse'
] as const;
const SUPPLIER_PAYABLES_PERMISSIONS = [
  'supplier_payables.read',
  'supplier_invoices.create',
  'supplier_invoices.post',
  'supplier_payments.create',
  'supplier_payments.allocate'
] as const;
const CLIENT_BILLING_PERMISSIONS = [
  'client_billing.read',
  'client_billing.settings.manage',
  'claims.create',
  'claims.edit',
  'claims.finalize',
  'client_invoices.create',
  'client_invoices.read'
] as const;
const CLIENT_RECEIPTS_PERMISSIONS = [
  'client_receipts.read',
  'client_receipts.create',
  'client_receipts.allocate',
  'client_receipts.reverse'
] as const;
const PROJECT_PROFITABILITY_PERMISSIONS = [
  'project_profitability.read',
  'project_profitability.finance.read',
  'project_profitability.portfolio.read'
] as const;
const WORKSPACE_VIEW_ORDER: readonly WorkspaceView[] = [
  'dashboard',
  'documents',
  'clients',
  'client-add',
  'client-payment',
  'client-ledger',
  'projects',
  'project-stages',
  'project-team',
  'finance',
  'account-ledger',
  'budgets-job-cost',
  'procurement',
  'materials',
  'inventory',
  'vendors-subcontractors',
  'suppliers',
  'supplier-add',
  'supplier-payment',
  'supplier-ledger',
  'subcontractors',
  'subcontractor-add',
  'subcontractor-contracts',
  'subcontractor-payment',
  'subcontractor-ledger',
  'equipment',
  'employees',
  'labour-payroll',
  'site-expenses',
  'supplier-payables',
  'client-billing',
  'client-receipts',
  'project-profitability',
  'reports',
  'organization-profile',
  'users',
  'roles',
  'departments'
];

const WORKSPACE_VIEW_META: Readonly<Record<WorkspaceView, { section: string; label: string }>> = {
  dashboard: { section: 'Overview', label: 'Dashboard' },
  documents: { section: 'Overview', label: 'Documents' },
  clients: { section: 'Clients', label: 'Client List' },
  'client-add': { section: 'Clients', label: 'Add Client' },
  'client-payment': { section: 'Clients', label: 'New Payment' },
  'client-ledger': { section: 'Clients', label: 'Client Ledger' },
  projects: { section: 'Projects', label: 'Project Management' },
  'project-stages': { section: 'Projects', label: 'Stages & Progress' },
  'project-team': { section: 'Projects', label: 'Team & Assignment' },
  finance: { section: 'Commercial', label: 'Finance Core' },
  'account-ledger': { section: 'Commercial', label: 'Account Ledger' },
  'budgets-job-cost': { section: 'Commercial', label: 'Budget & Cost Tracking' },
  procurement: { section: 'Commercial', label: 'Procurement' },
  materials: { section: 'Inventory', label: 'Materials' },
  inventory: { section: 'Inventory', label: 'Stock & Inventory' },
  'vendors-subcontractors': { section: 'Commercial', label: 'Vendors & Subcontractors' },
  suppliers: { section: 'Suppliers', label: 'Supplier List' },
  'supplier-add': { section: 'Suppliers', label: 'Add Supplier' },
  'supplier-payment': { section: 'Suppliers', label: 'New Payment' },
  'supplier-ledger': { section: 'Suppliers', label: 'Supplier Ledger' },
  subcontractors: { section: 'Subcontractors', label: 'Subcontractor List' },
  'subcontractor-add': { section: 'Subcontractors', label: 'Add Subcontractor' },
  'subcontractor-contracts': { section: 'Subcontractors', label: 'Subcontract Contracts' },
  'subcontractor-payment': { section: 'Subcontractors', label: 'New Payment' },
  'subcontractor-ledger': { section: 'Subcontractors', label: 'Subcontractor Ledger' },
  equipment: { section: 'Operations', label: 'Equipment Management' },
  employees: { section: 'People & Site', label: 'Employees & Salaries' },
  'labour-payroll': { section: 'People & Site', label: 'Attendance & Payroll' },
  'site-expenses': { section: 'People & Site', label: 'Site Expenses' },
  'supplier-payables': { section: 'Billing', label: 'Supplier Payables' },
  'client-billing': { section: 'Billing', label: 'Client Billing' },
  'client-receipts': { section: 'Billing', label: 'Client Receipts' },
  'project-profitability': { section: 'Analytics', label: 'Project Profitability' },
  reports: { section: 'Analytics', label: 'Reports & Analytics' },
  'organization-profile': { section: 'Administration', label: 'Organization Profile' },
  users: { section: 'Administration', label: 'Users' },
  roles: { section: 'Administration', label: 'Roles & Permissions' },
  departments: { section: 'Administration', label: 'Departments' }
};

/** Return the shared navigation button class for one workspace view. */
function navigationButtonClass(activeView: WorkspaceView | null, view: WorkspaceView): string {
  return activeView === view ? 'nav-button active' : 'nav-button';
}

/** Render authentication first, then the small permission-aware ERP workspace shell. */
export function AdminShell() {
  const auth = useAuth();
  const canReadDocuments = useDocumentWorkspaceVisibility();
  const canReadClients = usePermission('clients.read');
  const canReadProjects = useProjectWorkspaceVisibility();
  const canUseProjectStages = canUseProjectScopedWorkspace(auth.identity, PROJECT_STAGES_PERMISSIONS);
  const canUseProjectTeam = canUseProjectScopedWorkspace(auth.identity, PROJECT_TEAM_PERMISSIONS);
  const canUseFinance = canUseProjectScopedWorkspace(auth.identity, FINANCE_PERMISSIONS);
  const canReadFinance = usePermission('finance.read');
  const canUseBudgets = canUseProjectScopedWorkspace(auth.identity, BUDGET_PERMISSIONS);
  const hasProcurementCompanyPermission = hasAnyIdentityPermission(auth.identity, PROCUREMENT_PERMISSIONS);
  const canUseProcurement = hasProcurementCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseMaterials = canUseProjectScopedWorkspace(auth.identity, MATERIAL_PERMISSIONS);
  const canUseInventory = canUseProjectScopedWorkspace(auth.identity, INVENTORY_PERMISSIONS);
  const canUseVendorsSubcontractors = hasAnyIdentityPermission(auth.identity, VENDOR_PERMISSIONS);
  const hasEquipmentCompanyPermission = hasAnyIdentityPermission(auth.identity, EQUIPMENT_PERMISSIONS);
  const canUseEquipment = hasEquipmentCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseEmployees = hasAnyIdentityPermission(auth.identity, EMPLOYEE_PERMISSIONS);
  const canUseLabourPayroll = canUseProjectScopedWorkspace(auth.identity, LABOUR_PAYROLL_PERMISSIONS);
  const hasSiteExpenseCompanyPermission = hasAnyIdentityPermission(auth.identity, SITE_EXPENSE_PERMISSIONS);
  const canUseSiteExpenses = hasSiteExpenseCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseSupplierPayables = canUseProjectScopedWorkspace(auth.identity, SUPPLIER_PAYABLES_PERMISSIONS);
  const hasClientBillingCompanyPermission = hasAnyIdentityPermission(auth.identity, CLIENT_BILLING_PERMISSIONS);
  const canUseClientBilling = hasClientBillingCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseClientReceipts = canUseProjectScopedWorkspace(auth.identity, CLIENT_RECEIPTS_PERMISSIONS);
  const canUseProjectProfitability = canUseProjectScopedWorkspace(auth.identity, PROJECT_PROFITABILITY_PERMISSIONS);
  const canReadReports = usePermission('reports.read');
  const canReadDashboard = usePermission('dashboard.read');
  const canReadUsers = usePermission('admin.users.read');
  const canManageUsers = usePermission('admin.users.manage');
  const canReadRoles = usePermission('admin.roles.read');
  const canManageDepartments = usePermission('admin.departments.manage');
  const [view, setView] = useState<WorkspaceView>('dashboard');
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  if (auth.isCheckingSession) {
    return (
      <main className="auth-page">
        <section className="auth-card" aria-live="polite">
          <p className="eyebrow">{webConfig.appName}</p>
          <h1>Checking session…</h1>
        </section>
      </main>
    );
  }

  if (!auth.identity) return <SignInPage />;

  const viewAccess: Readonly<Record<WorkspaceView, boolean>> = {
    dashboard: canReadDashboard,
    documents: canReadDocuments,
    clients: canReadClients,
    'client-add': canReadClients,
    'client-payment': canUseClientReceipts,
    'client-ledger': canUseClientReceipts,
    projects: canReadProjects,
    'project-stages': canUseProjectStages,
    'project-team': canUseProjectTeam,
    finance: canUseFinance,
    'account-ledger': canReadFinance,
    'budgets-job-cost': canUseBudgets,
    procurement: canUseProcurement,
    materials: canUseMaterials,
    inventory: canUseInventory,
    'vendors-subcontractors': canUseVendorsSubcontractors,
    suppliers: canUseVendorsSubcontractors,
    'supplier-add': canUseVendorsSubcontractors,
    'supplier-payment': canUseSupplierPayables,
    'supplier-ledger': canUseSupplierPayables,
    subcontractors: canUseVendorsSubcontractors,
    'subcontractor-add': canUseVendorsSubcontractors,
    'subcontractor-contracts': canUseVendorsSubcontractors,
    'subcontractor-payment': canUseVendorsSubcontractors,
    'subcontractor-ledger': canUseVendorsSubcontractors,
    equipment: canUseEquipment,
    employees: canUseEmployees,
    'labour-payroll': canUseLabourPayroll,
    'site-expenses': canUseSiteExpenses,
    'supplier-payables': canUseSupplierPayables,
    'client-billing': canUseClientBilling,
    'client-receipts': canUseClientReceipts,
    'project-profitability': canUseProjectProfitability,
    reports: canReadReports,
    'organization-profile': canReadUsers,
    users: canReadUsers,
    roles: canReadRoles,
    departments: canManageDepartments
  };
  const currentViewAllowed = viewAccess[view];
  const fallbackView = WORKSPACE_VIEW_ORDER.find((candidate) => viewAccess[candidate]) ?? null;
  const activeView = currentViewAllowed ? view : fallbackView;
  const activeViewMeta = activeView ? WORKSPACE_VIEW_META[activeView] : null;

  /** Sign out without putting authentication details inside the button callback. */
  function handleSignOut(): void {
    void auth.signOut();
  }

  /** Show Client Management and clear any Project list filter inherited from a Client detail link. */
  function showClients(): void {
    setLinkedClientId(null);
    setView('clients');
    setIsSidebarOpen(false);
  }

  /** Open Project Management already filtered to the selected Client. */
  function showClientProjects(clientId: string): void {
    setLinkedClientId(clientId);
    setView('projects');
    setIsSidebarOpen(false);
  }

  /** Show Project Management without a Client filter. */
  function showProjects(): void {
    setLinkedClientId(null);
    setView('projects');
    setIsSidebarOpen(false);
  }

  /** Select one workspace and close the mobile navigation drawer. */
  function selectView(nextView: WorkspaceView): void {
    setView(nextView);
    setIsSidebarOpen(false);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label="Open module navigation"
            aria-expanded={isSidebarOpen}
            onClick={() => setIsSidebarOpen((current) => !current)}
          >
            <span aria-hidden="true">☰</span>
          </button>
          <div className="topbar-title">
            <p className="topbar-breadcrumb">
              <span>{activeViewMeta?.section ?? 'Construction ERP'}</span>
              <i aria-hidden="true">/</i>
              <strong>{activeViewMeta?.label ?? webConfig.appName}</strong>
            </p>
            <small>{webConfig.appName}</small>
          </div>
        </div>

        <div className="topbar-right">
          <span className="user-avatar" aria-hidden="true">{auth.identity.user.name.slice(0, 1).toUpperCase()}</span>
          <button type="button" className="secondary-button" onClick={handleSignOut} disabled={auth.isSigningOut}>
            {auth.isSigningOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <div className="admin-layout">
        <aside className={isSidebarOpen ? 'admin-nav open' : 'admin-nav'} aria-label="ERP workspace navigation">
          <div className="sidebar-brand">
            <span className="brand-mark" aria-hidden="true">CE</span>
            <span className="brand-copy">
              <strong>Construction ERP</strong>
              <small>Operations workspace</small>
            </span>
          </div>

          <div className="sidebar-scope">
            <span className="sidebar-scope-icon" aria-hidden="true">P</span>
            <span className="sidebar-scope-copy">
              <small>Project scope</small>
              <strong>{auth.identity.projectScope.kind === 'all' ? 'All projects' : `${auth.identity.projectScope.projectIds.length} assigned project(s)`}</strong>
            </span>
          </div>

          <div className="nav-scroll">
            <details className="nav-group" open>
              <summary>Overview</summary>
              <div className="nav-group-links">
                {canReadDashboard && (
                  <button type="button" className={navigationButtonClass(activeView, 'dashboard')} onClick={() => selectView('dashboard')}>Dashboard</button>
                )}
                {canReadDocuments && (
                  <button type="button" className={navigationButtonClass(activeView, 'documents')} onClick={() => selectView('documents')}>Documents</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Client Module</summary>
              <div className="nav-group-links">
                {canReadClients && <button type="button" className={navigationButtonClass(activeView, 'clients')} onClick={showClients}>Client List</button>}
                {canReadClients && <button type="button" className={navigationButtonClass(activeView, 'client-add')} onClick={() => selectView('client-add')}>Add New</button>}
                {canUseClientReceipts && <button type="button" className={navigationButtonClass(activeView, 'client-payment')} onClick={() => selectView('client-payment')}>New Payment</button>}
                {canUseClientReceipts && <button type="button" className={navigationButtonClass(activeView, 'client-ledger')} onClick={() => selectView('client-ledger')}>Ledger</button>}
                {canUseClientBilling && <button type="button" className={navigationButtonClass(activeView, 'client-billing')} onClick={() => selectView('client-billing')}>Invoices / Billing</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Supplier Module</summary>
              <div className="nav-group-links">
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'suppliers')} onClick={() => selectView('suppliers')}>Supplier List</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'supplier-add')} onClick={() => selectView('supplier-add')}>Add New</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-payables')} onClick={() => setView('supplier-payables')}>Supplier Payables</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-payment')} onClick={() => selectView('supplier-payment')}>New Payment</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-ledger')} onClick={() => selectView('supplier-ledger')}>Ledger</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Subcontractor Module</summary>
              <div className="nav-group-links">
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractors')} onClick={() => selectView('subcontractors')}>Subcontractor List</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-add')} onClick={() => selectView('subcontractor-add')}>Add New</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-contracts')} onClick={() => selectView('subcontractor-contracts')}>Contracts</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-payment')} onClick={() => selectView('subcontractor-payment')}>New Payment</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-ledger')} onClick={() => selectView('subcontractor-ledger')}>Ledger</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Inventory Module</summary>
              <div className="nav-group-links">
                {canUseInventory && <button type="button" className={navigationButtonClass(activeView, 'inventory')} onClick={() => selectView('inventory')}>Inventory</button>}
                {canUseMaterials && <button type="button" className={navigationButtonClass(activeView, 'materials')} onClick={() => selectView('materials')}>Materials</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Projects</summary>
              <div className="nav-group-links">
                {canReadProjects && (
                  <button type="button" className={navigationButtonClass(activeView, 'projects')} onClick={showProjects}>Project Management</button>
                )}
                {canUseProjectStages && (
                  <button type="button" className={navigationButtonClass(activeView, 'project-stages')} onClick={() => selectView('project-stages')}>Project Stages / Progress</button>
                )}
                {canUseProjectTeam && (
                  <button type="button" className={navigationButtonClass(activeView, 'project-team')} onClick={() => selectView('project-team')}>Project Team / Assignment</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Commercial & Operations</summary>
              <div className="nav-group-links">
                {canUseFinance && (
                  <button type="button" className={navigationButtonClass(activeView, 'finance')} onClick={() => selectView('finance')}>Finance Core</button>
                )}
                {canReadFinance && (
                  <button type="button" className={navigationButtonClass(activeView, 'account-ledger')} onClick={() => selectView('account-ledger')}>Account Ledger</button>
                )}
                {canUseBudgets && (
                  <button type="button" className={navigationButtonClass(activeView, 'budgets-job-cost')} onClick={() => selectView('budgets-job-cost')}>Budget & Cost Tracking</button>
                )}
                {canUseProcurement && (
                  <button type="button" className={navigationButtonClass(activeView, 'procurement')} onClick={() => selectView('procurement')}>Procurement</button>
                )}
                {canUseEquipment && (
                  <button type="button" className={navigationButtonClass(activeView, 'equipment')} onClick={() => selectView('equipment')}>Equipment Management</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>People & Site</summary>
              <div className="nav-group-links">
                {canUseEmployees && (
                  <button type="button" className={navigationButtonClass(activeView, 'employees')} onClick={() => selectView('employees')}>Employees & Salaries</button>
                )}
                {canUseLabourPayroll && (
                  <button type="button" className={navigationButtonClass(activeView, 'labour-payroll')} onClick={() => selectView('labour-payroll')}>Attendance & Payroll</button>
                )}
                {canUseSiteExpenses && (
                  <button type="button" className={navigationButtonClass(activeView, 'site-expenses')} onClick={() => { setView('site-expenses'); setIsSidebarOpen(false); }}>Site Expenses</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Billing & Analytics</summary>
              <div className="nav-group-links">
                {canUseProjectProfitability && (
                  <button type="button" className={navigationButtonClass(activeView, 'project-profitability')} onClick={() => selectView('project-profitability')}>Project Profitability</button>
                )}
                {canReadReports && (
                  <button type="button" className={navigationButtonClass(activeView, 'reports')} onClick={() => selectView('reports')}>Reports & Analytics</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Administration</summary>
              <div className="nav-group-links">
                {canReadUsers && (
                  <button type="button" className={navigationButtonClass(activeView, 'organization-profile')} onClick={() => selectView('organization-profile')}>Organization profile</button>
                )}
                {canReadUsers && (
                  <button type="button" className={navigationButtonClass(activeView, 'users')} onClick={() => selectView('users')}>Users</button>
                )}
                {canReadRoles && (
                  <button type="button" className={navigationButtonClass(activeView, 'roles')} onClick={() => selectView('roles')}>Roles & Permissions</button>
                )}
                {canManageDepartments && (
                  <button type="button" className={navigationButtonClass(activeView, 'departments')} onClick={() => { setView('departments'); setIsSidebarOpen(false); }}>Departments</button>
                )}
              </div>
            </details>
          </div>

          <div className="sidebar-footer">
            <span className="sidebar-user-avatar" aria-hidden="true">{auth.identity.user.name.slice(0, 1).toUpperCase()}</span>
            <span className="sidebar-user-copy">
              <strong>{auth.identity.user.name}</strong>
              <small>{auth.identity.user.email}</small>
            </span>
          </div>
        </aside>

        {isSidebarOpen && (
          <button type="button" className="sidebar-overlay" aria-label="Close module navigation" onClick={() => setIsSidebarOpen(false)} />
        )}

        <div className="admin-content">
          {activeView === 'dashboard' && <DashboardPage />}
          {activeView === 'documents' && <DocumentsPage />}
          {activeView === 'clients' && (
            <ClientsPage
              {...(canReadProjects ? { onOpenProjectsForClient: showClientProjects } : {})}
            />
          )}
          {activeView === 'client-add' && <ClientsPage initialCreate {...(canReadProjects ? { onOpenProjectsForClient: showClientProjects } : {})} />}
          {activeView === 'client-payment' && <ClientReceiptsPage view="payment" />}
          {activeView === 'client-ledger' && <ClientReceiptsPage view="ledger" />}
          {activeView === 'projects' && <ProjectsPage key={`projects-${linkedClientId ?? 'all'}`} initialClientId={linkedClientId} />}
          {activeView === 'project-stages' && <ProjectStagesPage />}
          {activeView === 'project-team' && <ProjectTeamPage />}
          {activeView === 'finance' && <FinancePage />}
          {activeView === 'account-ledger' && <FinancePage view="ledger" />}
          {activeView === 'budgets-job-cost' && <BudgetsJobCostPage />}
          {activeView === 'procurement' && <ProcurementPage />}
          {activeView === 'materials' && <MaterialsPage />}
          {activeView === 'inventory' && <InventoryPage />}
          {activeView === 'vendors-subcontractors' && <VendorsSubcontractorsPage />}
          {activeView === 'suppliers' && <VendorsSubcontractorsPage entity="supplier" />}
          {activeView === 'supplier-add' && <VendorsSubcontractorsPage entity="supplier" initialCreate />}
          {activeView === 'supplier-payment' && <SupplierPayablesPage initialTab="payments" />}
          {activeView === 'supplier-ledger' && <SupplierPayablesPage initialTab="aging" />}
          {activeView === 'subcontractors' && <VendorsSubcontractorsPage entity="subcontractor" />}
          {activeView === 'subcontractor-add' && <VendorsSubcontractorsPage entity="subcontractor" initialCreate />}
          {activeView === 'subcontractor-contracts' && <SubcontractContractsPage />}
          {activeView === 'subcontractor-payment' && <SubcontractPaymentsPage view="payment" />}
          {activeView === 'subcontractor-ledger' && <SubcontractPaymentsPage view="ledger" />}
          {activeView === 'equipment' && <EquipmentPage />}
          {activeView === 'employees' && <EmployeesPage />}
          {activeView === 'labour-payroll' && <LabourPayrollPage />}
          {activeView === 'site-expenses' && <SiteExpensesPage />}
          {activeView === 'supplier-payables' && <SupplierPayablesPage />}
          {activeView === 'client-billing' && <ClientBillingPage />}
          {activeView === 'client-receipts' && <ClientReceiptsPage />}
          {activeView === 'project-profitability' && <ProjectProfitabilityPage />}
          {activeView === 'reports' && <ReportsPage />}
          {activeView === 'organization-profile' && <OrganizationProfilePage canEdit={canManageUsers} />}
          {activeView === 'users' && <UsersPage />}
          {activeView === 'roles' && <RolesPage />}
          {activeView === 'departments' && <DepartmentsPage />}
          {activeView === null && (
            <section className="admin-card">
              <h1>No module access</h1>
              <p className="muted">Your current role does not include access to the available workspace modules.</p>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
