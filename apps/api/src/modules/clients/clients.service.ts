import { recordAudit } from '@construction-erp/audit';
import { withTransaction, type DatabaseClient } from '@construction-erp/database';
import { AuthorizationError } from '@construction-erp/errors';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { hasPermission, requireRequestSecurityContext } from '@construction-erp/request-context';
import { ClientBillingRepository } from '../client-billing/client-billing.repository.js';
import { ClientReceiptsRepository, subtractMoneyAmounts } from '../client-receipts/client-receipts.repository.js';
import { ClientsRepository } from './clients.repository.js';
import {
  createClientError,
  type ClientPermissionCode,
  type CreateClientBody,
  type CreateClientContactBody,
  type ListClientsQuery,
  type UpdateClientBody,
  type UpdateClientContactBody
} from './clients.schema.js';

const CLIENT_ACTIVE = 'ACTIVE';
const CONTACT_ACTIVE = 'ACTIVE';

/** Business rules for final Client Management reads and commands. */
export class ClientsService {
  /** Bind Client Management business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Require one stable Client Management permission from trusted request context. */
  private requirePermission(permission: ClientPermissionCode): void {
    if (!hasPermission(permission)) throw new AuthorizationError();
  }

  /** List Company Clients with bounded pagination and search filters. */
  async listClients(input: ListClientsQuery) {
    this.requirePermission('clients.read');

    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 25;
    const result = await new ClientsRepository(this.db).listClients({
      ...(input.search === undefined ? {} : { search: input.search }),
      ...(input.status === undefined ? {} : { status: input.status }),
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: result.items,
      page,
      pageSize,
      total: result.total
    };
  }

  /** Get one Client with project-scoped summaries and source-module financial permissions. */
  async getClient(clientId: string) {
    this.requirePermission('clients.read');

    const repository = new ClientsRepository(this.db);
    const client = await repository.findClientById(clientId);
    if (!client) throw createClientError('CLIENT_NOT_FOUND');

    const security = requireRequestSecurityContext();
    const allowedProjectIds = security.projectScope.kind === 'all'
      ? null
      : security.projectScope.kind === 'restricted'
        ? security.projectScope.projectIds
        : [];
    const canReadBilling = hasPermission('client_billing.read');
    const canReadReceipts = hasPermission('client_receipts.read');
    const visibility = { allowedProjectIds };

    const [contacts, projectSummary, billing, receipts] = await Promise.all([
      repository.listClientContacts(clientId),
      repository.getClientProjectSummary(clientId, allowedProjectIds),
      canReadBilling
        ? new ClientBillingRepository(this.db).readClientBillingSummary(clientId, visibility)
        : Promise.resolve(null),
      canReadReceipts
        ? new ClientReceiptsRepository(this.db).readReceiptFinancialTotals({ clientId, allowedProjectIds })
        : Promise.resolve(null)
    ]);

    const billedAmount = billing ? billing.billedAmount?.toString() ?? '0.00' : null;
    const receivedAmount = receipts ? receipts.receivedAmount?.toString() ?? '0.00' : null;
    const allocatedAmount = receipts ? receipts.allocatedAmount?.toString() ?? '0.00' : null;

    return {
      client,
      contacts,
      projectSummary,
      billingSummary: billing
        ? { invoiceCount: billing.invoiceCount, billedAmount: billedAmount ?? '0.00' }
        : null,
      receiptSummary: receivedAmount === null || allocatedAmount === null
        ? null
        : {
            receivedAmount,
            allocatedAmount,
            advanceAmount: subtractMoneyAmounts(receivedAmount, allocatedAmount),
            outstandingAmount: billedAmount === null ? null : subtractMoneyAmounts(billedAmount, allocatedAmount)
          }
    };
  }

  /** Create one active Company Client with audit and outbox records in the same transaction. */
  async createClient(input: CreateClientBody) {
    this.requirePermission('clients.create');

    try {
      return await withTransaction(this.db, async (tx) => {
        const repository = new ClientsRepository(tx);
        const existing = await repository.findClientByCode(input.code);
        if (existing) throw createClientError('DUPLICATE_CLIENT_CODE');

        const client = await repository.createClient({
          code: input.code,
          legalName: input.legalName,
          displayName: input.displayName,
          ...(input.taxNo === undefined ? {} : { taxNo: input.taxNo }),
          billingAddress: input.billingAddress,
          status: CLIENT_ACTIVE,
          ...(input.creditTermsDays === undefined ? {} : { creditTermsDays: input.creditTermsDays })
        });

        await recordAudit(tx, {
          action: 'client.created',
          entityType: 'client',
          entityId: client.id,
          after: {
            code: client.code,
            legalName: client.legalName,
            displayName: client.displayName,
            taxNo: client.taxNo,
            billingAddress: client.billingAddress,
            status: client.status,
            creditTermsDays: client.creditTermsDays
          }
        });

        await recordOutboxEvent(tx, {
          eventType: 'client.created',
          resourceType: 'client',
          resourceId: client.id,
          payload: {
            code: client.code,
            status: client.status
          }
        });

        return client;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw createClientError('DUPLICATE_CLIENT_CODE');
      }
      throw error;
    }
  }

  /** Update Client master data and emit a dedicated status event when lifecycle state changes. */
  async updateClient(clientId: string, input: UpdateClientBody) {
    this.requirePermission('clients.update');

    try {
      return await withTransaction(this.db, async (tx) => {
        const repository = new ClientsRepository(tx);
        const before = await repository.findClientById(clientId);
        if (!before) throw createClientError('CLIENT_NOT_FOUND');

        if (input.code) {
          const sameCode = await repository.findClientByCode(input.code);
          if (sameCode && sameCode.id !== clientId) {
            throw createClientError('DUPLICATE_CLIENT_CODE');
          }
        }

        const updated = await repository.updateClient(clientId, {
          ...(input.code === undefined ? {} : { code: input.code }),
          ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
          ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
          ...(input.taxNo === undefined ? {} : { taxNo: input.taxNo }),
          ...(input.billingAddress === undefined ? {} : { billingAddress: input.billingAddress }),
          ...(input.creditTermsDays === undefined ? {} : { creditTermsDays: input.creditTermsDays }),
          ...(input.status === undefined ? {} : { status: input.status })
        });
        if (!updated) throw createClientError('CLIENT_NOT_FOUND');

        const statusChanged = before.status !== updated.status;
        const action = statusChanged ? 'client.status_changed' : 'client.updated';

        await recordAudit(tx, {
          action,
          entityType: 'client',
          entityId: updated.id,
          before: {
            code: before.code,
            legalName: before.legalName,
            displayName: before.displayName,
            taxNo: before.taxNo,
            billingAddress: before.billingAddress,
            status: before.status,
            creditTermsDays: before.creditTermsDays
          },
          after: {
            code: updated.code,
            legalName: updated.legalName,
            displayName: updated.displayName,
            taxNo: updated.taxNo,
            billingAddress: updated.billingAddress,
            status: updated.status,
            creditTermsDays: updated.creditTermsDays
          }
        });

        await recordOutboxEvent(tx, {
          eventType: action,
          resourceType: 'client',
          resourceId: updated.id,
          payload: {
            code: updated.code,
            status: updated.status
          }
        });

        return updated;
      });
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        throw createClientError('DUPLICATE_CLIENT_CODE');
      }
      throw error;
    }
  }

  /** Add one active Contact only to an active Client and audit the master-data change. */
  async createClientContact(clientId: string, input: CreateClientContactBody) {
    this.requirePermission('clients.update');

    return withTransaction(this.db, async (tx) => {
      const repository = new ClientsRepository(tx);
      const client = await repository.findClientById(clientId);
      if (!client) throw createClientError('CLIENT_NOT_FOUND');
      if (client.status !== CLIENT_ACTIVE) throw createClientError('CLIENT_IN_USE');

      const contact = await repository.createClientContact({
        clientId,
        name: input.name,
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        isPrimary: input.isPrimary,
        status: CONTACT_ACTIVE
      });
      if (!contact) throw createClientError('CLIENT_NOT_FOUND');

      await recordAudit(tx, {
        action: 'client.contact_created',
        entityType: 'client_contact',
        entityId: contact.id,
        after: {
          clientId: contact.clientId,
          name: contact.name,
          title: contact.title,
          email: contact.email,
          phone: contact.phone,
          isPrimary: contact.isPrimary,
          status: contact.status
        }
      });

      return contact;
    });
  }

  /** Update one Contact under its existing Client and audit before/after master values. */
  async updateClientContact(clientId: string, contactId: string, input: UpdateClientContactBody) {
    this.requirePermission('clients.update');

    return withTransaction(this.db, async (tx) => {
      const repository = new ClientsRepository(tx);
      const client = await repository.findClientById(clientId);
      if (!client) throw createClientError('CLIENT_NOT_FOUND');

      const before = await repository.findClientContact(clientId, contactId);
      if (!before) throw createClientError('CLIENT_NOT_FOUND');

      const updated = await repository.updateClientContact(clientId, contactId, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.isPrimary === undefined ? {} : { isPrimary: input.isPrimary }),
        ...(input.status === undefined ? {} : { status: input.status })
      });
      if (!updated) throw createClientError('CLIENT_NOT_FOUND');

      await recordAudit(tx, {
        action: 'client.contact_updated',
        entityType: 'client_contact',
        entityId: updated.id,
        before: {
          clientId: before.clientId,
          name: before.name,
          title: before.title,
          email: before.email,
          phone: before.phone,
          isPrimary: before.isPrimary,
          status: before.status
        },
        after: {
          clientId: updated.clientId,
          name: updated.name,
          title: updated.title,
          email: updated.email,
          phone: updated.phone,
          isPrimary: updated.isPrimary,
          status: updated.status
        }
      });

      return updated;
    });
  }
}
