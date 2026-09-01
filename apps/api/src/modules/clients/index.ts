export {
  CLIENT_ERROR_CODES,
  CLIENT_EVENT_TYPES,
  CLIENT_HTTP_ROUTES,
  CLIENT_PERMISSION_CODES,
  CLIENTS_MAX_PAGE_SIZE,
  clientContactParamsSchema,
  clientContactStatusSchema,
  clientErrorCodeSchema,
  clientIdParamsSchema,
  clientPermissionCodeSchema,
  clientStatusSchema,
  createClientBodySchema,
  createClientContactBodySchema,
  createClientError,
  listClientsQuerySchema,
  updateClientBodySchema,
  updateClientContactBodySchema
} from './clients.schema.js';

export type {
  ClientContactParams,
  ClientErrorCode,
  ClientEventType,
  ClientIdParams,
  ClientPermissionCode,
  CreateClientBody,
  CreateClientContactBody,
  ListClientsQuery,
  UpdateClientBody,
  UpdateClientContactBody
} from './clients.schema.js';

export { ClientsRepository } from './clients.repository.js';
export type {
  CreateClientContactRepositoryInput,
  CreateClientRepositoryInput,
  ListClientsRepositoryInput,
  RepositoryPageWindow,
  UpdateClientContactRepositoryInput,
  UpdateClientRepositoryInput
} from './clients.repository.js';

export { ClientsService } from './clients.service.js';
export { registerClientsRoutes } from './clients.routes.js';
export type { ClientsRoutesOptions } from './clients.routes.js';
