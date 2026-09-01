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
          { code: { contains: search, mode: 'insensitive' as const } },
          { specialty: { contains: search, mode: 'insensitive' as const } }
        ]
      } : {})
    });

    const [items, total] = await Promise.all([
      this.db.subcontractor.findMany({
        where,
        include: { vendor: { select: { id: true, code: true, displayName: true, status: true } } },
        orderBy: [{ code: 'asc' }, { id: 'asc' }],
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
      include: { vendor: { select: { id: true, code: true, displayName: true, status: true } } }
    });
  }

  /** Create one active company subcontractor profile. */
  async createSubcontractor(input: Readonly<{
    vendorId?: string | null;
    code: string;
    specialty: string;
    defaultTerms?: string | null;
    status: string;
  }>) {
    const scope = requireCompanyRepositoryScope();
    return this.db.subcontractor.create({
      data: scope.createData(input),
      include: { vendor: { select: { id: true, code: true, displayName: true, status: true } } }
    });
  }

  /** Update one subcontractor profile without changing company ownership. */
  async updateSubcontractor(subcontractorId: string, input: Readonly<Record<string, unknown>>) {
    const scope = requireCompanyRepositoryScope();
    const result = await this.db.subcontractor.updateMany({ where: scope.where({ id: subcontractorId }), data: input });
    if (result.count === 0) return null;
    return this.findSubcontractorById(subcontractorId);
  }
}
