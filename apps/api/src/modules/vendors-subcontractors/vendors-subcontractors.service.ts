import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient } from '@construction-erp/database';
import { AuthorizationError } from '@construction-erp/errors';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission } from '@construction-erp/request-context';
import { SupplierPayablesService } from '../supplier-payables/supplier-payables.service.js';
import { VendorsSubcontractorsRepository } from './vendors-subcontractors.repository.js';
import {
  createVendorsSubcontractorsError,
  type CreateSubcontractorBody,
  type CreateVendorBody,
  type CreateVendorContactBody,
  type ListSubcontractorsQuery,
  type ListVendorsQuery,
  type UpdateSubcontractorBody,
  type UpdateVendorBody,
  type VendorsSubcontractorsPermissionCode
} from './vendors-subcontractors.schema.js';

const ACTIVE = 'ACTIVE';

/** Business rules for final Supplier & Subcontractor master data. */
export class VendorsSubcontractorsService {
  /** Bind Supplier & Subcontractor business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require one final master-data permission from trusted request context. */
  private requirePermission(permission: VendorsSubcontractorsPermissionCode): void {
    if (!hasPermission(permission)) throw new AuthorizationError();
  }

  /** List supplier/vendor masters with bounded company-scoped filters. */
  async listVendors(input: ListVendorsQuery) {
    this.requirePermission('vendors.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new VendorsSubcontractorsRepository(this.db).listVendors({
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.qualificationStatus === undefined ? {} : { qualificationStatus: input.qualificationStatus }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: result.items, total: result.total, page, pageSize };
  }

  /** Read Supplier Payables summary when the actor has matching source-module access. */
  private async readVendorPayableSummary(vendorId: string) {
    try {
      return await new SupplierPayablesService(this.db).getVendorPayableSummary(vendorId);
    } catch (error) {
      if (error instanceof AuthorizationError) return null;
      throw error;
    }
  }

  /** Get one supplier/vendor with contacts plus permission-safe purchase and payable summaries. */
  async getVendor(vendorId: string) {
    this.requirePermission('vendors.read');
    const repository = new VendorsSubcontractorsRepository(this.db);
    const vendor = await repository.findVendorById(vendorId);
    if (!vendor) throw createVendorsSubcontractorsError('VENDOR_NOT_FOUND');
    const [purchaseSummary, payableSummary] = await Promise.all([
      repository.getVendorPurchaseSummary(vendorId),
      this.readVendorPayableSummary(vendorId)
    ]);
    return {
      vendor,
      purchaseSummary: {
        purchaseOrderCount: purchaseSummary.purchaseOrderCount,
        purchaseOrderTotal: purchaseSummary.purchaseOrderTotal?.toString() ?? '0'
      },
      payableSummary
    };
  }

