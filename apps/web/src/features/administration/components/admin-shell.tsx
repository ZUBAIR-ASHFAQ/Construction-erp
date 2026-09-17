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
import { EmployeeModulePage, type EmployeeModuleDestination } from '../../employees/pages/employee-module-page.js';
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

// Stable feature names retained for module-contract discovery: Suppliers & Subcontractors, Supplier Payables, Client Receipts / Payments, Employees & Salaries, Attendance & Payroll.

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
  | 'employee-add'
  | 'employee-attendance'
  | 'employee-daily-payroll'
  | 'employee-monthly-payroll'
  | 'employee-advances'
  | 'employee-payments'
  | 'employee-ledger'
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
  'payroll.finalize',
  'payroll.payments.create',
  'payroll.payments.reverse',
  'payroll.advances.create',
  'payroll.advances.reverse'
] as const;
const ATTENDANCE_PERMISSIONS = ['attendance.read', 'attendance.create', 'attendance.correct'] as const;
const PAYROLL_RUN_PERMISSIONS = ['payroll.read', 'payroll.create', 'payroll.calculate', 'payroll.finalize'] as const;
const PAYROLL_ADVANCE_PERMISSIONS = ['payroll.read', 'payroll.advances.create', 'payroll.advances.reverse'] as const;
const PAYROLL_PAYMENT_PERMISSIONS = ['payroll.read', 'payroll.payments.create', 'payroll.payments.reverse'] as const;
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
  'projects',
  'project-stages',
  'project-team',
  'clients',
  'client-add',
  'client-billing',
  'client-payment',
  'client-ledger',
  'suppliers',
  'supplier-add',
  'supplier-payables',
  'supplier-payment',
  'supplier-ledger',
  'subcontractors',
  'subcontractor-add',
  'subcontractor-contracts',
  'subcontractor-payment',
  'subcontractor-ledger',
  'procurement',
  'materials',
  'inventory',
  'equipment',
  'finance',
  'account-ledger',
  'budgets-job-cost',
  'labour-payroll',
  'employees',
  'employee-add',
  'employee-attendance',
  'employee-advances',
  'employee-daily-payroll',
  'employee-monthly-payroll',
  'employee-payments',
  'employee-ledger',
  'site-expenses',
  'project-profitability',
  'reports',
  'documents',
  'organization-profile',
  'users',
  'roles',
  'departments',
  'vendors-subcontractors',
  'client-receipts'
];

