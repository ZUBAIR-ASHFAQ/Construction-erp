export type CompanyOwnedRecord = Readonly<{
  companyId: string;
}>;

/**
 * Repository filters/data must never accept ownership from callers. The
 * runtime helpers enforce the same rule even when JavaScript or `any` bypasses
 * this TypeScript shape.
 */
export type WithoutCompanyId<T extends Record<string, unknown>> =
  T & Readonly<{ companyId?: never }>;

export type CompanyScoped<T extends Record<string, unknown>> =
  T & Readonly<{ companyId: string }>;

export type CompanyRepositoryScope = Readonly<{
  /** Trusted company identifier resolved from the active request context. */
  companyId: string;
  /** Add an unavoidable top-level company predicate to a repository filter. */
  where<T extends Record<string, unknown>>(where?: WithoutCompanyId<T>): CompanyScoped<T>;
  /** Add server-owned companyId to create data. */
  createData<T extends Record<string, unknown>>(data: WithoutCompanyId<T>): CompanyScoped<T>;
  /** Assert ownership of a record already loaded by trusted server code. */
  assertOwned<T extends CompanyOwnedRecord>(record: T): T;
  /** Boolean ownership check for filtering/diagnostics without throwing. */
  owns(record: CompanyOwnedRecord): boolean;
}>;
