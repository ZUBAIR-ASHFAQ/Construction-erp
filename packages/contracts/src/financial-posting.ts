import type { StableSourceKey } from './source-key.js';
import {
  INTEGRATION_CONTRACT_VERSION,
  normalizeCurrency,
  normalizeDecimalString,
  normalizeIsoDate,
  normalizeOptionalText,
  normalizeReferenceId,
  normalizeStableToken
} from './primitives.js';
import { createStableSourceKey, type StableSourceKeyInput } from './source-key.js';

export type FinancialPostingDimensions = Readonly<{
  projectId?: string;
  stageId?: string;
}>;

export type FinancialPostingLine = Readonly<{
  lineKey: string;
  accountId: string;
  debit: string;
  credit: string;
  dimensions: FinancialPostingDimensions;
  memo: string | null;
}>;

export type FinancialPostingCommand = Readonly<{
  schemaVersion: typeof INTEGRATION_CONTRACT_VERSION;
  commandType: 'financial.posting';
  sourceKey: StableSourceKey;
  postingDate: string;
  currency: string;
  description: string | null;
  lines: readonly FinancialPostingLine[];
}>;

export type FinancialPostingLineInput = Readonly<{
  lineKey: string;
  accountId: string;
  debit: string;
  credit: string;
  projectId?: string;
  stageId?: string;
  memo?: string | null;
}>;

export type FinancialPostingCommandInput = Readonly<{
  sourceKey: StableSourceKeyInput | StableSourceKey;
  postingDate: string;
  currency: string;
  description?: string | null;
  lines: readonly FinancialPostingLineInput[];
}>;

/** Normalize dimension. */
function normalizeDimension(value: string | undefined, fieldName: string): string | undefined {
  return value === undefined ? undefined : normalizeReferenceId(value, fieldName);
}

/** Normalize line. */
function normalizeLine(input: FinancialPostingLineInput): FinancialPostingLine {
  const debit = normalizeDecimalString(input.debit, 'debit');
  const credit = normalizeDecimalString(input.credit, 'credit');
  if ((debit === '0') === (credit === '0')) {
    throw new Error('Each posting line must contain exactly one positive debit or credit amount.');
  }

  const projectId = normalizeDimension(input.projectId, 'projectId');
  const stageId = normalizeDimension(input.stageId, 'stageId');
  const mutableDimensions: { projectId?: string; stageId?: string } = {};
  if (projectId !== undefined) mutableDimensions.projectId = projectId;
  if (stageId !== undefined) mutableDimensions.stageId = stageId;
  const dimensions: FinancialPostingDimensions = Object.freeze(mutableDimensions);

  return Object.freeze({
    lineKey: normalizeStableToken(input.lineKey, 'lineKey'),
    accountId: normalizeReferenceId(input.accountId, 'accountId'),
    debit,
    credit,
    dimensions,
    memo: normalizeOptionalText(input.memo, 'memo', 500)
  });
}

/**
 * Normalizes the cross-module command only. Finance Core later owns account
 * existence, posting mappings, balance, fiscal-period and posting-state rules.
 */
export function createFinancialPostingCommand(input: FinancialPostingCommandInput): FinancialPostingCommand {
  if (input.lines.length < 2 || input.lines.length > 500) {
    throw new Error('financial posting command must contain 2 to 500 lines.');
  }
  const lines = input.lines.map(normalizeLine);
  const lineKeys = new Set(lines.map((line) => line.lineKey));
  if (lineKeys.size !== lines.length) throw new Error('financial posting lineKey values must be unique.');

  const sourceKey = 'schemaVersion' in input.sourceKey
    ? createStableSourceKey(input.sourceKey)
    : createStableSourceKey(input.sourceKey);

  return Object.freeze({
    schemaVersion: INTEGRATION_CONTRACT_VERSION,
    commandType: 'financial.posting',
    sourceKey,
    postingDate: normalizeIsoDate(input.postingDate),
    currency: normalizeCurrency(input.currency),
    description: normalizeOptionalText(input.description, 'description', 500),
    lines: Object.freeze(lines)
  });
}
