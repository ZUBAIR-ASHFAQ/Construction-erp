import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission } from '@construction-erp/request-context';
import { EmployeesRepository } from './employees.repository.js';
import {
  createEmployeeError,
  type CreateEmployeeBody,
  type CreateEmployeeCompensationBody,
  type EmployeePermissionCode,
  type ListEmployeesQuery,
  type UpdateEmployeeBody,
  type UpdateEmployeeStatusBody
} from './employees.schema.js';

const EMPLOYEE_ACTIVE = 'ACTIVE';
const EMPLOYEE_INACTIVE = 'INACTIVE';
const DEFAULT_PAGE_SIZE = 25;

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Parse one validated business date as UTC midnight for persistence. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Return the calendar day immediately before an effective date. */
function previousUtcDate(value: Date): Date {
  const result = new Date(value.getTime());
  result.setUTCDate(result.getUTCDate() - 1);
  return result;
}

/** Map a Prisma unique-constraint conflict to the matching public Employee duplicate code. */
function uniqueEmployeeErrorCode(error: unknown): 'DUPLICATE_EMPLOYEE_NUMBER' | 'DUPLICATE_EMPLOYEE_ID' | null {
  if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'P2002') return null;
  const meta = 'meta' in error && error.meta && typeof error.meta === 'object' ? error.meta : null;
  const target = meta && 'target' in meta ? meta.target : null;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
  return fields.some((field) => field.includes('cnicOrId') || field.includes('cnic_or_id'))
    ? 'DUPLICATE_EMPLOYEE_ID'
    : 'DUPLICATE_EMPLOYEE_NUMBER';
}

/** Return safe Employee master fields without salary values. */
function employeeResponse(employee: Readonly<{
  id: string;
  employeeNo: string;
  userId: string | null;
  name: string;
  cnicOrId: string | null;
  phone: string | null;
  email: string | null;
  department: string;
  jobTitle: string;
  employmentType: string;
  joinDate: Date;
  status: string;
}>) {
  return {
    id: employee.id,
    employeeNo: employee.employeeNo,
    userId: employee.userId,
    name: employee.name,
    cnicOrId: employee.cnicOrId,
    phone: employee.phone,
    email: employee.email,
    department: employee.department,
    jobTitle: employee.jobTitle,
    employeeType: employee.employmentType,
    joiningDate: dateOnly(employee.joinDate),
    status: employee.status
  };
}

/** Return one protected compensation row after compensation authorization succeeds. */
function compensationResponse(compensation: Readonly<{
  id: string;
  employeeId: string;
  payType: string;
  baseSalary: DecimalLike | null;
  hourlyRate: DecimalLike | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}>) {
  return {
    id: compensation.id,
    employeeId: compensation.employeeId,
    payType: compensation.payType,
    baseSalaryOrWage: compensation.baseSalary?.toString() ?? null,
    hourlyRate: compensation.hourlyRate?.toString() ?? null,
    effectiveFrom: dateOnly(compensation.effectiveFrom),
    effectiveTo: compensation.effectiveTo ? dateOnly(compensation.effectiveTo) : null
  };
}

/** Final Employee master business rules and effective-dated salary ownership. */
export class EmployeesService {
  /** Bind Employee business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require one Employee permission from trusted request context. */
  private requirePermission(permission: EmployeePermissionCode): void {
    if (!hasPermission(permission)) throw new AuthorizationError();
  }

  /** Validate an optional linked login User inside the same Company. */
  private async requireCompanyUser(repository: EmployeesRepository, userId?: string | null): Promise<void> {
    if (!userId) return;
    if (await repository.findCompanyUserById(userId)) return;
    throw new ValidationError({ fieldErrors: [{ field: 'userId', message: 'Employee login User must belong to the authenticated Company.' }] });
  }

  /** Validate Employee number and optional CNIC/identity uniqueness. */
  private async requireUniqueIdentity(repository: EmployeesRepository, input: Readonly<{ employeeNo?: string | undefined; cnicOrId?: string | null | undefined }>, excludeId?: string): Promise<void> {
    if (input.employeeNo) {
      const duplicate = await repository.findEmployeeByNumber(input.employeeNo);
      if (duplicate && duplicate.id !== excludeId) throw createEmployeeError('DUPLICATE_EMPLOYEE_NUMBER');
    }
    if (input.cnicOrId) {
      const duplicate = await repository.findEmployeeByIdentity(input.cnicOrId);
      if (duplicate && duplicate.id !== excludeId) throw createEmployeeError('DUPLICATE_EMPLOYEE_ID');
    }
  }

