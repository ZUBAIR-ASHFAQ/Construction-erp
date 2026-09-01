export const NUMBER_SEQUENCE_STATUS = Object.freeze({
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE'
} as const);

/** Stable Foundation sequence keys required by the final 21-module ERP. */
export const FOUNDATION_REQUIRED_SEQUENCE_KEYS = Object.freeze([
  'project',
  'purchase-order',
  'client-invoice',
  'client-receipt',
  'supplier-payment'
] as const);

export type NumberSequenceStatus = (typeof NUMBER_SEQUENCE_STATUS)[keyof typeof NUMBER_SEQUENCE_STATUS];

export type NumberSequenceDefinition = Readonly<{
  sequenceKey: string;
  prefix?: string;
  suffix?: string;
  padWidth?: number;
  nextValue?: bigint;
  incrementBy?: bigint;
  status?: NumberSequenceStatus;
}>;

/**
 * Explicit trusted bootstrap/provisioning input. companyId is accepted here
 * only because Stage 0 bootstrap runs before an authenticated user context
 * necessarily exists. Normal runtime allocation never accepts companyId.
 */
export type ProvisionNumberSequenceInput = NumberSequenceDefinition & Readonly<{
  companyId: string;
}>;

export type NormalizedNumberSequenceDefinition = Readonly<{
  sequenceKey: string;
  prefix: string;
  suffix: string;
  padWidth: number;
  nextValue: bigint;
  incrementBy: bigint;
  status: NumberSequenceStatus;
}>;

export type AllocateNumberInput = Readonly<{
  sequenceKey: string;
}>;

export type NumberAllocation = Readonly<{
  sequenceId: string;
  sequenceKey: string;
  value: bigint;
  formatted: string;
}>;

