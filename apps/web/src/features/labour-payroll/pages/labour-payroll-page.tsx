import { usePermission } from '../../administration/hooks/auth.js';
import { LabourPayrollWorkspace } from '../components/labour-payroll-workspace.js';

/** Bind Final-21 Labour/Payroll permissions to the workspace UI. */
export function LabourPayrollPage() {
  return (
    <LabourPayrollWorkspace
      canReadAttendance={usePermission('attendance.read')}
      canCreateAttendance={usePermission('attendance.create')}
      canCorrectAttendance={usePermission('attendance.correct')}
      canReadPayroll={usePermission('payroll.read')}
      canCreatePayroll={usePermission('payroll.create')}
      canCalculatePayroll={usePermission('payroll.calculate')}
      canFinalizePayroll={usePermission('payroll.finalize')}
    />
  );
}
