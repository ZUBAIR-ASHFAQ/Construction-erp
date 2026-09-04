import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { VENDORS_SUBCONTRACTORS_MAX_PAGE_SIZE } from './vendors-subcontractors.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

type PageWindow = Readonly<{ skip: number; take: number }>;

export type ListVendorsRepositoryInput = PageWindow & Readonly<{
  search?: string;
  status?: string;
  qualificationStatus?: string;
}>;

export type ListSubcontractorsRepositoryInput = PageWindow & Readonly<{
  search?: string;
  status?: string;
}>;

export type ListSubcontractContractsRepositoryInput = PageWindow & Readonly<{
  subcontractorId?: string;
  projectId?: string;
  status?: string;
}>;


export type ListSubcontractPaymentsRepositoryInput = PageWindow & Readonly<{
  subcontractorId?: string;
  projectId?: string;
  subcontractContractId?: string;
  status?: string;
}>;

export type ListSubcontractLedgerRepositoryInput = PageWindow & Readonly<{
  subcontractorId?: string;
  projectId?: string;
  status?: string;
}>;

/** Reject invalid list windows before they reach Prisma. */
function assertPageWindow(input: PageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) throw new RangeError('Repository skip must be a non-negative integer.');
  if (!Number.isInteger(input.take) || input.take < 1 || input.take > VENDORS_SUBCONTRACTORS_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${VENDORS_SUBCONTRACTORS_MAX_PAGE_SIZE}.`);
  }
}

/** Final Supplier & Subcontractor master persistence with mandatory company scope. */
export class VendorsSubcontractorsRepository {
  /** Bind master-data persistence to Prisma or an active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List company supplier/vendor masters with bounded filters. */
  async listVendors(input: ListVendorsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...(input.status ? { status: input.status } : {}),
      ...(input.qualificationStatus ? { qualificationStatus: input.qualificationStatus } : {}),
      ...(search ? {
        OR: [
          { code: { contains: search, mode: 'insensitive' as const } },
          { legalName: { contains: search, mode: 'insensitive' as const } },
          { displayName: { contains: search, mode: 'insensitive' as const } }
        ]
      } : {})
    });

    const [items, total] = await Promise.all([
      this.db.vendor.findMany({ where, orderBy: [{ displayName: 'asc' }, { id: 'asc' }], skip: input.skip, take: input.take }),
      this.db.vendor.count({ where })
    ]);
    return { items, total };
  }

  /** Find one company supplier/vendor by identifier. */
  async findVendorById(vendorId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.vendor.findFirst({
      where: scope.where({ id: vendorId }),
      include: { contacts: { orderBy: [{ name: 'asc' }, { id: 'asc' }] } }
    });
  }

  /** Find one company supplier/vendor by business code. */
  async findVendorByCode(code: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.vendor.findFirst({ where: scope.where({ code }) });
  }

  /** Create one active company supplier/vendor. */
  async createVendor(input: Readonly<{
    code: string;
    legalName: string;
    displayName: string;
    taxNo?: string | null;
    paymentTermsDays?: number | null;
    currency?: string | null;
    qualificationStatus?: string | null;
    status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.vendor.create({ data: scope.createData(input) });
  }

  /** Update one company supplier/vendor without changing ownership. */
  async updateVendor(vendorId: string, input: Readonly<Record<string, unknown>>) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.vendor.updateMany({ where: scope.where({ id: vendorId }), data: input });
    if (result.count === 0) return null;
    return this.findVendorById(vendorId);
  }

  /** Add one active contact under an existing company supplier/vendor. */
  async createVendorContact(vendorId: string, input: Readonly<{
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  }>) {
    const vendor = await this.findVendorById(vendorId);
    if (!vendor) return null;
    return this.db.vendorContact.create({ data: { vendorId, ...input, status: 'ACTIVE' } });
  }

  /** Return purchase totals derived from Procurement documents for one supplier/vendor. */
  async getVendorPurchaseSummary(vendorId: string) {
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({ vendorId });
    const [purchaseOrderCount, totals] = await Promise.all([
      this.db.purchaseOrder.count({ where }),
      this.db.purchaseOrder.aggregate({ where, _sum: { total: true } })
    ]);
    return { purchaseOrderCount, purchaseOrderTotal: totals._sum.total };
  }

  /** List company subcontractor profiles with their optional vendor display link. */
  async listSubcontractors(input: ListSubcontractorsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...(input.status ? { status: input.status } : {}),
      ...(search ? {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search, mode: 'insensitive' as const } },
          { specialty: { contains: search, mode: 'insensitive' as const } }
        ]
      } : {})
    });

    const [items, total] = await Promise.all([
      this.db.subcontractor.findMany({
        where,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.subcontractor.count({ where })
    ]);
    return { items, total };
  }

  /** Find one company subcontractor profile by identifier. */
  async findSubcontractorById(subcontractorId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractor.findFirst({
      where: scope.where({ id: subcontractorId }),
    });
  }

  /** Create one active company subcontractor profile. */
  async createSubcontractor(input: Readonly<{
    code: string;
    name: string;
    phone: string;
    specialty: string;
    address: string;
    status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractor.create({
      data: scope.createData(input),
    });
  }

  /** Ensure the server-owned subcontractor code sequence exists for this Company. */
  async ensureSubcontractorNumbering(): Promise<void> {
    const scope = requireCompanyRepositoryScope();
    await this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'subcontractor' } },
      create: { companyId: scope.companyId, sequenceKey: 'subcontractor', prefix: 'SUB-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
  }

  /** Update one subcontractor profile without changing company ownership. */
  async updateSubcontractor(subcontractorId: string, input: Readonly<Record<string, unknown>>) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.subcontractor.updateMany({ where: scope.where({ id: subcontractorId }), data: input });
    if (result.count === 0) return null;
    return this.findSubcontractorById(subcontractorId);
  }

  /** Find one company Project used by a subcontract assignment. */
  async findProjectById(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: { id: true, projectCode: true, name: true, currency: true, status: true }
    });
  }

  /** List company subcontract contracts with readable Project and subcontractor data. */
  async listSubcontractContracts(input: ListSubcontractContractsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...(input.subcontractorId ? { subcontractorId: input.subcontractorId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    const include = {
      project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
      subcontractor: {
        select: {
          id: true,
          name: true,
          specialty: true,
          status: true
        }
      }
    } as const;
    const [items, total] = await Promise.all([
      this.db.subcontractContract.findMany({
        where,
        include,
        orderBy: [{ contractDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.subcontractContract.count({ where })
    ]);
    return { items, total };
  }

  /** Find one company subcontract contract by identifier. */
  async findSubcontractContractById(contractId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractContract.findFirst({
      where: scope.where({ id: contractId }),
      include: {
        project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
        subcontractor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            status: true
          }
        }
      }
    });
  }

  /** Create one active subcontract contract inside the current company. */
  async createSubcontractContract(input: Readonly<{
    subcontractorId: string;
    projectId: string;
    contractAmount: string;
    contractDate: Date;
    status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractContract.create({
      data: scope.createData(input),
      include: {
        project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
        subcontractor: {
          select: {
            id: true,
            name: true,
            specialty: true,
            status: true
          }
        }
      }
    });
  }

  /** Ensure server-owned numbering and the direct subcontract expense account exist. */
  async ensureSubcontractPaymentSetup() {
    const scope = requireCompanyRepositoryScope();
    await this.db.numberSequence.upsert({
      where: { companyId_sequenceKey: { companyId: scope.companyId, sequenceKey: 'subcontract-payment' } },
      create: { companyId: scope.companyId, sequenceKey: 'subcontract-payment', prefix: 'SCP-', suffix: '', padWidth: 5, nextValue: 1n, incrementBy: 1n, status: 'ACTIVE' },
      update: {}
    });
    return this.db.glAccount.upsert({
      where: { companyId_accountCode: { companyId: scope.companyId, accountCode: 'SUBCONTRACT-EXPENSE' } },
      create: scope.createData({ accountCode: 'SUBCONTRACT-EXPENSE', name: 'Subcontract Expense', accountType: 'EXPENSE', parentId: null, status: 'ACTIVE' }),
      update: {}
    });
  }

  /** Find one same-company Cash/Bank account with its mapped General Ledger account. */
  async findCashBankAccountById(cashBankAccountId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.cashBankAccount.findFirst({
      where: scope.where({ id: cashBankAccountId }),
      include: { glAccount: true }
    });
  }

  /** Lock one subcontract contract before checking its remaining payable contract balance. */
  async lockSubcontractContractForPayment(contractId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{
      id: string;
      projectId: string;
      subcontractorId: string;
      contractAmount: { toString(): string };
      status: string;
    }>>`
      SELECT id,
             project_id AS "projectId",
             subcontractor_id AS "subcontractorId",
             contract_amount AS "contractAmount",
             status
      FROM subcontract_contracts
      WHERE id = ${contractId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  /** Sum already POSTED direct payments for one subcontract contract. */
  async sumPostedSubcontractPayments(contractId: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.subcontractPayment.aggregate({
      where: scope.where({ subcontractContractId: contractId, status: 'POSTED' }),
      _sum: { amount: true }
    });
    return result._sum.amount;
  }

  /** Create one server-numbered DRAFT subcontract payment after dependency validation. */
  async createSubcontractPayment(input: Readonly<{
    subcontractContractId: string;
    paymentNo: string;
    paymentDate: Date;
    amount: string;
    cashBankAccountId: string;
    reference?: string | null;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractPayment.create({
      data: scope.createData({ ...input, reference: input.reference ?? null, status: 'DRAFT' }),
      include: {
        subcontractContract: {
          include: {
            project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
            subcontractor: { select: { id: true, name: true, specialty: true, status: true } }
          }
        },
        cashBankAccount: { select: { id: true, code: true, name: true, accountType: true, status: true } }
      }
    });
  }

  /** Mark one DRAFT subcontract payment POSTED after its Finance and Cost Actual sources are written. */
  async markSubcontractPaymentPosted(paymentId: string) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.subcontractPayment.updateMany({
      where: scope.where({ id: paymentId, status: 'DRAFT' }),
      data: { status: 'POSTED' }
    });
    if (result.count !== 1) return null;
    return this.db.subcontractPayment.findFirst({
      where: scope.where({ id: paymentId }),
      include: {
        subcontractContract: {
          include: {
            project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
            subcontractor: { select: { id: true, name: true, specialty: true, status: true } }
          }
        },
        cashBankAccount: { select: { id: true, code: true, name: true, accountType: true, status: true } }
      }
    });
  }

  /** Upsert one source-derived subcontract actual-cost row for the posted payment. */
  async upsertSubcontractPaymentCostActual(input: Readonly<{
    projectId: string;
    paymentId: string;
    sourceKey: string;
    postingDate: Date;
    amount: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.costActual.upsert({
      where: { companyId_sourceKey: { companyId: scope.companyId, sourceKey: input.sourceKey } },
      update: {},
      create: scope.createData({
        projectId: input.projectId,
        stageId: null,
        category: 'subcontract',
        sourceType: 'subcontract_payment',
        sourceId: input.paymentId,
        sourceKey: input.sourceKey,
        postingDate: input.postingDate,
        amount: input.amount
      })
    });
  }

  /** List direct subcontract payments with readable subcontractor, Project and Cash/Bank labels. */
  async listSubcontractPayments(input: ListSubcontractPaymentsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...(input.subcontractContractId ? { subcontractContractId: input.subcontractContractId } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.subcontractorId || input.projectId ? {
        subcontractContract: {
          companyId: scope.companyId,
          ...(input.subcontractorId ? { subcontractorId: input.subcontractorId } : {}),
          ...(input.projectId ? { projectId: input.projectId } : {})
        }
      } : {})
    });
    const include = {
      subcontractContract: {
        include: {
          project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
          subcontractor: { select: { id: true, name: true, specialty: true, status: true } }
        }
      },
      cashBankAccount: { select: { id: true, code: true, name: true, accountType: true, status: true } }
    } as const;
    const [items, total] = await Promise.all([
      this.db.subcontractPayment.findMany({ where, include, orderBy: [{ paymentDate: 'desc' }, { paymentNo: 'desc' }, { id: 'desc' }], skip: input.skip, take: input.take }),
      this.db.subcontractPayment.count({ where })
    ]);
    return { items, total };
  }

  /** List subcontract contracts with POSTED payment amounts for the source-derived ledger. */
  async listSubcontractLedger(input: ListSubcontractLedgerRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const where = scope.where({
      ...(input.subcontractorId ? { subcontractorId: input.subcontractorId } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.status ? { status: input.status } : {})
    });
    const [items, total] = await Promise.all([
      this.db.subcontractContract.findMany({
        where,
        include: {
          project: { select: { id: true, projectCode: true, name: true, currency: true, status: true } },
          subcontractor: { select: { id: true, name: true, specialty: true, status: true } },
          payments: { where: { status: 'POSTED' }, select: { amount: true } }
        },
        orderBy: [{ contractDate: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.subcontractContract.count({ where })
    ]);
    return { items, total };
  }

  /** Mark one active subcontract contract as finished without changing its agreed amount. */
  async finishSubcontractContract(contractId: string, finishedAt: Date) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.subcontractContract.updateMany({
      where: scope.where({ id: contractId, status: 'ACTIVE' }),
      data: { status: 'FINISHED', finishedAt }
    });
    if (result.count === 0) return null;
    return this.findSubcontractContractById(contractId);
  }
}
