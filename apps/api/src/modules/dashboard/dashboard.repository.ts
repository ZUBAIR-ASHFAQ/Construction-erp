import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import {
  DASHBOARD_MAX_PAGE_SIZE,
  type DashboardPreferenceFilters,
  type DashboardWidgetCode
} from './dashboard.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

/** Trusted Project visibility passed from authenticated request context. */
export type DashboardRepositoryVisibility = Readonly<{
  allowedProjectIds: readonly string[] | null;
}>;

/** Bounded Project list inputs accepted by the Dashboard repository. */
export type DashboardProjectListRepositoryInput = DashboardRepositoryVisibility & Readonly<{
  skip: number;
  take: number;
  search?: string | undefined;
  status?: string | undefined;
}>;


/** JSON presentation settings owned by one Dashboard preference row. */
export type DashboardPreferenceLayoutJson = Readonly<{
  widgetCodes: readonly DashboardWidgetCode[];
  defaultFilters?: DashboardPreferenceFilters;
}>;

/** Server-owned values used to create or replace one user's Dashboard preferences. */
export type DashboardPreferenceRepositoryInput = Readonly<{
  userId: string;
  layoutJson: DashboardPreferenceLayoutJson;
  defaultProjectId: string | null;
}>;

/** Reject an invalid Dashboard Project page window before it reaches Prisma. */
function assertProjectPageWindow(input: Pick<DashboardProjectListRepositoryInput, 'skip' | 'take'>): void {
  if (!Number.isInteger(input.skip) || input.skip < 0) {
    throw new RangeError('Dashboard repository skip must be a non-negative integer.');
  }

  if (!Number.isInteger(input.take) || input.take < 1 || input.take > DASHBOARD_MAX_PAGE_SIZE) {
    throw new RangeError(`Dashboard repository take must be between 1 and ${DASHBOARD_MAX_PAGE_SIZE}.`);
  }
}

/** Persistence boundary for Final Module 1 Dashboard metadata and user preferences. */
export class DashboardRepository {
  /** Bind Dashboard persistence work to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List only Projects visible to the authenticated Company and Project scope. */
  async listProjects(input: DashboardProjectListRepositoryInput) {
    assertProjectPageWindow(input);
    const scope = requireCompanyRepositoryScope();
    const search = input.search?.trim();
    const allowedProjectIds = input.allowedProjectIds === null
      ? null
      : [...new Set(input.allowedProjectIds)];
    const where = scope.where({
      ...(allowedProjectIds === null ? {} : { id: { in: allowedProjectIds } }),
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
        select: {
          id: true,
          projectCode: true,
          name: true,
          clientId: true,
          status: true,
          currency: true,
          startDate: true,
          plannedEndDate: true,
          client: { select: { displayName: true } }
        },
        orderBy: [{ plannedEndDate: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        skip: input.skip,
        take: input.take
      }),
      this.db.project.count({ where })
    ]);

    return { items, total };
  }

  /** Find one Project only when it belongs to the Company and authenticated Project scope. */
  async findProjectById(projectId: string, visibility: DashboardRepositoryVisibility) {
    if (visibility.allowedProjectIds !== null && !visibility.allowedProjectIds.includes(projectId)) {
      return null;
    }

    const scope = requireCompanyRepositoryScope();
    return this.db.project.findFirst({
      where: scope.where({ id: projectId }),
      select: {
        id: true,
        projectCode: true,
        name: true,
        clientId: true,
        status: true,
        currency: true,
        startDate: true,
        plannedEndDate: true,
        client: { select: { displayName: true } }
      }
    });
  }

  /** Read the authenticated user's Dashboard preference row inside the active Company. */
  async findPreference(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.dashboardPreference.findFirst({
      where: scope.where({ userId }),
      select: {
        id: true,
        layoutJson: true,
        defaultProjectId: true,
        updatedAt: true
      }
    });
  }


  /** Create or replace one authenticated user's Dashboard presentation preferences inside the active Company. */
  async upsertPreference(input: DashboardPreferenceRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    const layoutJson = {
      widgetCodes: [...input.layoutJson.widgetCodes],
      ...(input.layoutJson.defaultFilters ? { defaultFilters: { ...input.layoutJson.defaultFilters } } : {})
    };
    return this.db.dashboardPreference.upsert({
      where: {
        companyId_userId: {
          companyId: scope.companyId,
          userId: input.userId
        }
      },
      create: scope.createData({
        userId: input.userId,
        layoutJson,
        defaultProjectId: input.defaultProjectId
      }),
      update: {
        layoutJson,
        defaultProjectId: input.defaultProjectId
      },
      select: {
        id: true,
        layoutJson: true,
        defaultProjectId: true,
        updatedAt: true
      }
    });
  }

  /** List a bounded set of saved Dashboard filters owned by the authenticated Company user. */
  async listSavedFilters(userId: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.dashboardSavedFilter.findMany({
      where: scope.where({ userId }),
      select: {
        id: true,
        name: true,
        filterJson: true,
        createdAt: true
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: DASHBOARD_MAX_PAGE_SIZE
    });
  }
}
