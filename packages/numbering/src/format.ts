const MAX_FORMATTED_NUMBER_LENGTH = 128;

/** Format allocated number. */
export function formatAllocatedNumber(
  value: bigint,
  prefix: string,
  suffix: string,
  padWidth: number
): string {
  if (value < 0n) throw new RangeError('Allocated sequence value must not be negative.');
  if (!Number.isInteger(padWidth) || padWidth < 1 || padWidth > 20) {
    throw new RangeError('padWidth must be an integer between 1 and 20.');
  }

  const numeric = value.toString(10).padStart(padWidth, '0');
  const formatted = `${prefix}${numeric}${suffix}`;
  if (formatted.length > MAX_FORMATTED_NUMBER_LENGTH) {
    throw new RangeError(`Formatted business number exceeds ${MAX_FORMATTED_NUMBER_LENGTH} characters.`);
  }
  return formatted;
}

export const NUMBER_SEQUENCE_FORMAT_LIMITS = Object.freeze({
  maxFormattedLength: MAX_FORMATTED_NUMBER_LENGTH
});
