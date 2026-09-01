import { authenticatedRequest } from '../../administration/api/auth-api.js';

export type EmployeeStatus = 'ACTIVE' | 'INACTIVE';
export type EmployeePayType = 'SALARY' | 'DAILY' | 'HOURLY';

export type Employee = Readonly<{
  id: string;
  employeeNo: string;
  userId: string | null;
  name: string;
  cnicOrId: string | null;
  phone: string | null;
  email: string | null;
  department: string;
  jobTitle: string;
  employeeType: string;
  joiningDate: string;
  status: EmployeeStatus;
}>;

export type EmployeeCompensation = Readonly<{
  id: string;
  employeeId: string;
  payType: EmployeePayType;
  baseSalaryOrWage: string | null;
  hourlyRate: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

export type EmployeeDetails = Readonly<{
  employee: Employee;
  compensationHistory: EmployeeCompensation[] | null;
}>;

export type EmployeePage = Readonly<{
  items: Employee[];
  total: number;
  page: number;
  pageSize: number;
}>;

export type ListEmployeesInput = Readonly<{
  search?: string;
  status?: EmployeeStatus;
  page?: number;
  pageSize?: number;
}>;

export type CreateEmployeeInput = Readonly<{
  employeeNo: string;
  userId?: string | null;
  name: string;
  cnicOrId?: string | null;
  phone?: string | null;
  email?: string | null;
  department: string;
  jobTitle: string;
  employeeType: string;
  joiningDate: string;
}>;

export type UpdateEmployeeInput = Readonly<{
  employeeNo?: string;
  userId?: string | null;
  name?: string;
  cnicOrId?: string | null;
  phone?: string | null;
  email?: string | null;
  department?: string;
  jobTitle?: string;
  employeeType?: string;
  joiningDate?: string;
}>;

export type CreateEmployeeCompensationInput =
  | Readonly<{ payType: 'SALARY' | 'DAILY'; baseSalaryOrWage: string; hourlyRate?: null; effectiveFrom: string }>
  | Readonly<{ payType: 'HOURLY'; baseSalaryOrWage?: null; hourlyRate: string; effectiveFrom: string }>;

export type UpdateEmployeeStatusInput = Readonly<{
  status: EmployeeStatus;
  reason?: string | null;
}>;

/** Create one retry key for a single Employee write attempt. */
function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

/** Build bounded Employee list filters without sending Company scope from the browser. */
function employeeQuery(input: ListEmployeesInput): string {
  const query = new URLSearchParams();
  if (input.search) query.set('search', input.search);
  if (input.status) query.set('status', input.status);
  if (input.page !== undefined) query.set('page', String(input.page));
  if (input.pageSize !== undefined) query.set('pageSize', String(input.pageSize));
  return query.size > 0 ? `?${query.toString()}` : '';
}

/** Add the Foundation idempotency header to one controlled Employee command. */
function commandHeaders(): HeadersInit {
  return { 'Idempotency-Key': newIdempotencyKey() };
}

/** Load one bounded Company Employee register page. */
export function listEmployees(input: ListEmployeesInput = {}): Promise<EmployeePage> {
  return authenticatedRequest<EmployeePage>(`employees${employeeQuery(input)}`);
}

/** Load one Employee and authorized compensation history. */
export function getEmployee(employeeId: string): Promise<EmployeeDetails> {
  return authenticatedRequest<EmployeeDetails>(`employees/${employeeId}`);
}

/** Create one Employee master record without browser-owned lifecycle fields. */
export function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  return authenticatedRequest<Employee>('employees', {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Update only editable Employee master fields. */
export function updateEmployee(employeeId: string, input: UpdateEmployeeInput): Promise<Employee> {
  return authenticatedRequest<Employee>(`employees/${employeeId}`, {
    method: 'PATCH',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Append one effective-dated Employee salary, wage or hourly rate. */
export function createEmployeeCompensation(
  employeeId: string,
  input: CreateEmployeeCompensationInput
): Promise<EmployeeCompensation> {
  return authenticatedRequest<EmployeeCompensation>(`employees/${employeeId}/compensation`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}

/** Activate or deactivate one Employee through the explicit status command. */
export function updateEmployeeStatus(employeeId: string, input: UpdateEmployeeStatusInput): Promise<Employee> {
  return authenticatedRequest<Employee>(`employees/${employeeId}/status`, {
    method: 'POST',
    headers: commandHeaders(),
    body: JSON.stringify(input)
  });
}
