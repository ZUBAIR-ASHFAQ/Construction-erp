import { recordAudit } from '@construction-erp/audit';
import type { DatabaseClient, TransactionClient } from '@construction-erp/database';
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from '@construction-erp/errors';
import { executeIdempotentCommand } from '@construction-erp/idempotency';
import { allocateCompanyNumber } from '@construction-erp/numbering';
import { recordOutboxEvent } from '@construction-erp/outbox';
import { requireRequestSecurityContext } from '@construction-erp/request-context';
import { AdministrationRepository } from '../administration/administration.repository.js';
import { FinanceRepository } from '../finance/finance.repository.js';
import { FinanceService } from '../finance/finance.service.js';
import { ClientBillingRepository, type ClientBillingVisibility } from './client-billing.repository.js';
import {
  createClientBillingError,
  type ClientBillingPermissionCode,
  type CreateClaimBody,
  type CreateInvoiceBody,
  type ListClaimsQuery,
  type ListInvoicesQuery,
  type UpdateClaimBody,
  type UpdateProjectBillingSettingsBody
} from './client-billing.schema.js';

const ROLE_ASSIGNMENT_ACTIVE = 'ACTIVE';
const ROLE_ACTIVE = 'ACTIVE';
const DEFAULT_PAGE_SIZE = 25;
const CLAIM_SEQUENCE_KEY = 'progress-claim';
const INVOICE_SEQUENCE_KEY = 'client-invoice';
const CLIENT_RECEIVABLE_ACCOUNT_CODE = 'CLIENT-RECEIVABLE';
const CLIENT_REVENUE_ACCOUNT_CODE = 'CLIENT-REVENUE';
const ACTIVE = 'ACTIVE';
const ZERO_MONEY = '0.00';
const MAX_MINOR_UNITS = 999_999_999_999_999_999n;

type DecimalLike = string | Readonly<{ toString(): string }>;

/** Parse one validated API date without local-time conversion. */
function inputDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/** Serialize one database date as YYYY-MM-DD. */
function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Convert exact money into integer minor units. */
function moneyToMinorUnits(value: DecimalLike): bigint {
  const text = value.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  return (BigInt(whole) * 100n) + BigInt(`${fraction}00`.slice(0, 2));
}

/** Convert integer minor units into exact two-decimal money. */
function minorUnitsToMoney(value: bigint): string {
  if (value < 0n || value > MAX_MINOR_UNITS) throw new ValidationError({ message: 'Billing amount is outside the supported range.' });
  return `${value / 100n}.${(value % 100n).toString().padStart(2, '0')}`;
}

/** Calculate a non-negative percentage amount using four-decimal percentage precision. */
function percentageOf(amount: bigint, percent: DecimalLike | null): bigint {
  if (percent === null) return 0n;
  const text = percent.toString();
  const [whole = '0', fraction = ''] = text.split('.');
  const scaledPercent = (BigInt(whole) * 10_000n) + BigInt(`${fraction}0000`.slice(0, 4));
  return ((amount * scaledPercent) + 500_000n) / 1_000_000n;
}

/** Return the unique Stage IDs carried by one claim line set. */
function claimStageIds(lines: readonly Readonly<{ stageId?: string | null | undefined }>[]): string[] {
  return [...new Set(lines.map((line) => line.stageId).filter((stageId): stageId is string => Boolean(stageId)))];
}

/** Return the stable Finance source key for one issued Client Invoice. */
function clientInvoiceFinanceSourceKey(invoiceId: string): string {
  return `client_invoice:${invoiceId}`;
}

