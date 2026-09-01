import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { EMPLOYEES_MAX_PAGE_SIZE } from './employees.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type EmployeeRepositoryPageWindow = Readonly<{ skip: number; take: number }>;

export type ListEmployeesRepositoryInput = EmployeeRepositoryPageWindow & Readonly<{
  search?: string;
  status?: string;
}>;

export type CreateEmployeeRepositoryInput = Readonly<{
  employeeNo: string;
  userId?: string | null;
  name: string;
  cnicOrId?: string | null;
  phone?: string | null;
  email?: string | null;
  department: string;
  jobTitle: string;
  employeeType: string;
  joiningDate: Date;
  status: string;
}>;

export type UpdateEmployeeRepositoryInput = Readonly<{
  employeeNo?: string;
  userId?: string | null;
  name?: string;
  cnicOrId?: string | null;
  phone?: string | null;
  email?: string | null;
  department?: string;
  jobTitle?: string;
  employeeType?: string;
  joiningDate?: Date;
}>;

export type CreateEmployeeCompensationRepositoryInput = Readonly<{
  employeeId: string;
  payType: 'SALARY' | 'DAILY' | 'HOURLY';
  baseSalaryOrWage?: string | null;
  hourlyRate?: string | null;
  effectiveFrom: Date;
}>;

/** Reject invalid pagination before it reaches Prisma. */
function assertPageWindow(input: EmployeeRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > EMPLOYEES_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${EMPLOYEES_MAX_PAGE_SIZE}.`);
  }
}

/** Final Employee & Labour master persistence with mandatory Company scoping. */
export class EmployeesRepository {
  /** Bind Employee persistence to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List Company Employees with bounded search and lifecycle filtering. */
  async listEmployees(input: ListEmployeesRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...(input.status ? { status: input.status } : {}),
      ...(search ? {
        OR: [
          { employeeNo: { contains: search, mode: 'insensitive' as const } },
          { name: { contains: search, mode: 'insensitive' as const } },
          { cnicOrId: { contains: search, mode: 'insensitive' as const } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } }
        ]
      } : {})
    });

    const [items, total] = await Promise.all([
      this.db.employee.findMany({
        where,
        orderBy: [{ employeeNo: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.employee.count({ where })
    ]);
    return { items, total };
  }

  /** Find one Employee only inside the authenticated Company. */
  async findEmployeeById(employeeId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employee.findFirst({ where: scope.where({ id: employeeId }) });
  }

  /** Find one Employee number only inside the authenticated Company. */
  async findEmployeeByNumber(employeeNo: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employee.findFirst({ where: scope.where({ employeeNo }) });
  }

  /** Find one CNIC/identity value only inside the authenticated Company. */
  async findEmployeeByIdentity(cnicOrId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employee.findFirst({ where: scope.where({ cnicOrId }) });
  }

  /** Resolve an optional login User only inside the authenticated Company. */
  async findCompanyUserById(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.user.findFirst({ where: scope.where({ id: userId }) });
  }

  /** Create one Company-owned Employee after service validation. */
  async createEmployee(input: CreateEmployeeRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employee.create({
      data: scope.createData({
        employeeNo: input.employeeNo,
        userId: input.userId ?? null,
        name: input.name,
        cnicOrId: input.cnicOrId ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        department: input.department,
        jobTitle: input.jobTitle,
        employmentType: input.employeeType,
        joinDate: input.joiningDate,
        status: input.status
      })
    });
  }

  /** Update Employee master fields without changing Company or lifecycle ownership. */
  async updateEmployee(employeeId: string, input: UpdateEmployeeRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.employee.updateMany({
      where: scope.where({ id: employeeId }),
      data: {
        ...(input.employeeNo === undefined ? {} : { employeeNo: input.employeeNo }),
        ...(input.userId === undefined ? {} : { userId: input.userId }),
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.cnicOrId === undefined ? {} : { cnicOrId: input.cnicOrId }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.department === undefined ? {} : { department: input.department }),
        ...(input.jobTitle === undefined ? {} : { jobTitle: input.jobTitle }),
        ...(input.employeeType === undefined ? {} : { employmentType: input.employeeType }),
        ...(input.joiningDate === undefined ? {} : { joinDate: input.joiningDate })
      }
    });
    if (updated.count !== 1) return null;
    return this.findEmployeeById(employeeId);
  }

  /** Change one Employee status only from the expected lifecycle state. */
  async updateEmployeeStatus(employeeId: string, expectedStatus: string, status: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.employee.updateMany({
      where: scope.where({ id: employeeId, status: expectedStatus }),
      data: { status }
    });
    if (updated.count !== 1) return null;
    return this.findEmployeeById(employeeId);
  }

  /** List effective-dated compensation history for one Company Employee. */
  async listEmployeeCompensation(employeeId: string) {
    if (!(await this.findEmployeeById(employeeId))) return null;
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeCompensation.findMany({
      where: scope.where({ employeeId }),
      orderBy: [{ effectiveFrom: 'asc' }, { id: 'asc' }]
    });
  }


  /** Lock one Employee before changing its effective-dated compensation history. */
  async lockEmployeeForCompensationWrite(employeeId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM employees
      WHERE id = ${employeeId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Find the latest compensation record for one Company Employee. */
  async findLatestEmployeeCompensation(employeeId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeCompensation.findFirst({
      where: scope.where({ employeeId }),
      orderBy: [{ effectiveFrom: 'desc' }, { id: 'desc' }]
    });
  }

  /** Close only the current open compensation record. */
  async closeEmployeeCompensation(employeeId: string, compensationId: string, effectiveTo: Date) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.employeeCompensation.updateMany({
      where: scope.where({ id: compensationId, employeeId, effectiveTo: null }),
      data: { effectiveTo }
    });
    return updated.count === 1;
  }

  /** Append one new effective-dated compensation record. */
  async createEmployeeCompensation(input: CreateEmployeeCompensationRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.employeeCompensation.create({
      data: scope.createData({
        employeeId: input.employeeId,
        payType: input.payType,
        baseSalary: input.baseSalaryOrWage ?? null,
        hourlyRate: input.hourlyRate ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: null
      })
    });
  }

  /** Append one employment-history event without editing prior history. */
  async createEmploymentHistory(employeeId: string, eventType: string, effectiveDate: Date, notes?: string | null) {
    if (!(await this.findEmployeeById(employeeId))) return null;
    return this.db.employeeEmploymentHistory.create({
      data: { employeeId, eventType, effectiveDate, notes: notes ?? null }
    });
  }
}
