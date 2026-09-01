import { AsyncLocalStorage } from 'node:async_hooks';
import { createRequestId, normalizeCorrelationId } from './ids.js';
import type {
  CreateRequestContextInput,
  ProjectScope,
  RequestContext,
  RequestSecurityContext
} from './types.js';

type MutableState = {
  context: RequestContext;
  security: RequestSecurityContext | null;
};

const storage = new AsyncLocalStorage<MutableState>();
const states = new WeakMap<RequestContext, MutableState>();

/** Validate and return non-empty text. */
function nonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a non-empty string.`);
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} must be a non-empty string.`);
  return normalized;
}

/** Normalize project scope. */
function normalizeProjectScope(scope: ProjectScope): ProjectScope {
  const value = scope as unknown as { kind?: unknown; projectIds?: unknown };

  if (value.kind === 'not-resolved' || value.kind === 'all') {
    return Object.freeze({ kind: value.kind });
  }
  if (value.kind !== 'restricted' || !Array.isArray(value.projectIds)) {
    throw new Error('projectScope must be not-resolved, all, or restricted with project IDs.');
  }

  const ids = [...new Set(value.projectIds.map((id) => nonEmpty(id, 'projectId')))].sort();
  return Object.freeze({ kind: 'restricted', projectIds: Object.freeze(ids) });
}

/** Normalize security context. */
function normalizeSecurityContext(input: RequestSecurityContext): RequestSecurityContext {
  const permissions = [...new Set(input.permissions.map((permission) => nonEmpty(permission, 'permission')))].sort();

  return Object.freeze({
    actorUserId: nonEmpty(input.actorUserId, 'actorUserId'),
    companyId: nonEmpty(input.companyId, 'companyId'),
    permissions: Object.freeze(permissions),
    projectScope: normalizeProjectScope(input.projectScope)
  });
}

/** Create request context. */
export function createRequestContext(input: CreateRequestContextInput = {}): RequestContext {
  const requestId = input.requestId ? nonEmpty(input.requestId, 'requestId') : createRequestId();
  const correlationId = normalizeCorrelationId(input.correlationId) ?? requestId;
  const startedAt = input.startedAt ? new Date(input.startedAt.getTime()) : new Date();

  if (Number.isNaN(startedAt.getTime())) {
    throw new Error('startedAt must be a valid Date.');
  }

  let state!: MutableState;
  const context: RequestContext = Object.freeze({
    requestId,
    correlationId,
    startedAt,
    get security() {
      return state.security;
    }
  });

  state = { context, security: null };
  states.set(context, state);
  return context;
}

/** Run with request context. */
export function runWithRequestContext<T>(context: RequestContext, callback: () => T): T {
  const state = states.get(context);
  if (!state) throw new Error('Request context was not created by this package.');
  return storage.run(state, callback);
}

/** Return request context. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()?.context;
}

/** Require request context. */
export function requireRequestContext(): RequestContext {
  const context = getRequestContext();
  if (!context) throw new Error('No request context is active.');
  return context;
}

/**
 * Bind server-validated identity/scope exactly once for the current request.
 * Administration will call this after authentication/policy resolution.
 */
export function bindRequestSecurityContext(input: RequestSecurityContext): RequestSecurityContext {
  const state = storage.getStore();
  if (!state) throw new Error('No request context is active.');
  if (state.security) throw new Error('Request security context is already bound.');

  const security = normalizeSecurityContext(input);
  state.security = security;
  return security;
}

/** Require request security context. */
export function requireRequestSecurityContext(): RequestSecurityContext {
  const context = requireRequestContext();
  if (!context.security) throw new Error('Authenticated request security context is required.');
  return context.security;
}

/** Require company id. */
export function requireCompanyId(): string {
  return requireRequestSecurityContext().companyId;
}

/** Require actor user id. */
export function requireActorUserId(): string {
  return requireRequestSecurityContext().actorUserId;
}

/** Check whether permission. */
export function hasPermission(permission: string): boolean {
  const required = nonEmpty(permission, 'permission');
  return requireRequestSecurityContext().permissions.includes(required);
}
