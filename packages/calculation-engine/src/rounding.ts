export const ROUNDING_MODES = ['half-up', 'half-even', 'floor', 'ceil', 'trunc'] as const;

export type RoundingMode = (typeof ROUNDING_MODES)[number];

export interface RoundingPolicy {
  readonly mode: RoundingMode;
}

export function roundingPolicy(mode: RoundingMode): RoundingPolicy {
  if (!ROUNDING_MODES.includes(mode)) throw new TypeError(`Unsupported rounding mode: ${mode}`);
  return Object.freeze({ mode });
}

export function divideAndRound(
  numerator: bigint,
  denominator: bigint,
  policy: RoundingPolicy,
): bigint {
  if (numerator < 0n) throw new RangeError('Rounded amount cannot be negative.');
  if (denominator <= 0n) throw new RangeError('Rounding denominator must be positive.');

  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;

  switch (policy.mode) {
    case 'ceil':
      return quotient + 1n;
    case 'floor':
    case 'trunc':
      return quotient;
    case 'half-up':
      return remainder * 2n >= denominator ? quotient + 1n : quotient;
    case 'half-even': {
      const doubledRemainder = remainder * 2n;
      if (doubledRemainder > denominator) return quotient + 1n;
      if (doubledRemainder < denominator) return quotient;
      return quotient % 2n === 0n ? quotient : quotient + 1n;
    }
  }
}
