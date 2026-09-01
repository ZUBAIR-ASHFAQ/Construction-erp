import {
  AppError,
  ConflictError,
  NotFoundError
} from '@construction-erp/errors';
import { z } from 'zod';

export const CLIENTS_MAX_PAGE_SIZE = 100;

export const CLIENT_PERMISSION_CODES = Object.freeze([
  'clients.read',
  'clients.create',
  'clients.update'
] as const);

export const CLIENT_ERROR_CODES = Object.freeze([
  'CLIENT_NOT_FOUND',
  'DUPLICATE_CLIENT_CODE',
  'CLIENT_IN_USE'
] as const);

export const CLIENT_EVENT_TYPES = Object.freeze([
  'client.created',
  'client.updated',
  'client.status_changed'
] as const);

export const CLIENT_HTTP_ROUTES = Object.freeze([
  Object.freeze({ method: 'GET', route: '/api/v1/clients' }),
  Object.freeze({ method: 'POST', route: '/api/v1/clients' }),
  Object.freeze({ method: 'GET', route: '/api/v1/clients/:id' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/clients/:id' }),
  Object.freeze({ method: 'POST', route: '/api/v1/clients/:id/contacts' }),
  Object.freeze({ method: 'PATCH', route: '/api/v1/clients/:id/contacts/:contactId' })
] as const);

export type ClientPermissionCode = (typeof CLIENT_PERMISSION_CODES)[number];
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];

export const clientPermissionCodeSchema = z.enum(CLIENT_PERMISSION_CODES);
export const clientErrorCodeSchema = z.enum(CLIENT_ERROR_CODES);
export const clientStatusSchema = z.enum(['ACTIVE', 'ARCHIVED']);
export const clientContactStatusSchema = z.enum(['ACTIVE', 'INACTIVE']);

const uuidSchema = z.string().uuid();
const clientCodeSchema = z.string().trim().min(1).max(100);
const clientLegalNameSchema = z.string().trim().min(1).max(240);
const clientDisplayNameSchema = z.string().trim().min(1).max(240);
const taxNoSchema = z.string().trim().min(1).max(100);
const billingAddressSchema = z.string().trim().min(1).max(1000);
const contactNameSchema = z.string().trim().min(1).max(200);
const contactTitleSchema = z.string().trim().min(1).max(160);
const searchSchema = z.string().trim().min(1).max(200);
const creditTermsDaysSchema = z.number().int().min(0).max(2_147_483_647);
const emailSchema = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const phoneSchema = z.string().trim().min(7).max(50)
  .transform((value) => value.replace(/[\s().-]/g, ''))
  .refine((value) => /^\+?\d{7,15}$/.test(value), 'phone must contain 7 to 15 digits with an optional leading +');

const paginationQueryShape = {
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(CLIENTS_MAX_PAGE_SIZE).optional()
} as const;

/** Path contract for routes that address one Client. */
export const clientIdParamsSchema = z.object({
  id: uuidSchema
}).strict();

/** Path contract for routes that address one Contact under one Client. */
export const clientContactParamsSchema = z.object({
  id: uuidSchema,
  contactId: uuidSchema
}).strict();

/** Bounded client-list filters for server-side search and pagination. */
export const listClientsQuerySchema = z.object({
  search: searchSchema.optional(),
  status: clientStatusSchema.optional(),
  ...paginationQueryShape
}).strict();

/** Create one company-owned Client; ownership and lifecycle state come from the server. */
export const createClientBodySchema = z.object({
  code: clientCodeSchema,
  legalName: clientLegalNameSchema,
  displayName: clientDisplayNameSchema,
  taxNo: taxNoSchema.nullable().optional(),
  billingAddress: billingAddressSchema,
  creditTermsDays: creditTermsDaysSchema.nullable().optional()
}).strict();

/** Update only final Client master fields, including non-destructive status changes. */
export const updateClientBodySchema = z.object({
  code: clientCodeSchema.optional(),
  legalName: clientLegalNameSchema.optional(),
  displayName: clientDisplayNameSchema.optional(),
  taxNo: taxNoSchema.nullable().optional(),
  billingAddress: billingAddressSchema.optional(),
  creditTermsDays: creditTermsDaysSchema.nullable().optional(),
  status: clientStatusSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable client field must be provided.'
});

/** Create one Contact with only the name required by the final Client master contract. */
export const createClientContactBodySchema = z.object({
  name: contactNameSchema,
  title: contactTitleSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  isPrimary: z.boolean().default(false)
}).strict();

/** Update editable Contact master fields without changing Client or Company ownership. */
export const updateClientContactBodySchema = z.object({
  name: contactNameSchema.optional(),
  title: contactTitleSchema.nullable().optional(),
  email: emailSchema.nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  isPrimary: z.boolean().optional(),
  status: clientContactStatusSchema.optional()
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one editable contact field must be provided.'
});

export type ClientIdParams = z.infer<typeof clientIdParamsSchema>;
export type ClientContactParams = z.infer<typeof clientContactParamsSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuerySchema>;
export type CreateClientBody = z.infer<typeof createClientBodySchema>;
export type UpdateClientBody = z.infer<typeof updateClientBodySchema>;
export type CreateClientContactBody = z.infer<typeof createClientContactBodySchema>;
export type UpdateClientContactBody = z.infer<typeof updateClientContactBodySchema>;

const CLIENT_ERROR_MESSAGES: Readonly<Record<ClientErrorCode, string>> = Object.freeze({
  CLIENT_NOT_FOUND: 'The requested client or client contact was not found.',
  DUPLICATE_CLIENT_CODE: 'A client with this code already exists.',
  CLIENT_IN_USE: 'The client cannot accept this change in its current state.'
});

/** Map each documented Client Management business code to one stable public HTTP error type. */
export function createClientError(code: ClientErrorCode): AppError {
  const message = CLIENT_ERROR_MESSAGES[code];

  switch (code) {
    case 'CLIENT_NOT_FOUND':
      return new NotFoundError({ code, message });
    case 'DUPLICATE_CLIENT_CODE':
    case 'CLIENT_IN_USE':
      return new ConflictError({ code, message });
  }
}