  /** List/search Company Employees with bounded pagination. */
  async listEmployees(input: ListEmployeesQuery) {
    this.requirePermission('employees.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? DEFAULT_PAGE_SIZE;
    const result = await new EmployeesRepository(this.db).listEmployees({
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: result.items.map(employeeResponse), total: result.total, page, pageSize };
  }

  /** Get one Employee detail and include salary history only for authorized HR compensation users. */
  async getEmployee(employeeId: string) {
    this.requirePermission('employees.read');
    const repository = new EmployeesRepository(this.db);
    const employee = await repository.findEmployeeById(employeeId);
    if (!employee) throw createEmployeeError('EMPLOYEE_NOT_FOUND');

    const compensation = hasPermission('employees.compensation.manage')
      ? await repository.listEmployeeCompensation(employeeId)
      : null;

    return {
      employee: employeeResponse(employee),
      compensationHistory: compensation?.map(compensationResponse) ?? null
    };
  }

  /** Create one Employee exactly once with active status and employment history. */
  async createEmployee(input: CreateEmployeeBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'employees.create', idempotencyKey, fingerprintInput: input },
        async (tx) => this.createEmployeeOnce(tx, input)
      );
      return result.response.body;
    } catch (error) {
      const duplicateCode = uniqueEmployeeErrorCode(error);
      if (duplicateCode) throw createEmployeeError(duplicateCode);
      throw error;
    }
  }

  /** Persist one new Employee with audit, history and outbox evidence. */
  private async createEmployeeOnce(tx: TransactionClient, input: CreateEmployeeBody) {
    this.requirePermission('employees.create');
    const repository = new EmployeesRepository(tx);
    await this.requireUniqueIdentity(repository, input);
    await this.requireCompanyUser(repository, input.userId);

    const employee = await repository.createEmployee({
      employeeNo: input.employeeNo,
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      name: input.name,
      ...(input.cnicOrId === undefined ? {} : { cnicOrId: input.cnicOrId }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.email === undefined ? {} : { email: input.email }),
      department: input.department,
      jobTitle: input.jobTitle,
      employeeType: input.employeeType,
      joiningDate: inputDate(input.joiningDate),
      status: EMPLOYEE_ACTIVE
    });
    await repository.createEmploymentHistory(employee.id, 'CREATED', inputDate(input.joiningDate), 'Employee record created.');

    const response = employeeResponse(employee);
    await recordAudit(tx, { action: 'employee.created', entityType: 'employee', entityId: employee.id, after: response });
    await recordOutboxEvent(tx, { eventType: 'employee.created', resourceType: 'employee', resourceId: employee.id, payload: { employeeNo: employee.employeeNo, status: employee.status } });
    return { statusCode: 201, body: response };
  }

  /** Update one Employee master record exactly once without changing salary or status. */
  async updateEmployee(employeeId: string, input: UpdateEmployeeBody, idempotencyKey: string) {
    try {
      const result = await executeIdempotentCommand(
        this.db,
        { operation: 'employees.update', idempotencyKey, fingerprintInput: { employeeId, input } },
        async (tx) => this.updateEmployeeOnce(tx, employeeId, input)
      );
      return result.response.body;
    } catch (error) {
      const duplicateCode = uniqueEmployeeErrorCode(error);
      if (duplicateCode) throw createEmployeeError(duplicateCode);
      throw error;
    }
  }

  /** Persist one Employee master update with duplicate and same-Company checks. */
  private async updateEmployeeOnce(tx: TransactionClient, employeeId: string, input: UpdateEmployeeBody) {
    this.requirePermission('employees.update');
    const repository = new EmployeesRepository(tx);
    const before = await repository.findEmployeeById(employeeId);
    if (!before) throw createEmployeeError('EMPLOYEE_NOT_FOUND');

    await this.requireUniqueIdentity(repository, input, employeeId);
    await this.requireCompanyUser(repository, input.userId);
    const updated = await repository.updateEmployee(employeeId, {
      ...(input.employeeNo === undefined ? {} : { employeeNo: input.employeeNo }),
      ...(input.userId === undefined ? {} : { userId: input.userId }),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.cnicOrId === undefined ? {} : { cnicOrId: input.cnicOrId }),
      ...(input.phone === undefined ? {} : { phone: input.phone }),
      ...(input.email === undefined ? {} : { email: input.email }),
      ...(input.department === undefined ? {} : { department: input.department }),
      ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
      ...(input.employeeType === undefined ? {} : { employeeType: input.employeeType }),
      ...(input.joiningDate === undefined ? {} : { joiningDate: inputDate(input.joiningDate) })
    });
    if (!updated) throw createEmployeeError('EMPLOYEE_NOT_FOUND');

    const response = employeeResponse(updated);
    await recordAudit(tx, { action: 'employee.updated', entityType: 'employee', entityId: employeeId, before: employeeResponse(before), after: response });
    await recordOutboxEvent(tx, { eventType: 'employee.updated', resourceType: 'employee', resourceId: employeeId, payload: { employeeNo: updated.employeeNo } });
    return { statusCode: 200, body: response };
  }

  /** Append one effective-dated Employee salary/wage/rate exactly once. */
  async createCompensation(employeeId: string, input: CreateEmployeeCompensationBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'employees.compensation.create', idempotencyKey, fingerprintInput: { employeeId, input } },
      async (tx) => this.createCompensationOnce(tx, employeeId, input)
    );
    return result.response.body;
  }

  /** Close the current compensation range and append a new immutable salary authority. */
  private async createCompensationOnce(tx: TransactionClient, employeeId: string, input: CreateEmployeeCompensationBody) {
    this.requirePermission('employees.compensation.manage');
    const repository = new EmployeesRepository(tx);
    const locked = await repository.lockEmployeeForCompensationWrite(employeeId);
    if (!locked) throw createEmployeeError('EMPLOYEE_NOT_FOUND');

    const employee = await repository.findEmployeeById(employeeId);
    if (!employee) throw createEmployeeError('EMPLOYEE_NOT_FOUND');
    if (employee.status !== EMPLOYEE_ACTIVE) throw createEmployeeError('EMPLOYEE_INACTIVE');

    const effectiveFrom = inputDate(input.effectiveFrom);
    const latest = await repository.findLatestEmployeeCompensation(employeeId);
    if (latest && (effectiveFrom <= latest.effectiveFrom || (latest.effectiveTo && effectiveFrom <= latest.effectiveTo))) {
      throw createEmployeeError('COMPENSATION_DATE_OVERLAP');
    }

    if (latest && latest.effectiveTo === null) {
      const closed = await repository.closeEmployeeCompensation(employeeId, latest.id, previousUtcDate(effectiveFrom));
      if (!closed) throw createEmployeeError('COMPENSATION_DATE_OVERLAP');
    }

    const created = await repository.createEmployeeCompensation({
      employeeId,
      payType: input.payType,
      ...(input.payType === 'HOURLY'
        ? { baseSalaryOrWage: null, hourlyRate: input.hourlyRate }
        : { baseSalaryOrWage: input.baseSalaryOrWage, hourlyRate: null }),
      effectiveFrom
    });
    const response = compensationResponse(created);

    await recordAudit(tx, {
      action: 'employee.compensation_changed',
      entityType: 'employee_compensation',
      entityId: created.id,
      after: { employeeId, payType: created.payType, effectiveFrom: dateOnly(created.effectiveFrom), sensitiveValueChanged: true }
    });
    await recordOutboxEvent(tx, { eventType: 'employee.compensation_changed', resourceType: 'employee', resourceId: employeeId, payload: { employeeId, payType: created.payType, effectiveFrom: dateOnly(created.effectiveFrom) } });
    return { statusCode: 201, body: response };
  }

  /** Activate or deactivate one Employee through an explicit audited status command. */
  async updateStatus(employeeId: string, input: UpdateEmployeeStatusBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(
      this.db,
      { operation: 'employees.status.update', idempotencyKey, fingerprintInput: { employeeId, input } },
      async (tx) => this.updateStatusOnce(tx, employeeId, input)
    );
    return result.response.body;
  }

  /** Apply one valid status transition and preserve employment history. */
  private async updateStatusOnce(tx: TransactionClient, employeeId: string, input: UpdateEmployeeStatusBody) {
    this.requirePermission('employees.update');
    const repository = new EmployeesRepository(tx);
    const before = await repository.findEmployeeById(employeeId);
    if (!before) throw createEmployeeError('EMPLOYEE_NOT_FOUND');
    if (before.status === input.status) return { statusCode: 200, body: employeeResponse(before) };

    const expectedStatus = input.status === EMPLOYEE_ACTIVE ? EMPLOYEE_INACTIVE : EMPLOYEE_ACTIVE;
    if (before.status !== expectedStatus) {
      throw new ValidationError({ message: `Employee cannot transition from ${before.status} to ${input.status}.` });
    }

    const updated = await repository.updateEmployeeStatus(employeeId, expectedStatus, input.status);
    if (!updated) throw createEmployeeError('EMPLOYEE_NOT_FOUND');
    await repository.createEmploymentHistory(
      employeeId,
      input.status === EMPLOYEE_ACTIVE ? 'ACTIVATED' : 'DEACTIVATED',
      new Date(),
      input.reason ?? null
    );

    const response = employeeResponse(updated);
    await recordAudit(tx, { action: 'employee.status_changed', entityType: 'employee', entityId: employeeId, before: employeeResponse(before), after: response });
    await recordOutboxEvent(tx, { eventType: 'employee.status_changed', resourceType: 'employee', resourceId: employeeId, payload: { employeeId, fromStatus: before.status, toStatus: updated.status } });
    return { statusCode: 200, body: response };
  }
}
