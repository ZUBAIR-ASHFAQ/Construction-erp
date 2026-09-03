import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import { ClientReceiptsRepository, type ClientReceiptsRepositoryVisibility } from './client-receipts.repository.js';
import {
  createClientReceiptError,
  type AllocateClientReceiptBody,
  type ClientReceiptPermissionCode,
  type CreateClientReceiptBody,
  type ListClientReceiptsQuery,
  type UnallocateClientReceiptBody
} from './client-receipts.schema.js';

const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const ACCOUNT_ACTIVE = 'ACTIVE';
const LEGACY_CASH_ACCOUNT_TYPE = 'ASSET';
const CLIENT_ADVANCE_ACCOUNT_CODE = 'CLIENT-ADVANCE';
const CLIENT_ADVANCE_ACCOUNT_NAME = 'Client Advance';
const CLIENT_ADVANCE_ACCOUNT_TYPE = 'LIABILITY';
const CLIENT_RECEIVABLE_ACCOUNT_CODE = 'CLIENT-RECEIVABLE';
const CLIENT_RECEIVABLE_ACCOUNT_NAME = 'Client Receivable';
const CLIENT_RECEIVABLE_ACCOUNT_TYPE = 'ASSET';
const CLIENT_INVOICE_ISSUED = 'ISSUED';
const JOURNAL_POSTED = 'POSTED';
const CLIENT_RECEIPT_SEQUENCE_KEY = 'client-receipt';
const ZERO_MONEY = '0.00';
const DEFAULT_PAGE_SIZE = 25;

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Parse one validated API date without local-time conversion. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Build deterministic pagination values for one Client Receipt list request. */
function pageWindow(query: { page?: number | undefined; pageSize?: number | undefined }) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Convert exact money into integer minor units. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
}

