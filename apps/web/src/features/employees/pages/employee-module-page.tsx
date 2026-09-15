export type EmployeeModuleDestination =
  | 'employees'
  | 'employee-add'
  | 'employee-attendance'
  | 'employee-daily-payroll'
  | 'employee-monthly-payroll'
  | 'employee-advances'
  | 'employee-payments'
  | 'employee-ledger';

type EmployeeModulePageProps = Readonly<{
  onNavigate: (destination: EmployeeModuleDestination) => void;
  canManageEmployees: boolean;
  canUseAttendance: boolean;
  canUsePayroll: boolean;
  canUseAdvances: boolean;
  canUsePayments: boolean;
}>;

const workflowSteps = [
  { number: '01', title: 'Employee records', description: 'Create Employee identity, Project ownership and daily or monthly salary basis.', destination: 'employees' as const, permission: 'employees' as const },
  { number: '02', title: 'Attendance', description: 'Record present or absent status, working hours and the correct Project or Stage.', destination: 'employee-attendance' as const, permission: 'attendance' as const },
  { number: '03', title: 'Salary advances', description: 'Pay urgent advances from Cash/Bank and recover them through Payroll.', destination: 'employee-advances' as const, permission: 'advances' as const },
  { number: '04', title: 'Daily settlements', description: 'Calculate and close wages for daily-paid workers at the end of each day.', destination: 'employee-daily-payroll' as const, permission: 'payroll' as const },
  { number: '05', title: 'Monthly payroll', description: 'Calculate monthly salary, absence deductions and advance recovery.', destination: 'employee-monthly-payroll' as const, permission: 'payroll' as const },
  { number: '06', title: 'Salary payments', description: 'Pay finalized salary liabilities from an authorized Cash or Bank account.', destination: 'employee-payments' as const, permission: 'payments' as const },
  { number: '07', title: 'Employee ledger', description: 'Review Project-wise salary earned, advances, payments, reversals and balances.', destination: 'employee-ledger' as const, permission: 'payroll' as const }
];

/** Render the Employee module landing page as a clear operational workflow. */
export function EmployeeModulePage(props: EmployeeModulePageProps) {
  const permissions = {
    employees: props.canManageEmployees,
    attendance: props.canUseAttendance,
    payroll: props.canUsePayroll,
    advances: props.canUseAdvances,
    payments: props.canUsePayments
  };

  return (
    <section className="admin-stack employee-module-home" aria-labelledby="employee-module-title">
      <div className="section-heading">
        <p className="eyebrow">People & payroll</p>
        <h1 id="employee-module-title">Employee Management</h1>
        <p className="muted">Employees & Salaries now follow a simple sequence. Open only the task you need; Employee setup, attendance, advances, payroll, payment and ledger history stay separate.</p>
      </div>

      <section className="admin-card employee-workflow-card">
        <div className="employee-workflow-heading">
          <div><p className="eyebrow">Recommended workflow</p><h2>From Employee setup to salary payment</h2></div>
          {props.canManageEmployees && <button type="button" onClick={() => props.onNavigate('employee-add')}>Add Employee</button>}
        </div>
        <div className="employee-workflow-grid">
          {workflowSteps.filter((step) => permissions[step.permission]).map((step) => (
            <button type="button" className="employee-workflow-step" key={step.destination} onClick={() => props.onNavigate(step.destination)}>
              <span>{step.number}</span>
              <strong>{step.title}</strong>
              <small>{step.description}</small>
              <i aria-hidden="true">Open →</i>
            </button>
          ))}
        </div>
      </section>

      <section className="admin-card employee-workflow-note">
        <strong>Accounting rule</strong>
        <p>Attendance drives earnings. Payroll finalization posts Employee Salary cost and Payroll Payable. Paying from an account settles the payable and reduces Cash/Bank without adding the Project cost twice.</p>
      </section>
    </section>
  );
}
