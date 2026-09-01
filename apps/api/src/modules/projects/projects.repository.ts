import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import { PROJECT_MAX_PAGE_SIZE } from './projects.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

export type ProjectRepositoryPageWindow = Readonly<{
  skip: number;
  take: number;
}>;

export type ListProjectsRepositoryInput = ProjectRepositoryPageWindow & Readonly<{
  search?: string;
  clientId?: string;
  projectModel?: string;
  status?: string;
  allowedProjectIds?: readonly string[] | null;
}>;

export type CreateProjectRepositoryInput = Readonly<{
  projectCode: string;
  name: string;
  clientId: string;
  projectModel: string;
  projectValue: string;
  costPlusPercent?: string | null;
  status: string;
  currency: string;
  startDate: Date;
  plannedEndDate: Date;
  projectManagerUserId?: string | null;
  location?: string | null;
}>;

export type UpdateProjectRepositoryInput = Readonly<{
  name?: string;
  clientId?: string;
  projectModel?: string;
  projectValue?: string;
  costPlusPercent?: string | null;
  currency?: string;
  startDate?: Date;
  plannedEndDate?: Date;
  projectManagerUserId?: string | null;
  location?: string | null;
}>;

export type CreateProjectStatusHistoryRepositoryInput = Readonly<{
  projectId: string;
  fromStatus?: string | null;
  toStatus: string;
  changedBy: string;
  reason?: string | null;
}>;

/** Reject invalid repository pagination before it reaches Prisma. */
function assertPageWindow(input: ProjectRepositoryPageWindow): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Repository skip must be a non-negative integer.');
  }

  if (!Number.isInteger(input.take) || input.take < 1 || input.take > PROJECT_MAX_PAGE_SIZE) {
    throw new RangeError(`Repository take must be between 1 and ${PROJECT_MAX_PAGE_SIZE}.`);
  }
}

/** Final Project Management database access for Project master and lifecycle history only. */
export class ProjectsRepository {
  /** Bind Project persistence to Prisma or to an active service transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List authorized company Projects with bounded reviewed filters and a matching total. */
  async listProjects(input: ListProjectsRepositoryInput) {
    assertPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const where = scope.where({
      ...(input.allowedProjectIds === null || input.allowedProjectIds === undefined
        ? {}
        : { id: { in: [...new Set(input.allowedProjectIds)] } }),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.projectModel ? { projectModel: input.projectModel } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(search
        ? {
            OR: [
              { projectCode: { contains: search, mode: 'insensitive' as const } },
              { name: { contains: search, mode: 'insensitive' as const } }
            ]
          }
        : {})
    });

    const [items, total] = await Promise.all([
      this.db.project.findMany({
        where,
        orderBy: [{ plannedEndDate: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.project.count({ where })
    ]);

    return { items, total };
  }

  /** Find one Project only inside the authenticated company. */
  async findProjectById(id: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id })
    });
  }