/** Allocate one certified net amount across finalized claim lines without losing Stage attribution. */
function allocateCertifiedInvoiceLines(
  lines: readonly Readonly<{ stageId?: string | null; description: string; amount: DecimalLike }>[],
  targetAmount: bigint,
  revenueAccountId: string
) {
  const weighted = lines.map((line, index) => {
    const gross = moneyToMinorUnits(line.amount);
    return { line, index, gross, allocated: 0n, remainder: 0n };
  });
  const grossTotal = weighted.reduce((sum, item) => sum + item.gross, 0n);
  if (grossTotal <= 0n || targetAmount <= 0n || targetAmount > grossTotal) throw createClientBillingError('INVALID_BILLING_BASIS');

  let allocatedTotal = 0n;
  for (const item of weighted) {
    const numerator = item.gross * targetAmount;
    item.allocated = numerator / grossTotal;
    item.remainder = numerator % grossTotal;
    allocatedTotal += item.allocated;
  }

  let centsLeft = targetAmount - allocatedTotal;
  const remainderOrder = [...weighted].sort((left, right) => {
    if (left.remainder === right.remainder) return left.index - right.index;
    return left.remainder > right.remainder ? -1 : 1;
  });
  for (const item of remainderOrder) {
    if (centsLeft === 0n) break;
    if (item.allocated >= item.gross) continue;
    item.allocated += 1n;
    centsLeft -= 1n;
  }
  if (centsLeft !== 0n) throw createClientBillingError('INVALID_BILLING_BASIS');

  return weighted
    .filter((item) => item.allocated > 0n)
    .map((item) => ({
      stageId: item.line.stageId ?? null,
      description: item.line.description,
      amount: minorUnitsToMoney(item.allocated),
      revenueAccountId
    }));
}


/** Sum claim money by Stage so one Stage cannot exceed its server-derived billing basis through duplicate lines. */
function claimedMinorUnitsByStage(lines: readonly Readonly<{ stageId?: string | null; amount: DecimalLike }>[]): Map<string, bigint> {
  const totals = new Map<string, bigint>();
  for (const line of lines) {
    if (!line.stageId) continue;
    totals.set(line.stageId, (totals.get(line.stageId) ?? 0n) + moneyToMinorUnits(line.amount));
  }
  return totals;
}

/** Require Client Billing settings to follow the Project-owned commercial model and Cost + Percentage rate. */
function requireBillingMethod(project: Readonly<{ projectModel: string; costPlusPercent: DecimalLike | null }>, settings: Readonly<{ billingMethod: string }> | null) {
  const billingMethod = settings?.billingMethod ?? project.projectModel;
  if ((billingMethod !== 'FIXED_PRICE' && billingMethod !== 'COST_PLUS_PERCENTAGE') || billingMethod !== project.projectModel) {
    throw createClientBillingError('INVALID_BILLING_BASIS');
  }
  if (billingMethod === 'COST_PLUS_PERCENTAGE') {
    const percent = project.costPlusPercent === null ? Number.NaN : Number(project.costPlusPercent.toString());
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw createClientBillingError('INVALID_BILLING_BASIS');
  }
  return billingMethod;
}

/** Build deterministic pagination values for one list request. */
function pageWindow(query: { page?: number | undefined; pageSize?: number | undefined }) {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Reject normal billing writes when the project lifecycle is not writable. */
function requireWritableProject(status: string): void {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SUSPENDED' || normalized === 'CLOSED') {
    throw new ValidationError({ message: 'Suspended or closed projects do not accept Client Billing writes.' });
  }
}

/** Reject invoice dates that would create a negative payment window. */
function requireInvoiceDateOrder(invoiceDate: Date, dueDate: Date): void {
  if (dueDate.getTime() < invoiceDate.getTime()) {
    throw new ValidationError({ message: 'Invoice due date cannot be earlier than invoice date.' });
  }
}

/** Convert persisted billing settings into a stable API response. */
function settingsResponse(settings: any, project: any) {
  return {
    projectId: project.id,
    billingMethod: settings?.billingMethod ?? project.projectModel,
    retentionPercent: settings?.retentionPercent?.toString() ?? null,
    billingCycle: settings?.billingCycle ?? null,
    advanceRecoveryEnabled: settings?.advanceRecoveryEnabled ?? false,
    status: settings?.status ?? 'ACTIVE'
  };
}

/** Convert one persisted claim line into the API response. */
function claimLineResponse(line: any) {
  return {
    id: line.id,
    stageId: line.stageId,
    description: line.description,
    billingProgressPercent: line.billingProgressPercent?.toString() ?? null,
    amount: minorUnitsToMoney(moneyToMinorUnits(line.amount))
  };
}

