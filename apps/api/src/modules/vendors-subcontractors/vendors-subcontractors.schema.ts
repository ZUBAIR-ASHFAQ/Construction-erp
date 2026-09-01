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
  'VENDOR_LINK_INVALID'
] as const);

export const VENDORS_SUBCONTRACTORS_EVENT_TYPES = Object.freeze([
  'vendor.created',
  'vendor.updated',
  'subcontractor.created',
  'subcontractor.updated'
] as const);

export const VENDORS_SUBCONTRACTORS_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/vendors' }),
  Object.freeze({ method: 'POST', route: '/api/v1/vendors' }),
  Object.freeze({ method: 'GET', route: '/api/v1/vendors/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/vendors/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/vendors/:id/contacts' }),
  Object.freeze({ method: 'GET', route: '/api/v1/subcontractors' }),
  Object.freeze({ method: 'POST', route: '/api/v1/subcontractors' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/subcontractors/:id' })
] as const);

export const VENDOR_STATUS_VALUES = Object.freeze(['ACTIVE', 'ARCHIVED'] as const);
export const VENDOR_QUALIFICATION_VALUES = Object.freeze(['QUALIFIED', 'PENDING'] as const);
export const SUBCONTRACTOR_STATUS_VALUES = Object.freeze(['ACTIVE', 'ARCHIVED'] as const);

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
const defaultTermsSchema = z.string().trim().min(1).max(2000);
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

/** Create one subcontractor profile, optionally linked to an existing supplier/vendor. */
export const createSubcontractorBodySchema = z.object({
  vendorId: uuidSchema.nullable().optional(),
  code: codeSchema,
  specialty: specialtySchema,
  defaultTerms: defaultTermsSchema.nullable().optional()
}).strict();

/** Update final subcontractor master fields without creating operational subcontract ownership. */
export const updateSubcontractorBodySchema = z.object({
  vendorId: uuidSchema.nullable().optional(),
  code: codeSchema.optional(),
  specialty: specialtySchema.optional(),
  defaultTerms: defaultTermsSchema.nullable().optional(),
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

const ERROR_MESSAGES: Readonly<Record<VendorsSubcontractorsErrorCode, string>> = Object.freeze({
  VENDOR_NOT_FOUND: 'The requested supplier/vendor was not found.',
  DUPLICATE_VENDOR_CODE: 'A supplier/vendor with this code already exists.',
  SUBCONTRACTOR_NOT_FOUND: 'The requested subcontractor was not found.',
  VENDOR_LINK_INVALID: 'The selected supplier/vendor link is invalid for this company.'
});

/** Map final Supplier & Subcontractor business codes to stable public errors. */
export function createVendorsSubcontractorsError(code: VendorsSubcontractorsErrorCode): AppError {
  const message = ERROR_MESSAGES[code];
  switch (code) {
    case 'VENDOR_NOT_FOUND':
    case 'SUBCONTRACTOR_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'DUPLICATE_VENDOR_CODE':
    case 'VENDOR_LINK_INVALID':
      return new ConflictError({ code, message });
  }
}