  /** Find one Project by its company-unique code. */
  async findProjectByCode(projectCode: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ projectCode })
    });
  }

  /** Find one Client only inside the authenticated company for Project relationship validation. */
  async findClientById(clientId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.client.findFirst({
      where: scope.where({ id: clientId })
    });
  }

  /** Find one active Project Manager user only inside the authenticated company. */
  async findProjectManagerById(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.user.findFirst({
      where: scope.where({ id: userId, status: 'ACTIVE' })
    });
  }

  /** Create one DRAFT company-owned Project after service-level relationship validation. */
  async createProject(input: CreateProjectRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.project.create({
      data: scope.createData({
        projectCode: input.projectCode,
        name: input.name,
        clientId: input.clientId,
        projectModel: input.projectModel,
        projectValue: input.projectValue,
        costPlusPercent: input.costPlusPercent ?? null,
        status: input.status,
        currency: input.currency,
        startDate: input.startDate,
        plannedEndDate: input.plannedEndDate,
        projectManagerUserId: input.projectManagerUserId ?? null,
        location: input.location ?? null
      })
    });
  }

  /** Check whether Module 7 has frozen the Project Stage commercial baseline. */
  async hasFrozenStageBaseline(projectId: string): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const baseline = await this.db.stageProgressBaseline.findFirst({
      where: { projectId, status: 'FROZEN', project: { companyId: scope.companyId } },
      select: { id: true }
    });
    return baseline !== null;
  }

  /** Return true only when the current Project has no actionable operational or financial close blockers. */
  async isProjectReadyToClose(projectId: string): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ ready: boolean }>>`
      SELECT NOT (
        EXISTS (
          SELECT 1
          FROM project_team_assignments assignment
          WHERE assignment.company_id = ${scope.companyId}::uuid
            AND assignment.project_id = ${projectId}::uuid
            AND assignment.status = 'ACTIVE'
        )
        OR EXISTS (
          SELECT 1
          FROM equipment_assignments assignment
          JOIN equipment item ON item.id = assignment.equipment_id
          WHERE item.company_id = ${scope.companyId}::uuid
            AND assignment.project_id = ${projectId}::uuid
            AND assignment.status = 'ACTIVE'
        )
        OR EXISTS (
          SELECT 1
          FROM purchase_orders po
          WHERE po.company_id = ${scope.companyId}::uuid
            AND po.project_id = ${projectId}::uuid
            AND (
              po.status = 'DRAFT'
              OR (
                po.status = 'ISSUED'
                AND EXISTS (
                  SELECT 1
                  FROM purchase_order_items line
                  WHERE line.purchase_order_id = po.id
                    AND line.received_qty < line.quantity
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM supplier_invoices invoice
          WHERE invoice.company_id = ${scope.companyId}::uuid
            AND invoice.project_id = ${projectId}::uuid
            AND invoice.status = 'DRAFT'
        )
        OR EXISTS (
          SELECT 1
          FROM progress_claims claim
          WHERE claim.company_id = ${scope.companyId}::uuid
            AND claim.project_id = ${projectId}::uuid
            AND (
              claim.status = 'DRAFT'
              OR (
                claim.status = 'FINALIZED'
                AND NOT EXISTS (
                  SELECT 1
                  FROM client_invoices invoice
                  WHERE invoice.claim_id = claim.id
                    AND invoice.company_id = ${scope.companyId}::uuid
                    AND invoice.project_id = ${projectId}::uuid
                )
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM client_invoices invoice
          WHERE invoice.company_id = ${scope.companyId}::uuid
            AND invoice.project_id = ${projectId}::uuid
            AND invoice.status IN ('ISSUED', 'POSTED')
            AND invoice.total_receivable > COALESCE((
              SELECT SUM(allocation.amount)
              FROM client_receipt_allocations allocation
              JOIN client_receipts receipt ON receipt.id = allocation.receipt_id
              WHERE allocation.client_invoice_id = invoice.id
                AND receipt.company_id = ${scope.companyId}::uuid
                AND receipt.status = 'POSTED'
            ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM client_receipts receipt
          WHERE receipt.company_id = ${scope.companyId}::uuid
            AND receipt.project_id = ${projectId}::uuid
            AND receipt.status = 'POSTED'
            AND receipt.amount > COALESCE((
              SELECT SUM(allocation.amount)
              FROM client_receipt_allocations allocation
              WHERE allocation.receipt_id = receipt.id
            ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM supplier_invoices invoice
          WHERE invoice.company_id = ${scope.companyId}::uuid
            AND invoice.project_id = ${projectId}::uuid
            AND invoice.status = 'POSTED'
            AND invoice.total_amount > COALESCE((
              SELECT SUM(allocation.amount)
              FROM supplier_payment_allocations allocation
              JOIN supplier_payments payment ON payment.id = allocation.supplier_payment_id
              WHERE allocation.supplier_invoice_id = invoice.id
                AND payment.company_id = ${scope.companyId}::uuid
                AND payment.status = 'POSTED'
            ), 0)
        )
        OR EXISTS (
          SELECT 1
          FROM supplier_payments payment
          WHERE payment.company_id = ${scope.companyId}::uuid
            AND payment.project_id = ${projectId}::uuid
            AND payment.status = 'POSTED'
            AND payment.amount > COALESCE((
              SELECT SUM(allocation.amount)
              FROM supplier_payment_allocations allocation
              WHERE allocation.supplier_payment_id = payment.id
            ), 0)
        )
      ) AS ready
    `;

    return rows[0]?.ready === true;
  }

  /** Update editable Project-master fields without changing code, company ownership or lifecycle status. */
  async updateProject(projectId: string, input: UpdateProjectRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.project.updateMany({
      where: scope.where({ id: projectId }),
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.clientId === undefined ? {} : { clientId: input.clientId }),
        ...(input.projectModel === undefined ? {} : { projectModel: input.projectModel }),
        ...(input.projectValue === undefined ? {} : { projectValue: input.projectValue }),
        ...(input.costPlusPercent === undefined ? {} : { costPlusPercent: input.costPlusPercent }),
        ...(input.currency === undefined ? {} : { currency: input.currency }),
        ...(input.startDate === undefined ? {} : { startDate: input.startDate }),
        ...(input.plannedEndDate === undefined ? {} : { plannedEndDate: input.plannedEndDate }),
        ...(input.projectManagerUserId === undefined ? {} : { projectManagerUserId: input.projectManagerUserId }),
        ...(input.location === undefined ? {} : { location: input.location })
      }
    });

    if (updated.count === 0) return null;
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }

  /** Lock one company-owned Project before lifecycle-sensitive service decisions. */
  async lockProjectForWrite(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT id, status
      FROM projects
      WHERE id = ${projectId}::uuid
        AND company_id = ${scope.companyId}::uuid
      FOR UPDATE
    `;

    return rows[0] ?? null;
  }

  /** Change Project status only when company ownership and expected lifecycle state still match. */
  async transitionProjectStatus(projectId: string, expectedStatus: string, targetStatus: string) {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.project.updateMany({
      where: scope.where({ id: projectId, status: expectedStatus }),
      data: { status: targetStatus }
    });

    if (updated.count === 0) return null;
    return this.db.project.findFirst({ where: scope.where({ id: projectId }) });
  }


  /** List append-only lifecycle history only through a company-owned Project. */
  async listProjectStatusHistory(projectId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.projectStatusHistory.findMany({
      where: {
        projectId,
        project: { companyId: scope.companyId }
      },
      orderBy: [{ changedAt: 'asc' }, { id: 'asc' }]
    });
  }

  /** Append lifecycle history only after proving its parent Project belongs to the authenticated company. */
  async createProjectStatusHistory(input: CreateProjectStatusHistoryRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const project = await this.db.project.findFirst({
      where: scope.where({ id: input.projectId }),
      select: { id: true }
    });

    if (!project) return null;

    return this.db.projectStatusHistory.create({
      data: {
        projectId: input.projectId,
        fromStatus: input.fromStatus ?? null,
        toStatus: input.toStatus,
        changedBy: input.changedBy,
        reason: input.reason ?? null
      }
    });
  }
}