/** Convert non-negative integer minor units into stable two-decimal money. */
function minorUnitsToMoney(value: bigint): string {
  if (value < 0n) throw new ValidationError({ message: 'Client Receipt money cannot be negative.' });
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** Return the stable Finance source key for one posted Client Receipt. */
function clientReceiptFinanceSourceKey(receiptId: string): string {
  return `client_receipt:${receiptId}`;
}

/** Return the stable Finance source key for one Client Receipt allocation. */
function clientReceiptAllocationFinanceSourceKey(allocationId: string): string {
  return `client_receipt_allocation:${allocationId}`;
}

/** Return the stable Finance source key for one controlled allocation reversal. */
function clientReceiptAllocationReversalFinanceSourceKey(allocationId: string): string {
  return `client_receipt_allocation_reversal:${allocationId}`;
}

/** Return the stable Finance source key for one controlled Client Receipt reversal. */
function clientReceiptReversalFinanceSourceKey(receiptId: string): string {
  return `client_receipt_reversal:${receiptId}`;
}

/** Reverse persisted Journal lines without changing the original accounting history. */
function reverseJournalLines(lines: readonly any[], descriptionPrefix: string) {
  return lines.map((line) => ({
    accountId: line.accountId,
    projectId: line.projectId,
    stageId: line.stageId,
    debit: minorUnitsToMoney(moneyToMinorUnits(line.credit)),
    credit: minorUnitsToMoney(moneyToMinorUnits(line.debit)),
    description: `${descriptionPrefix}${line.description ? ` - ${line.description}` : ''}`
  }));
}

/** Convert one persisted allocation into the stable Client Receipt API shape. */
function allocationResponse(allocation: any) {
  return {
    id: allocation.id,
    clientInvoiceId: allocation.clientInvoiceId,
    amount: minorUnitsToMoney(moneyToMinorUnits(allocation.amount)),
    allocatedAt: allocation.allocatedAt.toISOString(),
    allocatedBy: allocation.allocatedBy
  };
}

/** Convert one persisted receipt into the API shape with source-derived allocation totals. */
function receiptResponse(receipt: any) {
  const allocations = (receipt.allocations ?? []).map(allocationResponse);
  const amount = moneyToMinorUnits(receipt.amount);
  const allocated = allocations.reduce((sum: bigint, allocation: Readonly<{ amount: string }>) => sum + moneyToMinorUnits(allocation.amount), 0n);
  if (allocated > amount) throw new ValidationError({ message: 'Client Receipt allocations exceed the persisted receipt amount.' });
  return {
    id: receipt.id,
    clientId: receipt.clientId,
    projectId: receipt.projectId,
    stageId: receipt.stageId,
    receiptNo: receipt.receiptNo,
    receiptDate: dateOnly(receipt.receiptDate),
    amount: minorUnitsToMoney(amount),
    paymentMethod: receipt.paymentMethod,
    cashBankAccountId: receipt.cashBankAccountId,
    reference: receipt.reference,
    receiptType: receipt.receiptType,
    status: receipt.status,
    createdBy: receipt.createdBy,
    postedAt: receipt.postedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    allocatedAmount: minorUnitsToMoney(allocated),
    unallocatedAmount: minorUnitsToMoney(amount - allocated),
    allocations
  };
}

/** Orchestrate Final Module 16 Client Receipt business commands. */
export class ClientReceiptsService {
  /** Bind Client Receipt business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Check one Company-level Client Receipt permission from persisted role assignments. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: ClientReceiptPermissionCode, asOf: Date) {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Resolve the Projects visible for one Client Receipt permission. */
  private async resolveVisibility(repository: AdministrationRepository, permission: ClientReceiptPermissionCode, asOf: Date): Promise<ClientReceiptsRepositoryVisibility> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    const candidates = security.projectScope.kind === 'restricted' ? [...security.projectScope.projectIds] : null;
    if (await this.hasCompanyPermission(repository, permission, asOf)) return { allowedProjectIds: candidates };
    const projectIds = await repository.listProjectIdsWithPermission(permission, candidates, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (projectIds.length === 0) throw new AuthorizationError();
    return { allowedProjectIds: projectIds };
  }

  /** Require one Project-specific Client Receipt permission inside trusted request scope. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: ClientReceiptPermissionCode, asOf: Date): Promise<void> {
    const security = requireRequestSecurityContext();
    if (security.projectScope.kind === 'not-resolved') throw new AuthorizationError();
    if (security.projectScope.kind === 'restricted' && !security.projectScope.projectIds.includes(projectId)) throw new AuthorizationError();
    if (await this.hasCompanyPermission(repository, permission, asOf)) return;
    const permissions = await repository.findEffectivePermissionCodesForProject(projectId, {
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    if (permissions === null) throw new NotFoundError();
    if (!permissions.includes(permission)) throw new AuthorizationError();
  }

  /** List Client Receipts visible through the authenticated Company and Project permission scope. */
  async listClientReceipts(query: ListClientReceiptsQuery) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'client_receipts.read', new Date());
    if (query.projectId && visibility.allowedProjectIds !== null && !visibility.allowedProjectIds.includes(query.projectId)) {
      throw new AuthorizationError();
    }
    const page = pageWindow(query);
    const result = await new ClientReceiptsRepository(this.db).listClientReceipts({
      allowedProjectIds: visibility.allowedProjectIds,
      skip: page.skip,
      take: page.take,
      clientId: query.clientId,
      projectId: query.projectId,
      stageId: query.stageId,
      status: query.status,
      receiptType: query.receiptType,
      paymentMethod: query.paymentMethod,
      fromDate: query.fromDate ? inputDate(query.fromDate) : undefined,
      toDate: query.toDate ? inputDate(query.toDate) : undefined
    });
    return { items: result.items.map(receiptResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Read one Client Receipt only when it is inside the authenticated Project scope. */
  async getClientReceipt(receiptId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'client_receipts.read', new Date());
    const receipt = await new ClientReceiptsRepository(this.db).findClientReceiptById(receiptId, visibility);
    if (!receipt) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    return receiptResponse(receipt);
  }

  /** Validate receipt ownership and the explicit Cash/Bank plus Client Advance Finance mapping. */
  private async validateCreateDependencies(
    repository: ClientReceiptsRepository,
    input: CreateClientReceiptBody,
    visibility: ClientReceiptsRepositoryVisibility
  ) {
    const client = await repository.findClientById(input.clientId);
    if (!client) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');

    const project = await repository.findProjectById(input.projectId, input.clientId, visibility);
    if (!project) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');

    if (input.stageId) {
      const stage = await repository.findStageById(input.projectId, input.stageId, visibility);
      if (!stage) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');
    }

    const cashBankAccount = await repository.findCashBankAccountById(input.cashBankAccountId);
    const cashBankGlType = cashBankAccount?.glAccount.accountType.trim().toUpperCase();
    if (
      !cashBankAccount
      || cashBankAccount.status !== ACCOUNT_ACTIVE
      || cashBankAccount.accountType !== input.paymentMethod
      || cashBankAccount.glAccount.status !== ACCOUNT_ACTIVE
      || (cashBankGlType !== LEGACY_CASH_ACCOUNT_TYPE && cashBankGlType !== input.paymentMethod)
    ) {
      throw new ValidationError({ message: 'Client Receipt requires an active matching Cash/Bank account with a compatible active GL account.' });
    }

    const clientAdvanceAccount = await repository.findGlAccountByCode(CLIENT_ADVANCE_ACCOUNT_CODE)
      ?? await repository.ensureReceiptControlAccount({
        accountCode: CLIENT_ADVANCE_ACCOUNT_CODE,
        name: CLIENT_ADVANCE_ACCOUNT_NAME,
        accountType: CLIENT_ADVANCE_ACCOUNT_TYPE
      });
    if (
      clientAdvanceAccount.status !== ACCOUNT_ACTIVE
      || clientAdvanceAccount.accountType !== CLIENT_ADVANCE_ACCOUNT_TYPE
    ) {
      throw new ValidationError({ message: `Finance account ${CLIENT_ADVANCE_ACCOUNT_CODE} must be an active liability account before Client Receipts can be posted.` });
    }

    return {
      cashGlAccountId: cashBankAccount.glAccount.id,
      clientAdvanceAccountId: clientAdvanceAccount.id
    };
  }

  /** Validate the Finance accounts used to reclassify Client Advance into Client Receivable. */
  private async validateAllocationAccounts(repository: ClientReceiptsRepository) {
    const [existingAdvanceAccount, existingReceivableAccount] = await Promise.all([
      repository.findGlAccountByCode(CLIENT_ADVANCE_ACCOUNT_CODE),
      repository.findGlAccountByCode(CLIENT_RECEIVABLE_ACCOUNT_CODE)
    ]);
    const [clientAdvanceAccount, clientReceivableAccount] = await Promise.all([
      existingAdvanceAccount ?? repository.ensureReceiptControlAccount({
        accountCode: CLIENT_ADVANCE_ACCOUNT_CODE,
        name: CLIENT_ADVANCE_ACCOUNT_NAME,
        accountType: CLIENT_ADVANCE_ACCOUNT_TYPE
      }),
      existingReceivableAccount ?? repository.ensureReceiptControlAccount({
        accountCode: CLIENT_RECEIVABLE_ACCOUNT_CODE,
        name: CLIENT_RECEIVABLE_ACCOUNT_NAME,
        accountType: CLIENT_RECEIVABLE_ACCOUNT_TYPE
      })
    ]);
    if (
      clientAdvanceAccount.status !== ACCOUNT_ACTIVE
      || clientAdvanceAccount.accountType !== CLIENT_ADVANCE_ACCOUNT_TYPE
    ) {
      throw new ValidationError({ message: `Finance account ${CLIENT_ADVANCE_ACCOUNT_CODE} must be an active liability account.` });
    }
    if (
      clientReceivableAccount.status !== ACCOUNT_ACTIVE
      || clientReceivableAccount.accountType !== CLIENT_RECEIVABLE_ACCOUNT_TYPE
    ) {
      throw new ValidationError({ message: `Finance account ${CLIENT_RECEIVABLE_ACCOUNT_CODE} must be an active asset account.` });
    }
    return { clientAdvanceAccountId: clientAdvanceAccount.id, clientReceivableAccountId: clientReceivableAccount.id };
  }

  /** Require the exact posted Finance source Journal before creating a compensating entry. */
  private async requirePostedFinanceSourceJournal(
    tx: TransactionClient,
    sourceKey: string,
    sourceType: string,
    sourceId: string,
    expectedAmount?: DecimalLike
  ) {
    const journal = await new FinanceRepository(tx).findJournalBySourceKey(sourceKey);
    const expected = expectedAmount === undefined ? null : moneyToMinorUnits(expectedAmount);
    if (
      !journal
      || journal.sourceType !== sourceType
      || journal.sourceId !== sourceId
      || journal.status !== JOURNAL_POSTED
      || (expected !== null && (moneyToMinorUnits(journal.totalDebit) !== expected || moneyToMinorUnits(journal.totalCredit) !== expected))
    ) {
      throw createClientReceiptError('RECEIPT_LOCKED');
    }
    return journal;
  }

  /** Post one new unallocated Client Receipt to Cash/Bank and Client Advance inside the same transaction. */
  private async postReceiptToFinance(
    tx: TransactionClient,
    receipt: any,
    cashGlAccountId: string,
    clientAdvanceAccountId: string
  ) {
    const sourceKey = clientReceiptFinanceSourceKey(receipt.id);
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'client_receipt',
      sourceId: receipt.id,
      sourceKey,
      postingDate: receipt.receiptDate,
      description: `Client receipt ${receipt.receiptNo}`,
      lines: [
        {
          accountId: cashGlAccountId,
          projectId: receipt.projectId,
          stageId: receipt.stageId,
          debit: minorUnitsToMoney(moneyToMinorUnits(receipt.amount)),
          credit: ZERO_MONEY,
          description: `Client receipt ${receipt.receiptNo} cash received`
        },
        {
          accountId: clientAdvanceAccountId,
          projectId: receipt.projectId,
          stageId: receipt.stageId,
          debit: ZERO_MONEY,
          credit: minorUnitsToMoney(moneyToMinorUnits(receipt.amount)),
          description: `Client receipt ${receipt.receiptNo} unapplied client advance`
        }
      ]
    });
    await this.requirePostedFinanceSourceJournal(tx, sourceKey, 'client_receipt', receipt.id, receipt.amount);
    return sourceKey;
  }

  /** Create and post one Client Receipt exactly once. */
  async createClientReceipt(input: CreateClientReceiptBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-receipts.create',
      idempotencyKey,
      fingerprintInput: input
    }, async (tx) => this.createClientReceiptOnce(tx, input));
    return result.response.body;
  }

  /** Validate scope, allocate the receipt number and atomically persist Receipt plus Finance cash history. */
  private async createClientReceiptOnce(tx: TransactionClient, input: CreateClientReceiptBody) {
    const users = new AdministrationRepository(tx);
    const now = new Date();
    await this.requireProjectPermission(users, input.projectId, 'client_receipts.create', now);
    const visibility: ClientReceiptsRepositoryVisibility = { allowedProjectIds: [input.projectId] };
    const repository = new ClientReceiptsRepository(tx);
    const accounts = await this.validateCreateDependencies(repository, input, visibility);
    const number = await allocateCompanyNumber(tx, { sequenceKey: CLIENT_RECEIPT_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const receipt = await repository.createClientReceipt({
      allowedProjectIds: visibility.allowedProjectIds,
      clientId: input.clientId,
      projectId: input.projectId,
      stageId: input.stageId ?? null,
      receiptNo: number.formatted,
      receiptDate: inputDate(input.receiptDate),
      amount: input.amount,
      paymentMethod: input.paymentMethod,
      cashBankAccountId: input.cashBankAccountId,
      reference: input.reference ?? null,
      receiptType: input.receiptType,
      createdBy: security.actorUserId,
      postedAt: now
    });
    if (!receipt) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');

    const financeSourceKey = await this.postReceiptToFinance(tx, receipt, accounts.cashGlAccountId, accounts.clientAdvanceAccountId);
    const response = receiptResponse(receipt);
    await recordAudit(tx, {
      action: 'client_receipt.posted',
      entityType: 'client_receipt',
      entityId: receipt.id,
      projectId: receipt.projectId,
      stageId: receipt.stageId,
      after: { ...response, financeSourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'client_receipt.posted',
      resourceType: 'client_receipt',
      resourceId: receipt.id,
      payload: {
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        clientId: receipt.clientId,
        projectId: receipt.projectId,
        stageId: receipt.stageId,
        amount: response.amount,
        receiptType: receipt.receiptType,
        financeSourceKey
      }
    });
    return { statusCode: 201, body: response };
  }

  /** Allocate posted Client Receipt cash to one Client Invoice exactly once. */
  async allocateClientReceipt(receiptId: string, input: AllocateClientReceiptBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-receipts.allocate',
      idempotencyKey,
      fingerprintInput: { receiptId, ...input }
    }, async (tx) => this.allocateClientReceiptOnce(tx, receiptId, input));
    return result.response.body;
  }

  /** Lock both sides, enforce remaining balances and reclassify Client Advance to Client Receivable atomically. */
  private async allocateClientReceiptOnce(tx: TransactionClient, receiptId: string, input: AllocateClientReceiptBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'client_receipts.allocate', now);
    const repository = new ClientReceiptsRepository(tx);
    const receipt = await repository.lockClientReceiptForWrite(receiptId, visibility);
    if (!receipt) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    if (receipt.status !== 'POSTED') throw createClientReceiptError('RECEIPT_LOCKED');

    const invoice = await repository.lockClientInvoiceForAllocation(input.clientInvoiceId, receipt.clientId, receipt.projectId, visibility);
    if (!invoice || invoice.status !== CLIENT_INVOICE_ISSUED) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');
    const invoiceDetail = await repository.findClientInvoiceById(invoice.id, receipt.clientId, receipt.projectId, visibility);
    if (!invoiceDetail) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');

    const requested = moneyToMinorUnits(input.amount);
    const receiptAllocated = moneyToMinorUnits(await repository.sumAllocatedAmountForReceipt(receipt.id) ?? ZERO_MONEY);
    if (receiptAllocated + requested > moneyToMinorUnits(receipt.amount)) {
      throw createClientReceiptError('ALLOCATION_EXCEEDS_RECEIPT');
    }

    const invoiceAllocated = moneyToMinorUnits(await repository.sumAllocatedAmountForInvoice(invoice.id) ?? ZERO_MONEY);
    if (invoiceAllocated + requested > moneyToMinorUnits(invoice.totalAmount)) {
      throw createClientReceiptError('ALLOCATION_EXCEEDS_INVOICE');
    }

    if (receipt.stageId) {
      const stageBilled = invoiceDetail.lines
        .filter((line: any) => line.stageId === receipt.stageId)
        .reduce((sum: bigint, line: any) => sum + moneyToMinorUnits(line.amount), 0n);
      if (stageBilled === 0n) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');
      const stageAllocated = moneyToMinorUnits(await repository.sumAllocatedAmountForInvoiceStage(invoice.id, receipt.stageId) ?? ZERO_MONEY);
      if (stageAllocated + requested > stageBilled) throw createClientReceiptError('ALLOCATION_EXCEEDS_INVOICE');
    }

    const accounts = await this.validateAllocationAccounts(repository);
    const security = requireRequestSecurityContext();
    const allocation = await repository.createAllocation({
      receiptId: receipt.id,
      clientInvoiceId: invoice.id,
      amount: input.amount,
      allocatedAt: now,
      allocatedBy: security.actorUserId
    });
    const financeSourceKey = clientReceiptAllocationFinanceSourceKey(allocation.id);
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'client_receipt_allocation',
      sourceId: allocation.id,
      sourceKey: financeSourceKey,
      postingDate: now,
      description: `Client receipt ${receipt.receiptNo} allocation`,
      lines: [
        {
          accountId: accounts.clientAdvanceAccountId,
          projectId: receipt.projectId,
          stageId: receipt.stageId,
          debit: input.amount,
          credit: ZERO_MONEY,
          description: `Apply client advance from receipt ${receipt.receiptNo}`
        },
        {
          accountId: accounts.clientReceivableAccountId,
          projectId: receipt.projectId,
          stageId: receipt.stageId,
          debit: ZERO_MONEY,
          credit: input.amount,
          description: `Reduce client receivable for invoice ${invoice.id}`
        }
      ]
    });
    await this.requirePostedFinanceSourceJournal(tx, financeSourceKey, 'client_receipt_allocation', allocation.id, allocation.amount);

    const refreshed = await repository.findClientReceiptById(receipt.id, visibility);
    if (!refreshed) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    const response = receiptResponse(refreshed);
    const allocationResult = allocationResponse(allocation);
    await recordAudit(tx, {
      action: 'client_receipt.allocated',
      entityType: 'client_receipt',
      entityId: receipt.id,
      projectId: receipt.projectId,
      stageId: receipt.stageId,
      after: { allocation: allocationResult, allocatedAmount: response.allocatedAmount, unallocatedAmount: response.unallocatedAmount, financeSourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'client_receipt.allocated',
      resourceType: 'client_receipt',
      resourceId: receipt.id,
      payload: {
        receiptId: receipt.id,
        clientInvoiceId: invoice.id,
        allocationId: allocation.id,
        amount: allocationResult.amount,
        projectId: receipt.projectId,
        stageId: receipt.stageId,
        financeSourceKey
      }
    });
    return { statusCode: 201, body: response };
  }

  /** Reverse one selected Client Receipt allocation exactly once without changing the original cash receipt. */
  async unallocateClientReceipt(receiptId: string, input: UnallocateClientReceiptBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-receipts.unallocate',
      idempotencyKey,
      fingerprintInput: { receiptId, ...input }
    }, async (tx) => this.unallocateClientReceiptOnce(tx, receiptId, input));
    return result.response.body;
  }

  /** Compensate the allocation Journal, remove the active allocation link and preserve audit evidence atomically. */
  private async unallocateClientReceiptOnce(tx: TransactionClient, receiptId: string, input: UnallocateClientReceiptBody) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'client_receipts.allocate', now);
    const repository = new ClientReceiptsRepository(tx);
    const receipt = await repository.lockClientReceiptForWrite(receiptId, visibility);
    if (!receipt) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    if (receipt.status !== 'POSTED') throw createClientReceiptError('RECEIPT_LOCKED');

    const allocation = await repository.findAllocationById(receipt.id, input.allocationId, visibility);
    if (!allocation) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');
    const invoice = await repository.lockClientInvoiceForAllocation(allocation.clientInvoiceId, receipt.clientId, receipt.projectId, visibility);
    if (!invoice) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');

    const originalSourceKey = clientReceiptAllocationFinanceSourceKey(allocation.id);
    const originalJournal = await this.requirePostedFinanceSourceJournal(tx, originalSourceKey, 'client_receipt_allocation', allocation.id, allocation.amount);
    const financeSourceKey = clientReceiptAllocationReversalFinanceSourceKey(allocation.id);
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'client_receipt_allocation_reversal',
      sourceId: allocation.id,
      sourceKey: financeSourceKey,
      postingDate: now,
      description: `Reverse Client receipt ${receipt.receiptNo} allocation`,
      lines: reverseJournalLines(originalJournal.lines, `Unallocate receipt ${receipt.receiptNo}`)
    });
    await this.requirePostedFinanceSourceJournal(tx, financeSourceKey, 'client_receipt_allocation_reversal', allocation.id, allocation.amount);

    const removed = await repository.deleteAllocation(receipt.id, allocation.id, visibility);
    if (!removed) throw createClientReceiptError('RECEIPT_SCOPE_MISMATCH');
    const refreshed = await repository.findClientReceiptById(receipt.id, visibility);
    if (!refreshed) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    const response = receiptResponse(refreshed);
    await recordAudit(tx, {
      action: 'client_receipt.allocation_reversed',
      entityType: 'client_receipt',
      entityId: receipt.id,
      projectId: receipt.projectId,
      stageId: receipt.stageId,
      before: { allocation: allocationResponse(allocation), financeSourceKey: originalSourceKey },
      after: { allocatedAmount: response.allocatedAmount, unallocatedAmount: response.unallocatedAmount, financeSourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'client_receipt.allocation_reversed',
      resourceType: 'client_receipt',
      resourceId: receipt.id,
      payload: {
        receiptId: receipt.id,
        clientInvoiceId: allocation.clientInvoiceId,
        allocationId: allocation.id,
        amount: minorUnitsToMoney(moneyToMinorUnits(allocation.amount)),
        projectId: receipt.projectId,
        stageId: receipt.stageId,
        financeSourceKey
      }
    });
    return { statusCode: 200, body: response };
  }

  /** Reverse one fully unallocated posted Client Receipt exactly once through compensating Finance history. */
  async reverseClientReceipt(receiptId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-receipts.reverse',
      idempotencyKey,
      fingerprintInput: { receiptId }
    }, async (tx) => this.reverseClientReceiptOnce(tx, receiptId));
    return result.response.body;
  }

  /** Require zero active allocations, compensate the original cash Journal and mark the receipt REVERSED atomically. */
  private async reverseClientReceiptOnce(tx: TransactionClient, receiptId: string) {
    const now = new Date();
    const users = new AdministrationRepository(tx);
    const visibility = await this.resolveVisibility(users, 'client_receipts.reverse', now);
    const repository = new ClientReceiptsRepository(tx);
    const receipt = await repository.lockClientReceiptForWrite(receiptId, visibility);
    if (!receipt) throw createClientReceiptError('RECEIPT_NOT_FOUND');
    if (receipt.status !== 'POSTED') throw createClientReceiptError('RECEIPT_LOCKED');
    const allocated = moneyToMinorUnits(await repository.sumAllocatedAmountForReceipt(receipt.id) ?? ZERO_MONEY);
    if (allocated !== 0n) throw createClientReceiptError('RECEIPT_LOCKED');

    const originalSourceKey = clientReceiptFinanceSourceKey(receipt.id);
    const originalJournal = await this.requirePostedFinanceSourceJournal(tx, originalSourceKey, 'client_receipt', receipt.id, receipt.amount);
    const financeSourceKey = clientReceiptReversalFinanceSourceKey(receipt.id);
    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'client_receipt_reversal',
      sourceId: receipt.id,
      sourceKey: financeSourceKey,
      postingDate: now,
      description: `Reverse Client receipt ${receipt.receiptNo}`,
      lines: reverseJournalLines(originalJournal.lines, `Reverse receipt ${receipt.receiptNo}`)
    });
    await this.requirePostedFinanceSourceJournal(tx, financeSourceKey, 'client_receipt_reversal', receipt.id, receipt.amount);

    const reversed = await repository.markClientReceiptReversed(receipt.id, visibility);
    if (!reversed) throw createClientReceiptError('RECEIPT_LOCKED');
    const response = receiptResponse(reversed);
    await recordAudit(tx, {
      action: 'client_receipt.reversed',
      entityType: 'client_receipt',
      entityId: receipt.id,
      projectId: receipt.projectId,
      stageId: receipt.stageId,
      before: { status: 'POSTED', financeSourceKey: originalSourceKey },
      after: { ...response, financeSourceKey }
    });
    await recordOutboxEvent(tx, {
      eventType: 'client_receipt.reversed',
      resourceType: 'client_receipt',
      resourceId: receipt.id,
      payload: {
        receiptId: receipt.id,
        receiptNo: receipt.receiptNo,
        projectId: receipt.projectId,
        stageId: receipt.stageId,
        amount: response.amount,
        financeSourceKey
      }
    });
    return { statusCode: 200, body: response };
  }
}
