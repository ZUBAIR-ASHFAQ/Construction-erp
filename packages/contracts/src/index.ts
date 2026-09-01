export {
  INTEGRATION_CONTRACT_VERSION,
  normalizeCurrency,
  normalizeDecimalString,
  normalizeIsoDate,
  normalizeReferenceId,
  normalizeStableToken
} from './primitives.js';
export type { IntegrationJsonObject, IntegrationJsonPrimitive, IntegrationJsonValue } from './primitives.js';

export { createStableSourceKey, serializeStableSourceKey } from './source-key.js';
export type { StableSourceKey, StableSourceKeyInput } from './source-key.js';

export { createResourceReference } from './resource-reference.js';
export type { CrossCuttingResourceReference } from './resource-reference.js';

export { createDocumentReference, createDocumentVersionReference } from './document-reference.js';
export type { DocumentReference } from './document-reference.js';

export {
  INTEGRATION_EVENT_ENVELOPE_VERSION,
  assertStableEventType,
  validateIntegrationProjectScope
} from './integration-event.js';
export type { IntegrationEventEnvelope, IntegrationProjectScopeSnapshot } from './integration-event.js';

export { createFinancialPostingCommand } from './financial-posting.js';
export type {
  FinancialPostingCommand,
  FinancialPostingCommandInput,
  FinancialPostingDimensions,
  FinancialPostingLine,
  FinancialPostingLineInput
} from './financial-posting.js';