/** Convert one persisted invoice into the API response. */
function invoiceResponse(invoice: any) {
  return {
    id: invoice.id,
    projectId: invoice.projectId,
    clientId: invoice.clientId,
    claimId: invoice.claimId,
    invoiceNo: invoice.invoiceNo,
    invoiceDate: dateOnly(invoice.invoiceDate),
    dueDate: invoice.dueDate ? dateOnly(invoice.dueDate) : null,
    status: invoice.status,
    subtotal: minorUnitsToMoney(moneyToMinorUnits(invoice.subtotal)),
    taxAmount: minorUnitsToMoney(moneyToMinorUnits(invoice.taxAmount)),
    totalAmount: minorUnitsToMoney(moneyToMinorUnits(invoice.totalAmount)),
    lines: (invoice.lines ?? []).map((line: any) => ({
      id: line.id,
      stageId: line.stageId,
      description: line.description,
      amount: minorUnitsToMoney(moneyToMinorUnits(line.amount))
    }))
  };
}

/** Convert one persisted progress claim into the API response. */
function claimResponse(claim: any) {
  return {
    id: claim.id,
    projectId: claim.projectId,
    clientId: claim.clientId,
    claimNo: claim.claimNo,
    periodEnd: dateOnly(claim.periodEnd),
    status: claim.status,
    grossValue: minorUnitsToMoney(moneyToMinorUnits(claim.grossValue)),
    deductions: minorUnitsToMoney(moneyToMinorUnits(claim.deductions)),
    retention: minorUnitsToMoney(moneyToMinorUnits(claim.retention)),
    netCertified: minorUnitsToMoney(moneyToMinorUnits(claim.netCertified)),
    lines: (claim.lines ?? []).map(claimLineResponse),
    invoice: claim.invoice ? invoiceResponse(claim.invoice) : null
  };
}

export class ClientBillingService {
  /** Bind Client Billing business logic to the database. */
  constructor(private readonly db: DatabaseClient) {}

  /** Check one company-level permission from persisted role assignments. */
  private async hasCompanyPermission(repository: AdministrationRepository, permission: ClientBillingPermissionCode, asOf: Date) {
    const security = requireRequestSecurityContext();
    const permissions = await repository.findEffectivePermissionCodes({
      userId: security.actorUserId,
      asOf,
      assignmentStatuses: [ROLE_ASSIGNMENT_ACTIVE],
      roleStatuses: [ROLE_ACTIVE]
    });
    return permissions.includes(permission);
  }

