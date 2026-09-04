import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient, type TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission } from '@construction-erp/request-context';
import { FinanceService } from '../finance/finance.service.js';
import { SupplierPayablesService } from '../supplier-payables/supplier-payables.service.js';
import { VendorsSubcontractorsRepository } from './vendors-subcontractors.repository.js';
import {
  createVendorsSubcontractorsError,
  type CreateSubcontractContractBody,
  type CreateSubcontractPaymentBody,
  type CreateSubcontractorBody,
  type CreateVendorBody,
  type CreateVendorContactBody,
  type ListSubcontractContractsQuery,
  type ListSubcontractLedgerQuery,
  type ListSubcontractPaymentsQuery,
  type ListSubcontractorsQuery,
  type ListVendorsQuery,
  type UpdateSubcontractorBody,
  type UpdateVendorBody,
  type VendorsSubcontractorsPermissionCode
} from './vendors-subcontractors.schema.js';

const ACTIVE = 'ACTIVE';
const SUBCONTRACTOR_SEQUENCE_KEY = 'subcontractor';
const SUBCONTRACT_PAYMENT_SEQUENCE_KEY = 'subcontract-payment';
const SUBCONTRACT_PAYMENT_SOURCE_TYPE = 'subcontract_payment';
const SUBCONTRACT_EXPENSE_ACCOUNT_CODE = 'SUBCONTRACT-EXPENSE';
const ZERO_MONEY = '0.00';

/** Convert a validated decimal money value into exact minor units. */
function moneyToMinorUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
}

