export interface Rational {
  readonly denominator: bigint;
  readonly numerator: bigint;
}

declare const basisPointsBrand: unique symbol;

export interface BasisPoints {
  readonly value: bigint;
  readonly [basisPointsBrand]: true;
}

export function rational(numerator: bigint, denominator: bigint): Rational {
  if (numerator < 0n) throw new RangeError('Rational numerator cannot be negative.');
  if (denominator <= 0n) throw new RangeError('Rational denominator must be positive.');

  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    denominator: denominator / divisor,
    numerator: numerator / divisor,
  });
}

export function basisPoints(value: bigint | number): BasisPoints {
  const exactValue = toExactInteger(value, 'Basis points');
  if (exactValue < 0n) throw new RangeError('Basis points cannot be negative.');
  return Object.freeze({ value: exactValue }) as BasisPoints;
}

export function basisPointsAsRational(value: BasisPoints): Rational {
  return rational(value.value, 10_000n);
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a === 0n ? 1n : a;
}

function toExactInteger(value: bigint | number, label: string): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer.`);
  return BigInt(value);
}