  /** Resolve the projects visible for one Client Billing permission. */
  private async resolveVisibility(repository: AdministrationRepository, permission: ClientBillingPermissionCode, asOf: Date): Promise<ClientBillingVisibility> {
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

  /** Require one project-specific permission and preserve not-found behavior for unauthorized projects. */
  private async requireProjectPermission(repository: AdministrationRepository, projectId: string, permission: ClientBillingPermissionCode, asOf: Date): Promise<void> {
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

  /** Reject any non-null claim Stage that is not owned by the selected Project and Company. */
  private async requireClaimStages(
    repository: ClientBillingRepository,
    projectId: string,
    lines: readonly Readonly<{ stageId?: string | null | undefined }>[],
    visibility: ClientBillingVisibility
  ): Promise<void> {
    const stageIds = claimStageIds(lines);
    if (stageIds.length === 0) return;
    const stages = await repository.findProjectStagesByIds(projectId, stageIds, visibility);
    if (stages.length !== stageIds.length) throw createClientBillingError('BILLING_STAGE_INVALID');
  }

  /** Enforce the cumulative Cost + Percentage ceiling from posted Project/Stage actual costs. */
  private async requireCostPlusBasis(
    repository: ClientBillingRepository,
    project: Readonly<{ id: string; costPlusPercent: DecimalLike | null }>,
    periodEnd: Date,
    lines: readonly Readonly<{ stageId?: string | null; amount: DecimalLike }>[],
    visibility: ClientBillingVisibility
  ): Promise<void> {
    if (project.costPlusPercent === null) throw createClientBillingError('INVALID_BILLING_BASIS');
    const gross = lines.reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
    const projectCost = moneyToMinorUnits((await repository.sumProjectCostActuals(project.id, visibility, periodEnd)) ?? '0');
    const priorGross = moneyToMinorUnits((await repository.sumFinalizedClaimGross(project.id, visibility)) ?? '0');
    const projectLimit = projectCost + percentageOf(projectCost, project.costPlusPercent);
    if (priorGross + gross > projectLimit) throw createClientBillingError('INVALID_BILLING_BASIS');

    const stageIds = claimStageIds(lines);
    if (stageIds.length === 0) return;
    const [stageCosts, priorStageClaims] = await Promise.all([
      repository.sumStageCostActuals(project.id, stageIds, visibility, periodEnd),
      repository.sumFinalizedClaimLinesByStage(project.id, stageIds, visibility)
    ]);
    const costByStage = new Map(stageCosts.map((row) => [row.stageId, moneyToMinorUnits(row._sum.amount ?? '0')]));
    const priorByStage = new Map(priorStageClaims.map((row) => [row.stageId, moneyToMinorUnits(row._sum.amount ?? '0')]));
    for (const [stageId, claimed] of claimedMinorUnitsByStage(lines)) {
      const cost = costByStage.get(stageId) ?? 0n;
      const prior = priorByStage.get(stageId) ?? 0n;
      const limit = cost + percentageOf(cost, project.costPlusPercent);
      if (prior + claimed > limit) throw createClientBillingError('INVALID_BILLING_BASIS');
    }
  }

  /** Read the Project-level issued/posted invoice summary for permission-safe Project detail. */
  async getProjectSummary(projectId: string) {
    await this.requireProjectPermission(
      new AdministrationRepository(this.db),
      projectId,
      'client_billing.read',
      new Date()
    );
    const repository = new ClientBillingRepository(this.db);
    const summary = await repository.readProjectBillingSummary(projectId, { allowedProjectIds: [projectId] });
    if (!summary) throw new NotFoundError();
    return {
      invoiceCount: summary.invoiceCount,
      billedAmount: summary.billedAmount?.toString() ?? ZERO_MONEY
    };
  }

  /** Read billing settings while deriving defaults from the Project commercial model. */
  async getSettings(projectId: string) {
    const now = new Date();
    const users = new AdministrationRepository(this.db);
    await this.requireProjectPermission(users, projectId, 'client_billing.read', now);
    const visibility: ClientBillingVisibility = { allowedProjectIds: [projectId] };
    const repository = new ClientBillingRepository(this.db);
    const project = await repository.findProject(projectId, visibility);
    if (!project) throw new NotFoundError();
    return settingsResponse(await repository.findSettings(projectId, visibility), project);
  }

  /** Save one project's Client Billing settings exactly once. */
  async updateSettings(projectId: string, input: UpdateProjectBillingSettingsBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-billing.settings-update', idempotencyKey, fingerprintInput: { projectId, input }
    }, async (tx) => this.updateSettingsOnce(tx, projectId, input));
    return result.response.body;
  }

  /** Validate Project ownership before creating or replacing settings. */
  private async updateSettingsOnce(tx: TransactionClient, projectId: string, input: UpdateProjectBillingSettingsBody) {
    const users = new AdministrationRepository(tx);
    await this.requireProjectPermission(users, projectId, 'client_billing.settings.manage', new Date());
    const visibility: ClientBillingVisibility = { allowedProjectIds: [projectId] };
    const repository = new ClientBillingRepository(tx);
    const project = await repository.findProject(projectId, visibility);
    if (!project) throw new NotFoundError();
    requireWritableProject(project.status);
    if (input.billingMethod !== project.projectModel) throw createClientBillingError('INVALID_BILLING_BASIS');
    requireBillingMethod(project, { billingMethod: input.billingMethod });
    const before = settingsResponse(await repository.findSettings(projectId, visibility), project);
    const saved = await repository.upsertSettings(projectId, {
      billingMethod: input.billingMethod,
      retentionPercent: input.retentionPercent ?? null,
      billingCycle: input.billingCycle ?? null,
      advanceRecoveryEnabled: input.advanceRecoveryEnabled,
      status: input.status
    });
    const after = settingsResponse(saved, project);
    await recordAudit(tx, { action: 'billing.settings_updated', entityType: 'project_billing_settings', entityId: saved.id, before, after });
    await recordOutboxEvent(tx, { eventType: 'billing.settings_updated', resourceType: 'project', resourceId: projectId, payload: after });
    return { statusCode: 200, body: after };
  }

