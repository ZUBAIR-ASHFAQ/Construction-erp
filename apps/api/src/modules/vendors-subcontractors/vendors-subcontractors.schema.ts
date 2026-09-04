import { AppError, ConflictError, NotFoundError } from '@construction-erp/errors';
import { z } from 'zod';

export const VENDORS_SUBCONTRACTORS_MAX_PAGE_SIZE = 100;

export const VENDORS_SUBCONTRACTORS_PERMISSION_CODES = Object.freeze([
  'vendors.read',
  'vendors.create',
  'vendors.update',
  'subcontractors.read',
  'subcontractors.manage'
] as const);

export const VENDORS_SUBCONTRACTORS_ERROR_CODES = Object.freeze([
  'VENDOR_NOT_FOUND',
  'DUPLICATE_VENDOR_CODE',
  'SUBCONTRACTOR_NOT_FOUND',
  'VENDOR_LINK_INVALID',
  'SUBCONTRACT_CONTRACT_NOT_FOUND',
  'SUBCONTRACTOR_NOT_ACTIVE',
  'SUBCONTRACT_CONTRACT_ALREADY_FINISHED',
  'PROJECT_NOT_FOUND'
] as const);

export const VENDORS_SUBCONTRACTORS_EVENT_TYPES = Object.freeze([
  'vendor.created',
  'vendor.updated',
  'subcontractor.created',
  'subcontractor.updated',
  'subcontract.created',
  'subcontract.finished',
  'subcontract.payment_posted'
] as const);

export const VENDORS_SUBCONTRACTORS_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/vendors' }),
  Object.freeze({ method: 'POST', route: '/api/v1/vendors' }),
  Object.freeze({ method: 'GET', route: '/api/v1/vendors/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/vendors/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/vendors/:id/contacts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/subcontractors' }),
  Object.freeze({ method: 'POST', route: '/api/v1/subcontractors' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/subcontractors/:id' }),
  Object.freeze({ method: 'GET', route: '/api/v1/subcontract-contracts' }),
  Object.freeze({ method: 'POST', route: '/api/v1/subcontract-contracts' }),
  Object.freeze({ method: 'POST', route: '/api/v1/subcontract-contracts/:id/finish' }),
  Object.freeze({ method: 'GET', route: '/api/v1/subcontract-payments' }),
  Object.freeze({ method: 'POST', route: '/api/v1/subcontract-payments' }),
  Object.freeze({ method: 'GET', route: '/api/v1/subcontract-ledger' })
] as const);

export const VENDOR_STATUS_VALUES = Object.freeze(['ACTIVE', 'ARCHIVED'] as const);
export const VENDOR_QUALIFICATION_VALUES = Object.freeze(['QUALIFIED', 'PENDING'] as const);
export const SUBCONTRACTOR_STATUS_VALUES = Object.freeze(['ACTIVE', 'ARCHIVED'] as const);
export const SUBCONTRACT_CONTRACT_STATUS_VALUES = Object.freeze(['ACTIVE', 'FINISHED'] as const);
export const SUBCONTRACT_PAYMENT_STATUS_VALUES = Object.freeze(['DRAFT', 'POSTED'] as const);

export type VendorsSubcontractorsPermissionCode = (typeof VENDORS_SUBCONTRACTORS_PERMISSION_CODES)[number];
export type VendorsSubcontractorsErrorCode = (typeof VENDORS_SUBCONTRACTORS_ERROR_CODES)[number];

