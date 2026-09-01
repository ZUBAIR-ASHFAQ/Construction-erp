import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { requireCompanyRepositoryScope } from '@construction-erp/tenant-scope';
import {
  REPORT_CODES,
  REPORT_DEFINITION_DEFAULTS,
  type ReportCode,
  type ReportFilters,
  type ReportOutputFormat
} from './reports.schema.js';

type RepositoryClient = DatabaseClient | TransactionClient;

/** Optional bounded catalog filters accepted by the Reports repository. */
export type ReportDefinitionListInput = Readonly<{
  search?: string | undefined;
  domain?: string | undefined;
}>;

/** Server-owned values needed to create one asynchronous report run. */
export type CreateReportRunRepositoryInput = Readonly<{
  reportCode: ReportCode;
  requestedBy: string;
  filters: ReportFilters;
  outputFormat: ReportOutputFormat;
}>;

/** User-owned values needed to save one validated report filter. */
export type CreateSavedReportFilterRepositoryInput = Readonly<{
  userId: string;
  reportCode: ReportCode;
  name: string;
  filters: ReportFilters;
}>;

/** Persistence-only repository for Final Module 20 report metadata, runs, and saved filters. */
export class ReportsRepository {
  /** Bind Reports persistence to Prisma or one active transaction. */
  constructor(private readonly db: RepositoryClient) {}

  /** List active approved report definitions visible to the current Company. */
  async listReportDefinitions(input: ReportDefinitionListInput = {}) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.reportDefinition.findMany({
      where: {
        code: { in: [...REPORT_CODES] },
        status: 'ACTIVE',
        AND: [
          { OR: [{ companyId: null }, { companyId: scope.companyId }] },
          ...(input.domain ? [{ domain: input.domain }] : []),
          ...(input.search
            ? [{
                OR: [
                  { code: { contains: input.search, mode: 'insensitive' as const } },
                  { name: { contains: input.search, mode: 'insensitive' as const } }
                ]
              }]
            : [])
        ]
      },
      select: {
        id: true,
        companyId: true,
        code: true,
        name: true,
        domain: true,
        requiredPermissions: true,
        filterSchemaJson: true,
        outputFormats: true,
        status: true
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: REPORT_CODES.length * 2
    });

    const defaults = REPORT_DEFINITION_DEFAULTS.filter((definition) =>
      (!input.domain || definition.domain === input.domain)
      && (!input.search || definition.code.toLowerCase().includes(input.search.toLowerCase()) || definition.name.toLowerCase().includes(input.search.toLowerCase()))
    );
    const definitions = new Map<string, (typeof rows)[number] | (typeof defaults)[number]>();
    for (const definition of defaults) definitions.set(definition.code, definition);
    for (const row of rows.filter((item) => item.companyId === null)) definitions.set(row.code, row);
    for (const row of rows.filter((item) => item.companyId === scope.companyId)) definitions.set(row.code, row);
    return [...definitions.values()].sort((left, right) => left.code.localeCompare(right.code));
  }

  /** Find one active approved report definition, preferring the current Company's override. */
  async findReportDefinitionByCode(reportCode: ReportCode) {
    const scope = requireCompanyRepositoryScope();
    const rows = await this.db.reportDefinition.findMany({
      where: {
        code: reportCode,
        status: 'ACTIVE',
        OR: [{ companyId: null }, { companyId: scope.companyId }]
      },
      select: {
        id: true,
        companyId: true,
        code: true,
        name: true,
        domain: true,
        requiredPermissions: true,
        filterSchemaJson: true,
        outputFormats: true,
        status: true
      },
      take: 2
    });
    return rows.find((row) => row.companyId === scope.companyId)
      ?? rows.find((row) => row.companyId === null)
      ?? REPORT_DEFINITION_DEFAULTS.find((definition) => definition.code === reportCode)
      ?? null;
  }

  /** Create one Company-owned export run in the initial queued state. */
  async createReportRun(input: CreateReportRunRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.reportRun.create({
      data: scope.createData({
        reportCode: input.reportCode,
        requestedBy: input.requestedBy,
        filtersJson: input.filters,
        outputFormat: input.outputFormat,
        status: 'QUEUED',
        fileId: null,
        startedAt: null,
        finishedAt: null,
        errorCode: null
      })
    });
  }

  /** Find one report run owned by the current Company and requesting user. */
  async findReportRunById(runId: string, requestedBy: string) {
    const scope = requireCompanyRepositoryScope();
    return this.db.reportRun.findFirst({
      where: scope.where({ id: runId, requestedBy }),
      select: {
        id: true,
        reportCode: true,
        requestedBy: true,
        filtersJson: true,
        outputFormat: true,
        status: true,
        fileId: true,
        startedAt: true,
        finishedAt: true,
        errorCode: true
      }
    });
  }

  /** Move one queued report run to running exactly once. */
  async markReportRunRunning(runId: string, requestedBy: string, startedAt: Date): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.reportRun.updateMany({
      where: scope.where({ id: runId, requestedBy, status: 'QUEUED' }),
      data: { status: 'RUNNING', startedAt, errorCode: null }
    });
    return updated.count === 1;
  }

  /** Complete one running report run with a same-Company Documents file reference. */
  async markReportRunCompleted(runId: string, requestedBy: string, fileId: string, finishedAt: Date): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.reportRun.updateMany({
      where: scope.where({ id: runId, requestedBy, status: 'RUNNING' }),
      data: { status: 'COMPLETED', fileId, finishedAt, errorCode: null }
    });
    return updated.count === 1;
  }

  /** Fail one queued or running report run without deleting its request history. */
  async markReportRunFailed(runId: string, requestedBy: string, errorCode: string, finishedAt: Date): Promise<boolean> {
    const scope = requireCompanyRepositoryScope();
    const updated = await this.db.reportRun.updateMany({
      where: scope.where({ id: runId, requestedBy, status: { in: ['QUEUED', 'RUNNING'] } }),
      data: { status: 'FAILED', finishedAt, errorCode }
    });
    return updated.count === 1;
  }

  /** List only the current user's saved filters inside the active Company. */
  async listSavedFilters(userId: string, reportCode?: ReportCode) {
    const scope = requireCompanyRepositoryScope();
    return this.db.savedReportFilter.findMany({
      where: scope.where({
        userId,
        ...(reportCode ? { reportCode } : {})
      }),
      select: {
        id: true,
        reportCode: true,
        name: true,
        filtersJson: true,
        createdAt: true
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]
    });
  }

  /** Save one validated filter under the authenticated user and Company. */
  async createSavedFilter(input: CreateSavedReportFilterRepositoryInput) {
    const scope = requireCompanyRepositoryScope();
    return this.db.savedReportFilter.create({
      data: scope.createData({
        userId: input.userId,
        reportCode: input.reportCode,
        name: input.name,
        filtersJson: input.filters
      }),
      select: {
        id: true,
        reportCode: true,
        name: true,
        filtersJson: true,
        createdAt: true
      }
    });
  }
}
