export {
  CrossCompanyAccessError,
  UntrustedCompanyScopeInputError
} from './errors.js';
export {
  assertOwnedByActiveCompany,
  companyScopedCreateData,
  companyScopedWhere,
  isOwnedByActiveCompany,
  requireActiveCompanyId,
  requireCompanyRepositoryScope
} from './scope.js';
export type {
  CompanyOwnedRecord,
  CompanyRepositoryScope,
  CompanyScoped,
  WithoutCompanyId
} from './types.js';
