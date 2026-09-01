import type { TransactionClient } from '@construction-erp/database';
import {
  requireRequestContext,
  requireRequestSecurityContext
} from '@construction-erp/request-context';
import { sanitizeAuditSnapshot } from './sanitize.js';
import type { AuditProjectScopeSnapshot, AuditWriteInput } from './types.js';

/** Validate and return a required identifier. */
function requiredIdentifier(value: string, field: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be a non-empty string.`);
  if (normalized.length > maxLength) throw new Error(`${field} exceeds ${maxLength} characters.`);
  return normalized;
}


/** Return a root-level UUID dimension from an audit snapshot when present. */
function snapshotUuid(snapshot: AuditWriteInput['before'] | AuditWriteInput['after'], key: 'projectId' | 'stageId'): string | null {
  const value = snapshot?.[key];
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
}

/** Resolve one exact audit dimension without trusting browser-supplied ownership. */
function auditDimension(input: AuditWriteInput, key: 'projectId' | 'stageId'): string | null {
  const explicit = input[key];
  if (explicit === null) return null;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
  return snapshotUuid(input.after, key) ?? snapshotUuid(input.before, key);
}

/** Return project scope snapshot. */
function projectScopeSnapshot(): AuditProjectScopeSnapshot {
  const scope = requireRequestSecurityContext().projectScope;
  if (scope.kind === 'restricted') {
    return Object.freeze({ kind: 'restricted', projectIds: Object.freeze([...scope.projectIds]) });
  }
  return Object.freeze({ kind: scope.kind });
}

/**
 * Append an audit record using the SAME Prisma transaction as the owning
 * business change. Company, actor, request and project scope are derived only
 * from trusted server-side request context; callers cannot supply them.
 *
 * This function deliberately accepts Prisma.TransactionClient rather than a
 * root PrismaClient so service-layer writes can make business state + audit
 * atomic. Outbox persistence can join the same transaction when required.
 */
export async function recordAudit(tx: TransactionClient, input: AuditWriteInput) {
  const context = requireRequestContext();
  const security = requireRequestSecurityContext();

  const data = {
    companyId: security.companyId,
    actorUserId: security.actorUserId,
    projectId: auditDimension(input, 'projectId'),
    stageId: auditDimension(input, 'stageId'),
    projectScope: projectScopeSnapshot(),
    entityType: requiredIdentifier(input.entityType, 'entityType', 100),
    entityId: requiredIdentifier(input.entityId, 'entityId', 128),
    action: requiredIdentifier(input.action, 'action', 100),
    requestId: requiredIdentifier(context.requestId, 'requestId', 128),
    correlationId: requiredIdentifier(context.correlationId, 'correlationId', 128),
    ...(input.before === undefined || input.before === null
      ? {}
      : { beforeValue: sanitizeAuditSnapshot(input.before) }),
    ...(input.after === undefined || input.after === null
      ? {}
      : { afterValue: sanitizeAuditSnapshot(input.after) })
  };

  return tx.auditLog.create({ data });
}