const uuidSchema = z.string().uuid();
const searchSchema = z.string().trim().min(1).max(200);
const codeSchema = z.string().trim().min(1).max(100);
const nameSchema = z.string().trim().min(1).max(300);
const taxNoSchema = z.string().trim().min(1).max(100);
const currencySchema = z.string().trim().length(3).transform((value) => value.toUpperCase());
const paymentTermsSchema = z.number().int().min(0).max(2_147_483_647);
const contactNameSchema = z.string().trim().min(1).max(200);
const contactRoleSchema = z.string().trim().min(1).max(120);
const specialtySchema = z.string().trim().min(1).max(200);
const addressSchema = z.string().trim().min(1).max(1000);
const contractAmountSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'contractAmount must be a decimal string with at most 16 whole digits and 2 decimal places'
).refine((value) => Number(value) > 0, 'contractAmount must be greater than 0');
const paymentAmountSchema = z.string().trim().regex(
  /^(?:0|[1-9]\d{0,15})(?:\.\d{1,2})?$/,
  'amount must be a decimal string with at most 16 whole digits and 2 decimal places'
).refine((value) => Number(value) > 0, 'amount must be greater than 0');
const paymentReferenceSchema = z.string().trim().min(1).max(200);

/** Check that one date-only value is a real calendar date. */
function isValidDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

const contractDateSchema = z.string().refine(isValidDateOnly, 'contractDate must use a valid YYYY-MM-DD calendar date');
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const phoneSchema = z.string().trim().min(7).max(50)
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .refine((value) => /^\+?\d{7,15}$/.test(value), 'phone must contain 7 to 15 digits with an optional leading +');

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(VENDORS_SUBCONTRACTORS_MAX_PAGE_SIZE).optional()
} as const;