  /** List permission-visible progress claims. */
  async listClaims(query: ListClaimsQuery) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'client_billing.read', new Date());
    if (query.projectId && visibility.allowedProjectIds !== null && !visibility.allowedProjectIds.includes(query.projectId)) throw new AuthorizationError();
    const page = pageWindow(query);
    const result = await new ClientBillingRepository(this.db).listClaims({ skip: page.skip, take: page.take, projectId: query.projectId, status: query.status }, visibility);
    return { items: result.items.map(claimResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Create one draft project billing claim exactly once. */
  async createClaim(input: CreateClaimBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-billing.claim-create', idempotencyKey, fingerprintInput: input
    }, async (tx) => this.createClaimOnce(tx, input));
    return result.response.body;
  }

  /** Derive Client ownership from Project and create one draft claim. */
  private async createClaimOnce(tx: TransactionClient, input: CreateClaimBody) {
    const users = new AdministrationRepository(tx);
    await this.requireProjectPermission(users, input.projectId, 'claims.create', new Date());
    const visibility: ClientBillingVisibility = { allowedProjectIds: [input.projectId] };
    const repository = new ClientBillingRepository(tx);
    const project = await repository.findProject(input.projectId, visibility);
    if (!project) throw new NotFoundError();
    requireWritableProject(project.status);
    const settings = await repository.findSettings(input.projectId, visibility);
    if (settings?.status === 'INACTIVE') throw createClientBillingError('INVALID_BILLING_BASIS');
    requireBillingMethod(project, settings);
    await this.requireClaimStages(repository, project.id, input.lines, visibility);
    const number = await allocateCompanyNumber(tx, { sequenceKey: CLAIM_SEQUENCE_KEY });
    const security = requireRequestSecurityContext();
    const claim = await repository.createClaim({
      projectId: project.id,
      clientId: project.clientId,
      claimNo: number.formatted,
      periodEnd: inputDate(input.periodEnd),
      createdBy: security.actorUserId,
      lines: input.lines
    });
    const response = claimResponse(claim);
    await recordAudit(tx, { action: 'billing.claim_created', entityType: 'progress_claim', entityId: claim.id, after: response });
    await recordOutboxEvent(tx, { eventType: 'billing.claim_created', resourceType: 'progress_claim', resourceId: claim.id, payload: { claimId: claim.id, projectId: project.id, clientId: project.clientId } });
    return { statusCode: 201, body: response };
  }

  /** Edit one draft claim exactly once. */
  async updateClaim(claimId: string, input: UpdateClaimBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-billing.claim-update', idempotencyKey, fingerprintInput: { claimId, input }
    }, async (tx) => this.updateClaimOnce(tx, claimId, input));
    return result.response.body;
  }

  /** Lock one draft claim before replacing editable fields. */
  private async updateClaimOnce(tx: TransactionClient, claimId: string, input: UpdateClaimBody) {
    const broadVisibility = await this.resolveVisibility(new AdministrationRepository(tx), 'claims.edit', new Date());
    const repository = new ClientBillingRepository(tx);
    const current = await repository.findClaim(claimId, broadVisibility);
    if (!current) throw createClientBillingError('CLAIM_NOT_FOUND');
    const locked = await repository.lockClaim(claimId, current.projectId, broadVisibility);
    if (!locked) throw createClientBillingError('CLAIM_NOT_FOUND');
    if (locked.status !== 'DRAFT') throw createClientBillingError('CLAIM_LOCKED');
    const project = await repository.findProject(current.projectId, broadVisibility);
    if (!project) throw new NotFoundError();
    requireWritableProject(project.status);
    const settings = await repository.findSettings(current.projectId, broadVisibility);
    if (settings?.status === 'INACTIVE') throw createClientBillingError('INVALID_BILLING_BASIS');
    requireBillingMethod(project, settings);
    if (input.lines !== undefined) await this.requireClaimStages(repository, project.id, input.lines, broadVisibility);
    const before = claimResponse(current);
    const updated = await repository.updateDraftClaim({ claimId, periodEnd: input.periodEnd ? inputDate(input.periodEnd) : undefined, lines: input.lines });
    const after = claimResponse(updated);
    await recordAudit(tx, { action: 'billing.claim_updated', entityType: 'progress_claim', entityId: claimId, before, after });
    return { statusCode: 200, body: after };
  }

  /** Finalize one draft claim exactly once. */
  async finalizeClaim(claimId: string, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-billing.claim-finalize', idempotencyKey, fingerprintInput: { claimId }
    }, async (tx) => this.finalizeClaimOnce(tx, claimId));
    return result.response.body;
  }

  /** Calculate gross, retention and net certified values from server-owned settings and claim lines. */
  private async finalizeClaimOnce(tx: TransactionClient, claimId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(tx), 'claims.finalize', new Date());
    const repository = new ClientBillingRepository(tx);
    const current = await repository.findClaim(claimId, visibility);
    if (!current) throw createClientBillingError('CLAIM_NOT_FOUND');
    const locked = await repository.lockClaim(claimId, current.projectId, visibility);
    if (!locked) throw createClientBillingError('CLAIM_NOT_FOUND');
    if (locked.status === 'FINALIZED') return { statusCode: 200, body: claimResponse(current) };
    if (locked.status !== 'DRAFT') throw createClientBillingError('CLAIM_LOCKED');
    if (current.lines.length === 0) throw createClientBillingError('INVALID_BILLING_BASIS');
    const project = await repository.findProject(current.projectId, visibility);
    if (!project) throw new NotFoundError();
    requireWritableProject(project.status);
    const settings = await repository.findSettings(current.projectId, visibility);
    if (settings?.status === 'INACTIVE') throw createClientBillingError('INVALID_BILLING_BASIS');
    const billingMethod = requireBillingMethod(project, settings);
    await this.requireClaimStages(repository, project.id, current.lines, visibility);
    if (billingMethod === 'COST_PLUS_PERCENTAGE') {
      await this.requireCostPlusBasis(repository, project, current.periodEnd, current.lines, visibility);
    }
    const gross = current.lines.reduce((sum, line) => sum + moneyToMinorUnits(line.amount), 0n);
    const retention = percentageOf(gross, settings?.retentionPercent ?? null);
    const deductions = 0n;
    const net = gross - retention - deductions;
    if (net < 0n) throw createClientBillingError('INVALID_BILLING_BASIS');
    const updated = await repository.finalizeClaim({ claimId, grossValue: minorUnitsToMoney(gross), deductions: minorUnitsToMoney(deductions), retention: minorUnitsToMoney(retention), netCertified: minorUnitsToMoney(net) });
    const response = claimResponse(updated);
    await recordAudit(tx, { action: 'billing.claim_finalized', entityType: 'progress_claim', entityId: claimId, before: claimResponse(current), after: response });
    await recordOutboxEvent(tx, { eventType: 'billing.claim_finalized', resourceType: 'progress_claim', resourceId: claimId, payload: { claimId, projectId: current.projectId, grossValue: response.grossValue, netCertified: response.netCertified } });
    return { statusCode: 200, body: response };
  }

  /** Resolve the configured Client receivable and revenue accounts required by invoice posting. */
  private async requireInvoicePostingAccounts(repository: ClientBillingRepository) {
    const [receivable, revenue] = await Promise.all([
      repository.findGlAccountByCode(CLIENT_RECEIVABLE_ACCOUNT_CODE),
      repository.findGlAccountByCode(CLIENT_REVENUE_ACCOUNT_CODE)
    ]);
    if (!receivable || receivable.status !== ACTIVE || receivable.accountType.toUpperCase() !== 'ASSET') {
      throw new ValidationError({ message: `Configure active asset account ${CLIENT_RECEIVABLE_ACCOUNT_CODE} before issuing Client Invoices.` });
    }
    if (!revenue || revenue.status !== ACTIVE || revenue.accountType.toUpperCase() !== 'REVENUE') {
      throw new ValidationError({ message: `Configure active revenue account ${CLIENT_REVENUE_ACCOUNT_CODE} before issuing Client Invoices.` });
    }
    return { receivable, revenue };
  }

  /** Post one immutable Client Invoice to Finance / AR using a stable source key inside the current transaction. */
  private async postInvoiceToFinance(
    tx: TransactionClient,
    invoice: any,
    receivableAccountId: string,
    defaultRevenueAccountId: string
  ) {
    const subtotal = moneyToMinorUnits(invoice.subtotal);
    const tax = moneyToMinorUnits(invoice.taxAmount);
    const total = moneyToMinorUnits(invoice.totalAmount);
    const lineTotal = (invoice.lines ?? []).reduce((sum: bigint, line: any) => sum + moneyToMinorUnits(line.amount), 0n);
    if (tax !== 0n || subtotal !== lineTotal || total !== subtotal + tax || total <= 0n) {
      throw new ConflictError({ message: 'Client Invoice totals do not reconcile to the immutable invoice lines.' });
    }

    const sourceKey = clientInvoiceFinanceSourceKey(invoice.id);
    const financeRepository = new FinanceRepository(tx);
    const existingJournal = await financeRepository.findJournalBySourceKey(sourceKey);
    if (existingJournal && (
      existingJournal.sourceType !== 'client_invoice'
      || existingJournal.sourceId !== invoice.id
      || moneyToMinorUnits(existingJournal.totalDebit) !== total
      || moneyToMinorUnits(existingJournal.totalCredit) !== total
    )) {
      throw new ConflictError({ message: 'Client Invoice Finance source key is already owned by different posting data.' });
    }

    await new FinanceService(this.db).postSourceJournalInTransaction(tx, {
      sourceType: 'client_invoice',
      sourceId: invoice.id,
      sourceKey,
      postingDate: invoice.invoiceDate,
      description: `Client invoice ${invoice.invoiceNo}`,
      lines: [
        { accountId: receivableAccountId, projectId: invoice.projectId, stageId: null, debit: minorUnitsToMoney(total), credit: ZERO_MONEY, description: `Client receivable ${invoice.invoiceNo}` },
        ...(invoice.lines ?? []).map((line: any) => ({
          accountId: line.revenueAccountId ?? defaultRevenueAccountId,
          projectId: invoice.projectId,
          stageId: line.stageId,
          debit: ZERO_MONEY,
          credit: minorUnitsToMoney(moneyToMinorUnits(line.amount)),
          description: `Client invoice ${invoice.invoiceNo}: ${line.description}`
        }))
      ]
    });
    return { sourceKey, alreadyPosted: Boolean(existingJournal) };
  }

  /** Create one invoice from a finalized claim exactly once. */
  async createInvoice(claimId: string, input: CreateInvoiceBody, idempotencyKey: string) {
    const result = await executeIdempotentCommand(this.db, {
      operation: 'client-billing.invoice-create', idempotencyKey, fingerprintInput: { claimId, input }
    }, async (tx) => this.createInvoiceOnce(tx, claimId, input));
    return result.response.body;
  }

  /** Preserve finalized claim Stages in one immutable invoice and atomically post it to Finance / AR. */
  private async createInvoiceOnce(tx: TransactionClient, claimId: string, input: CreateInvoiceBody) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(tx), 'client_invoices.create', new Date());
    const repository = new ClientBillingRepository(tx);
    const found = await repository.findClaim(claimId, visibility);
    if (!found) throw createClientBillingError('CLAIM_NOT_FOUND');
    const locked = await repository.lockClaim(claimId, found.projectId, visibility);
    if (!locked) throw createClientBillingError('CLAIM_NOT_FOUND');
    const claim = await repository.findClaim(claimId, visibility);
    if (!claim) throw createClientBillingError('CLAIM_NOT_FOUND');
    if (claim.status !== 'FINALIZED') throw createClientBillingError('INVALID_BILLING_BASIS');

    const accounts = await this.requireInvoicePostingAccounts(repository);
    const existing = await repository.findInvoiceByClaim(claimId, visibility);
    if (existing) {
      const finance = await this.postInvoiceToFinance(tx, existing, accounts.receivable.id, accounts.revenue.id);
      if (!finance.alreadyPosted) {
        await recordAudit(tx, { action: 'client_invoice.posted', entityType: 'client_invoice', entityId: existing.id, after: { status: existing.status, financeSourceKey: finance.sourceKey } });
        await recordOutboxEvent(tx, { eventType: 'client_invoice.posted', resourceType: 'client_invoice', resourceId: existing.id, payload: { invoiceId: existing.id, claimId, projectId: existing.projectId, clientId: existing.clientId, financeSourceKey: finance.sourceKey } });
      }
      return { statusCode: 200, body: invoiceResponse(existing) };
    }

    const invoiceDate = inputDate(input.invoiceDate);
    const dueDate = inputDate(input.dueDate);
    requireInvoiceDateOrder(invoiceDate, dueDate);
    const gross = claim.lines.reduce((sum: bigint, line: any) => sum + moneyToMinorUnits(line.amount), 0n);
    const storedGross = moneyToMinorUnits(claim.grossValue);
    const subtotal = moneyToMinorUnits(claim.netCertified);
    if (gross !== storedGross || subtotal !== gross - moneyToMinorUnits(claim.retention) - moneyToMinorUnits(claim.deductions)) {
      throw new ConflictError({ message: 'Finalized claim totals do not reconcile to its immutable claim lines.' });
    }
    const invoiceLines = allocateCertifiedInvoiceLines(claim.lines, subtotal, accounts.revenue.id);
    const tax = 0n;
    const total = subtotal + tax;
    const number = await allocateCompanyNumber(tx, { sequenceKey: INVOICE_SEQUENCE_KEY });
    const invoice = await repository.createInvoice({
      projectId: claim.projectId,
      clientId: claim.clientId,
      claimId: claim.id,
      invoiceNo: number.formatted,
      invoiceDate,
      dueDate,
      subtotal: minorUnitsToMoney(subtotal),
      taxAmount: minorUnitsToMoney(tax),
      totalAmount: minorUnitsToMoney(total),
      lines: invoiceLines
    });
    const response = invoiceResponse(invoice);
    await recordAudit(tx, { action: 'client_invoice.created', entityType: 'client_invoice', entityId: invoice.id, after: response });
    const finance = await this.postInvoiceToFinance(tx, invoice, accounts.receivable.id, accounts.revenue.id);
    await recordAudit(tx, { action: 'client_invoice.posted', entityType: 'client_invoice', entityId: invoice.id, after: { status: invoice.status, financeSourceKey: finance.sourceKey } });
    await recordOutboxEvent(tx, { eventType: 'client_invoice.created', resourceType: 'client_invoice', resourceId: invoice.id, payload: { invoiceId: invoice.id, claimId, projectId: claim.projectId, clientId: claim.clientId, totalAmount: response.totalAmount, financeSourceKey: finance.sourceKey } });
    await recordOutboxEvent(tx, { eventType: 'client_invoice.posted', resourceType: 'client_invoice', resourceId: invoice.id, payload: { invoiceId: invoice.id, claimId, projectId: claim.projectId, clientId: claim.clientId, totalAmount: response.totalAmount, financeSourceKey: finance.sourceKey } });
    return { statusCode: 201, body: response };
  }

  /** List permission-visible Client Invoices. */
  async listInvoices(query: ListInvoicesQuery) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'client_invoices.read', new Date());
    if (query.projectId && visibility.allowedProjectIds !== null && !visibility.allowedProjectIds.includes(query.projectId)) throw new AuthorizationError();
    const page = pageWindow(query);
    const result = await new ClientBillingRepository(this.db).listInvoices({ skip: page.skip, take: page.take, projectId: query.projectId, status: query.status }, visibility);
    return { items: result.items.map(invoiceResponse), total: result.total, page: page.page, pageSize: page.pageSize };
  }

  /** Read one Client Invoice inside the actor's project scope. */
  async getInvoice(invoiceId: string) {
    const visibility = await this.resolveVisibility(new AdministrationRepository(this.db), 'client_invoices.read', new Date());
    const invoice = await new ClientBillingRepository(this.db).findInvoice(invoiceId, visibility);
    if (!invoice) throw createClientBillingError('INVOICE_NOT_FOUND');
    return invoiceResponse(invoice);
  }
}
