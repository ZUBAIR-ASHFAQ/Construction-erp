import { usePermission } from '../../administration/hooks/auth.js';
import { LabourPayrollWorkspace, type LabourPayrollWorkspaceView } from '../components/labour-payroll-workspace.js';

/** Bind Labour/Payroll permissions to one focused Employee workflow page. */
export function LabourPayrollPage({ view }: Readonly<{ view: LabourPayrollWorkspaceView }>) {
  return (
    <LabourPayrollWorkspace
      view={view}
      canReadAttendance={usePermission('attendance.read')}
      canCreateAttendance={usePermission('attendance.create')}
      canCorrectAttendance={usePermission('attendance.correct')}
      canReadPayroll={usePermission('payroll.read')}
      canCreatePayroll={usePermission('payroll.create')}
      canCalculatePayroll={usePermission('payroll.calculate')}
      canFinalizePayroll={usePermission('payroll.finalize')}
      canCreatePayrollPayment={usePermission('payroll.payments.create')}
      canReversePayrollPayment={usePermission('payroll.payments.reverse')}
      canCreateEmployeeAdvance={usePermission('payroll.advances.create')}
      canReverseEmployeeAdvance={usePermission('payroll.advances.reverse')}
      canManageAccounts={usePermission('finance.accounts.manage')}
    />
  );
}
