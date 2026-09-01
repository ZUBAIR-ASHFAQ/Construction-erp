import type { Prisma } from '@prisma/client';
import type { TransactionClient } from '@construction-erp/database';

export const INITIAL_BOOTSTRAP_STATUS = Object.freeze({
  IDENTITY_PENDING: 'IDENTITY_PENDING',
  COMPLETED: 'COMPLETED'
} as const);

export type InitialBootstrapStatus =
  (typeof INITIAL_BOOTSTRAP_STATUS)[keyof typeof INITIAL_BOOTSTRAP_STATUS];

export type BootstrapCompanyInput = Readonly<{
  legalName: string;
  displayName: string;
  status: string;
  baseCurrency: string;
  timeZone: string;
  locale: string;
  fiscalSettings: Prisma.InputJsonObject;
}>;

export type BootstrapNumberSequenceInput = Readonly<{
  sequenceKey: string;
  prefix?: string;
  suffix?: string;
  padWidth?: number;
  nextValue?: string;
  incrementBy?: string;
  status?: 'ACTIVE' | 'INACTIVE';
}>;

export type BootstrapSystemRoleDefinition = Readonly<{
  code: string;
  name: string;
  description?: string;
}>;

export type BootstrapAdministratorIntent = Readonly<{
  email: string;
  name: string;
  roleCodes: readonly string[];
}>;

export type BootstrapIdentityIntent = Readonly<{
  administrator: BootstrapAdministratorIntent;
  systemRoles: readonly BootstrapSystemRoleDefinition[];
}>;

export type InitialBootstrapInput = Readonly<{
  /**
   * Stable idempotency identity for this controlled installation bootstrap.
   * Defaults to "initial".
   */
  bootstrapKey?: string;
  company: BootstrapCompanyInput;
  /**
   * Non-secret Foundation configuration persisted for the company. Secrets must
   * remain in environment/secret-manager infrastructure and are rejected here.
   */
  configuration?: Prisma.InputJsonObject;
  /**
   * Deployment/bootstrap configuration supplies formatting for the required
   * Foundation business sequence keys plus any additional document sequences.
   */
  numberSequences: readonly BootstrapNumberSequenceInput[];
  identity: BootstrapIdentityIntent;
}>;

export type BootstrapIdentityProvisioningContext = Readonly<{
  bootstrapRunId: string;
  companyId: string;
  requestId: string;
  correlationId: string;
  administrator: BootstrapAdministratorIntent;
  systemRoles: readonly BootstrapSystemRoleDefinition[];
}>;

export type BootstrapIdentityProvisioningResult = Readonly<{
  administratorUserId: string;
  /**
   * Maps every requested system-role code to the Administration role UUID created
   * or reconciled by the identity adapter.
   */
  systemRoleIdsByCode: Readonly<Record<string, string>>;
}>;

/**
 * Administration implements this adapter. Foundation owns the orchestration
 * contract, but does not own Administration tables and therefore cannot create
 * those rows before Stage 1 exists.
 *
 * Credentials/secrets can be captured by the adapter closure at execution
 * time. They are intentionally absent from this persisted Foundation contract.
 */
export type BootstrapIdentityProvisioner = (
  tx: TransactionClient,
  context: BootstrapIdentityProvisioningContext
) => Promise<BootstrapIdentityProvisioningResult>;

export type InitialBootstrapResult = Readonly<{
  kind: 'created' | 'replayed' | 'completed';
  status: InitialBootstrapStatus;
  bootstrapRunId: string;
  companyId: string;
  requestId: string;
  correlationId: string;
  administratorUserId: string | null;
  systemRoleIdsByCode: Readonly<Record<string, string>> | null;
}>;

export type NormalizedInitialBootstrapInput = Readonly<{
  bootstrapKey: string;
  company: BootstrapCompanyInput;
  configuration: Prisma.InputJsonObject;
  numberSequences: readonly Readonly<{
    sequenceKey: string;
    prefix: string;
    suffix: string;
    padWidth: number;
    nextValue: bigint;
    incrementBy: bigint;
    status: 'ACTIVE' | 'INACTIVE';
  }>[];
  identity: Readonly<{
    administrator: BootstrapAdministratorIntent;
    systemRoles: readonly BootstrapSystemRoleDefinition[];
  }>;
}>;
