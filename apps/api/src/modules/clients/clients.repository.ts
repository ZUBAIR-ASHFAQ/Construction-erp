import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { CLIENTS_MAX_PAGE_SIZE } from './clients.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type RepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListClientsRepositoryInput = RepositoryPageWindow & Readonly<{
  search?: string;
  status?: string;
}>;

export type CreateClientRepositoryInput = Readonly<{
  code: string;
  legalName: string;
  displayName: string;
  taxNo?: string | null;
  billingAddress: string;
  status: string;
  creditTermsDays?: number | null;
}>;

export type UpdateClientRepositoryInput = Readonly<{
  code?: string;
  legalName?: string;
  displayName?: string;
  taxNo?: string | null;
  billingAddress?: string;
  status?: string;
  creditTermsDays?: number | null;
}>;

export type CreateClientContactRepositoryInput = Readonly<{
  clientId: string;
  name: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary: boolean;
  status: string;
}>;

export type UpdateClientContactRepositoryInput = Readonly<{
  name?: string;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  isPrimary?: boolean;
  status?: string;
}>;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: RepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }

  if (!Number.isInteger(input.take) || input.take < 1 || input.take > CLIENTS_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${CLIENTS_MAX_PAGE_SIZE}.`);
  }
}

/** Client Management database access with mandatory company scoping. */
export class ClientsRepository {
  /** Bind Client Management persistence to Prisma or to an active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List company Clients with bounded search, status filtering and a matching total. */
  async listClients(input: ListClientsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' as const } },
              { legalName: { contains: search, mode: 'insensitive' as const } },
              { displayName: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.client.findMany({
        where,
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.client.count({ where })
    ]);

    return { items, total };
  }

  /** Find one Client only inside the authenticated Company. */
  async findClientById(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.client.findFirst({
      where: scope.where({ id })
    });
  }

  /** Find one Client code only inside the authenticated Company. */
  async findClientByCode(code: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.client.findFirst({
      where: scope.where({ code })
    });
  }

  /** Create one Company-owned Client after service validation. */
  async createClient(input: CreateClientRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.client.create({
      data: scope.createData({
        code: input.code,
        legalName: input.legalName,
        displayName: input.displayName,
        taxNo: input.taxNo ?? null,
        billingAddress: input.billingAddress,
        status: input.status,
        creditTermsDays: input.creditTermsDays ?? null
      })
    });
  }

  /** Update one Company-owned Client without allowing ownership changes. */
  async updateClient(id: string, input: UpdateClientRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.client.updateMany({
      where: scope.where({ id }),
      data: {
        ...(input.code === undefined ? {} : { code: input.code }),
        ...(input.legalName === undefined ? {} : { legalName: input.legalName }),
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        ...(input.taxNo === undefined ? {} : { taxNo: input.taxNo }),
        ...(input.billingAddress === undefined ? {} : { billingAddress: input.billingAddress }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.creditTermsDays === undefined ? {} : { creditTermsDays: input.creditTermsDays })
      }
    });

    if (updated.count === 0) return null;
    return this.db.client.findFirst({ where: scope.where({ id }) });
  }

  /** List Contacts belonging to one Company-owned Client. */
  async listClientContacts(clientId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientContact.findMany({
      where: scope.where({ clientId }),
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }, { id: 'asc' }]
    });
  }

  /** Find one Contact under one Client inside the authenticated Company. */
  async findClientContact(clientId: string, contactId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.clientContact.findFirst({
      where: scope.where({ id: contactId, clientId })
    });
  }

  /** Create one Contact only when its parent Client belongs to the authenticated Company. */
  async createClientContact(input: CreateClientContactRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const client = await this.db.client.findFirst({
      where: scope.where({ id: input.clientId }),
      select: { id: true }
    });

    if (!client) return null;

    return this.db.clientContact.create({
      data: scope.createData({
        clientId: input.clientId,
        name: input.name,
        title: input.title ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        isPrimary: input.isPrimary,
        status: input.status
      })
    });
  }

  /** Update one Contact while preserving its Client and Company ownership. */
  async updateClientContact(clientId: string, contactId: string, input: UpdateClientContactRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.clientContact.updateMany({
      where: scope.where({ id: contactId, clientId }),
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.title === undefined ? {} : { title: input.title }),
        ...(input.email === undefined ? {} : { email: input.email }),
        ...(input.phone === undefined ? {} : { phone: input.phone }),
        ...(input.isPrimary === undefined ? {} : { isPrimary: input.isPrimary }),
        ...(input.status === undefined ? {} : { status: input.status })
      }
    });

    if (updated.count === 0) return null;
    return this.db.clientContact.findFirst({ where: scope.where({ id: contactId, clientId }) });
  }

  /** Read visible Project counts for one Client without crossing the trusted Project scope. */
  async getClientProjectSummary(clientId: string, allowedProjectIds: readonly string[] | null) {
    const scope = requireCompanyRepositoryScope();
    const projectFilter = allowedProjectIds === null
      ? {}
      : { id: { in: [...new Set(allowedProjectIds)] } };
    const [totalProjects, activeProjects] = await Promise.all([
      this.db.project.count({ where: scope.where({ clientId, ...projectFilter }) }),
      this.db.project.count({ where: scope.where({ clientId, status: 'ACTIVE', ...projectFilter }) })
    ]);

    return { totalProjects, activeProjects };
  }
}