/** Path contract for routes that address one supplier/vendor or subcontractor. */
export const masterIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Bounded supplier/vendor list filters. */
export const listVendorsQuerySchema = z.object({
  search: searchSchema.optional(),
  status: z.enum(VENDOR_STATUS_VALUES).optional(),
  qualificationStatus: z.enum(VENDOR_QUALIFICATION_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Create one company-owned supplier/vendor master record. */
export const createVendorBodySchema = z.object({
  code: codeSchema,
  legalName: nameSchema,
  displayName: nameSchema,
  taxNo: taxNoSchema.nullable().optional(),
  paymentTermsDays: paymentTermsSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  qualificationStatus: z.enum(VENDOR_QUALIFICATION_VALUES).nullable().optional()
}).strict();

/** Update only final supplier/vendor master fields and lifecycle values. */
export const updateVendorBodySchema = z.object({
  code: codeSchema.optional(),
  legalName: nameSchema.optional(),
  displayName: nameSchema.optional(),
  taxNo: taxNoSchema.nullable().optional(),
  paymentTermsDays: paymentTermsSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  qualificationStatus: z.enum(VENDOR_QUALIFICATION_VALUES).nullable().optional(),
  status: z.enum(VENDOR_STATUS_VALUES).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable vendor field must be provided.'
});

/** Create one supplier/vendor contact; optional communication details stay nullable. */
export const createVendorContactBodySchema = z.object({
  name: contactNameSchema,
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  role: contactRoleSchema.nullable().optional()
}).strict();

/** Bounded subcontractor-master list filters. */
export const listSubcontractorsQuerySchema = z.object({
  search: searchSchema.optional(),
  status: z.enum(SUBCONTRACTOR_STATUS_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Path contract for one subcontract contract command. */
export const subcontractContractIdParamsSchema = z.object({ id: uuidSchema }).strict();

/** Bounded filters for subcontract Project assignments. */
export const listSubcontractContractsQuerySchema = z.object({
  subcontractorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  status: z.enum(SUBCONTRACT_CONTRACT_STATUS_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Create one Project assignment and agreed amount for an active subcontractor. */
export const createSubcontractContractBodySchema = z.object({
  subcontractorId: uuidSchema,
  projectId: uuidSchema,
  contractAmount: contractAmountSchema,
  contractDate: contractDateSchema
}).strict();


/** Bounded filters for direct payments posted against subcontract contracts. */
export const listSubcontractPaymentsQuerySchema = z.object({
  subcontractorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  subcontractContractId: uuidSchema.optional(),
  status: z.enum(SUBCONTRACT_PAYMENT_STATUS_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Create one direct subcontract payment; Project and subcontractor are server-derived from the contract. */
export const createSubcontractPaymentBodySchema = z.object({
  subcontractContractId: uuidSchema,
  paymentDate: contractDateSchema,
  amount: paymentAmountSchema,
  cashBankAccountId: uuidSchema,
  reference: paymentReferenceSchema.nullable().optional()
}).strict();

/** Bounded filters for the source-derived subcontract ledger. */
export const listSubcontractLedgerQuerySchema = z.object({
  subcontractorId: uuidSchema.optional(),
  projectId: uuidSchema.optional(),
  status: z.enum(SUBCONTRACT_CONTRACT_STATUS_VALUES).optional(),
  ...paginationQueryShape
}).strict();

/** Create one subcontractor profile from its four user-maintained business fields. */
export const createSubcontractorBodySchema = z.object({
  name: nameSchema,
  phone: phoneSchema,
  specialty: specialtySchema,
  address: addressSchema
}).strict();

/** Update subcontractor contact fields or lifecycle status; code remains server-owned. */
export const updateSubcontractorBodySchema = z.object({
  name: nameSchema.optional(),
  phone: phoneSchema.optional(),
  specialty: specialtySchema.optional(),
  address: addressSchema.optional(),
  status: z.enum(SUBCONTRACTOR_STATUS_VALUES).optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable subcontractor field must be provided.'
});

export type MasterIdParams = z.infer<typeof masterIdParamsSchema>;
export type ListVendorsQuery = z.infer<typeof listVendorsQuerySchema>;
export type CreateVendorBody = z.infer<typeof createVendorBodySchema>;
export type UpdateVendorBody = z.infer<typeof updateVendorBodySchema>;
export type CreateVendorContactBody = z.infer<typeof createVendorContactBodySchema>;
export type ListSubcontractorsQuery = z.infer<typeof listSubcontractorsQuerySchema>;
export type CreateSubcontractorBody = z.infer<typeof createSubcontractorBodySchema>;
export type UpdateSubcontractorBody = z.infer<typeof updateSubcontractorBodySchema>;
export type ListSubcontractContractsQuery = z.infer<typeof listSubcontractContractsQuerySchema>;
export type CreateSubcontractContractBody = z.infer<typeof createSubcontractContractBodySchema>;
export type ListSubcontractPaymentsQuery = z.infer<typeof listSubcontractPaymentsQuerySchema>;
export type CreateSubcontractPaymentBody = z.infer<typeof createSubcontractPaymentBodySchema>;
export type ListSubcontractLedgerQuery = z.infer<typeof listSubcontractLedgerQuerySchema>;

const ERROR_MESSAGES: Readonly<Record<VendorsSubcontractorsErrorCode, string>> = Object.freeze({
  VENDOR_NOT_FOUND: 'The requested supplier/vendor was not found.',
  DUPLICATE_VENDOR_CODE: 'A supplier/vendor with this code already exists.',
  SUBCONTRACTOR_NOT_FOUND: 'The requested subcontractor was not found.',
  VENDOR_LINK_INVALID: 'The selected supplier/vendor link is invalid for this company.',
  SUBCONTRACT_CONTRACT_NOT_FOUND: 'The requested subcontract contract was not found.',
  SUBCONTRACTOR_NOT_ACTIVE: 'Only an active subcontractor can be assigned to a Project.',
  SUBCONTRACT_CONTRACT_ALREADY_FINISHED: 'This subcontract contract is already finished.',
  PROJECT_NOT_FOUND: 'The selected Project was not found for this company.'
});

/** Map final Supplier & Subcontractor business codes to stable public errors. */
export function createVendorsSubcontractorsError(code: VendorsSubcontractorsErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  switch (code) {
    case 'VENDOR_NOT_FOUND':
    case 'SUBCONTRACTOR_NOT_FOUND':
    case 'SUBCONTRACT_CONTRACT_NOT_FOUND':
    case 'PROJECT_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'DUPLICATE_VENDOR_CODE':
    case 'VENDOR_LINK_INVALID':
    case 'SUBCONTRACTOR_NOT_ACTIVE':
    case 'SUBCONTRACT_CONTRACT_ALREADY_FINISHED':
      return new ConflictError({ code, message });
  }
}
