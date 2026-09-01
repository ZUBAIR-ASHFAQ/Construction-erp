export type ProjectScope =
  | Readonly<{ kind: 'not-resolved' }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: readonly string[] }>;

/**
 * Security fields are populated only by trusted server-side authentication /
 * authorization infrastructure. They are never sourced from request bodies.
 *
 * Foundation defines the contract now; Administration will populate user/company
 * identity and permissions, while Administration resolves explicit project scope.
 */
export type RequestSecurityContext = Readonly<{
  actorUserId: string;
  companyId: string;
  permissions: readonly string[];
  projectScope: ProjectScope;
}>;

export type RequestContext = Readonly<{
  /** Server-generated identifier for this API request. */
  requestId: string;
  /** Trace/correlation identifier. May originate upstream but is never authority. */
  correlationId: string;
  /** UTC instant captured when request processing begins. */
  startedAt: Date;
  /** Trusted identity/scope after authentication; null during Foundation/unauthenticated entry. */
  readonly security: RequestSecurityContext | null;
}>;

export type CreateRequestContextInput = Readonly<{
  requestId?: string;
  correlationId?: string;
  startedAt?: Date;
}>;