/** Convert exact minor units into the stable two-decimal API form. */
function minorUnitsToMoney(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, '0')}`;
}

/** Normalize one Prisma decimal-like money value to the stable API form. */
function moneyString(value: { toString(): string } | string | null | undefined): string {
  return minorUnitsToMoney(moneyToMinorUnits(typeof value === 'string' ? value : value?.toString() ?? '0'));
}

/** Serialize one database date as an API date-only value. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Business rules for Supplier/Subcontractor master data and simple Project contracts. */
export class VendorsSubcontractorsService {
  /** Bind Supplier, Subcontractor and subcontract-contract logic to the database. */
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

  /** List company subcontractor profiles with bounded filters. */
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

  /** Create one subcontractor with a server-generated code and four user-maintained fields. */
  async createSubcontractor(input: CreateSubcontractorBody) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      await repository.ensureSubcontractorNumbering();
      const number = await allocateCompanyNumber(tx, { sequenceKey: SUBCONTRACTOR_SEQUENCE_KEY });
      const subcontractor = await repository.createSubcontractor({
        code: number.formatted,
        name: input.name,
        phone: input.phone,
        specialty: input.specialty,
        address: input.address,
        status: ACTIVE
      });
      await recordAudit(tx, {
        action: 'subcontractor.created', entityType: 'subcontractor', entityId: subcontractor.id,
        after: { code: subcontractor.code, name: subcontractor.name, specialty: subcontractor.specialty, status: subcontractor.status }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontractor.created', resourceType: 'subcontractor', resourceId: subcontractor.id,
        payload: { code: subcontractor.code, status: subcontractor.status }
      });
      return subcontractor;
    });
  }

  /** Update subcontractor contact data or status without changing its server-owned code. */
  async updateSubcontractor(subcontractorId: string, input: UpdateSubcontractorBody) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      const before = await repository.findSubcontractorById(subcontractorId);
      if (!before) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_FOUND');
      const updated = await repository.updateSubcontractor(subcontractorId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.specialty === undefined ? {} : { specialty: input.specialty }),
        ...(input.address === undefined ? {} : { address: input.address }),
        ...(input.status === undefined ? {} : { status: input.status })
      });
      if (!updated) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_FOUND');
      await recordAudit(tx, {
        action: 'subcontractor.updated', entityType: 'subcontractor', entityId: updated.id,
        before: { name: before.name, phone: before.phone, specialty: before.specialty, address: before.address, status: before.status },
        after: { name: updated.name, phone: updated.phone, specialty: updated.specialty, address: updated.address, status: updated.status }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontractor.updated', resourceType: 'subcontractor', resourceId: updated.id,
        payload: { code: updated.code, status: updated.status }
      });
      return updated;
    });
  }

  /** List subcontract Project assignments with bounded company-scoped filters. */
  async listSubcontractContracts(input: ListSubcontractContractsQuery) {
    this.requirePermission('subcontractors.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new VendorsSubcontractorsRepository(this.db).listSubcontractContracts({
      ...(input.subcontractorId === undefined ? {} : { subcontractorId: input.subcontractorId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return { items: result.items, total: result.total, page, pageSize };
  }

  /** Assign one company Project and agreed contract amount to an active subcontractor. */
  async createSubcontractContract(input: CreateSubcontractContractBody) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      const subcontractor = await repository.findSubcontractorById(input.subcontractorId);
      if (!subcontractor) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_FOUND');
      if (subcontractor.status !== ACTIVE) throw createVendorsSubcontractorsError('SUBCONTRACTOR_NOT_ACTIVE');
      const project = await repository.findProjectById(input.projectId);
      if (!project) throw createVendorsSubcontractorsError('PROJECT_NOT_FOUND');
      const contract = await repository.createSubcontractContract({
        subcontractorId: input.subcontractorId,
        projectId: input.projectId,
        contractAmount: input.contractAmount,
        contractDate: new Date(`${input.contractDate}T00:00:00.000Z`),
        status: ACTIVE
      });
      await recordAudit(tx, {
        action: 'subcontract.created',
        entityType: 'subcontract_contract',
        entityId: contract.id,
        after: {
          subcontractorId: contract.subcontractorId,
          projectId: contract.projectId,
          contractAmount: contract.contractAmount.toString(),
          contractDate: input.contractDate,
          status: contract.status
        }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontract.created',
        resourceType: 'subcontract_contract',
        resourceId: contract.id,
        payload: { subcontractorId: contract.subcontractorId, projectId: contract.projectId, status: contract.status }
      });
      return contract;
    });
  }

  /** List direct subcontract payments without exposing supplier-payables data. */
  async listSubcontractPayments(input: ListSubcontractPaymentsQuery) {
    this.requirePermission('subcontractors.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new VendorsSubcontractorsRepository(this.db).listSubcontractPayments({
      ...(input.subcontractorId === undefined ? {} : { subcontractorId: input.subcontractorId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.subcontractContractId === undefined ? {} : { subcontractContractId: input.subcontractContractId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return {
      items: result.items.map((payment) => ({
        id: payment.id,
        subcontractContractId: payment.subcontractContractId,
        paymentNo: payment.paymentNo,
        paymentDate: dateOnly(payment.paymentDate),
        amount: moneyString(payment.amount),
        reference: payment.reference,
        status: payment.status,
        subcontractor: payment.subcontractContract.subcontractor,
        project: payment.subcontractContract.project,
        cashBankAccount: payment.cashBankAccount
      })),
      total: result.total,
      page,
      pageSize
    };
  }

  /** Create and automatically post one direct subcontract payment and its Finance/Project Cost sources. */
  async createSubcontractPayment(input: CreateSubcontractPaymentBody, idempotencyKey: string) {
    this.requirePermission('subcontractors.manage');
    const result = await executeIdempotentCommand(this.db, {
      operation: 'vendors-subcontractors.subcontract-payments.create',
      idempotencyKey,
      fingerprintInput: input
    }, async (tx) => this.createSubcontractPaymentOnce(tx, input));
    return result.response.body;
  }

  /** Validate contract balance and post one subcontract payment atomically. */
  private async createSubcontractPaymentOnce(tx: TransactionClient, input: CreateSubcontractPaymentBody) {
    const repository = new VendorsSubcontractorsRepository(tx);
    const contract = await repository.lockSubcontractContractForPayment(input.subcontractContractId);
    if (!contract) throw createVendorsSubcontractorsError('SUBCONTRACT_CONTRACT_NOT_FOUND');

    const cashBank = await repository.findCashBankAccountById(input.cashBankAccountId);
    if (!cashBank
      || cashBank.status !== ACTIVE
      || !['CASH', 'BANK'].includes(cashBank.accountType.trim().toUpperCase())
      || cashBank.glAccount.status !== ACTIVE
      || cashBank.glAccount.accountType.trim().toUpperCase() !== cashBank.accountType.trim().toUpperCase()) {
      throw new ValidationError({ message: 'Subcontractor Payment requires an active same-Company Cash/Bank account.' });
    }

    const expenseAccount = await repository.ensureSubcontractPaymentSetup();
    if (expenseAccount.status !== ACTIVE || expenseAccount.accountType.trim().toUpperCase() !== 'EXPENSE') {
      throw new ConflictError({ message: `${SUBCONTRACT_EXPENSE_ACCOUNT_CODE} must be an active expense account.` });
    }

    const paidAmount = moneyToMinorUnits(moneyString(await repository.sumPostedSubcontractPayments(contract.id)));
    const contractAmount = moneyToMinorUnits(moneyString(contract.contractAmount));
    const paymentAmount = moneyToMinorUnits(input.amount);
    if (paymentAmount > contractAmount - paidAmount) {
      throw new ValidationError({ message: 'Subcontractor Payment cannot exceed the remaining subcontract contract balance.' });
    }

    const number = await allocateCompanyNumber(tx, { sequenceKey: SUBCONTRACT_PAYMENT_SEQUENCE_KEY });
    const created = await repository.createSubcontractPayment({
      subcontractContractId: contract.id,
      paymentNo: number.formatted,
      paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
      amount: minorUnitsToMoney(paymentAmount),
      cashBankAccountId: input.cashBankAccountId,
      reference: input.reference?.trim() ?? null
    });
    const sourceKey = `subcontract_payment:${created.id}`;
    const amount = moneyString(created.amount);

    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: SUBCONTRACT_PAYMENT_SOURCE_TYPE,
      sourceId: created.id,
      sourceKey,
      postingDate: created.paymentDate,
      description: `Subcontractor payment ${created.paymentNo}`,
      lines: [
        { accountId: expenseAccount.id, projectId: contract.projectId, stageId: null, debit: amount, credit: ZERO_MONEY, description: `Subcontract cost ${created.paymentNo}` },
        { accountId: cashBank.glAccount.id, projectId: contract.projectId, stageId: null, debit: ZERO_MONEY, credit: amount, description: `Cash/Bank payment ${created.paymentNo}` }
      ]
    });
    await repository.upsertSubcontractPaymentCostActual({
      projectId: contract.projectId,
      paymentId: created.id,
      sourceKey,
      postingDate: created.paymentDate,
      amount
    });

    const posted = await repository.markSubcontractPaymentPosted(created.id);
    if (!posted) throw new ConflictError({ message: 'Subcontractor Payment state changed before posting completed.' });
    const response = {
      id: posted.id,
      subcontractContractId: posted.subcontractContractId,
      paymentNo: posted.paymentNo,
      paymentDate: dateOnly(posted.paymentDate),
      amount: moneyString(posted.amount),
      reference: posted.reference,
      status: posted.status,
      subcontractor: posted.subcontractContract.subcontractor,
      project: posted.subcontractContract.project,
      cashBankAccount: posted.cashBankAccount
    };
    await recordAudit(tx, {
      action: 'subcontract.payment_posted',
      entityType: 'subcontract_payment',
      entityId: posted.id,
      projectId: contract.projectId,
      after: { ...response, financeSourceKey: sourceKey, costSourceKey: sourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'subcontract.payment_posted',
      resourceType: 'subcontract_payment',
      resourceId: posted.id,
      payload: { subcontractContractId: contract.id, subcontractorId: contract.subcontractorId, projectId: contract.projectId, paymentNo: posted.paymentNo, amount, financeSourceKey: sourceKey, costSourceKey: sourceKey }
    });
    return { statusCode: 201, body: response };
  }

  /** Return contract, paid and remaining values for the subcontractor ledger. */
  async listSubcontractLedger(input: ListSubcontractLedgerQuery) {
    this.requirePermission('subcontractors.read');
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new VendorsSubcontractorsRepository(this.db).listSubcontractLedger({
      ...(input.subcontractorId === undefined ? {} : { subcontractorId: input.subcontractorId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });
    return {
      items: result.items.map((contract) => {
        const contractAmount = moneyToMinorUnits(moneyString(contract.contractAmount));
        const paidAmount = contract.payments.reduce((total, payment) => total + moneyToMinorUnits(moneyString(payment.amount)), 0n);
        return {
          subcontractContractId: contract.id,
          contractDate: dateOnly(contract.contractDate),
          status: contract.status,
          finishedAt: contract.finishedAt?.toISOString() ?? null,
          contractAmount: minorUnitsToMoney(contractAmount),
          paidAmount: minorUnitsToMoney(paidAmount),
          balanceAmount: minorUnitsToMoney(contractAmount - paidAmount),
          subcontractor: contract.subcontractor,
          project: contract.project
        };
      }),
      total: result.total,
      page,
      pageSize
    };
  }

  /** Finish one active subcontract contract and preserve its original Project, amount and date. */
  async finishSubcontractContract(contractId: string) {
    this.requirePermission('subcontractors.manage');
    return withTransaction(this.db, async (tx) => {
      const repository = new VendorsSubcontractorsRepository(tx);
      const before = await repository.findSubcontractContractById(contractId);
      if (!before) throw createVendorsSubcontractorsError('SUBCONTRACT_CONTRACT_NOT_FOUND');
      if (before.status === 'FINISHED') throw createVendorsSubcontractorsError('SUBCONTRACT_CONTRACT_ALREADY_FINISHED');
      const finishedAt = new Date();
      const finished = await repository.finishSubcontractContract(contractId, finishedAt);
      if (!finished) throw createVendorsSubcontractorsError('SUBCONTRACT_CONTRACT_ALREADY_FINISHED');
      await recordAudit(tx, {
        action: 'subcontract.finished',
        entityType: 'subcontract_contract',
        entityId: finished.id,
        before: { status: before.status, finishedAt: before.finishedAt },
        after: { status: finished.status, finishedAt: finished.finishedAt }
      });
      await recordOutboxEvent(tx, {
        eventType: 'subcontract.finished',
        resourceType: 'subcontract_contract',
        resourceId: finished.id,
        payload: { subcontractorId: finished.subcontractorId, projectId: finished.projectId, status: finished.status }
      });
      return finished;
    });
  }

}
