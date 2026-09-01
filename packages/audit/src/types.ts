export type AuditJsonPrimitive = string | number | boolean | null;
export type AuditJsonValue = AuditJsonPrimitive | AuditJsonObject | AuditJsonValue[];
export type AuditJsonObject = { [key: string]: AuditJsonValue };

/**
 * Domain state supplied by a service before/after a sensitive change.
 * The audit sanitizer converts this into safe JSON and removes secret values.
 */
export type AuditSnapshotInput = Readonly<Record<string, unknown>>;

export type AuditWriteInput = Readonly<{
  /** Stable action name chosen by the owning service, e.g. user.deactivated. */
  action: string;
  /** Stable cross-cutting resource type. */
  entityType: string;
  /** Stable resource identifier; audit references are intentionally generic. */
  entityId: string;
  /** Optional exact Project dimension for permission-safe audit search. */
  projectId?: string | null;
  /** Optional exact Project Stage dimension when the owning module has one. */
  stageId?: string | null;
  before?: AuditSnapshotInput | null;
  after?: AuditSnapshotInput | null;
}>;

export type AuditProjectScopeSnapshot =
  | Readonly<{ kind: 'not-resolved' }>
  | Readonly<{ kind: 'all' }>
  | Readonly<{ kind: 'restricted'; projectIds: readonly string[] }>;