  /** Create one active supplier/vendor with audit and outbox evidence. */
  async createVendor(input: CreateVendorBody) {
    this.requirePermission('vendors.create');
    try {
      return await withTransaction(this.db, async (tx) => {
        const repository = new VendorsSubcontractorsRepository(tx);
        if (await repository.findVendorByCode(input.code)) throw createVendorsSubcontractorsError('DUPLICATE_VENDOR_CODE');
        const vendor = await repository.createVendor({
          code: input.code,
          legalName: input.legalName,
          displayName: input.displayName,
          ...(input.taxNo === undefined ? {} : { taxNo: input.taxNo }),
          ...(input.paymentTermsDays === undefined ? {} : { paymentTermsDays: input.paymentTermsDays }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.qualificationStatus === undefined ? {} : { qualificationStatus: input.qualificationStatus }),
          status: ACTIVE
        });
        await recordAudit(tx, {
          action: 'vendor.created', entityType: 'vendor', entityId: vendor.id,
          after: { code: vendor.code, displayName: vendor.displayName, status: vendor.status, qualificationStatus: vendor.qualificationStatus }
        });
        await recordOutboxEvent(tx, {
          eventType: 'vendor.created', resourceType: 'vendor', resourceId: vendor.id,
          payload: { code: vendor.code, status: vendor.status }
        });
        return vendor;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw createVendorsSubcontractorsError('DUPLICATE_VENDOR_CODE');
      }
      throw error;
    }
  }

  /** Update supplier/vendor master fields without deleting purchasing history. */
  async updateVendor(vendorId: string, input: UpdateVendorBody) {
    this.requirePermission('vendors.update');
    try {
      return await withTransaction(this.db, async (tx) => {
        const repository = new VendorsSubcontractorsRepository(tx);
        const before = await repository.findVendorById(vendorId);
        if (!before) throw createVendorsSubcontractorsError('VENDOR_NOT_FOUND');
        if (input.code) {
          const sameCode = await repository.findVendorByCode(input.code);
          if (sameCode && sameCode.id !== vendorId) throw createVendorsSubcontractorsError('DUPLICATE_VENDOR_CODE');
        }
        const updated = await repository.updateVendor(vendorId, {
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.taxNo === undefined ? {} : { taxNo: input.taxNo }),
          ...(input.paymentTermsDays === undefined ? {} : { paymentTermsDays: input.paymentTermsDays }),
          ...(input.currency === undefined ? {} : { currency: input.currency }),
          ...(input.qualificationStatus === undefined ? {} : { qualificationStatus: input.qualificationStatus }),
          ...(input.status === undefined ? {} : { status: input.status })
        });
        if (!updated) throw createVendorsSubcontractorsError('VENDOR_NOT_FOUND');
        await recordAudit(tx, {
          action: 'vendor.updated', entityType: 'vendor', entityId: updated.id,
          before: { code: before.code, displayName: before.displayName, status: before.status, qualificationStatus: before.qualificationStatus },
          after: { code: updated.code, displayName: updated.displayName, status: updated.status, qualificationStatus: updated.qualificationStatus }
        });
        await recordOutboxEvent(tx, {
          eventType: 'vendor.updated', resourceType: 'vendor', resourceId: updated.id,
          payload: { code: updated.code, status: updated.status }
        });
        return updated;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw createVendorsSubcontractorsError('DUPLICATE_VENDOR_CODE');
      }
      throw error;
    }
  }

  /** Add one contact to an existing supplier/vendor and audit the master-data change. */
  async createVendorContact(vendorId: string, input: CreateVendorContactBody) {
    this.requirePermission('vendors.update');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      const vendor = await repository.findVendorById(vendorId);
      if (!vendor) throw createVendorsSubcontractorsError('VENDOR_NOT_FOUND');
      const contact = await repository.createVendorContact(vendorId, {
        name: input.name,
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.role === undefined ? {} : { role: input.role })
      });
      if (!contact) throw createVendorsSubcontractorsError('VENDOR_NOT_FOUND');
      await recordAudit(tx, {
        action: 'vendor.contact_created', entityType: 'vendor_contact', entityId: contact.id,
        after: { vendorId: contact.vendorId, name: contact.name, email: contact.email, phone: contact.phone, role: contact.role, status: contact.status }
      });
      await recordOutboxEvent(tx, {
        eventType: 'vendor.updated', resourceType: 'vendor', resourceId: vendorId,
        payload: { reason: 'contact_created', contactId: contact.id }
      });
      return contact;
    });
  }

  /** List final subcontractor profiles without old subcontract contract/payment workflow ownership. */
  async listSubcontractors(input: ListSubcontractorsQuery) {
    this.requirePermission('subcontractors.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new VendorsSubcontractorsRepository(this.db).listSubcontractors({
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: result.items, total: result.total, page, pageSize };
  }

  /** Create one subcontractor profile after validating its optional same-company vendor link. */
  async createSubcontractor(input: CreateSubcontractorBody) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      if (input.vendorId) {
        const vendor = await repository.findVendorById(input.vendorId);
        if (!vendor || vendor.status !== ACTIVE) throw createVendorsSubcontractorsError('VENDOR_LINK_INVALID');
      }
      const subcontractor = await repository.createSubcontractor({
        ...(input.vendorId === undefined ? {} : { vendorId: input.vendorId }),
        code: input.code,
        specialty: input.specialty,
        ...(input.defaultTerms === undefined ? {} : { defaultTerms: input.defaultTerms }),
        status: ACTIVE
      });
      await recordAudit(tx, {
        action: 'subcontractor.created', entityType: 'subcontractor', entityId: subcontractor.id,
        after: { vendorId: subcontractor.vendorId, code: subcontractor.code, specialty: subcontractor.specialty, status: subcontractor.status }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontractor.created', resourceType: 'subcontractor', resourceId: subcontractor.id,
        payload: { code: subcontractor.code, status: subcontractor.status }
      });
      return subcontractor;
    });
  }

  /** Update one subcontractor profile and keep operational subcontract history outside this master module. */
  async updateSubcontractor(subcontractorId: string, input: UpdateSubcontractorBody) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      const before = await repository.findSubcontractorById(subcontractorId);
      if (!before) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_FOUND');
      if (input.vendorId) {
        const vendor = await repository.findVendorById(input.vendorId);
        if (!vendor || vendor.status !== ACTIVE) throw createVendorsSubcontractorsError('VENDOR_LINK_INVALID');
      }
      const updated = await repository.updateSubcontractor(subcontractorId, {
        ...(input.vendorId === undefined ? {} : { vendorId: input.vendorId }),
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.specialty === undefined ? {} : { specialty: input.specialty }),
        ...(input.defaultTerms === undefined ? {} : { defaultTerms: input.defaultTerms }),
        ...(input.status === undefined ? {} : { status: input.status })
      });
      if (!updated) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_FOUND');
      await recordAudit(tx, {
        action: 'subcontractor.updated', entityType: 'subcontractor', entityId: updated.id,
        before: { vendorId: before.vendorId, code: before.code, specialty: before.specialty, status: before.status },
        after: { vendorId: updated.vendorId, code: updated.code, specialty: updated.specialty, status: updated.status }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontractor.updated', resourceType: 'subcontractor', resourceId: updated.id,
        payload: { code: updated.code, status: updated.status }
      });
      return updated;
    });
  }
}
