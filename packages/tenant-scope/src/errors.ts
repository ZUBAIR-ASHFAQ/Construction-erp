/**
 * Internal Foundation error raised when repository-facing input tries to carry
 * company ownership. The API error layer maps this internal guard to the common
 * error envelope; this error is deliberately not an HTTP/API error contract.
 */
export class UntrustedCompanyScopeInputError extends Error {
  /** Create a new UntrustedCompanyScopeInputError instance. */
  constructor() {
    super('companyId must come from the authenticated request context.');
    this.name = 'UntrustedCompanyScopeInputError';
  }
}

/**
 * Internal guard error for a record already loaded by trusted server code that
 * is found to belong to a different company. The message intentionally does
 * not disclose either company identifier.
 */
export class CrossCompanyAccessError extends Error {
  /** Create a new CrossCompanyAccessError instance. */
  constructor() {
    super('Resource is outside the active company scope.');
    this.name = 'CrossCompanyAccessError';
  }
}