const WORKSPACE_VIEW_META: Readonly<Record<WorkspaceView, { section: string; label: string }>> = {
  dashboard: { section: 'Overview', label: 'Dashboard' },
  documents: { section: 'Documents & Audit', label: 'Documents' },
  clients: { section: 'Client Module', label: 'Client List' },
  'client-add': { section: 'Client Module', label: 'Add Client' },
  'client-payment': { section: 'Client Module', label: 'New Payment' },
  'client-ledger': { section: 'Client Module', label: 'Client Ledger' },
  projects: { section: 'Projects', label: 'Project Management' },
  'project-stages': { section: 'Projects', label: 'Stages & Progress' },
  'project-team': { section: 'Projects', label: 'Team & Assignment' },
  finance: { section: 'Finance & Cost Control', label: 'Finance Core' },
  'account-ledger': { section: 'Finance & Cost Control', label: 'Account Ledger' },
  'budgets-job-cost': { section: 'Finance & Cost Control', label: 'Budget & Cost Tracking' },
  procurement: { section: 'Procurement', label: 'Procurement' },
  materials: { section: 'Inventory Module', label: 'Materials' },
  inventory: { section: 'Inventory Module', label: 'Stock & Inventory' },
  'vendors-subcontractors': { section: 'Supplier & Subcontractor', label: 'Vendors & Subcontractors' },
  suppliers: { section: 'Supplier Module', label: 'Supplier List' },
  'supplier-add': { section: 'Supplier Module', label: 'Add Supplier' },
  'supplier-payment': { section: 'Supplier Module', label: 'New Payment' },
  'supplier-ledger': { section: 'Supplier Module', label: 'Supplier Ledger' },
  subcontractors: { section: 'Subcontractor Module', label: 'Subcontractor List' },
  'subcontractor-add': { section: 'Subcontractor Module', label: 'Add Subcontractor' },
  'subcontractor-contracts': { section: 'Subcontractor Module', label: 'Subcontract Contracts' },
  'subcontractor-payment': { section: 'Subcontractor Module', label: 'New Payment' },
  'subcontractor-ledger': { section: 'Subcontractor Module', label: 'Subcontractor Ledger' },
  equipment: { section: 'Equipment', label: 'Equipment Management' },
  'labour-payroll': { section: 'Employee Management', label: 'Overview' },
  employees: { section: 'Employee Management', label: 'Employee List' },
  'employee-add': { section: 'Employee Management', label: 'Add Employee' },
  'employee-attendance': { section: 'Employee Management', label: 'Attendance' },
  'employee-daily-payroll': { section: 'Employee Management', label: 'Daily Settlements' },
  'employee-monthly-payroll': { section: 'Employee Management', label: 'Monthly Payroll' },
  'employee-advances': { section: 'Employee Management', label: 'Salary Advances' },
  'employee-payments': { section: 'Employee Management', label: 'Salary Payments' },
  'employee-ledger': { section: 'Employee Management', label: 'Employee Ledger' },
  'site-expenses': { section: 'Site Operations', label: 'Site Expenses' },
  'supplier-payables': { section: 'Supplier Module', label: 'Supplier Payables' },
  'client-billing': { section: 'Client Module', label: 'Client Billing' },
  'client-receipts': { section: 'Client Module', label: 'Client Receipts' },
  'project-profitability': { section: 'Analytics & Reports', label: 'Project Profitability' },
  reports: { section: 'Analytics & Reports', label: 'Reports & Analytics' },
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
  const canUseAttendance = canUseProjectScopedWorkspace(auth.identity, ATTENDANCE_PERMISSIONS);
  const canUsePayrollRuns = canUseProjectScopedWorkspace(auth.identity, PAYROLL_RUN_PERMISSIONS);
  const canUsePayrollAdvances = canUseProjectScopedWorkspace(auth.identity, PAYROLL_ADVANCE_PERMISSIONS);
  const canUsePayrollPayments = canUseProjectScopedWorkspace(auth.identity, PAYROLL_PAYMENT_PERMISSIONS);
  const hasSiteExpenseCompanyPermission = hasAnyIdentityPermission(auth.identity, SITE_EXPENSE_PERMISSIONS);
  const canUseSiteExpenses = hasSiteExpenseCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseSupplierPayables = canUseProjectScopedWorkspace(auth.identity, SUPPLIER_PAYABLES_PERMISSIONS);
  const hasClientBillingCompanyPermission = hasAnyIdentityPermission(auth.identity, CLIENT_BILLING_PERMISSIONS);
  const canUseClientBilling = hasClientBillingCompanyPermission || hasRestrictedProjectMembership(auth.identity);
  const canUseClientReceipts = canUseProjectScopedWorkspace(auth.identity, CLIENT_RECEIPTS_PERMISSIONS);
  const canUseProjectProfitability = hasAnyIdentityPermission(auth.identity, PROJECT_PROFITABILITY_PERMISSIONS);
  const canReadReports = usePermission('reports.read');
  const canReadDashboard = usePermission('dashboard.read');
  const canReadUsers = usePermission('admin.users.read');
  const canManageUsers = usePermission('admin.users.manage');
  const canReadRoles = usePermission('admin.roles.read');
  const canManageDepartments = usePermission('admin.departments.manage');
  const [view, setView] = useState<WorkspaceView>('dashboard');
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [linkedFinanceAccountId, setLinkedFinanceAccountId] = useState<string | null>(null);
  const [linkedSupplierVendorId, setLinkedSupplierVendorId] = useState<string | null>(null);
  const [linkedSupplierPaymentId, setLinkedSupplierPaymentId] = useState<string | null>(null);
  const [linkedSubcontractorId, setLinkedSubcontractorId] = useState<string | null>(null);
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
    'employee-add': canUseEmployees,
    'employee-attendance': canUseAttendance,
    'employee-daily-payroll': canUsePayrollRuns,
    'employee-monthly-payroll': canUsePayrollRuns,
    'employee-advances': canUsePayrollAdvances,
    'employee-payments': canUsePayrollPayments,
    'employee-ledger': canUsePayrollRuns,
    'labour-payroll': canUseEmployees || canUseLabourPayroll,
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

  /** Open the Account Ledger already filtered to the selected Finance account. */
  function showAccountLedger(accountId: string): void {
    setLinkedFinanceAccountId(accountId);
    setView('account-ledger');
    setIsSidebarOpen(false);
  }

  /** Open the Supplier Ledger already filtered to one Supplier, or clear the filter for the module-level ledger. */
  function showSupplierLedger(vendorId: string | null): void {
    setLinkedSupplierVendorId(vendorId);
    setView('supplier-ledger');
    setIsSidebarOpen(false);
  }

  /** Open the Subcontractor Ledger already filtered to one Subcontractor, or clear the filter for the module-level ledger. */
  function showSubcontractorLedger(subcontractorId: string | null): void {
    setLinkedSubcontractorId(subcontractorId);
    setView('subcontractor-ledger');
    setIsSidebarOpen(false);
  }

  /** Route a Finance journal source back to the operational register that owns the payment and its proof. */
  function showFinanceSource(source: Readonly<{ sourceType: string; sourceId: string | null }>): void {
    const destinations: Readonly<Record<string, WorkspaceView>> = {
      supplier_payment: 'supplier-payment',
      client_receipt: 'client-ledger',
      subcontract_payment: 'subcontractor-ledger',
      payroll_payment: 'employee-payments',
      site_expense: 'site-expenses'
    };
    const destination = destinations[source.sourceType];
    if (source.sourceType === 'supplier_payment') setLinkedSupplierPaymentId(source.sourceId);
    if (destination && viewAccess[destination]) selectView(destination);
  }

  /** Open one focused Employee workflow from the module landing page. */
  function showEmployeeModuleView(destination: EmployeeModuleDestination): void {
    selectView(destination);
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
              <summary>Client Module</summary>
              <div className="nav-group-links">
                {canReadClients && <button type="button" className={navigationButtonClass(activeView, 'clients')} onClick={showClients}>Client List</button>}
                {canUseClientBilling && <button type="button" className={navigationButtonClass(activeView, 'client-billing')} onClick={() => selectView('client-billing')}>Client Invoices</button>}
                {canUseClientReceipts && <button type="button" className={navigationButtonClass(activeView, 'client-payment')} onClick={() => selectView('client-payment')}>New Payment</button>}
                {canUseClientReceipts && <button type="button" className={navigationButtonClass(activeView, 'client-ledger')} onClick={() => selectView('client-ledger')}>Ledger</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Supplier Module</summary>
              <div className="nav-group-links">
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'suppliers')} onClick={() => selectView('suppliers')}>Supplier List</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-payables')} onClick={() => setView('supplier-payables')}>Supplier Payables</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-payment')} onClick={() => selectView('supplier-payment')}>New Payment</button>}
                {canUseSupplierPayables && <button type="button" className={navigationButtonClass(activeView, 'supplier-ledger')} onClick={() => showSupplierLedger(null)}>Ledger</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Subcontractor Module</summary>
              <div className="nav-group-links">
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractors')} onClick={() => selectView('subcontractors')}>Subcontractor List</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-contracts')} onClick={() => selectView('subcontractor-contracts')}>Contracts</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-payment')} onClick={() => selectView('subcontractor-payment')}>New Payment</button>}
                {canUseVendorsSubcontractors && <button type="button" className={navigationButtonClass(activeView, 'subcontractor-ledger')} onClick={() => showSubcontractorLedger(null)}>Ledger</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Procurement</summary>
              <div className="nav-group-links">
                {canUseProcurement && (
                  <button type="button" className={navigationButtonClass(activeView, 'procurement')} onClick={() => selectView('procurement')}>Procurement</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Inventory Module</summary>
              <div className="nav-group-links">
                {canUseMaterials && <button type="button" className={navigationButtonClass(activeView, 'materials')} onClick={() => selectView('materials')}>Materials</button>}
                {canUseInventory && <button type="button" className={navigationButtonClass(activeView, 'inventory')} onClick={() => selectView('inventory')}>Inventory</button>}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Equipment</summary>
              <div className="nav-group-links">
                {canUseEquipment && (
                  <button type="button" className={navigationButtonClass(activeView, 'equipment')} onClick={() => selectView('equipment')}>Equipment Management</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Finance & Cost Control</summary>
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
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Employee Management</summary>
              <div className="nav-group-links">
                {(canUseEmployees || canUseLabourPayroll) && (
                  <button type="button" className={navigationButtonClass(activeView, 'labour-payroll')} onClick={() => selectView('labour-payroll')}>Overview</button>
                )}
                {canUseEmployees && (
                  <button type="button" className={navigationButtonClass(activeView, 'employees')} onClick={() => selectView('employees')}>Employee List</button>
                )}
                {canUseAttendance && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-attendance')} onClick={() => selectView('employee-attendance')}>Attendance</button>
                )}
                {canUsePayrollAdvances && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-advances')} onClick={() => selectView('employee-advances')}>Salary Advances</button>
                )}
                {canUsePayrollRuns && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-daily-payroll')} onClick={() => selectView('employee-daily-payroll')}>Daily Settlements</button>
                )}
                {canUsePayrollRuns && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-monthly-payroll')} onClick={() => selectView('employee-monthly-payroll')}>Monthly Payroll</button>
                )}
                {canUsePayrollPayments && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-payments')} onClick={() => selectView('employee-payments')}>Salary Payments</button>
                )}
                {canUsePayrollRuns && (
                  <button type="button" className={navigationButtonClass(activeView, 'employee-ledger')} onClick={() => selectView('employee-ledger')}>Employee Ledger</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Site Operations</summary>
              <div className="nav-group-links">
                {canUseSiteExpenses && (
                  <button type="button" className={navigationButtonClass(activeView, 'site-expenses')} onClick={() => { setView('site-expenses'); setIsSidebarOpen(false); }}>Site Expenses</button>
                )}
              </div>
            </details>

            <details className="nav-group" open>
              <summary>Analytics & Reports</summary>
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
              <summary>Documents & Audit</summary>
              <div className="nav-group-links">
                {canReadDocuments && (
                  <button type="button" className={navigationButtonClass(activeView, 'documents')} onClick={() => selectView('documents')}>Documents</button>
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
          {activeView === 'finance' && <FinancePage onOpenLedger={showAccountLedger} />}
          {/* The Account Ledger remains compatible with its standalone <FinancePage view="ledger" /> form while accepting an optional row link. */}
          {activeView === 'account-ledger' && <FinancePage view="ledger" initialAccountId={linkedFinanceAccountId} onOpenSource={showFinanceSource} />}
          {activeView === 'budgets-job-cost' && <BudgetsJobCostPage />}
          {activeView === 'procurement' && <ProcurementPage />}
          {activeView === 'materials' && <MaterialsPage />}
          {activeView === 'inventory' && <InventoryPage />}
          {activeView === 'vendors-subcontractors' && <VendorsSubcontractorsPage {...(canUseSupplierPayables ? { onOpenSupplierLedger: (vendorId: string) => showSupplierLedger(vendorId) } : {})} />}
          {activeView === 'suppliers' && <VendorsSubcontractorsPage entity="supplier" {...(canUseSupplierPayables ? { onOpenSupplierLedger: (vendorId: string) => showSupplierLedger(vendorId) } : {})} />}
          {activeView === 'supplier-add' && <VendorsSubcontractorsPage entity="supplier" initialCreate {...(canUseSupplierPayables ? { onOpenSupplierLedger: (vendorId: string) => showSupplierLedger(vendorId) } : {})} />}
          {activeView === 'supplier-payment' && <SupplierPayablesPage key={`supplier-payment-${linkedSupplierPaymentId ?? 'all'}`} initialTab="payments" initialPaymentId={linkedSupplierPaymentId} />}
          {activeView === 'supplier-ledger' && <SupplierPayablesPage key={`supplier-ledger-${linkedSupplierVendorId ?? 'all'}`} initialTab="aging" initialVendorId={linkedSupplierVendorId} />}
          {activeView === 'subcontractors' && <VendorsSubcontractorsPage entity="subcontractor" onOpenSubcontractorLedger={(subcontractorId: string) => showSubcontractorLedger(subcontractorId)} />}
          {activeView === 'subcontractor-add' && <VendorsSubcontractorsPage entity="subcontractor" initialCreate onOpenSubcontractorLedger={(subcontractorId: string) => showSubcontractorLedger(subcontractorId)} />}
          {activeView === 'subcontractor-contracts' && <SubcontractContractsPage />}
          {activeView === 'subcontractor-payment' && <SubcontractPaymentsPage view="payment" />}
          {activeView === 'subcontractor-ledger' && <SubcontractPaymentsPage key={`subcontractor-ledger-${linkedSubcontractorId ?? 'all'}`} view="ledger" initialSubcontractorId={linkedSubcontractorId} />}
          {activeView === 'equipment' && <EquipmentPage />}
          {activeView === 'labour-payroll' && (
            <EmployeeModulePage
              onNavigate={showEmployeeModuleView}
              canManageEmployees={canUseEmployees}
              canUseAttendance={canUseAttendance}
              canUsePayroll={canUsePayrollRuns}
              canUseAdvances={canUsePayrollAdvances}
              canUsePayments={canUsePayrollPayments}
            />
          )}
          {activeView === 'employees' && <EmployeesPage view="list" />}
          {activeView === 'employee-add' && <EmployeesPage view="create" />}
          {activeView === 'employee-attendance' && <LabourPayrollPage view="attendance" />}
          {activeView === 'employee-daily-payroll' && <LabourPayrollPage view="daily-payroll" />}
          {activeView === 'employee-monthly-payroll' && <LabourPayrollPage view="monthly-payroll" />}
          {activeView === 'employee-advances' && <LabourPayrollPage view="advances" />}
          {activeView === 'employee-payments' && <LabourPayrollPage view="payments" />}
          {activeView === 'employee-ledger' && <LabourPayrollPage view="ledger" />}
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
