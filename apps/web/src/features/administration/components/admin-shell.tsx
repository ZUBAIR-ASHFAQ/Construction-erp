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
import { VendorsSubcontractorsPage } from '../../vendors-subcontractors/pages/vendors-subcontractors-page.js';
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

type WorkspaceView =
  | 'dashboard'
  | 'documents'
  | 'clients'
  | 'projects'
  | 'project-stages'
  | 'project-team'
  | 'finance'
  | 'budgets-job-cost'
  | 'procurement'
  | 'inventory'
  | 'vendors-subcontractors'
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
const INVENTORY_PERMISSIONS = [
  'inventory.read',
  'materials.manage',
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
  'projects',
  'project-stages',
  'project-team',
  'finance',
  'budgets-job-cost',
  'procurement',
  'inventory',
  'vendors-subcontractors',
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
  const canUseBudgets = canUseProjectScopedWorkspace(auth.identity, BUDGET_PERMISSIONS);
  const hasProcurementCompanyPermission = hasAnyIdentityPermission(auth.identity, PROCUREMENT_PERMISSIONS);
  const canUseProcurement = hasProcurementCompanyPermission || hasRestrictedProjectMembership(auth.identity);
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
    projects: canReadProjects,
    'project-stages': canUseProjectStages,
    'project-team': canUseProjectTeam,
    finance: canUseFinance,
    'budgets-job-cost': canUseBudgets,
    procurement: canUseProcurement,
    inventory: canUseInventory,
    'vendors-subcontractors': canUseVendorsSubcontractors,
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

  /** Sign out without putting authentication details inside the button callback. */
  function handleSignOut(): void {
    void auth.signOut();
  }

  /** Show Client Management and clear any Project list filter inherited from a Client detail link. */
  function showClients(): void {
    setLinkedClientId(null);
    setView('clients');
  }

  /** Open Project Management already filtered to the selected Client. */
  function showClientProjects(clientId: string): void {
    setLinkedClientId(clientId);
    setView('projects');
  }

  /** Show Project Management without a Client filter. */
  function showProjects(): void {
    setLinkedClientId(null);
    setView('projects');
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{webConfig.appName}</p>
          <strong>{auth.identity.user.name}</strong>
          <span className="muted"> · {auth.identity.user.email}</span>
        </div>
        <button type="button" className="secondary-button" onClick={handleSignOut} disabled={auth.isSigningOut}>
          {auth.isSigningOut ? 'Signing out…' : 'Sign out'}
        </button>
      </header>

      <div className="admin-layout">
        <aside className="admin-nav" aria-label="ERP workspace navigation">
          <p className="eyebrow">Workspace</p>
          {canReadDashboard && (
            <button type="button" className={navigationButtonClass(activeView, 'dashboard')} onClick={() => setView('dashboard')}>Dashboard</button>
          )}
          {canReadDocuments && (
            <button type="button" className={navigationButtonClass(activeView, 'documents')} onClick={() => setView('documents')}>Documents</button>
          )}
          {canReadClients && (
            <button type="button" className={navigationButtonClass(activeView, 'clients')} onClick={showClients}>Client Management</button>
          )}
          {canReadProjects && (
            <button type="button" className={navigationButtonClass(activeView, 'projects')} onClick={showProjects}>Project Management</button>
          )}
          {canUseProjectStages && (
            <button type="button" className={navigationButtonClass(activeView, 'project-stages')} onClick={() => setView('project-stages')}>Project Stages / Progress</button>
          )}
          {canUseProjectTeam && (
            <button type="button" className={navigationButtonClass(activeView, 'project-team')} onClick={() => setView('project-team')}>Project Team / Assignment</button>
          )}
          {canUseFinance && (
            <button type="button" className={navigationButtonClass(activeView, 'finance')} onClick={() => setView('finance')}>Finance Core</button>
          )}
          {canUseBudgets && (
            <button type="button" className={navigationButtonClass(activeView, 'budgets-job-cost')} onClick={() => setView('budgets-job-cost')}>Budget & Cost Tracking</button>
          )}
          {canUseProcurement && (
            <button type="button" className={navigationButtonClass(activeView, 'procurement')} onClick={() => setView('procurement')}>Procurement</button>
          )}
          {canUseInventory && (
            <button type="button" className={navigationButtonClass(activeView, 'inventory')} onClick={() => setView('inventory')}>Inventory & Materials</button>
          )}
          {canUseVendorsSubcontractors && (
            <button type="button" className={navigationButtonClass(activeView, 'vendors-subcontractors')} onClick={() => setView('vendors-subcontractors')}>Suppliers & Subcontractors</button>
          )}
          {canUseEquipment && (
            <button type="button" className={navigationButtonClass(activeView, 'equipment')} onClick={() => setView('equipment')}>Equipment Management</button>
          )}
          {canUseEmployees && (
            <button type="button" className={navigationButtonClass(activeView, 'employees')} onClick={() => setView('employees')}>Employees & Salaries</button>
          )}
          {canUseLabourPayroll && (
            <button type="button" className={navigationButtonClass(activeView, 'labour-payroll')} onClick={() => setView('labour-payroll')}>Attendance & Payroll</button>
          )}
          {canUseSiteExpenses && (
            <button type="button" className={navigationButtonClass(activeView, 'site-expenses')} onClick={() => setView('site-expenses')}>Site Expenses</button>
          )}
          {canUseSupplierPayables && (
            <button type="button" className={navigationButtonClass(activeView, 'supplier-payables')} onClick={() => setView('supplier-payables')}>Supplier Payables</button>
          )}
          {canUseClientBilling && (
            <button type="button" className={navigationButtonClass(activeView, 'client-billing')} onClick={() => setView('client-billing')}>Client Billing</button>
          )}
          {canUseClientReceipts && (
            <button type="button" className={navigationButtonClass(activeView, 'client-receipts')} onClick={() => setView('client-receipts')}>Client Receipts / Payments</button>
          )}
          {canUseProjectProfitability && (
            <button type="button" className={navigationButtonClass(activeView, 'project-profitability')} onClick={() => setView('project-profitability')}>Project Profitability</button>
          )}
          {canReadReports && (
            <button type="button" className={navigationButtonClass(activeView, 'reports')} onClick={() => setView('reports')}>Reports & Analytics</button>
          )}
          {canReadUsers && (
            <button type="button" className={navigationButtonClass(activeView, 'organization-profile')} onClick={() => setView('organization-profile')}>Organization profile</button>
          )}
          {canReadUsers && (
            <button type="button" className={navigationButtonClass(activeView, 'users')} onClick={() => setView('users')}>Users</button>
          )}
          {canReadRoles && (
            <button type="button" className={navigationButtonClass(activeView, 'roles')} onClick={() => setView('roles')}>Roles & permissions</button>
          )}
          {canManageDepartments && (
            <button type="button" className={navigationButtonClass(activeView, 'departments')} onClick={() => setView('departments')}>Departments</button>
          )}
          <p className="nav-note">Project scope: {auth.identity.projectScope.kind === 'all' ? 'all Projects' : `${auth.identity.projectScope.projectIds.length} assigned Project(s)`}.</p>
        </aside>

        <div className="admin-content">
          {activeView === 'dashboard' && <DashboardPage />}
          {activeView === 'documents' && <DocumentsPage />}
          {activeView === 'clients' && (
            <ClientsPage
              {...(canReadProjects ? { onOpenProjectsForClient: showClientProjects } : {})}
            />
          )}
          {activeView === 'projects' && <ProjectsPage key={`projects-${linkedClientId ?? 'all'}`} initialClientId={linkedClientId} />}
          {activeView === 'project-stages' && <ProjectStagesPage />}
          {activeView === 'project-team' && <ProjectTeamPage />}
          {activeView === 'finance' && <FinancePage />}
          {activeView === 'budgets-job-cost' && <BudgetsJobCostPage />}
          {activeView === 'procurement' && <ProcurementPage />}
          {activeView === 'inventory' && <InventoryPage />}
          {activeView === 'vendors-subcontractors' && <VendorsSubcontractorsPage />}
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
